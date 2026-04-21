import { http, HttpResponse } from 'msw'
import { MOCK_AGENCIES } from '../fixtures/agencies.js'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

const MOCK_FEEDS = MOCK_AGENCIES.map((a, i) => ({
  id: `feed-${a.id}`,
  mobilityDbId: `mdb-${1000 + i}`,
  provider: a.name,
  countryCode: a.countryCode,
  importStatus: 'ready' as const,
  lastImportedAt: '2026-04-13T10:00:00Z',
  errorMessage: null,
}))

export const feedHandlers = [
  // GET /api/feeds
  http.get(`${BASE}/api/feeds`, ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const filtered = status ? MOCK_FEEDS.filter((f) => f.importStatus === status) : MOCK_FEEDS
    return HttpResponse.json({ data: filtered, total: filtered.length, limit: 50, offset: 0 })
  }),
]
