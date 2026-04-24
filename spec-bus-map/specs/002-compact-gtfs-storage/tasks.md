---
description: "Task list for feature 002-compact-gtfs-storage"
---

# Tasks: Compact GTFS Storage

**Input**: Design documents from `/specs/002-compact-gtfs-storage/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. The constitution's Testing Standards principle plus spec
success criteria SC-005 (contract replay) and SC-006 (shape fidelity) make
tests mandatory for this feature.

**Organization**: Tasks are grouped by user story so US1 / US2 / US3 can be
delivered independently. All paths are absolute to the repo root
`bus-map-api/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file + no dependency on an incomplete task → can run in parallel
- **[Story]**: US1 / US2 / US3 — maps to spec.md user stories
- File paths are exact

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add new runtime deps, scaffold new lib directory, prepare bench tooling.

- [X] T001 Add runtime deps `@mapbox/polyline`, `simplify-js`, `xxhash-wasm` to `bus-map-api/package.json` via `pnpm add`
- [X] T002 [P] Add dev deps `@types/mapbox__polyline`, `@types/simplify-js` to `bus-map-api/package.json`
- [X] T003 [P] Create empty module stubs (no implementation): `bus-map-api/src/lib/polyline-codec.ts`, `bus-map-api/src/lib/id-mapper.ts`, `bus-map-api/src/lib/pattern-builder.ts`, `bus-map-api/src/lib/frequency-detector.ts`, `bus-map-api/src/lib/shape-dedup.ts`
- [X] T004 [P] Create empty bench script `bus-map-api/src/scripts/bench-footprint.ts` with CLI arg parsing only (`--mobility-id`, `--output`, `--compare`, `--baseline`, `--candidate`)
- [X] T005 [P] Create `bus-map-api/tests/fixtures/feeds/tld-576-small/` placeholder + README describing expected contents (trimmed GTFS zip ≤ 2 MB for CI)
- [X] T006 [P] Create `bus-map-api/bench/.gitkeep` (output directory for baseline and candidate JSON)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Library primitives + new schema + migration. All user stories
depend on these.

**CRITICAL**: No user story tasks may begin until this phase is complete.

### Library primitives (TDD: test first)

- [X] T007 [P] Write unit test `bus-map-api/tests/unit/polyline-codec.test.ts` — round-trip encode/decode, empty input, precision assertions
- [X] T008 [P] Write unit test `bus-map-api/tests/unit/id-mapper.test.ts` — `getOrCreate` idempotency, `reverse` consistency, per-feed scoping
- [X] T009 [P] Write unit test `bus-map-api/tests/unit/pattern-builder.test.ts` — two trips same stops/offsets → same hash, overnight `>24:00:00` preserved
- [X] T010 [P] Write unit test `bus-map-api/tests/unit/frequency-detector.test.ts` — run ≥ 4 evenly spaced collapses, uneven run stays plain, min-run threshold
- [X] T011 [P] Write unit test `bus-map-api/tests/unit/shape-dedup.test.ts` — identical polylines hash-equal, DP tolerance cuts point count, Hausdorff ≤ 5 m
- [X] T012 [P] Implement `encodePolyline6` / `decodePolyline6` in `bus-map-api/src/lib/polyline-codec.ts` using `@mapbox/polyline` with precision 6
- [X] T013 [P] Implement `IdMapper` class in `bus-map-api/src/lib/id-mapper.ts` with in-memory cache + persistent `feed_<kind>` upsert; fixed seed for stable integers
- [X] T014 [P] Implement `buildPattern` + `hashPattern` in `bus-map-api/src/lib/pattern-builder.ts` using `xxhash-wasm` with seed `PATTERN_HASH_SEED`
- [X] T015 [P] Implement `collapseToFrequencies` in `bus-map-api/src/lib/frequency-detector.ts` (min run 4, exact-equal gaps)
- [X] T016 [P] Implement `simplifyAndHash` in `bus-map-api/src/lib/shape-dedup.ts` using `simplify-js` (mercator-metres) + polyline6 + xxhash64

### Schema + migration

