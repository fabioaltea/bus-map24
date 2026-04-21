// ── Shared ───────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface ProblemDetail {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
}

// ── Agencies ─────────────────────────────────────────────────────────────────

export interface AgencyFeature {
  id: string
  name: string
  countryCode: string
  routeCount: number
  stopCount: number
  /** GeoJSON Polygon WKT or null */
  boundingBox: string | null
  centroid: string | null  // "POINT(lng lat)"
  url: string | null
  timezone: string
  brandColor: string | null  // hex without #, manually set
  logoUrl: string | null     // manually set, overrides Clearbit
  city: string | null        // manually set
}

// ── Routes ───────────────────────────────────────────────────────────────────

export interface RouteFeature {
  id: string
  routeId: string
  shortName: string | null
  longName: string | null
  routeType: number
  color: string
  textColor: string
  /** GeoJSON MultiLineString string or null */
  shapeGeom: string | null
  agencyId: string
  agencyName: string
  fromStop: string | null
  toStop: string | null
}

// ── Stops ────────────────────────────────────────────────────────────────────

export interface StopFeature {
  id: string
  stopId: string
  name: string
  /** GeoJSON Point string — "POINT(lng lat)" */
  location: string
  locationType: number
}

export interface StopDetail extends StopFeature {
  code: string | null
  description: string | null
  wheelchairBoarding: number
  routes: Array<{ id: string; shortName: string | null; longName: string | null; color: string; fromStop: string | null; toStop: string | null }>
}

// ── Live buses ───────────────────────────────────────────────────────────────

export interface LiveBus {
  tripId: string
  headsign: string | null
  fromStop: string
  toStop: string
  bearing: number
  segFraction: number
  positionWkt: string // "POINT(lng lat)"
  tripStartSec: number
  tripEndSec: number
  nextStopArrivalSec: number
}

export interface LiveBusesResponse {
  buses: LiveBus[]
  generatedAt: string
}

export interface TripStop {
  stopId: string
  name: string
  arrivalSec: number
  departureSec: number
  sequence: number
}

// ── Schedule ─────────────────────────────────────────────────────────────────

export interface ScheduleWaypoint {
  sec: number
  lat: number
  lng: number
  name: string
}

export interface TripSchedule {
  tripId: string
  headsign: string | null
  waypoints: ScheduleWaypoint[]
}

export interface RouteScheduleResponse {
  trips: TripSchedule[]
  date: string
}

// ── Departures ───────────────────────────────────────────────────────────────

export interface DepartureRow {
  tripId: string
  headsign: string | null
  routeShortName: string | null
  routeLongName: string | null
  routeColor: string
  departureTime: string // "HH:MM:SS"
  serviceDate: string   // "YYYY-MM-DD"
}
