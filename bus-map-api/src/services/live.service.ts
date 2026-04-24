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
  // nowTime expected as "HH:MM:SS", convert to seconds-from-midnight
  const [hh, mm, ss] = nowTime.split(':').map(Number)
  const nowSec = hh * 3600 + mm * 60 + (ss ?? 0)

  const rows = await db.execute<{
    trip_external_id: string
    headsign: string | null
    from_stop_name: string
    to_stop_name: string
    dep_sec: number
    arr_sec: number
    trip_start_sec: number
    trip_end_sec: number
    from_lat_e6: number
    from_lon_e6: number
    to_lat_e6: number
    to_lon_e6: number
  }>(sql`
    WITH active_services AS (
      SELECT cc.service_internal_id, cc.feed_id
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
      SELECT cdc2.service_internal_id, cdc2.feed_id
      FROM calendar_dates_compact cdc2
      JOIN feed_catalog_entries fce2 ON fce2.id = cdc2.feed_id
      JOIN feed_routes fr2 ON fr2.feed_id = fce2.id AND fr2.external_id = ${routeId}
      WHERE cdc2.date = ${date}::date AND cdc2.exception_type = 1
    ),
    active_trips AS (
      SELECT tc.internal_id AS trip_internal_id, tc.pattern_id,
             tc.start_time_sec, tc.headsign, tc.feed_id,
             ft.external_id AS trip_external_id,
             (tc.start_time_sec + sp.duration_sec) AS end_sec
      FROM feed_routes fr
      JOIN routes_compact rc ON rc.feed_id = fr.feed_id AND rc.internal_id = fr.internal_id
      JOIN trips_compact tc ON tc.feed_id = rc.feed_id AND tc.route_internal_id = rc.internal_id
      JOIN stop_patterns sp ON sp.pattern_id = tc.pattern_id
      JOIN feed_trips ft ON ft.feed_id = tc.feed_id AND ft.internal_id = tc.internal_id
      JOIN active_services asvc
        ON asvc.feed_id = tc.feed_id AND asvc.service_internal_id = tc.service_internal_id
      WHERE fr.external_id = ${routeId}
        AND tc.start_time_sec <= ${nowSec}
        AND (tc.start_time_sec + sp.duration_sec) >= ${nowSec}
    ),
    current_segments AS (
      SELECT DISTINCT ON (at.trip_internal_id)
        at.trip_external_id, at.headsign, at.start_time_sec, at.end_sec,
        ps1.stop_internal_id AS from_stop_internal,
        ps2.stop_internal_id AS to_stop_internal,
        (at.start_time_sec + ps1.offset_departure_sec) AS dep_sec,
        (at.start_time_sec + ps2.offset_arrival_sec)   AS arr_sec
      FROM active_trips at
      JOIN pattern_stops ps1 ON ps1.pattern_id = at.pattern_id
        AND (at.start_time_sec + ps1.offset_departure_sec) <= ${nowSec}
      JOIN pattern_stops ps2 ON ps2.pattern_id = at.pattern_id
        AND (at.start_time_sec + ps2.offset_arrival_sec) > ${nowSec}
        AND ps2.seq > ps1.seq
      ORDER BY at.trip_internal_id, ps1.seq DESC, ps2.seq ASC
    )
    SELECT
      cs.trip_external_id,
      cs.headsign,
      sc1.name  AS from_stop_name,
      sc2.name  AS to_stop_name,
      cs.dep_sec,
      cs.arr_sec,
      cs.start_time_sec AS trip_start_sec,
      cs.end_sec        AS trip_end_sec,
      sc1.lat_e6 AS from_lat_e6,
      sc1.lon_e6 AS from_lon_e6,
      sc2.lat_e6 AS to_lat_e6,
      sc2.lon_e6 AS to_lon_e6
    FROM current_segments cs
    JOIN stops_compact sc1
      ON sc1.feed_id = (SELECT feed_id FROM feed_routes WHERE external_id = ${routeId} LIMIT 1)
      AND sc1.internal_id = cs.from_stop_internal
    JOIN stops_compact sc2
      ON sc2.feed_id = sc1.feed_id
      AND sc2.internal_id = cs.to_stop_internal
  `)

  return rows.rows.map((r) => {
    const depSec  = Number(r.dep_sec)
    const arrSec  = Number(r.arr_sec)
    const elapsed = nowSec - depSec
    const segLen  = arrSec - depSec
    const frac    = segLen > 0 ? Math.min(Math.max(elapsed / segLen, 0), 1) : 0

    const fromLat = Number(r.from_lat_e6) / 1e6
    const fromLon = Number(r.from_lon_e6) / 1e6
    const toLat   = Number(r.to_lat_e6)   / 1e6
    const toLon   = Number(r.to_lon_e6)   / 1e6

    const lat = fromLat + (toLat - fromLat) * frac
    const lon = fromLon + (toLon - fromLon) * frac

    const bearingRad = Math.atan2(toLon - fromLon, toLat - fromLat)
    const bearing    = ((bearingRad * 180) / Math.PI + 360) % 360

    return {
      tripId: r.trip_external_id,
      headsign: r.headsign ?? null,
      fromStop: r.from_stop_name,
      toStop: r.to_stop_name,
      bearing,
      segFraction: frac,
      positionWkt: `POINT(${lon} ${lat})`,
      tripStartSec: Number(r.trip_start_sec),
      tripEndSec: Number(r.trip_end_sec),
      nextStopArrivalSec: Number(r.arr_sec),
    }
  })
}

export async function getTripTimeline(tripId: string): Promise<TripStop[]> {
  // Compact path: look up external trip_id in feed_trips
  const compactRows = await db.execute<{
    stop_id: string
    name: string
    arrival_sec: number
    departure_sec: number
    stop_sequence: number
  }>(sql`
    SELECT
      fs.external_id                                             AS stop_id,
      sc.name,
      (tc.start_time_sec + ps.offset_arrival_sec)::integer      AS arrival_sec,
      (tc.start_time_sec + ps.offset_departure_sec)::integer    AS departure_sec,
      ps.seq::integer                                           AS stop_sequence
    FROM feed_trips ft
    JOIN trips_compact tc
      ON tc.feed_id = ft.feed_id AND tc.internal_id = ft.internal_id
    JOIN pattern_stops ps ON ps.pattern_id = tc.pattern_id
    JOIN feed_stops fs
      ON fs.feed_id = ft.feed_id AND fs.internal_id = ps.stop_internal_id
    JOIN stops_compact sc
      ON sc.feed_id = ft.feed_id AND sc.internal_id = ps.stop_internal_id
    JOIN feed_catalog_entries fce ON fce.id = ft.feed_id
    WHERE ft.external_id = ${tripId}
      AND fce.pipeline_version = 2
    ORDER BY ps.seq
  `)

  if (compactRows.rows.length > 0) {
    return compactRows.rows.map((r) => ({
      stopId: r.stop_id,
      name: r.name,
      arrivalSec: Number(r.arrival_sec),
      departureSec: Number(r.departure_sec),
      sequence: Number(r.stop_sequence),
    }))
  }

  // Legacy fallback
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
