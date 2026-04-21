import { useQuery } from '@tanstack/react-query'
import { useMapStore } from '../stores/map.store.js'
import { fetchAgencyStops } from '../services/api.js'
import type { StopFeature } from '../types/api.js'

export function useAgencyStops(): {
  stops: StopFeature[]
  isLoading: boolean
} {
  const selectedAgencyId = useMapStore((s) => s.selectedAgencyId)

  const { data, isLoading } = useQuery({
    queryKey: ['agency-stops', selectedAgencyId],
    queryFn: () => fetchAgencyStops(selectedAgencyId!),
    enabled: selectedAgencyId !== null,
    staleTime: 120_000,
  })

  return {
    stops: data?.data ?? [],
    isLoading,
  }
}
