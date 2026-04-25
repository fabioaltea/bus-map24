import { parse } from 'csv-parse/sync'
import { sql } from 'drizzle-orm'
import { simplifyAndHash } from '../../lib/shape-dedup.js'
import type { DrizzleDb } from '../../db/client.js'
import type { IdMapper } from '../../lib/id-mapper.js'

const BATCH_SIZE = 500

function parseCsv(content: Buffer): Record<string, string>[] {
  return parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true, relax_quotes: true }) as Record<string, string>[]
}

interface ShapeRow {
  internalId: number
  polyline6: string
  shapeHash: bigint
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

export async function runShapesStage(
  db: DrizzleDb,
  feedId: string,
  shapeMapper: IdMapper,
  readFile: (name: string) => Buffer | null,
): Promise<void> {
  const shapeFile = readFile('shapes.txt')
  if (!shapeFile) return

  const rows = parseCsv(shapeFile)

  const shapeMap = new Map<string, Array<{ lat: number; lon: number; seq: number }>>()
  for (const row of rows) {
    const sid = row['shape_id']
    if (!shapeMap.has(sid)) shapeMap.set(sid, [])
    shapeMap.get(sid)!.push({
      lat: parseFloat(row['shape_pt_lat']),
      lon: parseFloat(row['shape_pt_lon']),
      seq: parseInt(row['shape_pt_sequence'], 10),
    })
  }

  await shapeMapper.bulkGetOrCreate([...shapeMap.keys()])

  const processed: ShapeRow[] = []
  for (const [shapeId, pts] of shapeMap) {
    pts.sort((a, b) => a.seq - b.seq)
    if (pts.length < 2) continue

    const coords: Array<[number, number]> = pts.map((p) => [p.lat, p.lon])
    const { polyline6, shapeHash } = await simplifyAndHash(coords)
    const internalId = await shapeMapper.getOrCreate(shapeId)

    const lats = pts.map((p) => p.lat)
    const lons = pts.map((p) => p.lon)
    processed.push({ internalId, polyline6, shapeHash, minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) })
  }

  for (let i = 0; i < processed.length; i += BATCH_SIZE) {
    await flushShapes(db, feedId, processed.slice(i, i + BATCH_SIZE))
  }
}

async function flushShapes(db: DrizzleDb, feedId: string, rows: ShapeRow[]): Promise<void> {
  // shapes_compact.bbox requires ST_MakeEnvelope (PostGIS) so we can't use the query builder.
  // All interpolated values are computed numbers/UUIDs — no user-supplied strings except polyline6.
  // polyline6 uses only chars in ASCII 63-126; '$' (ASCII 36) cannot appear, so $POLY$...$POLY$
  // dollar-quoting is safe and handles any valid polyline string.
  const valuesList = rows
    .map(
      (r) =>
        `('${feedId}'::uuid, ${r.internalId}, $POLY$${r.polyline6}$POLY$, 5.0, ${r.shapeHash}::bigint, ST_MakeEnvelope(${r.minLon}, ${r.minLat}, ${r.maxLon}, ${r.maxLat}, 4326))`
    )
    .join(', ')

  await db.execute(sql`
    INSERT INTO shapes_compact (feed_id, internal_id, polyline6, simplify_eps_m, shape_hash, bbox)
    VALUES ${sql.raw(valuesList)}
    ON CONFLICT (feed_id, shape_hash) DO NOTHING
  `)
}
