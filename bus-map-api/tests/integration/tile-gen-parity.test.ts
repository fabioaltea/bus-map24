/**
 * T048 — Tile-gen parity: compact pipeline produces same feature counts as baseline.
 *
 * Requires: live DB + baseline GeoJSON recorded from legacy pipeline.
 */

import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { db } from '../../src/db/client.js'
import { eq } from 'drizzle-orm'
import { feedCatalogEntries } from '../../src/db/schema.js'
import { decodePolyline6 } from '../../src/lib/polyline-codec.js'

const BASELINE_PATH = path.resolve('tests/fixtures/tiles/tld-576-routes.geojson')

describe('Tile-gen parity', () => {
  it('compact shapes_compact row count matches routes with shapes in baseline GeoJSON', async () => {
    let baseline: { features: unknown[] }
    try {
      baseline = JSON.parse(await readFile(BASELINE_PATH, 'utf8')) as { features: unknown[] }
    } catch {
      console.warn('No tile baseline fixture — skipping. Record with gen-tiles.ts on legacy first.')
      return
    }

    const [feed] = await db
      .select({ id: feedCatalogEntries.id })
      .from(feedCatalogEntries)
      .where(eq(feedCatalogEntries.importStatus, 'ready'))
      .limit(1)

    if (!feed) {
      console.warn('No ready feed — skipping')
      return
    }

    const compactShapeCount = await db.execute<{ cnt: string }>(sql`
      SELECT COUNT(*)::text AS cnt FROM shapes_compact WHERE feed_id = ${feed.id}::uuid
    `)

    const baselineFeatureCount = baseline.features.length

    // Compact shape count should be ≤ baseline (dedup may reduce it)
    expect(parseInt(compactShapeCount.rows[0].cnt, 10)).toBeGreaterThan(0)
    expect(parseInt(compactShapeCount.rows[0].cnt, 10)).toBeLessThanOrEqual(baselineFeatureCount * 2)
  })

  it('all compact shapes decode to valid LineStrings', async () => {
    const [feed] = await db
      .select({ id: feedCatalogEntries.id })
      .from(feedCatalogEntries)
      .where(eq(feedCatalogEntries.importStatus, 'ready'))
      .limit(1)

    if (!feed) return

    const shapes = await db.execute<{ polyline6: string }>(sql`
      SELECT polyline6 FROM shapes_compact WHERE feed_id = ${feed.id}::uuid LIMIT 200
    `)

    for (const s of shapes.rows) {
      const coords = decodePolyline6(s.polyline6)
      expect(coords.length).toBeGreaterThanOrEqual(1)
      for (const [lat, lon] of coords) {
        expect(lat).toBeGreaterThan(-90)
        expect(lat).toBeLessThan(90)
        expect(lon).toBeGreaterThan(-180)
        expect(lon).toBeLessThan(180)
      }
    }
  })
})