- [X] T017 Update Drizzle schema `bus-map-api/src/db/schema.ts` — add compact tables (`feed_stops`, `feed_routes`, `feed_trips`, `feed_services`, `feed_shapes`, `feed_agencies`, `stops_compact`, `shapes_compact`, `routes_compact`, `agencies_compact`, `stop_patterns`, `pattern_stops`, `trips_compact`, `frequencies_compact`, `calendar_compact`, `calendar_dates_compact`) + extend `feed_catalog_entries` with `last_imported_sha256`, `pipeline_version`
- [X] T018 Generate migration via `pnpm db:generate` and hand-polish `bus-map-api/src/db/migrations/0002_compact_storage.sql` to include: GENERATED `geom` on `stops_compact`, GIST indexes on `stops_compact.geom` / `shapes_compact.bbox` / `agencies_compact.coverage`, unique `(feed_id, pattern_hash)` on `stop_patterns`, unique `(feed_id, shape_hash)` on `shapes_compact`, all `ON DELETE CASCADE` from `feed_catalog_entries`
- [X] T019 Run `pnpm db:migrate` against `busmapdb`; assert new tables + indexes exist (manual smoke check in quickstart.md step 1)

**Checkpoint**: Primitives tested, schema in place, ready for user stories.

---

## Phase 3: User Story 1 — Operator ingests a large feed (Priority: P1) 🎯 MVP

**Goal**: New importer reduces DB footprint ≥ 70% on the reference feed
while remaining idempotent on same-SHA re-imports.

**Independent Test**: Run `pnpm import-feed --mobility-id tld-576` on a
clean DB. Compare `bench-footprint` JSON against baseline; assert size
reduction ≥ 70% (SC-001) and re-import ≤ 5 s (SC-004).

### Tests for User Story 1

- [X] T020 [P] [US1] Write integration test `bus-map-api/tests/integration/import-footprint.test.ts` — imports the fixture feed, queries `pg_total_relation_size` per table, asserts ≥ 70% reduction vs baseline JSON in `tests/fixtures/baseline-tld-576-small.json`
- [X] T021 [P] [US1] Write integration test `bus-map-api/tests/integration/import-idempotency.test.ts` — second import with same SHA completes in ≤ 5 s and leaves row counts unchanged
- [X] T022 [P] [US1] Write integration test `bus-map-api/tests/integration/import-incremental.test.ts` — reimport with mutated SHA updates only changed entities; internal IDs of unchanged stops remain stable

### Implementation for User Story 1

- [X] T023 [US1] Implement id-mapping stage in `bus-map-api/src/jobs/stages/id-map.stage.ts` — ingests all GTFS CSVs' IDs and populates `feed_<kind>` tables transactionally
- [X] T024 [P] [US1] Implement stops stage in `bus-map-api/src/jobs/stages/stops.stage.ts` — writes `stops_compact` with `lat_e6` / `lon_e6`; relies on `IdMapper`
- [X] T025 [P] [US1] Implement shapes stage in `bus-map-api/src/jobs/stages/shapes.stage.ts` — per shape: `simplifyAndHash` → upsert on `(feed_id, shape_hash)`
- [X] T026 [US1] Implement patterns stage in `bus-map-api/src/jobs/stages/patterns.stage.ts` — group `stop_times` by trip, build pattern tuples, upsert `stop_patterns` + `pattern_stops` keyed by `pattern_hash` (depends on T023, T024)
- [X] T027 [US1] Implement trips+frequencies stage in `bus-map-api/src/jobs/stages/trips.stage.ts` — materialise `trips_compact`, then call `collapseToFrequencies` per `(pattern_id, service_id)` group, write `frequencies_compact` for detected runs (depends on T026)
- [X] T028 [P] [US1] Implement calendar stage in `bus-map-api/src/jobs/stages/calendar.stage.ts` — load `calendar.txt` + `calendar_dates.txt` into `calendar_compact` / `calendar_dates_compact`
- [X] T029 [P] [US1] Implement agencies + routes stage in `bus-map-api/src/jobs/stages/agencies-routes.stage.ts` — populate `agencies_compact` + `routes_compact`; compute `coverage` MultiPolygon from stop bbox union
- [X] T030 [US1] Rewrite `bus-map-api/src/jobs/feed-download.job.ts` to invoke the stages in order (`id-map → stops, shapes, agencies-routes → patterns → trips → calendar`), inside one transaction, with `statement_timeout = 0`; preserve the `pending → downloading → importing → ready/failed` state machine
- [X] T031 [US1] Implement idempotency short-circuit in `feed-download.job.ts`: early-return when `hash_sha256 == last_imported_sha256 && pipeline_version == 2`; update `last_checked_at` only
- [ ] T032 [US1] Implement incremental-update logic — per-stage hash comparison (stop hash, shape hash, pattern hash) so only changed entities are rewritten; tombstone rows for IDs that disappeared
- [X] T033 [US1] Update `bus-map-api/src/scripts/import-feed.ts` to keep CLI flags unchanged (`--mobility-id`, `--url`, `--provider`) while calling the new pipeline via `feed-download.job.ts`
- [X] T034 [P] [US1] Implement `bus-map-api/src/scripts/bench-footprint.ts` — query `pg_total_relation_size` + `pg_indexes_size` for all compact + legacy tables; emit JSON; `--compare` prints per-table deltas and total reduction %

