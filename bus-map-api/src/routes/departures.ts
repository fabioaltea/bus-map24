import type { FastifyPluginAsync } from 'fastify'
import { getStopDepartures } from '../services/stop.service.js'

const plugin: FastifyPluginAsync = async (app) => {
  app.get<{
    Params: { id: string }
    Querystring: { date?: string; limit?: string }
  }>('/stops/:id/departures', async (req, reply) => {
    const { date, limit } = req.query
    const today = new Date()
    const serviceDate = date ?? today.toISOString().slice(0, 10)
    const nowTime =
      date && date !== today.toISOString().slice(0, 10)
        ? '00:00:00'
        : `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}:${String(today.getSeconds()).padStart(2, '0')}`

    const departures = await getStopDepartures(
      req.params.id,
      serviceDate,
      nowTime,
      limit ? Math.min(parseInt(limit, 10), 100) : 30,
    )
    return reply.send(departures)
  })
}

export default plugin
