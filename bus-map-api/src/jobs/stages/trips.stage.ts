import { parse } from 'csv-parse/sync'
import { sql } from 'drizzle-orm'
import { tripsCompact, frequenciesCompact } from '../../db/schema.js'
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
    const tripInternalId = await tripMapper.getOrCreate(row['trip_id'])
    const routeInternalId = await routeMapper.getOrCreate(row['route_id'])
    const serviceInternalId = await serviceMapper.getOrCreate(row['service_id'])
    const shapeInternalId = row['shape_id'] ? await shapeMapper.getOrCreate(row['shape_id']) : null

    const patternId = patternLookup.tripToPatternId.get(tripInternalId)
    const startTimeSec = patternLookup.tripToStartTimeSec.get(tripInternalId) ?? 0
    if (patternId === undefined) continue

    const directionId =
      row['direction_id'] !== undefined && row['direction_id'] !== ''
        ? parseInt(row['direction_id'], 10)
        : null

    tripBatch.push({ internalId: tripInternalId, routeInternalId, serviceInternalId, patternId, startTimeSec, shapeInternalId, directionId, headsign: row['trip_headsign'] ?? null })

    if (tripBatch.length >= BATCH_SIZE) await flushTrips(db, feedId, tripBatch.splice(0))
  }
  if (tripBatch.length > 0) await flushTrips(db, feedId, tripBatch)

  // ── Frequency collapse ────────────────────────────────────────────────────────
  type TripGroup = { tripInternalId: number; startTimeSec: number }
  const groups = new Map<string, TripGroup[]>()

  for (const row of rows) {
    const tripInternalId = await tripMapper.getOrCreate(row['trip_id'])
    const serviceInternalId = await serviceMapper.getOrCreate(row['service_id'])
    const patternId = patternLookup.tripToPatternId.get(tripInternalId)
    const startTimeSec = patternLookup.tripToStartTimeSec.get(tripInternalId) ?? 0
    if (patternId === undefined) continue

    const key = `${patternId}-${serviceInternalId}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push({ tripInternalId, startTimeSec })
  }

  type FreqRow = { tripInternalId: number; startTimeSec: number; endTimeSec: number; headwaySec: number }
  const freqBatch: FreqRow[] = []

  for (const members of groups.values()) {
    members.sort((a, b) => a.startTimeSec - b.startTimeSec)
    const runs = collapseToFrequencies(members.map((m) => m.startTimeSec))

    for (const run of runs) {
      freqBatch.push({ tripInternalId: members[run.startIdx].tripInternalId, startTimeSec: run.startTimeSec, endTimeSec: run.endTimeSec, headwaySec: run.headwaySec })
      if (freqBatch.length >= BATCH_SIZE) await flushFrequencies(db, feedId, freqBatch.splice(0))
    }
  }
  if (freqBatch.length > 0) await flushFrequencies(db, feedId, freqBatch)
}

async function flushTrips(
  db: DrizzleDb,
  feedId: string,
  rows: Array<{ internalId: number; routeInternalId: number; serviceInternalId: number; patternId: bigint; startTimeSec: number; shapeInternalId: number | null; directionId: number | null; headsign: string | null }>,
): Promise<void> {
  await db
    .insert(tripsCompact)
    .values(rows.map((r) => ({
      feedId,
      internalId: r.internalId,
      routeInternalId: r.routeInternalId,
      serviceInternalId: r.serviceInternalId,
      patternId: r.patternId,
      startTimeSec: r.startTimeSec,
      shapeInternalId: r.shapeInternalId,
      directionId: r.directionId,
      headsign: r.headsign,
    })))
    .onConflictDoUpdate({
      target: [tripsCompact.feedId, tripsCompact.internalId],
      set: {
        routeInternalId: sql`excluded.route_internal_id`,
        serviceInternalId: sql`excluded.service_internal_id`,
        patternId: sql`excluded.pattern_id`,
        startTimeSec: sql`excluded.start_time_sec`,
        shapeInternalId: sql`excluded.shape_internal_id`,
        directionId: sql`excluded.direction_id`,
        headsign: sql`excluded.headsign`,
      },
    })
}

async function flushFrequencies(
  db: DrizzleDb,
  feedId: string,
  rows: Array<{ tripInternalId: number; startTimeSec: number; endTimeSec: number; headwaySec: number }>,
): Promise<void> {
  await db
    .insert(frequenciesCompact)
    .values(rows.map((r) => ({ feedId, tripInternalId: r.tripInternalId, startTimeSec: r.startTimeSec, endTimeSec: r.endTimeSec, headwaySec: r.headwaySec, exactTimes: false })))
    .onConflictDoUpdate({
      target: [frequenciesCompact.feedId, frequenciesCompact.tripInternalId, frequenciesCompact.startTimeSec],
      set: { endTimeSec: sql`excluded.end_time_sec`, headwaySec: sql`excluded.headway_sec` },
    })
}
