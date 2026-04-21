# Data Model: Compact GTFS Storage

**Feature**: `002-compact-gtfs-storage` | **Phase**: 1 | **Date**: 2026-04-21

Compact schema introduced alongside the existing GTFS tables. Legacy
tables stay until a follow-up migration drops them after full re-ingest.
All new tables live in the default `public` schema; column names are
snake_case to match Drizzle conventions.

---

## Entity diagram (logical)

```text
feed_catalog_entries (existing, extended)
       │ 1
       │
       ▼ N
┌──────────────────────────────────────────────────────────────────┐
│ per-feed id-map tables                                            │
│   feed_stops (feed_id, external_id, internal_id)                  │
│   feed_routes (feed_id, external_id, internal_id)                 │
│   feed_trips (feed_id, external_id, internal_id)                  │
│   feed_services (feed_id, external_id, internal_id)               │
│   feed_shapes (feed_id, external_id, internal_id)                 │
│   feed_agencies (feed_id, external_id, internal_id)               │
└──────────────────────────────────────────────────────────────────┘

stops_compact                 shapes_compact                agencies_compact
(feed_id, internal_id,         (feed_id, internal_id,        (feed_id, internal_id,
 name, lat_e6, lon_e6,          polyline6, simplify_eps_m,    name, url, tz)
 parent_internal_id,            shape_hash, bbox geometry)
 geom GENERATED)
         ▲                              ▲
         │ (referenced by patterns)     │ (referenced by trips)
         │                              │
stop_patterns ────── pattern_stops (pattern_id, seq, stop_internal_id,
                                     offset_arrival_sec,
                                     offset_departure_sec)
         ▲
         │ 1
         │ N
trips_compact (feed_id, internal_id, route_internal_id,
               service_internal_id, pattern_id, start_time_sec,
               shape_internal_id, direction_id, headsign)
         │
         │ 0..1
         ▼
frequencies_compact (trip_internal_id, start_time_sec, end_time_sec,
                     headway_sec, exact_times)

routes_compact (feed_id, internal_id, agency_internal_id,
                short_name, long_name, route_type, color, text_color)

calendar_compact (feed_id, service_internal_id,
                  monday…sunday BOOL, start_date, end_date)
calendar_dates_compact (feed_id, service_internal_id, date, exception_type)
```

---

## Table specifications

### `feed_catalog_entries` (extended)

Existing table. Add two columns:

| Column                  | Type        | Nullable | Notes                                               |
|-------------------------|-------------|----------|-----------------------------------------------------|
| `last_imported_sha256`  | `CHAR(64)`  | YES      | SHA256 at last successful compact import            |
| `pipeline_version`      | `SMALLINT`  | NO       | Default `2`; bump when pipeline semantics change    |

### `feed_<kind>` (id-map tables)

One table per entity kind. Identical shape:

| Column        | Type        | Notes                                          |
|---------------|-------------|------------------------------------------------|
| `feed_id`     | `UUID`      | FK → `feed_catalog_entries(id)`                |
| `external_id` | `TEXT`      | Original GTFS ID                               |
| `internal_id` | `INTEGER`   | `SERIAL` scoped per feed (generated via sequence or `MAX+1` under lock) |
| Primary key   | `(feed_id, external_id)` | |
| Unique        | `(feed_id, internal_id)` | |

Index: `idx_<kind>_internal (feed_id, internal_id)` for reverse lookup.

### `stops_compact`

| Column                | Type        | Notes                                          |
|-----------------------|-------------|------------------------------------------------|
| `feed_id`             | `UUID`      | FK                                             |
| `internal_id`         | `INTEGER`   | References `feed_stops.internal_id`           |
| `name`                | `TEXT`      |                                                |
| `lat_e6`              | `INTEGER`   | lat × 1e6, `INT4`                              |
| `lon_e6`              | `INTEGER`   | lon × 1e6, `INT4`                              |
| `parent_internal_id`  | `INTEGER`   | Nullable; self-ref                             |
| `geom`                | `geometry(Point, 4326)` | `GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon_e6::double precision/1e6, lat_e6::double precision/1e6), 4326)) STORED` |
| Primary key           | `(feed_id, internal_id)` | |

