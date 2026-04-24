import type {
  AgencyFeature,
  RouteFeature,
  StopFeature,
  StopDetail,
  DepartureRow,
  LiveBusesResponse,
  TripStop,
  RouteScheduleResponse,
  PaginatedResponse,
} from '../types/api.js'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

async function fetchJson<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  const res = await fetch(url.toString())
  if (!res.ok) {
    const problem = await res.json().catch(() => ({ title: res.statusText }))
    throw Object.assign(new Error(problem.title ?? 'API error'), { status: res.status, problem })
  }
  return res.json() as Promise<T>
}

/** bbox = "swLat,swLng,neLat,neLng" */
export function fetchAgencies(bbox: string): Promise<PaginatedResponse<AgencyFeature>> {
  return fetchJson('/api/agencies', { bbox })
}

export function fetchAgencyRoutes(agencyId: string): Promise<PaginatedResponse<RouteFeature>> {
  return fetchJson(`/api/agencies/${agencyId}/routes`)
}

export function fetchAgencyStops(agencyId: string): Promise<PaginatedResponse<StopFeature>> {
  return fetchJson(`/api/agencies/${agencyId}/stops`)
}

export function fetchRouteStops(routeId: string): Promise<PaginatedResponse<StopFeature>> {
  return fetchJson(`/api/routes/${routeId}/stops`)
}

export function fetchRoutes(
  bbox: string,
  agencyId?: string,
): Promise<PaginatedResponse<RouteFeature>> {
  const params: Record<string, string> = { bbox }
  if (agencyId) params['agencyId'] = agencyId
  return fetchJson('/api/routes', params)
}

export function fetchStops(
  bbox: string,
  agencyId?: string,
): Promise<PaginatedResponse<StopFeature>> {
  const params: Record<string, string> = { bbox }
  if (agencyId) params['agencyId'] = agencyId
  return fetchJson('/api/stops', params)
}

export function fetchStop(id: string): Promise<StopDetail> {
  return fetchJson(`/api/stops/${id}`)
}

export function fetchDepartures(stopId: string, date: string): Promise<DepartureRow[]> {
  return fetchJson(`/api/stops/${stopId}/departures`, { date })
}

export function fetchRouteSchedule(routeId: string, date: string): Promise<RouteScheduleResponse> {
  return fetchJson(`/api/routes/${routeId}/schedule`, { date })
}

export function fetchLiveBuses(routeId: string, date: string, time?: string): Promise<LiveBusesResponse> {
  const params: Record<string, string> = { date }
  if (time) params.time = time
  return fetchJson(`/api/routes/${routeId}/live`, params)
}

export function fetchTripTimeline(tripId: string): Promise<{ data: TripStop[] }> {
  return fetchJson(`/api/trips/${tripId}/stops`)
}
