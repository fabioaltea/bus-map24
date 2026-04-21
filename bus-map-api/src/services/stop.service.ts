import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'

export interface StopDetailResult {
  id: string
  stopId: string
  name: string
  code: string | null
  description: string | null
  location: string
  locationType: number
  wheelchairBoarding: number
  routes: Array<{ id: string; shortName: string | null; longName: string | null; color: string; fromStop: string | null; toStop: string | null }>
}

export interface DepartureResult {
  tripId: string
  headsign: string | null
  routeShortName: string | null
  routeLongName: string | null
  routeColor: string
  departureTime: string  // HH:MM:SS
  serviceDate: string
}

export async function getStopById(id: string): Promise<StopDetailResult | null> {
  const rows = await db.execute<{
    id: string
    stop_id: string
    name: string
    code: string | null
    description: string | null
    location_wkt: string
    location_type: number
    wheelchair_boarding: number
  }>(sql`
    SELECT
      s.id,
      s.stop_id,
      s.name,
      s.code,
      s.description,
      ST_AsText(s.location) AS location_wkt,
      s.location_type,
      s.wheelchair_boarding
    FROM stops s
    WHERE s.id = ${id}
    LIMIT 1
  `)

  if (rows.rows.length === 0) return null
  const r = rows.rows[0]

  const routeRows = await db.execute<{
    id: string
    short_name: string | null
    long_name: string | null
    color: string | null
    from_stop: string | null
    to_stop: string | null
  }>(sql`
    SELECT DISTINCT ON (r.id)
      r.id,
      r.short_name,
      r.long_name,
      r.color,
      s_from.name AS from_stop,
      s_to.name   AS to_stop
    FROM routes r
    JOIN trips t ON t.route_id = r.id
    JOIN stop_times st ON st.trip_id = t.id
    LEFT JOIN LATERAL (
      SELECT st2.stop_id
      FROM trips t2
      JOIN stop_times st2 ON st2.trip_id = t2.id
      WHERE t2.route_id = r.id
      ORDER BY t2.id, st2.stop_sequence ASC
      LIMIT 1
    ) term_from ON true
    LEFT JOIN LATERAL (
      SELECT st3.stop_id
      FROM trips t3
      JOIN stop_times st3 ON st3.trip_id = t3.id
      WHERE t3.route_id = r.id
      ORDER BY t3.id, st3.stop_sequence DESC
      LIMIT 1
    ) term_to ON true
    LEFT JOIN stops s_from ON s_from.id = term_from.stop_id
    LEFT JOIN stops s_to   ON s_to.id   = term_to.stop_id
    WHERE st.stop_id = ${id}
    ORDER BY r.id, r.short_name
  `)

  return {
    id: r.id,
    stopId: r.stop_id,
    name: r.name,
    code: r.code ?? null,
    description: r.description ?? null,
    location: r.location_wkt,
    locationType: Number(r.location_type),
    wheelchairBoarding: Number(r.wheelchair_boarding),
    routes: routeRows.rows.map((rt) => ({
      id: rt.id,
      shortName: rt.short_name ?? null,
      longName: rt.long_name ?? null,
      color: rt.color ?? 'AAAAAA',
      fromStop: rt.from_stop ?? null,
      toStop: rt.to_stop ?? null,
    })),
  }
}

export async function getStopDepartures(
  stopId: string,
  date: string,    // YYYY-MM-DD
  nowTime: string, // HH:MM:SS — only show departures from this time forward
  limit = 30,
): Promise<DepartureResult[]> {
  const rows = await db.execute<{
    trip_id: string
    headsign: string | null
    route_short_name: string | null
    route_long_name: string | null
    route_color: string | null
    dep_hour: string
    dep_min: string
    dep_sec: string
  }>(sql`
    SELECT
      t.id AS trip_id,
      COALESCE(t.headsign, st.stop_headsign) AS headsign,
      r.short_name  AS route_short_name,
      r.long_name   AS route_long_name,
      r.color       AS route_color,
      EXTRACT(HOUR   FROM st.departure_time)::integer AS dep_hour,
      EXTRACT(MINUTE FROM st.departure_time)::integer AS dep_min,
      EXTRACT(SECOND FROM st.departure_time)::integer AS dep_sec
    FROM stop_times st
    JOIN trips t  ON t.id  = st.trip_id
    JOIN routes r ON r.id  = t.route_id
    WHERE st.stop_id = ${stopId}
      AND st.departure_time >= ${nowTime}::interval
      AND (
        EXISTS (
          SELECT 1 FROM calendars c
          WHERE c.feed_id     = t.feed_id
            AND c.service_id  = t.service_id
            AND c.start_date <= ${date}::date
            AND c.end_date   >= ${date}::date
            AND (
              (EXTRACT(DOW FROM ${date}::date) = 0 AND c.sunday)
              OR (EXTRACT(DOW FROM ${date}::date) = 1 AND c.monday)
              OR (EXTRACT(DOW FROM ${date}::date) = 2 AND c.tuesday)
              OR (EXTRACT(DOW FROM ${date}::date) = 3 AND c.wednesday)
              OR (EXTRACT(DOW FROM ${date}::date) = 4 AND c.thursday)
              OR (EXTRACT(DOW FROM ${date}::date) = 5 AND c.friday)
              OR (EXTRACT(DOW FROM ${date}::date) = 6 AND c.saturday)
            )
            AND NOT EXISTS (
              SELECT 1 FROM calendar_dates cd
              WHERE cd.feed_id    = t.feed_id
                AND cd.service_id = t.service_id
                AND cd.date       = ${date}::date
                AND cd.exception_type = 2
            )
        )
        OR EXISTS (
          SELECT 1 FROM calendar_dates cd
          WHERE cd.feed_id    = t.feed_id
            AND cd.service_id = t.service_id
            AND cd.date       = ${date}::date
            AND cd.exception_type = 1
        )
      )
    ORDER BY st.departure_time
    LIMIT ${limit}
  `)

  return rows.rows.map((r) => {
    const h = String(r.dep_hour).padStart(2, '0')
    const m = String(r.dep_min).padStart(2, '0')
    const s = String(r.dep_sec).padStart(2, '0')
    return {
      tripId: r.trip_id,
      headsign: r.headsign ?? null,
      routeShortName: r.route_short_name ?? null,
      routeLongName: r.route_long_name ?? null,
      routeColor: r.route_color ?? 'AAAAAA',
      departureTime: `${h}:${m}:${s}`,
      serviceDate: date,
    }
  })
}
