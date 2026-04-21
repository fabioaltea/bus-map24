import { http, HttpResponse } from 'msw'
import { MOCK_AGENCIES } from '../fixtures/agencies.js'
import { MOCK_ROUTES } from '../fixtures/routes.js'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/** Rough bbox intersection: check if agency bbox string overlaps query bbox */
function agencyInBbox(
  agencyBbox: string | null,
  swLat: number, swLng: number, neLat: number, neLng: number,
): boolean {
  if (!agencyBbox) return true // show agencies without bbox always
  try {
    const poly = JSON.parse(agencyBbox) as { coordinates: number[][][] }
    const coords = poly.coordinates[0]
    const lngs = coords.map((c) => c[0])
    const lats = coords.map((c) => c[1])
    const aSwLng = Math.min(...lngs), aSwLat = Math.min(...lats)
    const aNeLng = Math.max(...lngs), aNeLat = Math.max(...lats)
    // Overlaps if not completely outside
    return !(neLat < aSwLat || swLat > aNeLat || neLng < aSwLng || swLng > aNeLng)
  } catch {
    return true
  }
}

export const agencyHandlers = [
  // GET /api/agencies
  http.get(`${BASE}/api/agencies`, ({ request }) => {
    const url = new URL(request.url)
    const bbox = url.searchParams.get('bbox') ?? ''
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

    let filtered = MOCK_AGENCIES
    if (bbox) {
      const parts = bbox.split(',').map(Number)
      if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
        const [swLat, swLng, neLat, neLng] = parts
        filtered = MOCK_AGENCIES.filter((a) =>
          agencyInBbox(a.boundingBox, swLat, swLng, neLat, neLng),
        )
      }
    }

    const page = filtered.slice(offset, offset + limit)
    return HttpResponse.json({
      data: page,
      total: filtered.length,
      limit,
      offset,
    })
  }),

  // GET /api/agencies/:id
  http.get(`${BASE}/api/agencies/:id`, ({ params }) => {
    const agency = MOCK_AGENCIES.find((a) => a.id === params.id)
    if (!agency) {
      return HttpResponse.json(
        { type: '/errors/not-found', title: 'Agency not found', status: 404 },
        { status: 404 },
      )
    }
    return HttpResponse.json(agency)
  }),

  // GET /api/agencies/:id/routes
  http.get(`${BASE}/api/agencies/:id/routes`, ({ params, request }) => {
    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

    const routes = MOCK_ROUTES.filter((r) => r.agencyId === params.id)
    const page = routes.slice(offset, offset + limit)
    return HttpResponse.json({ data: page, total: routes.length, limit, offset })
  }),
]
