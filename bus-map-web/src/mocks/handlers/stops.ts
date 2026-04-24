import { http, HttpResponse } from 'msw'
import { MOCK_STOPS, stopCoords } from '../fixtures/stops.js'
import { MOCK_ROUTES } from '../fixtures/routes.js'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export const stopHandlers = [
  // GET /api/stops
  http.get(`${BASE}/api/stops`, ({ request }) => {
    const url = new URL(request.url)
    const bbox = url.searchParams.get('bbox') ?? ''
    const agencyId = url.searchParams.get('agencyId')
    const limit = parseInt(url.searchParams.get('limit') ?? '500', 10)
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

    let filtered = MOCK_STOPS

    if (bbox) {
      const parts = bbox.split(',').map(Number)
      if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
        const [swLat, swLng, neLat, neLng] = parts
        filtered = filtered.filter((s) => {
          const [lng, lat] = stopCoords(s)
          return lat >= swLat && lat <= neLat && lng >= swLng && lng <= neLng
        })
      }
    }

    if (agencyId) {
      // Filter by agency prefix encoded in stop id
      const agencyPrefix = agencyId.replace('agency-', '')
      filtered = filtered.filter((s) => s.id.includes(agencyPrefix))
    }

    const page = filtered.slice(offset, offset + limit)
    return HttpResponse.json({ data: page, total: filtered.length, limit, offset })
  }),

  // GET /api/stops/:id
  http.get(`${BASE}/api/stops/:id`, ({ params }) => {
    const stop = MOCK_STOPS.find((s) => s.id === params.id)
    if (!stop) {
      return HttpResponse.json(
        { type: '/errors/not-found', title: 'Stop not found', status: 404 },
        { status: 404 },
      )
    }

    // Find serving routes for this stop (by agency prefix)
    const agencyPrefix = stop.id.split('-')[1]
    const servingRoutes = MOCK_ROUTES.filter((r) => r.agencyId.includes(agencyPrefix))

    return HttpResponse.json({
      ...stop,
      code: null,
      description: null,
      wheelchairBoarding: 0,
      routes: servingRoutes.map((r) => ({
        id: r.id,
        shortName: r.shortName,
        longName: r.longName,
        color: r.color,
      })),
    })
  }),
]
