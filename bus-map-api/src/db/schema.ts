import {
  pgTable,
  uuid,
  varchar,
  text,
  char,
  smallint,
  integer,
  boolean,
  timestamp,
  date,
  bigserial,
  bigint,
  real,
  doublePrecision,
  interval,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { customType } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// PostGIS geometry custom type (Drizzle has no native PostGIS support)
function geometry(
  name: string,
  config: { type: string; srid?: number } = { type: 'Geometry' },
) {
  const srid = config.srid ?? 4326
  return customType<{ data: string; driverData: string }>({
    dataType() {
      return `geometry(${config.type},${srid})`
    },
  })(name)
}

// ── FeedCatalogEntries ──────────────────────────────────────────────────────

export const feedCatalogEntries = pgTable('feed_catalog_entries', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  mobilityDbId: varchar('mobility_db_id', { length: 64 }).notNull().unique(),
  provider: varchar('provider', { length: 255 }).notNull(),
  countryCode: char('country_code', { length: 2 }).notNull(),
  municipality: varchar('municipality', { length: 128 }),
  downloadUrl: text('download_url').notNull(),
  boundingBox: geometry('bounding_box', { type: 'Polygon' }),
  hashSha256: char('hash_sha256', { length: 64 }),
  lastImportedSha256: char('last_imported_sha256', { length: 64 }),
  pipelineVersion: smallint('pipeline_version').notNull().default(2),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  lastImportedAt: timestamp('last_imported_at', { withTimezone: true }),
  importStatus: varchar('import_status', { length: 32 }).notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Agencies ────────────────────────────────────────────────────────────────

export const agencies = pgTable(
  'agencies',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    agencyId: varchar('agency_id', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    url: text('url'),
    timezone: varchar('timezone', { length: 64 }).notNull(),
    lang: char('lang', { length: 2 }),
    phone: varchar('phone', { length: 64 }),
    boundingBox: geometry('bounding_box', { type: 'Polygon' }),
    routeCount: integer('route_count').notNull().default(0),
    stopCount: integer('stop_count').notNull().default(0),
    brandColor: varchar('brand_color', { length: 6 }),   // hex without #
    logoUrl: text('logo_url'),
    city: varchar('city', { length: 128 }),
  },
  (t) => ({
    uniqueFeedAgency: uniqueIndex('agencies_feed_agency_idx').on(t.feedId, t.agencyId),
    bboxIdx: index('agencies_bbox_idx').using('gist', t.boundingBox),
  }),
)

// ── Routes ──────────────────────────────────────────────────────────────────

export const routes = pgTable(
  'routes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    routeId: varchar('route_id', { length: 64 }).notNull(),
    shortName: varchar('short_name', { length: 32 }),
    longName: varchar('long_name', { length: 255 }),
    description: text('description'),
    routeType: smallint('route_type').notNull(),
    color: char('color', { length: 6 }).default('AAAAAA'),
    textColor: char('text_color', { length: 6 }).default('FFFFFF'),
    shapeGeom: geometry('shape_geom', { type: 'MultiLineString' }),
  },
  (t) => ({
    uniqueFeedRoute: uniqueIndex('routes_feed_route_idx').on(t.feedId, t.routeId),
    shapeIdx: index('routes_shape_geom_idx').using('gist', t.shapeGeom),
    agencyIdx: index('routes_agency_idx').on(t.agencyId),
  }),
)

// ── Stops ───────────────────────────────────────────────────────────────────

export const stops = pgTable(
  'stops',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    stopId: varchar('stop_id', { length: 64 }).notNull(),
    code: varchar('code', { length: 32 }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    location: geometry('location', { type: 'Point' }).notNull(),
    zoneId: varchar('zone_id', { length: 64 }),
    url: text('url'),
    locationType: smallint('location_type').notNull().default(0),
    parentStationId: uuid('parent_station_id'),
    wheelchairBoarding: smallint('wheelchair_boarding').notNull().default(0),
  },
  (t) => ({
    uniqueFeedStop: uniqueIndex('stops_feed_stop_idx').on(t.feedId, t.stopId),
    locationIdx: index('stops_location_idx').using('gist', t.location),
  }),
)

// ── Shapes ──────────────────────────────────────────────────────────────────

export const shapes = pgTable(
  'shapes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    shapeId: varchar('shape_id', { length: 64 }).notNull(),
    geom: geometry('geom', { type: 'LineString' }).notNull(),
    lengthM: doublePrecision('length_m'),
  },
  (t) => ({
    uniqueFeedShape: uniqueIndex('shapes_feed_shape_idx').on(t.feedId, t.shapeId),
    geomIdx: index('shapes_geom_idx').using('gist', t.geom),
  }),
)

