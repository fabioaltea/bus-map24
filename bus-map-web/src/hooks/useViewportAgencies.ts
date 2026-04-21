import { useQuery } from '@tanstack/react-query'
import { useMapStore, bboxToString } from '../stores/map.store.js'
import { fetchAgencies } from '../services/api.js'
import type { AgencyFeature } from '../types/api.js'

const MIN_ZOOM = 5

export function useViewportAgencies(): {
  agencies: AgencyFeature[]
  isLoading: boolean
  isError: boolean
} {
  const bbox = useMapStore((s) => s.bbox)
  const zoom = useMapStore((s) => s.viewState.zoom)

  const bboxStr = bbox ? bboxToString(bbox) : ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['agencies', bboxStr],
    queryFn: () => fetchAgencies(bboxStr),
    enabled: zoom >= MIN_ZOOM && bboxStr.length > 0,
    staleTime: 60_000,
  })

  return {
    agencies: data?.data ?? [],
    isLoading,
    isError,
  }
}
