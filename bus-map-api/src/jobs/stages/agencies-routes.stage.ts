import { parse } from 'csv-parse/sync'
import { sql } from 'drizzle-orm'
import type { DrizzleDb } from '../../db/client.js'
import type { IdMapper } from '../../lib/id-mapper.js'

function parseCsv(content: Buffer): Record<string, string>[] {
  return parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[]
}

export async function runAgenciesRoutesStage(
  db: DrizzleDb,
  feedId: string,
  agencyMapper: IdMapper,
  routeMapper: IdMapper,
  stopMapper: IdMapper,
  readFile: (name: string) => Buffer | null,
): Promise<void> {
  // ── Agencies ────────────────────────────────────────────────────────────────
  const agencyFile = readFile('agency.txt')
  if (agencyFile) {
    for (const row of parseCsv(agencyFile)) {
      const externalId = row['agency_id']?.trim() || 'default'
      const internalId = await agencyMapper.getOrCreate(externalId)
      await db.execute(sql`
        INSERT INTO agencies_compact (feed_id, internal_id, name, url, tz)
        VALUES (
          ${feedId}::uuid,
          ${internalId},
          ${row['agency_name'] ?? 'Unknown'},
          ${row['agency_url'] ?? null},
          ${row['agency_timezone'] ?? 'UTC'}
        )
        ON CONFLICT (feed_id, internal_id) DO UPDATE
          SET name = EXCLUDED.name,
              url  = EXCLUDED.url,
              tz   = EXCLUDED.tz
      `)
    }
  }

  // ── Routes ──────────────────────────────────────────────────────────────────
  const routeFile = readFile('routes.txt')
  if (routeFile) {
    for (const row of parseCsv(routeFile)) {
      const routeInternalId = await routeMapper.getOrCreate(row['route_id'])
      const agencyExternalId = row['agency_id']?.trim() || 'default'
      const agencyInternalId = await agencyMapper.getOrCreate(agencyExternalId)

      await db.execute(sql`
        INSERT INTO routes_compact
          (feed_id, internal_id, agency_internal_id, short_name, long_name, route_type, color, text_color)
        VALUES (
          ${feedId}::uuid,
          ${routeInternalId},
          ${agencyInternalId},
          ${row['route_short_name'] ?? null},
          ${row['route_long_name'] ?? null},
          ${parseInt(row['route_type'] ?? '3', 10)},
          ${(row['route_color'] ?? 'AAAAAA').slice(0, 6)},
          ${(row['route_text_color'] ?? 'FFFFFF').slice(0, 6)}
        )
        ON CONFLICT (feed_id, internal_id) DO UPDATE
          SET short_name       = EXCLUDED.short_name,
              long_name        = EXCLUDED.long_name,
              route_type       = EXCLUDED.route_type,
              color            = EXCLUDED.color,
              text_color       = EXCLUDED.text_color,
              agency_internal_id = EXCLUDED.agency_internal_id
      `)
    }
  }

  // ── Compute agency coverage (MultiPolygon union of stop bboxes) ─────────────
  await db.execute(sql`
    UPDATE agencies_compact ac
    SET coverage = (
      SELECT ST_Multi(ST_Union(ST_Buffer(sc.geom::geography, 500)::geometry))
      FROM stops_compact sc
      JOIN routes_compact rc ON rc.feed_id = sc.feed_id
      WHERE sc.feed_id = ${feedId}::uuid
        AND rc.agency_internal_id = ac.internal_id
        AND sc.geom IS NOT NULL
    )
    WHERE ac.feed_id = ${feedId}::uuid
  `)
}
