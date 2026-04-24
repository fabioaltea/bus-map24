import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'

export interface Waypoint {
  sec: number
  lat: number
  lng: number
  name: string
}

export interface TripSchedule {
  tripId: string
  headsign: string | null
  waypoints: Waypoint[]
}

export interface DepartureResult {
  tripId: string
  headsign: string | null
  routeShortName: string | null
  routeLongName: string | null
  routeColor: string
  departureTime: string
  serviceDate: string
}

function secToHms(sec: number): string {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0')
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

// ── expandDeparturesForStop ───────────────────────────────────────────────────

export async function expandDeparturesForStop(
  stopExternalId: string,
  feedId: string,
  date: string,
  fromTimeSec: number,
  limit = 30,
): Promise<DepartureResult[]> {
  const dow = new Date(date).getDay()
  const dowCol = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dow]

  const rows = await db.execute<{
    trip_external_id: string
    headsign: string | null
    route_short_name: string | null
    route_long_name: string | null
    route_color: string | null
    departure_sec: number
  }>(sql`
    WITH active_services AS (
      SELECT DISTINCT cc.service_internal_id
      FROM calendar_compact cc
      WHERE cc.feed_id = ${feedId}::uuid
        AND cc.start_date <= ${date}::date
        AND cc.end_date   >= ${date}::date
        AND ${sql.raw(dowCol)} = true
        AND NOT EXISTS (
          SELECT 1 FROM calendar_dates_compact cd
          WHERE cd.feed_id = ${feedId}::uuid
            AND cd.service_internal_id = cc.service_internal_id
            AND cd.date = ${date}::date AND cd.exception_type = 2
        )
      UNION
      SELECT cd2.service_internal_id
      FROM calendar_dates_compact cd2
      WHERE cd2.feed_id = ${feedId}::uuid
        AND cd2.date = ${date}::date AND cd2.exception_type = 1
    ),
    stop_internal AS (
      SELECT internal_id FROM feed_stops
      WHERE feed_id = ${feedId}::uuid AND external_id = ${stopExternalId}
      LIMIT 1
    ),
    stop_offsets AS (
      SELECT ps.pattern_id, ps.offset_departure_sec
      FROM pattern_stops ps
      JOIN stop_internal si ON si.internal_id = ps.stop_internal_id
    ),
    active_trips AS (
      SELECT tc.internal_id, tc.start_time_sec, tc.pattern_id,
             tc.headsign, tc.route_internal_id,
             ft.external_id AS trip_external_id
      FROM trips_compact tc
      JOIN feed_trips ft ON ft.feed_id = tc.feed_id AND ft.internal_id = tc.internal_id
      JOIN active_services asvc ON asvc.service_internal_id = tc.service_internal_id
      WHERE tc.feed_id = ${feedId}::uuid
    ),
    base_departures AS (
      SELECT at.trip_external_id, at.headsign, at.route_internal_id,
             (at.start_time_sec + so.offset_departure_sec) AS departure_sec
      FROM active_trips at
      JOIN stop_offsets so ON so.pattern_id = at.pattern_id
    ),
    freq_departures AS (
      SELECT at.trip_external_id, at.headsign, at.route_internal_id,
        (fc.start_time_sec + so.offset_departure_sec +
          gs.n * fc.headway_sec) AS departure_sec
      FROM active_trips at
      JOIN frequencies_compact fc
        ON fc.feed_id = ${feedId}::uuid AND fc.trip_internal_id = at.internal_id
      JOIN stop_offsets so ON so.pattern_id = at.pattern_id
      JOIN LATERAL generate_series(
        0,
        GREATEST((fc.end_time_sec - fc.start_time_sec) / NULLIF(fc.headway_sec, 0) - 1, 0)
      ) AS gs(n) ON true
    )
    SELECT d.trip_external_id, d.headsign,
           rc.short_name AS route_short_name,
           rc.long_name  AS route_long_name,
           rc.color      AS route_color,
           d.departure_sec
    FROM (
      SELECT * FROM base_departures
      UNION ALL
      SELECT * FROM freq_departures
    ) d
    JOIN routes_compact rc
      ON rc.feed_id = ${feedId}::uuid AND rc.internal_id = d.route_internal_id
    WHERE d.departure_sec >= ${fromTimeSec}
    ORDER BY d.departure_sec
    LIMIT ${limit}
  `)

  return rows.rows.map((r) => ({
    tripId: r.trip_external_id,
    headsign: r.headsign ?? null,
    routeShortName: r.route_short_name ?? null,
    routeLongName: r.route_long_name ?? null,
    routeColor: r.route_color ?? 'AAAAAA',
    departureTime: secToHms(Number(r.departure_sec)),
    serviceDate: date,
  }))
}

