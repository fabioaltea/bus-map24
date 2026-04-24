# Infrastructure Contract

**Feature**: `003-deployment` | **Date**: 2026-04-24

---

## Health Check

```
GET /healthz
→ 200 { status: "ok", db: "ok", redis: "ok" }
→ 503 { status: "error", db: "error" | "ok", redis: "error" | "ok" }
```

Railway uses this for health checks and zero-downtime restarts.

---

## CORS Policy (production)

```
Access-Control-Allow-Origin: <CORS_ORIGIN env var>
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

`CORS_ORIGIN` must be set to the Vercel deployment URL(s). Multiple origins: comma-separated.

---

## Build Contract

### API (Railway)

```bash
# Build
pnpm install --frozen-lockfile
pnpm build                          # tsc → dist/

# Start
node dist/db/migrate.js && node dist/server.js
```

### Worker (Railway)

```bash
# Same build as API (same service, different start command)
node dist/worker.js
```

### Frontend (Vercel)

```bash
pnpm install --frozen-lockfile
pnpm build                          # vite build → dist/
# Output dir: dist/
# SPA rewrite: /* → /index.html
```

---

## Deployment Sequence

1. Railway builds API image (pnpm install + tsc)
2. Railway runs `node dist/db/migrate.js` — applies pending migrations
3. Railway starts `node dist/server.js` — new instance receives traffic
4. Old instance drains and stops
5. Worker service restarts automatically (shared image)

Drizzle `migrate()` is idempotent — safe to run on every deploy.
