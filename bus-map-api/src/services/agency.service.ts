/**
 * B017 — Agency Service
 */

import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { makeEnvelope, type BBox } from '../lib/bbox.js'
import { decodePolyline6 } from '../lib/polyline-codec.js'

export interface AgencySummary {
  id: string
  name: string
  countryCode: string
  routeCount: number
  stopCount: number
  boundingBox: object | null
  feedId: string
  centroid: string | null   // "POINT(lng lat)"
  url: string | null
  timezone: string
  brandColor: string | null // hex without #
  logoUrl: string | null
  city: string | null
}

export interface AgencyDetail extends AgencySummary {
  url: string | null
  timezone: string
  lang: string | null
  phone: string | null
}

export interface RouteSummary {
  id: string
  routeId: string
  shortName: string | null
  longName: string | null
  routeType: number
  color: string
  textColor: string
  shapeGeom: string | null
  fromStop: string | null
  toStop: string | null
}

// ── getAgenciesInBbox ─────────────────────────────────────────────────────────

export async function getAgenciesInBbox(
  bbox: BBox,
  _zoom: number,
  limit: number,
  offset: number,
): Promise<{ data: AgencySummary[]; total: number }> {
  const envelope = makeEnvelope(bbox)

  // Check if any compact feeds exist — if yes, never fall back to legacy tables
  const hasCompact = await db.execute<{ one: number }>(sql`
    SELECT 1 AS one FROM agencies_compact ac
    JOIN feed_catalog_entries fce ON fce.id = ac.feed_id
    WHERE fce.import_status = 'ready' AND fce.pipeline_version = 2
    LIMIT 1
  `)
  const useCompact = hasCompact.rows.length > 0

  // Compact path: feeds ingested with pipeline_version = 2
  if (!useCompact) {
    // Legacy-only path (no compact feeds in DB)
    const rows = await db.execute<{
      id: string; name: string; country_code: string; route_count: number
      stop_count: number; bbox_geojson: string | null; feed_id: string
      centroid_wkt: string | null; url: string | null; timezone: string
      brand_color: string | null; logo_url: string | null; city: string | null
    }>(sql`
      SELECT a.id, a.name, fce.country_code, a.route_count, a.stop_count,
        ST_AsGeoJSON(a.bounding_box) AS bbox_geojson, a.feed_id,
        ST_AsText(ST_Centroid(a.bounding_box)) AS centroid_wkt,
        a.url, a.timezone, a.brand_color, a.logo_url, a.city
      FROM agencies a
      JOIN feed_catalog_entries fce ON fce.id = a.feed_id
      WHERE fce.import_status = 'ready'
        AND (a.bounding_box IS NULL OR ST_Intersects(a.bounding_box, ${envelope}))
      ORDER BY a.name LIMIT ${limit} OFFSET ${offset}
    `)
    const countRow = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count FROM agencies a
      JOIN feed_catalog_entries fce ON fce.id = a.feed_id
      WHERE fce.import_status = 'ready'
        AND (a.bounding_box IS NULL OR ST_Intersects(a.bounding_box, ${envelope}))
    `)
    return {
      data: rows.rows.map((r) => ({
        id: r.id, name: r.name, countryCode: r.country_code,
        routeCount: Number(r.route_count), stopCount: Number(r.stop_count),
        boundingBox: r.bbox_geojson ? JSON.parse(r.bbox_geojson) : null,
        feedId: r.feed_id, centroid: r.centroid_wkt ?? null, url: r.url ?? null,
        timezone: r.timezone ?? 'UTC', brandColor: r.brand_color ?? null,
        logoUrl: r.logo_url ?? null, city: r.city ?? null,
      })),
      total: parseInt(countRow.rows[0].count, 10),
    }
  }

  const compactRows = await db.execute<{
    id: string
    name: string
    country_code: string
    route_count: string
    feed_id: string
    bbox_geojson: string | null
    centroid_wkt: string | null
    url: string | null
    timezone: string
    brand_color: string | null
    logo_url: string | null
    city: string | null
    municipality: string | null
  }>(sql`
    SELECT
      fa.external_id AS id,
      ac.name,
      fce.country_code,
      COUNT(DISTINCT rc.internal_id)::text AS route_count,
      ac.feed_id,
      ST_AsGeoJSON(ST_Envelope(ac.coverage)) AS bbox_geojson,
      ST_AsText(ST_Centroid(ac.coverage))    AS centroid_wkt,
      ac.url,
      ac.tz AS timezone,
      ac.brand_color,
      ac.logo_url,
      ac.city,
      fce.municipality
    FROM agencies_compact ac
    JOIN feed_agencies fa
      ON fa.feed_id = ac.feed_id AND fa.internal_id = ac.internal_id
    JOIN feed_catalog_entries fce ON fce.id = ac.feed_id
    LEFT JOIN routes_compact rc
      ON rc.feed_id = ac.feed_id AND rc.agency_internal_id = ac.internal_id
    WHERE fce.import_status = 'ready'
      AND fce.pipeline_version = 2
      AND (ac.coverage IS NULL OR ST_Intersects(ac.coverage, ${envelope}))
    GROUP BY fa.external_id, ac.name, fce.country_code, ac.feed_id, ac.coverage, ac.url, ac.tz, ac.brand_color, ac.logo_url, ac.city, fce.municipality
    ORDER BY ac.name
    LIMIT ${limit} OFFSET ${offset}
  `)

  // useCompact = true here: always return compact results (empty array if bbox doesn't match)
  const countRow = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM agencies_compact ac
    JOIN feed_agencies fa
      ON fa.feed_id = ac.feed_id AND fa.internal_id = ac.internal_id
    JOIN feed_catalog_entries fce ON fce.id = ac.feed_id
    WHERE fce.import_status = 'ready'
      AND fce.pipeline_version = 2
      AND (ac.coverage IS NULL OR ST_Intersects(ac.coverage, ${envelope}))
  `)
  const data: AgencySummary[] = compactRows.rows.map((r) => ({
    id: r.id,
    name: r.name,
    countryCode: r.country_code ?? '',
    routeCount: parseInt(r.route_count, 10),
    stopCount: 0,
    boundingBox: r.bbox_geojson ? JSON.parse(r.bbox_geojson) : null,
    feedId: r.feed_id,
    centroid: r.centroid_wkt ?? null,
    url: r.url ?? null,
    timezone: r.timezone ?? 'UTC',
    brandColor: r.brand_color ?? null,
    logoUrl: r.logo_url ?? null,
    city: r.city ?? r.municipality ?? null,
  }))
  return { data, total: parseInt(countRow.rows[0].count, 10) }
}

