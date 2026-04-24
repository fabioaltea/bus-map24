import simplify from 'simplify-js'
import xxhash from 'xxhash-wasm'
import { encodePolyline6 } from './polyline-codec.js'

export interface SimplifiedShape {
  polyline6: string
  shapeHash: bigint
}

const SHAPE_HASH_SEED = 0x53484150n
const R = 6378137

function toMercator(lat: number, lon: number): [number, number] {
  const x = R * (lon * Math.PI / 180)
  const y = R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))
  return [x, y]
}

function fromMercator(x: number, y: number): [number, number] {
  const lon = (x / R) * (180 / Math.PI)
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI)
  return [lat, lon]
}

export async function simplifyAndHash(
  coords: Array<[number, number]>,
  toleranceMeters = 5.0,
): Promise<SimplifiedShape> {
  let simplified: Array<[number, number]>

  if (coords.length < 2) {
    simplified = coords.slice()
  } else {
    const mercatorPoints = coords.map(([lat, lon]) => {
      const [x, y] = toMercator(lat, lon)
      return { x, y }
    })

    const simplifiedMercator = simplify(mercatorPoints, toleranceMeters, true)

    simplified = simplifiedMercator.map(({ x, y }) => fromMercator(x, y))
  }

  const poly6 = encodePolyline6(simplified)

  const { h64 } = await xxhash()
  const raw = h64(poly6, SHAPE_HASH_SEED)
  // xxhash returns uint64; PostgreSQL bigint is signed int64 — convert via two's complement
  const shapeHash = raw > 9223372036854775807n ? raw - 18446744073709551616n : raw

  return { polyline6: poly6, shapeHash }
}
