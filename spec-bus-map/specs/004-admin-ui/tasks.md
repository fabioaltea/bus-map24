# Tasks: Admin UI (004)

**Input**: Design documents from `/specs/004-admin-ui/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story/FR group this task belongs to

---

## Phase 1: Setup (Branch + Dependencies)

**Purpose**: Feature branch, new dependencies, env var scaffolding.

- [ ] T001 Create feature branch `004-admin-ui` from `main` and verify clean working tree
- [ ] T002 [P] Add `@fastify/jwt` to `bus-map-api/package.json` — run `pnpm add @fastify/jwt` in `bus-map-api/`
- [ ] T003 [P] Add `react-router-dom` to `bus-map-web/package.json` — run `pnpm add react-router-dom` and `pnpm add -D @types/react-router-dom` in `bus-map-web/`
- [ ] T004 [P] Update `bus-map-api/.env.example` — add `ADMIN_PASSWORD=changeme` and `JWT_SECRET=<min-32-char-secret>` with comments

**Checkpoint**: `pnpm install` succeeds in both projects; no build errors.

---

## Phase 2: Foundational — Auth Infrastructure

**Purpose**: JWT plugin, login endpoint, frontend auth primitives. All user stories depend on this.

- [ ] T005 Edit `bus-map-api/src/app.ts` — register `@fastify/jwt` plugin: `app.register(jwt, { secret: process.env.JWT_SECRET! })`; add null-check guard that throws on missing `JWT_SECRET` or `ADMIN_PASSWORD` at startup
- [ ] T006 [P] Create `bus-map-api/src/routes/admin/auth.ts` — Fastify plugin at prefix `/api/admin/auth`; `POST /login` body `{ password: string }`; compare `request.body.password === process.env.ADMIN_PASSWORD`; on match return `{ token: app.jwt.sign({ role: 'admin' }, { expiresIn: '24h' }) }`; on mismatch return 401 RFC 7807 error
- [ ] T007 [P] Create `bus-map-web/src/admin/services/admin-api.ts` — `BASE` reads `import.meta.env.VITE_API_URL ?? ''`; export `adminFetch<T>(path, options?)` that reads `localStorage.getItem('admin_token')`, sets `Authorization: Bearer <token>` header, throws `AdminUnauthorizedError` on 401; export typed wrappers: `getAdminFeeds()`, `postAdminFeed(body)`, `patchAdminFeed(id, body)`, `refreshAdminFeed(id)`, `patchAdminAgency(id, body)`
- [ ] T008 [P] Create `bus-map-web/src/admin/ProtectedRoute.tsx` — reads `localStorage.getItem('admin_token')`; decodes JWT exp claim (no library needed, base64 split); if missing or expired redirect to `/admin/login`; otherwise render `children`
- [ ] T009 [P] Create `bus-map-web/src/admin/LoginPage.tsx` — centered form with password input and "Login" button; POST to `/api/admin/auth/login`; on success store token in `localStorage` as `admin_token` and `navigate('/admin')`; on 401 show "Invalid password" inline error
- [ ] T010 Register admin route plugins in `bus-map-api/src/app.ts` — import `authRoutes` from `./routes/admin/auth.js`, `feedsRoutes` from `./routes/admin/feeds.js`, `agenciesRoutes` from `./routes/admin/agencies.js`; register with `{ prefix: '/api/admin' }` and JWT preHandler hook on feeds + agencies plugins
- [ ] T011 Edit `bus-map-web/src/main.tsx` — wrap app in `<BrowserRouter>`; add routes: `<Route path="/admin/login" element={<LoginPage />} />` and `<Route path="/admin/*" element={<ProtectedRoute><AdminApp /></ProtectedRoute>} />`; existing map UI stays at `<Route path="/*" element={<App />} />`

**Checkpoint**: `pnpm build` passes in both projects. `POST /api/admin/auth/login` with correct password returns JWT.

---

## Phase 3: FR-001 — Feed List & Status (Priority: P1) 🎯 MVP

**Goal**: Admin sees all feeds with status badges and metadata completeness indicator at `/admin`.

**Independent Test**: Authenticated GET `/api/admin/feeds` returns feed array with `metadataComplete` flag; `/admin` renders feed table.

- [ ] T012 Create `bus-map-api/src/routes/admin/feeds.ts` — Fastify plugin; `GET /feeds`: query `feed_catalog_entries` LEFT JOIN `agencies`; for each feed compute `metadataComplete = agencies.every(a => a.brandColor && a.city)`; return `{ data: AdminFeedListItem[], total: number }` per contract
- [ ] T013 [P] Create `bus-map-web/src/admin/AdminApp.tsx` — React Router `<Routes>` with: `<Route index element={<FeedListPage />} />` and `<Route path="feeds/:id" element={<FeedDetailPage />} />`
- [ ] T014 [P] Create `bus-map-web/src/admin/components/FeedTable.tsx` — table with columns: Provider, Country, Status (badge: green=ready, yellow=queued/importing, red=failed), Last Imported, Metadata (green tick or yellow "Incomplete" badge); row click navigates to `/admin/feeds/:id`; accepts `feeds: AdminFeedListItem[]` prop
- [ ] T015 Create `bus-map-web/src/admin/FeedListPage.tsx` — calls `getAdminFeeds()` on mount; shows loading state; renders `FeedTable`; "Add Feed" button (disabled placeholder until T017); logout button clears `admin_token` and redirects to `/admin/login`

**Checkpoint**: `/admin` shows authenticated feed list with correct status badges and metadata flags.

---

## Phase 4: FR-002 — Add Feed (Priority: P2)

**Goal**: Admin adds a new feed by MobilityDB ID or URL; it appears in the list as `queued`.

**Independent Test**: `POST /api/admin/feeds { mobilityId: "tld-576" }` → 202 with `{ feedId, status: "queued" }`; feed appears in list.

- [ ] T016 Add `POST /feeds` handler to `bus-map-api/src/routes/admin/feeds.ts` — validate body: exactly one of `{ mobilityId }` or `{ url, provider, countryCode }`; if mobilityId: fetch metadata from MobilityDB API (reuse existing `MobilityDbClient`) and upsert `feed_catalog_entries`; if url: insert row with `mobilityDbId = null`; set `import_status = 'queued'`; enqueue `QUEUE_FEED_DOWNLOAD` BullMQ job; return 202 `{ feedId, status: 'queued' }`; return 409 on duplicate `mobilityDbId`
- [ ] T017 [P] Create `bus-map-web/src/admin/components/AddFeedModal.tsx` — modal with tab/toggle "By MobilityDB ID" vs "By URL"; MobilityDB tab: single text input for ID; URL tab: url + provider + countryCode inputs; "Add" button calls `postAdminFeed(body)`; on 202 close modal and callback `onSuccess()`; on 409 show "Feed already exists"; on 400 show validation error
- [ ] T018 Wire `AddFeedModal` into `bus-map-web/src/admin/FeedListPage.tsx` — "Add Feed" button opens modal; `onSuccess` re-fetches feed list

**Checkpoint**: Add Feed modal submits; new feed row appears with `queued` status.

---

## Phase 5: FR-004 — Edit Feed Metadata (Priority: P3)

**Goal**: Admin edits `brandColor`, `logoUrl`, `city` per agency; metadata completeness badge updates.

**Independent Test**: `PATCH /api/admin/agencies/:id { brandColor: "E1251B" }` → 200; agency row updated in DB; feed list `metadataComplete` flips to `true`.

- [ ] T019 Create `bus-map-api/src/routes/admin/agencies.ts` — Fastify plugin; `PATCH /agencies/:id`: validate `brandColor` matches `/^[0-9A-Fa-f]{6}$/` or null, `logoUrl` is valid URL or null, `city` ≤ 128 chars or null; update `agencies` table; return updated agency object; 400 on validation fail, 404 if agency not found
- [ ] T020 [P] Add `PATCH /feeds/:id` handler to `bus-map-api/src/routes/admin/feeds.ts` — update `countryCode` (2-char) and/or `municipality` on `feed_catalog_entries`; return updated feed row; 404 if not found
- [ ] T021 [P] Add `GET /feeds/:id` handler to `bus-map-api/src/routes/admin/feeds.ts` — return single `AdminFeedListItem` by feed id; 404 if not found
- [ ] T022 [P] Create `bus-map-web/src/admin/components/AgencyMetadataForm.tsx` — form with: `brandColor` (color picker `<input type="color">` + hex text input synced, shows preview swatch), `logoUrl` (text input with live img preview), `city` (text input); "Save" button calls `patchAdminAgency(id, body)`; inline error on 400; inline "Saved ✓" on 200
- [ ] T023 Create `bus-map-web/src/admin/FeedDetailPage.tsx` — reads `:id` from URL params; calls `GET /api/admin/feeds/:id` via `adminFetch`; shows feed header (provider, country, status badge, last imported); lists each agency with its name + `AgencyMetadataForm`; "Refresh" button (placeholder until T025)

**Checkpoint**: Feed detail page opens; metadata form saves; feed list badge updates after navigating back.

---

## Phase 6: FR-003 — Trigger Feed Refresh (Priority: P4)

**Goal**: Admin force-reimports a feed; status changes to `queued`.

**Independent Test**: `POST /api/admin/feeds/:id/refresh` → 202; feed `import_status` becomes `queued`; worker picks up job.

- [ ] T024 Add `POST /feeds/:id/refresh` handler to `bus-map-api/src/routes/admin/feeds.ts` — check `import_status` not `downloading` or `importing` (409 "Import already in progress"); update `import_status = 'queued'`; enqueue `QUEUE_FEED_DOWNLOAD` job with `{ feedId, forceRefresh: true }`; return 202 `{ feedId, status: 'queued' }`; 404 if feed not found
- [ ] T025 Wire Refresh button in `bus-map-web/src/admin/FeedDetailPage.tsx` — "Refresh Feed" button calls `refreshAdminFeed(id)`; on 202 update displayed status to "queued"; button disabled when status is `downloading` or `importing`; show 409 error inline

**Checkpoint**: Refresh button re-queues a ready/failed feed; status badge updates in UI.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T026 [P] Verify `pnpm build` passes in `bus-map-api/` and `bus-map-web/` with all new files
- [ ] T027 [P] Update root `README.md` — add note to "Deploy" section: set `ADMIN_PASSWORD` and `JWT_SECRET` on Railway API service
- [ ] T028 Run quickstart.md verification: login → list feeds → add feed → edit metadata → refresh — confirm all steps work end-to-end
- [ ] T029 Commit all changes, push `004-admin-ui` branch, open PR to `main`

---

## Dependencies

```
T001 (branch)
  └── T002, T003, T004 (parallel — deps install)
        └── T005 (jwt plugin in app.ts)
              └── T006, T007, T008, T009 (parallel — auth primitives)
                    └── T010, T011 (register routes + main.tsx)
                          ├── T012, T013, T014 (parallel — feed list backend + FE components)
                          │     └── T015 (FeedListPage wires T012+T014)
                          │           ├── T016 (add feed backend)
                          │           │     └── T017 (AddFeedModal)
                          │           │           └── T018 (wire modal into FeedListPage)
                          │           ├── T019, T020, T021, T022 (parallel — metadata backend + form)
                          │           │     └── T023 (FeedDetailPage wires T021+T022)
                          │           │           └── T024 (refresh backend)
                          │           │                 └── T025 (wire refresh button)
                          │           └── T026, T027 (parallel — build check + README)
                          │                 └── T028 → T029
```

---

## Parallel Execution Groups

**Group A** (after T001): T002, T003, T004
**Group B** (after T005): T006, T007, T008, T009
**Group C** (after T010+T011): T012, T013, T014 (backend feed list + FE components)
**Group D** (after T015): T016 (backend) || T019+T020+T021+T022 (metadata backend+FE)
**Group E** (after T028): T029

---

## Implementation Strategy

**MVP (ship first)**: T001–T015 — authenticated feed list at `/admin`.
**Phase 2**: T016–T018 — add feed capability.
**Phase 3**: T019–T023 — metadata editing.
**Phase 4**: T024–T025 — refresh trigger.
**Polish**: T026–T029.

Total tasks: **29**
Parallelizable: **13** (marked [P])
Blocking sequential: **7** (T001→T005→T010→T011→T015→T018→T028→T029)
