# Data Model: GTFS Bus Map Explorer

**Phase**: 1 — Design
**Feature**: `specs/001-gtfs-bus-map/spec.md`
**Date**: 2026-04-13

---

## Overview

The data model maps directly to the GTFS static specification with additions for
application-level metadata (feed catalog, tile generation status, spatial indexes).
All geographic fields use PostGIS `geometry(Point, 4326)` or `geometry(Geometry, 4326)`.

---

## Entities

### FeedCatalogEntry

Represents a single GTFS feed as listed in the MobilityDatabase catalog. One entry per
transit provider/region combination.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Internal UUID |
| `mobility_db_id` | `varchar(64)` | UNIQUE, NOT NULL | MobilityDatabase feed identifier |
| `provider` | `varchar(255)` | NOT NULL | Human-readable provider name |
| `country_code` | `char(2)` | NOT NULL | ISO 3166-1 alpha-2 country |
| `download_url` | `text` | NOT NULL | Direct URL to latest GTFS zip |
| `bounding_box` | `geometry(Polygon, 4326)` | NULL | Coverage area polygon |
| `hash_sha256` | `char(64)` | NULL | Hash of last downloaded zip |
| `last_checked_at` | `timestamptz` | NULL | When catalog was last polled |
| `last_imported_at` | `timestamptz` | NULL | When data was last imported |
| `import_status` | `varchar(32)` | NOT NULL DEFAULT 'pending' | `pending`, `downloading`, `importing`, `ready`, `error` |
| `error_message` | `text` | NULL | Last import error if any |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() | |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT now() | |

**Indexes**: `bounding_box` (GIST), `country_code`, `import_status`

**Validation rules**:
- `import_status` must be one of the enumerated values.
- `download_url` must be a valid HTTPS URL.
- `hash_sha256` is 64 hex characters when present.

---

### Agency

A transit operator. Populated from the GTFS `agency.txt` file. Multiple agencies
can belong to a single feed.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Internal UUID |
| `feed_id` | `uuid` | FK → FeedCatalogEntry, NOT NULL | Source feed |
| `agency_id` | `varchar(64)` | NOT NULL | GTFS agency_id (from agency.txt) |
| `name` | `varchar(255)` | NOT NULL | Full agency name |
| `url` | `text` | NULL | Agency website URL |
| `timezone` | `varchar(64)` | NOT NULL | IANA timezone (e.g. `Europe/Rome`) |
| `lang` | `char(2)` | NULL | ISO 639-1 language code |
| `phone` | `varchar(64)` | NULL | Customer contact phone |
| `bounding_box` | `geometry(Polygon, 4326)` | NULL | Derived from routes + stops extents |
| `route_count` | `integer` | NOT NULL DEFAULT 0 | Cached count for UI |
| `stop_count` | `integer` | NOT NULL DEFAULT 0 | Cached count for UI |

**Compound UNIQUE**: `(feed_id, agency_id)`
**Indexes**: `bounding_box` (GIST), `name` (text search GIN)

---

### Route

A named service line. Populated from GTFS `routes.txt`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Internal UUID |
| `feed_id` | `uuid` | FK → FeedCatalogEntry, NOT NULL | |
| `agency_id` | `uuid` | FK → Agency, NOT NULL | Owning agency |
| `route_id` | `varchar(64)` | NOT NULL | GTFS route_id |
| `short_name` | `varchar(32)` | NULL | Route number/code (e.g. "23", "M1") |
| `long_name` | `varchar(255)` | NULL | Full route name |
| `description` | `text` | NULL | |
| `route_type` | `smallint` | NOT NULL | GTFS route type: 0=tram,1=subway,2=rail,3=bus,... |
| `color` | `char(6)` | NULL DEFAULT 'AAAAAA' | Hex colour without `#` |
| `text_color` | `char(6)` | NULL DEFAULT 'FFFFFF' | Label text colour |
| `shape_geom` | `geometry(MultiLineString, 4326)` | NULL | Combined shape geometry |

