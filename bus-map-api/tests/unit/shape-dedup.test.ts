import { describe, it, expect } from 'vitest'
import { simplifyAndHash } from '../../src/lib/shape-dedup.js'
import { decodePolyline6 } from '../../src/lib/polyline-codec.js'

const R = 6378137

function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Min distance from a point to a line segment (all in degrees, approximate) */
function pointToSegmentMeters(
  pLat: number, pLon: number,
  aLat: number, aLon: number,
  bLat: number, bLon: number,
): number {
  // Treat as flat for short distances
  const dx = bLat - aLat
  const dy = bLon - aLon
  if (dx === 0 && dy === 0) return haversineMeters(pLat, pLon, aLat, aLon)
  const t = Math.max(0, Math.min(1, ((pLat - aLat) * dx + (pLon - aLon) * dy) / (dx * dx + dy * dy)))
  return haversineMeters(pLat, pLon, aLat + t * dx, aLon + t * dy)
}

function minDistToPolyline(
  pLat: number, pLon: number,
  polyline: Array<[number, number]>,
): number {
  let minDist = Infinity
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = pointToSegmentMeters(pLat, pLon, polyline[i][0], polyline[i][1], polyline[i + 1][0], polyline[i + 1][1])
    if (d < minDist) minDist = d
  }
  return minDist
}

describe('simplifyAndHash', () => {
  it('identical coords produce the same shapeHash', async () => {
    const coords: Array<[number, number]> = [
      [41.9, 12.4],
      [41.91, 12.41],
      [41.92, 12.42],
    ]
    const a = await simplifyAndHash(coords)
    const b = await simplifyAndHash(coords)
    expect(a.shapeHash).toBe(b.shapeHash)
    expect(a.polyline6).toBe(b.polyline6)
  })

  it('different coords produce different shapeHash', async () => {
    const coordsA: Array<[number, number]> = [[41.9, 12.4], [41.91, 12.41]]
    const coordsB: Array<[number, number]> = [[51.5, -0.1], [51.51, -0.11]]
    const a = await simplifyAndHash(coordsA)
    const b = await simplifyAndHash(coordsB)
    expect(a.shapeHash).not.toBe(b.shapeHash)
  })

  it('DP tolerance cuts point count on a straight line', async () => {
    // 100 collinear points — DP should reduce to 2
    const coords: Array<[number, number]> = Array.from({ length: 100 }, (_, i) => [
      41.9 + i * 0.0001,
      12.4 + i * 0.0001,
    ])
    const result = await simplifyAndHash(coords, 5.0)
    const decoded = decodePolyline6(result.polyline6)
    expect(decoded.length).toBeLessThan(coords.length)
    expect(decoded.length).toBeGreaterThanOrEqual(2)
  })

  it('Hausdorff distance ≤ 5.5 m for a curved route simplified with 5 m tolerance', async () => {
    // Slightly curved 20-point path (~1 km length)
    const coords: Array<[number, number]> = Array.from({ length: 20 }, (_, i) => [
      41.9 + i * 0.0005 + Math.sin(i * 0.3) * 0.00002,
      12.4 + i * 0.0005,
    ])
    const result = await simplifyAndHash(coords, 5.0)
    const simplified = decodePolyline6(result.polyline6)

    if (simplified.length < 2) return // trivial case — skip Hausdorff

    let maxDist = 0
    for (const [lat, lon] of coords) {
      const d = minDistToPolyline(lat, lon, simplified)
      if (d > maxDist) maxDist = d
    }
    expect(maxDist).toBeLessThanOrEqual(5.5)
  })

  it('single-point input handled without crash', async () => {
    const coords: Array<[number, number]> = [[41.9, 12.4]]
    const result = await simplifyAndHash(coords)
    expect(typeof result.shapeHash).toBe('bigint')
  })

  it('empty input handled without crash', async () => {
    const result = await simplifyAndHash([])
    expect(result.polyline6).toBe('')
    expect(typeof result.shapeHash).toBe('bigint')
  })
})
