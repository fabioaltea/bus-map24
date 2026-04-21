/**
 * B020 — Feed Download Job
 *
 * 1. Downloads GTFS zip from hosted_url
 * 2. Validates required files
 * 3. Imports into PostgreSQL (agencies → routes → stops → shapes → trips → calendars → stop_times)
 * 4. Computes agency bounding boxes from stops (ST_Extent)
 * 5. Marks feed as 'ready' and enqueues tile-gen job
 */

import AdmZip from 'adm-zip'
import { parse } from 'csv-parse/sync'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
  agencies,
  calendars,
  calendarDates,
  feedCatalogEntries,
  routes,
  shapes,
  stops,
  stopTimes,
  trips,
} from '../db/schema.js'
import { tileGenQueue, type FeedDownloadJobData, type TileGenJobData } from './queues.js'

const BATCH_SIZE = 500
const REQUIRED_FILES = ['agency.txt', 'routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt']

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCsv(content: Buffer): Record<string, string>[] {
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[]
}

function str(v: string | undefined, maxLen?: number): string | null {
  if (!v || v.trim() === '') return null
  return maxLen ? v.trim().slice(0, maxLen) : v.trim()
}

function num(v: string | undefined): number | null {
  if (!v || v.trim() === '') return null
  const n = Number(v.trim())
  return isNaN(n) ? null : n
}