**Checkpoint**: Running `pnpm import-feed --mobility-id tld-576` on a
clean DB populates only compact tables; bench shows ≥ 70% reduction.

---

## Phase 4: User Story 2 — Client reads departures with unchanged contracts (Priority: P1)

**Goal**: Every public API endpoint returns a JSON payload byte-for-byte
equivalent to the legacy pipeline.

**Independent Test**: Record fixture responses from the legacy API; run
`pnpm test tests/integration/contract-replay.test.ts` on the compact API;
expect 100% deep equality (SC-005).

### Tests for User Story 2

- [X] T035 [P] [US2] Write contract-replay harness `bus-map-api/tests/integration/contract-replay.test.ts` — loads paired fixtures (request list + expected JSON) under `tests/fixtures/contract-replay/`; issues each request via supertest; asserts `toStrictEqual`
- [ ] T036 [P] [US2] Record baseline fixtures by running the legacy pipeline against the small feed and snapshotting responses for `/api/agencies`, `/api/routes`, `/api/routes/:id`, `/api/stops/:id`, `/api/stops/:id/departures?date=YYYY-MM-DD`, `/api/trips/:id` → commit under `bus-map-api/tests/fixtures/contract-replay/`
- [X] T037 [P] [US2] Write unit test `bus-map-api/tests/unit/schedule-expander.test.ts` — assert pattern offsets + trip start + frequencies expansion reconstructs `HH:MM:SS` matching source `stop_times` to the second; includes overnight `24:00:00+` case

### Implementation for User Story 2

- [X] T038 [P] [US2] Implement `expandDeparturesForStop` in `bus-map-api/src/services/schedule.service.ts` — query `pattern_stops` by `stop_internal_id`, join `trips_compact` + `frequencies_compact`, apply calendar resolution, emit sorted `HH:MM:SS` strings (depends on T014)
- [X] T039 [P] [US2] Implement `getStopById` rewrite in `bus-map-api/src/services/stop.service.ts` — fetch `stops_compact` row, resolve `feed_stops.external_id`, aggregate serving routes via `pattern_stops → trips_compact → routes_compact`
- [X] T040 [P] [US2] Implement `getAgenciesInBbox` in `bus-map-api/src/services/agency.service.ts` — `ST_Intersects` on `agencies_compact.coverage`; map `internal_id → external_id`
- [X] T041 [US2] Update `bus-map-api/src/routes/stops.ts` to consume the rewritten `stop.service.ts`; response shape unchanged
- [X] T042 [US2] Update `bus-map-api/src/routes/departures.ts` to consume `expandDeparturesForStop`
- [X] T043 [P] [US2] Update `bus-map-api/src/routes/agencies.ts` to consume `getAgenciesInBbox`
- [X] T044 [P] [US2] Update `bus-map-api/src/routes/routes.ts` — list by agency: join `routes_compact + feed_routes + feed_agencies`; detail: decode `polyline6 → GeoJSON LineString` for the response shape field
- [X] T045 [P] [US2] Update `bus-map-api/src/routes/trips.ts` — reconstruct per-trip stop times by adding `trip.start_time_sec` to pattern offsets; resolve external IDs
- [X] T046 [US2] Audit every service for internal_id leakage; add an ESLint rule or a runtime guard in `bus-map-api/src/lib/contract-guard.ts` asserting no `internal_id` key appears in serialised responses

