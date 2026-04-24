import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { fetchLiveBuses } from '../services/api.js'
import { useMapStore } from '../stores/map.store.js'
import type { LiveBus } from '../types/api.js'

const POLL_INTERVAL = 15_000

export function useLiveBuses(routeId: string | null): {
  buses: LiveBus[]
  isLoading: boolean
} {
  const isLive = useMapStore((s) => s.isLive)
  const timelineDate = useMapStore((s) => s.timelineDate)
  const timelineSec = useMapStore((s) => s.timelineSec)

  const date = isLive ? new Date().toISOString().slice(0, 10) : timelineDate
  const time = isLive
    ? undefined
    : `${String(Math.floor(timelineSec / 3600)).padStart(2, '0')}:${String(Math.floor((timelineSec % 3600) / 60)).padStart(2, '0')}`

  const { data, isLoading } = useQuery({
    queryKey: ['live-buses', routeId, date, time ?? 'live'],
    queryFn: () => fetchLiveBuses(routeId!, date, time),
    enabled: routeId !== null,
    refetchInterval: isLive ? POLL_INTERVAL : false,
    staleTime: isLive ? 0 : 30_000,
    placeholderData: keepPreviousData,
  })

  return {
    buses: data?.buses ?? [],
    isLoading,
  }
}
