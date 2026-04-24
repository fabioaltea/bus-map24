# Feature Specification: Admin UI

**Feature Branch**: `004-admin-ui`
**Created**: 2026-04-24
**Status**: Draft

---

## User Scenarios & Testing

### User Story 1 — Feed List & Status (Priority: P1)

Admin opens `/admin` and sees all ingested feeds with their import status, last imported date, and a quick visual indicator for feeds with incomplete metadata.

**Why this priority**: Core dashboard — everything else is navigated from here.

**Independent Test**: Navigate to `/admin` after login; a table of feeds with status badges renders; feeds with missing brandColor/logoUrl/city are visually flagged.

**Acceptance Scenarios**:

1. **Given** the admin is authenticated, **When** they load `/admin`, **Then** a table shows all feeds from `feed_catalog_entries` with columns: provider, country, import status, last imported date, metadata completeness indicator.
2. **Given** a feed has `import_status = 'failed'`, **When** the admin views the list, **Then** the row shows a red "failed" badge and the error message on hover/expand.
3. **Given** a feed has `brandColor = null` on any of its agencies, **When** the admin views the list, **Then** the row shows a yellow "incomplete metadata" badge.

---

### User Story 2 — Add Feed (Priority: P2)

Admin submits a new feed via MobilityDB ID or direct URL; the feed enters the download queue and its status is visible in the feed list.

**Why this priority**: Core write operation — without it the admin can't grow the dataset.

**Independent Test**: POST to `/api/admin/feeds` with a valid `mobilityId`; a new row appears in the feed list with `status: queued`; worker logs show job picked up.

**Acceptance Scenarios**:

1. **Given** the admin submits a MobilityDB ID, **When** they click "Add Feed", **Then** the backend creates a `feed_catalog_entries` row and enqueues a BullMQ download job; the UI shows the new feed with status `queued`.
2. **Given** the admin submits a direct URL + provider name, **When** they click "Add Feed", **Then** same result as above but with `mobilityDbId = null`.
3. **Given** the feed already exists (duplicate mobilityDbId), **When** the admin submits it again, **Then** the API returns 409 and the UI shows "Feed already exists".

---

### User Story 3 — Edit Feed Metadata (Priority: P3)

Admin opens a feed detail page and fills in `brandColor`, `logoUrl`, `city` for each agency in the feed.

**Why this priority**: Quality-of-life — missing metadata degrades the map UI but doesn't break it.

**Independent Test**: PATCH `/api/admin/agencies/:id` with `{ brandColor: "E1251B" }`; the agency record updates; the map UI reflects the new color on next load.

**Acceptance Scenarios**:

1. **Given** an agency has `brandColor = null`, **When** the admin enters a hex color and saves, **Then** `agencies.brand_color` is updated and the feed list no longer shows the "incomplete metadata" badge for that feed.
2. **Given** an invalid hex color (e.g. "ZZZZZZ"), **When** the admin saves, **Then** the API returns 400 and the field shows an inline error.
3. **Given** the admin sets `logoUrl`, **When** the map loads, **Then** the agency marker uses the new logo instead of Clearbit.

---

### User Story 4 — Trigger Feed Refresh (Priority: P4)

Admin clicks "Refresh" on a feed to re-download and re-import it, regardless of the hash check.

**Why this priority**: Operational need — handles feeds that change URLs or whose imports have failed.

**Independent Test**: POST `/api/admin/feeds/:id/refresh`; the feed status changes to `queued`; the worker re-runs the full import pipeline.

**Acceptance Scenarios**:

1. **Given** a feed with `import_status = 'ready'`, **When** the admin triggers refresh, **Then** status changes to `queued`, a BullMQ job is enqueued with `forceRefresh: true`.
2. **Given** a refresh is already in progress (`status = 'importing'`), **When** the admin clicks refresh, **Then** the API returns 409 "Import already in progress".

---

### Edge Cases

- What happens when `ADMIN_API_KEY` env var is missing? → API returns 500 on startup, not 401.
- What happens when the admin submits a URL that returns a non-GTFS zip? → Import fails with `error_message` set; visible in feed list.
- What happens when the frontend sessionStorage is cleared mid-session? → Next admin API call gets 401; UI redirects to `/admin/login`.

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST expose `GET /api/admin/feeds` returning all `feed_catalog_entries` rows with agency metadata completeness flag.
- **FR-002**: System MUST expose `POST /api/admin/feeds` accepting `{ mobilityId } | { url, provider, countryCode }` to add a new feed.
- **FR-003**: System MUST expose `POST /api/admin/feeds/:id/refresh` to force re-import of an existing feed.
- **FR-004**: System MUST expose `PATCH /api/admin/agencies/:id` to update `brandColor`, `logoUrl`, `city` on an agency.
- **FR-005**: All `/api/admin/*` routes MUST require `Authorization: Bearer <ADMIN_API_KEY>` header; return 401 on mismatch.
- **FR-006**: Frontend MUST provide a `/admin/login` page that accepts a password and stores a session token in `sessionStorage`.
- **FR-007**: Frontend MUST redirect unauthenticated requests to `/admin/*` to `/admin/login`.
- **FR-008**: Frontend MUST provide a feed list page at `/admin` with status badges and metadata completeness indicator.
- **FR-009**: Frontend MUST provide a feed detail/edit page at `/admin/feeds/:id` with per-agency metadata form.
- **FR-010**: Frontend MUST allow adding a new feed via a modal form (MobilityDB ID or URL + provider).

### Key Entities

- **FeedCatalogEntry**: existing — `id`, `mobilityDbId`, `provider`, `countryCode`, `municipality`, `importStatus`, `lastImportedAt`, `errorMessage`
- **Agency**: existing — `id`, `feedId`, `name`, `brandColor`, `logoUrl`, `city` — admin-editable fields
- **AdminSession**: frontend-only — API key stored in `sessionStorage`; no backend session table

---

## Success Criteria

- **SC-001**: Admin can add a new feed and see it queued within 2 seconds.
- **SC-002**: Admin can edit agency metadata and see the change reflected in the map UI on next page load.
- **SC-003**: Feed list loads in < 500 ms for up to 500 feeds.
- **SC-004**: Unauthenticated requests to `/admin/*` never reach admin data.

---

## Assumptions

- Single admin user — no multi-user auth needed.
- `ADMIN_API_KEY` env var set on Railway (API) and identical value set as `VITE_ADMIN_API_KEY` on Vercel (frontend stores it for comparison at login).
- No Vercel Pro plan required — auth is handled at the API layer, not via Vercel features.
- Admin UI is at `/admin` within the existing `bus-map-web` SPA — no separate deployment.
- Vercel Edge Middleware is NOT used (would require restructuring the Vite project).