// ── getRouteSchedule ──────────────────────────────────────────────────────────

export async function getRouteSchedule(
  routeId: string,
  date: string,
): Promise<TripSchedule[]> {
  const rows = await db.execute<{
    trip_external_id: string
    headsign: string | null
    waypoints: Waypoint[]
  }>(sql`
    WITH active_services AS (
      SELECT DISTINCT cc.service_internal_id, fce.id AS feed_id
      FROM calendar_compact cc
      JOIN feed_catalog_entries fce ON fce.id = cc.feed_id
      JOIN feed_routes fr ON fr.feed_id = fce.id AND fr.external_id = ${routeId}
      WHERE cc.start_date <= ${date}::date AND cc.end_date >= ${date}::date
        AND (
          (EXTRACT(DOW FROM ${date}::date)::integer = 0 AND cc.sunday)
          OR (EXTRACT(DOW FROM ${date}::date)::integer = 1 AND cc.monday)
          OR (EXTRACT(DOW FROM ${date}::date)::integer = 2 AND cc.tuesday)
          OR (EXTRACT(DOW FROM ${date}::date)::integer = 3 AND cc.wednesday)
          OR (EXTRACT(DOW FROM ${date}::date)::integer = 4 AND cc.thursday)
          OR (EXTRACT(DOW FROM ${date}::date)::integer = 5 AND cc.friday)
          OR (EXTRACT(DOW FROM ${date}::date)::integer = 6 AND cc.saturday)
        )
        AND NOT EXISTS (
          SELECT 1 FROM calendar_dates_compact cdc
          WHERE cdc.feed_id = cc.feed_id
            AND cdc.service_internal_id = cc.service_internal_id
            AND cdc.date = ${date}::date AND cdc.exception_type = 2
        )
      UNION
      SELECT cdc2.service_internal_id, fce2.id AS feed_id
      FROM calendar_dates_compact cdc2
      JOIN feed_catalog_entries fce2 ON fce2.id = cdc2.feed_id
      JOIN feed_routes fr2 ON fr2.feed_id = fce2.id AND fr2.external_id = ${routeId}
      WHERE cdc2.date = ${date}::date AND cdc2.exception_type = 1
    ),
    active_trips AS (
      SELECT DISTINCT ON (ft.external_id)
        ft.external_id AS trip_external_id,
        tc.pattern_id, tc.start_time_sec, tc.headsign, tc.feed_id
      FROM feed_routes fr
      JOIN routes_compact rc ON rc.feed_id = fr.feed_id AND rc.internal_id = fr.internal_id
      JOIN trips_compact tc ON tc.feed_id = rc.feed_id AND tc.route_internal_id = rc.internal_id
      JOIN feed_trips ft ON ft.feed_id = tc.feed_id AND ft.internal_id = tc.internal_id
      JOIN active_services asvc
        ON asvc.feed_id = tc.feed_id AND asvc.service_internal_id = tc.service_internal_id
      WHERE fr.external_id = ${routeId}
    )
    SELECT at.trip_external_id, at.headsign,
      json_agg(
        json_build_object(
          'sec',  (at.start_time_sec + ps.offset_departure_sec),
          'lat',  sc.lat_e6::float / 1e6,
          'lng',  sc.lon_e6::float / 1e6,
          'name', sc.name
        ) ORDER BY ps.seq
      ) AS waypoints
    FROM active_trips at
    JOIN pattern_stops ps ON ps.pattern_id = at.pattern_id
    JOIN stops_compact sc ON sc.feed_id = at.feed_id AND sc.internal_id = ps.stop_internal_id
    GROUP BY at.trip_external_id, at.headsign, at.start_time_sec
    HAVING COUNT(*) >= 2
    ORDER BY at.start_time_sec
  `)

  return rows.rows
    .filter((r) => Array.isArray(r.waypoints) && r.waypoints.length >= 2)
    .map((r) => ({ tripId: r.trip_external_id, headsign: r.headsign ?? null, waypoints: r.waypoints }))
}
