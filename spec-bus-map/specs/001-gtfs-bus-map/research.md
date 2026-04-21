# Research: GTFS Bus Map Explorer

**Phase**: 0 — Research & Technology Decisions
**Feature**: `specs/001-gtfs-bus-map/spec.md`
**Date**: 2026-04-13

---

## 1. Public GTFS Data Sources

### Decision
Primary source: **MobilityDatabase** (mobilitydatabase.org) for feed catalog + bulk downloads.
Secondary source: **Transitland** (transit.land) for metadata enrichment and agency bounding boxes.

### Findings

#### MobilityDatabase (Canonical GTFS Catalog)
- Operated by MobilityData.org — the official standards body for GTFS.
- Replaced OpenMobilityData (which shut down). All community feeds migrated.
- Catalog available as a free downloadable CSV: `https://bit.ly/catalogs-csv`
  (lists ~2,400+ feeds with download URLs, bounding boxes, country, updated dates).
- REST API v1 at `https://api.mobilitydatabase.org/v1/` — requires free API key.
  Endpoints: `GET /feeds`, `GET /feeds/{id}/download_latest_dataset`
- Feeds come as GTFS zip archives; sizes range from 100 KB (rural) to 500 MB (NYC MTA).
- License mix: public domain, CC-BY, or agency-specific. Most are openly redistributable.
- **Selected as primary source** — the catalog CSV enables offline seed without API quota.

#### Transitland (v2 API)
- Operated by Interline Technologies.
- Searchable API: `https://transit.land/api/v2/rest/agencies?bbox=lng1,lat1,lng2,lat2`
- API key required (free tier available).
- Richer metadata per agency (vehicle types, service area polygon, route counts).
- Does not provide direct GTFS zip downloads — redirects to original agency URLs.
- **Selected as secondary source** for agency metadata enrichment (logo URLs, service
  area polygons used in zoom-level filtering).

#### Notable Direct Agency GTFS Feeds
For the launch curated dataset (≥20 cities):

| Region | Agency | Feed URL pattern |
|--------|--------|------------------|
| North America | BART (SF) | bart.gov/dev/schedules |
| North America | MTA New York | api.mta.info |
| North America | TTC Toronto | ttc.ca/routes-and-schedules |
| Europe | Transport for London | tfl.gov.uk/tfl/syndication |
| Europe | RATP Paris | data.iledefrance-mobilites.fr |
| Europe | ATM Milan | atm.it/opendata |
| Europe | TMB Barcelona | opendata-ajuntament.barcelona.cat |
| Europe | BVG Berlin | bvg.de/de/abonnements-und-tickets |
| Asia-Pacific | TransLink Brisbane | translink.com.au |
| Asia-Pacific | Tokyo Metro | tokyometro.jp/en/corporate/enterprise/open-data |
| South America | SPTrans São Paulo | sptrans.com.br |

All listed above are available in the MobilityDatabase catalog.

### Alternatives Considered
- **OpenStreetMap transit data**: Available via Overpass API but in OSM format, not GTFS.
  Conversion tools exist (osm2gtfs) but data quality is inconsistent. Rejected.
- **Commercial data providers** (Moovit, HERE Transit): Require licensing fees and
  restrict redistribution. Rejected for v1.
- **User-uploaded feeds**: Increases scope significantly (parsing, validation, storage
  per user). Deferred to v2.

---

## 2. Map Rendering Technology

### Decision
**MapLibre GL JS** as base map renderer + **Deck.gl** for GTFS data layers.
Base tiles: **OpenFreeMap** (free, open vector tiles, no API key required).

### Findings

#### MapLibre GL JS
- Open-source WebGL map renderer (Apache 2.0 license). Fork of Mapbox GL JS v1.
- Handles millions of rendered features at 60 fps via WebGL 2.
- Supports custom style layers, allowing Deck.gl integration.
- First-class support for **PMTiles** (single-file archive for vector tiles) via
  the `pmtiles` protocol handler — critical for our tile serving strategy.
- TypeScript types included.
- **Selected**: best open-source option for flight-simulator-style rendering.

#### Deck.gl
- Uber's high-performance WebGL layer library.
- Key layers for our use case:
  - `GeoJsonLayer` — renders route polylines from GeoJSON or PMTiles data
  - `ScatterplotLayer` / `IconLayer` — renders stop markers
  - `PathLayer` — optimized polyline rendering for shapes
- Integrates natively with MapLibre via `@deck.gl/mapbox`.
- Handles 100k+ stops rendered simultaneously via GPU instancing.
- **Selected**: necessary for rendering global GTFS data efficiently.

