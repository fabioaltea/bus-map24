const BASE = import.meta.env.VITE_API_URL ?? ''

export class AdminUnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'AdminUnauthorizedError'
  }
}

export async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('admin_token')
  const hasBody = options.body !== undefined
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (res.status === 401) throw new AdminUnauthorizedError()
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw Object.assign(new Error(body.detail ?? res.statusText), { status: res.status, body })
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export interface AdminFeedListItem {
  id: string
  mobilityDbId: string | null
  provider: string
  countryCode: string | null
  municipality: string | null
  importStatus: string
  lastImportedAt: string | null
  metadataComplete: boolean
  agencies: AdminAgency[]
}

export interface AdminAgency {
  id: string
  name: string
  brandColor: string | null
  logoUrl: string | null
  city: string | null
}

export interface AdminFeedListResponse {
  data: AdminFeedListItem[]
  total: number
}

export function getAdminFeeds() {
  return adminFetch<AdminFeedListResponse>('/api/admin/feeds')
}

export function getAdminFeed(id: string) {
  return adminFetch<AdminFeedListItem>(`/api/admin/feeds/${id}`)
}

export function postAdminFeed(body: { mobilityId: string } | { url: string; provider: string; countryCode: string }) {
  return adminFetch<{ feedId: string; status: string }>('/api/admin/feeds', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function patchAdminFeed(id: string, body: { countryCode?: string; municipality?: string }) {
  return adminFetch<AdminFeedListItem>(`/api/admin/feeds/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function refreshAdminFeed(id: string) {
  return adminFetch<{ feedId: string; status: string }>(`/api/admin/feeds/${id}/refresh`, {
    method: 'POST',
  })
}

export function deleteAdminFeed(id: string) {
  return adminFetch<void>(`/api/admin/feeds/${id}`, { method: 'DELETE' })
}

export function patchAdminAgency(
  id: string,
  body: { brandColor?: string | null; logoUrl?: string | null; city?: string | null },
) {
  return adminFetch<AdminAgency>(`/api/admin/agencies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}
