import { parse } from 'csv-parse/sync'
import { sql } from 'drizzle-orm'
import type { DrizzleDb } from '../../db/client.js'
import type { IdMapper } from '../../lib/id-mapper.js'

const BATCH_SIZE = 500

function parseCsv(content: Buffer): Record<string, string>[] {
  return parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[]
}

export async function runStopsStage(
  db: DrizzleDb,
  feedId: string,
  stopMapper: IdMapper,
  readFile: (name: string) => Buffer | null,
): Promise<void> {
  const stopFile = readFile('stops.txt')
  if (!stopFile) return

  const rows = parseCsv(stopFile)

  // Pre-populate id cache in one query
  const allStopIds = [...new Set(rows.flatMap((r) => [r['stop_id'], r['parent_station']].filter(Boolean)))]
  await stopMapper.bulkGetOrCreate(allStopIds as string[])

  const batch: Array<{
    internalId: number
    name: string
    latE6: number
    lonE6: number
    parentInternalId: number | null
  }> = []

  for (const row of rows) {
    if (!row['stop_lat'] || !row['stop_lon']) continue
    const lat = parseFloat(row['stop_lat'])
    const lon = parseFloat(row['stop_lon'])
    if (isNaN(lat) || isNaN(lon)) continue

    const internalId = await stopMapper.getOrCreate(row['stop_id']) // cache hit
    const parentInternalId = row['parent_station']
      ? await stopMapper.getOrCreate(row['parent_station']) // cache hit
      : null

    batch.push({
      internalId,
      name: row['stop_name'] ?? row['stop_id'],
      latE6: Math.round(lat * 1e6),
      lonE6: Math.round(lon * 1e6),
      parentInternalId,
    })

    if (batch.length >= BATCH_SIZE) {
      await flushStops(db, feedId, batch.splice(0))
    }
  }

  if (batch.length > 0) {
    await flushStops(db, feedId, batch)
  }
}

async function flushStops(
  db: DrizzleDb,
  feedId: string,
  rows: Array<{
    internalId: number
    name: string
    latE6: number
    lonE6: number
    parentInternalId: number | null
  }>,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO stops_compact (feed_id, internal_id, name, lat_e6, lon_e6, parent_internal_id)
    SELECT
      ${feedId}::uuid,
      t.internal_id,
      t.name,
      t.lat_e6,
      t.lon_e6,
      t.parent_internal_id
    FROM unnest(
      ${rows.map((r) => r.internalId)}::int[],
      ${rows.map((r) => r.name)}::text[],
      ${rows.map((r) => r.latE6)}::int[],
      ${rows.map((r) => r.lonE6)}::int[],
      ${rows.map((r) => r.parentInternalId ?? null)}::int[]
    ) AS t(internal_id, name, lat_e6, lon_e6, parent_internal_id)
    ON CONFLICT (feed_id, internal_id) DO UPDATE
      SET name = EXCLUDED.name,
          lat_e6 = EXCLUDED.lat_e6,
          lon_e6 = EXCLUDED.lon_e6,
          parent_internal_id = EXCLUDED.parent_internal_id
  `)
}
