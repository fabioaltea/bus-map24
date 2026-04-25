import { parse } from 'csv-parse/sync'
import { sql } from 'drizzle-orm'
import { agenciesCompact, routesCompact } from '../../db/schema.js'
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
    await agencyMapper.bulkGetOrCreate(agencyRows.map((r) => r['agency_id']?.trim() || 'default'))

    for (const row of agencyRows) {
      const internalId = await agencyMapper.getOrCreate(row['agency_id']?.trim() || 'default')
      await db
        .insert(agenciesCompact)
        .values({ feedId, internalId, name: row['agency_name'] ?? 'Unknown', url: row['agency_url'] ?? null, tz: row['agency_timezone'] ?? 'UTC' })
        .onConflictDoUpdate({
          target: [agenciesCompact.feedId, agenciesCompact.internalId],
          set: { name: sql`excluded.name`, url: sql`excluded.url`, tz: sql`excluded.tz` },
        })
    }
  }

  // ── Routes ──────────────────────────────────────────────────────────────────
  const routeFile = readFile('routes.txt')
  if (routeFile) {
    const routeRows = parseCsv(routeFile)
    await routeMapper.bulkGetOrCreate(routeRows.map((r) => r['route_id']))
    await agencyMapper.bulkGetOrCreate([...new Set(routeRows.map((r) => r['agency_id']?.trim() || 'default'))])

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
      batch.push({
        internalId: await routeMapper.getOrCreate(row['route_id']),
        agencyInternalId: await agencyMapper.getOrCreate(row['agency_id']?.trim() || 'default'),
        shortName: row['route_short_name'] ?? null,
        longName: row['route_long_name'] ?? null,
        routeType: parseInt(row['route_type'] ?? '3', 10),
        color: (row['route_color'] ?? 'AAAAAA').slice(0, 6),
        textColor: (row['route_text_color'] ?? 'FFFFFF').slice(0, 6),
      })

      if (batch.length >= BATCH_SIZE) await flushRoutes(db, feedId, batch.splice(0))
    }
    if (batch.length > 0) await flushRoutes(db, feedId, batch)
  }

  // ── Compute agency coverage ──────────────────────────────────────────────────
  // ST_ConvexHull(ST_Collect) is O(n log n); ST_Union(ST_Buffer(...)) was O(n²) and OOM-killed
  // on large regional feeds (e.g. ARST with stops across all of Sardinia).
  // Convex hull is sufficient for viewport intersection — no need for exact buffered union.
  await db.execute(sql`
    UPDATE agencies_compact ac
    SET coverage = (
      SELECT ST_Multi(ST_ConvexHull(ST_Collect(sc.geom)))
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
  rows: Array<{ internalId: number; agencyInternalId: number; shortName: string | null; longName: string | null; routeType: number; color: string; textColor: string }>,
): Promise<void> {
  await db
    .insert(routesCompact)
    .values(rows.map((r) => ({
      feedId,
      internalId: r.internalId,
      agencyInternalId: r.agencyInternalId,
      shortName: r.shortName,
      longName: r.longName,
      routeType: r.routeType,
      color: r.color,
      textColor: r.textColor,
    })))
    .onConflictDoUpdate({
      target: [routesCompact.feedId, routesCompact.internalId],
      set: {
        shortName: sql`excluded.short_name`,
        longName: sql`excluded.long_name`,
        routeType: sql`excluded.route_type`,
        color: sql`excluded.color`,
        textColor: sql`excluded.text_color`,
        agencyInternalId: sql`excluded.agency_internal_id`,
      },
    })
}
