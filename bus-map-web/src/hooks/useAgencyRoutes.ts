import { useQuery } from '@tanstack/react-query'
import { useMapStore } from '../stores/map.store.js'
import { fetchAgencyRoutes } from '../services/api.js'
import type { RouteFeature } from '../types/api.js'

export function useAgencyRoutes(): {
  routes: RouteFeature[]
  isLoading: boolean
  isError: boolean
} {
  const selectedAgencyId = useMapStore((s) => s.selectedAgencyId)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['routes', selectedAgencyId],
    queryFn: () => fetchAgencyRoutes(selectedAgencyId!),
    enabled: selectedAgencyId !== null,
    staleTime: 120_000,
  })

  return {
    routes: data?.data ?? [],
    isLoading,
    isError,
  }
}