// ── getAgencyById ─────────────────────────────────────────────────────────────

export async function getAgencyById(id: string): Promise<AgencyDetail | null> {
  const rows = await db.execute<{
    id: string
    name: string
    country_code: string
    route_count: string
    feed_id: string
    bbox_geojson: string | null
    centroid_wkt: string | null
    url: string | null
    timezone: string
    brand_color: string | null
    logo_url: string | null
    city: string | null
    municipality: string | null
  }>(sql`
    SELECT
      fa.external_id                         AS id,
      ac.name,
      fce.country_code,
      COUNT(DISTINCT rc.internal_id)::text   AS route_count,
      ac.feed_id,
      ST_AsGeoJSON(ST_Envelope(ac.coverage)) AS bbox_geojson,
      ST_AsText(ST_Centroid(ac.coverage))    AS centroid_wkt,
      ac.url,
      ac.tz AS timezone,
      ac.brand_color,
      ac.logo_url,
      ac.city,
      fce.municipality
    FROM agencies_compact ac
    JOIN feed_agencies fa
      ON fa.feed_id = ac.feed_id AND fa.internal_id = ac.internal_id
    JOIN feed_catalog_entries fce ON fce.id = ac.feed_id
    LEFT JOIN routes_compact rc
      ON rc.feed_id = ac.feed_id AND rc.agency_internal_id = ac.internal_id
    WHERE fa.external_id = ${id}
    GROUP BY fa.external_id, ac.name, fce.country_code, ac.feed_id, ac.coverage, ac.url, ac.tz, ac.brand_color, ac.logo_url, ac.city, fce.municipality
    LIMIT 1
  `)

  if (rows.rows.length === 0) return null
  const r = rows.rows[0]
  return {
    id: r.id,
    name: r.name,
    countryCode: r.country_code ?? '',
    routeCount: parseInt(r.route_count, 10),
    stopCount: 0,
    boundingBox: r.bbox_geojson ? JSON.parse(r.bbox_geojson) : null,
    feedId: r.feed_id,
    centroid: r.centroid_wkt ?? null,
    url: r.url ?? null,
    timezone: r.timezone ?? 'UTC',
    lang: null,
    phone: null,
    brandColor: r.brand_color ?? null,
    logoUrl: r.logo_url ?? null,
    city: r.city ?? r.municipality ?? null,
  }
}

// ── getStopsByRoute ───────────────────────────────────────────────────────────

