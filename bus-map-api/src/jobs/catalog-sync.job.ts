/**
 * B019 — Catalog Sync Job
 *
 * Fetches all active GTFS feeds from the MobilityDatabase API (paginated),
 * upserts them into `feed_catalog_entries`, and enqueues a `feed-download`
 * job for every feed that is new or whose latest_dataset.hash has changed.
 */

import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { feedCatalogEntries } from '../db/schema.js'
import {
  feedDownloadQueue,
  type CatalogSyncJobData,
  type FeedDownloadJobData,
} from './queues.js'
import { getMobilityDbAccessToken, invalidateMobilityDbToken } from '../lib/mobility-db-auth.js'

const MOBILITY_DB_API = 'https://api.mobilitydatabase.org/v1'
const PAGE_SIZE = 100

// ── MobilityDatabase API types ────────────────────────────────────────────────

interface MdbLocation {
  country_code: string
  country: string
  subdivision_name: string
  municipality: string
}

interface MdbBoundingBox {
  minimum_latitude: number
  maximum_latitude: number
  minimum_longitude: number
  maximum_longitude: number
}

interface MdbLatestDataset {
  id: string
  hosted_url: string | null
  hash: string | null
  bounding_box: MdbBoundingBox | null
  downloaded_at: string | null
  service_date_range_start: string | null
  service_date_range_end: string | null
}

interface MdbFeed {
  id: string
  data_type: string
  status: string
  provider: string
  source_info: {
    producer_url: string | null
    authentication_type: number
  }
  locations: MdbLocation[]
  latest_dataset: MdbLatestDataset | null
  bounding_box: MdbBoundingBox | null
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

async function fetchPage(offset: number, token: string): Promise<MdbFeed[]> {
  const url = `${MOBILITY_DB_API}/gtfs_feeds?limit=${PAGE_SIZE}&offset=${offset}&status=active`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) {
    invalidateMobilityDbToken()
    throw new Error('MobilityDB API returned 401 — token refreshed, retry job')
  }

  if (!res.ok) {
    throw new Error(`MobilityDB API error: ${res.status} ${res.statusText}`)
  }

  return (await res.json()) as MdbFeed[]
}

async function fetchAllFeeds(): Promise<MdbFeed[]> {
  const token = await getMobilityDbAccessToken()
  const all: MdbFeed[] = []
  let offset = 0

  while (true) {
    const page = await fetchPage(offset, token)
    all.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return all
}

// ── PostGIS helper ────────────────────────────────────────────────────────────

function makeEnvelopeSql(bb: MdbBoundingBox) {
  return sql`ST_MakeEnvelope(
    ${bb.minimum_longitude},
    ${bb.minimum_latitude},
    ${bb.maximum_longitude},
    ${bb.maximum_latitude},
    4326
  )`
}

// ── Main processor ────────────────────────────────────────────────────────────

export async function runCatalogSync(data: CatalogSyncJobData): Promise<void> {
  const feeds = await fetchAllFeeds()

  // Filter: only feeds with a usable download URL
  const usable = feeds.filter(
    (f) => f.latest_dataset?.hosted_url || f.source_info?.producer_url,
  )

  let inserted = 0
  let updated = 0
  let enqueued = 0

  for (const feed of usable) {
    const downloadUrl =
      feed.latest_dataset?.hosted_url ?? feed.source_info.producer_url!
    const hashSha256 = feed.latest_dataset?.hash ?? null
    const countryCode = feed.locations?.[0]?.country_code ?? 'XX'
    const bb = feed.bounding_box ?? feed.latest_dataset?.bounding_box ?? null

    // Check existing entry
    const existing = await db
      .select({ id: feedCatalogEntries.id, hash: feedCatalogEntries.hashSha256 })
      .from(feedCatalogEntries)
      .where(eq(feedCatalogEntries.mobilityDbId, feed.id))
      .limit(1)

    const isNew = existing.length === 0
    const hashChanged = !isNew && existing[0].hash !== hashSha256

    if (isNew || data.force) {
      // Insert
      const [row] = await db
        .insert(feedCatalogEntries)
        .values({
          mobilityDbId: feed.id,
          provider: feed.provider,
          countryCode,
          downloadUrl,
          boundingBox: bb ? (makeEnvelopeSql(bb) as unknown as string) : null,
          hashSha256,
          lastCheckedAt: new Date(),
          importStatus: 'pending',
        })
        .onConflictDoUpdate({
          target: feedCatalogEntries.mobilityDbId,
          set: {
            provider: feed.provider,
            countryCode,
            downloadUrl,
            boundingBox: bb ? (makeEnvelopeSql(bb) as unknown as string) : null,
            hashSha256,
            lastCheckedAt: new Date(),
          },
        })
        .returning({ id: feedCatalogEntries.id })

      inserted++
      await feedDownloadQueue.add('feed-download', {
        feedId: row.id,
        mobilityDbId: feed.id,
        downloadUrl,
      } satisfies FeedDownloadJobData)
      enqueued++
    } else if (hashChanged) {
      // Update hash + mark for re-download
      await db
        .update(feedCatalogEntries)
        .set({
          downloadUrl,
          hashSha256,
          lastCheckedAt: new Date(),
          importStatus: 'pending',
          ...(bb ? { boundingBox: makeEnvelopeSql(bb) as unknown as string } : {}),
        })
        .where(eq(feedCatalogEntries.mobilityDbId, feed.id))

      await feedDownloadQueue.add('feed-download', {
        feedId: existing[0].id,
        mobilityDbId: feed.id,
        downloadUrl,
      } satisfies FeedDownloadJobData)
      updated++
      enqueued++
    } else {
      // Up-to-date — just refresh lastCheckedAt
      await db
        .update(feedCatalogEntries)
        .set({ lastCheckedAt: new Date() })
        .where(eq(feedCatalogEntries.mobilityDbId, feed.id))
    }
  }

  console.log(
    `[catalog-sync] done — total=${usable.length} inserted=${inserted} updated=${updated} enqueued=${enqueued}`,
  )
}
