# tld-576-small — CI Fixture Feed

Place a trimmed GTFS zip here named `tld-576-small.zip` (≤ 2 MB).

## Required contents

The zip must contain the standard GTFS files:

- `agency.txt` — at least 1 agency
- `routes.txt` — ≥ 5 routes across ≥ 2 agencies
- `stops.txt` — ≥ 50 stops
- `trips.txt` — ≥ 200 trips (mix of pattern-dedupable + unique)
- `stop_times.txt` — ≥ 2 000 rows; include at least one overnight trip (`arrival_time ≥ 24:00:00`)
- `shapes.txt` — ≥ 20 shapes; at least 2 geometrically identical (for dedup test)
- `calendar.txt` or `calendar_dates.txt` — at least 2 service windows

## How to generate

```bash
# Trim the full tld-576 feed with the Python gtfs-kit or analogous:
python - <<'EOF'
import gtfs_kit as gk
feed = gk.read_feed("tld-576-full.zip", dist_units="km")
feed = feed.restrict_to_routes(feed.routes["route_id"].head(5).tolist())
feed.write("tests/fixtures/feeds/tld-576-small/tld-576-small.zip")
EOF
```

## Expected baseline

Before running compact-pipeline tests, record the legacy footprint:

```bash
cd bus-map-api
pnpm tsx src/scripts/bench-footprint.ts --mobility-id tld-576 \
  --output tests/fixtures/baseline-tld-576-small.json
```

Commit `baseline-tld-576-small.json` alongside the zip.
