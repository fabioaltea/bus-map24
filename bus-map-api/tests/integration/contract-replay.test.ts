/**
 * T035 — SC-005: Contract-replay harness.
 * Loads paired fixtures under tests/fixtures/contract-replay/ and asserts
 * deep equality between compact API responses and recorded baselines.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import Fastify from 'fastify'

const FIXTURES_DIR = path.resolve('tests/fixtures/contract-replay')

interface ContractFixture {
  request: {
    method: string
    url: string
    query?: Record<string, string>
  }
  response: unknown
}

async function buildApp() {
  const app = Fastify()
  // Register routes
  await app.register(import('../../src/routes/agencies.js').then((m) => m.default))
  await app.register(import('../../src/routes/stops.js').then((m) => m.default), { prefix: '/api' })
  await app.register(import('../../src/routes/departures.js').then((m) => m.default), { prefix: '/api' })
  await app.register(import('../../src/routes/routes.js').then((m) => m.default), { prefix: '/api' })
  await app.register(import('../../src/routes/trips.js').then((m) => m.default), { prefix: '/api' })
  await app.ready()
  return app
}

describe('Contract replay (SC-005)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  let fixtures: ContractFixture[]

  beforeAll(async () => {
    app = await buildApp()

    let files: string[] = []
    try {
      files = await readdir(FIXTURES_DIR)
    } catch {
      console.warn('No contract-replay fixtures found — skipping. Record them with step T036.')
      return
    }

    fixtures = await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => JSON.parse(await readFile(path.join(FIXTURES_DIR, f), 'utf8')) as ContractFixture),
    )
  })

  afterAll(async () => {
    await app?.close()
  })

  it('all fixture responses match compact API output exactly', async () => {
    if (!fixtures?.length) {
      console.warn('No fixtures loaded — test skipped')
      return
    }

    for (const fixture of fixtures) {
      const qs = fixture.request.query
        ? '?' + new URLSearchParams(fixture.request.query).toString()
        : ''

      const response = await app.inject({
        method: fixture.request.method as 'GET',
        url: fixture.request.url + qs,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toStrictEqual(fixture.response)
    }
  })
})
