import { sql } from 'drizzle-orm'
import type { DrizzleDb } from '../db/client.js'

type IdMapperKind = 'stops' | 'routes' | 'trips' | 'services' | 'shapes' | 'agencies'

const BULK_CHUNK_SIZE = 5_000

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
   * Bulk-upsert all externalIds and populate the in-memory cache.
   * Processes in chunks of BULK_CHUNK_SIZE to keep query size bounded.
   */
  async bulkGetOrCreate(externalIds: string[]): Promise<void> {
    const unknown = [...new Set(externalIds.filter((id) => !this.cache.has(id)))]
    if (unknown.length === 0) return

    for (let i = 0; i < unknown.length; i += BULK_CHUNK_SIZE) {
      await this.#bulkChunk(unknown.slice(i, i + BULK_CHUNK_SIZE))
    }
  }

  async #bulkChunk(ids: string[]): Promise<void> {
    const tableName = `feed_${this.kind}`
    // Drizzle expands JS arrays into ($1,$2,...) row expressions — use sql.raw ARRAY literal.
    const arrayLiteral = `ARRAY[${ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')}]`

    // Only insert IDs not already in the table (EXCEPT), so the MAX+ROW_NUMBER range
    // never collides with existing internal_ids. ON CONFLICT DO NOTHING as safety net for races.
    await this.db.execute(sql`
      WITH
        new_ext AS (
          SELECT unnest(${sql.raw(arrayLiteral)}) AS external_id
          EXCEPT
          SELECT external_id FROM ${sql.identifier(tableName)}
          WHERE feed_id = ${this.feedId}::uuid
        ),
        max_id AS (
          SELECT COALESCE(MAX(internal_id), 0) AS m
          FROM ${sql.identifier(tableName)}
          WHERE feed_id = ${this.feedId}::uuid
        )
      INSERT INTO ${sql.identifier(tableName)} (feed_id, external_id, internal_id)
      SELECT ${this.feedId}::uuid, e.external_id, m.m + ROW_NUMBER() OVER ()
      FROM new_ext e, max_id m
      ON CONFLICT DO NOTHING
    `)

    // Fetch actual internal_ids (covers both new inserts and pre-existing rows)
    const result = await this.db.execute<{ external_id: string; internal_id: number }>(sql`
      SELECT external_id, internal_id
      FROM ${sql.identifier(tableName)}
      WHERE feed_id = ${this.feedId}::uuid
        AND external_id = ANY(${sql.raw(arrayLiteral)})
    `)

    for (const row of result.rows) {
      this.cache.set(row.external_id, Number(row.internal_id))
      this.reverseCache.set(Number(row.internal_id), row.external_id)
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
