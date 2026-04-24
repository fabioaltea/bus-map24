# Tasks: Production Deployment (003)

**Input**: Design documents from `/specs/003-deployment/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story/FR group this task belongs to

---

## Phase 1: Setup (Branch + Config Files)

**Purpose**: Create feature branch, config files, and new entry points that everything else depends on.

- [X] T001 Create feature branch `003-deployment` from `main` and verify clean working tree
- [X] T002 Add `"worker": "node dist/worker.js"` and `"db:migrate:prod": "node dist/db/migrate.js"` scripts to `bus-map-api/package.json`
- [X] T003 [P] Create `bus-map-api/src/db/migrate.ts` — programmatic Drizzle migration runner using `migrate()` from `drizzle-orm/node-postgres/migrator`; reads `DATABASE_URL` from env; exits with code 1 on failure
- [X] T004 [P] Create `bus-map-api/src/worker.ts` — imports `catalogSyncWorker` from `./jobs/workers/catalog-sync.worker.js` and `feedDownloadWorker` from `./jobs/workers/feed-download.worker.js`; logs startup; handles `SIGTERM` / `SIGINT` for graceful shutdown (calls `worker.close()` on each)

**Checkpoint**: `pnpm build` compiles `dist/worker.js` and `dist/db/migrate.js` without errors.

---

## Phase 2: Foundational — Backend Hardening

**Purpose**: Changes to `bus-map-api` required by all deployment targets (CORS, health check, tsconfig).

- [X] T005 Edit `bus-map-api/src/app.ts` — update `@fastify/cors` registration: `origin` reads `process.env.CORS_ORIGIN`; if value is `'*'` or unset → `true`; otherwise split on comma and return array of trimmed strings
- [X] T006 Add `GET /healthz` route to `bus-map-api/src/app.ts` — runs `SELECT 1` via `db.execute(sql\`SELECT 1\`)` and pings Redis via `new Redis(REDIS_URL).ping()`; returns `{ status: 'ok'|'error', db: 'ok'|'error', redis: 'ok'|'error' }` with HTTP 200 or 503
- [X] T007 Verify `bus-map-api/tsconfig.build.json` includes `src/worker.ts` and `src/db/migrate.ts` in compilation (check `include` patterns or add explicit entries if needed)
- [X] T008 Update `bus-map-api/.env.example` — add `CORS_ORIGIN=*` entry with comment explaining production usage

**Checkpoint**: `pnpm build && curl localhost:3000/healthz` returns `{ status: "ok" }`.

---

## Phase 3: FR-001 — Vercel Frontend Deployment

**Goal**: `bus-map-web` deployable to Vercel from monorepo root with correct API URL.

**Independent test**: `vercel build` succeeds in `bus-map-web/`; SPA routes resolve; `VITE_API_URL` is read at build time.

- [X] T009 [P] [US1] Create `bus-map-web/vercel.json` —
  ```json
  {
    "buildCommand": "pnpm build",
    "outputDirectory": "dist",
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
  }
  ```
- [X] T010 [P] [US1] Verify `bus-map-web/src/services/api.ts` uses `import.meta.env.VITE_API_URL ?? ''` as base URL (empty string = same-origin fallback for local dev); update if currently hardcoded to `localhost:3000`
- [X] T011 [US1] Smoke test: run `pnpm build` in `bus-map-web/`; verify `dist/index.html` exists and `dist/assets/` contains bundled JS

**Checkpoint**: `vercel --prod` (or Vercel dashboard import) deploys successfully. Map loads at Vercel URL.

---

## Phase 4: FR-002 / FR-003 — Railway API + Worker Deployment

**Goal**: API and worker services deployable to Railway from `bus-map-api/`.

**Independent test**: `pnpm build && node dist/db/migrate.js && node dist/server.js` starts without error; `node dist/worker.js` logs BullMQ worker boot.

- [X] T012 [P] [US2] Create `bus-map-api/railway.json` —
  ```json
  {
    "$schema": "https://railway.app/railway.schema.json",
    "build": { "builder": "NIXPACKS" },
    "deploy": {
      "startCommand": "node dist/db/migrate.js && node dist/server.js",
      "healthcheckPath": "/healthz",
      "healthcheckTimeout": 30,
      "restartPolicyType": "ON_FAILURE",
      "restartPolicyMaxRetries": 3
    }
  }
  ```
- [X] T013 [P] [US2] Create `bus-map-api/nixpacks.toml` to pin Node 22 and set install/build phases:
  ```toml
  [phases.setup]
  nixPkgs = ["nodejs_22"]
  [phases.install]
  cmds = ["npm install -g pnpm@9", "pnpm install --frozen-lockfile"]
  [phases.build]
  cmds = ["pnpm build"]
  ```
- [X] T014 [US2] Verify `bus-map-api/src/server.ts` listens on `HOST=0.0.0.0` (already done) and reads `PORT` from env; confirm no hardcoded port references remain
- [ ] T015 [US2] Local end-to-end smoke test: set `DATABASE_URL` + `REDIS_URL` env vars pointing to local services; run `node dist/db/migrate.js` (verify idempotent); run `node dist/server.js`; run `node dist/worker.js` in separate terminal; `curl localhost:3000/healthz` → 200

**Checkpoint**: `railway up` in `bus-map-api/` deploys API; Railway logs show migration + server boot.

---

## Phase 5: FR-004 — PostgreSQL + PostGIS on Railway

**Goal**: Document Railway Docker service setup for `postgis/postgis:17-3.4`.

**Independent test**: `psql $DATABASE_URL -c "SELECT PostGIS_Version()"` returns version string.

- [X] T016 [US3] Add `bus-map-api/docs/railway-postgres-setup.md` — step-by-step: create Railway service → Docker image `postgis/postgis:17-3.4` → set `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` → add volume at `/var/lib/postgresql/data` → copy internal hostname for `DATABASE_URL`
- [ ] T017 [US3] Verify all Drizzle migrations run clean against a fresh PostGIS DB: spin up `docker run -e POSTGRES_DB=busmapdb -e POSTGRES_USER=busmap -e POSTGRES_PASSWORD=test -p 5433:5432 postgis/postgis:17-3.4`; run `DATABASE_URL=postgresql://busmap:test@localhost:5433/busmapdb node dist/db/migrate.js`; assert exit 0

**Checkpoint**: All 4 migrations apply cleanly to a fresh PostGIS 17 container.

---

## Phase 6: Polish & Cross-Cutting

**Purpose**: `.env.example` completeness, README deploy section, final validation.

- [X] T018 [P] Update root `README.md` — add "Deploy" section with links to `quickstart.md` and one-liner summary of Vercel + Railway setup
- [X] T019 [P] Update `bus-map-api/.env.example` — ensure all variables from `data-model.md` are present with example values and comments
- [ ] T020 Full end-to-end smoke check against deployed services (per `quickstart.md` step 6): health check, agencies endpoint, CORS header, worker logs in Railway dashboard
- [ ] T021 Commit all changes, push `003-deployment` branch, open PR to `main`

---

## Dependencies

```
T001 (branch)
  └── T002, T003, T004 (parallel)
        └── T007 (tsconfig check, depends on T003+T004 existing)
              └── T005, T006, T008 (parallel, foundational)
                    ├── T009, T010, T011 (Vercel, after T005 CORS)
                    ├── T012, T013, T014, T015 (Railway API)
                    └── T016, T017 (Railway Postgres)
                          └── T018, T019, T020, T021 (Polish)
```

---

## Parallel Execution Groups

**Group A** (after T001): T002, T003, T004  
**Group B** (after T007): T005, T006, T008  
**Group C** (after Group B): T009+T010 (Vercel) || T012+T013+T014 (Railway) || T016 (Postgres docs)  
**Group D** (after Group C): T018, T019 in parallel; T020 after T015+T017  

---

## Implementation Strategy

**MVP (ship first)**: T001–T015 — gets frontend on Vercel and API+worker on Railway.  
**Phase 2**: T016–T017 — Postgres setup docs + migration smoke test.  
**Polish**: T018–T021.  

Total tasks: **21**  
Parallelizable: **10** (marked [P])  
Blocking sequential: **5** (T001→T002→T007→T015→T020)