#### Base Map Tiles — OpenFreeMap
- Truly free (no API key, no rate limits), OSM-based vector tiles.
- Tile URL: `https://tiles.openfreemap.org/styles/liberty`
- Dark style available (`positron` or custom) for the flight-simulator aesthetic.
- Self-hosting option available (download planet tiles).
- **Selected**: zero cost, no vendor lock-in.

#### Alternatives Considered
- **Leaflet + GeoJSON**: Simple but no WebGL — cannot handle 100k stops. Rejected.
- **Mapbox GL JS**: Requires proprietary license for non-Mapbox tile sources. Rejected.
- **CesiumJS** (3D globe): Authentic flight-simulator feel but enormous bundle size
  (~2 MB gzipped) and steep learning curve. Deferred to v2 as a potential enhancement.
- **MapTiler tiles**: Good quality but API key required; rate limits on free tier. Backup
  option if OpenFreeMap has reliability issues.

---

## 3. GTFS Data Pipeline & Caching Strategy

### Decision
**PostgreSQL 16 + PostGIS** for queryable data; **pre-generated PMTiles** for map
rendering. Scheduled weekly feed refresh with hash-based incremental updates.

### Architecture

```
MobilityDatabase Catalog CSV
        │
        ▼
 Feed Catalog Sync Job (weekly)
        │
        ├─ Compare ETags/hashes with stored versions
        │
        ▼
 Feed Download Job (per changed feed, via BullMQ queue)
        │
        ├─ Download GTFS zip
        ├─ Validate GTFS structure (required files present)
        ├─ Import to PostgreSQL via node-gtfs
        │
        ▼
 Tile Generation Job (post-import, per feed)
        │
        ├─ Export routes + shapes as GeoJSON
        ├─ Export stops as GeoJSON
        ├─ Run tippecanoe to generate .pmtiles archives
        └─ Upload PMTiles to object storage (S3 / R2 / local FS)
```

### Storage Breakdown

| Data type | Storage | Access pattern |
|-----------|---------|----------------|
| Agency metadata | PostgreSQL | API query by bbox |
| Route metadata | PostgreSQL | API query by agency/id |
| Stop metadata + schedules | PostgreSQL | API query by stop id / bbox |
| Route shapes (geometry) | PMTiles (vector tiles) | Direct map tile fetch |
| Stop locations (geometry) | PMTiles (vector tiles) | Direct map tile fetch |
| GTFS zip archives | Object storage (S3/R2) | Archive/recovery only |

### Feed Refresh Strategy
1. Weekly cron job fetches the MobilityDatabase catalog CSV.
2. For each feed entry: compare `hash_sha256` (provided in catalog) with stored hash.
3. If changed (or new feed): enqueue a download job in BullMQ.
4. Download job: fetch GTFS zip, validate, import via `node-gtfs` (upsert mode).
5. Post-import: regenerate PMTiles for that feed's bounding box.
6. Atomic tile swap: upload new PMTiles, update CDN pointer, delete old file.

### Concurrency
- BullMQ with max 3 concurrent download workers (bandwidth throttle).
- Tile generation CPU-bound (tippecanoe): max 2 concurrent on a 4-core server.
- Full re-import of 2,400 feeds estimated at ~48h initial load; initial launch uses
  curated 20-city subset (~2-4h).

### Alternatives Considered
- **SQLite per feed** (node-gtfs default): Simple but not queryable across feeds
  simultaneously (cross-agency bbox queries impossible). Rejected for multi-feed use.
- **DuckDB**: Excellent for analytics but lacks PostGIS spatial indexing. Rejected.
- **Flat GeoJSON served from CDN**: No server-side filtering — client downloads entire
  network per city. Too heavy for large networks (NYC: ~100 MB GeoJSON). Rejected.
- **Overture Maps transit layer**: Not yet available for transit at global scale. Future.

---

## 4. Frontend Architecture

### Decision
Vite 5 + React 18 + TypeScript 5 + MapLibre GL JS + Deck.gl + Zustand + TanStack Query.

### State Management — Zustand
- Lightweight (~1 KB) vs Redux overhead. Sufficient for this app's state:
  selected agency, selected route, selected stop, viewport bounds, active filters.
- No unnecessary re-renders via selector pattern.

### Data Fetching — TanStack Query
- Server state (agencies, routes, stops, schedules) separated from UI state.
- Built-in caching with stale-while-revalidate — avoids redundant API calls on
  map pan (same bbox hit twice within TTL returns from cache).
- Viewport bbox as query key: `useQuery({ queryKey: ['agencies', bbox], ... })`.

