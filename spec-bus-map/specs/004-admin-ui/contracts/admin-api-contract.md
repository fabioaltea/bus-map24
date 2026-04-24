# Admin API Contract

**Feature**: `004-admin-ui` | **Date**: 2026-04-24

All `/api/admin/*` endpoints require:
```
Authorization: Bearer <JWT>
```
Returns `401` on missing/invalid/expired token.

---

## Auth

### `POST /api/admin/auth/login`

No auth header required.

**Request**:
```json
{ "password": "string" }
```

**Response 200**:
```json
{ "token": "eyJ..." }
```

**Response 401**:
```json
{ "type": "/errors/unauthorized", "title": "Invalid password", "status": 401 }
```

---

## Feeds

### `GET /api/admin/feeds`

Returns all feeds with agency summaries and metadata completeness flag.

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "mobilityDbId": "tld-576",
      "provider": "Transport for London",
      "countryCode": "GB",
      "municipality": "London",
      "importStatus": "ready",
      "lastImportedAt": "2026-04-20T02:00:00Z",
      "errorMessage": null,
      "createdAt": "2026-04-01T00:00:00Z",
      "agencyCount": 1,
      "metadataComplete": false,
      "agencies": [
        { "id": "uuid", "name": "TfL", "brandColor": null, "logoUrl": null, "city": "London" }
      ]
    }
  ],
  "total": 1
}
```

---

### `POST /api/admin/feeds`

Add a new feed. Exactly one of `mobilityId` or (`url` + `provider` + `countryCode`) required.

**Request**:
```json
{ "mobilityId": "tld-576" }
```
or:
```json
{ "url": "https://example.com/gtfs.zip", "provider": "My Transit", "countryCode": "IT" }
```

**Response 202**:
```json
{ "feedId": "uuid", "status": "queued" }
```

**Response 409**:
```json
{ "type": "/errors/conflict", "title": "Feed already exists", "status": 409 }
```

**Response 400**: validation error (missing fields, invalid countryCode format).

---

### `PATCH /api/admin/feeds/:id`

Update admin-editable feed fields.

**Request**:
```json
{ "countryCode": "GB", "municipality": "London" }
```

**Response 200**: updated `AdminFeedListItem`

**Response 404**: feed not found.

---

### `POST /api/admin/feeds/:id/refresh`

Force re-import of an existing feed.

**Response 202**:
```json
{ "feedId": "uuid", "status": "queued" }
```

**Response 409**: if `importStatus` is `downloading` or `importing`.

**Response 404**: feed not found.

---

## Agencies

### `PATCH /api/admin/agencies/:id`

Update admin-editable agency metadata.

**Request** (all fields optional):
```json
{
  "brandColor": "E1251B",
  "logoUrl": "https://example.com/logo.png",
  "city": "London"
}
```

**Validation**:
- `brandColor`: 6-char hex string matching `/^[0-9A-Fa-f]{6}$/` or `null`
- `logoUrl`: valid URL or `null`
- `city`: max 128 chars or `null`

**Response 200**:
```json
{ "id": "uuid", "name": "TfL", "brandColor": "E1251B", "logoUrl": null, "city": "London" }
```

**Response 400**: validation error with field-level detail.

**Response 404**: agency not found.
