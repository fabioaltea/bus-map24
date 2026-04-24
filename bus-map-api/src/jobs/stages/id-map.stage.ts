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

  // agencies
  const agencyFile = readFile('agency.txt')
  if (agencyFile) {
    for (const row of parseCsv(agencyFile)) {
      const id = row['agency_id']?.trim() || 'default'
      await agencies.getOrCreate(id)
    }
  }

  // routes
  const routeFile = readFile('routes.txt')
  if (routeFile) {
    for (const row of parseCsv(routeFile)) {
      await routes.getOrCreate(row['route_id'])
      const agId = row['agency_id']?.trim() || 'default'
      await agencies.getOrCreate(agId)
    }
  }

  // stops
  const stopFile = readFile('stops.txt')
  if (stopFile) {
    for (const row of parseCsv(stopFile)) {
      await stops.getOrCreate(row['stop_id'])
    }
  }

  // shapes
  const shapeFile = readFile('shapes.txt')
  if (shapeFile) {
    const seenShapes = new Set<string>()
    for (const row of parseCsv(shapeFile)) {
      const sid = row['shape_id']
      if (!seenShapes.has(sid)) {
        seenShapes.add(sid)
        await shapes.getOrCreate(sid)
      }
    }
  }

  // services (from calendar + calendar_dates)
  const calFile = readFile('calendar.txt')
  if (calFile) {
    for (const row of parseCsv(calFile)) {
      await services.getOrCreate(row['service_id'])
    }
  }
  const calDatesFile = readFile('calendar_dates.txt')
  if (calDatesFile) {
    for (const row of parseCsv(calDatesFile)) {
      await services.getOrCreate(row['service_id'])
    }
  }

  // trips
  const tripFile = readFile('trips.txt')
  if (tripFile) {
    for (const row of parseCsv(tripFile)) {
      await trips.getOrCreate(row['trip_id'])
      await services.getOrCreate(row['service_id'])
    }
  }

  return { agencies, routes, stops, trips, services, shapes }
}
