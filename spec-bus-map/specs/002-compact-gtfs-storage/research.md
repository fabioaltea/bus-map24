# Research: Compact GTFS Storage

**Feature**: `002-compact-gtfs-storage` | **Phase**: 0 | **Date**: 2026-04-21

This document records the technology and algorithm decisions that back the
implementation plan. Each decision follows the format:

- **Decision** — the chosen approach
- **Rationale** — why it was chosen
- **Alternatives considered** — what else was evaluated and why rejected

---

## 1. `stop_times` reduction strategy

### Decision

Store a dedicated `stop_patterns` table containing the canonical sequence
of `(stop_internal_id, offset_arrival_sec, offset_departure_sec)` tuples
for each distinct trip path. `trips` references a `pattern_id` and carries
a single `start_time_sec`. Per-trip `stop_times` are **derived at read
time** by adding `trip.start_time_sec` to every pattern offset.

### Rationale

- Empirical ratio on typical feeds: 10–30 patterns per route, thousands of
  trips per pattern. Eliminates 80–95 % of `stop_times` rows — the single
  largest saving with the simplest semantics.
- Preserves full fidelity: pattern offsets are lossless wrt. original
  GTFS (seconds-level), so reconstruction equals source.
- Queries "departures at stop X at time T" become: find patterns that
  include X → compute `T' = T - offset_at_X` → trips with
  `start_time_sec = T'`. An index on `(pattern_id, stop_internal_id)`
  (already needed for reverse lookup) makes this cheap.

### Alternatives considered

- **Raw `stop_times` + page compression (Postgres TOAST).** Rejected —
  page compression on narrow integer rows yields ~2–3 ×, versus ~10–20 ×
  for pattern dedup. Not additive enough alone.
- **Columnar extension (e.g., `cstore_fdw`).** Rejected — complicates
  deployment; no need once patterns absorb the ratio.
- **Storing only the first `stop_time` per trip and computing the rest
  from `shape_dist_traveled`.** Rejected — requires trustworthy
  `shape_dist_traveled`, absent or inconsistent in many real feeds.

---

## 2. Integer surrogate IDs

### Decision

Per-feed mapping tables `feed_stops`, `feed_routes`, `feed_trips`,
`feed_services`, `feed_shapes`, `feed_agencies`. Each holds
`(feed_id, external_id TEXT, internal_id SERIAL)`. All foreign keys in
compact tables use `internal_id` (INT or SMALLINT depending on cardinality
ceiling).

### Rationale

- GTFS IDs like `"STOP_CENTRO_A_45"` are on average 12–40 bytes; replaced
  by 4-byte INT saves 3–10 × on FK columns alone, which dominate
  `stop_times`-replacement storage.
- INT FKs deliver faster joins and narrower b-tree indexes than TEXT.
- Scoped per-feed: two feeds can re-use the same external string without
  collision (spec Edge Case).

### Alternatives considered

- **Global integer space across feeds.** Rejected — requires coordinating
  an allocation sequence across parallel imports; scoping per feed is
  simpler and sufficient.
- **Hash-based integer ID (xxhash → INT64).** Rejected — possible
  collisions force a disambiguation column anyway, giving no net benefit.
- **Keep TEXT IDs, rely on Postgres `TOAST` + b-tree prefix dedup.**
  Rejected — leaves 2–3 × on the table; does not help index size.

---

## 3. Time encoding

### Decision

Store all arrival/departure times as `INTEGER seconds since 00:00 local`
(pattern offsets) and `INTEGER start_time_sec` on trips. Range
`[0, 172 800]` — covers overnight services (GTFS allows `>= 24:00:00`).
No `TIME` / `TIMESTAMP` / `TEXT "HH:MM:SS"` in storage.

### Rationale

- 4 bytes vs. 8 bytes for `TIME` vs. ~9 bytes for `"HH:MM:SS"`.
- Integer arithmetic for "departures in next 30 min": a single `BETWEEN`
  range; no timezone/format parsing in hot path.
- Fits natively into varint/delta encoding if ever needed at an outer
  tier (see §5).

### Alternatives considered

- **`TIME WITHOUT TIME ZONE`.** Rejected — cannot represent 24:00–48:00
  overnight values in Postgres; also 8 bytes.
- **`SMALLINT` (16-bit, 65 535 s).** Rejected — 65 535 ≈ 18:12; too small.

---

## 4. Coordinate encoding

### Decision

Persist latitude/longitude as `INTEGER` fixed-point (value × 1e6), stored
as `lat_e6 INT4` + `lon_e6 INT4`. PostGIS `geometry(Point, 4326)` column
on `stops` is **generated** from `lat_e6/lon_e6` via a `GENERATED ALWAYS
AS (ST_MakePoint(lon_e6/1e6::double, lat_e6/1e6::double))::geometry(Point,4326) STORED`
expression, with a GIST index for bbox queries.

### Rationale

- 1e6 resolution ≈ 11 cm at the equator — two orders of magnitude better
  than bus-stop GPS accuracy; well within GTFS precision (6 decimals).
- 8 bytes (2 × INT4) vs. 16 bytes for two `DOUBLE PRECISION` columns —
  halves the per-row footprint for millions of shape points.
- Generated geometry column keeps PostGIS queries first-class without
  forcing the application to manage both representations.

### Alternatives considered

- **Store only `geometry`, derive lat/lon at read time via
  `ST_X/ST_Y`.** Rejected — `geometry(Point, 4326)` is ~32 bytes
  (header + SRID + 2 × `DOUBLE`), larger than 2 × INT4 and non-trivial
  to compress.
- **Float32 lat/lon.** Rejected — precision at equator ~7 m, below
  comfort zone for stop placement.

---

## 5. Shape compression

