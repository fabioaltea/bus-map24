import type { FastifyPluginAsync } from 'fastify'
import { getTripTimeline } from '../services/live.service.js'

const plugin: FastifyPluginAsync = async (app) => {
  // ── GET /api/trips/:id/stops ────────────────────────────────────────────────
  app.get('/trips/:id/stops', async (request, _reply) => {
    const { id } = request.params as { id: string }
    const stops = await getTripTimeline(id)
    return { data: stops }
  })
}

export default plugin
