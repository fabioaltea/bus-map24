import { parse } from 'csv-parse/sync'
import { sql } from 'drizzle-orm'
import { patternStops } from '../../db/schema.js'
import { buildPattern } from '../../lib/pattern-builder.js'
import type { DrizzleDb } from '../../db/client.js'
import type { IdMapper } from '../../lib/id-mapper.js'

function parseCsv(content: Buffer): Record<string, string>[] {
  return parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true, relax_quotes: true }) as Record<string, string>[]
}

function parseTimeSec(t: string): number {
  if (!t) return 0
  const parts = t.trim().split(':')
  return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10)
}

export interface PatternLookup {
  /** patternId for a given trip, keyed by tripInternalId */
  tripToPatternId: Map<number, bigint>
  /** start_time_sec for a given trip, keyed by tripInternalId */
  tripToStartTimeSec: Map<number, number>
}

export async function runPatternsStage(
  db: DrizzleDb,
  feedId: string,
  stopMapper: IdMapper,
  tripMapper: IdMapper,
  readFile: (name: string) => Buffer | null,
): Promise<PatternLookup> {
  const stopTimesFile = readFile('stop_times.txt')
  if (!stopTimesFile) return { tripToPatternId: new Map(), tripToStartTimeSec: new Map() }

  const rows = parseCsv(stopTimesFile)

  // Group stop_times by trip_id, sort by stop_sequence
  const tripStopTimes = new Map<string, Array<{ seq: number; stopId: string; arrivalSec: number; departureSec: number }>>()
  for (const row of rows) {
    const tid = row['trip_id']
    if (!tripStopTimes.has(tid)) tripStopTimes.set(tid, [])
    tripStopTimes.get(tid)!.push({
      seq: parseInt(row['stop_sequence'], 10),
      stopId: row['stop_id'],
      arrivalSec: parseTimeSec(row['arrival_time'] || row['departure_time']),
      departureSec: parseTimeSec(row['departure_time'] || row['arrival_time']),
    })
  }

  const tripToPatternId = new Map<number, bigint>()
  const tripToStartTimeSec = new Map<number, number>()

  // Cache hash → patternId to avoid re-inserting duplicate patterns
  const hashToPatternId = new Map<string, bigint>()

  for (const [tripId, stopTimes] of tripStopTimes) {
    stopTimes.sort((a, b) => a.seq - b.seq)

    const mappedStopTimes = await Promise.all(
      stopTimes.map(async (st) => ({
        stopInternalId: await stopMapper.getOrCreate(st.stopId),
        arrivalSec: st.arrivalSec,
        departureSec: st.departureSec,
      })),
    )

    const pattern = await buildPattern(mappedStopTimes)
    const hashKey = pattern.hash.toString()
    const startTimeSec = stopTimes[0]?.departureSec ?? 0

    let patternId = hashToPatternId.get(hashKey)

    if (patternId === undefined) {
      const lastStop = pattern.stops[pattern.stops.length - 1]
      const durationSec = lastStop?.offsetDepartureSec ?? 0

      const result = await db.execute<{ pattern_id: string }>(sql`
        INSERT INTO stop_patterns (feed_id, stop_count, duration_sec, pattern_hash)
        VALUES (
          ${feedId}::uuid,
          ${pattern.stops.length},
          ${durationSec},
          ${pattern.hash.toString()}::bigint
        )
        ON CONFLICT (feed_id, pattern_hash) DO UPDATE
          SET stop_count = EXCLUDED.stop_count
        RETURNING pattern_id
      `)
      patternId = BigInt(result.rows[0].pattern_id)
      hashToPatternId.set(hashKey, patternId)

      const pid = patternId // narrowed: always defined after assignment above
      await db
        .insert(patternStops)
        .values(pattern.stops.map((s, i) => ({
          patternId: pid,
          seq: i,
          stopInternalId: s.stopInternalId,
          offsetArrivalSec: s.offsetArrivalSec,
          offsetDepartureSec: s.offsetDepartureSec,
        })))
        .onConflictDoNothing()
    }

    const tripInternalId = await tripMapper.getOrCreate(tripId)
    tripToPatternId.set(tripInternalId, patternId)
    tripToStartTimeSec.set(tripInternalId, startTimeSec)
  }

  return { tripToPatternId, tripToStartTimeSec }
}
