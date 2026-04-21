import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'

export interface Waypoint {
  sec: number   // seconds since midnight (departure)
  lat: number
  lng: number
  name: string
}

export interface TripSchedule {
  tripId: string
  headsign: string | null
  waypoints: Waypoint[]
}

export async function getRouteSchedule(
  routeId: string,
  date: string,   // YYYY-MM-DD
): Promise<TripSchedule[]> {
  const rows = await db.execute<{
    trip_id: string
    headsign: string | null
    waypoints: Waypoint[]
  }>(sql`
    WITH
    active_trips AS (
      SELECT t.id AS trip_id, t.headsign, t.shape_id
      FROM trips t
      WHERE t.route_id = ${routeId}
        AND (
          EXISTS (
            SELECT 1 FROM calendars c
            WHERE c.feed_id    = t.feed_id
              AND c.service_id = t.service_id
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
    ),
    stop_fracs AS (
      SELECT
        st.trip_id,
        st.stop_sequence,
        EXTRACT(EPOCH FROM st.departure_time)::int AS dep_sec,
        s.name,
        ST_X(s.location::geometry)                 AS stop_lng,
        ST_Y(s.location::geometry)                 AS stop_lat,
        CASE WHEN sh.geom IS NOT NULL
          THEN ST_LineLocatePoint(sh.geom, s.location::geometry)
          ELSE NULL
        END AS shape_frac,
        sh.geom AS shape_geom
      FROM active_trips atrips
      JOIN stop_times st ON st.trip_id = atrips.trip_id
      JOIN stops s       ON s.id = st.stop_id
      LEFT JOIN shapes sh ON sh.id = atrips.shape_id
    ),
    segments AS (
      SELECT
        a.trip_id,
        a.dep_sec    AS sec_from,
        b.dep_sec    AS sec_to,
        a.shape_frac AS frac_from,
        b.shape_frac AS frac_to,
        a.stop_lng   AS lng_from,
        a.stop_lat   AS lat_from,
        b.stop_lng   AS lng_to,
        b.stop_lat   AS lat_to,
        b.name       AS next_name,
        a.shape_geom
      FROM stop_fracs a
      JOIN stop_fracs b
        ON b.trip_id       = a.trip_id
       AND b.stop_sequence = a.stop_sequence + 1
    ),
    sampled AS (
      SELECT
        trip_id,
        (sec_from + (sec_to - sec_from)::float * gs / 8)::int AS sec,
        CASE WHEN frac_from IS NOT NULL
          THEN ST_X(ST_LineInterpolatePoint(shape_geom,
            LEAST(GREATEST(frac_from + (frac_to - frac_from) * gs / 8.0, 0), 1)))
          ELSE lng_from + (lng_to - lng_from) * gs / 8.0
        END AS lng,
        CASE WHEN frac_from IS NOT NULL
          THEN ST_Y(ST_LineInterpolatePoint(shape_geom,
            LEAST(GREATEST(frac_from + (frac_to - frac_from) * gs / 8.0, 0), 1)))
          ELSE lat_from + (lat_to - lat_from) * gs / 8.0
        END AS lat,
        next_name AS name
      FROM segments
      CROSS JOIN generate_series(0, 7) AS gs

      UNION ALL

      -- terminus: last stop of each trip
      SELECT sf.trip_id, sf.dep_sec, sf.stop_lng, sf.stop_lat, sf.name
      FROM stop_fracs sf
      WHERE NOT EXISTS (
        SELECT 1 FROM stop_fracs sf2
        WHERE sf2.trip_id       = sf.trip_id
          AND sf2.stop_sequence = sf.stop_sequence + 1
      )
    )
    SELECT
      atrips.trip_id,
      atrips.headsign,
      json_agg(
        json_build_object('sec', sp.sec, 'lat', sp.lat, 'lng', sp.lng, 'name', sp.name)
        ORDER BY sp.sec
      ) AS waypoints
    FROM active_trips atrips
    JOIN sampled sp ON sp.trip_id = atrips.trip_id
    GROUP BY atrips.trip_id, atrips.headsign
    HAVING COUNT(*) >= 2
    ORDER BY MIN(sp.sec)
  `)

  return rows.rows
    .filter((r) => Array.isArray(r.waypoints) && r.waypoints.length >= 2)
    .map((r) => ({
      tripId: r.trip_id,
      headsign: r.headsign ?? null,
      waypoints: r.waypoints,
    }))
}
