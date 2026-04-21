# API Contract: spec-bus-map-api

**Version**: 1.0.0
**Base URL**: `http://localhost:3000/api` (development)
**Content-Type**: `application/json`
**Date**: 2026-04-13

All endpoints return JSON. Errors follow RFC 7807 Problem Details format.

---

## Common Types

```typescript
// Bounding box as query string: "swLat,swLng,neLat,neLng"
// Example: ?bbox=51.4,-0.2,51.6,0.1
type BBoxParam = string;

// ISO 8601 date: YYYY-MM-DD
type DateParam = string;

// GTFS route type
type RouteType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 11 | 12;

interface ErrorResponse {
  type: string;        // URI identifying error type
  title: string;       // Human-readable summary
  status: number;      // HTTP status code
  detail: string;      // Specific detail for this occurrence
  instance?: string;   // URI of the specific request
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}
```

---

## Endpoints

### GET /api/agencies

List transit agencies whose bounding box intersects the given viewport.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bbox` | BBoxParam | Yes | Viewport: `swLat,swLng,neLat,neLng` |
| `zoom` | integer | No | Current zoom level (1–22). Affects result density. |
| `limit` | integer | No | Max results. Default 50, max 200. |
| `offset` | integer | No | Pagination offset. Default 0. |

**Response 200**

```typescript
interface AgenciesResponse extends PaginatedResponse<AgencySummary> {}

interface AgencySummary {
  id: string;            // Internal UUID
  name: string;          // Agency display name
  country_code: string;  // ISO 3166-1 alpha-2
  route_count: number;
  stop_count: number;
  bounding_box: GeoJSON.Polygon | null;
  feed_id: string;
}
```

**Response 400**: Invalid `bbox` format or values out of range.

---

### GET /api/agencies/:id

Get full details for one agency.

**Path Parameters**: `id` — agency UUID

**Response 200**

```typescript
interface AgencyDetail extends AgencySummary {
  url: string | null;
  timezone: string;   // IANA timezone
  lang: string | null;
  phone: string | null;
}
```

**Response 404**: Agency not found.

---

### GET /api/agencies/:id/routes

List all routes for a given agency.

**Path Parameters**: `id` — agency UUID

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `route_type` | RouteType | No | Filter by GTFS route type. Repeatable. |
| `limit` | integer | No | Default 100, max 500. |
| `offset` | integer | No | Default 0. |

**Response 200**

```typescript
interface RoutesResponse extends PaginatedResponse<RouteSummary> {}

interface RouteSummary {
  id: string;
  route_id: string;       // GTFS route_id
  short_name: string | null;
  long_name: string | null;
  route_type: RouteType;
  color: string;          // 6-char hex without #, e.g. "FF6600"
  text_color: string;
  agency_id: string;
}
```

---

### GET /api/routes/:id

Get full route detail including shape geometry.

**Path Parameters**: `id` — route UUID

**Response 200**

```typescript
interface RouteDetail extends RouteSummary {
  description: string | null;
  shape_geom: GeoJSON.MultiLineString | null;  // Full route path
  stop_count: number;
  bbox: GeoJSON.Polygon;   // Bounding box of route extent
}
```

---

### GET /api/stops

List stops in viewport, optionally filtered by route.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bbox` | BBoxParam | Yes | `swLat,swLng,neLat,neLng` |
| `route_id` | string | No | Filter stops to those serving this route UUID |
| `agency_id` | string | No | Filter stops to those served by this agency UUID |
| `limit` | integer | No | Default 500, max 2000 |
| `offset` | integer | No | Default 0 |

**Response 200**

```typescript
interface StopsResponse extends PaginatedResponse<StopSummary> {}

interface StopSummary {
  id: string;
  stop_id: string;      // GTFS stop_id
  name: string;
  code: string | null;
  location: GeoJSON.Point;
  location_type: 0 | 1 | 2 | 3;
  wheelchair_boarding: 0 | 1 | 2;
  route_ids: string[];  // UUIDs of routes serving this stop
}
```

---

### GET /api/stops/:id

Get full stop detail.

**Path Parameters**: `id` — stop UUID

**Response 200**

```typescript
interface StopDetail extends StopSummary {
  description: string | null;
  zone_id: string | null;
  url: string | null;
  parent_station_id: string | null;
  serving_routes: RouteSummary[];   // Full route summaries
  feed_id: string;
}
```

---

### GET /api/stops/:id/departures

Get scheduled departures at a stop for a given date.

**Path Parameters**: `id` — stop UUID

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `date` | DateParam | No | ISO 8601 date. Defaults to today (client timezone implied). |
| `route_id` | string | No | Filter to a specific route UUID |
| `limit` | integer | No | Default 50, max 200 |

**Response 200**

```typescript
interface DeparturesResponse {
  stop_id: string;
  date: string;              // ISO 8601 date of requested day
  departures: Departure[];
}

interface Departure {
  trip_id: string;           // Internal UUID
  route: RouteSummary;
  headsign: string | null;   // Destination display
  departure_time: string;    // HH:MM:SS (may exceed 24h for overnight trips)
  is_approximate: boolean;   // true when timepoint === 0
  wheelchair_accessible: 0 | 1 | 2;
}
```

**Response 404**: Stop not found.
**Response 400**: Invalid date format.

---

### GET /api/feeds

List all feed catalog entries (admin/status endpoint).

**Query Parameters**: `status` (optional) — filter by import_status

**Response 200**

```typescript
interface FeedsResponse extends PaginatedResponse<FeedSummary> {}

interface FeedSummary {
  id: string;
  mobility_db_id: string;
  provider: string;
  country_code: string;
  import_status: 'pending' | 'downloading' | 'importing' | 'ready' | 'error';
  last_imported_at: string | null;   // ISO 8601 datetime
  error_message: string | null;
}
```

---

## Error Codes

| HTTP Status | Type URI | Meaning |
|-------------|----------|---------|
| 400 | `/errors/invalid-bbox` | bbox parameter malformed or out of range |
| 400 | `/errors/invalid-date` | date parameter not valid ISO 8601 |
| 400 | `/errors/invalid-pagination` | limit or offset out of range |
| 404 | `/errors/not-found` | Resource not found |
| 429 | `/errors/rate-limited` | Too many requests |
| 500 | `/errors/internal` | Unexpected server error |
| 503 | `/errors/feed-unavailable` | Feed data not yet imported |

---

## Rate Limiting

- 100 requests per minute per IP on all endpoints.
- Response header: `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- Tile serving (PMTiles) is not rate-limited — served as static files.

---

## CORS

All origins allowed in development. Production restricts to the `spec-bus-map-web`
deployment domain.

---

## Versioning

This is v1. Breaking changes will introduce a `/api/v2/` prefix. The `/api/` prefix
maps to the current stable version.
