# Internal Storage Contract

**Feature**: `002-compact-gtfs-storage` | **Phase**: 1 | **Date**: 2026-04-21

This document is the **internal** contract between the importer and the
read-side services. The public API contracts under
`../../001-gtfs-bus-map/contracts/` remain authoritative for everything
exposed to `bus-map-web`; nothing here escapes the backend.

---

## Invariants guaranteed by the importer

1. **ID stability.** For a given `feed_id`, the mapping
   `external_id → internal_id` is stable across reimports as long as the
   `external_id` still appears in the new feed. Disappearing externals
   keep their mapping row (soft-tombstoned) so historical queries do not
   break.
2. **Pattern canonicalisation.** Within a single feed, two trips with
   identical `(stop_internal_id, offset_arrival_sec, offset_departure_sec)`
   tuple stream MUST resolve to the same `pattern_id`.
3. **Shape canonicalisation.** Within a single feed, two shapes that
   produce the same `polyline6` (after DP simplification with the same
   epsilon) MUST resolve to the same `shape_internal_id`.
4. **Frequency-or-trip, never both.** A given `trip_internal_id` has
   either a materialised absolute `start_time_sec` (plain trip) or a
   row in `frequencies_compact`, never both.
5. **Overnight time range.** `start_time_sec` and all `offset_*` values
   are in `[0, 172 800]`. Readers that format back to `HH:MM:SS` MUST
   preserve the full two-day range.

## Contract functions (library-level)

Located in `bus-map-api/src/lib/`. Pure functions; no DB access.

### `polyline-codec.ts`

```ts
export function encodePolyline6(points: Array<[number, number]>): string
export function decodePolyline6(encoded: string): Array<[number, number]>
```

- Round-trip MUST be lossless within the declared epsilon: decoding a
  polyline6 that was encoded with precision 6 MUST return the same
  coordinates to within 1e-6 degrees.
- `encodePolyline6([])` returns `""`.
- `decodePolyline6("")` returns `[]`.

### `id-mapper.ts`

```ts
export interface IdMapper {
  get(kind: Kind, external: string): number | undefined
  getOrCreate(kind: Kind, external: string): Promise<number>
  reverse(kind: Kind, internal: number): string | undefined
}
```

- `getOrCreate` is monotonic per feed: two calls with the same `(kind,
  external)` MUST return the same integer.
- `reverse` MUST return the original string used at `getOrCreate` time,
  even after a reimport.

### `pattern-builder.ts`

```ts
export function buildPattern(stopTimes: StopTimeRow[]): Pattern
export function hashPattern(pattern: Pattern): bigint
```

- Offsets are computed as `stop_time.arrival_time - trip.first_arrival_time`.
- `hashPattern` MUST be stable across platforms and pipeline versions
  (xxhash64 with a fixed seed defined as
  `PATTERN_HASH_SEED = 0xBU51_M4P_24n`).

### `frequency-detector.ts`

```ts
export function collapseToFrequencies(trips: Trip[]): { plain: Trip[]; freq: Frequency[] }
```

- Thresholds: minimum run length 4, headway tolerance 0 s (exact equality).
- Trips whose consecutive gaps are not uniform fall through to `plain`.

### `shape-dedup.ts`

```ts
export function simplifyAndHash(points: LatLon[], epsMeters: number): {
  polyline6: string
  hash: bigint
  bbox: [minLat: number, minLon: number, maxLat: number, maxLon: number]
}
```

- Douglas–Peucker applied in mercator metres, not raw degrees.
- Hash seed and epsilon are parameters so historical shapes can be
  re-verified.

---

## Database-level contract

- Every write path MUST run inside a single transaction per feed.
- The importer MUST set `statement_timeout = 0` inside its transaction
  (bulk inserts can legitimately exceed default timeouts).
- All FKs MUST be declared with `ON DELETE CASCADE` scoped to
  `feed_catalog_entries.id` so that "delete feed" is a single row
  operation.

---

## Reader contract

Read-side services under `bus-map-api/src/services/` MUST:

1. Never return `internal_id` values to HTTP clients. Always resolve to
   the external string via the appropriate `feed_<kind>` table.
2. Reconstruct per-trip stop times by adding `trip.start_time_sec` to
   each pattern offset; frequency-based trips are expanded on the fly
   (start, start+headway, …, < end) — the expansion is O(run length)
   and cacheable per `(trip_internal_id, date)`.
3. Format times back to `HH:MM:SS` (GTFS convention, overnight allowed)
   only at the serialisation boundary — never store the string form.
4. Preserve the JSON shape, field order, and null-vs-missing semantics
   described in `../../001-gtfs-bus-map/contracts/*` exactly. The
   contract-replay test suite is the enforcement mechanism.
