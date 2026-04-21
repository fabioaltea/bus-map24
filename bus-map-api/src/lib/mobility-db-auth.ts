/**
 * MobilityDatabase OAuth2 token management.
 *
 * MobilityDatabase issues a long-lived refresh token on registration.
 * Access tokens are short-lived (3600 s). This module exchanges the refresh
 * token for an access token and caches it until 60 s before expiry.
 *
 * Usage:
 *   const token = await getMobilityDbAccessToken()
 *   // use as: Authorization: Bearer <token>
 */

const TOKEN_ENDPOINT = 'https://api.mobilitydatabase.org/v1/tokens/refresh'

/** Seconds before expiry at which we proactively refresh. */
const REFRESH_BUFFER_S = 60

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number // seconds
}

interface CachedToken {
  accessToken: string
  expiresAt: number // unix ms
}

let _cache: CachedToken | null = null

/**
 * Returns a valid access token, refreshing if needed.
 * Reads MOBILITY_DB_REFRESH_TOKEN from env.
 * Throws if the env var is missing or the refresh request fails.
 */
export async function getMobilityDbAccessToken(): Promise<string> {
  const now = Date.now()

  if (_cache && now < _cache.expiresAt - REFRESH_BUFFER_S * 1000) {
    return _cache.accessToken
  }

  const refreshToken = process.env.MOBILITY_DB_REFRESH_TOKEN
  if (!refreshToken) {
    throw new Error(
      'MOBILITY_DB_REFRESH_TOKEN env var not set. ' +
        'Obtain a refresh token from mobilitydatabase.org and add it to .env.',
    )
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '<unreadable>')
    throw new Error(
      `MobilityDatabase token refresh failed: ${res.status} ${res.statusText} — ${body}`,
    )
  }

  const data = (await res.json()) as TokenResponse

  _cache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  }

  return _cache.accessToken
}

/**
 * Invalidate the cached token (e.g. after a 401 from the API).
 * The next call to getMobilityDbAccessToken() will fetch a fresh one.
 */
export function invalidateMobilityDbToken(): void {
  _cache = null
}
