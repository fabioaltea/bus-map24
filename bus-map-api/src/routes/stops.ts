import type { FastifyPluginAsync } from 'fastify'
import { getStopById } from '../services/stop.service.js'

const plugin: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>('/stops/:id', async (req, reply) => {
    const stop = await getStopById(req.params.id)
    if (!stop) {
      return reply.status(404).send({
        type: '/errors/not-found',
        title: 'Stop not found',
        status: 404,
        detail: `No stop with id ${req.params.id}`,
      })
    }
    return stop
  })
}

export default plugin