Indexes: GIST on `geom`; `idx_stops_name_trgm` (optional) for search.

### `shapes_compact`

| Column               | Type        | Notes                                            |
|----------------------|-------------|--------------------------------------------------|
| `feed_id`            | `UUID`      |                                                  |
| `internal_id`        | `INTEGER`   |                                                  |
| `polyline6`          | `TEXT`      | Google polyline-6 encoded                         |
| `simplify_eps_m`     | `REAL`      | DP tolerance used at import (default 5.0)         |
| `shape_hash`         | `BIGINT`    | `xxhash64(polyline6)` — dedup key                |
| `bbox`               | `geometry(Polygon, 4326)` | Rect from min/max of decoded coords |
| Primary key          | `(feed_id, internal_id)` |                                    |
| Unique               | `(feed_id, shape_hash)` | Enforces intra-feed dedup           |

Index: GIST on `bbox`.

### `agencies_compact`

| Column       | Type      | Notes                       |
|--------------|-----------|-----------------------------|
| `feed_id`    | `UUID`    |                             |
| `internal_id`| `INTEGER` |                             |
| `name`       | `TEXT`    |                             |
| `url`        | `TEXT`    |                             |
| `tz`         | `TEXT`    | IANA timezone               |
| `coverage`   | `geometry(MultiPolygon, 4326)` | Derived at import  |
| Primary key  | `(feed_id, internal_id)` |              |

Index: GIST on `coverage`.

### `routes_compact`

| Column                  | Type        | Notes                                 |
|-------------------------|-------------|---------------------------------------|
| `feed_id`               | `UUID`      |                                       |
| `internal_id`           | `INTEGER`   |                                       |
| `agency_internal_id`    | `INTEGER`   | FK within feed                        |
| `short_name`            | `TEXT`      |                                       |
| `long_name`             | `TEXT`      |                                       |
| `route_type`            | `SMALLINT`  | GTFS route_type code                  |
| `color`                 | `CHAR(6)`   | hex, no `#`                           |
| `text_color`            | `CHAR(6)`   |                                       |
| Primary key             | `(feed_id, internal_id)` |                          |

Index: `(feed_id, agency_internal_id)`.

### `stop_patterns`

| Column        | Type        | Notes                                 |
|---------------|-------------|---------------------------------------|
| `pattern_id`  | `BIGSERIAL` | Global (not scoped per feed)          |
| `feed_id`     | `UUID`      |                                       |
| `stop_count`  | `SMALLINT`  |                                       |
| `duration_sec`| `INTEGER`   | Offset of last stop                    |
| `pattern_hash`| `BIGINT`    | `xxhash64(flattened tuples)` — dedup  |
| Primary key   | `pattern_id` |                                      |
| Unique        | `(feed_id, pattern_hash)` |                          |

### `pattern_stops`

| Column                  | Type        | Notes                                   |
|-------------------------|-------------|-----------------------------------------|
| `pattern_id`            | `BIGINT`    | FK → `stop_patterns.pattern_id`        |
| `seq`                   | `SMALLINT`  | 0-based position                        |
| `stop_internal_id`      | `INTEGER`   | FK within feed                          |
| `offset_arrival_sec`    | `INTEGER`   | Seconds from pattern start              |
| `offset_departure_sec`  | `INTEGER`   | Seconds from pattern start              |
| Primary key             | `(pattern_id, seq)` |                               |

Index: `(stop_internal_id, pattern_id)` — enables "departures at stop X".

### `trips_compact`

