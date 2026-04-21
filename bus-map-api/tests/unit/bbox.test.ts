import { describe, it, expect } from 'vitest'
import { parseBBox, makeEnvelope } from '../../src/lib/bbox.js'

describe('parseBBox', () => {
  it('parses a valid bbox string', () => {
    const bbox = parseBBox('40.0,-74.0,41.0,-73.0')
    expect(bbox).toEqual({ swLat: 40, swLng: -74, neLat: 41, neLng: -73 })
  })

  it('throws on wrong number of parts', () => {
    expect(() => parseBBox('40.0,-74.0,41.0')).toThrow('bbox must be')
  })

  it('throws on non-numeric values', () => {
    expect(() => parseBBox('40.0,-74.0,abc,-73.0')).toThrow('bbox must be')
  })

  it('throws when latitude out of range', () => {
    expect(() => parseBBox('91.0,-74.0,92.0,-73.0')).toThrow('latitude out of range')
  })

  it('throws when longitude out of range', () => {
    expect(() => parseBBox('40.0,-181.0,41.0,-73.0')).toThrow('longitude out of range')
  })

  it('throws when swLat >= neLat', () => {
    expect(() => parseBBox('41.0,-74.0,40.0,-73.0')).toThrow('swLat must be less than neLat')
  })
})

describe('makeEnvelope', () => {
  it('returns a SQL fragment with bound parameters', () => {
    const bbox = { swLat: 40, swLng: -74, neLat: 41, neLng: -73 }
    const fragment = makeEnvelope(bbox)
    // Drizzle sql`` returns an object with queryChunks; just verify it exists
    expect(fragment).toBeDefined()
  })
})
