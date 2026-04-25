import { parse } from 'csv-parse/sync'
import { sql } from 'drizzle-orm'
import type { DrizzleDb } from '../../db/client.js'
import type { IdMapper } from '../../lib/id-mapper.js'

const BATCH_SIZE = 500

function parseCsv(content: Buffer): Record<string, string>[] {
  return parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[]
}

export async function runAgenciesRoutesStage(
  db: DrizzleDb,
  feedId: string,
  agencyMapper: IdMapper,
  routeMapper: IdMapper,
  _stopMapper: IdMapper,
  readFile: (name: string) => Buffer | null,
): Promise<void> {
  // ── Agencies ────────────────────────────────────────────────────────────────
  const agencyFile = readFile('agency.txt')
  if (agencyFile) {
    const agencyRows = parseCsv(agencyFile)
    const agencyIds = agencyRows.map((r) => r['agency_id']?.trim() || 'default')
    await agencyMapper.bulkGetOrCreate(agencyIds)

    for (const row of agencyRows) {
      const externalId = row['agency_id']?.trim() || 'default'
      const internalId = await agencyMapper.getOrCreate(externalId) // cache hit
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
    const routeRows = parseCsv(routeFile)

    // Bulk-prefetch all route and agency IDs
    await routeMapper.bulkGetOrCreate(routeRows.map((r) => r['route_id']))
    await agencyMapper.bulkGetOrCreate(
      [...new Set(routeRows.map((r) => r['agency_id']?.trim() || 'default'))]
    )

    const batch: Array<{
      internalId: number
      agencyInternalId: number
      shortName: string | null
      longName: string | null
      routeType: number
      color: string
      textColor: string
    }> = []

    for (const row of routeRows) {
      const routeInternalId = await routeMapper.getOrCreate(row['route_id']) // cache hit
      const agencyInternalId = await agencyMapper.getOrCreate(row['agency_id']?.trim() || 'default') // cache hit
      batch.push({
        internalId: routeInternalId,
        agencyInternalId,
        shortName: row['route_short_name'] ?? null,
        longName: row['route_long_name'] ?? null,
        routeType: parseInt(row['route_type'] ?? '3', 10),
        color: (row['route_color'] ?? 'AAAAAA').slice(0, 6),
        textColor: (row['route_text_color'] ?? 'FFFFFF').slice(0, 6),
      })

      if (batch.length >= BATCH_SIZE) {
        await flushRoutes(db, feedId, batch.splice(0))
      }
    }
    if (batch.length > 0) await flushRoutes(db, feedId, batch)
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

async function flushRoutes(
  db: DrizzleDb,
  feedId: string,
  rows: Array<{
    internalId: number
    agencyInternalId: number
    shortName: string | null
    longName: string | null
    routeType: number
    color: string
    textColor: string
  }>,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO routes_compact
      (feed_id, internal_id, agency_internal_id, short_name, long_name, route_type, color, text_color)
    SELECT
      ${feedId}::uuid,
      t.internal_id,
      t.agency_internal_id,
      t.short_name,
      t.long_name,
      t.route_type,
      t.color,
      t.text_color
    FROM unnest(
      ${rows.map((r) => r.internalId)}::int[],
      ${rows.map((r) => r.agencyInternalId)}::int[],
      ${rows.map((r) => r.shortName)}::text[],
      ${rows.map((r) => r.longName)}::text[],
      ${rows.map((r) => r.routeType)}::int[],
      ${rows.map((r) => r.color)}::text[],
      ${rows.map((r) => r.textColor)}::text[]
    ) AS t(internal_id, agency_internal_id, short_name, long_name, route_type, color, text_color)
    ON CONFLICT (feed_id, internal_id) DO UPDATE
      SET short_name         = EXCLUDED.short_name,
          long_name          = EXCLUDED.long_name,
          route_type         = EXCLUDED.route_type,
          color              = EXCLUDED.color,
          text_color         = EXCLUDED.text_color,
          agency_internal_id = EXCLUDED.agency_internal_id
  `)
}
