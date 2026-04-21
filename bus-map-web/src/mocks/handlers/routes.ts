import { http, HttpResponse } from 'msw'
import { MOCK_ROUTES } from '../fixtures/routes.js'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export const routeHandlers = [
  // GET /api/routes/:id
  http.get(`${BASE}/api/routes/:id`, ({ params }) => {
    const route = MOCK_ROUTES.find((r) => r.id === params.id)
    if (!route) {
      return HttpResponse.json(
        { type: '/errors/not-found', title: 'Route not found', status: 404 },
        { status: 404 },
      )
    }
    return HttpResponse.json(route)
  }),
]
