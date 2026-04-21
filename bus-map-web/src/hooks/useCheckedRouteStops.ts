import { useQueries } from '@tanstack/react-query'
import { fetchRouteStops } from '../services/api.js'
import type { StopFeature } from '../types/api.js'

export function useCheckedRouteStops(checkedRouteIds: string[]): StopFeature[] {
  const results = useQueries({
    queries: checkedRouteIds.map((id) => ({
      queryKey: ['route-stops', id],
      queryFn: () => fetchRouteStops(id),
      staleTime: 120_000,
    })),
  })

  const seen = new Set<string>()
  const stops: StopFeature[] = []

  for (const result of results) {
    for (const stop of result.data?.data ?? []) {
      if (!seen.has(stop.id)) {
        seen.add(stop.id)
        stops.push(stop)
      }
    }
  }

  return stops
}
