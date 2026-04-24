import { useEffect, useCallback } from 'react'
import type { Map, MapMouseEvent } from 'maplibre-gl'
import type { StopFeature } from '../../types/api.js'

const SOURCE_ID = 'stops-source'
const LAYER_ID = 'stops-circle'

interface Props {
  map: Map | null
  stops: StopFeature[]
  selectedStopId: string | null
  onStopClick: (id: string) => void
  color: string  // hex with #
}

function parseWktPoint(wkt: string): [number, number] | null {
  const m = wkt.match(/POINT\(([^ ]+) ([^ )]+)\)/)
  if (!m) return null
  return [parseFloat(m[1]), parseFloat(m[2])]
}

export default function StopLayer({ map, stops, selectedStopId, onStopClick, color }: Props) {
  // Click handler
  const handleClick = useCallback(
    (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const feature = e.features?.[0]
      if (feature?.properties?.id) {
        onStopClick(String(feature.properties.id))
      }
    },
    [onStopClick],
  )

  // Add/update source and layer
  useEffect(() => {
    if (!map || stops.length === 0) return

    const features: GeoJSON.Feature[] = stops
      .map((s) => {
        const coords = parseWktPoint(s.location)
        if (!coords) return null
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: coords },
          properties: { id: s.id, name: s.name, selected: s.id === selectedStopId, color },
        }
      })
      .filter((f) => f !== null) as GeoJSON.Feature[]

    const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }

    if (map.getSource(SOURCE_ID)) {
      ;(map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(geojson)
    } else {
      map.addSource(SOURCE_ID, { type: 'geojson', data: geojson })

      map.addLayer({
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': ['case', ['==', ['get', 'selected'], true], 8, 5],
          'circle-color': ['case', ['==', ['get', 'selected'], true], '#ffffff', ['get', 'color']],
          'circle-opacity': ['case', ['==', ['get', 'selected'], true], 1, 0.85],
          'circle-stroke-width': ['case', ['==', ['get', 'selected'], true], 2.5, 1.5],
          'circle-stroke-color': ['case', ['==', ['get', 'selected'], true], ['get', 'color'], '#000000'],
        },
      })

      map.on('click', LAYER_ID, handleClick as (e: MapMouseEvent) => void)
      map.on('mouseenter', LAYER_ID, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', LAYER_ID, () => { map.getCanvas().style.cursor = '' })
    }
  }, [map, stops, selectedStopId, handleClick, color])

  // Remove when stops become empty
  useEffect(() => {
    if (!map || stops.length > 0) return
    map.off('click', LAYER_ID, handleClick as (e: MapMouseEvent) => void)
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
  }, [map, stops.length, handleClick])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!map) return
      map.off('click', LAYER_ID, handleClick as (e: MapMouseEvent) => void)
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
    }
  }, [map, handleClick])

  return null
}
