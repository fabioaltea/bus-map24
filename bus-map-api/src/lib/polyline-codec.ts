import polyline from '@mapbox/polyline'

const PRECISION = 6

export function encodePolyline6(coords: Array<[number, number]>): string {
  if (coords.length === 0) return ''
  return polyline.encode(coords, PRECISION)
}

export function decodePolyline6(encoded: string): Array<[number, number]> {
  if (encoded === '') return []
  return polyline.decode(encoded, PRECISION) as Array<[number, number]>
}