**Compound UNIQUE**: `(feed_id, route_id)`
**Indexes**: `agency_id`, `route_type`, `shape_geom` (GIST)

**Validation rules**:
- `route_type` must be a valid GTFS route type (0–12).
- `color` and `text_color` must be 6 hex characters when present.
- At least one of `short_name` or `long_name` must be non-null.

---

### Stop

A physical boarding/alighting point. Populated from GTFS `stops.txt`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Internal UUID |
| `feed_id` | `uuid` | FK → FeedCatalogEntry, NOT NULL | |
| `stop_id` | `varchar(64)` | NOT NULL | GTFS stop_id |
| `code` | `varchar(32)` | NULL | Short public stop code |
| `name` | `varchar(255)` | NOT NULL | Display name |
| `description` | `text` | NULL | |
| `location` | `geometry(Point, 4326)` | NOT NULL | WGS-84 coordinates |
| `zone_id` | `varchar(64)` | NULL | Fare zone |
| `url` | `text` | NULL | Stop-specific page URL |
| `location_type` | `smallint` | NOT NULL DEFAULT 0 | 0=stop,1=station,2=entrance,3=generic node |
| `parent_station_id` | `uuid` | FK → Stop, NULL | Platform → Station relationship |
| `wheelchair_boarding` | `smallint` | NOT NULL DEFAULT 0 | 0=unknown,1=yes,2=no |

**Compound UNIQUE**: `(feed_id, stop_id)`
**Indexes**: `location` (GIST), `parent_station_id`, `name` (text search GIN)

---

### Shape

The geographic path of a route's trips. Populated from GTFS `shapes.txt`.
Stored as a PostGIS linestring for spatial queries.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Internal UUID |
| `feed_id` | `uuid` | FK → FeedCatalogEntry, NOT NULL | |
| `shape_id` | `varchar(64)` | NOT NULL | GTFS shape_id |
| `geom` | `geometry(LineString, 4326)` | NOT NULL | Ordered point sequence |
| `length_m` | `double precision` | NULL | Pre-computed length in metres |

**Compound UNIQUE**: `(feed_id, shape_id)`
**Indexes**: `geom` (GIST)

---

### Trip

A single timed journey along a route. Populated from GTFS `trips.txt`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Internal UUID |
| `feed_id` | `uuid` | FK → FeedCatalogEntry, NOT NULL | |
| `trip_id` | `varchar(64)` | NOT NULL | GTFS trip_id |
| `route_id` | `uuid` | FK → Route, NOT NULL | |
| `service_id` | `varchar(64)` | NOT NULL | GTFS service_id (links to Calendar) |
| `shape_id` | `uuid` | FK → Shape, NULL | |
| `headsign` | `varchar(255)` | NULL | Destination display text |
| `direction_id` | `smallint` | NULL | 0=outbound, 1=inbound |
| `block_id` | `varchar(64)` | NULL | Vehicle block (for through-routing) |
| `wheelchair_accessible` | `smallint` | NOT NULL DEFAULT 0 | 0=unknown,1=yes,2=no |

**Compound UNIQUE**: `(feed_id, trip_id)`
**Indexes**: `route_id`, `service_id`

---

### StopTime

Scheduled event at a stop. Populated from GTFS `stop_times.txt`.
The highest-volume table — expect hundreds of millions of rows for a global dataset.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `bigserial` | PK | Integer PK for space efficiency |
| `feed_id` | `uuid` | FK → FeedCatalogEntry, NOT NULL | |
| `trip_id` | `uuid` | FK → Trip, NOT NULL | |
| `stop_id` | `uuid` | FK → Stop, NOT NULL | |
| `arrival_time` | `interval` | NOT NULL | GTFS time (may exceed 24h for overnight) |
| `departure_time` | `interval` | NOT NULL | |
| `stop_sequence` | `integer` | NOT NULL | Order within trip |
| `stop_headsign` | `varchar(255)` | NULL | Override headsign at this stop |
| `pickup_type` | `smallint` | NOT NULL DEFAULT 0 | 0=regular,1=none,2=phone,3=driver |
| `drop_off_type` | `smallint` | NOT NULL DEFAULT 0 | |
| `timepoint` | `smallint` | NOT NULL DEFAULT 1 | 0=approximate, 1=exact |

