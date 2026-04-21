import { http, HttpResponse } from 'msw'
import { generateDepartures } from '../fixtures/departures.js'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export const departureHandlers = [
  // GET /api/stops/:id/departures
  http.get(`${BASE}/api/stops/:id/departures`, ({ params, request }) => {
    const url = new URL(request.url)
    const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
    const departures = generateDepartures(String(params.id), date)
    return HttpResponse.json(departures)
  }),
]
