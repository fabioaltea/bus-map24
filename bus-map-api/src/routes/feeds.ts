import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { feedCatalogEntries } from '../db/schema.js'
import { desc } from 'drizzle-orm'

const plugin: FastifyPluginAsync = async (app) => {
  app.get('/feeds', async (_request, _reply) => {
    const rows = await db
      .select({
        id: feedCatalogEntries.id,
        mobilityDbId: feedCatalogEntries.mobilityDbId,
        provider: feedCatalogEntries.provider,
        countryCode: feedCatalogEntries.countryCode,
        importStatus: feedCatalogEntries.importStatus,
        pipelineVersion: feedCatalogEntries.pipelineVersion,
        lastImportedAt: feedCatalogEntries.lastImportedAt,
        lastCheckedAt: feedCatalogEntries.lastCheckedAt,
        errorMessage: feedCatalogEntries.errorMessage,
      })
      .from(feedCatalogEntries)
      .orderBy(desc(feedCatalogEntries.lastImportedAt))

    return { data: rows, total: rows.length }
  })
}

export default plugin