// ── Trips ───────────────────────────────────────────────────────────────────

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    tripId: varchar('trip_id', { length: 64 }).notNull(),
    routeId: uuid('route_id')
      .notNull()
      .references(() => routes.id, { onDelete: 'cascade' }),
    serviceId: varchar('service_id', { length: 64 }).notNull(),
    shapeId: uuid('shape_id').references(() => shapes.id),
    headsign: varchar('headsign', { length: 255 }),
    directionId: smallint('direction_id'),
    blockId: varchar('block_id', { length: 64 }),
    wheelchairAccessible: smallint('wheelchair_accessible').notNull().default(0),
  },
  (t) => ({
    uniqueFeedTrip: uniqueIndex('trips_feed_trip_idx').on(t.feedId, t.tripId),
    routeIdx: index('trips_route_idx').on(t.routeId),
    serviceIdx: index('trips_service_idx').on(t.feedId, t.serviceId),
  }),
)

// ── StopTimes ───────────────────────────────────────────────────────────────

export const stopTimes = pgTable(
  'stop_times',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    stopId: uuid('stop_id')
      .notNull()
      .references(() => stops.id, { onDelete: 'cascade' }),
    arrivalTime: interval('arrival_time').notNull(),
    departureTime: interval('departure_time').notNull(),
    stopSequence: integer('stop_sequence').notNull(),
    stopHeadsign: varchar('stop_headsign', { length: 255 }),
    pickupType: smallint('pickup_type').notNull().default(0),
    dropOffType: smallint('drop_off_type').notNull().default(0),
    timepoint: smallint('timepoint').notNull().default(1),
  },
  (t) => ({
    uniqueSeq: uniqueIndex('stop_times_seq_idx').on(t.feedId, t.tripId, t.stopSequence),
    stopDepartureIdx: index('stop_times_stop_dep_idx').on(t.stopId, t.departureTime),
    tripIdx: index('stop_times_trip_idx').on(t.tripId),
  }),
)

// ── Calendars ───────────────────────────────────────────────────────────────

export const calendars = pgTable(
  'calendars',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    serviceId: varchar('service_id', { length: 64 }).notNull(),
    monday: boolean('monday').notNull(),
    tuesday: boolean('tuesday').notNull(),
    wednesday: boolean('wednesday').notNull(),
    thursday: boolean('thursday').notNull(),
    friday: boolean('friday').notNull(),
    saturday: boolean('saturday').notNull(),
    sunday: boolean('sunday').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
  },
  (t) => ({
    uniqueService: uniqueIndex('calendars_service_idx').on(t.feedId, t.serviceId),
  }),
)

// ── CalendarDates ───────────────────────────────────────────────────────────

export const calendarDates = pgTable(
  'calendar_dates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    serviceId: varchar('service_id', { length: 64 }).notNull(),
    date: date('date').notNull(),
    exceptionType: smallint('exception_type').notNull(), // 1 = added, 2 = removed
  },
  (t) => ({
    uniqueException: uniqueIndex('calendar_dates_exception_idx').on(
      t.feedId,
      t.serviceId,
      t.date,
    ),
  }),
)

// ── Compact Storage Tables (002-compact-gtfs-storage) ───────────────────────

// ── Per-feed id-map tables ───────────────────────────────────────────────────

function feedIdMapTable(tableName: string) {
  return pgTable(
    tableName,
    {
      feedId: uuid('feed_id')
        .notNull()
        .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
      externalId: text('external_id').notNull(),
      internalId: integer('internal_id').notNull(),
    },
    (t) => ({
      pk: primaryKey({ columns: [t.feedId, t.externalId] }),
      uniqueInternal: uniqueIndex(`${tableName}_internal_uniq`).on(t.feedId, t.internalId),
      internalIdx: index(`idx_${tableName.replace('feed_', '')}_internal`).on(t.feedId, t.internalId),
    }),
  )
}

export const feedStops = feedIdMapTable('feed_stops')
export const feedRoutes = feedIdMapTable('feed_routes')
export const feedTrips = feedIdMapTable('feed_trips')
export const feedServices = feedIdMapTable('feed_services')
export const feedShapes = feedIdMapTable('feed_shapes')
export const feedAgencies = feedIdMapTable('feed_agencies')

// ── stops_compact ────────────────────────────────────────────────────────────

export const stopsCompact = pgTable(
  'stops_compact',
  {
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    internalId: integer('internal_id').notNull(),
    name: text('name').notNull(),
    latE6: integer('lat_e6').notNull(),
    lonE6: integer('lon_e6').notNull(),
    parentInternalId: integer('parent_internal_id'),
    // geom is GENERATED ALWAYS AS STORED — defined in hand-polished migration SQL
    geom: geometry('geom', { type: 'Point' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.feedId, t.internalId] }),
    geomIdx: index('stops_compact_geom_idx').using('gist', t.geom),
  }),
)

// ── shapes_compact ───────────────────────────────────────────────────────────

export const shapesCompact = pgTable(
  'shapes_compact',
  {
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    internalId: integer('internal_id').notNull(),
    polyline6: text('polyline6').notNull(),
    simplifyEpsM: real('simplify_eps_m').notNull().default(5.0),
    shapeHash: bigint('shape_hash', { mode: 'bigint' }).notNull(),
    bbox: geometry('bbox', { type: 'Polygon' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.feedId, t.internalId] }),
    uniqueHash: uniqueIndex('shapes_compact_hash_uniq').on(t.feedId, t.shapeHash),
    bboxIdx: index('shapes_compact_bbox_idx').using('gist', t.bbox),
  }),
)

