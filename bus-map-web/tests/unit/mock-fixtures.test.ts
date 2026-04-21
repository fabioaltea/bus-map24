import { describe, it, expect } from 'vitest'
import { MOCK_AGENCIES } from '../../src/mocks/fixtures/agencies.js'
import { MOCK_ROUTES } from '../../src/mocks/fixtures/routes.js'
import { MOCK_STOPS, stopCoords } from '../../src/mocks/fixtures/stops.js'
import { generateDepartures } from '../../src/mocks/fixtures/departures.js'

// ── Agencies ─────────────────────────────────────────────────────────────────

describe('MOCK_AGENCIES', () => {
  it('has 5 entries', () => {
    expect(MOCK_AGENCIES).toHaveLength(5)
  })

  it('each agency has required fields', () => {
    for (const a of MOCK_AGENCIES) {
      expect(a.id).toBeTruthy()
      expect(a.name).toBeTruthy()
      expect(a.countryCode).toMatch(/^[A-Z]{2}$/)
      expect(a.routeCount).toBeGreaterThan(0)
      expect(a.stopCount).toBeGreaterThan(0)
    }
  })

  it('bounding boxes are valid GeoJSON Polygons', () => {
    for (const a of MOCK_AGENCIES) {
      expect(a.boundingBox).toBeTruthy()
      const poly = JSON.parse(a.boundingBox!)
      expect(poly.type).toBe('Polygon')
      expect(poly.coordinates).toHaveLength(1)
      expect(poly.coordinates[0]).toHaveLength(5) // closed ring
    }
  })
})

// ── Routes ───────────────────────────────────────────────────────────────────

describe('MOCK_ROUTES', () => {
  it('has 10 entries', () => {
    expect(MOCK_ROUTES).toHaveLength(10)
  })

  it('each route has a valid shapeGeom MultiLineString', () => {
    for (const r of MOCK_ROUTES) {
      expect(r.id).toBeTruthy()
      expect(r.agencyId).toBeTruthy()
      expect(r.color).toMatch(/^[0-9A-Fa-f]{6}$/)
      const geom = JSON.parse(r.shapeGeom!)
      expect(geom.type).toBe('MultiLineString')
      expect(geom.coordinates).toHaveLength(1)
      expect(geom.coordinates[0].length).toBeGreaterThanOrEqual(2)
    }
  })

  it('all agencyIds reference existing agencies', () => {
    const agencyIds = new Set(MOCK_AGENCIES.map((a) => a.id))
    for (const r of MOCK_ROUTES) {
      expect(agencyIds.has(r.agencyId)).toBe(true)
    }
  })

  it('each agency has at least 1 route', () => {
    for (const agency of MOCK_AGENCIES) {
      const count = MOCK_ROUTES.filter((r) => r.agencyId === agency.id).length
      expect(count).toBeGreaterThanOrEqual(1)
    }
  })
})

// ── Stops ────────────────────────────────────────────────────────────────────

describe('MOCK_STOPS', () => {
  it('has at least 40 entries', () => {
    expect(MOCK_STOPS.length).toBeGreaterThanOrEqual(40)
  })

  it('each stop has a valid WKT Point location', () => {
    for (const s of MOCK_STOPS) {
      expect(s.location).toMatch(/^POINT\(/)
      const coords = stopCoords(s)
      const [lng, lat] = coords
      expect(lng).toBeGreaterThanOrEqual(-180)
      expect(lng).toBeLessThanOrEqual(180)
      expect(lat).toBeGreaterThanOrEqual(-90)
      expect(lat).toBeLessThanOrEqual(90)
    }
  })

  it('each stop has unique id', () => {
    const ids = MOCK_STOPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ── stopCoords ────────────────────────────────────────────────────────────────

describe('stopCoords', () => {
  it('parses WKT POINT correctly', () => {
    const stop = MOCK_STOPS.find((s) => s.id === 'stop-tfl-1')!
    const [lng, lat] = stopCoords(stop)
    expect(lng).toBeCloseTo(-0.1246, 3)
    expect(lat).toBeCloseTo(51.5014, 3)
  })
})

// ── generateDepartures ────────────────────────────────────────────────────────

describe('generateDepartures', () => {
  const TODAY = '2026-04-14'

  it('returns departures for a known stop', () => {
    const deps = generateDepartures('stop-tfl-1', TODAY)
    expect(deps.length).toBeGreaterThan(0)
  })

  it('returns empty array for unknown stop', () => {
    const deps = generateDepartures('stop-unknown-xyz', TODAY)
    expect(deps).toHaveLength(0)
  })

  it('departure times are in HH:MM:SS format', () => {
    const deps = generateDepartures('stop-atac-1', TODAY)
    for (const d of deps) {
      expect(d.departureTime).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    }
  })

  it('departure times are sorted ascending', () => {
    const deps = generateDepartures('stop-mta-1', TODAY)
    for (let i = 1; i < deps.length; i++) {
      expect(deps[i].departureTime >= deps[i - 1].departureTime).toBe(true)
    }
  })

  it('each departure has routeShortName and serviceDate', () => {
    const deps = generateDepartures('stop-bvg-1', TODAY)
    for (const d of deps) {
      expect(d.routeShortName).toBeTruthy()
      expect(d.serviceDate).toBe(TODAY)
    }
  })
})
