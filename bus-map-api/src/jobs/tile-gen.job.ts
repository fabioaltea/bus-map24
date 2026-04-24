/**
 * Tile Generation Job
 * Sources shapes from shapes_compact (polyline6 → LineString) and
 * stops from stops_compact (lat_e6/lon_e6 → Point). Falls back to
 * legacy tables when compact data is absent.
 */

import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { decodePolyline6 } from '../lib/polyline-codec.js'
import type { TileGenJobData } from './queues.js'

const execFileAsync = promisify(execFile)
const TILES_DIR = path.resolve(process.env.PMTILES_OUTPUT_DIR ?? path.join(process.cwd(), 'tiles'))

// ── Route GeoJSON from compact tables ─────────────────────────────────────────

async function exportRoutesGeoJsonCompact(feedId: string): Promise<object> {
  const rows = await db.execute<{
    route_external_id: string
    short_name: string | null
    long_name: string | null
    color: string | null
    route_type: number
    polyline6: string | null
  }>(sql`
    SELECT
      fr.external_id AS route_external_id,
      rc.short_name,
      rc.long_name,
      rc.color,
      rc.route_type,
      (
        SELECT sc.polyline6
        FROM trips_compact tc
        JOIN shapes_compact sc ON sc.feed_id = tc.feed_id AND sc.internal_id = tc.shape_internal_id
        WHERE tc.feed_id = rc.feed_id AND tc.route_internal_id = rc.internal_id
          AND tc.shape_internal_id IS NOT NULL
        LIMIT 1
      ) AS polyline6
    FROM routes_compact rc
    JOIN feed_routes fr ON fr.feed_id = rc.feed_id AND fr.internal_id = rc.internal_id
    WHERE rc.feed_id = ${feedId}::uuid
  `)

  const features = rows.rows
    .filter((r) => r.polyline6)
    .map((row) => {
      const coords = decodePolyline6(row.polyline6!)
      const geometry = {
        type: 'LineString',
        coordinates: coords.map(([lat, lon]) => [lon, lat]),
      }
      return {
        type: 'Feature',
        geometry,
        properties: {
          route_id: row.route_external_id,
          short_name: row.short_name,
          long_name: row.long_name,
          color: row.color ? `#${row.color}` : '#AAAAAA',
          route_type: row.route_type,
        },
      }
    })

  return { type: 'FeatureCollection', features }
}

// ── Stop GeoJSON from compact tables ──────────────────────────────────────────

async function exportStopsGeoJsonCompact(feedId: string): Promise<object> {
  const rows = await db.execute<{
    stop_external_id: string
    name: string
    lat_e6: number
    lon_e6: number
  }>(sql`
    SELECT
      fs.external_id AS stop_external_id,
      sc.name,
      sc.lat_e6,
      sc.lon_e6
    FROM stops_compact sc
    JOIN feed_stops fs ON fs.feed_id = sc.feed_id AND fs.internal_id = sc.internal_id
    WHERE sc.feed_id = ${feedId}::uuid
  `)

  const features = rows.rows.map((row) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [row.lon_e6 / 1e6, row.lat_e6 / 1e6],
    },
    properties: {
      stop_id: row.stop_external_id,
      name: row.name,
      code: null,
    },
  }))

  return { type: 'FeatureCollection', features }
}

// ── Legacy fallbacks ──────────────────────────────────────────────────────────

async function exportRoutesGeoJsonLegacy(feedId: string): Promise<object> {
  const rows = await db.execute<{
    route_id: string
    short_name: string | null
    long_name: string | null
    color: string
    route_type: number
    geojson: string
  }>(sql`
    SELECT r.id AS route_id, r.short_name, r.long_name, r.color, r.route_type,
      ST_AsGeoJSON(r.shape_geom) AS geojson
    FROM routes r WHERE r.feed_id = ${feedId} AND r.shape_geom IS NOT NULL
  `)

  const features = rows.rows.map((row) => ({
    type: 'Feature',
    geometry: JSON.parse(row.geojson),
    properties: {
      route_id: row.route_id,
      short_name: row.short_name,
      long_name: row.long_name,
      color: row.color ? `#${row.color}` : '#AAAAAA',
      route_type: row.route_type,
    },
  }))
  return { type: 'FeatureCollection', features }
}

async function exportStopsGeoJsonLegacy(feedId: string): Promise<object> {
  const rows = await db.execute<{
    stop_id: string
    name: string
    code: string | null
    geojson: string
  }>(sql`
    SELECT s.id AS stop_id, s.name, s.code, ST_AsGeoJSON(s.location) AS geojson
    FROM stops s WHERE s.feed_id = ${feedId}
  `)

  const features = rows.rows.map((row) => ({
    type: 'Feature',
    geometry: JSON.parse(row.geojson),
    properties: { stop_id: row.stop_id, name: row.name, code: row.code },
  }))
  return { type: 'FeatureCollection', features }
}

// ── Detect compact data presence ──────────────────────────────────────────────

async function hasCompactData(feedId: string): Promise<boolean> {
  const r = await db.execute<{ cnt: string }>(sql`
    SELECT COUNT(*)::text AS cnt FROM stops_compact WHERE feed_id = ${feedId}::uuid LIMIT 1
  `)
  return parseInt(r.rows[0]?.cnt ?? '0', 10) > 0
}

// ── tippecanoe ────────────────────────────────────────────────────────────────

async function runTippecanoe(
  inputPath: string,
  outputPath: string,
  layer: string,
  minZoom: number,
  maxZoom: number,
): Promise<void> {
  await execFileAsync('tippecanoe', [
    '-o', outputPath,
    '-z', String(maxZoom),
    '-Z', String(minZoom),
    '-l', layer,
    '--force',
    '--no-progress-indicator',
    inputPath,
  ])
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runTileGen(data: TileGenJobData): Promise<void> {
  const { feedId, outputPath } = data
  const baseId = outputPath.replace(/\.pmtiles$/, '')

  await mkdir(TILES_DIR, { recursive: true })
  const tmp = path.join(tmpdir(), `tile-gen-${feedId}`)
  await mkdir(tmp, { recursive: true })

  try {
    const compact = await hasCompactData(feedId)
    console.log(`[tile-gen] ${baseId} — using ${compact ? 'compact' : 'legacy'} data source`)

    const routesGeoJson = compact
      ? await exportRoutesGeoJsonCompact(feedId)
      : await exportRoutesGeoJsonLegacy(feedId)

    const routesGeojsonPath = path.join(tmp, 'routes.geojson')
    await writeFile(routesGeojsonPath, JSON.stringify(routesGeoJson))
    const routesPmtilesPath = path.join(TILES_DIR, `${baseId}-routes.pmtiles`)
    await runTippecanoe(routesGeojsonPath, routesPmtilesPath, 'routes', 9, 16)
    console.log(`[tile-gen] ${baseId} — routes → ${routesPmtilesPath}`)

    const stopsGeoJson = compact
      ? await exportStopsGeoJsonCompact(feedId)
      : await exportStopsGeoJsonLegacy(feedId)

    const stopsGeojsonPath = path.join(tmp, 'stops.geojson')
    await writeFile(stopsGeojsonPath, JSON.stringify(stopsGeoJson))
    const stopsPmtilesPath = path.join(TILES_DIR, `${baseId}-stops.pmtiles`)
    await runTippecanoe(stopsGeojsonPath, stopsPmtilesPath, 'stops', 13, 22)
    console.log(`[tile-gen] ${baseId} — stops → ${stopsPmtilesPath}`)

    console.log(`[tile-gen] ${baseId} — tile generation complete ✓`)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}
