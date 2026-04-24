import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { agenciesCompact } from '../../db/schema.js'

// Agency ID format: "{feedId}:{internalId}"
function parseAgencyId(id: string): { feedId: string; internalId: number } | null {
  const colon = id.lastIndexOf(':')
  if (colon === -1) return null
  const feedId = id.slice(0, colon)
  const internalId = parseInt(id.slice(colon + 1), 10)
  if (isNaN(internalId)) return null
  return { feedId, internalId }
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

const agenciesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', adminAuth)

  app.patch<{
    Params: { id: string }
    Body: { brandColor?: string | null; logoUrl?: string | null; city?: string | null }
  }>(
    '/agencies/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            brandColor: { type: ['string', 'null'], pattern: '^[0-9A-Fa-f]{6}$' },
            logoUrl: { type: ['string', 'null'], maxLength: 2048 },
            city: { type: ['string', 'null'], maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = parseAgencyId(request.params.id)
      if (!parsed) {
        return reply.status(400).send({
          type: '/errors/bad-request',
          title: 'Bad Request',
          status: 400,
          detail: 'Invalid agency id format',
        })
      }

      const updates: Partial<typeof agenciesCompact.$inferInsert> = {}
      if ('brandColor' in request.body) updates.brandColor = request.body.brandColor ?? null
      if ('logoUrl' in request.body) updates.logoUrl = request.body.logoUrl ?? null
      if ('city' in request.body) updates.city = request.body.city ?? null

      const [updated] = await db
        .update(agenciesCompact)
        .set(updates)
        .where(
          and(
            eq(agenciesCompact.feedId, parsed.feedId),
            eq(agenciesCompact.internalId, parsed.internalId),
          ),
        )
        .returning({
          feedId: agenciesCompact.feedId,
          internalId: agenciesCompact.internalId,
          name: agenciesCompact.name,
          brandColor: agenciesCompact.brandColor,
          logoUrl: agenciesCompact.logoUrl,
          city: agenciesCompact.city,
        })

      if (!updated) {
        return reply.status(404).send({
          type: '/errors/not-found',
          title: 'Not Found',
          status: 404,
          detail: `Agency ${request.params.id} not found`,
        })
      }

      return reply.send({
        id: `${updated.feedId}:${updated.internalId}`,
        name: updated.name,
        brandColor: updated.brandColor,
        logoUrl: updated.logoUrl,
        city: updated.city,
      })
    },
  )
}

export default agenciesRoutes
