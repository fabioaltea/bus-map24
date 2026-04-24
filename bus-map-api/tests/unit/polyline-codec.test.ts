import { describe, it, expect } from 'vitest'
import { encodePolyline6, decodePolyline6 } from '../../src/lib/polyline-codec.js'

describe('encodePolyline6 / decodePolyline6', () => {
  it('round-trips a single coordinate within 1e-6 tolerance', () => {
    const coords: Array<[number, number]> = [[48.858844, 2.294351]]
    const decoded = decodePolyline6(encodePolyline6(coords))
    expect(decoded).toHaveLength(1)
    expect(decoded[0][0]).toBeCloseTo(coords[0][0], 6)
    expect(decoded[0][1]).toBeCloseTo(coords[0][1], 6)
  })

  it('returns "" for empty encode input', () => {
    expect(encodePolyline6([])).toBe('')
  })

  it('returns [] for empty decode input', () => {
    expect(decodePolyline6('')).toEqual([])
  })

  it('matches expected polyline6 output for a known coord pair', () => {
    const encoded = encodePolyline6([[0, 0], [1, 1]])
    const decoded = decodePolyline6(encoded)
    expect(decoded[0][0]).toBeCloseTo(0, 6)
    expect(decoded[0][1]).toBeCloseTo(0, 6)
    expect(decoded[1][0]).toBeCloseTo(1, 6)
    expect(decoded[1][1]).toBeCloseTo(1, 6)
    expect(encoded).toBe(encodePolyline6([[0, 0], [1, 1]]))
  })

  it('round-trips a multi-point route (≥5 points) within 1e-6 tolerance', () => {
    const route: Array<[number, number]> = [
      [51.5074, -0.1278],
      [51.5080, -0.1290],
      [51.5095, -0.1315],
      [51.5110, -0.1340],
      [51.5125, -0.1365],
    ]
    const decoded = decodePolyline6(encodePolyline6(route))
    expect(decoded).toHaveLength(route.length)
    for (let i = 0; i < route.length; i++) {
      expect(decoded[i][0]).toBeCloseTo(route[i][0], 6)
      expect(decoded[i][1]).toBeCloseTo(route[i][1], 6)
    }
  })

  it('round-trips signed (negative lat/lon) coordinates within 1e-6 tolerance', () => {
    const coords: Array<[number, number]> = [
      [-33.868820, 151.209296],
      [-34.928499, 138.600746],
      [-37.813628, 144.963058],
    ]
    const decoded = decodePolyline6(encodePolyline6(coords))
    expect(decoded).toHaveLength(coords.length)
    for (let i = 0; i < coords.length; i++) {
      expect(decoded[i][0]).toBeCloseTo(coords[i][0], 6)
      expect(decoded[i][1]).toBeCloseTo(coords[i][1], 6)
    }
  })
})