export async function getStopsByRoute(
  routeId: string,
  limit: number,
): Promise<{ data: StopSummary[] }> {
  const rows = await db.execute<{
    id: string
    stop_id: string
    name: string
    location_wkt: string
  }>(sql`
    SELECT DISTINCT ON (sc.internal_id)
      fs.external_id                                         AS id,
      fs.external_id                                         AS stop_id,
      sc.name,
      ST_AsText(ST_SetSRID(ST_MakePoint(
        sc.lon_e6::double precision / 1e6,
        sc.lat_e6::double precision / 1e6
      ), 4326))                                              AS location_wkt
    FROM feed_routes fr
    JOIN routes_compact rc
      ON rc.feed_id = fr.feed_id AND rc.internal_id = fr.internal_id
    JOIN trips_compact tc
      ON tc.feed_id = rc.feed_id AND tc.route_internal_id = rc.internal_id
    JOIN pattern_stops ps ON ps.pattern_id = tc.pattern_id
    JOIN stops_compact sc
      ON sc.feed_id = tc.feed_id AND sc.internal_id = ps.stop_internal_id
    JOIN feed_stops fs
      ON fs.feed_id = sc.feed_id AND fs.internal_id = sc.internal_id
    WHERE fr.external_id = ${routeId}
    ORDER BY sc.internal_id
    LIMIT ${limit}
  `)

  return {
    data: rows.rows.map((r) => ({
      id: r.id,
      stopId: r.stop_id,
      name: r.name,
      location: r.location_wkt,
      locationType: 0,
    })),
  }
}

// ── getStopsByAgency ──────────────────────────────────────────────────────────

export interface StopSummary {
  id: string
  stopId: string
  name: string
  location: string
  locationType: number
}

