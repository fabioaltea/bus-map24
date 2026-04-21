import { ScatterplotLayer } from '@deck.gl/layers'
import type { StopFeature } from '../types/api.js'

/** Min zoom at which stop dots are rendered */
export const STOPS_MIN_ZOOM = 13

export interface StopPoint {
  id: string
  name: string
  coordinates: [number, number] // [lng, lat]
}

function parsePoint(wkt: string): [number, number] | null {
  // WKT format: "POINT(lng lat)"
  const m = wkt.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/)
  if (!m) return null
  return [parseFloat(m[1]), parseFloat(m[2])]
}

export function buildStopLayer(
  stops: StopFeature[],
  zoom: number,
  onPickStop: (id: string) => void,
) {
  if (zoom < STOPS_MIN_ZOOM) return null

  const points: StopPoint[] = stops
    .map((s) => {
      const coords = parsePoint(s.location)
      if (!coords) return null
      return { id: s.id, name: s.name, coordinates: coords }
    })
    .filter((p): p is StopPoint => p !== null)

  return new ScatterplotLayer<StopPoint>({
    id: 'stops-layer',
    data: points,
    pickable: true,
    radiusMinPixels: 3,
    radiusMaxPixels: 8,
    getPosition: (d) => d.coordinates,
    getFillColor: [255, 220, 50, 220],
    getRadius: 10,
    onClick: ({ object }) => {
      if (object) onPickStop(object.id)
    },
  })
}
