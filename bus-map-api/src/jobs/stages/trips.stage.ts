import { parse } from 'csv-parse/sync'
import { sql } from 'drizzle-orm'
import { collapseToFrequencies } from '../../lib/frequency-detector.js'
import type { DrizzleDb } from '../../db/client.js'
import type { IdMapper } from '../../lib/id-mapper.js'
import type { PatternLookup } from './patterns.stage.js'

const BATCH_SIZE = 500

function parseCsv(content: Buffer): Record<string, string>[] {
  return parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[]
}

export async function runTripsStage(
  db: DrizzleDb,
  feedId: string,
  tripMapper: IdMapper,
  routeMapper: IdMapper,
  serviceMapper: IdMapper,
  shapeMapper: IdMapper,
  patternLookup: PatternLookup,
  readFile: (name: string) => Buffer | null,
): Promise<void> {
  const tripFile = readFile('trips.txt')
  if (!tripFile) return

  const rows = parseCsv(tripFile)

  // Bulk-prefetch all IDs in one query each
  await tripMapper.bulkGetOrCreate(rows.map((r) => r['trip_id']))
  await routeMapper.bulkGetOrCreate([...new Set(rows.map((r) => r['route_id']))])
  await serviceMapper.bulkGetOrCreate([...new Set(rows.map((r) => r['service_id']))])
  const shapeIds = [...new Set(rows.map((r) => r['shape_id']).filter(Boolean))] as string[]
  if (shapeIds.length > 0) await shapeMapper.bulkGetOrCreate(shapeIds)

  // ── Trips ────────────────────────────────────────────────────────────────────
  type TripRow = {
    internalId: number
    routeInternalId: number
    serviceInternalId: number
    patternId: bigint
    startTimeSec: number
    shapeInternalId: number | null
    directionId: number | null
    headsign: string | null
  }

  const tripBatch: TripRow[] = []

  for (const row of rows) {
    const tripInternalId = await tripMapper.getOrCreate(row['trip_id']) // cache hit
    const routeInternalId = await routeMapper.getOrCreate(row['route_id']) // cache hit
    const serviceInternalId = await serviceMapper.getOrCreate(row['service_id']) // cache hit
    const shapeInternalId = row['shape_id']
      ? await shapeMapper.getOrCreate(row['shape_id']) // cache hit
      : null

    const patternId = patternLookup.tripToPatternId.get(tripInternalId)
    const startTimeSec = patternLookup.tripToStartTimeSec.get(tripInternalId) ?? 0
    if (patternId === undefined) continue

    const directionId =
      row['direction_id'] !== undefined && row['direction_id'] !== ''
        ? parseInt(row['direction_id'], 10)
        : null

    tripBatch.push({
      internalId: tripInternalId,
      routeInternalId,
      serviceInternalId,
      patternId,
      startTimeSec,
      shapeInternalId,
      directionId,
      headsign: row['trip_headsign'] ?? null,
    })

    if (tripBatch.length >= BATCH_SIZE) {
      await flushTrips(db, feedId, tripBatch.splice(0))
    }
  }
  if (tripBatch.length > 0) await flushTrips(db, feedId, tripBatch)

  // ── Frequency collapse per (pattern_id, service_internal_id) group ───────────
  type TripGroup = { tripInternalId: number; startTimeSec: number }
  const groups = new Map<string, TripGroup[]>()

  for (const row of rows) {
    const tripInternalId = await tripMapper.getOrCreate(row['trip_id']) // cache hit
    const serviceInternalId = await serviceMapper.getOrCreate(row['service_id']) // cache hit
    const patternId = patternLookup.tripToPatternId.get(tripInternalId)
    const startTimeSec = patternLookup.tripToStartTimeSec.get(tripInternalId) ?? 0
    if (patternId === undefined) continue

    const key = `${patternId}-${serviceInternalId}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push({ tripInternalId, startTimeSec })
  }

  type FreqRow = {
    tripInternalId: number
    startTimeSec: number
    endTimeSec: number
    headwaySec: number
  }
  const freqBatch: FreqRow[] = []

  for (const members of groups.values()) {
    members.sort((a, b) => a.startTimeSec - b.startTimeSec)
    const times = members.map((m) => m.startTimeSec)
    const runs = collapseToFrequencies(times)

    for (const run of runs) {
      const repTrip = members[run.startIdx]
      freqBatch.push({
        tripInternalId: repTrip.tripInternalId,
        startTimeSec: run.startTimeSec,
        endTimeSec: run.endTimeSec,
        headwaySec: run.headwaySec,
      })

      if (freqBatch.length >= BATCH_SIZE) {
        await flushFrequencies(db, feedId, freqBatch.splice(0))
      }
    }
  }
  if (freqBatch.length > 0) await flushFrequencies(db, feedId, freqBatch)
}

async function flushTrips(
  db: DrizzleDb,
  feedId: string,
  rows: Array<{
    internalId: number
    routeInternalId: number
    serviceInternalId: number
    patternId: bigint
    startTimeSec: number
    shapeInternalId: number | null
    directionId: number | null
    headsign: string | null
  }>,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO trips_compact
      (feed_id, internal_id, route_internal_id, service_internal_id, pattern_id,
       start_time_sec, shape_internal_id, direction_id, headsign)
    SELECT
      ${feedId}::uuid,
      t.internal_id,
      t.route_internal_id,
      t.service_internal_id,
      t.pattern_id::bigint,
      t.start_time_sec,
      t.shape_internal_id,
      t.direction_id,
      t.headsign
    FROM unnest(
      ${rows.map((r) => r.internalId)}::int[],
      ${rows.map((r) => r.routeInternalId)}::int[],
      ${rows.map((r) => r.serviceInternalId)}::int[],
      ${rows.map((r) => r.patternId.toString())}::text[],
      ${rows.map((r) => r.startTimeSec)}::int[],
      ${rows.map((r) => r.shapeInternalId ?? null)}::int[],
      ${rows.map((r) => r.directionId ?? null)}::int[],
      ${rows.map((r) => r.headsign ?? null)}::text[]
    ) AS t(internal_id, route_internal_id, service_internal_id, pattern_id,
           start_time_sec, shape_internal_id, direction_id, headsign)
    ON CONFLICT (feed_id, internal_id) DO UPDATE
      SET route_internal_id   = EXCLUDED.route_internal_id,
          service_internal_id = EXCLUDED.service_internal_id,
          pattern_id          = EXCLUDED.pattern_id,
          start_time_sec      = EXCLUDED.start_time_sec,
          shape_internal_id   = EXCLUDED.shape_internal_id,
          direction_id        = EXCLUDED.direction_id,
          headsign            = EXCLUDED.headsign
  `)
}

async function flushFrequencies(
  db: DrizzleDb,
  feedId: string,
  rows: Array<{
    tripInternalId: number
    startTimeSec: number
    endTimeSec: number
    headwaySec: number
  }>,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO frequencies_compact
      (feed_id, trip_internal_id, start_time_sec, end_time_sec, headway_sec, exact_times)
    SELECT
      ${feedId}::uuid,
      t.trip_internal_id,
      t.start_time_sec,
      t.end_time_sec,
      t.headway_sec,
      false
    FROM unnest(
      ${rows.map((r) => r.tripInternalId)}::int[],
      ${rows.map((r) => r.startTimeSec)}::int[],
      ${rows.map((r) => r.endTimeSec)}::int[],
      ${rows.map((r) => r.headwaySec)}::int[]
    ) AS t(trip_internal_id, start_time_sec, end_time_sec, headway_sec)
    ON CONFLICT (feed_id, trip_internal_id, start_time_sec) DO UPDATE
      SET end_time_sec = EXCLUDED.end_time_sec,
          headway_sec  = EXCLUDED.headway_sec
  `)
}
