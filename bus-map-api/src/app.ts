import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import staticFiles from '@fastify/static'
import path from 'node:path'
import { Redis } from 'ioredis'
import { db } from './db/client.js'
import { sql } from 'drizzle-orm'

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  })

  const corsOriginEnv = process.env.CORS_ORIGIN
  await app.register(cors, {
    origin:
      corsOriginEnv === '*' || !corsOriginEnv
        ? true
        : corsOriginEnv.split(',').map((s) => s.trim()),
  })
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, context) => ({
      type: '/errors/rate-limited',
      title: 'Too Many Requests',
      status: 429,
      detail: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
    }),
  })

  // Serve pre-generated PMTiles and GeoJSON from the tiles output directory
  const tilesDir = path.resolve(process.env.PMTILES_OUTPUT_DIR ?? path.join(process.cwd(), 'tiles'))
  await app.register(staticFiles, { root: tilesDir, prefix: '/tiles/' })

  // RFC 7807 Problem Details error handler
  app.setErrorHandler((error, _request, reply) => {
    const status = error.statusCode ?? 500
    const type =
      status === 404
        ? '/errors/not-found'
        : status === 400
          ? '/errors/bad-request'
          : status === 429
            ? '/errors/rate-limited'
            : '/errors/internal'
    reply.status(status).send({
      type,
      title: error.name ?? 'Error',
      status,
      detail: error.message,
    })
  })

  // Route plugins
  const { default: agenciesRoutes } = await import('./routes/agencies.js')
  const { default: routesRoutes } = await import('./routes/routes.js')
  const { default: stopsRoutes } = await import('./routes/stops.js')
  const { default: departuresRoutes } = await import('./routes/departures.js')
  const { default: feedsRoutes } = await import('./routes/feeds.js')
  const { default: tripsRoutes } = await import('./routes/trips.js')

  await app.register(agenciesRoutes, { prefix: '/api' })
  await app.register(routesRoutes, { prefix: '/api' })
  await app.register(stopsRoutes, { prefix: '/api' })
  await app.register(departuresRoutes, { prefix: '/api' })
  await app.register(feedsRoutes, { prefix: '/api' })
  await app.register(tripsRoutes, { prefix: '/api' })

  app.get('/healthz', async (_req, reply) => {
    let dbStatus: 'ok' | 'error' = 'ok'
    let redisStatus: 'ok' | 'error' = 'ok'

    try {
      await db.execute(sql`SELECT 1`)
    } catch {
      dbStatus = 'error'
    }

    try {
      const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        lazyConnect: true,
      })
      await redis.ping()
      await redis.quit()
    } catch {
      redisStatus = 'error'
    }

    const status = dbStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'error'
    reply.status(status === 'ok' ? 200 : 503).send({ status, db: dbStatus, redis: redisStatus })
  })

  return app
}
