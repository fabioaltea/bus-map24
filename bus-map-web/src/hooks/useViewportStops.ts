import { useQuery } from '@tanstack/react-query'
import { useMapStore, bboxToString } from '../stores/map.store.js'
import { fetchStops } from '../services/api.js'
import type { StopFeature } from '../types/api.js'

const MIN_ZOOM = 13

export function useViewportStops(): {
  stops: StopFeature[]
  isLoading: boolean
} {
  const bbox = useMapStore((s) => s.bbox)
  const zoom = useMapStore((s) => s.viewState.zoom)
  const selectedAgencyId = useMapStore((s) => s.selectedAgencyId)

  const bboxStr = bbox ? bboxToString(bbox) : ''

  const { data, isLoading } = useQuery({
    queryKey: ['stops', bboxStr, selectedAgencyId],
    queryFn: () => fetchStops(bboxStr, selectedAgencyId ?? undefined),
    enabled: zoom >= MIN_ZOOM && bboxStr.length > 0,
    staleTime: 60_000,
  })

  return {
    stops: data?.data ?? [],
    isLoading,
  }
}
