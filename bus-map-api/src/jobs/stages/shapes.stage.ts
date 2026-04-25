import { parse } from 'csv-parse/sync'
import { sql } from 'drizzle-orm'
import { simplifyAndHash } from '../../lib/shape-dedup.js'
import type { DrizzleDb } from '../../db/client.js'
import type { IdMapper } from '../../lib/id-mapper.js'

const BATCH_SIZE = 500

function parseCsv(content: Buffer): Record<string, string>[] {
  return parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[]
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

  // Group by shape_id, sort by sequence
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

  // Pre-populate id cache in one query instead of one query per shape
  await shapeMapper.bulkGetOrCreate([...shapeMap.keys()])

  // Process all shapes in memory (CPU only — no DB)
  const processed: ShapeRow[] = []
  for (const [shapeId, pts] of shapeMap) {
    pts.sort((a, b) => a.seq - b.seq)
    if (pts.length < 2) continue

    const coords: Array<[number, number]> = pts.map((p) => [p.lat, p.lon])
    const { polyline6, shapeHash } = await simplifyAndHash(coords)
    const internalId = await shapeMapper.getOrCreate(shapeId) // cache hit — no DB

    const lats = pts.map((p) => p.lat)
    const lons = pts.map((p) => p.lon)
    processed.push({
      internalId,
      polyline6,
      shapeHash,
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLon: Math.min(...lons),
      maxLon: Math.max(...lons),
    })
  }

  // Bulk-insert in chunks of BATCH_SIZE — one query per chunk instead of one per shape
  for (let i = 0; i < processed.length; i += BATCH_SIZE) {
    const chunk = processed.slice(i, i + BATCH_SIZE)
    await db.execute(sql`
      INSERT INTO shapes_compact
        (feed_id, internal_id, polyline6, simplify_eps_m, shape_hash, bbox)
      SELECT
        ${feedId}::uuid,
        t.internal_id,
        t.polyline6,
        5.0,
        t.shape_hash::bigint,
        ST_MakeEnvelope(t.min_lon, t.min_lat, t.max_lon, t.max_lat, 4326)
      FROM unnest(
        ${chunk.map((r) => r.internalId)}::int[],
        ${chunk.map((r) => r.polyline6)}::text[],
        ${chunk.map((r) => r.shapeHash.toString())}::text[],
        ${chunk.map((r) => r.minLat)}::float8[],
        ${chunk.map((r) => r.maxLat)}::float8[],
        ${chunk.map((r) => r.minLon)}::float8[],
        ${chunk.map((r) => r.maxLon)}::float8[]
      ) AS t(internal_id, polyline6, shape_hash, min_lat, max_lat, min_lon, max_lon)
      ON CONFLICT (feed_id, shape_hash) DO NOTHING
    `)
  }
}
