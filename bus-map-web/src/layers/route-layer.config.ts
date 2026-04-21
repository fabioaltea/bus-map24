import { GeoJsonLayer } from '@deck.gl/layers'
import type { Feature, MultiLineString } from 'geojson'
import type { RouteFeature } from '../types/api.js'

/** Min zoom at which route lines are rendered */
export const ROUTES_MIN_ZOOM = 9

export function buildRouteLayer(routes: RouteFeature[], zoom: number) {
  if (zoom < ROUTES_MIN_ZOOM) return null

  const features: Feature<MultiLineString>[] = routes
    .filter((r) => r.shapeGeom != null)
    .map((r) => ({
      type: 'Feature',
      geometry: JSON.parse(r.shapeGeom!) as MultiLineString,
      properties: {
        id: r.id,
        shortName: r.shortName,
        longName: r.longName,
        color: r.color,
        routeType: r.routeType,
      },
    }))

  return new GeoJsonLayer({
    id: 'routes-layer',
    data: { type: 'FeatureCollection', features },
    pickable: true,
    stroked: false,
    filled: false,
    lineWidthMinPixels: 1,
    lineWidthMaxPixels: 4,
    getLineColor: (f: Feature) => hexToRgb(String(f.properties?.color ?? 'AAAAAA')),
    getLineWidth: 2,
  })
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