function int(v: string | undefined): number {
  return num(v) ?? 0
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function pointWkt(lat: string, lng: string): string {
  return `SRID=4326;POINT(${lng} ${lat})`
}

function lineStringWkt(points: Array<{ lat: number; lng: number }>): string {
  const coords = points.map((p) => `${p.lng} ${p.lat}`).join(',')
  return `SRID=4326;LINESTRING(${coords})`
}

// ── Batch insert helper ───────────────────────────────────────────────────────

async function batchInsert<T extends object>(
  table: Parameters<typeof db.insert>[0],
  rows: T[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await db.insert(table).values(rows.slice(i, i + BATCH_SIZE)).onConflictDoNothing()
  }
}

// ── Main processor ────────────────────────────────────────────────────────────

export async function runFeedDownload(data: FeedDownloadJobData): Promise<void> {
  const { feedId, mobilityDbId, downloadUrl } = data

  // ── 1. Mark as downloading ──────────────────────────────────────────────────
  await db
    .update(feedCatalogEntries)
    .set({ importStatus: 'downloading' })
    .where(eq(feedCatalogEntries.id, feedId))

  try {
    // ── 2. Download zip ───────────────────────────────────────────────────────
    console.log(`[feed-download] ${mobilityDbId} — downloading ${downloadUrl}`)
    const res = await fetch(downloadUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${downloadUrl}`)
    const zipBuffer = Buffer.from(await res.arrayBuffer())
    const zip = new AdmZip(zipBuffer)

    // ── 3. Validate required files ────────────────────────────────────────────
    const entries = zip.getEntries().map((e) => e.entryName.replace(/^.*\//, ''))
    for (const required of REQUIRED_FILES) {
      if (!entries.includes(required)) {
        throw new Error(`Missing required GTFS file: ${required}`)
      }
    }

    const readFile = (name: string): Buffer | null => {
      const entry = zip.getEntries().find((e) => e.entryName.endsWith(name))
      return entry ? entry.getData() : null
    }

    // ── 4. Mark as importing ──────────────────────────────────────────────────
    await db
      .update(feedCatalogEntries)
      .set({ importStatus: 'importing' })
      .where(eq(feedCatalogEntries.id, feedId))

    // ── 5. Delete existing data for this feed (full replace) ──────────────────
    // Delete agencies first — cascades to routes → trips → stop_times
    await db.delete(agencies).where(eq(agencies.feedId, feedId))
    // Delete shapes and stops separately (they FK to feed_catalog_entries, not agencies)
    await db.delete(shapes).where(eq(shapes.feedId, feedId))
    await db.delete(stops).where(eq(stops.feedId, feedId))

    // ── 6. Import agency.txt ──────────────────────────────────────────────────
    const agencyRows = parseCsv(readFile('agency.txt')!)
    // GTFS allows single-agency feeds to omit agency_id — default to ''
    const agencyGtfsToUuid = new Map<string, string>()

    for (const row of agencyRows) {
      const gtfsAgencyId = row['agency_id']?.trim() ?? ''
      const [inserted] = await db
        .insert(agencies)
        .values({
          feedId,
          agencyId: gtfsAgencyId || 'default',
          name: row['agency_name'] ?? 'Unknown',
          url: str(row['agency_url']),
          timezone: row['agency_timezone'] ?? 'UTC',
          lang: str(row['agency_lang'], 2),
          phone: str(row['agency_phone'], 64),
        })
        .onConflictDoUpdate({
          target: [agencies.feedId, agencies.agencyId],
          set: { name: row['agency_name'] ?? 'Unknown' },
        })
        .returning({ id: agencies.id })
      agencyGtfsToUuid.set(gtfsAgencyId || 'default', inserted.id)
    }

    console.log(`[feed-download] ${mobilityDbId} — ${agencyGtfsToUuid.size} agencies`)

    // ── 7. Import routes.txt ──────────────────────────────────────────────────
    const routeRows = parseCsv(readFile('routes.txt')!)
    const routeGtfsToUuid = new Map<string, string>()

    for (const row of routeRows) {
      const gtfsAgencyId = row['agency_id']?.trim() ?? ''
      const agencyUuid =
        agencyGtfsToUuid.get(gtfsAgencyId) ??
        agencyGtfsToUuid.get('default') ??
        [...agencyGtfsToUuid.values()][0]

      if (!agencyUuid) throw new Error(`No agency found for route ${row['route_id']}`)

      const [inserted] = await db
        .insert(routes)
        .values({
          feedId,
          agencyId: agencyUuid,
          routeId: row['route_id'],
          shortName: str(row['route_short_name'], 32),
          longName: str(row['route_long_name'], 255),
          description: str(row['route_desc']),
          routeType: int(row['route_type']),
          color: str(row['route_color'], 6) ?? 'AAAAAA',
          textColor: str(row['route_text_color'], 6) ?? 'FFFFFF',
        })
        .onConflictDoUpdate({
          target: [routes.feedId, routes.routeId],
          set: { longName: str(row['route_long_name'], 255) },
        })
        .returning({ id: routes.id })
      routeGtfsToUuid.set(row['route_id'], inserted.id)
    }

    console.log(`[feed-download] ${mobilityDbId} — ${routeGtfsToUuid.size} routes`)

    // ── 8. Import stops.txt ───────────────────────────────────────────────────
    const stopRows = parseCsv(readFile('stops.txt')!)
    const stopGtfsToUuid = new Map<string, string>()

    for (let i = 0; i < stopRows.length; i += BATCH_SIZE) {
      const batch = stopRows.slice(i, i + BATCH_SIZE)
      const values = batch
        .filter((row) => row['stop_lat'] && row['stop_lon'])
        .map((row) => ({
          feedId,
          stopId: row['stop_id'],
          code: str(row['stop_code'], 32),
          name: row['stop_name'] ?? row['stop_id'],
          description: str(row['stop_desc']),
          location: pointWkt(row['stop_lat'], row['stop_lon']) as unknown as string,
          zoneId: str(row['zone_id'], 64),
          url: str(row['stop_url']),
          locationType: int(row['location_type']),
          wheelchairBoarding: int(row['wheelchair_boarding']),
        }))

      if (values.length === 0) continue

      const inserted = await db
        .insert(stops)
        .values(values)
        .onConflictDoUpdate({
          target: [stops.feedId, stops.stopId],
          set: { name: sql`excluded.name` },
        })
        .returning({ id: stops.id, stopId: stops.stopId })

      for (let j = 0; j < inserted.length; j++) {
        stopGtfsToUuid.set(batch[j]['stop_id'], inserted[j].id)
      }
    }

    console.log(`[feed-download] ${mobilityDbId} — ${stopGtfsToUuid.size} stops`)

    // ── 9. Import shapes.txt (optional) ──────────────────────────────────────
    const shapeGtfsToUuid = new Map<string, string>()
    const shapeFile = readFile('shapes.txt')

    if (shapeFile) {
      const shapeRows = parseCsv(shapeFile)

      // Group by shape_id, sort by sequence
      const shapeMap = new Map<string, Array<{ lat: number; lng: number; seq: number }>>()
      for (const row of shapeRows) {
        const sid = row['shape_id']
        if (!shapeMap.has(sid)) shapeMap.set(sid, [])
        shapeMap.get(sid)!.push({
          lat: parseFloat(row['shape_pt_lat']),
          lng: parseFloat(row['shape_pt_lon']),
          seq: int(row['shape_pt_sequence']),
        })
      }

      const shapeBatch: Array<{
        feedId: string
        shapeId: string
        geom: string
        lengthM: null
      }> = []

      for (const [shapeId, pts] of shapeMap) {
        pts.sort((a, b) => a.seq - b.seq)
        if (pts.length < 2) continue // LineString needs ≥ 2 points
        shapeBatch.push({
          feedId,
          shapeId,
          geom: lineStringWkt(pts) as unknown as string,
          lengthM: null,
        })

        if (shapeBatch.length >= BATCH_SIZE) {
          const inserted = await db
            .insert(shapes)
            .values(shapeBatch)
            .onConflictDoNothing()
            .returning({ id: shapes.id, shapeId: shapes.shapeId })
          for (const row of inserted) shapeGtfsToUuid.set(row.shapeId, row.id)
          shapeBatch.length = 0
        }
      }

      if (shapeBatch.length > 0) {
        const inserted = await db
          .insert(shapes)
          .values(shapeBatch)
          .onConflictDoNothing()
          .returning({ id: shapes.id, shapeId: shapes.shapeId })
        for (const row of inserted) shapeGtfsToUuid.set(row.shapeId, row.id)
      }

      console.log(`[feed-download] ${mobilityDbId} — ${shapeGtfsToUuid.size} shapes`)
    }

    // ── 10. Import calendar.txt (optional) ────────────────────────────────────
    const calFile = readFile('calendar.txt')
    if (calFile) {
      const calRows = parseCsv(calFile)
      await batchInsert(
        calendars,
        calRows.map((row) => ({
          feedId,
          serviceId: row['service_id'],
          monday: row['monday'] === '1',
          tuesday: row['tuesday'] === '1',
          wednesday: row['wednesday'] === '1',
          thursday: row['thursday'] === '1',
          friday: row['friday'] === '1',
          saturday: row['saturday'] === '1',
          sunday: row['sunday'] === '1',
          startDate: row['start_date'],
          endDate: row['end_date'],
        })),
      )
      console.log(`[feed-download] ${mobilityDbId} — ${calRows.length} calendar entries`)
    }

    // ── 11. Import calendar_dates.txt (optional) ──────────────────────────────
    const calDatesFile = readFile('calendar_dates.txt')
    if (calDatesFile) {
      const cdRows = parseCsv(calDatesFile)
      await batchInsert(
        calendarDates,
        cdRows.map((row) => ({
          feedId,
          serviceId: row['service_id'],
          date: row['date'],
          exceptionType: int(row['exception_type']),
        })),
      )
      console.log(`[feed-download] ${mobilityDbId} — ${cdRows.length} calendar_dates`)
    }

    // ── 12. Import trips.txt ──────────────────────────────────────────────────
    const tripRows = parseCsv(readFile('trips.txt')!)
    const tripGtfsToUuid = new Map<string, string>()

    for (let i = 0; i < tripRows.length; i += BATCH_SIZE) {
      const batch = tripRows.slice(i, i + BATCH_SIZE)
      const values = batch
        .filter((row) => routeGtfsToUuid.has(row['route_id']))
        .map((row) => ({
          feedId,
          tripId: row['trip_id'],
          routeId: routeGtfsToUuid.get(row['route_id'])!,
          serviceId: row['service_id'],
          shapeId: row['shape_id'] ? (shapeGtfsToUuid.get(row['shape_id']) ?? null) : null,
          headsign: str(row['trip_headsign'], 255),
          directionId: row['direction_id'] !== undefined ? int(row['direction_id']) : null,
          blockId: str(row['block_id'], 64),
          wheelchairAccessible: int(row['wheelchair_accessible']),
        }))

      if (values.length === 0) continue

      const inserted = await db
        .insert(trips)
        .values(values)
        .onConflictDoUpdate({
          target: [trips.feedId, trips.tripId],
          set: { serviceId: sql`excluded.service_id` },
        })
        .returning({ id: trips.id, tripId: trips.tripId })

      for (const row of inserted) tripGtfsToUuid.set(row.tripId, row.id)
    }

    console.log(`[feed-download] ${mobilityDbId} — ${tripGtfsToUuid.size} trips`)

    // ── 13. Import stop_times.txt ─────────────────────────────────────────────
    const stFile = readFile('stop_times.txt')!
    const stRows = parseCsv(stFile)
    let stCount = 0

    for (let i = 0; i < stRows.length; i += BATCH_SIZE) {
      const batch = stRows.slice(i, i + BATCH_SIZE)
      const values = batch
        .filter(
          (row) =>
            tripGtfsToUuid.has(row['trip_id']) && stopGtfsToUuid.has(row['stop_id']),
        )
        .map((row) => ({
          feedId,
          tripId: tripGtfsToUuid.get(row['trip_id'])!,
          stopId: stopGtfsToUuid.get(row['stop_id'])!,
          arrivalTime: row['arrival_time'] || row['departure_time'],
          departureTime: row['departure_time'] || row['arrival_time'],
          stopSequence: int(row['stop_sequence']),
          stopHeadsign: str(row['stop_headsign'], 255),
          pickupType: int(row['pickup_type']),
          dropOffType: int(row['drop_off_type']),
          timepoint: row['timepoint'] !== undefined ? int(row['timepoint']) : 1,
        }))

      if (values.length > 0) {
        await db.insert(stopTimes).values(values).onConflictDoNothing()
        stCount += values.length
      }
    }

    console.log(`[feed-download] ${mobilityDbId} — ${stCount} stop_times`)

    // ── 13.5 Aggregate shapes → routes.shape_geom ────────────────────────────
    // Use DISTINCT on shape id to avoid collecting duplicate geometries
    // (many trips reference the same shape)
    await db.execute(sql`
      UPDATE routes r
      SET shape_geom = (
        SELECT ST_Collect(sub.geom)
        FROM (
          SELECT DISTINCT s.id, s.geom
          FROM shapes s
          JOIN trips t ON t.shape_id = s.id
          WHERE t.route_id = r.id
        ) sub
      )
      WHERE r.feed_id = ${feedId}
        AND EXISTS (
          SELECT 1 FROM trips t
          JOIN shapes s ON s.id = t.shape_id
          WHERE t.route_id = r.id
        )
    `)
    console.log(`[feed-download] ${mobilityDbId} — route shape_geom populated`)

    // ── 14. Compute agency bounding boxes from stops ──────────────────────────
    for (const [, agencyUuid] of agencyGtfsToUuid) {
      await db.execute(sql`
        UPDATE agencies SET
          bounding_box = (
            SELECT ST_Envelope(ST_Extent(s.location))
            FROM stops s
            JOIN trips t ON t.feed_id = s.feed_id
            JOIN routes r ON r.id = t.route_id
            WHERE r.agency_id = ${agencyUuid}
              AND s.feed_id = ${feedId}
          ),
          route_count = (SELECT COUNT(*) FROM routes WHERE agency_id = ${agencyUuid}),
          stop_count  = (SELECT COUNT(DISTINCT s.id)
                         FROM stops s
                         JOIN trips t ON t.feed_id = s.feed_id
                         JOIN routes r ON r.id = t.route_id
                         WHERE r.agency_id = ${agencyUuid} AND s.feed_id = ${feedId})
        WHERE id = ${agencyUuid}
      `)
    }

    // ── 15. Mark as ready ─────────────────────────────────────────────────────
    await db
      .update(feedCatalogEntries)
      .set({ importStatus: 'ready', lastImportedAt: new Date(), errorMessage: null })
      .where(eq(feedCatalogEntries.id, feedId))

    // ── 16. Enqueue tile generation ───────────────────────────────────────────
    await tileGenQueue.add('tile-gen', {
      feedId,
      outputPath: `${mobilityDbId}.pmtiles`,
    } satisfies TileGenJobData)

    console.log(`[feed-download] ${mobilityDbId} — import complete ✓`)
  } catch (err) {
    await db
      .update(feedCatalogEntries)
      .set({
        importStatus: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      .where(eq(feedCatalogEntries.id, feedId))
    throw err
  }
}