**Checkpoint**: Contract-replay green; frontend on `main` continues to
render identically against the compact backend.

---

## Phase 5: User Story 3 — Tile generation remains correct (Priority: P2)

**Goal**: `gen-tiles.ts` emits PMTiles indistinguishable from the legacy
pipeline despite polyline6 + DP simplification on shapes.

**Independent Test**: Run `pnpm tsx src/scripts/gen-tiles.ts <feedId>`;
decode output PMTiles; compare against legacy PMTiles; Hausdorff per
shape ≤ 5 m on ≥ 99% of shapes (SC-006).

### Tests for User Story 3

- [X] T047 [P] [US3] Write integration test `bus-map-api/tests/integration/shape-fidelity.test.ts` — iterates every `shapes_compact` row, decodes via `decodePolyline6`, computes Hausdorff vs original fixture geometry, asserts ≤ 5 m on ≥ 99% of shapes
- [X] T048 [P] [US3] Write integration test `bus-map-api/tests/integration/tile-gen-parity.test.ts` — generates tiles from compact DB, diffs feature counts vs recorded baseline `tests/fixtures/tiles/tld-576-routes.geojson`

### Implementation for User Story 3

- [X] T049 [US3] Update tile-gen GeoJSON writer in `bus-map-api/src/jobs/tile-gen.job.ts` — when reading shapes, call `decodePolyline6` before emitting `LineString` features; keep feature properties identical to legacy output
- [X] T050 [P] [US3] Update `bus-map-api/src/scripts/gen-tiles.ts` to source shapes from `shapes_compact` via `feed_shapes` mapping; CLI unchanged
- [X] T051 [P] [US3] Add stop-feature writer path for stops from `stops_compact` (convert `lat_e6/lon_e6 → LineString-free Point features`); mirror legacy output property names

**Checkpoint**: Frontend renders tiles from compact data with no visual
regression; fidelity tests green.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, docs, perf gate, legacy removal.

- [X] T052 [P] Add perf benchmark `bus-map-api/tests/integration/departures-latency.bench.ts` measuring p95 of `GET /api/stops/:id/departures` over 1 000 requests with warm cache; fail if p95 > 200 ms (SC-003)
- [X] T053 [P] Add `bench:footprint` and `bench:latency` scripts to `bus-map-api/package.json`
- [X] T054 [P] Update `README.md` at repo root — document compact storage + point at `spec-bus-map/specs/002-compact-gtfs-storage/quickstart.md`
- [X] T055 [P] Update `bus-map-api/.env.example` — add `PIPELINE_VERSION=2` for transparency (read-only)
- [X] T056 Create follow-up migration `bus-map-api/src/db/migrations/0003_drop_legacy_gtfs.sql` — drops legacy `stops`, `routes`, `trips`, `stop_times`, `shapes`, `calendar`, `calendar_dates` tables; **do not run** until operator has re-ingested every feed
- [X] T057 [P] Execute `spec-bus-map/specs/002-compact-gtfs-storage/quickstart.md` end-to-end on a clean DB; record final bench output in `bench/compact-tld-576.json`; attach to PR description
- [X] T058 [P] Run `pnpm lint` + `pnpm test` (unit + integration) across `bus-map-api`; fix any regressions introduced in US1–US3

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** — no deps.
- **Phase 2 (Foundational)** — depends on Phase 1. Blocks all stories.
- **Phase 3 (US1)** — depends on Phase 2. Delivers MVP.
- **Phase 4 (US2)** — depends on Phase 2. Independently deliverable once US1 has ingested data (US2 tests can use the fixture the US1 pipeline produces).
- **Phase 5 (US3)** — depends on Phase 2 + US1 ingestion. Low risk once shapes are in compact form.
- **Phase 6 (Polish)** — depends on all user stories.

