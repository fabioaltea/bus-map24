import type { DepartureRow } from '../../types/api.js'
import { MOCK_ROUTES } from './routes.js'
import { MOCK_STOPS } from './stops.js'

/** Pad number to 2 digits */
function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** Format seconds-since-midnight as HH:MM:SS */
function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

/** Route-to-headsign mapping */
const HEADSIGNS: Record<string, string> = {
  'route-tfl-1': 'Tower Hill',
  'route-tfl-25': 'Tower Hill via Holborn',
  'route-tfl-15': 'Tower Hill via Blackfriars',
  'route-atac-40': 'San Pietro (Piazza Risorgimento)',
  'route-atac-23': 'Villa Borghese',
  'route-mta-m15': 'South Ferry',
  'route-mta-bx12': 'Inwood-207 St',
  'route-bvg-100': 'Alexanderplatz',
  'route-bvg-200': 'Alexanderplatz via Potsdamer Platz',
  'route-tokyo-yamanote': 'Osaki / Shinagawa',
}

/**
 * Generate realistic departures for a stop on a given date.
 * Times are anchored to current local hour so departures always
 * look "upcoming" regardless of when the fixture is rendered.
 */
export function generateDepartures(stopId: string, _date: string): DepartureRow[] {
  const stop = MOCK_STOPS.find((s) => s.id === stopId)
  if (!stop) return []

  // Find routes that serve this stop (by agency prefix convention in fixture IDs)
  const agencyPrefix = stopId.split('-')[1] // e.g. "tfl", "atac", "mta", "bvg", "tokyo"
  const servingRoutes = MOCK_ROUTES.filter((r) => r.agencyId.includes(agencyPrefix))
  if (servingRoutes.length === 0) return []

  const now = new Date()
  const baseSeconds = now.getHours() * 3600 + now.getMinutes() * 60

  const departures: DepartureRow[] = []
  const INTERVAL = 600 // 10-minute headway

  // Generate 4 upcoming departures per serving route
  for (const route of servingRoutes) {
    for (let i = 0; i < 4; i++) {
      const depSeconds = baseSeconds + i * INTERVAL + (servingRoutes.indexOf(route) * 3 * 60)
      departures.push({
        tripId: `trip-${route.id}-${i}`,
        headsign: HEADSIGNS[route.id] ?? route.longName ?? null,
        routeShortName: route.shortName,
        routeLongName: route.longName,
        routeColor: route.color,
        departureTime: formatTime(depSeconds),
        serviceDate: _date,
      })
    }
  }

  // Sort by departure time
  departures.sort((a, b) => a.departureTime.localeCompare(b.departureTime))
  return departures
}
