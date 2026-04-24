# spec-bus-map Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-24

## Active Technologies
- Shell / Homebrew formulae + `postgresql@16`, `postgis`, `redis`, `tippecanoe` (all via Homebrew) (001-gtfs-bus-map)
- PostgreSQL 16 + PostGIS 3 (local service, port 5432), Redis 7 (local service, port 6379) (001-gtfs-bus-map)
- TypeScript 5 / Node.js 22 LTS (existing toolchain). + Fastify 4, Drizzle ORM 0.31, `node-gtfs` 4, (002-compact-gtfs-storage)
- PostgreSQL 17 + PostGIS 3. New schema version alongside (002-compact-gtfs-storage)
- TypeScript 5 / Node.js 22 LTS (API + Worker), React 18 / Vite 5 (FE) + Fastify 4, Drizzle ORM 0.31, BullMQ, @fastify/cors (003-deployment)
- PostgreSQL 17 + PostGIS 3 (Railway Docker), Redis (Railway addon), Railway Volume (PMTiles) (003-deployment)

- **Backend**: TypeScript 5 / Node.js 22 LTS — Fastify 4, Drizzle ORM, node-gtfs, BullMQ, tippecanoe
- **Frontend**: TypeScript 5 / browser — React 18, Vite 5, MapLibre GL JS, Deck.gl, TanStack Query, Zustand, MSW v2
- **Storage**: PostgreSQL 16 + PostGIS 3, PMTiles (disk/CDN), Redis 7

## Project Structure

```text
# Backend (spec-bus-map-api)
src/routes/     # Fastify handlers
src/services/   # Business logic
src/jobs/       # BullMQ workers
src/db/         # Drizzle schema + migrations
src/lib/        # bbox, calendar helpers
tests/unit/     # Vitest unit tests
tests/integration/

# Frontend (spec-bus-map-web)
src/components/ # Map/, Panels/, UI/
src/hooks/      # TanStack Query hooks + map hooks
src/stores/     # Zustand map store
src/services/   # API fetch wrappers
src/layers/     # Deck.gl layer configs
src/mocks/      # MSW v2 handlers + fixtures (dev only)
tests/components/
tests/e2e/
```

## Commands

```bash
# Both repos
pnpm test && pnpm lint

# Frontend mock-only dev (no backend needed)
VITE_MOCK_API=true pnpm dev
```

## Code Style

TypeScript 5 strict mode in both repos. ESLint (typescript-eslint) + Prettier enforced.

## Recent Changes
- 003-deployment: Added TypeScript 5 / Node.js 22 LTS (API + Worker), React 18 / Vite 5 (FE) + Fastify 4, Drizzle ORM 0.31, BullMQ, @fastify/cors
- 002-compact-gtfs-storage: Added TypeScript 5 / Node.js 22 LTS (existing toolchain). + Fastify 4, Drizzle ORM 0.31, `node-gtfs` 4,
- 001-gtfs-bus-map: Added Shell / Homebrew formulae + `postgresql@16`, `postgis`, `redis`, `tippecanoe` (all via Homebrew)


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
