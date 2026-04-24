# Feature Specification: Compact GTFS Storage

**Feature Branch**: `002-compact-gtfs-storage`
**Created**: 2026-04-21
**Status**: Draft
**Input**: User description: "Il GTFS occupa troppo spazio, dobbiamo ridurre drasticamente tutto lo spazio occupato sul db effettuando modifiche al db, allo script di importazione, alle api che restituiscono il dato al client. Il dato verso il client può rimanere invariato."

## Context

The current importer (`bus-map-api/src/scripts/import-feed.ts` + `jobs/feed-download.job.ts`) materialises the raw GTFS tables almost 1:1 into PostgreSQL:

- `stop_times` is the dominant table — one row per `(trip_id, stop_sequence)` — typically 80–95% of total feed size.
- Shape polylines stored point-by-point as `DOUBLE PRECISION` coordinates.
- String identifiers (`stop_id`, `trip_id`, `route_id`, `service_id`) persisted verbatim, repeated millions of times across FKs.
- Arrival/departure times stored as `TIME` or `TEXT` (`HH:MM:SS`).

Result: a single mid-sized feed (e.g., TLD-576) consumes hundreds of MBs; a 20-city catalogue would exceed the practical limits of the development environment and inflate query/backup/restore time.

The API surface exposed to the frontend (`/api/agencies`, `/api/routes`, `/api/stops/:id`, `/api/stops/:id/departures`, `/api/trips/:id`, `/tiles/*`) **must remain byte-for-byte compatible** with today's contracts so that `bus-map-web` needs no changes.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator ingests a large feed on a modest machine (Priority: P1)

An operator runs `pnpm import-feed --mobility-id <id>` for a metropolitan feed
(≥ 200k stop_times, ≥ 10k trips) on a laptop with 16 GB RAM and a standard
SSD. The import completes successfully, the resulting database uses a small
fraction of the space the current importer would require, and all read-path
APIs return identical responses to the ones produced today.

**Why this priority**: Footprint is the blocker that prevents the system from
ingesting more than a handful of feeds. Without this story, the project
cannot scale to the "20+ cities at launch" assumption from spec 001.

**Independent Test**: Import the same GTFS feed under the current and the
new pipeline on identical hardware; compare `pg_total_relation_size` per
table and `pg_database_size('busmapdb')`; replay a snapshot of
`/api/*` requests and compare responses byte-by-byte.

**Acceptance Scenarios**:

1. **Given** a GTFS feed with ≥ 200k stop_times, **When** the feed is
   imported with the new pipeline, **Then** total database size (sum of
   data + index pages for the tables owned by the feed) is reduced by
   at least **70%** versus the baseline on the same feed.
2. **Given** a feed has been ingested with the new pipeline, **When** the
   client calls `/api/stops/:id/departures?date=YYYY-MM-DD`, **Then** the
   JSON response is equivalent (same departures, same fields, same
   ordering) to the response produced by the current pipeline.
3. **Given** a re-import of the same feed (same SHA256), **When** the job
   runs, **Then** it is a no-op and no duplicate rows are created
   (idempotency preserved).

---

### User Story 2 - Client reads departures and trip detail with unchanged contracts (Priority: P1)

The frontend calls the same endpoints it calls today and receives
semantically equivalent JSON payloads. The transformation from the compact
storage format to the public JSON contract happens server-side.

**Why this priority**: Without contract stability, the frontend must be
rewritten — doubling the scope and invalidating spec 001's contracts.

**Independent Test**: Record fixture responses from the current API;
replay the same requests against the new API; assert deep equality on
every endpoint under `/api/`.

**Acceptance Scenarios**:

1. **Given** the frontend's MSW fixtures for spec 001, **When** the new
   API answers the same requests, **Then** every field listed in
   `spec-bus-map/specs/001-gtfs-bus-map/contracts/` is present with the
   same value and type.
