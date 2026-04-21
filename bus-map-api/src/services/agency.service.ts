/**
 * B017 — Agency Service
 */

import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { makeEnvelope, type BBox } from '../lib/bbox.js'

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

  const rows = await db.execute<{
    id: string
    name: string
    country_code: string
    route_count: number
    stop_count: number
    bbox_geojson: string | null
    feed_id: string
    centroid_wkt: string | null
    url: string | null
    timezone: string
    brand_color: string | null
    logo_url: string | null
    city: string | null
  }>(sql`
    SELECT
      a.id,
      a.name,
      fce.country_code,
      a.route_count,
      a.stop_count,
      ST_AsGeoJSON(a.bounding_box) AS bbox_geojson,
      a.feed_id,
      ST_AsText(ST_Centroid(a.bounding_box)) AS centroid_wkt,
      a.url,
      a.timezone,
      a.brand_color,
      a.logo_url,
      a.city
    FROM agencies a
    JOIN feed_catalog_entries fce ON fce.id = a.feed_id
    WHERE fce.import_status = 'ready'
      AND (
        a.bounding_box IS NULL
        OR ST_Intersects(a.bounding_box, ${envelope})
      )
    ORDER BY a.name
    LIMIT ${limit} OFFSET ${offset}
  `)

  const countRow = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM agencies a
    JOIN feed_catalog_entries fce ON fce.id = a.feed_id
    WHERE fce.import_status = 'ready'
      AND (
        a.bounding_box IS NULL
        OR ST_Intersects(a.bounding_box, ${envelope})
      )
  `)

  const data: AgencySummary[] = rows.rows.map((r) => ({
    id: r.id,
    name: r.name,
    countryCode: r.country_code,
    routeCount: Number(r.route_count),
    stopCount: Number(r.stop_count),
    boundingBox: r.bbox_geojson ? JSON.parse(r.bbox_geojson) : null,
    feedId: r.feed_id,
    centroid: r.centroid_wkt ?? null,
    url: r.url ?? null,
    timezone: r.timezone ?? 'UTC',
    brandColor: r.brand_color ?? null,
    logoUrl: r.logo_url ?? null,
    city: r.city ?? null,
  }))

  return { data, total: parseInt(countRow.rows[0].count, 10) }
}

// ── getAgencyById ─────────────────────────────────────────────────────────────

export async function getAgencyById(id: string): Promise<AgencyDetail | null> {
  const rows = await db.execute<{
    id: string
    name: string
    country_code: string
    route_count: number
    stop_count: number
    bbox_geojson: string | null
    feed_id: string
    centroid_wkt: string | null
    url: string | null
    timezone: string
    lang: string | null
    phone: string | null
    brand_color: string | null
    logo_url: string | null
    city: string | null
  }>(sql`
    SELECT
      a.id,
      a.name,
      fce.country_code,
      a.route_count,
      a.stop_count,
      ST_AsGeoJSON(a.bounding_box) AS bbox_geojson,
      a.feed_id,
      ST_AsText(ST_Centroid(a.bounding_box)) AS centroid_wkt,
      a.url,
      a.timezone,
      a.lang,
      a.phone,
      a.brand_color,
      a.logo_url,
      a.city
    FROM agencies a
    JOIN feed_catalog_entries fce ON fce.id = a.feed_id
    WHERE a.id = ${id}
    LIMIT 1
  `)

  if (rows.rows.length === 0) return null
  const r = rows.rows[0]
  return {
    id: r.id,
    name: r.name,
    countryCode: r.country_code,
    routeCount: Number(r.route_count),
    stopCount: Number(r.stop_count),
    boundingBox: r.bbox_geojson ? JSON.parse(r.bbox_geojson) : null,
    feedId: r.feed_id,
    centroid: r.centroid_wkt ?? null,
    url: r.url,
    timezone: r.timezone ?? 'UTC',
    lang: r.lang,
    phone: r.phone,
    brandColor: r.brand_color ?? null,
    logoUrl: r.logo_url ?? null,
    city: r.city ?? null,
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
    location_type: number
  }>(sql`
    SELECT DISTINCT ON (s.id)
      s.id,
      s.stop_id,
      s.name,
      ST_AsText(s.location) AS location_wkt,
      s.location_type
    FROM stops s
    JOIN stop_times st ON st.stop_id = s.id
    JOIN trips t ON t.id = st.trip_id
    WHERE t.route_id = ${routeId}
      AND s.location_type = 0
    ORDER BY s.id
    LIMIT ${limit}
  `)

  return {
    data: rows.rows.map((r) => ({
      id: r.id,
      stopId: r.stop_id,
      name: r.name,
      location: r.location_wkt,
      locationType: Number(r.location_type),
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
    location_type: number
  }>(sql`
    SELECT
      s.id,
      s.stop_id,
      s.name,
      ST_AsText(s.location) AS location_wkt,
      s.location_type
    FROM stops s
    WHERE s.feed_id = (SELECT feed_id FROM agencies WHERE id = ${agencyId})
      AND s.location_type = 0
    ORDER BY s.id
    LIMIT ${limit} OFFSET ${offset}
  `)

  const countRow = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM stops s
    WHERE s.feed_id = (SELECT feed_id FROM agencies WHERE id = ${agencyId})
      AND s.location_type = 0
  `)

  const data: StopSummary[] = rows.rows.map((r) => ({
    id: r.id,
    stopId: r.stop_id,
    name: r.name,
    location: r.location_wkt,
    locationType: Number(r.location_type),
  }))

  return { data, total: parseInt(countRow.rows[0].count, 10) }
}

// ── getRoutesByAgency ─────────────────────────────────────────────────────────

export async function getRoutesByAgency(
  agencyId: string,
  limit: number,
  offset: number,
): Promise<{ data: RouteSummary[]; total: number }> {
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
