# Quickstart: GTFS Bus Map Explorer

**Date**: 2026-04-13
**Repos**: `spec-bus-map-api` (backend) + `spec-bus-map-web` (frontend)

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22 LTS | `nvm install 22` |
| pnpm | 9+ | `npm i -g pnpm` |
| PostgreSQL | 16 + PostGIS 3 | Homebrew (see below) |
| Redis | 7+ | Homebrew (see below) |
| tippecanoe | 2.x | `brew install tippecanoe` |

### Native macOS setup (no Docker)

```bash
# 1. Install all services
brew install postgresql@17 postgis redis tippecanoe

# 2. Add postgresql@17 to PATH (keg-only formula)
#    Apple Silicon:
echo 'export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
#    Intel Mac:
# echo 'export PATH="/usr/local/opt/postgresql@17/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc

# 3. Start services
brew services start postgresql@17
brew services start redis

# 4. Create database, user, and enable PostGIS (run as your OS user, not busmap)
createdb busmapdb
psql busmapdb -c "CREATE USER busmap WITH PASSWORD 'busmap';"
psql busmapdb -c "GRANT ALL PRIVILEGES ON DATABASE busmapdb TO busmap;"
psql busmapdb -c "ALTER DATABASE busmapdb OWNER TO busmap;"
psql busmapdb -c "CREATE EXTENSION IF NOT EXISTS postgis;"   # must run as superuser

# 5. Verify
psql -U busmap -d busmapdb -c "SELECT PostGIS_version();"   # 3.6 USE_GEOS=1 ...
redis-cli ping                                               # PONG
tippecanoe --version                                         # v2.x.x
```

> **Note**: Homebrew's postgis bottle is built for PostgreSQL 17 (not 16). Use pg17.
> PostGIS 3.6 + pg17 is fully compatible with all Drizzle schema and PostGIS queries.

Stop/restart services at any time:

```bash
brew services stop postgresql@16    # or restart
brew services stop redis            # or restart
```

---

## Backend Setup (spec-bus-map-api)

```bash
# 1. Clone and install
git clone https://github.com/<org>/spec-bus-map-api
cd spec-bus-map-api
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env:
#   DATABASE_URL=postgresql://busmap:busmap@localhost:5432/busmapdb
#   REDIS_URL=redis://localhost:6379
#   MOBILITY_DB_API_KEY=<your_free_key_from_mobilitydatabase.org>
#   PMTILES_OUTPUT_DIR=./tiles
#   PORT=3000

# 3. Run database migrations
pnpm db:migrate

# 4. Seed with initial GTFS data (curated 3-city subset for development)
pnpm seed:dev
# Full seed (20+ cities, takes 30-60 min): pnpm seed:full

# 5. Start development server
pnpm dev
# API available at http://localhost:3000
```

### Verify backend is running

```bash
curl http://localhost:3000/api/agencies?bbox=51.4,-0.2,51.6,0.1
# Should return London agencies (TfL) after seeding
```

---

## Frontend Setup (spec-bus-map-web)

```bash
# 1. Clone and install
git clone https://github.com/<org>/spec-bus-map-web
cd spec-bus-map-web
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env:
#   VITE_API_BASE_URL=http://localhost:3000/api
#   VITE_TILES_BASE_URL=http://localhost:3000/tiles

# 3. Start development server
pnpm dev
# App available at http://localhost:5173
```

---

## Validate End-to-End

1. Open `http://localhost:5173` — full-screen map loads.
2. Navigate to London (51.5°N, 0.1°W) and zoom to level 10.
3. London agencies should appear in the left panel (TfL).
4. Select TfL → routes overlay appears on map.
5. Select route "Jubilee Line" → polyline highlights, stops appear at zoom 13.
6. Click a stop → information panel opens with name and scheduled departures.

---

## Running Tests

```bash
# Backend
cd spec-bus-map-api
pnpm test              # Unit + integration tests (Vitest)
pnpm test:e2e          # API contract tests (Vitest + supertest)

# Frontend
cd spec-bus-map-web
pnpm test              # Component tests (Vitest + Testing Library)
pnpm test:e2e          # Browser E2E tests (Playwright)
```

---

## Manual GTFS Import (single feed)

To import a specific GTFS feed without running the full pipeline:

```bash
cd spec-bus-map-api
pnpm import-feed --url https://example.com/gtfs.zip --provider "My Transit"
# Or using a local file:
pnpm import-feed --file ./my-transit.zip --provider "My Transit"
```

---

## Tile Generation (after data import)

```bash
cd spec-bus-map-api
pnpm generate-tiles        # Regenerates routes.pmtiles + stops.pmtiles
# Tiles written to PMTILES_OUTPUT_DIR (./tiles by default)
# Served by Fastify at /tiles/routes.pmtiles and /tiles/stops.pmtiles
```

---

## Environment Variables Reference

### spec-bus-map-api

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | — | Redis connection string |
| `MOBILITY_DB_API_KEY` | No | — | MobilityDatabase API key (optional for catalog CSV mode) |
| `PMTILES_OUTPUT_DIR` | No | `./tiles` | Directory to write generated PMTiles |
| `PORT` | No | `3000` | HTTP port |
| `LOG_LEVEL` | No | `info` | Fastify log level: `trace`, `debug`, `info`, `warn`, `error` |
| `FEED_REFRESH_CRON` | No | `0 2 * * 1` | Cron schedule for feed catalog refresh (default: Monday 2am) |
| `MAX_DOWNLOAD_WORKERS` | No | `3` | Concurrent feed download workers |

### spec-bus-map-web

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE_URL` | Yes | — | Backend API base URL |
| `VITE_TILES_BASE_URL` | Yes | — | PMTiles server base URL |
| `VITE_MAP_STYLE` | No | OpenFreeMap Liberty | MapLibre style URL |
