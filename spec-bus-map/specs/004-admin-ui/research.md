# Research: Admin UI (004)

**Feature**: `004-admin-ui` | **Date**: 2026-04-24

---

## Authentication

**Decision**: JWT login form — `POST /api/admin/auth/login` exchanges `ADMIN_PASSWORD` for a signed JWT; stored in `localStorage`; verified via Fastify preHandler on all `/api/admin/*` routes.

**Rationale**:
- Vercel Password Protection requires Pro/Enterprise plan — overkill for single-admin internal tool.
- Vercel Edge Middleware for route protection in a Vite SPA adds significant complexity with minimal gain.
- Raw API-key in sessionStorage is simpler but worse UX (clears on refresh). JWT in localStorage survives refresh.
- JWT is stateless (no DB table), signed with `JWT_SECRET` env var, 24h expiry.

**Alternatives considered**:
- Vercel Password Protection: protects entire deployment, not just `/admin`; requires paid plan upgrade.
- Vercel Edge Middleware: possible but requires restructuring Vite project for edge runtime; not worth it.
- Plain API key in sessionStorage: simpler but loses session on tab close, bad UX.

**Implementation**: `@fastify/jwt` plugin (already commonly paired with Fastify). New env vars: `ADMIN_PASSWORD` (hashed or plain), `JWT_SECRET`.

---

## Admin Routes — Backend

**Decision**: All admin endpoints under `/api/admin/*` as a separate Fastify plugin with JWT preHandler. Separate from public `/api/*` routes.

**Rationale**: Clear separation between public read-only routes and admin mutation routes. Single preHandler registration covers all admin routes.

---

## Feed Metadata Fields

**Decision**: Edit `brandColor`, `logoUrl`, `city` directly on the `agencies` table. No new table needed.

**Rationale**: These fields already exist on `agencies` (added in feature 002). Admin UI just needs `PATCH /api/admin/agencies/:id` to update them. A feed may have multiple agencies — admin edits each separately on the feed detail page.

**Note**: `countryCode` is on `feed_catalog_entries`, not `agencies`. Admin can also update it via `PATCH /api/admin/feeds/:id`.

---

## Add Feed — BullMQ Integration

**Decision**: `POST /api/admin/feeds` upserts a `feed_catalog_entries` row and enqueues a `QUEUE_FEED_DOWNLOAD` BullMQ job. Reuses the existing `feedDownloadWorker` and job pipeline unchanged.

**Rationale**: Zero new infrastructure. The worker already handles the full download → import → tile-gen pipeline.

---

## Frontend Routing

**Decision**: `/admin/*` routes added to existing `bus-map-web` SPA using React Router `<ProtectedRoute>` wrapper. No separate deployment.

**Rationale**: Simpler than a second Vercel project. Admin pages are small; bundle size impact is negligible. `ProtectedRoute` checks localStorage for valid JWT before rendering admin pages.

---

## New Dependencies

| Package | Where | Purpose |
|---|---|---|
| `@fastify/jwt` | bus-map-api | JWT sign/verify |
| `react-router-dom` | bus-map-web | Client-side routing for /admin (check if already present) |

---

## Environment Variables (new)

| Variable | Service | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | Railway API | Password for admin login |
| `JWT_SECRET` | Railway API | HMAC secret for JWT signing (min 32 chars) |
