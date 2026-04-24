# Feature Spec: Production Deployment

**ID**: `003-deployment`  
**Status**: Draft  
**Date**: 2026-04-24  

---

## Overview

Deploy the BusMap24 application to production:
- **Frontend** (`bus-map-web`) → Vercel
- **API** (`bus-map-api`) → Railway web service
- **BullMQ Workers** → Railway background worker service
- **PostgreSQL + PostGIS** → Railway custom Docker service (`postgis/postgis:17-3.4`)
- **Redis** → Railway Redis addon

---

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-001 | Frontend served from Vercel with `VITE_API_URL` pointing to Railway API |
| FR-002 | API accessible at a stable Railway public URL |
| FR-003 | BullMQ workers run as a separate Railway service sharing DB + Redis |
| FR-004 | PostgreSQL with PostGIS 3 available as a Railway service |
| FR-005 | DB migrations run automatically on API deploy |
| FR-006 | CORS restricted to Vercel production domain |
| FR-007 | PMTiles served from Railway persistent volume via `/tiles/` prefix |
| FR-008 | All secrets injected via environment variables (no hardcoded values) |
| FR-009 | Health check endpoint `GET /healthz` returns 200 |

---

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | `https://<vercel-domain>` loads the map and agencies appear |
| SC-002 | `GET <railway-api>/api/agencies?bbox=...` returns data in < 500 ms |
| SC-003 | Worker service processes a feed-download job end-to-end in production |
| SC-004 | Re-deploy triggers migration with no downtime |
| SC-005 | No `internal_id` or localhost references in any API response |

---

## Out of Scope

- Custom domain / SSL (handled by Vercel/Railway)
- CI/CD pipeline (GitHub Actions) — future feature
- Cloudflare R2 for PMTiles — future feature
- Multi-region deployment
