# spec-bus-map Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-15

## Active Technologies
- Shell / Homebrew formulae + `postgresql@16`, `postgis`, `redis`, `tippecanoe` (all via Homebrew) (001-gtfs-bus-map)
- PostgreSQL 16 + PostGIS 3 (local service, port 5432), Redis 7 (local service, port 6379) (001-gtfs-bus-map)

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
- 001-gtfs-bus-map: Added Shell / Homebrew formulae + `postgresql@16`, `postgis`, `redis`, `tippecanoe` (all via Homebrew)

- main: Added MSW v2 mock data layer (Phase MK) — enables frontend dev without backend infra
- main: Bootstrapped spec-bus-map-api (Fastify + Drizzle schema + BullMQ queues + lib helpers)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
