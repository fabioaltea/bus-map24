import { useQuery } from '@tanstack/react-query'
import { fetchStop } from '../services/api.js'
import type { StopDetail } from '../types/api.js'

export function useStopDetail(stopId: string | null): {
  stop: StopDetail | null
  isLoading: boolean
} {
  const { data, isLoading } = useQuery({
    queryKey: ['stop', stopId],
    queryFn: () => fetchStop(stopId!),
    enabled: stopId !== null,
    staleTime: 60_000,
  })

  return { stop: data ?? null, isLoading }
}
