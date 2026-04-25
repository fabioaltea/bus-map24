import { sql } from 'drizzle-orm'
import type { DrizzleDb } from '../db/client.js'

type IdMapperKind = 'stops' | 'routes' | 'trips' | 'services' | 'shapes' | 'agencies'

export class IdMapper {
  private readonly cache = new Map<string, number>()
  private readonly reverseCache = new Map<number, string>()

  constructor(
    private readonly db: DrizzleDb,
    private readonly feedId: string,
    private readonly kind: IdMapperKind,
  ) {}

  async getOrCreate(externalId: string): Promise<number> {
    const cached = this.cache.get(externalId)
    if (cached !== undefined) return cached

    const tableName = `feed_${this.kind}`
    const result = await this.db.execute<{ internal_id: number }>(sql`
      INSERT INTO ${sql.identifier(tableName)} (feed_id, external_id, internal_id)
      VALUES (
        ${this.feedId}::uuid,
        ${externalId},
        COALESCE(
          (SELECT MAX(internal_id) FROM ${sql.identifier(tableName)}
           WHERE feed_id = ${this.feedId}::uuid) + 1,
          1
        )
      )
      ON CONFLICT (feed_id, external_id) DO UPDATE
        SET external_id = EXCLUDED.external_id
      RETURNING internal_id
    `)

    const internalId = result.rows[0].internal_id
    this.cache.set(externalId, internalId)
    this.reverseCache.set(internalId, externalId)
    return internalId
  }

  /**
   * Bulk-upsert all externalIds in a single query and populate the in-memory cache.
   * Use before tight loops to avoid N round-trips.
   */
  async bulkGetOrCreate(externalIds: string[]): Promise<void> {
    const unknown = externalIds.filter((id) => !this.cache.has(id))
    if (unknown.length === 0) return

    const tableName = `feed_${this.kind}`
    const result = await this.db.execute<{ external_id: string; internal_id: number }>(sql`
      WITH ranked AS (
        SELECT
          unnest(${unknown}::text[]) AS external_id,
          COALESCE(
            (SELECT MAX(internal_id) FROM ${sql.identifier(tableName)}
             WHERE feed_id = ${this.feedId}::uuid),
            0
          ) + ROW_NUMBER() OVER () AS internal_id
      )
      INSERT INTO ${sql.identifier(tableName)} (feed_id, external_id, internal_id)
      SELECT ${this.feedId}::uuid, external_id, internal_id FROM ranked
      ON CONFLICT (feed_id, external_id) DO UPDATE
        SET external_id = EXCLUDED.external_id
      RETURNING external_id, internal_id
    `)

    for (const row of result.rows) {
      this.cache.set(row.external_id, row.internal_id)
      this.reverseCache.set(row.internal_id, row.external_id)
    }
  }

  async reverse(internalId: number): Promise<string | null> {
    const cached = this.reverseCache.get(internalId)
    if (cached !== undefined) return cached

    const tableName = `feed_${this.kind}`
    const result = await this.db.execute<{ external_id: string }>(sql`
      SELECT external_id
      FROM ${sql.identifier(tableName)}
      WHERE feed_id = ${this.feedId}::uuid
        AND internal_id = ${internalId}
      LIMIT 1
    `)

    if (result.rows.length === 0) return null

    const externalId = result.rows[0].external_id
    this.reverseCache.set(internalId, externalId)
    this.cache.set(externalId, internalId)
    return externalId
  }
}
