import { useQuery } from '@tanstack/react-query'
import { fetchRouteSchedule } from '../services/api.js'
import { useMapStore } from '../stores/map.store.js'
import type { TripSchedule } from '../types/api.js'

export function useRouteSchedule(routeId: string | null): {
  trips: TripSchedule[]
  isLoading: boolean
} {
  const isLive = useMapStore((s) => s.isLive)
  const timelineDate = useMapStore((s) => s.timelineDate)
  const date = isLive ? new Date().toISOString().slice(0, 10) : timelineDate

  const { data, isLoading } = useQuery({
    queryKey: ['route-schedule', routeId, date],
    queryFn: () => fetchRouteSchedule(routeId!, date),
    enabled: routeId !== null,
    staleTime: 5 * 60_000,  // schedule doesn't change during the day
  })

  return { trips: data?.trips ?? [], isLoading }
}
