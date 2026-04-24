# Data Model: Deployment

**Feature**: `003-deployment` | **Date**: 2026-04-24

No new database entities. This feature is infrastructure-only.

---

## Environment Variables

### `bus-map-api` (API + Worker services)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✓ | `postgresql://busmap:busmap@localhost:5432/busmapdb` | PostgreSQL connection string |
| `REDIS_URL` | ✓ | `redis://localhost:6379` | Redis connection string |
| `PORT` | — | `3000` | HTTP listen port (Railway injects automatically) |
| `HOST` | — | `0.0.0.0` | HTTP listen host |
| `CORS_ORIGIN` | ✓ prod | `*` | Allowed CORS origin(s); comma-separated or `*` |
| `PMTILES_OUTPUT_DIR` | — | `./tiles` | Filesystem path for PMTiles output |
| `LOG_LEVEL` | — | `info` | Fastify log level |
| `MOBILITY_DB_REFRESH_TOKEN` | ✓ | — | MobilityDatabase API token |
| `FEED_REFRESH_CRON` | — | `0 2 * * 1` | Cron expression for catalog sync |
| `MAX_DOWNLOAD_WORKERS` | — | `3` | BullMQ concurrency for feed downloads |
| `PIPELINE_VERSION` | — | `2` | Compact pipeline version marker |

### `bus-map-web` (Vercel)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | ✓ prod | (empty = same origin) | Full URL of Railway API, e.g. `https://bus-map-api.railway.app` |

---

## New Files

| File | Purpose |
|---|---|
| `bus-map-api/src/worker.ts` | Worker process entry — starts all BullMQ workers |
| `bus-map-api/src/db/migrate.ts` | Programmatic migration runner (used in prod start command) |
| `bus-map-api/railway.json` | Railway API service config |
| `bus-map-api/railway.worker.json` | Railway worker service config (or configured in dashboard) |
| `bus-map-api/Dockerfile` | Docker build for Railway (optional, Nixpacks fallback) |
| `bus-map-web/vercel.json` | Vercel project config |

---

## Railway Service Topology

```
Railway Project: bus-map24
├── api          (web service, bus-map-api, start: migrate + server)
├── worker       (background, bus-map-api, start: worker.ts)
├── postgres     (custom Docker: postgis/postgis:17-3.4)
│   └── volume   /var/lib/postgresql/data
├── redis        (Railway Redis addon)
└── volume       (persistent, mounted on api + worker at /app/tiles)
```
