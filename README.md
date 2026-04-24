# bus-map24 — GTFS Bus Map Explorer

Full-stack "Flight-Radar24 for transit" web app. Full-screen interactive
world map that, as the user zooms into a region, reveals the transit agencies,
route networks, stops and schedules served by that area — all driven by
**static GTFS feeds** (Google Transit Feed Specification) published on
[MobilityDatabase](https://mobilitydatabase.org).

> **Why this repo exists.** Primary purpose is to stress-test
> **[spec-kit](https://github.com/github/spec-kit)**, GitHub's Spec-Driven
> Development toolkit, on a real, non-trivial domain (GTFS ingestion,
> PostGIS spatial queries, vector tile rendering). Every artefact in
> `bus-map-api/` and `bus-map-web/` was derived from the spec-kit workflow
> under `spec-bus-map/`: **spec → plan → research → tasks → implementation →
> quickstart**. The app is the deliverable; validating the spec-kit loop end
> to end is the goal.

---

## Repository layout

```text
bus-map24/
├── bus-map-api/        # Backend: Fastify 4 + Drizzle ORM + PostGIS + BullMQ
│   ├── src/routes/     # REST handlers (agencies, routes, stops, trips, feeds, departures)
│   ├── src/services/   # Domain services (agency, stop, schedule, live)
│   ├── src/jobs/       # BullMQ workers: catalog sync, feed download, tile generation
│   ├── src/db/         # Drizzle schema + migrations + pg client
│   ├── src/lib/        # bbox / calendar / MobilityDB auth helpers
│   ├── src/scripts/    # CLI entrypoints: import-feed, gen-tiles
│   └── tiles/          # Generated PMTiles served by Fastify
├── bus-map-web/        # Frontend: React 18 + Vite 5 + MapLibre GL + Deck.gl
│   ├── src/components/ # Map/, Panels/, UI/
│   ├── src/hooks/      # TanStack Query hooks, map hooks
│   ├── src/stores/     # Zustand stores (viewport, selection, filters)
│   ├── src/layers/     # Deck.gl layer configs
│   ├── src/services/   # API fetch wrappers
│   └── src/mocks/      # MSW v2 handlers + fixtures (offline dev)
├── spec-bus-map/       # spec-kit working directory (no runtime code)
│   ├── .specify/       # spec-kit templates, scripts, memory
│   └── specs/001-gtfs-bus-map/
│       ├── spec.md         # Functional specification
│       ├── plan.md         # Technical plan
│       ├── research.md     # Technology research
│       ├── data-model.md   # Entity model
│       ├── tasks.md        # Generated task list
│       ├── contracts/      # API contracts (OpenAPI-style)
│       └── quickstart.md   # Canonical verification flow
├── provision.mjs       # Single cross-platform provisioning script
└── README.md
```

`spec-bus-map/` holds **no runtime code**. It is the spec-kit workspace that
produced `bus-map-api` and `bus-map-web`.

---

## Features

### End-user features (frontend)

- **Full-screen world map.** MapLibre GL JS base map with continuous pan and
  zoom from globe level down to street level. Default style:
  [OpenFreeMap Liberty](https://openfreemap.org).
- **Zoom-driven discovery.** As the viewport tightens on a region, transit
  agencies operating there surface in an on-map panel and as route
  polylines over the base map. Decluttering thresholds hide stops and
  aggregate agencies at low zoom.
- **Vector route network overlay.** Route polylines rendered via Deck.gl
  `PathLayer` on top of PMTiles. Colours honour the `route_color` field
  from the GTFS feed; a default palette per `route_type` (bus/tram/subway
  /rail/ferry) is applied when no colour is defined.
- **Agency filtering.** Side panel lists agencies intersecting the current
  viewport (computed server-side via PostGIS bounding-box query). Selecting
  an agency dims all other routes on the map.
- **Route filtering.** Selecting a single route highlights its polyline,
  auto-fits the viewport to the route extent, and reveals its stop markers
  as `ScatterplotLayer` points at zoom ≥ 13.
- **Stop information panel.** Clicking a stop opens a detail panel with:
  - stop name and ID
  - list of serving routes (clickable, cross-navigates)
  - scheduled departures for the current local date, derived from
    `stop_times` + `calendar` + `calendar_dates`, grouped by route and
    sorted chronologically
  - empty-state when no service runs today (holiday/out-of-season)
- **Filter reset.** One-click return to unfiltered world view.
- **No-data indicator.** Subtle visual cue over regions with no ingested
  GTFS coverage.
- **Mock-only dev mode.** `VITE_MOCK_API=true` starts the frontend with MSW
  v2 intercepting every API call against deterministic fixtures — no
  backend required for UI work.

### Platform features (backend)

- **REST API.** Fastify 4 with typed handlers and JSON-Schema validation:
  | Endpoint                          | Purpose                                          |
  |-----------------------------------|--------------------------------------------------|
  | `GET /api/agencies?bbox=…`        | Agencies intersecting a bounding box             |
  | `GET /api/routes?agencyId=…`      | Routes for an agency                             |
  | `GET /api/routes/:id`             | Single route with shape polyline                 |
  | `GET /api/stops/:id`              | Stop details (name, location, serving routes)   |
  | `GET /api/stops/:id/departures`   | Scheduled departures for a date                  |
  | `GET /api/trips/:id`              | Trip detail with stop-time sequence              |
  | `GET /api/feeds`                  | Feed catalog + import status                     |
  | `GET /tiles/*.pmtiles`            | Static PMTiles served via `@fastify/static`      |
- **GTFS import pipeline.** `node-gtfs` parses the zip into Postgres;
  Drizzle ORM maps to typed tables; PostGIS geometries built for stops
  (`geometry(Point, 4326)`) and shapes (`geometry(LineString, 4326)`)
  with GIST indexes for bbox lookups.
- **MobilityDatabase integration.** OAuth refresh-token flow against
  `api.mobilitydatabase.org`; metadata (provider, country, bounding box,
  hosted dataset URL, SHA256) cached in `feed_catalog_entries`.
- **BullMQ job system** (Redis-backed):
  - `catalog-sync.job` — periodic (cron `FEED_REFRESH_CRON`) refresh of
    the MobilityDB catalog
  - `feed-download.job` — download, hash-verify, extract, import a single
    feed; updates `import_status` (`pending` → `downloading` → `importing`
    → `ready` / `failed`)
  - `tile-gen.job` — invokes `tippecanoe` to build PMTiles for routes and
    stops after a successful import
- **Vector tile generation.** `tippecanoe` produces two PMTiles per feed:
  `<mobilityId>-routes.pmtiles` and `<mobilityId>-stops.pmtiles`.
- **Rate limiting.** `@fastify/rate-limit` on `/api/*`.
- **CORS.** `@fastify/cors` configured for the frontend origin.
- **Calendar resolution.** `src/lib/calendar.ts` resolves which `service_id`s
  run on a given date against `calendar` + `calendar_dates`, in the
  client's local date (per spec SC assumption).

### Data entities (persisted in Postgres + PostGIS)

`feed_catalog_entries`, `agencies`, `routes`, `stops`, `shapes`, `trips`,
`stop_times`, `calendar`, `calendar_dates`. Schema defined in
`bus-map-api/src/db/schema.ts`; migrations in
`bus-map-api/src/db/migrations/`.

---

## Tech stack

| Layer    | Technology                                                            |
|----------|-----------------------------------------------------------------------|
| Backend  | TypeScript 5, Node 22 LTS, Fastify 4, Drizzle ORM, BullMQ, node-gtfs  |
| Frontend | TypeScript 5, React 18, Vite 5, MapLibre GL JS, Deck.gl 9, TanStack Query 5, Zustand 4 |
| Database | PostgreSQL 17 + PostGIS 3                                             |
| Cache/Queue | Redis 7                                                            |
| Tiles    | PMTiles built with `tippecanoe`                                       |
| Testing  | Vitest, Supertest, Playwright, Testing Library, MSW v2                |
| Lint/Fmt | ESLint (typescript-eslint) + Prettier, TS strict mode                 |

---

## Prerequisites

| Tool             | Version | macOS                          | Windows                             | Linux (Debian/Ubuntu)     |
|------------------|---------|--------------------------------|-------------------------------------|---------------------------|
| Node.js          | 22 LTS  | `brew install node@22`         | `winget install OpenJS.NodeJS.LTS`  | NodeSource + `apt`        |
| pnpm             | 9+      | `brew install pnpm`            | `winget install pnpm.pnpm`          | `npm i -g pnpm`           |
| PostgreSQL       | 17      | `brew install postgresql@17`   | `choco install postgresql17`        | `apt install postgresql`  |
| PostGIS          | 3       | `brew install postgis`         | StackBuilder (manual)               | `apt install postgis`     |
| Redis            | 7       | `brew install redis`           | `choco install redis-64`            | `apt install redis-server`|
| tippecanoe       | 2.x     | `brew install tippecanoe`      | Requires WSL2                       | `apt install tippecanoe`  |

macOS needs [Homebrew](https://brew.sh). Windows needs
[Chocolatey](https://chocolatey.org) **or** winget in an Administrator shell.
`tippecanoe` has no native Windows build — run tile generation from WSL2 or a
mac/linux host and copy the `.pmtiles` artefacts into
`bus-map-api/tiles/`.

---

## One-shot provisioning

Cross-platform script — runs on macOS, Windows, Linux.

### macOS / Linux

```bash
node provision.mjs
```

### Windows (PowerShell as Administrator)

```powershell
node provision.mjs
```

`provision.mjs` performs **every** step below:

1. detect OS (darwin / win32 / linux);
2. install system dependencies via Homebrew / Chocolatey / winget / apt;
3. start `postgresql@17` and `redis` services;
4. create database `busmapdb`, user `busmap`, enable `postgis` extension;
5. copy `.env.example` → `.env` for backend; create `.env.local` for frontend;
6. run `pnpm install` in both projects;
7. run Drizzle migrations (`pnpm db:migrate`);
8. import a default GTFS feed (`tld-576` from MobilityDatabase).

### Flags

```bash
node provision.mjs --skip-install         # skip system dep install
node provision.mjs --skip-import          # skip GTFS import
node provision.mjs --mobility-id <id>     # import a specific MobilityDB feed (default: tld-576)
node provision.mjs --feed-url <url> --provider "<name>"   # import a raw GTFS zip URL
```

---

## Manual setup (step by step)

Use this path if the one-shot script does not cover your environment.

### 1. System dependencies

**macOS**:

```bash
brew install postgresql@17 postgis redis tippecanoe pnpm node@22
brew services start postgresql@17
brew services start redis
export PATH="$(brew --prefix postgresql@17)/bin:$PATH"    # keg-only formula
```

**Windows** (Administrator PowerShell):

```powershell
choco install -y postgresql17 postgis redis-64 nodejs-lts pnpm
net start postgresql-x64-17
net start Redis
```

**Linux (Debian/Ubuntu)**:

```bash
sudo apt-get install -y postgresql postgresql-contrib postgis redis-server tippecanoe
sudo systemctl start postgresql
sudo systemctl start redis-server
```

### 2. Database

```bash
createdb busmapdb
psql busmapdb -c "CREATE USER busmap WITH PASSWORD 'busmap';"
psql busmapdb -c "GRANT ALL PRIVILEGES ON DATABASE busmapdb TO busmap;"
psql busmapdb -c "ALTER DATABASE busmapdb OWNER TO busmap;"
psql busmapdb -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql busmapdb -c "GRANT ALL ON SCHEMA public TO busmap;"
```

Verify:

```bash
psql -U busmap -d busmapdb -c "SELECT PostGIS_version();"
redis-cli ping    # → PONG
```

### 3. Backend (`bus-map-api`)

```bash
cd bus-map-api
cp .env.example .env
# Edit .env if needed — MOBILITY_DB_REFRESH_TOKEN already populated.
pnpm install
pnpm db:migrate
pnpm dev          # API on http://localhost:3000
```

### 4. Frontend (`bus-map-web`)

```bash
cd bus-map-web
cp .env.example .env.local
# VITE_API_BASE_URL=http://localhost:3000/api
# VITE_TILES_BASE_URL=http://localhost:3000/tiles
pnpm install
pnpm dev          # Web on http://localhost:5173
```

Mock-only mode (no backend):

```bash
cd bus-map-web
VITE_MOCK_API=true pnpm dev
```

---

## GTFS data import

Three modes.

### A. Via MobilityDatabase ID

```bash
cd bus-map-api
pnpm import-feed --mobility-id tld-576
```

Look the ID up on [mobilitydatabase.org](https://mobilitydatabase.org). The
script:

- fetches metadata (provider, bounding box, hosted dataset URL, SHA256);
- upserts `feed_catalog_entries`;
- downloads the GTFS zip;
- runs the full import job (agencies, routes, trips, stops, stop_times,
  calendar, shapes);
- builds PostGIS geometries and GIST indexes.

Requires `MOBILITY_DB_REFRESH_TOKEN` in `bus-map-api/.env`.

### B. Direct URL

```bash
pnpm import-feed --url https://example.com/gtfs.zip --provider "My Transit"
```

Useful for feeds not listed in MobilityDatabase.

### C. Tile generation

After at least one successful import:

```bash
cd bus-map-api
pnpm tsx src/scripts/gen-tiles.ts <feedId> [mobilityId]
# Output: ./tiles/<mobilityId>-routes.pmtiles, <mobilityId>-stops.pmtiles
# Served by Fastify at /tiles/<filename>.pmtiles
```

Windows: run under WSL2, or generate elsewhere and copy into
`bus-map-api/tiles/`.

---

## Environment variables

### `bus-map-api/.env`

| Variable                    | Default                                              | Purpose                                 |
|-----------------------------|------------------------------------------------------|-----------------------------------------|
| `DATABASE_URL`              | `postgresql://busmap:busmap@localhost:5432/busmapdb` | Postgres connection string              |
| `REDIS_URL`                 | `redis://localhost:6379`                             | Redis connection string                 |
| `MOBILITY_DB_REFRESH_TOKEN` | (provided)                                           | OAuth refresh token for mobilitydatabase.org |
| `PMTILES_OUTPUT_DIR`        | `./tiles`                                            | PMTiles output directory                |
| `PORT`                      | `3000`                                               | HTTP port                               |
| `LOG_LEVEL`                 | `info`                                               | Fastify log level                       |
| `FEED_REFRESH_CRON`         | `0 2 * * 1`                                          | Catalog refresh cron (Mon 02:00)        |
| `MAX_DOWNLOAD_WORKERS`      | `3`                                                  | Parallel download workers               |

### `bus-map-web/.env.local`

| Variable              | Default                                        | Purpose                                  |
|-----------------------|------------------------------------------------|------------------------------------------|
| `VITE_API_BASE_URL`   | `http://localhost:3000/api`                    | Backend REST base URL                    |
| `VITE_TILES_BASE_URL` | `http://localhost:3000/tiles`                  | PMTiles base URL                         |
| `VITE_MAP_STYLE`      | `https://tiles.openfreemap.org/styles/liberty` | MapLibre style URL                       |
| `VITE_MOCK_API`       | `false`                                        | `true` → MSW intercepts all API calls    |

---

## Running the stack

Two terminals, after provisioning:

```bash
# Terminal 1
cd bus-map-api && pnpm dev

# Terminal 2
cd bus-map-web && pnpm dev
```

Open `http://localhost:5173`.

---

## Testing

```bash
# Backend
cd bus-map-api
pnpm test              # Vitest unit + integration (supertest against Fastify)
pnpm test:coverage
pnpm lint

# Frontend
cd bus-map-web
pnpm test              # Vitest + Testing Library (component tests, MSW-backed)
pnpm test:e2e          # Playwright (real browser)
pnpm lint
```

---

## End-to-end verification

1. `node provision.mjs` completes with no errors.
2. `cd bus-map-api && pnpm dev` — API on `:3000`.
3. `cd bus-map-web && pnpm dev` — Web on `:5173`.
4. Open `http://localhost:5173`.
5. Pan/zoom to the region covered by the imported feed (default `tld-576`).
6. Verify:
   - agencies appear in the side panel at city zoom;
   - selecting an agency filters route polylines on the map;
   - selecting a route auto-fits the viewport and reveals stops at zoom 13;
   - clicking a stop opens the info panel with today's scheduled departures.

Canonical verification flow also captured in
`spec-bus-map/specs/001-gtfs-bus-map/quickstart.md`.

---

## Compact GTFS Storage (feature 002)

The default pipeline now stores GTFS data in a compact schema alongside the
legacy tables, reducing PostgreSQL footprint ≥ 70 % on typical bus feeds.
Four techniques are applied at import time:

| Technique | Saving |
|-----------|--------|
| Stop-time **pattern deduplication** — identical stop sequences stored once | ~60 % of stop_times rows |
| **Frequency collapse** — runs of ≥ 4 evenly-spaced trips collapsed to a headway | varies |
| **Integer ID surrogates** — GTFS string IDs replaced by `feed_<kind>` lookup tables | ~40 % of index size |
| **Shape compression** — Douglas-Peucker @ 5 m + polyline6 encoding + geometry hash dedup | ~55 % of shape bytes |

New compact tables: `stops_compact`, `shapes_compact`, `agencies_compact`,
`routes_compact`, `stop_patterns`, `pattern_stops`, `trips_compact`,
`frequencies_compact`, `calendar_compact`, `calendar_dates_compact`, and six
`feed_<kind>` id-mapping tables.

All public API endpoints are backwards-compatible: the read services
transparently query compact tables when `pipeline_version = 2` data is present
and fall back to legacy tables otherwise.

Legacy tables (`stops`, `routes`, `trips`, `stop_times`, `shapes`, `calendar`,
`calendar_dates`) are preserved until every feed has been re-ingested under the
compact pipeline, at which point `0003_drop_legacy_gtfs.sql` can be applied
manually.

### Benchmarking

```bash
cd bus-map-api

# Measure footprint of all tables and emit JSON
pnpm bench:footprint --output bench/compact-tld-576.json

# Compare two snapshots: baseline (legacy) vs candidate (compact)
pnpm bench:footprint --compare \
  --baseline  bench/legacy-tld-576.json \
  --candidate bench/compact-tld-576.json
# Exits 1 if total reduction < 70 %
```

Full end-to-end verification steps:
`spec-bus-map/specs/002-compact-gtfs-storage/quickstart.md`

---

## Deploy

Frontend on **Vercel**, backend + workers + DB + Redis on **Railway**.

Full step-by-step guide: [`spec-bus-map/specs/003-deployment/quickstart.md`](spec-bus-map/specs/003-deployment/quickstart.md)

Summary:
1. Railway: create PostGIS Docker service (`postgis/postgis:17-3.4`) + Redis addon + API web service + worker background service.
2. Vercel: import `bus-map24` repo, set root = `bus-map-web`, set `VITE_API_URL` to Railway API URL.
3. API start command: `node dist/db/migrate.js && node dist/server.js` — migrations run automatically on every deploy.
4. Worker start command: `node dist/worker.js` — long-lived BullMQ process, no public networking.

Health check: `GET /healthz` returns `{ status: "ok", db: "ok", redis: "ok" }`.

**Admin UI** — set these on the Railway API service:
- `ADMIN_PASSWORD` — strong password for `/admin` login
- `JWT_SECRET` — min 32-char random string (`openssl rand -hex 32`)

---

## spec-kit focus

The primary goal is validating spec-kit on a non-trivial, real-world domain.
Artefacts under `spec-bus-map/specs/001-gtfs-bus-map/`:

- `spec.md` — functional specification (no implementation detail);
- `plan.md` — technical plan derived from the spec;
- `research.md` — technology trade-offs (MapLibre vs Mapbox, PMTiles vs
  MVT-on-the-fly, node-gtfs vs custom parser, etc.);
- `data-model.md` — entity model mapped onto GTFS + PostGIS;
- `tasks.md` — granular task list that drove implementation;
- `contracts/` — API contracts consumed by both Fastify (server validation)
  and the MSW handlers (mock parity);
- `quickstart.md` — the canonical "did we meet the spec?" verification.

`spec-bus-map/.specify/` contains spec-kit's own templates, scripts and
memory files. The running apps `bus-map-api` and `bus-map-web` are the
**observable output** of the spec-kit cycle: every commit traces back to
one or more tasks in `tasks.md`, and the quickstart checklist is the
acceptance gate.

---

## Troubleshooting

- **`pg_isready` fails on macOS** — `postgresql@17` is keg-only. Prepend
  `$(brew --prefix postgresql@17)/bin` to `PATH`.
- **`permission denied for schema public`** — re-run
  `GRANT ALL ON SCHEMA public TO busmap;` on `busmapdb`.
- **`tippecanoe: command not found` on Windows** — no native Windows build.
  Generate tiles under WSL2 or copy from a mac/linux host.
- **Feed import hangs** — check `MOBILITY_DB_REFRESH_TOKEN` in
  `bus-map-api/.env`; inspect BullMQ logs with `LOG_LEVEL=debug`.
- **CORS errors in browser** — make sure `VITE_API_BASE_URL` matches the
  actual backend `PORT`.
- **Map is blank** — confirm PMTiles were generated (`ls
  bus-map-api/tiles/`) and that `VITE_TILES_BASE_URL` resolves to a
  Fastify-served path.
- **Windows: `net start` returns "service not found"** — service name may
  differ by installer version. Check with
  `Get-Service *postgres*,*redis*`.