### Decision

Encode each deduplicated shape as a **polyline6** string
(Google's polyline algorithm with 6-digit precision), stored in a `TEXT`
column. Apply **Douglas–Peucker simplification** with a 5 m tolerance at
import time; store the simplification epsilon alongside for traceability.
Dedup shapes by `xxhash64(polyline6)`; keep a `shape_bbox geometry` for
fast spatial filtering.

### Rationale

- Polyline6 achieves 4–8 × on realistic shapes (see industry benchmarks);
  decoders exist in every browser/server language (`@mapbox/polyline`).
- 5 m DP simplification removes visual noise below street-level zoom and
  cuts point counts 40–70 %, stacking with polyline encoding.
- Hash-based dedup catches feeds that generate fresh `shape_id`s for
  identical geometries (common GTFS authoring artefact).

### Alternatives considered

- **Raw `geometry(LineString, 4326)` + PostGIS compression.** Rejected —
  base representation is fat (~24 B per vertex), and Postgres page
  compression gives only ~2 ×.
- **Fixed-point `INT32[]` delta + zstd per shape.** Considered
  comparable in ratio but adds a binary-column decode path that the
  frontend tile pipeline never needs; polyline6 reuses mature library
  code.
- **Per-zoom simplification stored as separate rows.** Deferred — single
  5 m encoding covers all zooms the app uses; revisit if tile rendering
  introduces zoom ≥ 18 details.

---

## 6. Frequency collapse

### Decision

After pattern extraction, group trips by `(pattern_id, service_id)`;
within each group, detect runs of trips with identical gaps between
consecutive `start_time_sec`. A run of ≥ 4 evenly-spaced trips collapses
into one `frequencies` row: `(trip_internal_id, start_time_sec,
end_time_sec, headway_sec, exact_times)`. Isolated trips remain
individually materialised.

### Rationale

- Urban bus lines frequently produce dozens of identical trips per
  service day (e.g., every 10 min). One `frequencies` row per run
  replaces N trips — compression ratio scales linearly with cadence
  regularity.
- Read-time expansion is O(N) over the run, trivial and cacheable.
- Threshold of 4 trips avoids falsely collapsing short bursts.

### Alternatives considered

- **Always explode to per-trip.** Rejected — leaves the major saving on
  the table for high-cadence feeds.
- **Convert all trips to frequency, even isolated ones.** Rejected —
  one-shot trips are more clearly expressed as plain trips; forcing
  frequency adds boundary cases (start=end, headway=0).

---

## 7. Storage format — Postgres vs. columnar vs. custom binary

### Decision

Stay on PostgreSQL. Lean on built-in `TOAST` for TEXT shapes and
`ROW_FORMAT` defaults. Leave the door open to table-level
`ALTER TABLE … SET (toast_tuple_target = …)` tuning if benchmarks show
an additional win; do not introduce `cstore_fdw` or any extension
beyond PostGIS.

### Rationale

- Dedup + surrogate IDs + polyline6 already deliver the ≥ 70 % goal
  without touching the storage engine; adding a columnar FDW increases
  operational surface for marginal additional gain.
- PMTiles generation and Fastify read-path expect a single Postgres
  connection — preserves the existing deployment story.

### Alternatives considered

- **SQLite.** Rejected — BullMQ and PostGIS are Postgres-bound; SQLite
  would force a second storage engine with no clear payoff.
- **Parquet on disk + DuckDB query layer.** Rejected — overkill for the
  query patterns in scope (point lookups, small ranges).

---

## 8. Idempotency and incremental updates

### Decision

`feed_catalog_entries` already carries `hash_sha256`. Extend with
`last_imported_sha256` and a `pipeline_version SMALLINT`. The importer
early-exits when `hash_sha256 == last_imported_sha256` AND
`pipeline_version == CURRENT_PIPELINE_VERSION`. Otherwise, run the
pipeline inside a single transaction; delete rows only for entities
whose hash changed (stops: hash of name + coords; shapes:
`xxhash64(polyline6)`; patterns: hash of the tuple stream).

### Rationale

- Same-SHA short-circuit satisfies SC-004 (≤ 5 s).
- Transactional swap keeps the DB queryable through updates.
- Hash-scoped delete preserves stable surrogate IDs across versions
  (addresses FR-009 and the "feed update" edge case).

### Alternatives considered

- **Drop-and-recreate on every import.** Rejected — breaks surrogate ID
  stability and produces bloat on each cycle.
- **Logical replication / CDC from an external staging DB.** Rejected —
  infrastructure heavy; single-node Postgres is sufficient.

---

## 9. Contract-parity testing

### Decision

Introduce `tests/integration/contract-replay.test.ts`. At test setup,
ingest a known feed under both pipelines (legacy and compact) into two
separate schemas. Issue the same request against each and assert
`expect(newResponse).toStrictEqual(legacyResponse)` for every endpoint
listed in `specs/001-gtfs-bus-map/contracts/`. Fixtures live under
`bus-map-api/tests/fixtures/feeds/tld-576-small/`.

### Rationale

- Hard guard against the primary risk: compact-storage regression on
  the public JSON shape (SC-005).
- Uses the existing Vitest + supertest harness — no new runner.

### Alternatives considered

- **Schema-only contract check (JSON Schema validator).** Rejected —
  does not catch value-level regressions (e.g., departure time off by
  one second due to offset rounding).
- **Frontend-driven E2E as contract proof.** Rejected — slow and
  indirect; keep E2E scoped to UI behaviour.

---

## Summary

All items above are actionable with existing project dependencies plus
three small additions (`@mapbox/polyline`, `simplify-js`, `xxhash-wasm`).
No `NEEDS CLARIFICATION` markers remain; proceed to Phase 1.
