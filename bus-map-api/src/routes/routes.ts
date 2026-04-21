import type { FastifyPluginAsync } from 'fastify'
import { getLiveBuses } from '../services/live.service.js'
import { getStopsByRoute } from '../services/agency.service.js'
import { getRouteSchedule } from '../services/schedule.service.js'

const plugin: FastifyPluginAsync = async (app) => {
  // ── GET /api/routes/:id/stops ───────────────────────────────────────────────
  app.get('/routes/:id/stops', async (request, _reply) => {
    const { id } = request.params as { id: string }
    const { limit = '500' } = request.query as Record<string, string>
    const lim = Math.min(parseInt(limit, 10) || 500, 1000)
    const result = await getStopsByRoute(id, lim)
    return { data: result.data, total: result.data.length }
  })

  // ── GET /api/routes/:id/schedule ───────────────────────────────────────────
  app.get('/routes/:id/schedule', async (request, _reply) => {
    const { id } = request.params as { id: string }
    const { date } = request.query as Record<string, string>
    const today = date ?? new Date().toISOString().slice(0, 10)
    const trips = await getRouteSchedule(id, today)
    return { trips, date: today }
  })

  // ── GET /api/routes/:id/live ────────────────────────────────────────────────
  app.get('/routes/:id/live', async (request, _reply) => {
    const { id } = request.params as { id: string }
    const { date, time } = request.query as Record<string, string>

    const today = date ?? new Date().toISOString().slice(0, 10)
    const now = time ?? new Date().toTimeString().slice(0, 8)

    const buses = await getLiveBuses(id, today, now)
    return { buses, generatedAt: new Date().toISOString() }
  })
}

export default plugin
