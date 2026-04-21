# Quickstart: Compact GTFS Storage

**Feature**: `002-compact-gtfs-storage` | **Phase**: 1 | **Date**: 2026-04-21

Canonical walkthrough for verifying that the compact storage pipeline
meets the acceptance criteria of `spec.md`. Executed by reviewers before
merging Phase 2 tasks.

---

## Prerequisites

- `provision.mjs` has run successfully (Postgres 17 + PostGIS 3 + Redis
  up, DB `busmapdb`, user `busmap`).
- A fresh branch on `002-compact-gtfs-storage`.
- Baseline measurement from the **legacy** pipeline available —
  recorded in `bench/baseline-<mobility-id>.json` before any compact-
  pipeline changes are applied. If absent:

  ```bash
  cd bus-map-api
  git stash           # park compact changes
  pnpm tsx src/scripts/bench-footprint.ts --mobility-id tld-576 \
    --output bench/baseline-tld-576.json
  git stash pop
  ```

---

## 1. Apply new migration

```bash
cd bus-map-api
pnpm db:migrate
# Expect: 0002_compact_storage.sql applied; new tables created;
# legacy tables still present.
```

Verify:

```bash
psql -U busmap -d busmapdb -c "\dt *_compact"
psql -U busmap -d busmapdb -c "\dt pattern*"
psql -U busmap -d busmapdb -c "\dt feed_*"
```

## 2. Re-import a feed under the compact pipeline

```bash
pnpm import-feed --mobility-id tld-576
# CLI surface unchanged; under the hood it runs the new stages:
#   download → id-map → stops/shapes → patterns → trips/frequencies → calendar
```

Import should finish within **120 %** of the baseline elapsed time
(SC-002).

## 3. Measure footprint

```bash
pnpm tsx src/scripts/bench-footprint.ts --mobility-id tld-576 \
  --output bench/compact-tld-576.json
pnpm tsx src/scripts/bench-footprint.ts --compare \
  --baseline bench/baseline-tld-576.json \
  --candidate bench/compact-tld-576.json
```

Expected console output:

```text
Total size reduction: 78.4 % (SC-001 target: ≥ 70 %)
  stops:            -62 %
  shapes:           -81 %
  stop_times → patterns+pattern_stops: -94 %
  trips → trips+frequencies:           -71 %
```

## 4. Contract-replay (SC-005)

```bash
pnpm test tests/integration/contract-replay.test.ts
```

The suite:

- loads the same feed in a parallel schema using the legacy importer
  (test fixture),
- runs an identical request list against both APIs,
- asserts deep equality.

PASS is mandatory for merge.

## 5. Shape fidelity (SC-006)

```bash
pnpm test tests/integration/shape-fidelity.test.ts
```

For every shape in the reference feed, the test:

- decodes the polyline6 via `decodePolyline6`,
- computes Hausdorff distance against the original point stream,
- asserts `hausdorff_m ≤ 5` on ≥ 99 % of shapes.

## 6. Idempotency (SC-004)

```bash
time pnpm import-feed --mobility-id tld-576
```

Elapsed time MUST be `≤ 5 s` and the importer log MUST read
`short-circuit: sha256 + pipeline_version match, no changes applied`.

## 7. Read-path sanity check

```bash
pnpm dev &        # start API
API=http://localhost:3000/api

# A stop with a rich schedule — compare byte-for-byte
curl -s "$API/stops/1234/departures?date=2026-04-22" > out-compact.json
# (In a parallel worktree, run legacy pipeline and dump out-legacy.json)
diff out-compact.json out-legacy.json && echo "CONTRACT OK"
```

## 8. Tile generation

```bash
pnpm tsx src/scripts/gen-tiles.ts <feedId> tld-576
# Expect: tld-576-routes.pmtiles and tld-576-stops.pmtiles regenerated
# with identical feature counts and <= 5 m geometric drift.
```

---

## Rollback

- If any of steps 3–6 fail, **do not drop legacy tables**.
- Compact tables can be wiped with:

  ```sql
  TRUNCATE TABLE trips_compact, frequencies_compact, stop_patterns,
                  pattern_stops, stops_compact, shapes_compact,
                  routes_compact, agencies_compact, calendar_compact,
                  calendar_dates_compact, feed_stops, feed_routes,
                  feed_trips, feed_services, feed_shapes,
                  feed_agencies CASCADE;
  ```

- Revert the migration with `drizzle-kit drop` targeting
  `0002_compact_storage`.

---

## Merge gate checklist

- [ ] `0002_compact_storage.sql` applied cleanly on an empty DB.
- [ ] `pnpm test` (unit + integration) passes.
- [ ] `bench-footprint --compare` prints ≥ 70 % reduction.
- [ ] Contract-replay diff is empty.
- [ ] Shape-fidelity Hausdorff ≤ 5 m on ≥ 99 % of shapes.
- [ ] `pnpm import-feed` against the same SHA short-circuits in ≤ 5 s.
- [ ] PMTiles open identically in the running frontend.
