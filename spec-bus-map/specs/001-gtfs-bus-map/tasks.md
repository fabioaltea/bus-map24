---
description: "Task list for GTFS Bus Map Explorer — two repos: spec-bus-map-api (backend) + spec-bus-map-web (frontend)"
---

# Tasks: GTFS Bus Map Explorer

**Input**: Design documents from `specs/001-gtfs-bus-map/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/api.md ✅ quickstart.md ✅

**Organization**: Split by repository. Each repo follows the same phase structure (Setup →
Foundational → User Stories → Polish) and can be worked on in parallel by different agents
or developers once foundational tasks in each repo are complete.

## Legend

- `[P]` — Parallelizable: no dependency on incomplete tasks in the same phase
- `[USn]` — Maps to User Story n from spec.md
- `[MANUAL]` — Requires human action (external service, infrastructure, running commands on live system). All other tasks are **agent-executable**.

---

# REPO 1 — spec-bus-map-api (Backend)

**Stack**: Node.js 22 LTS + TypeScript 5 + Fastify 4 + PostgreSQL 16/PostGIS 3 + Drizzle ORM + BullMQ + Redis

---

## Phase B1: Setup

**Purpose**: Initialize the backend repository and development toolchain.

- [x] B001 Initialize Node.js 22 project with TypeScript 5 strict mode in new repo `spec-bus-map-api` — create `package.json`, `tsconfig.json`, `tsconfig.build.json`
- [x] B002 [P] Install and configure Fastify 4 with `@fastify/cors`, `@fastify/rate-limit`, `fastify-plugin` — write `src/app.ts` server factory
- [x] B003 [P] Install and configure Drizzle ORM with `drizzle-kit` — write `drizzle.config.ts` pointing to `src/db/schema.ts`
- [x] B004 [P] Configure Vitest — write `vitest.config.ts` with coverage thresholds (80% for new code) and `tests/` directory layout
- [x] B005 [P] Configure ESLint (typescript-eslint) + Prettier — write `.eslintrc.cjs` and `.prettierrc`
- [x] B006 [MANUAL] Create `docker-compose.yml` with `postgis/postgis:16-3.4` and `redis:7-alpine` services — requires Docker to be installed on the developer machine
- [x] B007 [P] Write `.env.example` with all variables from quickstart.md (`DATABASE_URL`, `REDIS_URL`, `MOBILITY_DB_API_KEY`, `PMTILES_OUTPUT_DIR`, `PORT`, `LOG_LEVEL`, `FEED_REFRESH_CRON`, `MAX_DOWNLOAD_WORKERS`)
- [ ] B008 [MANUAL] Register a free account at `mobilitydatabase.org` and obtain an API key — required before any feed catalog sync can run

---

## Phase B2: Foundational (Blocks All User Stories)

**Purpose**: Database schema, migrations, queue infrastructure, and shared utilities that every user story depends on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] B009 Define all Drizzle schema tables in `src/db/schema.ts`: `feed_catalog_entries`, `agencies`, `routes`, `stops`, `shapes`, `trips`, `stop_times`, `calendars`, `calendar_dates` — with all columns, types, and PostGIS geometry columns from `data-model.md`
- [x] B010 Write initial SQL migration via `drizzle-kit generate` — produces `src/db/migrations/0000_initial.sql`; review and add GIST spatial indexes on all geometry columns
- [ ] B011 [MANUAL] Run `pnpm db:migrate` against a running PostgreSQL + PostGIS container — requires Docker running locally
- [x] B012 [P] Write `src/lib/bbox.ts` — BBox string parser (`"swLat,swLng,neLat,neLng"` → numbers), PostGIS `ST_MakeEnvelope` query helper, validation (lat −90/+90, lng −180/+180)
- [x] B013 [P] Write `src/lib/calendar.ts` — GTFS calendar resolution: given a `service_id` and a `date`, determine if service runs (checks `calendars` table weekday flags + `calendar_dates` exceptions)
- [x] B014 [P] Setup BullMQ queue definitions in `src/jobs/queues.ts` — three queues: `catalog-sync`, `feed-download`, `tile-gen`; configure Redis connection and retry strategies
- [x] B015 Configure Fastify global error handler (RFC 7807 Problem Details format), request logger, and rate limiter plugin in `src/app.ts`
- [x] B016 Write `src/db/client.ts` — Drizzle + `pg` pool singleton, environment-driven config

**Checkpoint**: Run `pnpm build && pnpm test` — build must succeed, unit tests for bbox.ts and calendar.ts must pass.

---

## Phase B3: User Story 1 — World Map Navigation (Priority: P1)

**Goal**: Serve agency data filtered by viewport bbox so the frontend can render agencies as users zoom into regions.

**Independent Test**: `GET /api/agencies?bbox=51.4,-0.2,51.6,0.1` returns at least one agency (TfL) after seeding London feed.

### Implementation for User Story 1

- [ ] B017 [P] [US1] Write `src/services/agency.service.ts` — `getAgenciesInBbox(bbox, zoom, limit, offset)` using PostGIS `ST_Intersects` on `bounding_box`
- [ ] B018 [P] [US1] Write `src/routes/agencies.ts` — `GET /api/agencies` handler with bbox + zoom + pagination query params (validate schema with Fastify JSON schema)
- [ ] B019 [US1] Write `src/jobs/catalog-sync.job.ts` — fetch MobilityDatabase catalog CSV, parse rows, upsert `feed_catalog_entries` comparing `hash_sha256`, enqueue `feed-download` jobs for changed feeds
- [ ] B020 [US1] Write `src/jobs/feed-download.job.ts` — download GTFS zip to temp dir, validate required files (`agency.txt`, `routes.txt`, `stops.txt`, `stop_times.txt`), import via `node-gtfs` upsert mode, compute agency bounding boxes from stops extent using PostGIS `ST_Extent`, enqueue `tile-gen` job
- [ ] B021 [US1] Write `src/jobs/tile-gen.job.ts` — export routes (with `shape_geom`) and stops as GeoJSON from PostgreSQL; invoke `tippecanoe` subprocess for `routes.pmtiles` (zoom 9–16) and `stops.pmtiles` (zoom 13–22); atomic swap to `PMTILES_OUTPUT_DIR`
- [ ] B022 [US1] Register Fastify static file handler to serve `PMTILES_OUTPUT_DIR` at `/tiles/*`
- [ ] B023 [US1] Write `src/scripts/seed-dev.ts` — import 3 curated feeds (London TfL, Rome ATAC, New York MTA) using `feed-download` job logic; used for development and CI integration tests
- [ ] B024 [MANUAL] Run `pnpm seed:dev` after B011 — requires running PostgreSQL, Redis, and tippecanoe installed on PATH; verifies end-to-end pipeline before moving to next story

**Checkpoint**: `GET /api/agencies?bbox=51.4,-0.2,51.6,0.1` returns TfL with `route_count > 0`.

---

## Phase B4: User Story 2 — Agency & Route Filtering (Priority: P2)

**Goal**: Serve agency detail and its routes so the frontend can show a filtered route list and highlight individual routes.

**Independent Test**: `GET /api/agencies/{tfl_id}/routes` returns Jubilee Line with `color` and `shape_geom`.

### Implementation for User Story 2

- [ ] B025 [P] [US2] Write `src/services/route.service.ts` — `getRoutesByAgency(agencyId, routeTypes, limit, offset)`, `getRouteById(id)` with `shape_geom` included
- [ ] B026 [P] [US2] Write `src/routes/agencies.ts` additions — `GET /api/agencies/:id` (detail), `GET /api/agencies/:id/routes` (filtered list)
- [ ] B027 [US2] Write `src/routes/routes.ts` — `GET /api/routes/:id` returning `RouteDetail` including `shape_geom` as GeoJSON `MultiLineString` and `bbox`

**Checkpoint**: All three endpoints return correct data for seeded feeds; integration tests pass.

---

## Phase B5: User Story 3 — Stop & Schedule Information (Priority: P3)

**Goal**: Serve stop locations in a viewport and scheduled departures at a specific stop for a given date.

**Independent Test**: `GET /api/stops/{id}/departures?date=2026-04-14` returns a non-empty departures list for a TfL stop.

### Implementation for User Story 3

- [ ] B028 [P] [US3] Write `src/services/stop.service.ts` — `getStopsInBbox(bbox, routeId, agencyId, limit, offset)` with `ST_DWithin` or `ST_Intersects`; `getStopById(id)` including serving routes
- [ ] B029 [P] [US3] Write `src/routes/stops.ts` — `GET /api/stops` (bbox + optional filters) and `GET /api/stops/:id`
- [ ] B030 [US3] Write `src/services/departure.service.ts` — given `stopId` and `date`: resolve active `service_id`s via `calendar.ts`, join `stop_times` + `trips` + `routes`, return sorted `Departure[]` list
- [ ] B031 [US3] Write `src/routes/departures.ts` — `GET /api/stops/:id/departures` with date + route_id + limit params; validate date format

**Checkpoint**: Stops bbox query returns results; departures endpoint returns schedule data for a real stop.

---

## Phase BN: Polish & Cross-Cutting Concerns (Backend)

- [ ] B032 [P] Write integration tests for all 7 API endpoints in `tests/integration/` using supertest + seeded test database
- [x] B033 [P] Write unit tests for `calendar.ts` (service day resolution edge cases: overnight trips, exceptions) in `tests/unit/calendar.test.ts`
- [x] B034 [P] Write unit tests for `bbox.ts` (invalid inputs, boundary values) in `tests/unit/bbox.test.ts`
- [ ] B035 Register weekly BullMQ cron job for `catalog-sync` using `FEED_REFRESH_CRON` env variable in `src/app.ts` startup hook
- [ ] B036 Add `GET /api/feeds` admin endpoint in `src/routes/feeds.ts` for monitoring import status
- [ ] B037 [MANUAL] Configure production object storage (S3 or Cloudflare R2) for PMTiles — requires cloud account, bucket creation, and IAM credentials; update `PMTILES_OUTPUT_DIR` to mount point or add S3 upload step in tile-gen job
- [ ] B038 Validate Vitest coverage report — ensure 80% line coverage on all `src/services/` and `src/lib/` files; fix gaps

---

# REPO 2 — spec-bus-map-web (Frontend)

**Stack**: Vite 5 + React 18 + TypeScript 5 + MapLibre GL JS + Deck.gl + Zustand + TanStack Query

---

## Phase F1: Setup

**Purpose**: Initialize the frontend repository and development toolchain.

- [x] F001 Scaffold Vite 5 project with React 18 + TypeScript 5 template in new repo `spec-bus-map-web` — `pnpm create vite spec-bus-map-web --template react-ts`
- [x] F002 [P] Install MapLibre GL JS, `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/mapbox`, `pmtiles` — write `src/layers/` directory structure
- [x] F003 [P] Install TanStack Query v5 (`@tanstack/react-query`) + Zustand 4 — configure `QueryClient` in `src/main.tsx`
- [x] F004 [P] Configure Vitest + React Testing Library — write `vitest.config.ts`
- [x] F005 [P] Configure Playwright — write `playwright.config.ts` with Chromium target; add `tests/e2e/` directory
- [x] F006 [P] Configure ESLint (typescript-eslint + eslint-plugin-react-hooks) + Prettier — write `.eslintrc.cjs` and `.prettierrc`
- [x] F007 Write `.env.example` with `VITE_API_BASE_URL`, `VITE_TILES_BASE_URL`, `VITE_MAP_STYLE`

---

## Phase F2: Foundational (Blocks All User Stories)

**Purpose**: Typed API service layer, Zustand store, and base map container.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] F008 Write `src/types/api.ts` — all TypeScript interfaces from `contracts/api.md` (`AgencySummary`, `AgencyDetail`, `RouteSummary`, `RouteDetail`, `StopSummary`, `StopDetail`, `Departure`, `PaginatedResponse<T>`, `BBoxParam`, `RouteType`)
- [x] F009 Write `src/services/api.ts` — typed `fetch` wrappers for all 7 endpoints; extract base URL from `VITE_API_BASE_URL`; map HTTP errors to `ErrorResponse` type
- [x] F010 Write `src/stores/map.store.ts` — Zustand store with `MapStore` interface from `data-model.md`: viewport, `selectedAgencyId`, `selectedRouteId`, `selectedStopId`, panel visibility, `activeRouteTypes`
- [x] F011 Write `src/hooks/useMapViewport.ts` — extract `bbox` and `zoom` from MapLibre `moveend` event; debounce 250ms to throttle API calls during pan
- [x] F012 Write `src/components/Map/MapView.tsx` — MapLibre GL container filling viewport (`width: 100vw; height: 100vh`); register PMTiles protocol handler from `pmtiles` package; apply OpenFreeMap Liberty style

**Checkpoint**: `pnpm dev` starts; a full-screen base map renders at `localhost:5173`; no TypeScript or lint errors.

---

## Phase F3: User Story 1 — World Map Navigation (Priority: P1)

**Goal**: Agencies and route polylines appear as users zoom into transit-covered regions.

**Independent Test**: Navigate to London at zoom 10 — TfL appears in agency panel; route polylines overlay the map from PMTiles.

### Implementation for User Story 1

- [x] F013 [US1] Write `src/hooks/useViewportAgencies.ts` — TanStack Query with key `['agencies', bbox, zoom]`; calls `api.getAgencies(bbox, zoom)`; enabled only when zoom ≥ 5; stale time 60 s
- [x] F014 [US1] Write `src/components/Panels/AgencyPanel.tsx` — fixed left sidebar listing agencies in viewport; each row shows name, country flag, route count; click sets `selectedAgencyId` in store
- [x] F015 [US1] Write `src/components/Map/RouteLayer.tsx` — Deck.gl `PathLayer` consuming route PMTiles (`/tiles/routes.pmtiles`); visible at zoom ≥ 9; colour from GTFS `color` attribute; dims unselected routes when an agency is selected
- [x] F016 [US1] Add zoom-level guards in `MapView.tsx` — hide `RouteLayer` below zoom 9; hide agency panel below zoom 5; show "Zoom in to explore transit" hint at low zoom

**Checkpoint**: TfL route network renders as coloured polylines over London at zoom 10; `AgencyPanel` lists TfL.

---

## Phase F4: User Story 2 — Agency & Route Filtering (Priority: P2)

**Goal**: Selecting an agency filters the map to its routes; selecting a route highlights it with its full path.

**Independent Test**: Select TfL → only TfL routes visible; select Jubilee Line → polyline highlighted, route extent auto-fits.

### Implementation for User Story 2

- [x] F017 [P] [US2] Write `src/hooks/useAgencyRoutes.ts` — TanStack Query with key `['routes', agencyId]`; calls `api.getAgencyRoutes(agencyId)`; enabled when `selectedAgencyId` is set
- [x] F018 [US2] Write `src/components/Panels/RoutePanel.tsx` — slide-in panel listing routes for selected agency (colour swatch, short name, long name, route type icon); click sets `selectedRouteId`
- [x] F019 [US2] Update `RouteLayer.tsx` — when `selectedRouteId` is set, highlight that route with full `shape_geom` from `GET /api/routes/:id`; dim all others; fit map bounds to route bbox
- [x] F020 [US2] Implement filter reset: clear button in `AgencyPanel` sets `selectedAgencyId`, `selectedRouteId`, `selectedStopId` all to null; map reverts to unfiltered view

**Checkpoint**: Agency + route filtering works end-to-end; map auto-fits selected route; clearing filter restores full view.

---

## Phase F5: User Story 3 — Stop & Schedule Information (Priority: P3)

**Goal**: Stop markers appear at high zoom; clicking one opens a panel with stop info and the day's departures.

**Independent Test**: Zoom to 14 over London → stop markers appear; click a stop → panel shows name, routes, scheduled times.

### Implementation for User Story 3

- [x] F021 [P] [US3] Write `src/components/Map/StopLayer.tsx` — Deck.gl `ScatterplotLayer` consuming stop PMTiles (`/tiles/stops.pmtiles`); visible at zoom ≥ 13; highlight selected stop; on click dispatch `selectedStopId` to store
- [x] F022 [P] [US3] Write `src/hooks/useStopDetail.ts` — TanStack Query with key `['stop', stopId]`; calls `api.getStopDetail(stopId)` when `selectedStopId` is set
- [x] F023 [P] [US3] Write `src/hooks/useStopDepartures.ts` — TanStack Query with key `['departures', stopId, date]`; calls `api.getStopDepartures(stopId, todayIsoDate)`
- [x] F024 [US3] Write `src/components/Panels/StopPanel.tsx` — overlay panel showing stop name, code, serving routes (colour badges), and a timetable (departure time, route short name, headsign); grouped by route; "No service today" state when departures list is empty; close button clears `selectedStopId`

**Checkpoint**: Full US3 flow works: zoom 13 → stops appear → click → panel populates with schedule data.

---

## Phase FN: Polish & Cross-Cutting Concerns (Frontend)

- [x] F025 [P] Write Vitest component tests for `AgencyPanel`, `RoutePanel`, `StopPanel` in `tests/components/` — mock TanStack Query; verify render and user interactions
- [ ] F026 [P] Write Playwright E2E tests in `tests/e2e/`: `world-navigation.spec.ts` (zoom to city, agencies appear), `agency-filtering.spec.ts` (select + clear), `stop-info.spec.ts` (click stop, verify panel)
- [ ] F027 [MANUAL] Run Playwright E2E suite against a running full-stack environment (both `spec-bus-map-api` and `spec-bus-map-web` dev servers + seeded database) — requires local infrastructure up
- [x] F028 Add loading skeleton states in `AgencyPanel`, `RoutePanel`, `StopPanel` — show while TanStack Query is in `isLoading` state
- [x] F029 Add `EmptyState` component for: no agencies in viewport, no routes for agency, no service today at stop — reusable from `src/components/UI/EmptyState.tsx`
- [ ] F030 [MANUAL] Run Lighthouse accessibility audit on the running app — verify WCAG 2.1 AA compliance; fix flagged issues in component markup (ARIA labels, colour contrast)
- [x] F031 Validate Vitest coverage — 80% on `src/hooks/` and `src/components/`; fix gaps

---

# REPO 2 — spec-bus-map-web (Mock Data Layer)

**Amendment**: 2026-04-14 — enables the SPA to run without any backend infrastructure.
All tasks are agent-executable. No manual steps required.

---

## Phase MK: MSW Mock Data Layer

**Purpose**: Add MSW v2 browser mocking so `pnpm dev` renders real map + fixture data
without Docker, PostgreSQL, Redis, or a MobilityDatabase API key.

**Prerequisites**: F1 (frontend toolchain) must be complete. Independent of all backend phases.

- [x] MK001 Install `msw@^2` as a dev dependency in `spec-bus-map-web`; run `pnpm msw init public/` to generate `public/mockServiceWorker.js`; commit the generated file
- [x] MK002 [P] Create `src/mocks/fixtures/agencies.ts` — 5 `AgencySummary` objects with real GPS bounding boxes: London TfL (51.4,-0.5→51.7,0.1), Rome ATAC (41.8,12.3→42.0,12.6), NYC MTA (40.6,-74.1→40.9,-73.8), Berlin BVG (52.4,13.3→52.6,13.6), Tokyo Metro (35.6,139.6→35.8,139.8); include `route_count`, `stop_count`, `feed_id`
- [x] MK003 [P] Create `src/mocks/fixtures/routes.ts` — 2 routes per agency (10 total); include `shape_geom` as GeoJSON `MultiLineString` with real coordinate sequences; assign GTFS `color` hex values (e.g. TfL red `E1251B`, ATAC orange `F7A800`, MTA blue `0039A6`)
- [x] MK004 [P] Create `src/mocks/fixtures/stops.ts` — 10–14 stops per agency (72 total); `location` as GeoJSON `Point` with real GPS coordinates; `route_ids` linking to fixture routes; include `code`, `name`, `wheelchair_boarding`
- [x] MK005 [P] Create `src/mocks/fixtures/departures.ts` — departure time generator: export `generateDepartures(stopId, date)` returning 8–12 `Departure` objects with times starting at current hour, 10-minute intervals; `headsign` and `route` from fixtures
- [x] MK006 Create `src/mocks/handlers/agencies.ts` — MSW `http.get` handlers for `GET /api/agencies` (filter by bbox intersection with `bounding_box`), `GET /api/agencies/:id`, `GET /api/agencies/:id/routes`; return `PaginatedResponse<AgencySummary>` matching `contracts/api.md` exactly (snake_case fields, correct GeoJSON shapes)
- [x] MK007 Create `src/mocks/handlers/stops.ts` — MSW handlers for `GET /api/stops` (filter by bbox) and `GET /api/stops/:id`; return `StopSummary[]` / `StopDetail` per contract
- [x] MK008 Create `src/mocks/handlers/routes.ts` — MSW handler for `GET /api/routes/:id`; return `RouteDetail` including `shape_geom` and `bbox`
- [x] MK009 Create `src/mocks/handlers/departures.ts` and `src/mocks/handlers/feeds.ts`; departures calls `generateDepartures(stopId, date)`; feeds returns 5 mock `FeedSummary` objects with `import_status: 'ready'`
- [x] MK010 Create `src/mocks/handlers/index.ts` aggregating all handlers; create `src/mocks/browser.ts` with `setupWorker(...handlers)` export
- [x] MK011 Update `src/main.tsx` — add conditional MSW startup: `if (import.meta.env.VITE_MOCK_API === 'true') { const { worker } = await import('./mocks/browser.js'); await worker.start({ onUnhandledRequest: 'bypass' }) }` before `createRoot`
- [x] MK012 Add `VITE_MOCK_API=true` to `.env.example` (commented out with instructions); create `.env.local` in repo root with `VITE_MOCK_API=true` (gitignored) so `pnpm dev` works out-of-the-box for new developers
- [x] MK013 [P] Write Vitest unit tests in `tests/unit/mock-fixtures.test.ts` — validate all fixture data conforms to `contracts/api.md` TypeScript types; validate `generateDepartures` output shape; validate bbox filtering logic in handlers

---

# Dependencies & Execution Order

## Cross-Repo Dependency

The frontend **requires** the backend API to be running for integration testing and E2E tests.
For unit and component tests, the frontend is fully independent.

```
B1 (Backend Setup) ──────────────────────── F1 (Frontend Setup)
       │                                            │          │
B2 (Backend Foundational)               F2 (Frontend Foundational)
       │                                            │          │
B3 (US1 API)   ←── API contract ────→   F3 (US1 Map)          │
       │                                            │          │
B4 (US2 API)   ←── API contract ────→   F4 (US2 Filter)       │
       │                                            │          │
B5 (US3 API)   ←── API contract ────→   F5 (US3 Stops)        │
       │                                            │          │
BN (Backend Polish)                     FN (Frontend Polish)   │
                                                               ↓
                                              MK (Mock Data Layer)
                                         [can run after F1, independently]
```

Both repos can start **immediately in parallel**. Backend phases unlock the corresponding
frontend user story phase (shared REST API contract).

**MK is independent of all backend phases** — once F1 is done, MK can run at any time.
MK enables the full frontend UI to be previewed with realistic fixture data without
any backend infrastructure.

## Manual Tasks Summary

| Task | Why Manual | When |
|------|-----------|------|
| B006 | Docker must be installed on developer machine | Phase B1 |
| B008 | External account registration (MobilityDatabase) | Phase B1 |
| B011 | Run DB migration against live container | Phase B2 |
| B024 | Run seed script on live stack (requires infra + tippecanoe) | Phase B3 |
| B037 | Cloud storage setup (S3/R2) — requires cloud account + credentials | Phase BN |
| F027 | Playwright E2E requires both servers + seeded DB running | Phase FN |
| F030 | Lighthouse audit requires running browser + app | Phase FN |

All other tasks (B001–B036 excl. manual, F001–F031 excl. manual, MK001–MK013) are
**agent-executable**: they produce source files, configuration, or test files that can
be written without external dependencies.

**Phase MK has zero manual tasks** — run `pnpm dev` after MK012 to see the full app.

## MVP Scope (User Story 1 Only)

1. Complete B1 + B2 (Backend Setup + Foundational)
2. Complete B3 (US1: agency bbox API + feed pipeline)
3. Complete F1 + F2 (Frontend Setup + Foundational)
4. Complete F3 (US1: world map + agency panel)
5. **STOP and VALIDATE**: World map loads, agencies appear on zoom, route polylines render
6. Deploy/demo if ready — US2 and US3 can follow incrementally

## MVP Scope — Mock-First Alternative (no backend required)

1. ✅ F1 + F2 already complete
2. Complete **MK001–MK013** (mock data layer)
3. Complete F3 (US1 map + agency panel) — backed by MSW fixture data
4. Complete F4 (US2 filter panel) — backed by MSW
5. Complete F5 (US3 stop panel + departures) — backed by MSW
6. **STOP and VALIDATE**: Full UI works at `pnpm dev` — `VITE_MOCK_API=true` — no Docker needed
7. Swap MSW for real backend later by completing B1–B5 and unsetting `VITE_MOCK_API`

## Parallel Opportunities by Phase

### Backend Phase B2 (parallel within phase)
```
B012 (bbox.ts) ──┐
B013 (calendar.ts) ─┤── after B009+B010 complete
B014 (BullMQ queues) ┘
```

### Backend Phase B3 (sequential pipeline)
```
B017 (agency service) → B018 (agency route) — parallel pair
B019 → B020 → B021 → B022 — sequential (each step depends on previous)
B023 (seed script) — parallel with B019-B022 if using direct DB import
```

### Frontend Phase F2 (parallel within phase)
```
F008 (types) ──┐
F009 (api.ts) ─┤── all independently writable once types are done
F010 (store) ──┘
F011+F012 — after F008/F009/F010
```

### Frontend Phase F3 (sequential with parallel hook)
```
F013 (useViewportAgencies) ─── parallel with F014 (AgencyPanel)
F015 (RouteLayer) ──────────── parallel with F013/F014
F016 (zoom guards) ─────────── depends on F012+F015
```
