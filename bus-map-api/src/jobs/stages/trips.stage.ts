import { parse } from 'csv-parse/sync'
import { sql } from 'drizzle-orm'
import { collapseToFrequencies } from '../../lib/frequency-detector.js'
import type { DrizzleDb } from '../../db/client.js'
import type { IdMapper } from '../../lib/id-mapper.js'
import type { PatternLookup } from './patterns.stage.js'

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

  for (const row of rows) {
    const tripInternalId = await tripMapper.getOrCreate(row['trip_id'])
    const routeInternalId = await routeMapper.getOrCreate(row['route_id'])
    const serviceInternalId = await serviceMapper.getOrCreate(row['service_id'])
    const shapeInternalId = row['shape_id']
      ? await shapeMapper.getOrCreate(row['shape_id'])
      : null

    const patternId = patternLookup.tripToPatternId.get(tripInternalId)
    const startTimeSec = patternLookup.tripToStartTimeSec.get(tripInternalId) ?? 0

    if (patternId === undefined) continue

    const directionId =
      row['direction_id'] !== undefined && row['direction_id'] !== ''
        ? parseInt(row['direction_id'], 10)
        : null

    await db.execute(sql`
      INSERT INTO trips_compact
        (feed_id, internal_id, route_internal_id, service_internal_id, pattern_id,
         start_time_sec, shape_internal_id, direction_id, headsign)
      VALUES (
        ${feedId}::uuid,
        ${tripInternalId},
        ${routeInternalId},
        ${serviceInternalId},
        ${patternId.toString()}::bigint,
        ${startTimeSec},
        ${shapeInternalId},
        ${directionId},
        ${row['trip_headsign'] ?? null}
      )
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

  // ── Frequency collapse per (pattern_id, service_internal_id) group ───────────
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

  for (const members of groups.values()) {
    members.sort((a, b) => a.startTimeSec - b.startTimeSec)
    const times = members.map((m) => m.startTimeSec)
    const runs = collapseToFrequencies(times)

    for (const run of runs) {
      // Use the first trip in the run as the representative trip
      const repTrip = members[run.startIdx]
      await db.execute(sql`
        INSERT INTO frequencies_compact
          (feed_id, trip_internal_id, start_time_sec, end_time_sec, headway_sec, exact_times)
        VALUES (
          ${feedId}::uuid,
          ${repTrip.tripInternalId},
          ${run.startTimeSec},
          ${run.endTimeSec},
          ${run.headwaySec},
          false
        )
        ON CONFLICT (feed_id, trip_internal_id, start_time_sec) DO UPDATE
          SET end_time_sec = EXCLUDED.end_time_sec,
              headway_sec  = EXCLUDED.headway_sec
      `)
    }
  }
}
