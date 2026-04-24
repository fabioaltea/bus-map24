/**
 * T021 — SC-004: Re-import with same SHA completes ≤ 5 s and leaves row counts unchanged.
 *
 * Requires: live DB + a feed already imported via the compact pipeline.
 */

import { describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { db } from '../../src/db/client.js'
import { eq } from 'drizzle-orm'
import { feedCatalogEntries } from '../../src/db/schema.js'
import { runFeedDownload } from '../../src/jobs/feed-download.job.js'

describe('Idempotent re-import (SC-004)', () => {
  it('second import with same SHA short-circuits in ≤ 5 s and row counts unchanged', async () => {
    const [feed] = await db
      .select({ id: feedCatalogEntries.id, mobilityDbId: feedCatalogEntries.mobilityDbId, downloadUrl: feedCatalogEntries.downloadUrl })
      .from(feedCatalogEntries)
      .where(eq(feedCatalogEntries.importStatus, 'ready'))
      .limit(1)

    if (!feed) {
      console.warn('No ready feed found — skipping idempotency test')
      return
    }

    const countBefore = await db.execute<{ cnt: string }>(sql`
      SELECT COUNT(*)::text AS cnt FROM trips_compact WHERE feed_id = ${feed.id}::uuid
    `)

    const start = Date.now()
    await runFeedDownload({
      feedId: feed.id,
      mobilityDbId: feed.mobilityDbId,
      downloadUrl: feed.downloadUrl,
    })
    const elapsedMs = Date.now() - start

    expect(elapsedMs).toBeLessThanOrEqual(5000)

    const countAfter = await db.execute<{ cnt: string }>(sql`
      SELECT COUNT(*)::text AS cnt FROM trips_compact WHERE feed_id = ${feed.id}::uuid
    `)

    expect(countAfter.rows[0].cnt).toBe(countBefore.rows[0].cnt)
  })
})