// ── agencies_compact ─────────────────────────────────────────────────────────

export const agenciesCompact = pgTable(
  'agencies_compact',
  {
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    internalId: integer('internal_id').notNull(),
    name: text('name').notNull(),
    url: text('url'),
    tz: text('tz').notNull(),
    brandColor: varchar('brand_color', { length: 6 }),
    logoUrl: text('logo_url'),
    coverage: geometry('coverage', { type: 'MultiPolygon' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.feedId, t.internalId] }),
    coverageIdx: index('agencies_compact_coverage_idx').using('gist', t.coverage),
  }),
)

// ── routes_compact ───────────────────────────────────────────────────────────

export const routesCompact = pgTable(
  'routes_compact',
  {
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    internalId: integer('internal_id').notNull(),
    agencyInternalId: integer('agency_internal_id').notNull(),
    shortName: text('short_name'),
    longName: text('long_name'),
    routeType: smallint('route_type').notNull(),
    color: char('color', { length: 6 }),
    textColor: char('text_color', { length: 6 }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.feedId, t.internalId] }),
    agencyIdx: index('routes_compact_agency_idx').on(t.feedId, t.agencyInternalId),
  }),
)

// ── stop_patterns ────────────────────────────────────────────────────────────

export const stopPatterns = pgTable(
  'stop_patterns',
  {
    patternId: bigserial('pattern_id', { mode: 'bigint' }).primaryKey(),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    stopCount: smallint('stop_count').notNull(),
    durationSec: integer('duration_sec').notNull(),
    patternHash: bigint('pattern_hash', { mode: 'bigint' }).notNull(),
  },
  (t) => ({
    uniqueHash: uniqueIndex('stop_patterns_hash_uniq').on(t.feedId, t.patternHash),
  }),
)

// ── pattern_stops ────────────────────────────────────────────────────────────

export const patternStops = pgTable(
  'pattern_stops',
  {
    patternId: bigint('pattern_id', { mode: 'bigint' })
      .notNull()
      .references(() => stopPatterns.patternId, { onDelete: 'cascade' }),
    seq: smallint('seq').notNull(),
    stopInternalId: integer('stop_internal_id').notNull(),
    offsetArrivalSec: integer('offset_arrival_sec').notNull(),
    offsetDepartureSec: integer('offset_departure_sec').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.patternId, t.seq] }),
    stopPatternIdx: index('pattern_stops_stop_idx').on(t.stopInternalId, t.patternId),
  }),
)

// ── trips_compact ────────────────────────────────────────────────────────────

export const tripsCompact = pgTable(
  'trips_compact',
  {
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    internalId: integer('internal_id').notNull(),
    routeInternalId: integer('route_internal_id').notNull(),
    serviceInternalId: integer('service_internal_id').notNull(),
    patternId: bigint('pattern_id', { mode: 'bigint' }).notNull(),
    startTimeSec: integer('start_time_sec').notNull(),
    shapeInternalId: integer('shape_internal_id'),
    directionId: smallint('direction_id'),
    headsign: text('headsign'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.feedId, t.internalId] }),
    patternServiceIdx: index('trips_compact_pattern_service_idx').on(
      t.patternId,
      t.serviceInternalId,
      t.startTimeSec,
    ),
    routeIdx: index('trips_compact_route_idx').on(t.feedId, t.routeInternalId),
  }),
)

// ── frequencies_compact ──────────────────────────────────────────────────────

export const frequenciesCompact = pgTable(
  'frequencies_compact',
  {
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    tripInternalId: integer('trip_internal_id').notNull(),
    startTimeSec: integer('start_time_sec').notNull(),
    endTimeSec: integer('end_time_sec').notNull(),
    headwaySec: integer('headway_sec').notNull(),
    exactTimes: boolean('exact_times').notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.feedId, t.tripInternalId, t.startTimeSec] }),
  }),
)

// ── calendar_compact ─────────────────────────────────────────────────────────

export const calendarCompact = pgTable(
  'calendar_compact',
  {
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    serviceInternalId: integer('service_internal_id').notNull(),
    monday: boolean('monday').notNull(),
    tuesday: boolean('tuesday').notNull(),
    wednesday: boolean('wednesday').notNull(),
    thursday: boolean('thursday').notNull(),
    friday: boolean('friday').notNull(),
    saturday: boolean('saturday').notNull(),
    sunday: boolean('sunday').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.feedId, t.serviceInternalId] }),
  }),
)

// ── calendar_dates_compact ───────────────────────────────────────────────────

export const calendarDatesCompact = pgTable(
  'calendar_dates_compact',
  {
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feedCatalogEntries.id, { onDelete: 'cascade' }),
    serviceInternalId: integer('service_internal_id').notNull(),
    date: date('date').notNull(),
    exceptionType: smallint('exception_type').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.feedId, t.serviceInternalId, t.date] }),
  }),
)
