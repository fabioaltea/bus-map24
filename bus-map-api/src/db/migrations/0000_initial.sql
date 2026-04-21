-- Migration: 0000_initial
-- Created: 2026-04-13
-- Description: Initial schema with PostGIS extension, all GTFS tables, indexes

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- ── feed_catalog_entries ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feed_catalog_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobility_db_id   VARCHAR(64)  NOT NULL UNIQUE,
  provider         VARCHAR(255) NOT NULL,
  country_code     CHAR(2)      NOT NULL,
  download_url     TEXT         NOT NULL,
  bounding_box     geometry(Polygon, 4326),
  hash_sha256      CHAR(64),
  last_checked_at  TIMESTAMPTZ,
  last_imported_at TIMESTAMPTZ,
  import_status    VARCHAR(32)  NOT NULL DEFAULT 'pending',
  error_message    TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feed_catalog_entries_status_idx
  ON feed_catalog_entries (import_status);

-- ── agencies ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agencies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id       UUID        NOT NULL REFERENCES feed_catalog_entries(id) ON DELETE CASCADE,
  agency_id     VARCHAR(64) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  url           TEXT,
  timezone      VARCHAR(64) NOT NULL,
  lang          CHAR(2),
  phone         VARCHAR(64),
  bounding_box  geometry(Polygon, 4326),
  route_count   INTEGER     NOT NULL DEFAULT 0,
  stop_count    INTEGER     NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS agencies_feed_agency_idx ON agencies (feed_id, agency_id);
CREATE INDEX IF NOT EXISTS agencies_bbox_idx ON agencies USING GIST (bounding_box);

-- ── routes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id     UUID       NOT NULL REFERENCES feed_catalog_entries(id) ON DELETE CASCADE,
  agency_id   UUID       NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  route_id    VARCHAR(64) NOT NULL,
  short_name  VARCHAR(32),
  long_name   VARCHAR(255),
  description TEXT,
  route_type  SMALLINT   NOT NULL,
  color       CHAR(6)    DEFAULT 'AAAAAA',
  text_color  CHAR(6)    DEFAULT 'FFFFFF',
  shape_geom  geometry(MultiLineString, 4326)
);

CREATE UNIQUE INDEX IF NOT EXISTS routes_feed_route_idx ON routes (feed_id, route_id);
CREATE INDEX IF NOT EXISTS routes_shape_geom_idx ON routes USING GIST (shape_geom);
CREATE INDEX IF NOT EXISTS routes_agency_idx ON routes (agency_id);

-- ── stops ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stops (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id             UUID       NOT NULL REFERENCES feed_catalog_entries(id) ON DELETE CASCADE,
  stop_id             VARCHAR(64) NOT NULL,
  code                VARCHAR(32),
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  location            geometry(Point, 4326) NOT NULL,
  zone_id             VARCHAR(64),
  url                 TEXT,
  location_type       SMALLINT   NOT NULL DEFAULT 0,
  parent_station_id   UUID,
  wheelchair_boarding SMALLINT   NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS stops_feed_stop_idx ON stops (feed_id, stop_id);
CREATE INDEX IF NOT EXISTS stops_location_idx ON stops USING GIST (location);

-- ── shapes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shapes (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id  UUID       NOT NULL REFERENCES feed_catalog_entries(id) ON DELETE CASCADE,
  shape_id VARCHAR(64) NOT NULL,
  geom     geometry(LineString, 4326) NOT NULL,
  length_m DOUBLE PRECISION
);

CREATE UNIQUE INDEX IF NOT EXISTS shapes_feed_shape_idx ON shapes (feed_id, shape_id);
CREATE INDEX IF NOT EXISTS shapes_geom_idx ON shapes USING GIST (geom);

-- ── trips ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id               UUID       NOT NULL REFERENCES feed_catalog_entries(id) ON DELETE CASCADE,
  trip_id               VARCHAR(64) NOT NULL,
  route_id              UUID       NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  service_id            VARCHAR(64) NOT NULL,
  shape_id              UUID REFERENCES shapes(id),
  headsign              VARCHAR(255),
  direction_id          SMALLINT,
  block_id              VARCHAR(64),
  wheelchair_accessible SMALLINT   NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS trips_feed_trip_idx ON trips (feed_id, trip_id);
CREATE INDEX IF NOT EXISTS trips_route_idx ON trips (route_id);
CREATE INDEX IF NOT EXISTS trips_service_idx ON trips (feed_id, service_id);

-- ── stop_times ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stop_times (
  id             BIGSERIAL PRIMARY KEY,
  feed_id        UUID     NOT NULL REFERENCES feed_catalog_entries(id) ON DELETE CASCADE,
  trip_id        UUID     NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  stop_id        UUID     NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  arrival_time   INTERVAL NOT NULL,
  departure_time INTERVAL NOT NULL,
  stop_sequence  INTEGER  NOT NULL,
  stop_headsign  VARCHAR(255),
  pickup_type    SMALLINT NOT NULL DEFAULT 0,
  drop_off_type  SMALLINT NOT NULL DEFAULT 0,
  timepoint      SMALLINT NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS stop_times_seq_idx ON stop_times (feed_id, trip_id, stop_sequence);
CREATE INDEX IF NOT EXISTS stop_times_stop_dep_idx ON stop_times (stop_id, departure_time);
CREATE INDEX IF NOT EXISTS stop_times_trip_idx ON stop_times (trip_id);

-- ── calendars ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendars (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id    UUID    NOT NULL REFERENCES feed_catalog_entries(id) ON DELETE CASCADE,
  service_id VARCHAR(64) NOT NULL,
  monday     BOOLEAN NOT NULL,
  tuesday    BOOLEAN NOT NULL,
  wednesday  BOOLEAN NOT NULL,
  thursday   BOOLEAN NOT NULL,
  friday     BOOLEAN NOT NULL,
  saturday   BOOLEAN NOT NULL,
  sunday     BOOLEAN NOT NULL,
  start_date DATE    NOT NULL,
  end_date   DATE    NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS calendars_service_idx ON calendars (feed_id, service_id);

-- ── calendar_dates ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_dates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id        UUID     NOT NULL REFERENCES feed_catalog_entries(id) ON DELETE CASCADE,
  service_id     VARCHAR(64) NOT NULL,
  date           DATE     NOT NULL,
  exception_type SMALLINT NOT NULL -- 1 = added, 2 = removed
);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_dates_exception_idx
  ON calendar_dates (feed_id, service_id, date);
