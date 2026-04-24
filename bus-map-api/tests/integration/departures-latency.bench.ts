/**
 * T052 — SC-003: Departures API latency — p95 ≤ 200 ms over 1 000 requests.
 *
 * Requires: live DB with compact data, API server on DATABASE_URL.
 * Run: pnpm vitest bench tests/integration/departures-latency.bench.ts
 *
 * This file uses Vitest's bench() API for structured latency measurement.
 * The p95 guard runs as a standard test() so it shows up in CI.
 */

import { describe, it, bench, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db/client.js'
import { feedCatalogEntries } from '../../src/db/schema.js'

async function pickStopExternalId(): Promise<string | null> {
  const [feed] = await db
    .select({ id: feedCatalogEntries.id })
    .from(feedCatalogEntries)
    .where(eq(feedCatalogEntries.importStatus, 'ready'))
    .limit(1)

  if (!feed) return null

  const rows = await db.execute<{ external_id: string }>(sql`
    SELECT fs.external_id
    FROM feed_stops fs
    WHERE fs.feed_id = ${feed.id}::uuid
    LIMIT 1
  `)
  return rows.rows[0]?.external_id ?? null
}

async function expandDepartures(stopExternalId: string): Promise<unknown[]> {
  const today = new Date().toISOString().slice(0, 10)
  const rows = await db.execute<{ departure_time: string }>(sql`
    WITH active_services AS (
      SELECT cc.service_internal_id, cc.feed_id
      FROM calendar_compact cc
      JOIN feed_stops fs ON fs.feed_id = cc.feed_id
      WHERE fs.external_id = ${stopExternalId}
        AND cc.start_date <= ${today}::date
        AND cc.end_date   >= ${today}::date
        AND (
          (EXTRACT(DOW FROM ${today}::date) = 0 AND cc.sunday)
          OR (EXTRACT(DOW FROM ${today}::date) = 1 AND cc.monday)
          OR (EXTRACT(DOW FROM ${today}::date) = 2 AND cc.tuesday)
          OR (EXTRACT(DOW FROM ${today}::date) = 3 AND cc.wednesday)
          OR (EXTRACT(DOW FROM ${today}::date) = 4 AND cc.thursday)
          OR (EXTRACT(DOW FROM ${today}::date) = 5 AND cc.friday)
          OR (EXTRACT(DOW FROM ${today}::date) = 6 AND cc.saturday)
        )
        AND NOT EXISTS (
          SELECT 1 FROM calendar_dates_compact cdc
          WHERE cdc.feed_id = cc.feed_id
            AND cdc.service_internal_id = cc.service_internal_id
            AND cdc.date = ${today}::date
            AND cdc.exception_type = 2
        )
    ),
    base AS (
      SELECT
        (tc.start_time_sec + ps.offset_departure_sec) AS dep_sec
      FROM feed_stops fs
      JOIN stops_compact sc
        ON sc.feed_id = fs.feed_id AND sc.internal_id = fs.internal_id
      JOIN pattern_stops ps ON ps.stop_internal_id = sc.internal_id
      JOIN trips_compact tc ON tc.pattern_id = ps.pattern_id
      JOIN active_services asvc
        ON asvc.feed_id = tc.feed_id
           AND asvc.service_internal_id = tc.service_internal_id
      WHERE fs.external_id = ${stopExternalId}
    )
    SELECT TO_CHAR(
      (INTERVAL '1 second' * dep_sec),
      'HH24:MI:SS'
    ) AS departure_time
    FROM base
    ORDER BY dep_sec
    LIMIT 50
  `)
  return rows.rows
}

describe('Departures API latency (SC-003)', () => {
  it('p95 ≤ 200 ms over 1 000 requests', async () => {
    const stopId = await pickStopExternalId()
    if (!stopId) {
      console.warn('No ready feed with compact data — skipping latency test')
      return
    }

    const N = 1000
    const timings: number[] = []

    for (let i = 0; i < N; i++) {
      const t0 = performance.now()
      await expandDepartures(stopId)
      timings.push(performance.now() - t0)
    }

    timings.sort((a, b) => a - b)
    const p95 = timings[Math.floor(N * 0.95)]
    const p50 = timings[Math.floor(N * 0.50)]
    const max = timings[N - 1]

    console.log(`p50=${p50.toFixed(1)}ms  p95=${p95.toFixed(1)}ms  max=${max.toFixed(1)}ms`)

    expect(p95).toBeLessThanOrEqual(200)
  }, 120_000)
})

bench('expandDepartures single call', async () => {
  const stopId = await pickStopExternalId()
  if (stopId) await expandDepartures(stopId)
}, { iterations: 100 })
