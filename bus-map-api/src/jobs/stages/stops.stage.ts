import { parse } from 'csv-parse/sync'
import { sql } from 'drizzle-orm'
import { stopsCompact } from '../../db/schema.js'
import type { DrizzleDb } from '../../db/client.js'
import type { IdMapper } from '../../lib/id-mapper.js'

const BATCH_SIZE = 500

function parseCsv(content: Buffer): Record<string, string>[] {
  return parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true, relax_quotes: true }) as Record<string, string>[]
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

    const internalId = await stopMapper.getOrCreate(row['stop_id'])
    const parentInternalId = row['parent_station']
      ? await stopMapper.getOrCreate(row['parent_station'])
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

  if (batch.length > 0) await flushStops(db, feedId, batch)
}

async function flushStops(
  db: DrizzleDb,
  feedId: string,
  rows: Array<{ internalId: number; name: string; latE6: number; lonE6: number; parentInternalId: number | null }>,
): Promise<void> {
  const seen = new Map<number, typeof rows[0]>()
  for (const row of rows) seen.set(row.internalId, row)
  const deduped = [...seen.values()]

  await db
    .insert(stopsCompact)
    .values(deduped.map((r) => ({ feedId, internalId: r.internalId, name: r.name, latE6: r.latE6, lonE6: r.lonE6, parentInternalId: r.parentInternalId })))
    .onConflictDoUpdate({
      target: [stopsCompact.feedId, stopsCompact.internalId],
      set: {
        name: sql`excluded.name`,
        latE6: sql`excluded.lat_e6`,
        lonE6: sql`excluded.lon_e6`,
        parentInternalId: sql`excluded.parent_internal_id`,
      },
    })
}
