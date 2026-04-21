import { useEffect } from 'react'
import type { Map } from 'maplibre-gl'
import type { RouteFeature } from '../../types/api.js'

const SOURCE_ID = 'routes-source'
const LAYER_ID = 'routes-layer'

interface Props {
  map: Map | null
  routes: RouteFeature[]
}

export default function RouteLayer({ map, routes }: Props) {
  useEffect(() => {
    if (!map || routes.length === 0) return

    const features = routes.flatMap((r) => {
      if (!r.shapeGeom) return []
      try {
        const geom = JSON.parse(r.shapeGeom) as GeoJSON.MultiLineString
        return geom.coordinates.map((lineCoords) => ({
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: lineCoords },
          properties: {
            id: r.id,
            color: `#${r.color}`,
          },
        }))
      } catch {
        return []
      }
    })

    const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }

    if (map.getSource(SOURCE_ID)) {
      ;(map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(geojson)
    } else {
      map.addSource(SOURCE_ID, { type: 'geojson', data: geojson })

      map.addLayer({
        id: LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.5,
          'line-opacity': 0.85,
        },
      })
    }

  }, [map, routes])

  // Remove on unmount (or when map changes)
  useEffect(() => {
    return () => {
      if (!map) return
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
    }
  }, [map])

  return null
}
