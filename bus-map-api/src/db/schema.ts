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
  doublePrecision,
  interval,
  uniqueIndex,
  index,
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
  downloadUrl: text('download_url').notNull(),
  boundingBox: geometry('bounding_box', { type: 'Polygon' }),
  hashSha256: char('hash_sha256', { length: 64 }),
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