### Map Interaction Pattern
- Zoom levels mapped to data density thresholds:
  - Zoom 1–4: No transit data shown. World/continent view.
  - Zoom 5–8: Agency bounding box indicators only.
  - Zoom 9–12: Route polylines (from PMTiles) + agency panel.
  - Zoom 13+: Stop markers appear. Full detail.
- Debounced bbox extraction on `moveend` event to throttle API calls during pan.

### Bundle Strategy
- Route-based code splitting (Vite default) — map view is the only route in v1.
- MapLibre GL JS loaded lazily (large bundle: ~300 KB gzipped).
- Deck.gl loaded lazily.
- Target: initial JS payload < 200 KB gzipped; full app < 1 MB gzipped.

---

## 5. Backend Architecture

### Decision
Node.js 22 LTS + TypeScript 5 + Fastify 4 + Drizzle ORM + PostgreSQL/PostGIS + BullMQ.

### Why Fastify over Express
- 2–3× faster throughput than Express in benchmarks (important for bbox queries).
- Built-in TypeScript support and JSON schema validation via Ajv.
- Plugin system for lifecycle hooks (auth, rate limiting, CORS).

### Why Drizzle ORM
- Full TypeScript inference — no runtime type casting.
- SQL-first: writes PostGIS spatial functions without ORM overhead.
- Schema migrations via `drizzle-kit`.

### API Design
- RESTful JSON API. No GraphQL in v1 (simpler caching, simpler CDN).
- All geographic parameters as bbox: `sw_lat,sw_lng,ne_lat,ne_lng`.
- PostGIS `ST_Intersects(geom, ST_MakeEnvelope(...))` for spatial filtering.
- Response pagination where result sets can be large (stops in bbox).

---

## 6. Monorepo vs Two Repos

### Decision
**Two separate Git repositories** as specified by the user.

| Repo | Contents |
|------|----------|
| `spec-bus-map-api` | Fastify backend, GTFS pipeline, database schema, BullMQ jobs |
| `spec-bus-map-web` | Vite SPA, React components, MapLibre/Deck.gl layers |

- Shared TypeScript types (API response shapes) duplicated initially; extract to a
  shared npm package (`@spec-bus-map/types`) in v2 if drift becomes a problem.
- CI/CD pipelines independent — frontend can deploy without backend rebuild.
- Separate version histories appropriate since these are different deployment units.

---

## 9. Mock Data Layer for Development (Amendment 2026-04-13)

### Decision
**MSW v2 (Mock Service Worker)** for browser-side API mocking in `spec-bus-map-web`.

### Rationale
The GTFS data pipeline (B008 MobilityDatabase API key, B011 `db:migrate`, B024 seed run)
requires Docker, PostgreSQL/PostGIS, Redis, and tippecanoe installed locally. These manual
prerequisites block frontend development and UI iteration. MSW eliminates that dependency:

- Intercepts `fetch()` calls via a registered Service Worker before they leave the browser
- Returns typed fixture responses matching the `contracts/api.md` contract exactly
- Activated only when `VITE_MOCK_API=true`; production builds are unaffected
- Works natively with Vite 5 dev server — no proxy configuration required
- Fixture data can be used in Vitest component tests (MSW Node integration)

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|-----------------|
| json-server | Requires a running Node process; no TypeScript; cannot match exact API contract shape |
| Hardcoded fallback responses in `api.ts` | Pollutes production code; no Service Worker isolation; harder to remove |
| Separate Fastify mock server | Duplicate server setup; still requires `node` process; overkill for UI dev |
| MSW v1 | v2 has native ESM support, first-class TypeScript, and Vite 5 compatibility |

### MSW v2 Integration Pattern

```typescript
// src/main.tsx — conditional startup
if (import.meta.env.VITE_MOCK_API === 'true') {
  const { worker } = await import('./mocks/browser.js')
  await worker.start({ onUnhandledRequest: 'bypass' })
}
```

```typescript
// src/mocks/browser.ts
import { setupWorker } from 'msw/browser'
import { handlers } from './handlers/index.js'
export const worker = setupWorker(...handlers)
```

### Fixture Data — 5 Cities

| City | Agency | Routes | Stops | Approx BBox |
|------|--------|--------|-------|-------------|
| London | Transport for London (TfL) | 3 bus lines | 20 stops | 51.4,-0.5 → 51.7,0.1 |
| Rome | ATAC | 2 bus lines | 14 stops | 41.8,12.3 → 42.0,12.6 |
| New York | MTA New York City Transit | 2 bus lines | 16 stops | 40.6,-74.1 → 40.9,-73.8 |
| Berlin | BVG | 2 bus lines | 12 stops | 52.4,13.3 → 52.6,13.6 |
| Tokyo | Tokyo Metro | 1 metro line | 10 stops | 35.6,139.6 → 35.8,139.8 |

