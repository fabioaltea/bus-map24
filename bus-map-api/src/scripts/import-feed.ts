/**
 * One-shot feed import script.
 * Usage: pnpm tsx src/scripts/import-feed.ts --mobility-id tld-576
 *        pnpm tsx src/scripts/import-feed.ts --url https://... --provider "CTM Cagliari"
 */

import 'dotenv/config'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { feedCatalogEntries } from '../db/schema.js'
import { getMobilityDbAccessToken } from '../lib/mobility-db-auth.js'
import { runFeedDownload } from '../jobs/feed-download.job.js'

interface MdbFeedDetail {
  id: string
  provider: string
  status: string
  locations: Array<{ country_code: string }>
  bounding_box: {
    minimum_latitude: number
    maximum_latitude: number
    minimum_longitude: number
    maximum_longitude: number
  } | null
  latest_dataset: {
    hosted_url: string | null
    hash: string | null
  } | null
  source_info: { producer_url: string | null }
}

async function main() {
  const args = process.argv.slice(2)
  const mobilityId = args[args.indexOf('--mobility-id') + 1]
  const directUrl = args[args.indexOf('--url') + 1]
  const provider = args[args.indexOf('--provider') + 1] ?? 'Unknown'

  if (!mobilityId && !directUrl) {
    console.error('Usage: --mobility-id <mdb-id>  OR  --url <download-url> --provider <name>')
    process.exit(1)
  }

  let downloadUrl: string
  let mdbId: string
  let feedProvider: string
  let countryCode = 'XX'
  let bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null = null
  let hashSha256: string | null = null

  if (mobilityId) {
    // Fetch metadata from MobilityDB API
    const token = await getMobilityDbAccessToken()
    const res = await fetch(
      `https://api.mobilitydatabase.org/v1/gtfs_feeds/${mobilityId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) throw new Error(`API error ${res.status} fetching ${mobilityId}`)
    const feed = (await res.json()) as MdbFeedDetail

    downloadUrl = feed.latest_dataset?.hosted_url ?? feed.source_info.producer_url!
    if (!downloadUrl) throw new Error(`No download URL for ${mobilityId}`)

    mdbId = feed.id
    feedProvider = feed.provider
    countryCode = feed.locations?.[0]?.country_code ?? 'XX'
    hashSha256 = feed.latest_dataset?.hash ?? null

    const bb = feed.bounding_box
    if (bb) {
      bbox = {
        minLat: bb.minimum_latitude,
        maxLat: bb.maximum_latitude,
        minLng: bb.minimum_longitude,
        maxLng: bb.maximum_longitude,
      }
    }
  } else {
    downloadUrl = directUrl
    mdbId = `manual-${Date.now()}`
    feedProvider = provider
  }

  // Upsert feed catalog entry
  const [entry] = await db
    .insert(feedCatalogEntries)
    .values({
      mobilityDbId: mdbId,
      provider: feedProvider,
      countryCode,
      downloadUrl,
      hashSha256,
      boundingBox: bbox
        ? (sql`ST_MakeEnvelope(${bbox.minLng}, ${bbox.minLat}, ${bbox.maxLng}, ${bbox.maxLat}, 4326)` as unknown as string)
        : null,
      importStatus: 'pending',
    })
    .onConflictDoUpdate({
      target: feedCatalogEntries.mobilityDbId,
      set: { downloadUrl, hashSha256, importStatus: 'pending' },
    })
    .returning({ id: feedCatalogEntries.id })

  console.log(`Feed entry: ${entry.id} (${feedProvider} / ${mdbId})`)
  console.log(`Downloading from: ${downloadUrl}`)

  await runFeedDownload({ feedId: entry.id, mobilityDbId: mdbId, downloadUrl })

  // Print summary
  const result = await db
    .select({ status: feedCatalogEntries.importStatus })
    .from(feedCatalogEntries)
    .where(eq(feedCatalogEntries.id, entry.id))
    .limit(1)

  console.log(`\nImport status: ${result[0]?.status}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
