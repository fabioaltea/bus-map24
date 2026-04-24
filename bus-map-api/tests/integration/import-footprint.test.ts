/**
 * T020 — SC-001: Compact pipeline reduces DB footprint ≥ 70%.
 *
 * Requires: live DB with 0002_compact_storage.sql applied and fixture feed imported.
 * Run: pnpm test tests/integration/import-footprint.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { db } from '../../src/db/client.js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

interface BaselineReport {
  tables: Record<string, { totalBytes: number }>
  totalBytes: number
}

describe('Import footprint reduction (SC-001)', () => {
  let baseline: BaselineReport

  beforeAll(async () => {
    const baselinePath = path.resolve('tests/fixtures/baseline-tld-576-small.json')
    try {
      baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as BaselineReport
    } catch {
      throw new Error(
        'Baseline fixture missing. Run: pnpm tsx src/scripts/bench-footprint.ts ' +
        '--mobility-id tld-576 --output tests/fixtures/baseline-tld-576-small.json ' +
        'against the legacy pipeline first.',
      )
    }
  })

  it('compact tables total size is ≥ 70% smaller than legacy baseline', async () => {
    const compactTables = [
      'stops_compact', 'shapes_compact', 'routes_compact', 'agencies_compact',
      'stop_patterns', 'pattern_stops', 'trips_compact', 'frequencies_compact',
      'calendar_compact', 'calendar_dates_compact',
      'feed_stops', 'feed_routes', 'feed_trips', 'feed_services', 'feed_shapes', 'feed_agencies',
    ]

    let compactTotal = 0
    for (const tbl of compactTables) {
      const r = await db.execute<{ total_bytes: string }>(sql`
        SELECT pg_total_relation_size(${tbl}::regclass)::text AS total_bytes
      `)
      compactTotal += parseInt(r.rows[0]?.total_bytes ?? '0', 10)
    }

    const reduction = (baseline.totalBytes - compactTotal) / baseline.totalBytes
    expect(reduction).toBeGreaterThanOrEqual(0.70)
  })

  it('compact tables are not empty after import', async () => {
    const r = await db.execute<{ cnt: string }>(sql`
      SELECT COUNT(*)::text AS cnt FROM stops_compact
    `)
    expect(parseInt(r.rows[0].cnt, 10)).toBeGreaterThan(0)
  })
})
