import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { feedCatalogEntries, agenciesCompact } from '../../db/schema.js'
import { feedDownloadQueue } from '../../jobs/queues.js'
import { getMobilityDbAccessToken } from '../../lib/mobility-db-auth.js'
import { randomUUID } from 'node:crypto'

const MOBILITY_DB_API = 'https://api.mobilitydatabase.org/v1'

async function buildFeedItem(feed: typeof feedCatalogEntries.$inferSelect) {
  const agencyRows = await db
    .select({
      feedId: agenciesCompact.feedId,
      internalId: agenciesCompact.internalId,
      name: agenciesCompact.name,
      brandColor: agenciesCompact.brandColor,
      logoUrl: agenciesCompact.logoUrl,
      city: agenciesCompact.city,
    })
    .from(agenciesCompact)
    .where(eq(agenciesCompact.feedId, feed.id))

  const metadataComplete = agencyRows.length > 0 && agencyRows.every((a) => a.brandColor && a.city)

  return {
    id: feed.id,
    mobilityDbId: feed.mobilityDbId,
    provider: feed.provider,
    countryCode: feed.countryCode,
    municipality: feed.municipality,
    importStatus: feed.importStatus,
    lastImportedAt: feed.lastImportedAt?.toISOString() ?? null,
    metadataComplete,
    agencies: agencyRows.map((a) => ({
      id: `${a.feedId}:${a.internalId}`,
      name: a.name,
      brandColor: a.brandColor,
      logoUrl: a.logoUrl,
      city: a.city,
    })),
  }
}

async function adminAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.status(401).send({
      type: '/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: 'Invalid or missing token',
    })
  }
}

const feedsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', adminAuth)

  // GET /feeds
  app.get('/feeds', async (_req, reply) => {
    const rows = await db.select().from(feedCatalogEntries).orderBy(feedCatalogEntries.provider)
    const data = await Promise.all(rows.map(buildFeedItem))
    return reply.send({ data, total: data.length })
  })

  // GET /feeds/:id
  app.get<{ Params: { id: string } }>('/feeds/:id', async (request, reply) => {
    const [feed] = await db
      .select()
      .from(feedCatalogEntries)
      .where(eq(feedCatalogEntries.id, request.params.id))
      .limit(1)

    if (!feed) {
      return reply.status(404).send({
        type: '/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Feed ${request.params.id} not found`,
      })
    }

    return reply.send(await buildFeedItem(feed))
  })

  // POST /feeds
  app.post<{
    Body: { mobilityId: string } | { url: string; provider: string; countryCode: string }
  }>(
    '/feeds',
    {
      schema: {
        body: { type: 'object' },
      },
    },
    async (request, reply) => {
      const body = request.body as Record<string, string>

      if ('mobilityId' in body && body.mobilityId) {
        const mobilityId = body.mobilityId

        const existing = await db
          .select({ id: feedCatalogEntries.id })
          .from(feedCatalogEntries)
          .where(eq(feedCatalogEntries.mobilityDbId, mobilityId))
          .limit(1)

        if (existing.length > 0) {
          return reply.status(409).send({
            type: '/errors/conflict',
            title: 'Conflict',
            status: 409,
            detail: 'Feed already exists',
          })
        }

        const token = await getMobilityDbAccessToken()
        const res = await fetch(`${MOBILITY_DB_API}/gtfs_feeds/${mobilityId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          return reply.status(400).send({
            type: '/errors/bad-request',
            title: 'Bad Request',
            status: 400,
            detail: `MobilityDB feed ${mobilityId} not found`,
          })
        }

        const mdb = (await res.json()) as {
          provider: string
          locations: { country_code: string; municipality: string }[]
          latest_dataset: { hosted_url: string | null } | null
          source_info: { producer_url: string | null }
        }

        const downloadUrl = mdb.latest_dataset?.hosted_url ?? mdb.source_info?.producer_url
        if (!downloadUrl) {
          return reply.status(400).send({
            type: '/errors/bad-request',
            title: 'Bad Request',
            status: 400,
            detail: 'Feed has no downloadable URL',
          })
        }

        const [row] = await db
          .insert(feedCatalogEntries)
          .values({
            mobilityDbId: mobilityId,
            provider: mdb.provider,
            countryCode: mdb.locations?.[0]?.country_code ?? 'XX',
            municipality: mdb.locations?.[0]?.municipality ?? null,
            downloadUrl,
            importStatus: 'queued',
          })
          .returning({ id: feedCatalogEntries.id })

        await feedDownloadQueue.add('feed-download', {
          feedId: row.id,
          mobilityDbId: mobilityId,
          downloadUrl,
        })

        return reply.status(202).send({ feedId: row.id, status: 'queued' })
      }

      if ('url' in body && body.url && body.provider && body.countryCode) {
        const syntheticId = `custom-${randomUUID()}`

        const [row] = await db
          .insert(feedCatalogEntries)
          .values({
            mobilityDbId: syntheticId,
            provider: body.provider,
            countryCode: body.countryCode,
            downloadUrl: body.url,
            importStatus: 'queued',
          })
          .returning({ id: feedCatalogEntries.id })

        await feedDownloadQueue.add('feed-download', {
          feedId: row.id,
          mobilityDbId: syntheticId,
          downloadUrl: body.url,
        })

        return reply.status(202).send({ feedId: row.id, status: 'queued' })
      }

      return reply.status(400).send({
        type: '/errors/bad-request',
        title: 'Bad Request',
        status: 400,
        detail: 'Provide mobilityId OR url+provider+countryCode',
      })
    }
  )

  // PATCH /feeds/:id
  app.patch<{
    Params: { id: string }
    Body: { countryCode?: string; municipality?: string }
  }>(
    '/feeds/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            countryCode: { type: 'string', minLength: 2, maxLength: 2 },
            municipality: { type: 'string', maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const updates: Partial<typeof feedCatalogEntries.$inferInsert> = {}
      if (request.body.countryCode !== undefined) updates.countryCode = request.body.countryCode
      if (request.body.municipality !== undefined) updates.municipality = request.body.municipality

      const [updated] = await db
        .update(feedCatalogEntries)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(feedCatalogEntries.id, request.params.id))
        .returning()

      if (!updated) {
        return reply.status(404).send({
          type: '/errors/not-found',
          title: 'Not Found',
          status: 404,
          detail: `Feed ${request.params.id} not found`,
        })
      }

      return reply.send(await buildFeedItem(updated))
    }
  )

  // DELETE /feeds/:id
  app.delete<{ Params: { id: string } }>('/feeds/:id', async (request, reply) => {
    const [deleted] = await db
      .delete(feedCatalogEntries)
      .where(eq(feedCatalogEntries.id, request.params.id))
      .returning({ id: feedCatalogEntries.id })

    if (!deleted) {
      return reply.status(404).send({
        type: '/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Feed ${request.params.id} not found`,
      })
    }

    return reply.status(204).send()
  })

  // POST /feeds/:id/refresh
  app.post<{ Params: { id: string } }>('/feeds/:id/refresh', async (request, reply) => {
    const [feed] = await db
      .select()
      .from(feedCatalogEntries)
      .where(eq(feedCatalogEntries.id, request.params.id))
      .limit(1)

    if (!feed) {
      return reply.status(404).send({
        type: '/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Feed ${request.params.id} not found`,
      })
    }

    if (feed.importStatus === 'downloading') {
      return reply.status(409).send({
        type: '/errors/conflict',
        title: 'Conflict',
        status: 409,
        detail: 'Download already in progress',
      })
    }

    await db
      .update(feedCatalogEntries)
      .set({ importStatus: 'queued', updatedAt: new Date() })
      .where(eq(feedCatalogEntries.id, feed.id))

    await feedDownloadQueue.add('feed-download', {
      feedId: feed.id,
      mobilityDbId: feed.mobilityDbId,
      downloadUrl: feed.downloadUrl,
      forceRefresh: true,
    })

    return reply.status(202).send({ feedId: feed.id, status: 'queued' })
  })
}

export default feedsRoutes
