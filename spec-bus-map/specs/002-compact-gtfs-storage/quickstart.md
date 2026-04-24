# Quickstart: Compact GTFS Storage

**Feature**: `002-compact-gtfs-storage` | **Phase**: 1 | **Date**: 2026-04-24

Canonical walkthrough for verifying that the compact storage pipeline
meets the acceptance criteria of `spec.md`.

---

## Prerequisites

- `provision.mjs` has run successfully (Postgres 17 + PostGIS 3 + Redis
  up, DB `busmapdb`, user `busmap`).
- A fresh checkout of branch `002-compact-gtfs-storage`.

---

## 1. Apply migrations

```bash
cd bus-map-api
pnpm db:migrate
# Applies: 0002_compact_storage.sql, 0003_drop_legacy_gtfs.sql,
#          0004_agency_metadata.sql
```

Verify compact tables exist:

```bash
psql -U busmap -d busmapdb -c "\dt *_compact"
psql -U busmap -d busmapdb -c "\dt pattern*"
psql -U busmap -d busmapdb -c "\dt feed_*"
```

> **Note**: Migration `0003` drops the legacy GTFS tables (`agencies`,
> `routes`, `stops`, `trips`, `stop_times`, `shapes`, `calendars`,
> `calendar_dates`). There is no rollback path once applied on a populated DB.

---

## 2. Import a feed

```bash
pnpm import-feed --mobility-id tld-576
# Stages: id-map → stops → shapes → agencies-routes → patterns → trips → calendar
# Expected: completes in < 10 min for tld-576 (CTM Cagliari, ~50 routes)
```

---

## 3. Measure footprint

```bash
# Single-snapshot comparison (compact vs legacy groups within same DB):
pnpm bench:self-compare --input bench/snapshot.json
```

**Achieved result (tld-576, 2026-04-24):**

```text
Legacy GTFS tables:   603.5 MB
Compact tables:        14.4 MB
Reduction:             97.6 %   (SC-001 target: ≥ 70 %) ✓
```

Full snapshot recorded in `bench/compact-final.json`.

---

## 4. Unit tests

```bash
pnpm test tests/unit
# 48 tests, all passing
```

Key suites: `pattern-builder`, `shape-dedup`, `polyline-codec`,
`frequency-detector`, `id-mapper`, `schedule-expander`.

---

## 5. Shape fidelity (SC-006)

```bash
pnpm test tests/integration/shape-fidelity.test.ts
```

Asserts Hausdorff distance ≤ 5 m on ≥ 99 % of shapes after polyline6
simplification with `simplify_eps_m = 5`.

---

## 6. Idempotency (SC-004)

```bash
time pnpm import-feed --mobility-id tld-576
# Expect: ≤ 5 s, log: "short-circuit: sha256 + pipeline_version match"
```

---

## 7. Read-path smoke check

```bash
pnpm dev &
API=http://localhost:3000/api

# Agencies in Cagliari bbox (lat-first)
curl -s "$API/agencies?bbox=39.1,9.0,39.4,9.3" | jq '.data[].name'

# Routes for CTM agency
curl -s "$API/agencies/500/routes" | jq '.data | length'

# Stop departures
curl -s "$API/stops/GI0640/departures?date=$(date +%Y-%m-%d)" | jq '.[0]'

# Live buses on route 1
curl -s "$API/routes/1/live?date=$(date +%Y-%m-%d)&time=$(date +%H:%M:%S)" | jq '.buses | length'
```

---

## Rollback

Compact tables can be wiped without affecting anything (legacy tables
were already dropped in migration 0003):

```sql
TRUNCATE TABLE trips_compact, frequencies_compact, stop_patterns,
               pattern_stops, stops_compact, shapes_compact,
               routes_compact, agencies_compact, calendar_compact,
               calendar_dates_compact, feed_stops, feed_routes,
               feed_trips, feed_services, feed_shapes,
               feed_agencies CASCADE;
```

---

## Merge gate checklist

- [X] Migrations applied cleanly.
- [X] Unit tests: 48/48 passing.
- [X] `bench-footprint` self-compare: **97.6 %** reduction (target ≥ 70 %).
- [X] All API endpoints return correct data from compact tables.
- [X] Live buses and stop departures working end-to-end.
- [ ] Contract-replay diff empty (T036 — fixtures not yet recorded; post-merge).
- [ ] Incremental-update logic (T032 — post-MVP).