| Column                  | Type        | Notes                                   |
|-------------------------|-------------|-----------------------------------------|
| `feed_id`               | `UUID`      |                                         |
| `internal_id`           | `INTEGER`   |                                         |
| `route_internal_id`     | `INTEGER`   | FK within feed                          |
| `service_internal_id`   | `INTEGER`   | FK within feed                          |
| `pattern_id`            | `BIGINT`    | FK                                      |
| `start_time_sec`        | `INTEGER`   | Absolute start, 0–172 800               |
| `shape_internal_id`     | `INTEGER`   | Nullable; FK within feed                |
| `direction_id`          | `SMALLINT`  | 0, 1 or NULL                            |
| `headsign`              | `TEXT`      | Nullable                                |
| Primary key             | `(feed_id, internal_id)` |                            |

Indexes: `(pattern_id, service_internal_id, start_time_sec)`,
`(feed_id, route_internal_id)`.

### `frequencies_compact`

| Column               | Type        | Notes                                    |
|----------------------|-------------|------------------------------------------|
| `feed_id`            | `UUID`      |                                          |
| `trip_internal_id`   | `INTEGER`   |                                          |
| `start_time_sec`     | `INTEGER`   |                                          |
| `end_time_sec`       | `INTEGER`   |                                          |
| `headway_sec`        | `INTEGER`   |                                          |
| `exact_times`        | `BOOLEAN`   | GTFS semantics                           |
| Primary key          | `(feed_id, trip_internal_id, start_time_sec)` |           |

### `calendar_compact` / `calendar_dates_compact`

Direct GTFS calendar semantics but keyed on `(feed_id, service_internal_id)`:

`calendar_compact`: `monday…sunday BOOLEAN NOT NULL`, `start_date DATE`,
`end_date DATE`.

`calendar_dates_compact`: `(feed_id, service_internal_id, date DATE,
exception_type SMALLINT)`. `exception_type` 1 = added, 2 = removed.

Primary keys mirror the GTFS natural keys scoped per feed.

---

## Validation rules

- `offset_arrival_sec <= offset_departure_sec` per `pattern_stops` row.
- `0 <= start_time_sec <= 172 800`.
- `lat_e6` ∈ `[-90_000_000, 90_000_000]`, `lon_e6` ∈ `[-180_000_000, 180_000_000]`.
- `shape_hash` uniqueness enforced per feed.
- `pattern_hash` uniqueness enforced per feed.
- FK from `trips_compact.shape_internal_id` optional; FK to
  `feed_shapes` must resolve when non-null.

---

## State transitions (importer)

```text
feed_catalog_entries.import_status:
  pending ──► downloading ──► importing ──► ready
                                         └► failed (with error_message)

Idempotency short-circuit:
  hash_sha256 == last_imported_sha256
    AND pipeline_version == 2
    → import_status stays 'ready'; update last_checked_at only.
```

---

## Mapping to public API (readers MUST expand compact → contract)

| Public endpoint                   | Source tables                                                                                          |
|-----------------------------------|--------------------------------------------------------------------------------------------------------|
| `GET /api/agencies?bbox=…`        | `agencies_compact` + `feed_agencies`                                                                   |
| `GET /api/routes?agencyId=…`      | `routes_compact` + `feed_routes` + `feed_agencies`                                                      |
| `GET /api/routes/:id`             | `routes_compact` + `shapes_compact` (decoded via polyline6)                                            |
| `GET /api/stops/:id`              | `stops_compact` + `feed_stops`; serving routes via `pattern_stops` → `trips_compact` → `routes_compact` |
| `GET /api/stops/:id/departures`   | `pattern_stops` (filter `stop_internal_id`) → `trips_compact` (+ `frequencies_compact` expansion) → `calendar_compact/_dates_compact` |
| `GET /api/trips/:id`              | `trips_compact` + `pattern_stops` (stop times reconstructed) + `shapes_compact`                        |

Every reader MUST output the original GTFS string IDs by joining against
the appropriate `feed_<kind>` mapping table before serialising.

---

## Migration strategy

- `0002_compact_storage.sql` — add all new tables + indexes; does not
  drop legacy tables.
- Operator runs `pnpm import-feed --mobility-id <id>` once per feed to
  repopulate under the compact schema.
- `0003_drop_legacy_gtfs.sql` — drops legacy tables. Gated on Phase 2
  task completion and manual ack.
