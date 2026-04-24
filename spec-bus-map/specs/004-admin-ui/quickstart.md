# Quickstart: Admin UI

**Feature**: `004-admin-ui` | **Date**: 2026-04-24

---

## Local development

```bash
# 1. Add new env vars to bus-map-api/.env
ADMIN_PASSWORD=localadmin
JWT_SECRET=dev-secret-min-32-chars-long-1234

# 2. Start API
cd bus-map-api && pnpm dev

# 3. Start frontend
cd bus-map-web && pnpm dev

# 4. Open admin
open http://localhost:5173/admin
# → redirected to /admin/login
# → enter password: localadmin
# → redirected to /admin (feed list)
```

---

## Production (Railway + Vercel)

**Railway API service** — add variables:
```
ADMIN_PASSWORD=<strong-password>
JWT_SECRET=<32+ char random string>
```

**Vercel** — no new variables needed (auth is handled by the backend).

---

## Verify

```bash
API=https://<your-api>.railway.app

# 1. Login
TOKEN=$(curl -s -X POST $API/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"<your-password>"}' | jq -r '.token')

# 2. List feeds
curl -H "Authorization: Bearer $TOKEN" $API/api/admin/feeds | jq '.data[].provider'

# 3. Add feed
curl -X POST $API/api/admin/feeds \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mobilityId":"tld-576"}'

# 4. Edit agency metadata
AGENCY_ID=$(curl -H "Authorization: Bearer $TOKEN" $API/api/admin/feeds | jq -r '.data[0].agencies[0].id')
curl -X PATCH $API/api/admin/agencies/$AGENCY_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"brandColor":"E1251B","city":"London"}'

# 5. Trigger refresh
FEED_ID=$(curl -H "Authorization: Bearer $TOKEN" $API/api/admin/feeds | jq -r '.data[0].id')
curl -X POST $API/api/admin/feeds/$FEED_ID/refresh \
  -H "Authorization: Bearer $TOKEN"
```

---

## Merge gate checklist

- [ ] `POST /api/admin/auth/login` returns JWT for correct password, 401 for wrong
- [ ] All `/api/admin/*` routes return 401 without token
- [ ] Feed list at `/admin` shows all feeds with status badges
- [ ] Incomplete metadata badge shown for feeds with missing brandColor/city
- [ ] Add feed modal queues job; feed appears in list
- [ ] Edit metadata form saves and clears incomplete badge
- [ ] Refresh button re-queues a ready/failed feed
- [ ] `/admin` redirects unauthenticated users to `/admin/login`