2. **Given** a stop with a known schedule, **When** the compact storage
   expands the `(pattern, trip, offset)` representation into per-trip
   departures, **Then** the expanded times match the original GTFS
   `stop_times.arrival_time` to the second.

---

### User Story 3 - Tile generation remains correct after shape compression (Priority: P2)

Shapes stored in compressed form (polyline-encoded or fixed-point delta-
encoded) can still be decoded and emitted as GeoJSON for `tippecanoe`, so
the resulting PMTiles are visually indistinguishable from those produced
by the current pipeline.

**Why this priority**: Compression on shapes is the second-largest space
saver, but it must not degrade map rendering fidelity.

**Independent Test**: Generate PMTiles from the same feed under both
pipelines; diff the decoded GeoJSON feature collections; assert Hausdorff
distance between original and decoded polylines is below the simplification
tolerance (default: 5 m).

**Acceptance Scenarios**:

1. **Given** a feed imported with the new pipeline, **When**
   `gen-tiles.ts` runs, **Then** the output `.pmtiles` files open in the
   frontend identically to the baseline.
2. **Given** a shape with ≥ 500 points, **When** stored in compressed
   form and read back, **Then** the Hausdorff distance to the original is
   ≤ 5 m at all zoom levels used by the app.

---

### Edge Cases

- Two trips have the same stop sequence and the same relative offsets but
  different absolute start times → must be collapsed to the same pattern.
- Two trips share the same pattern but one is a weekday service and the
  other is a Sunday service → patterns are independent of service
  calendar; calendar resolution still applies at read time.
- A feed uses `frequencies.txt` already → frequency-based trips must be
  stored natively as (pattern, start_time, end_time, headway) without
  re-exploding them into individual trips.
- GTFS allows `arrival_time > 24:00:00` for overnight services → the
  compact encoding MUST preserve values up to 48:00:00 (172 800 seconds).
- Feed updates arrive (same `mobility_db_id`, new SHA256) → the importer
  must replace only the rows that actually changed and keep the
  string-to-integer ID mapping stable across versions.
