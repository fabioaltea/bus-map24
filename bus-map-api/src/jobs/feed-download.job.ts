/**
 * Feed Download Job — compact storage pipeline (v2).
 *
 * State machine: pending → downloading → importing → ready / failed
 * Idempotency: early-exit when sha256 + pipeline_version match.
 * Incremental: per-entity hash comparison; only changed entities rewritten.
 */

import AdmZip from 'adm-zip'
import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { feedCatalogEntries } from '../db/schema.js'
import { tileGenQueue, type FeedDownloadJobData, type TileGenJobData } from './queues.js'
import { runIdMapStage } from './stages/id-map.stage.js'
import { runStopsStage } from './stages/stops.stage.js'
import { runShapesStage } from './stages/shapes.stage.js'
import { runAgenciesRoutesStage } from './stages/agencies-routes.stage.js'
import { runPatternsStage } from './stages/patterns.stage.js'
import { runTripsStage } from './stages/trips.stage.js'
import { runCalendarStage } from './stages/calendar.stage.js'

const CURRENT_PIPELINE_VERSION = 2
const REQUIRED_FILES = ['agency.txt', 'routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt']

export async function runFeedDownload(data: FeedDownloadJobData): Promise<void> {
  const { feedId, mobilityDbId, downloadUrl } = data

  await db
    .update(feedCatalogEntries)
    .set({ importStatus: 'downloading' })
    .where(eq(feedCatalogEntries.id, feedId))

  try {
    // ── Download ───────────────────────────────────────────────────────────────
    console.log(`[feed-download] ${mobilityDbId} — downloading ${downloadUrl}`)
    const res = await fetch(downloadUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${downloadUrl}`)
    const zipBuffer = Buffer.from(await res.arrayBuffer())

    const hashSha256 = createHash('sha256').update(zipBuffer).digest('hex')

    // ── Idempotency short-circuit ──────────────────────────────────────────────
    const [entry] = await db
      .select({
        lastImportedSha256: feedCatalogEntries.lastImportedSha256,
        pipelineVersion: feedCatalogEntries.pipelineVersion,
      })
      .from(feedCatalogEntries)
      .where(eq(feedCatalogEntries.id, feedId))
      .limit(1)

    if (
      entry?.lastImportedSha256 === hashSha256 &&
      entry?.pipelineVersion === CURRENT_PIPELINE_VERSION
    ) {
      console.log(`[feed-download] ${mobilityDbId} — short-circuit: sha256 + pipeline_version match, no changes applied`)
      await db
        .update(feedCatalogEntries)
        .set({ lastCheckedAt: new Date() })
        .where(eq(feedCatalogEntries.id, feedId))
      return
    }

    // ── Validate zip ───────────────────────────────────────────────────────────
    const zip = new AdmZip(zipBuffer)
    const entries = zip.getEntries().map((e) => e.entryName.replace(/^.*\//, ''))
    for (const required of REQUIRED_FILES) {
      if (!entries.includes(required)) {
        throw new Error(`Missing required GTFS file: ${required}`)
      }
    }

    const readFile = (name: string): Buffer | null => {
      const entry = zip.getEntries().find((e) => e.entryName.endsWith(name))
      return entry ? entry.getData() : null
    }

    await db
      .update(feedCatalogEntries)
      .set({ importStatus: 'importing' })
      .where(eq(feedCatalogEntries.id, feedId))

    // ── Pipeline (single transaction, statement_timeout = 0) ──────────────────
    await db.execute(sql`SET LOCAL statement_timeout = 0`)

    // Stage 1: ID mapping (blocking prerequisite for all other stages)
    console.log(`[feed-download] ${mobilityDbId} — stage: id-map`)
    const idMaps = await runIdMapStage(db, feedId, readFile)

    // Stage 2a-d: Parallel-safe stages (different tables)
    console.log(`[feed-download] ${mobilityDbId} — stage: stops + shapes + calendar + agencies-routes`)
    await Promise.all([
      runStopsStage(db, feedId, idMaps.stops, readFile),
      runShapesStage(db, feedId, idMaps.shapes, readFile),
      runCalendarStage(db, feedId, idMaps.services, readFile),
    ])

    // agencies-routes needs stops_compact to exist for coverage computation
    await runAgenciesRoutesStage(db, feedId, idMaps.agencies, idMaps.routes, idMaps.stops, readFile)

    // Stage 3: Patterns (depends on stops)
    console.log(`[feed-download] ${mobilityDbId} — stage: patterns`)
    const patternLookup = await runPatternsStage(db, feedId, idMaps.stops, idMaps.trips, readFile)

    // Stage 4: Trips + frequencies (depends on patterns)
    console.log(`[feed-download] ${mobilityDbId} — stage: trips + frequencies`)
    await runTripsStage(db, feedId, idMaps.trips, idMaps.routes, idMaps.services, idMaps.shapes, patternLookup, readFile)

    // ── Mark ready ─────────────────────────────────────────────────────────────
    await db
      .update(feedCatalogEntries)
      .set({
        importStatus: 'ready',
        lastImportedAt: new Date(),
        lastImportedSha256: hashSha256,
        pipelineVersion: CURRENT_PIPELINE_VERSION,
        errorMessage: null,
        hashSha256,
      })
      .where(eq(feedCatalogEntries.id, feedId))

    await tileGenQueue.add('tile-gen', {
      feedId,
      outputPath: `${mobilityDbId}.pmtiles`,
    } satisfies TileGenJobData)

    console.log(`[feed-download] ${mobilityDbId} — import complete ✓`)
  } catch (err) {
    await db
      .update(feedCatalogEntries)
      .set({
        importStatus: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      .where(eq(feedCatalogEntries.id, feedId))
    throw err
  }
}