**Compound UNIQUE**: `(feed_id, trip_id, stop_sequence)`
**Indexes**: `(stop_id, departure_time)`, `trip_id`

**Note on GTFS time encoding**: GTFS times can exceed 24:00:00 for services that run
past midnight. PostgreSQL `interval` type handles this correctly.

---

### Calendar

Service pattern (which days a service_id operates). From GTFS `calendar.txt`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `feed_id` | `uuid` | FK → FeedCatalogEntry, NOT NULL | |
| `service_id` | `varchar(64)` | NOT NULL | GTFS service_id |
| `monday` | `boolean` | NOT NULL | |
| `tuesday` | `boolean` | NOT NULL | |
| `wednesday` | `boolean` | NOT NULL | |
| `thursday` | `boolean` | NOT NULL | |
| `friday` | `boolean` | NOT NULL | |
| `saturday` | `boolean` | NOT NULL | |
| `sunday` | `boolean` | NOT NULL | |
| `start_date` | `date` | NOT NULL | Service validity start |
| `end_date` | `date` | NOT NULL | Service validity end |

**Compound UNIQUE**: `(feed_id, service_id)`

---

### CalendarDate

Exceptions to the regular Calendar pattern. From GTFS `calendar_dates.txt`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | |
| `feed_id` | `uuid` | FK → FeedCatalogEntry, NOT NULL | |
| `service_id` | `varchar(64)` | NOT NULL | |
| `date` | `date` | NOT NULL | |
| `exception_type` | `smallint` | NOT NULL | 1=service added, 2=service removed |

**Compound UNIQUE**: `(feed_id, service_id, date)`
**Indexes**: `(feed_id, service_id, date)`

---

## Relationships Diagram

```
FeedCatalogEntry 1──────────────────────────── N Agency
                 1──────────────────────────── N Route
                 1──────────────────────────── N Stop
                 1──────────────────────────── N Shape
                 1──────────────────────────── N Trip
                 1──────────────────────────── N StopTime
                 1──────────────────────────── N Calendar
                 1──────────────────────────── N CalendarDate

Agency 1──────── N Route
Route  1──────── N Trip
Trip   1──────── N StopTime
Stop   1──────── N StopTime
Shape  1──────── N Trip
Stop   0..1───── N Stop (parent_station → platform hierarchy)
Calendar 1────── N CalendarDate (via service_id, logical FK)
```

---

## Frontend State Model

The frontend does not persist state; the following documents the Zustand store shape.

```typescript
interface MapStore {
  // Viewport
  viewport: { bbox: BBox; zoom: number };

  // Active selections
  selectedAgencyId: string | null;
  selectedRouteId: string | null;
  selectedStopId: string | null;

  // Panel visibility
  agencyPanelOpen: boolean;
  stopPanelOpen: boolean;

  // Filter state
  activeRouteTypes: RouteType[];   // bus, tram, rail, etc.
}

type BBox = [swLng: number, swLat: number, neLng: number, neLat: number];
type RouteType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 11 | 12;
```

---

## PMTiles Tile Layers

Two PMTiles archives served as static files:

| Archive | Contents | Min Zoom | Max Zoom |
|---------|----------|----------|----------|
| `routes.pmtiles` | Route polylines (shape_geom) with route_id, color, route_type attributes | 9 | 16 |
| `stops.pmtiles` | Stop points with stop_id, name, route_ids[] attributes | 13 | 22 |

Generated via `tippecanoe`:
```bash
# Routes
tippecanoe -o routes.pmtiles -z 16 -Z 9 \
  --layer=routes --use-attribute-for-id=route_id \
  routes.geojson

# Stops
tippecanoe -o stops.pmtiles -z 22 -Z 13 \
  --layer=stops --use-attribute-for-id=stop_id \
  stops.geojson
```
