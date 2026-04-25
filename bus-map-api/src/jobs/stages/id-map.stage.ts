import { parse } from 'csv-parse/sync'
import { IdMapper } from '../../lib/id-mapper.js'
import type { DrizzleDb } from '../../db/client.js'

export interface IdMaps {
  agencies: IdMapper
  routes: IdMapper
  stops: IdMapper
  trips: IdMapper
  services: IdMapper
  shapes: IdMapper
}

function parseCsv(content: Buffer): Record<string, string>[] {
  return parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[]
}

export async function runIdMapStage(
  db: DrizzleDb,
  feedId: string,
  readFile: (name: string) => Buffer | null,
): Promise<IdMaps> {
  const agencies = new IdMapper(db, feedId, 'agencies')
  const routes = new IdMapper(db, feedId, 'routes')
  const stops = new IdMapper(db, feedId, 'stops')
  const trips = new IdMapper(db, feedId, 'trips')
  const services = new IdMapper(db, feedId, 'services')
  const shapes = new IdMapper(db, feedId, 'shapes')

  const agencyFile = readFile('agency.txt')
  if (agencyFile) {
    const rows = parseCsv(agencyFile)
    await agencies.bulkGetOrCreate(rows.map((r) => r['agency_id']?.trim() || 'default'))
  }

  const routeFile = readFile('routes.txt')
  if (routeFile) {
    const rows = parseCsv(routeFile)
    await routes.bulkGetOrCreate(rows.map((r) => r['route_id']))
    await agencies.bulkGetOrCreate([...new Set(rows.map((r) => r['agency_id']?.trim() || 'default'))])
  }

  const stopFile = readFile('stops.txt')
  if (stopFile) {
    const rows = parseCsv(stopFile)
    await stops.bulkGetOrCreate(rows.map((r) => r['stop_id']).filter(Boolean))
  }

  const shapeFile = readFile('shapes.txt')
  if (shapeFile) {
    const rows = parseCsv(shapeFile)
    await shapes.bulkGetOrCreate([...new Set(rows.map((r) => r['shape_id']).filter(Boolean))])
  }

  const serviceIds = new Set<string>()
  const calFile = readFile('calendar.txt')
  if (calFile) {
    for (const row of parseCsv(calFile)) serviceIds.add(row['service_id'])
  }
  const calDatesFile = readFile('calendar_dates.txt')
  if (calDatesFile) {
    for (const row of parseCsv(calDatesFile)) serviceIds.add(row['service_id'])
  }

  const tripFile = readFile('trips.txt')
  if (tripFile) {
    const rows = parseCsv(tripFile)
    await trips.bulkGetOrCreate(rows.map((r) => r['trip_id']))
    for (const row of rows) serviceIds.add(row['service_id'])
  }

  if (serviceIds.size > 0) await services.bulkGetOrCreate([...serviceIds])

  return { agencies, routes, stops, trips, services, shapes }
}