export async function getStopsByAgency(
  agencyId: string,
  limit: number,
  offset: number,
): Promise<{ data: StopSummary[]; total: number }> {
  const rows = await db.execute<{
    id: string
    stop_id: string
    name: string
    location_wkt: string
  }>(sql`
    SELECT
      fs.external_id                                             AS id,
      fs.external_id                                             AS stop_id,
      sc.name,
      ST_AsText(ST_SetSRID(ST_MakePoint(
        sc.lon_e6::double precision / 1e6,
        sc.lat_e6::double precision / 1e6
      ), 4326))                                                  AS location_wkt
    FROM feed_agencies fa
    JOIN stops_compact sc ON sc.feed_id = fa.feed_id
    JOIN feed_stops fs
      ON fs.feed_id = sc.feed_id AND fs.internal_id = sc.internal_id
    WHERE fa.external_id = ${agencyId}
    ORDER BY sc.internal_id
    LIMIT ${limit} OFFSET ${offset}
  `)

  const countRow = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM feed_agencies fa
    JOIN stops_compact sc ON sc.feed_id = fa.feed_id
    WHERE fa.external_id = ${agencyId}
  `)

  const data: StopSummary[] = rows.rows.map((r) => ({
    id: r.id,
    stopId: r.stop_id,
    name: r.name,
    location: r.location_wkt,
    locationType: 0,
  }))

  return { data, total: parseInt(countRow.rows[0].count, 10) }
}

// ── getRoutesByAgency ─────────────────────────────────────────────────────────

export async function getRoutesByAgency(
  agencyId: string,
  limit: number,
  offset: number,
): Promise<{ data: RouteSummary[]; total: number }> {
  // Compact path: look up agency by external_id in feed_agencies
  const compactRows = await db.execute<{
    route_external_id: string
    short_name: string | null
    long_name: string | null
    route_type: number
    color: string | null
    text_color: string | null
    polyline6: string | null
    from_stop: string | null
    to_stop: string | null
    feed_id: string
    route_internal_id: number
  }>(sql`
    SELECT
      fr.external_id               AS route_external_id,
      rc.short_name,
      rc.long_name,
      rc.route_type,
      rc.color,
      rc.text_color,
      (
        SELECT sc.polyline6
        FROM trips_compact tc
        JOIN shapes_compact sc
          ON sc.feed_id = tc.feed_id AND sc.internal_id = tc.shape_internal_id
        WHERE tc.feed_id = rc.feed_id AND tc.route_internal_id = rc.internal_id
          AND tc.shape_internal_id IS NOT NULL
        LIMIT 1
      ) AS polyline6,
      (
        SELECT sc2.name
        FROM trips_compact tc2
        JOIN pattern_stops ps2 ON ps2.pattern_id = tc2.pattern_id
        JOIN stops_compact sc2
          ON sc2.feed_id = tc2.feed_id AND sc2.internal_id = ps2.stop_internal_id
        WHERE tc2.feed_id = rc.feed_id AND tc2.route_internal_id = rc.internal_id
        ORDER BY tc2.internal_id, ps2.seq ASC
        LIMIT 1
      ) AS from_stop,
      (
        SELECT sc3.name
        FROM trips_compact tc3
        JOIN pattern_stops ps3 ON ps3.pattern_id = tc3.pattern_id
        JOIN stops_compact sc3
          ON sc3.feed_id = tc3.feed_id AND sc3.internal_id = ps3.stop_internal_id
        WHERE tc3.feed_id = rc.feed_id AND tc3.route_internal_id = rc.internal_id
        ORDER BY tc3.internal_id, ps3.seq DESC
        LIMIT 1
      ) AS to_stop,
      rc.feed_id,
      rc.internal_id AS route_internal_id
    FROM feed_agencies fa
    JOIN agencies_compact ac
      ON ac.feed_id = fa.feed_id AND ac.internal_id = fa.internal_id
    JOIN routes_compact rc
      ON rc.feed_id = fa.feed_id AND rc.agency_internal_id = fa.internal_id
    JOIN feed_routes fr
      ON fr.feed_id = rc.feed_id AND fr.internal_id = rc.internal_id
    JOIN feed_catalog_entries fce ON fce.id = fa.feed_id
    WHERE fa.external_id = ${agencyId}
      AND fce.pipeline_version = 2
    ORDER BY rc.short_name
    LIMIT ${limit} OFFSET ${offset}
  `)

  if (compactRows.rows.length > 0) {
    const countRow = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count
      FROM feed_agencies fa
      JOIN routes_compact rc
        ON rc.feed_id = fa.feed_id AND rc.agency_internal_id = fa.internal_id
      JOIN feed_catalog_entries fce ON fce.id = fa.feed_id
      WHERE fa.external_id = ${agencyId} AND fce.pipeline_version = 2
    `)
    const data: RouteSummary[] = compactRows.rows.map((r) => {
      let shapeGeom: string | null = null
      if (r.polyline6) {
        const coords = decodePolyline6(r.polyline6)
        shapeGeom = JSON.stringify({
          type: 'MultiLineString',
          coordinates: [coords.map(([lat, lon]) => [lon, lat])],
        })
      }
      return {
        id: r.route_external_id,
        routeId: r.route_external_id,
        shortName: r.short_name ?? null,
        longName: r.long_name ?? null,
        routeType: Number(r.route_type),
        color: r.color ?? 'AAAAAA',
        textColor: r.text_color ?? 'FFFFFF',
        shapeGeom,
        fromStop: r.from_stop ?? null,
        toStop: r.to_stop ?? null,
      }
    })
    return { data, total: parseInt(countRow.rows[0].count, 10) }
  }

  // Legacy fallback
  const rows = await db.execute<{
    id: string
    route_id: string
    short_name: string | null
    long_name: string | null
    route_type: number
    color: string | null
    text_color: string | null
    shape_geom_json: string | null
    from_stop: string | null
    to_stop: string | null
  }>(sql`
    SELECT
      r.id,
      r.route_id,
      r.short_name,
      r.long_name,
      r.route_type,
      r.color,
      r.text_color,
      ST_AsGeoJSON(r.shape_geom) AS shape_geom_json,
      s_from.name AS from_stop,
      s_to.name   AS to_stop
    FROM routes r
    LEFT JOIN LATERAL (
      SELECT st.stop_id
      FROM trips t
      JOIN stop_times st ON st.trip_id = t.id
      WHERE t.route_id = r.id
      ORDER BY t.id, st.stop_sequence ASC
      LIMIT 1
    ) term_from ON true
    LEFT JOIN LATERAL (
      SELECT st.stop_id
      FROM trips t
      JOIN stop_times st ON st.trip_id = t.id
      WHERE t.route_id = r.id
      ORDER BY t.id, st.stop_sequence DESC
      LIMIT 1
    ) term_to ON true
    LEFT JOIN stops s_from ON s_from.id = term_from.stop_id
    LEFT JOIN stops s_to   ON s_to.id   = term_to.stop_id
    WHERE r.agency_id = ${agencyId}
    ORDER BY r.short_name
    LIMIT ${limit} OFFSET ${offset}
  `)

  const countRow = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count FROM routes WHERE agency_id = ${agencyId}
  `)

  const data: RouteSummary[] = rows.rows.map((r) => ({
    id: r.id,
    routeId: r.route_id,
    shortName: r.short_name,
    longName: r.long_name,
    routeType: Number(r.route_type),
    color: r.color ?? 'AAAAAA',
    textColor: r.text_color ?? 'FFFFFF',
    shapeGeom: r.shape_geom_json ?? null,
    fromStop: r.from_stop ?? null,
    toStop: r.to_stop ?? null,
  }))

  return { data, total: parseInt(countRow.rows[0].count, 10) }
}