Fixture coordinates are real GPS positions so the base map renders correctly.

---

## 10. Local Development Environment without Docker (Amendment 2026-04-15)

### Decision

**Homebrew** for PostgreSQL 16 + PostGIS 3 and Redis 7 on macOS. No Docker required.
Primary path: `brew install postgresql@16 postgis redis tippecanoe`.
Fallback path: **Postgres.app** (bundles PostGIS, GUI start/stop) + `brew install redis tippecanoe`.

### Rationale

Docker Desktop adds a background Linux VM (~2-4 GB RAM overhead), requires a separate
install, and is unavailable on locked-down machines. Homebrew services are native
daemons managed by `launchd`, start on login, and use identical service versions
(PostgreSQL 16, Redis 7) — so ports, credentials, and `.env` values stay unchanged.

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|-----------------|
| Docker Desktop | User requirement: no Docker |
| Postgres.app | GUI-only stop/start; harder to script; kept as fallback only |
| nix-shell | Steep learning curve; adds a full package manager dependency |
| asdf / mise PostgreSQL plugin | Less stable than Homebrew formulae; PostGIS not available as asdf plugin |
| DuckDB local | No PostGIS spatial support; rejected in Section 3 |

### Homebrew Setup — Primary Path

#### Step 1: Install all services

```bash
brew install postgresql@16 postgis redis tippecanoe
```

`postgresql@16` is a keg-only formula (Homebrew installs it but does not symlink its
binaries into `/opt/homebrew/bin` by default). Add it to PATH:

```bash
# Apple Silicon
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Intel Mac
echo 'export PATH="/usr/local/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

#### Step 2: Start services

```bash
brew services start postgresql@16
brew services start redis
```

#### Step 3: Create database and enable PostGIS

```bash
createdb busmapdb
psql busmapdb -c "CREATE USER busmap WITH PASSWORD 'busmap';"
psql busmapdb -c "GRANT ALL PRIVILEGES ON DATABASE busmapdb TO busmap;"
psql busmapdb -c "ALTER DATABASE busmapdb OWNER TO busmap;"
psql busmapdb -U busmap -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

#### Step 4: Verify

```bash
psql -U busmap -d busmapdb -c "SELECT PostGIS_version();"
# Expected: 3.x.x ...
redis-cli ping
# Expected: PONG
tippecanoe --version
# Expected: tippecanoe v2.x.x
```

### Homebrew Setup — Fallback (Postgres.app)

If `postgis` formula conflicts with the Homebrew postgresql@16 install
(e.g., Homebrew defaults to postgresql@17 on a newer macOS version):

1. Download **Postgres.app** from `postgresapp.com` — choose version 16 with PostGIS.
2. Add CLI tools to PATH (shown in Postgres.app → Preferences → CLI Tools tab):
   ```bash
   sudo mkdir -p /etc/paths.d && echo /Applications/Postgres.app/Contents/Versions/16/bin | sudo tee /etc/paths.d/postgresapp
   ```
3. Start PostgreSQL from the Postgres.app menu bar icon.
4. Create user/database (same commands as Step 3 above).
5. Install Redis and tippecanoe via Homebrew as normal:
   ```bash
   brew install redis tippecanoe
   brew services start redis
   ```

### Service Lifecycle Reference

| Action | PostgreSQL 16 (Homebrew) | Redis 7 |
|--------|--------------------------|---------|
| Start | `brew services start postgresql@16` | `brew services start redis` |
| Stop | `brew services stop postgresql@16` | `brew services stop redis` |
| Restart | `brew services restart postgresql@16` | `brew services restart redis` |
| Status | `brew services info postgresql@16` | `brew services info redis` |
| Log | `tail -f $(brew --prefix)/var/log/postgresql@16.log` | `tail -f $(brew --prefix)/var/log/redis.log` |

### PostGIS Note on Homebrew Keg-Only Formulae

`postgresql@16` is keg-only when Homebrew's default PostgreSQL is a newer version (e.g.,
`postgresql@17`). The `postgis` formula resolves against the linked `pg_config`. Ensure
`pg_config` resolves to version 16 before installing PostGIS:

```bash
pg_config --version      # Should say: PostgreSQL 16.x
which pg_config          # Should resolve under opt/postgresql@16
```

If it resolves to a different version, force-link first:
```bash
brew link --force postgresql@16
brew install postgis
brew unlink postgresql@16   # optional: restore default pg after
```
