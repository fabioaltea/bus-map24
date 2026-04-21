/**
 * B021 — Tile Generation Job
 *
 * 1. Exports routes (with shape_geom) + stops as GeoJSON from PostgreSQL
 * 2. Runs tippecanoe to produce PMTiles archives
 * 3. Writes to PMTILES_OUTPUT_DIR
 */

import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import type { TileGenJobData } from './queues.js'

const execFileAsync = promisify(execFile)

const TILES_DIR = path.resolve(process.env.PMTILES_OUTPUT_DIR ?? path.join(process.cwd(), 'tiles'))

// ── GeoJSON export ────────────────────────────────────────────────────────────

async function exportRoutesGeoJson(feedId: string): Promise<object> {
  const rows = await db.execute<{
    route_id: string
    short_name: string | null
    long_name: string | null
    color: string
    route_type: number
    geojson: string
  }>(sql`
    SELECT
      r.id         AS route_id,
      r.short_name,
      r.long_name,
      r.color,
      r.route_type,
      ST_AsGeoJSON(r.shape_geom) AS geojson
    FROM routes r
    WHERE r.feed_id = ${feedId}
      AND r.shape_geom IS NOT NULL
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

async function exportStopsGeoJson(feedId: string): Promise<object> {
  const rows = await db.execute<{
    stop_id: string
    name: string
    code: string | null
    geojson: string
  }>(sql`
    SELECT
      s.id       AS stop_id,
      s.name,
      s.code,
      ST_AsGeoJSON(s.location) AS geojson
    FROM stops s
    WHERE s.feed_id = ${feedId}
  `)

  const features = rows.rows.map((row) => ({
    type: 'Feature',
    geometry: JSON.parse(row.geojson),
    properties: {
      stop_id: row.stop_id,
      name: row.name,
      code: row.code,
    },
  }))

  return { type: 'FeatureCollection', features }
}

// ── tippecanoe runner ─────────────────────────────────────────────────────────

async function runTippecanoe(
  inputPath: string,
  outputPath: string,
  layer: string,
  minZoom: number,
  maxZoom: number,
): Promise<void> {
  const args = [
    '-o', outputPath,
    '-z', String(maxZoom),
    '-Z', String(minZoom),
    '-l', layer,
    '--force',
    '--no-progress-indicator',
    inputPath,
  ]
  await execFileAsync('tippecanoe', args)
}

// ── Main processor ────────────────────────────────────────────────────────────

export async function runTileGen(data: TileGenJobData): Promise<void> {
  const { feedId, outputPath } = data
  const baseId = outputPath.replace(/\.pmtiles$/, '')

  await mkdir(TILES_DIR, { recursive: true })

  const tmp = path.join(tmpdir(), `tile-gen-${feedId}`)
  await mkdir(tmp, { recursive: true })

  try {
    // ── Routes ────────────────────────────────────────────────────────────────
    console.log(`[tile-gen] ${baseId} — exporting routes GeoJSON`)
    const routesGeoJson = await exportRoutesGeoJson(feedId)
    const routesGeojsonPath = path.join(tmp, 'routes.geojson')
    await writeFile(routesGeojsonPath, JSON.stringify(routesGeoJson))

    const routesPmtilesPath = path.join(TILES_DIR, `${baseId}-routes.pmtiles`)
    console.log(`[tile-gen] ${baseId} — running tippecanoe for routes`)
    await runTippecanoe(routesGeojsonPath, routesPmtilesPath, 'routes', 9, 16)
    console.log(`[tile-gen] ${baseId} — routes → ${routesPmtilesPath}`)

    // ── Stops ─────────────────────────────────────────────────────────────────
    console.log(`[tile-gen] ${baseId} — exporting stops GeoJSON`)
    const stopsGeoJson = await exportStopsGeoJson(feedId)
    const stopsGeojsonPath = path.join(tmp, 'stops.geojson')
    await writeFile(stopsGeojsonPath, JSON.stringify(stopsGeoJson))

    const stopsPmtilesPath = path.join(TILES_DIR, `${baseId}-stops.pmtiles`)
    console.log(`[tile-gen] ${baseId} — running tippecanoe for stops`)
    await runTippecanoe(stopsGeojsonPath, stopsPmtilesPath, 'stops', 13, 22)
    console.log(`[tile-gen] ${baseId} — stops → ${stopsPmtilesPath}`)

    console.log(`[tile-gen] ${baseId} — tile generation complete ✓`)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}