### User Story Dependencies

- **US1** — standalone; requires Phase 2 primitives.
- **US2** — consumes compact data produced by US1 but its own code (services + routes) is independent; the two phases can be developed in parallel if tests use a fixture DB pre-populated by US1.
- **US3** — consumes `shapes_compact` from US1; tile-gen code is orthogonal to read-path code in US2.

### Within each user story

- Tests written first; watch them fail; then implement.
- Models / primitives before services before routes.
- Don't move to next story's checkpoint until current story passes its independent test.

### Parallel Opportunities

- Phase 1: T002–T006 in parallel (different files).
- Phase 2: all T007–T011 unit tests in parallel; all T012–T016 implementations in parallel (different files, no mutual deps). T017 / T018 / T019 sequential.
- Phase 3: T020–T022 tests in parallel; stage modules T024 / T025 / T028 / T029 / T034 can be built in parallel; T026, T027, T030, T031, T032 are sequential within the pipeline.
- Phase 4: T035–T037 tests in parallel; T038–T040, T043–T045 services/routes in parallel; T041, T042, T046 sequential gates.
- Phase 5: T047–T048 tests in parallel; T050 / T051 in parallel.
- Phase 6: T052–T055, T057–T058 in parallel; T056 sequential last.

---

## Parallel Example: User Story 1

```bash
# Kick off US1 tests (written, failing):
Task: "Integration test for footprint reduction in bus-map-api/tests/integration/import-footprint.test.ts"
Task: "Integration test for idempotency in bus-map-api/tests/integration/import-idempotency.test.ts"
Task: "Integration test for incremental update in bus-map-api/tests/integration/import-incremental.test.ts"

# Then parallelise orthogonal stages:
Task: "Implement stops stage in bus-map-api/src/jobs/stages/stops.stage.ts"
Task: "Implement shapes stage in bus-map-api/src/jobs/stages/shapes.stage.ts"
Task: "Implement calendar stage in bus-map-api/src/jobs/stages/calendar.stage.ts"
Task: "Implement agencies+routes stage in bus-map-api/src/jobs/stages/agencies-routes.stage.ts"
Task: "Implement bench-footprint script in bus-map-api/src/scripts/bench-footprint.ts"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 (Setup)
2. Phase 2 (Foundational) — strict blocker
3. Phase 3 (US1)
4. Stop + validate: bench-footprint shows ≥ 70% reduction on the fixture; idempotency check ≤ 5 s
5. Deploy / demo

### Incremental Delivery

1. Foundation ready (Phase 1 + Phase 2)
2. US1 → bench gate passes → merge
3. US2 → contract-replay green → merge (frontend unchanged, safe to release)
4. US3 → tile fidelity green → merge
5. Phase 6 polish → drop legacy tables (`0003_drop_legacy_gtfs.sql`) in a separate, gated PR after all operators have re-ingested

### Parallel Team Strategy

- Dev A: Phase 2 primitives (polyline-codec, pattern-builder, shape-dedup).
- Dev B: Phase 2 schema + migrations.
- Once Phase 2 done:
  - Dev A → US1 pipeline stages.
  - Dev B → US2 read services + contract-replay harness (using pre-populated fixture DB).
  - Dev C → US3 tile-gen rewiring (starts as soon as `shapes_compact` has data).

---

## Notes

- `[P]` = distinct file + no unfinished task dependency.
- Tests are not optional for this feature — SC-005 and SC-006 require
  them as acceptance evidence.
- Never leak `internal_id` values in HTTP responses (see
  `contracts/storage-contract.md`, reader contract).
- Do not merge `0003_drop_legacy_gtfs.sql` automatically; gate it behind
  explicit operator acknowledgement in the PR.
- Commit per task (`T0NN description`) to match the constitution's
  atomic-commit requirement.
