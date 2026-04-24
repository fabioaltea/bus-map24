# Implementation Plan: Compact GTFS Storage

**Branch**: `002-compact-gtfs-storage` | **Date**: 2026-04-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-compact-gtfs-storage/spec.md`

## Summary

Shrink the PostgreSQL footprint of a GTFS feed by **≥ 70%** while leaving
the public JSON API to the frontend unchanged. Achieved through four
independent, composable compression techniques applied *before* relying on
any database-level page compression:

1. **Pattern deduplication** of `stop_times` — store each distinct
   `(stop_sequence, relative_offsets)` tuple once as a `stop_pattern`; trips
   reference the pattern + a `start_time_sec`. Kills the ~80-95% of
   storage that `stop_times` typically occupies.
2. **Frequency collapse** — trips forming a regular cadence (same pattern,
   same service, evenly spaced starts) become a `frequencies` row instead
   of N duplicate trips.
3. **Integer ID surrogates** — string IDs (`stop_id`, `trip_id`, …)
   replaced by per-feed `INTEGER`/`SMALLINT` surrogates; original strings
   kept in a thin lookup table only for external re-export.
4. **Shape compression** — polylines stored in `polyline6` (Google's
   polyline algorithm, 6-digit precision) + Douglas–Peucker simplification
   (5 m tolerance, configurable); deduped by geometry hash. Coordinates
   of stops/shape vertices held as fixed-point `INT32` (lat/lon × 1e6).

Read services in `src/services/*.service.ts` materialise the compact
representation back into the exact JSON shape required by spec 001's
contracts. The frontend (`bus-map-web`) is untouched.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22 LTS (existing toolchain).
**Primary Dependencies**: Fastify 4, Drizzle ORM 0.31, `node-gtfs` 4,
BullMQ 5, `pg` 8, `adm-zip`, `csv-parse`.
**New Dependencies**: `@mapbox/polyline` (polyline6 encode/decode),
`simplify-js` (Douglas–Peucker), `xxhash-wasm` (fast 64-bit dedup hash).
**Storage**: PostgreSQL 17 + PostGIS 3. New schema version alongside
existing tables; legacy rows left in place but no longer written to
after the cut-over.
**Testing**: Vitest (unit + integration), supertest for API contract
replay; Playwright unchanged on the frontend.
**Target Platform**: Local dev (mac/win/linux) + single-node prod;
Redis required for BullMQ.
**Project Type**: Web-service + client (spec-kit multi-project layout
`bus-map-api` / `bus-map-web`).
**Performance Goals**: API reads at parity with current pipeline (p95
≤ 200 ms for `/api/stops/:id/departures` under warm cache); import
within 120 % of current duration.
**Constraints**:
- Footprint reduction ≥ 70 % per reference feed (SC-001).
- Zero frontend change — contracts in
  `specs/001-gtfs-bus-map/contracts/` are the acceptance boundary.
- Idempotent import keyed on `(feed_id, sha256)`.
- Supports GTFS `arrival_time` up to 48:00:00 (INT range `[0, 172 800]`).
**Scale/Scope**: Reference target — 20 simultaneous feeds, median feed
≈ 10 k trips / 300 k stop_times, worst-case feed ≈ 100 k trips.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle             | Check                                          | Status |
|-----------------------|------------------------------------------------|--------|
| **I. Code Quality**   | New modules (`pattern-builder`, `polyline-codec`, `id-mapper`) expose narrow interfaces; Drizzle schema diffs reviewed; no duplication (>3 sites) expected. | PASS |
| **II. Testing**       | Contract-replay suite (spec SC-005) + import-snapshot tests + shape-fidelity Hausdorff test specified up front; TDD practicable. | PASS |
| **III. UX Consistency** | No UI change; public API contracts are the consistency surface. | PASS |
| **IV. Performance**   | SC-003 enforces p95 ≤ 200 ms; benchmark gate on departures endpoint + import-time ceiling added to Phase 2 tasks. | PASS |

No violations. Complexity Tracking section intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-compact-gtfs-storage/
├── plan.md              # This file
├── research.md          # Phase 0 output: technique selection + trade-offs
├── data-model.md        # Phase 1 output: compact schema + entity diagrams
├── quickstart.md        # Phase 1 output: verification walkthrough
├── contracts/           # Phase 1 output: internal storage contract + public API guard
└── tasks.md             # Phase 2 output (NOT produced by /speckit.plan)
```

### Source Code (repository root)

```text
bus-map-api/
├── src/
│   ├── db/
│   │   ├── schema.ts                     # + compact tables alongside legacy
│   │   └── migrations/
│   │       └── 0002_compact_storage.sql  # new migration
│   ├── lib/
│   │   ├── polyline-codec.ts             # NEW — encode/decode polyline6
│   │   ├── id-mapper.ts                  # NEW — per-feed string ↔ integer
│   │   ├── pattern-builder.ts            # NEW — stop_times → patterns
│   │   ├── frequency-detector.ts         # NEW — regular-cadence collapse
│   │   └── shape-dedup.ts                # NEW — geometry hash + simplify
│   ├── services/
│   │   ├── stop.service.ts               # UPDATED — reads from compact
│   │   ├── schedule.service.ts           # UPDATED — pattern + trip expansion
│   │   └── agency.service.ts             # (no change)
│   ├── jobs/
│   │   └── feed-download.job.ts          # UPDATED — calls new pipeline stages
│   └── scripts/
│       ├── import-feed.ts                # UPDATED — same CLI surface
│       └── bench-footprint.ts            # NEW — SC-001 measurement harness
└── tests/
    ├── unit/
    │   ├── polyline-codec.test.ts        # NEW
    │   ├── pattern-builder.test.ts       # NEW
    │   ├── frequency-detector.test.ts    # NEW
    │   └── id-mapper.test.ts             # NEW
    └── integration/
        ├── import-footprint.test.ts      # NEW — SC-001
        ├── contract-replay.test.ts       # NEW — SC-005
        └── shape-fidelity.test.ts        # NEW — SC-006

bus-map-web/                              # unchanged
```

**Structure Decision**: Stays on the existing spec-kit dual-project
layout (`bus-map-api` / `bus-map-web`). All changes are confined to
`bus-map-api`. No frontend edits. The compact schema is introduced as
an **additive migration** — legacy tables remain until the re-ingest
completes, then are dropped by a follow-up migration
(`0003_drop_legacy_gtfs.sql`) planned in Phase 2.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No violations. Table intentionally left blank.*
