import { sql } from 'drizzle-orm'

export interface BBox {
  swLat: number
  swLng: number
  neLat: number
  neLng: number
}

export function parseBBox(raw: string): BBox {
  const parts = raw.split(',').map(Number)
  if (parts.length !== 4 || parts.some(isNaN)) {
    throw new Error('bbox must be "swLat,swLng,neLat,neLng"')
  }
  const [swLat, swLng, neLat, neLng] = parts
  if (swLat < -90 || swLat > 90 || neLat < -90 || neLat > 90) {
    throw new Error('latitude out of range [-90, 90]')
  }
  if (swLng < -180 || swLng > 180 || neLng < -180 || neLng > 180) {
    throw new Error('longitude out of range [-180, 180]')
  }
  if (swLat >= neLat) {
    throw new Error('swLat must be less than neLat')
  }
  return { swLat, swLng, neLat, neLng }
}

/** Returns a Drizzle SQL fragment: ST_MakeEnvelope(xmin, ymin, xmax, ymax, 4326) */
export function makeEnvelope(bbox: BBox) {
  return sql`ST_MakeEnvelope(${bbox.swLng}, ${bbox.swLat}, ${bbox.neLng}, ${bbox.neLat}, 4326)`
}