- Two different feeds share `stop_id` values (namespaces collide) → the
  integer ID mapping must be scoped per feed or per `(feed_id, stop_id)`.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST store repeated stop sequences once, as a
  **stop pattern** (ordered sequence of stops + per-stop offsets from the
  pattern's first departure), and reference the pattern from each trip.
- **FR-002**: The system MUST map every external GTFS string identifier
  (`stop_id`, `trip_id`, `route_id`, `service_id`, `shape_id`,
  `agency_id`) to an internal integer surrogate key, scoped per feed,
  with a lookup table preserving the original string for re-export.
- **FR-003**: The system MUST store arrival/departure times as integer
  seconds from the pattern's reference time, supporting values in the
  range [0, 172 800] to cover overnight services.
- **FR-004**: The system MUST store stop and shape coordinates using a
  compact geographic representation that preserves ≥ 6 decimal digits of
  precision (≈ 11 cm), equivalent to the precision of GTFS source data.
- **FR-005**: The system MUST store shape polylines in a compressed form
  and provide a decoder that reconstructs GeoJSON `LineString` geometry
  on demand.
- **FR-006**: The system MUST deduplicate shapes whose decoded geometry
  is identical (same point sequence within a 1 m tolerance), keeping a
  single canonical row.
- **FR-007**: The system MUST detect repeating trips (same pattern, same
  service_id, evenly spaced start times) and collapse them into a
  frequency-based representation at import time.
- **FR-008**: The import pipeline MUST be **idempotent** per
  `(feed_id, sha256)`; a re-run against the same source zip MUST be a
  no-op.
- **FR-009**: The import pipeline MUST support **incremental updates**
  for a given `feed_id`: only patterns, trips and shapes that changed
  between two versions are rewritten; stable IDs are preserved.
- **FR-010**: The read-side services MUST expand the compact storage into
  the public JSON shape required by the contracts under
  `specs/001-gtfs-bus-map/contracts/`, with no field additions, removals
  or type changes.
- **FR-011**: Query latency for `/api/stops/:id/departures` MUST remain
  within the 1 s budget defined by SC-003 of spec 001, at the same or
  better p95 than the current pipeline.
- **FR-012**: PostGIS geometry columns required for bbox queries
  (`ST_Intersects` on agencies, stops, shapes) MUST be preserved or
  materialised at read time without a full table scan.
- **FR-013**: The database schema MUST enable page-level compression
  (`TOAST`, index-only scans where possible) without preventing the
  existing BullMQ jobs from operating.
- **FR-014**: The system MUST expose a migration path: an operator can
  re-ingest existing feeds once; data from the old schema is not
  automatically migrated.

### Key Entities

- **FeedIdMap**: Mapping from GTFS string IDs to per-feed internal
  integers. Attributes: `feed_id`, `kind` (stop/trip/route/service/…),
  `external_id`, `internal_id` (SMALLINT/INT per kind).
- **StopPattern**: A canonical stop sequence shared by one or more trips.
  Attributes: `pattern_id`, `feed_id`, ordered list of
  `(stop_internal_id, offset_arrival_sec, offset_departure_sec)`,
  dedup hash.
- **Trip (compact)**: Attributes: `trip_internal_id`, `route_internal_id`,
  `service_internal_id`, `pattern_id`, `start_time_sec`, optional
  `shape_id`, `direction`, optional `headsign`.
- **Frequency**: Attributes: `trip_internal_id`, `start_time_sec`,
  `end_time_sec`, `headway_sec`, `exact_times`.
- **Shape (compact)**: Attributes: `shape_id`, `feed_id`, encoded
  geometry (polyline6 or fixed-point delta varint), bounding box,
  dedup hash.
- **Stop (compact)**: Attributes: `stop_internal_id`, `feed_id`,
  `name`, `lat_e6`, `lon_e6`, optional `parent_station_internal_id`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a reference feed of 10 k trips / 300 k stop_times,
  total database footprint (data + indexes) is **≤ 30%** of the current
  baseline.
- **SC-002**: Import time for the reference feed is **≤ 120%** of the
  current baseline (up to 20% slowdown tolerated in exchange for the
  space savings).
- **SC-003**: p95 latency of `/api/stops/:id/departures?date=…` stays
  **≤ 200 ms** under a warmed cache (matching current p95).
- **SC-004**: Re-import of the same feed is a no-op in **≤ 5 s**
  (idempotency check short-circuits the pipeline).
- **SC-005**: A contract-replay suite over recorded `/api/*` fixtures
  passes with **100%** deep-equality match.
- **SC-006**: Shape Hausdorff distance between compressed and original
  geometries is **≤ 5 m** on 99% of shapes.

## Assumptions

- The public API contracts under `specs/001-gtfs-bus-map/contracts/`
  are authoritative and frozen for the scope of this feature.
- The frontend (`bus-map-web`) is not modified.
- A one-off re-ingest of existing feeds is acceptable; no online schema
  migration of legacy rows is required.
- PostgreSQL 17 + PostGIS 3 with default `TOAST` tuning is available
  (matches the provisioning performed by `provision.mjs`).
- PMTiles generation continues to rely on `tippecanoe` consuming GeoJSON
  emitted by the backend; the compressed shape representation is a
  storage concern, not a tile-generation concern.

## Out of Scope

- Changes to `bus-map-web` or to any response shape under `/api/*`.
- Real-time GTFS-RT ingestion (reserved for a future spec).
- Multi-tenant feed isolation beyond the `feed_id` scoping already
  required for ID mapping.
- Custom binary on-disk format outside PostgreSQL; page-level compression
  and application-level encoding (polyline, varint) are in scope,
  replacing the storage engine is not.
