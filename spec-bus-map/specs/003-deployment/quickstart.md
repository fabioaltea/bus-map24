# Quickstart: Production Deployment

**Feature**: `003-deployment` | **Date**: 2026-04-24

---

## Prerequisites

- Railway account + CLI (`npm i -g @railway/cli && railway login`)
- Vercel account + CLI (`npm i -g vercel && vercel login`)
- Repo pushed to GitHub

---

## 1. Railway — PostgreSQL + PostGIS

In Railway dashboard → New Project → Add Service → Docker Image:
```
Image: postgis/postgis:17-3.4
```

Set environment variables on the service:
```
POSTGRES_DB=busmapdb
POSTGRES_USER=busmap
POSTGRES_PASSWORD=<generate strong password>
```

Add a volume: mount at `/var/lib/postgresql/data`.

Copy the internal hostname: `postgres.railway.internal:5432`.

---

## 2. Railway — Redis

Add Service → Redis (from Railway templates). Note the `REDIS_URL` from the service variables tab.

---

## 3. Railway — API Service

Add Service → GitHub Repo → select `bus-map24`, root directory = `bus-map-api`.

Set variables:
```
DATABASE_URL=postgresql://busmap:<pw>@postgres.railway.internal:5432/busmapdb
REDIS_URL=<from Redis service>
CORS_ORIGIN=https://<your-vercel-domain>.vercel.app
MOBILITY_DB_REFRESH_TOKEN=<token>
PMTILES_OUTPUT_DIR=/app/tiles
PORT=3000
```

Add volume: mount at `/app/tiles`.

Railway will auto-detect Node.js via Nixpacks. Verify build command:
```
pnpm install --frozen-lockfile && pnpm build
```
Start command:
```
node dist/db/migrate.js && node dist/server.js
```

---

## 4. Railway — Worker Service

Add Service → GitHub Repo → same repo, root directory = `bus-map-api`.

Same environment variables as API service (copy from there).

Start command:
```
node dist/worker.js
```

No public networking needed — disable it.

---

## 5. Vercel — Frontend

```bash
cd bus-map-web
vercel --prod
```

Or via Vercel dashboard → Import Git Repository → `bus-map24`, root = `bus-map-web`.

Set environment variable:
```
VITE_API_URL=https://<railway-api-domain>.railway.app
```

Rebuild & deploy after setting the env var.

---

## 6. Verify

```bash
VERCEL=https://<your-app>.vercel.app
API=https://<your-api>.railway.app

# Map loads
curl -I $VERCEL

# API health
curl $API/healthz

# Agencies
curl "$API/api/agencies?bbox=39.1,9.0,39.4,9.3" | jq '.data[].name'

# CORS header present
curl -I -H "Origin: $VERCEL" $API/api/feeds
```

---

## Merge gate checklist

- [ ] `GET /healthz` returns `200` with `db: "ok", redis: "ok"`
- [ ] Frontend loads at Vercel URL
- [ ] Agencies endpoint returns data (CORS OK)
- [ ] Worker service running (check Railway logs for BullMQ boot message)
- [ ] Migrations applied (check Railway deploy logs)
