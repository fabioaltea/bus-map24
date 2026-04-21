import { useQuery } from '@tanstack/react-query'
import { fetchDepartures } from '../services/api.js'
import type { DepartureRow } from '../types/api.js'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function useStopDepartures(stopId: string | null): {
  departures: DepartureRow[]
  isLoading: boolean
} {
  const date = todayIso()

  const { data, isLoading } = useQuery({
    queryKey: ['departures', stopId, date],
    queryFn: () => fetchDepartures(stopId!, date),
    enabled: stopId !== null,
    staleTime: 30_000,
  })

  return { departures: data ?? [], isLoading }
}
