import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'

export interface LiveBus {
  tripId: string
  headsign: string | null
  fromStop: string
  toStop: string
  bearing: number
  segFraction: number
  positionWkt: string
  tripStartSec: number   // seconds from midnight
  tripEndSec: number
  nextStopArrivalSec: number
}

export interface TripStop {
  stopId: string
  name: string
  arrivalSec: number
  departureSec: number
  sequence: number
}

export async function getLiveBuses(
  routeId: string,
  date: string,
  nowTime: string,
): Promise<LiveBus[]> {
  const rows = await db.execute<{
    trip_id: string
    headsign: string | null
    from_stop: string
    to_stop: string
    seg_fraction: string
    position_wkt: string
    bearing: string
    trip_start_sec: string
    trip_end_sec: string
    next_stop_arrival_sec: string
  }>(sql`
    WITH active_trips AS (
      SELECT t.id AS trip_id, t.shape_id, t.feed_id, t.service_id, t.headsign
      FROM trips t
      WHERE t.route_id = ${routeId}
        AND (
          EXISTS (
            SELECT 1 FROM calendars c
            WHERE c.feed_id = t.feed_id AND c.service_id = t.service_id
              AND c.start_date <= ${date}::date AND c.end_date >= ${date}::date
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
                WHERE cd.feed_id = t.feed_id AND cd.service_id = t.service_id
                  AND cd.date = ${date}::date AND cd.exception_type = 2
              )
          )
          OR EXISTS (
            SELECT 1 FROM calendar_dates cd
            WHERE cd.feed_id = t.feed_id AND cd.service_id = t.service_id
              AND cd.date = ${date}::date AND cd.exception_type = 1
          )
        )
    ),
    trip_bounds AS (
      SELECT
        at.trip_id,
        at.shape_id,
        at.headsign,
        MIN(st.departure_time) AS first_dep,
        MAX(st.arrival_time)   AS last_arr
      FROM active_trips at
      JOIN stop_times st ON st.trip_id = at.trip_id
      GROUP BY at.trip_id, at.shape_id, at.headsign
      HAVING MIN(st.departure_time) <= ${nowTime}::interval
         AND MAX(st.arrival_time)   >= ${nowTime}::interval
    ),
    current_segments AS (
      SELECT DISTINCT ON (tb.trip_id)
        tb.trip_id,
        tb.shape_id,
        tb.headsign,
        tb.first_dep,
        tb.last_arr,
        st1.stop_id AS from_stop_id,
        st2.stop_id AS to_stop_id,
        st1.departure_time AS dep_time,
        st2.arrival_time   AS arr_time
      FROM trip_bounds tb
      JOIN stop_times st1 ON st1.trip_id = tb.trip_id
        AND st1.departure_time <= ${nowTime}::interval
      JOIN stop_times st2 ON st2.trip_id = tb.trip_id
        AND st2.arrival_time   >  ${nowTime}::interval
        AND st2.stop_sequence  >  st1.stop_sequence
      ORDER BY tb.trip_id, st1.stop_sequence DESC, st2.stop_sequence ASC
    )
    SELECT
      cs.trip_id,
      cs.headsign,
      s1.name AS from_stop,
      s2.name AS to_stop,
      LEAST(GREATEST(
        EXTRACT(EPOCH FROM (${nowTime}::interval - cs.dep_time)) /
        NULLIF(EXTRACT(EPOCH FROM (cs.arr_time - cs.dep_time)), 0),
      0), 1) AS seg_fraction,
      CASE
        WHEN sh.geom IS NOT NULL THEN
          ST_AsText(ST_LineInterpolatePoint(
            sh.geom,
            LEAST(GREATEST(
              ST_LineLocatePoint(sh.geom, s1.location) +
              LEAST(GREATEST(
                EXTRACT(EPOCH FROM (${nowTime}::interval - cs.dep_time)) /
                NULLIF(EXTRACT(EPOCH FROM (cs.arr_time - cs.dep_time)), 0),
              0), 1) *
              (ST_LineLocatePoint(sh.geom, s2.location) -
               ST_LineLocatePoint(sh.geom, s1.location)),
            0), 1)
          ))
        ELSE
          ST_AsText(ST_LineInterpolatePoint(
            ST_MakeLine(s1.location, s2.location),
            LEAST(GREATEST(
              EXTRACT(EPOCH FROM (${nowTime}::interval - cs.dep_time)) /
              NULLIF(EXTRACT(EPOCH FROM (cs.arr_time - cs.dep_time)), 0),
            0), 1)
          ))
      END AS position_wkt,
      DEGREES(ST_Azimuth(s1.location, s2.location)) AS bearing,
      EXTRACT(EPOCH FROM cs.first_dep)::integer AS trip_start_sec,
      EXTRACT(EPOCH FROM cs.last_arr)::integer   AS trip_end_sec,
      EXTRACT(EPOCH FROM cs.arr_time)::integer   AS next_stop_arrival_sec
    FROM current_segments cs
    JOIN stops s1 ON s1.id = cs.from_stop_id
    JOIN stops s2 ON s2.id = cs.to_stop_id
    LEFT JOIN shapes sh ON sh.id = cs.shape_id
    WHERE cs.from_stop_id IS NOT NULL
  `)

  return rows.rows
    .filter((r) => r.position_wkt)
    .map((r) => ({
      tripId: r.trip_id,
      headsign: r.headsign ?? null,
      fromStop: r.from_stop,
      toStop: r.to_stop,
      bearing: parseFloat(r.bearing ?? '0'),
      segFraction: parseFloat(r.seg_fraction ?? '0'),
      positionWkt: r.position_wkt,
      tripStartSec: parseInt(r.trip_start_sec ?? '0', 10),
      tripEndSec: parseInt(r.trip_end_sec ?? '0', 10),
      nextStopArrivalSec: parseInt(r.next_stop_arrival_sec ?? '0', 10),
    }))
}

export async function getTripTimeline(tripId: string): Promise<TripStop[]> {
  const rows = await db.execute<{
    stop_id: string
    name: string
    arrival_sec: string
    departure_sec: string
    stop_sequence: string
  }>(sql`
    SELECT
      s.stop_id,
      s.name,
      EXTRACT(EPOCH FROM st.arrival_time)::integer   AS arrival_sec,
      EXTRACT(EPOCH FROM st.departure_time)::integer AS departure_sec,
      st.stop_sequence
    FROM stop_times st
    JOIN stops s ON s.id = st.stop_id
    WHERE st.trip_id = ${tripId}
    ORDER BY st.stop_sequence
  `)

  return rows.rows.map((r) => ({
    stopId: r.stop_id,
    name: r.name,
    arrivalSec: parseInt(r.arrival_sec, 10),
    departureSec: parseInt(r.departure_sec, 10),
    sequence: parseInt(r.stop_sequence, 10),
  }))
}
