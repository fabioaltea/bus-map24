# Implementation Plan: Local Dev Infrastructure — No Docker

**Branch**: `001-gtfs-bus-map` | **Date**: 2026-04-15 | **Spec**: specs/001-gtfs-bus-map/spec.md  
**Input**: Amendment — replace Docker-based local setup with native macOS Homebrew services

**Note**: Existing feature plan for the GTFS Bus Map is in `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`. This amendment targets developer environment setup only; no production code changes.

---

## Summary

Replace Docker Desktop as the local dependency for PostgreSQL 16 + PostGIS 3 and Redis 7
with native macOS Homebrew services. Same ports, same credentials, `.env` unchanged.
`quickstart.md` updated to document the Homebrew path as the primary native option.

---

## Technical Context

**Language/Version**: Shell / Homebrew formulae  
**Primary Dependencies**: `postgresql@16`, `postgis`, `redis`, `tippecanoe` (all via Homebrew)  
**Storage**: PostgreSQL 16 + PostGIS 3 (local service, port 5432), Redis 7 (local service, port 6379)  
**Testing**: Unchanged — `pnpm test` hits local services on identical ports/credentials  
**Target Platform**: macOS (Apple Silicon and Intel, Homebrew ≥ 4.x)  
**Project Type**: Developer tooling / infrastructure documentation  
**Performance Goals**: Same as existing spec (local dev only; no production perf impact)  
**Constraints**:
- `DATABASE_URL=postgresql://busmap:busmap@localhost:5432/busmapdb` must remain valid
- `REDIS_URL=redis://localhost:6379` must remain valid
- PostGIS 3 extension must be createable in `busmapdb`
- tippecanoe 2.x must be in PATH

**Scale/Scope**: Single developer machine; no CI change required

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Code Quality
✅ No production code changes. Documentation-only amendment.

### II. Testing Standards
✅ No change to test infrastructure. Services run on identical ports/credentials; `pnpm test` continues to pass.

### III. User Experience Consistency
N/A — no UI impact.

### IV. Performance Requirements
✅ No regression risk. Same service versions (PostgreSQL 16, Redis 7) as the Docker images.

**Gate status**: PASS — developer tooling amendment; all four principles unaffected.

---

## Project Structure

### Documentation changes (this amendment)

```text
specs/001-gtfs-bus-map/
├── plan.md           ← this file
├── research.md       ← Section 10 added: Native macOS Setup
└── quickstart.md     ← "Docker" section replaced with native Homebrew section
```

### Source code changes

None. The Fastify server, Drizzle schema, BullMQ workers, and frontend are unchanged.

---

## Complexity Tracking

No constitution violations to justify.
