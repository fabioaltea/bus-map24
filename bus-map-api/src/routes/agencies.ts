import type { FastifyPluginAsync } from 'fastify'
import { parseBBox } from '../lib/bbox.js'
import {
  getAgenciesInBbox,
  getAgencyById,
  getRoutesByAgency,
  getStopsByAgency,
} from '../services/agency.service.js'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

const plugin: FastifyPluginAsync = async (app) => {
  // ── GET /api/agencies ───────────────────────────────────────────────────────
  app.get('/agencies', async (request, reply) => {
    const { bbox, zoom = '10', limit = String(DEFAULT_LIMIT), offset = '0' } =
      request.query as Record<string, string>

    if (!bbox) {
      return reply.status(400).send({
        type: '/errors/bad-request',
        title: 'Bad Request',
        status: 400,
        detail: 'Missing required query parameter: bbox',
      })
    }

    let parsedBbox
    try {
      parsedBbox = parseBBox(bbox)
    } catch (err) {
      return reply.status(400).send({
        type: '/errors/bad-request',
        title: 'Bad Request',
        status: 400,
        detail: err instanceof Error ? err.message : 'Invalid bbox',
      })
    }

    const lim = Math.min(parseInt(limit, 10) || DEFAULT_LIMIT, MAX_LIMIT)
    const off = parseInt(offset, 10) || 0
    const z = parseInt(zoom, 10) || 10

    const result = await getAgenciesInBbox(parsedBbox, z, lim, off)

    return { data: result.data, total: result.total, limit: lim, offset: off }
  })

  // ── GET /api/agencies/:id ───────────────────────────────────────────────────
  app.get('/agencies/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const agency = await getAgencyById(id)

    if (!agency) {
      return reply.status(404).send({
        type: '/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Agency ${id} not found`,
      })
    }

    return agency
  })

  // ── GET /api/agencies/:id/routes ────────────────────────────────────────────
  app.get('/agencies/:id/routes', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { limit = String(DEFAULT_LIMIT), offset = '0' } =
      request.query as Record<string, string>

    const agency = await getAgencyById(id)
    if (!agency) {
      return reply.status(404).send({
        type: '/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Agency ${id} not found`,
      })
    }

    const lim = Math.min(parseInt(limit, 10) || DEFAULT_LIMIT, MAX_LIMIT)
    const off = parseInt(offset, 10) || 0
    const result = await getRoutesByAgency(id, lim, off)

    return { data: result.data, total: result.total, limit: lim, offset: off }
  })

  // ── GET /api/agencies/:id/stops ─────────────────────────────────────────────
  app.get('/agencies/:id/stops', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { limit = '1000', offset = '0' } =
      request.query as Record<string, string>

    const agency = await getAgencyById(id)
    if (!agency) {
      return reply.status(404).send({
        type: '/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Agency ${id} not found`,
      })
    }

    const lim = Math.min(parseInt(limit, 10) || 1000, 2000)
    const off = parseInt(offset, 10) || 0
    const result = await getStopsByAgency(id, lim, off)

    return { data: result.data, total: result.total, limit: lim, offset: off }
  })
}

export default plugin
