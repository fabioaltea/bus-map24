import { useCallback } from 'react'
import type { Map } from 'maplibre-gl'
import { useMapStore, type BBox, type ViewState } from '../stores/map.store.js'

/**
 * Returns a stable onMove handler for MapLibre GL JS.
 * Syncs view state and derived bounding box into Zustand store.
 */
export function useMapViewport() {
  const setViewState = useMapStore((s) => s.setViewState)
  const setBBox = useMapStore((s) => s.setBBox)

  const onMoveEnd = useCallback(
    (map: Map) => {
      const center = map.getCenter()
      const zoom = map.getZoom()
      const pitch = map.getPitch()
      const bearing = map.getBearing()

      const vs: ViewState = {
        longitude: center.lng,
        latitude: center.lat,
        zoom,
        pitch,
        bearing,
      }
      setViewState(vs)

      const bounds = map.getBounds()
      const bbox: BBox = {
        swLat: bounds.getSouth(),
        swLng: bounds.getWest(),
        neLat: bounds.getNorth(),
        neLng: bounds.getEast(),
      }
      setBBox(bbox)
    },
    [setViewState, setBBox],
  )

  return { onMoveEnd }
}
