# Data Model: Admin UI (004)

**Feature**: `004-admin-ui` | **Date**: 2026-04-24

No new database tables. All mutations are on existing tables.

---

## Modified Entities

### `feed_catalog_entries` (existing)

Admin-writable fields (via `PATCH /api/admin/feeds/:id`):

| Column | Type | Notes |
|---|---|---|
| `country_code` | `char(2)` | Editable if MobilityDB returned wrong value |
| `municipality` | `varchar(128)` | Human-readable city/region of the feed |

Read-only for admin (managed by pipeline):

| Column | Notes |
|---|---|
| `import_status` | `pending \| queued \| downloading \| importing \| ready \| failed` |
| `last_imported_at` | Set by worker on successful import |
| `error_message` | Set by worker on failure |
| `hash_sha256` | From MobilityDB |
| `last_imported_sha256` | Hash of last imported zip |

### `agencies` (existing)

Admin-writable fields (via `PATCH /api/admin/agencies/:id`):

| Column | Type | Notes |
|---|---|---|
| `brand_color` | `varchar(6)` | Hex without `#`, e.g. `E1251B` |
| `logo_url` | `text` | Direct image URL; overrides Clearbit fallback |
| `city` | `varchar(128)` | City name for display |

---

## New API Entities (not persisted)

### `AdminFeedListItem` (API response)

```ts
interface AdminFeedListItem {
  id: string
  mobilityDbId: string | null
  provider: string
  countryCode: string
  municipality: string | null
  importStatus: string
  lastImportedAt: string | null
  errorMessage: string | null
  createdAt: string
  agencyCount: number
  metadataComplete: boolean   // true if all agencies have brandColor + city
  agencies: AdminAgencySummary[]
}

interface AdminAgencySummary {
  id: string
  name: string
  brandColor: string | null
  logoUrl: string | null
  city: string | null
}
```

### `AdminSession` (frontend only, localStorage)

```ts
interface AdminSession {
  token: string   // JWT
  expiresAt: number  // Unix timestamp ms
}
```

---

## Import Status State Machine

```
pending → queued → downloading → importing → ready
                                           ↘ failed
```

`POST /api/admin/feeds` → sets `queued`
`POST /api/admin/feeds/:id/refresh` → forces back to `queued` (even from `ready` or `failed`)

---

## New Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_PASSWORD` | ✓ | — | Plain-text password for admin login |
| `JWT_SECRET` | ✓ | — | Min 32-char secret for JWT HMAC signing |
