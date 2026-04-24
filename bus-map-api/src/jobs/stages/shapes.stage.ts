import { parse } from 'csv-parse/sync'
import { sql } from 'drizzle-orm'
import { simplifyAndHash } from '../../lib/shape-dedup.js'
import type { DrizzleDb } from '../../db/client.js'
import type { IdMapper } from '../../lib/id-mapper.js'

function parseCsv(content: Buffer): Record<string, string>[] {
  return parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[]
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

  for (const [shapeId, pts] of shapeMap) {
    pts.sort((a, b) => a.seq - b.seq)
    if (pts.length < 2) continue

    const coords: Array<[number, number]> = pts.map((p) => [p.lat, p.lon])
    const { polyline6, shapeHash } = await simplifyAndHash(coords)

    const internalId = await shapeMapper.getOrCreate(shapeId)

    // Compute bbox from decoded coords
    const lats = pts.map((p) => p.lat)
    const lons = pts.map((p) => p.lon)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)

    await db.execute(sql`
      INSERT INTO shapes_compact
        (feed_id, internal_id, polyline6, simplify_eps_m, shape_hash, bbox)
      VALUES (
        ${feedId}::uuid,
        ${internalId},
        ${polyline6},
        5.0,
        ${shapeHash.toString()}::bigint,
        ST_MakeEnvelope(${minLon}, ${minLat}, ${maxLon}, ${maxLat}, 4326)
      )
      ON CONFLICT (feed_id, shape_hash) DO NOTHING
    `)
  }
}
