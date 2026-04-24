# Railway PostgreSQL + PostGIS Setup

Railway's managed Postgres addon does not include PostGIS. Use a custom Docker service instead.

## Steps

1. **Create service**: Railway dashboard → project → **New Service** → **Docker Image**
2. **Image**: `postgis/postgis:17-3.4`
3. **Set environment variables** on the service:
   ```
   POSTGRES_DB=busmapdb
   POSTGRES_USER=busmap
   POSTGRES_PASSWORD=<generate strong password>
   ```
4. **Add volume**: Volumes tab → Add → mount path `/var/lib/postgresql/data`
5. **Copy internal hostname**: Settings tab → copy the internal URL, e.g. `postgres.railway.internal:5432`
6. **Set `DATABASE_URL`** on the API and worker services:
   ```
   DATABASE_URL=postgresql://busmap:<password>@postgres.railway.internal:5432/busmapdb
   ```

## Verify

```bash
psql $DATABASE_URL -c "SELECT PostGIS_Version()"
```

Should return a version string like `3.4 USE_GEOS=1 ...`.
