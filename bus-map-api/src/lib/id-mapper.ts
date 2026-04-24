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
