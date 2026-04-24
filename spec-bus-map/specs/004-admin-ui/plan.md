# Implementation Plan: Admin UI

**Branch**: `004-admin-ui` | **Date**: 2026-04-24 | **Spec**: [spec.md](./spec.md)

---

## Summary

Add an admin interface at `/admin` within `bus-map-web`. Backend: JWT auth endpoint + CRUD admin routes in `bus-map-api` under `/api/admin/*`. Frontend: login page + feed list + feed detail/edit pages. No new DB tables — mutations target existing `feed_catalog_entries` and `agencies`.

---

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22 LTS (API), React 18 / Vite 5 (FE)
**Primary Dependencies**: Fastify 4, `@fastify/jwt` (NEW), Drizzle ORM, BullMQ, React Router (FE)
**Auth**: JWT via `@fastify/jwt`; `ADMIN_PASSWORD` + `JWT_SECRET` env vars; no DB sessions
**Target**: same `bus-map-api` (Railway) + same `bus-map-web` (Vercel); no new services

---

## Constitution Check

- **Code Quality**: Admin routes isolated in `src/routes/admin/` with shared JWT preHandler ✓
- **Testing**: Login + PATCH endpoints have unit tests; feed list has integration test ✓
- **Performance**: Admin list endpoint p95 < 200 ms (small dataset, indexed queries) ✓
- **Security**: JWT verified on every admin route; no admin logic leaks into public routes ✓
- **UX Consistency**: Admin pages reuse existing design tokens where applicable ✓

---

## Project Structure

### Source Code Changes

```text
bus-map-api/
├── src/
│   ├── routes/
│   │   └── admin/
│   │       ├── auth.ts          # POST /api/admin/auth/login
│   │       ├── feeds.ts         # GET, POST /api/admin/feeds + POST .../refresh + PATCH .../feeds/:id
│   │       └── agencies.ts      # PATCH /api/admin/agencies/:id
│   └── app.ts                   # EDIT: register admin routes + @fastify/jwt plugin
└── package.json                 # EDIT: add @fastify/jwt

bus-map-web/
├── src/
│   ├── admin/
│   │   ├── AdminApp.tsx         # Admin router root (React Router)
│   │   ├── LoginPage.tsx        # /admin/login
│   │   ├── FeedListPage.tsx     # /admin
│   │   ├── FeedDetailPage.tsx   # /admin/feeds/:id
│   │   ├── components/
│   │   │   ├── FeedTable.tsx
│   │   │   ├── AddFeedModal.tsx
│   │   │   └── AgencyMetadataForm.tsx
│   │   └── services/
│   │       └── admin-api.ts     # Typed fetch wrappers for admin endpoints
│   └── main.tsx                 # EDIT: add /admin/* route pointing to AdminApp
```

---

## Phase 1: Backend

### 1.1 Install `@fastify/jwt`

```bash
pnpm add @fastify/jwt
```

### 1.2 Register JWT plugin in `app.ts`

```ts
await app.register(jwt, { secret: process.env.JWT_SECRET! })
```

### 1.3 Admin auth route (`src/routes/admin/auth.ts`)

```ts
// POST /api/admin/auth/login
// verifies req.body.password === process.env.ADMIN_PASSWORD
// returns { token: app.jwt.sign({ role: 'admin' }, { expiresIn: '24h' }) }
```

### 1.4 Admin preHandler (shared)

```ts
async function adminAuth(request, reply) {
  await request.jwtVerify()
}
```

Applied to all admin route plugins.

### 1.5 Feeds routes (`src/routes/admin/feeds.ts`)

- `GET /api/admin/feeds` — query `feed_catalog_entries` JOIN `agencies`; compute `metadataComplete`
- `POST /api/admin/feeds` — upsert feed row; enqueue `QUEUE_FEED_DOWNLOAD` job
- `PATCH /api/admin/feeds/:id` — update `countryCode`, `municipality`
- `POST /api/admin/feeds/:id/refresh` — set status `queued`; enqueue job with `forceRefresh: true`

### 1.6 Agencies route (`src/routes/admin/agencies.ts`)

- `PATCH /api/admin/agencies/:id` — validate + update `brandColor`, `logoUrl`, `city`

---

## Phase 2: Frontend

### 2.1 `src/admin/services/admin-api.ts`

Typed wrappers over `fetch` that:
- Read token from `localStorage`
- Include `Authorization: Bearer <token>` header
- Throw on 401 → trigger redirect to `/admin/login`

### 2.2 `src/admin/LoginPage.tsx`

- Password form → POST to `/api/admin/auth/login`
- On success: store JWT in `localStorage` → redirect to `/admin`

### 2.3 `ProtectedRoute` component

```tsx
// Reads localStorage JWT; if missing/expired → redirect to /admin/login
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('admin_token')
  if (!token) return <Navigate to="/admin/login" />
  return children
}
```

### 2.4 `src/admin/FeedListPage.tsx`

- Table: provider, country, status badge, last imported, metadata badge
- "Add Feed" button → `AddFeedModal`
- Row click → navigate to `/admin/feeds/:id`

### 2.5 `src/admin/FeedDetailPage.tsx`

- Feed header: provider, status, last imported, refresh button
- Per-agency section: `AgencyMetadataForm` (brandColor picker, logoUrl input, city input)

### 2.6 `src/main.tsx` edit

```tsx
// Add to router:
<Route path="/admin/login" element={<LoginPage />} />
<Route path="/admin/*" element={<ProtectedRoute><AdminApp /></ProtectedRoute>} />
```

---

## New Environment Variables

| Variable | Service | Notes |
|---|---|---|
| `ADMIN_PASSWORD` | Railway API | Strong password, set manually |
| `JWT_SECRET` | Railway API | Min 32 chars, random |
