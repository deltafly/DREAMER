# Changelog

All notable changes to the OneBrainer project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Brain queries failed on every fresh clone.** The three raw statements in
  `brain-query.ts` referenced tables named `facts` and `associations`; the
  migration creates `Fact` and `Association`. Seeding is the first thing the
  engine does, so `POST /api/brain/query`, the MCP `brain_query` tool and the
  benchmark harness all failed with "no such table" on any database built from
  this repo's own migration. Table names now come from `src/lib/sql-tables.ts`,
  and `test/sql-tables.test.ts` checks them against the migration.
- **Registration and sessions failed on every fresh clone.** `users.sessionVersion`
  was added to the schema in 5.2.0 but never to a migration, so the column the
  client selects on every token refresh did not exist. Added in
  `20260808000000_session_version_and_fact_embeddings`, with
  `test/schema-drift.test.ts` to catch the next one.
- **Facts were dated when they were extracted, not when they happened.** The
  Librarian's LLM path stamped `validFrom` and `decidedAt` with the wall clock,
  discarding the ledger timeline it had just read. Imported history collapsed
  into a single instant, and the supersede chain — which reads that ordering
  back — resolved arbitrarily. Both now derive from the source entries.
- **The benchmark harness corrupted its own backdating.** `padEnd(19, '0')` turned
  `2025-01-15 14:30` into `2025-01-15 14:30000`, which is not a parseable date.
  Timestamps now go through `normalizeTimestamp`, and an undateable evidence
  session fails the run instead of being silently accepted.
- **Bare timestamps were read in the server's local zone.** `new Date("2025-01-15 14:30")`
  is local time, so imported history shifted by the host's offset. Parsing is
  now explicitly UTC.
- Added `prisma/migrations/migration_lock.toml`, without which `prisma migrate diff`
  cannot determine the connector.

### Security

- **Removed `mini-services/`.** Two standalone servers shipped in the repo with no
  authentication of their own, bound to every interface, one of them pinning
  every request to workspace 1 and so bypassing the app's tenant checks. The
  authenticated `/api/mcp` route replaces both. The `.zscripts` build and start
  hooks that launched them are gone with them.

### Added

- **Optional semantic seeding.** With `EMBEDDING_MODEL` set, each fact gets a
  vector and queries seed by meaning as well as by shared words — the keyword
  seed alone cannot match a differently-phrased fact, and because seeding
  precedes spreading, the graph never gets the chance to reach anything behind
  it. Both seed sets are merged. Off by default; unset, behaviour is unchanged.
  Any OpenAI-compatible `/embeddings` endpoint serves it, including a local
  Ollama, so the semantic path costs nothing to run. Only the distilled fact
  layer is embedded; the raw ledger is never sent anywhere.
- `GET`/`POST /api/brain/embeddings` — coverage and backfill, for knowledge bases
  that predate the setting or a change of embedding model.
- **`ts` on `POST /api/ledger`.** Optional, validated, defaults to now. Makes it
  possible to import history that keeps its real timeline.
- `seeding` on the brain query response and per question in the benchmark report:
  strategy, keyword and semantic seed counts, and `semanticOnlySeeds` — the
  facts the keyword pass alone would have missed. Replaces the benchmark's
  `expansionEnabled`/`expansionSucceeded` fields, which were wired to a constant
  and reported that a query expansion had run when no such feature existed.
- 86 new test assertions across `time`, `embeddings`, `sql-tables` and
  `schema-drift`, all offline — no database, no network, no API key.

## [5.2.0] - 2025-07-12

### Security (P0 Release Audit)
- **CSP**: Added Content-Security-Policy header with strict directives via proxy.ts
- **Audit Logging**: New centralized audit service (`src/lib/audit.ts`) with 10 event types across all sensitive operations
- **GDPR Erase**: Fixed to delete global Contest records (createdBy=userId) before workspace cascade
- **GDPR Export**: Added 11 missing tables, writes to real files in `db/exports/`
- **RBAC**: Settings, Dreamer, Librarian routes now enforce owner/admin role
- **Password Complexity**: Shared `passwordSchema` requiring uppercase, digit, special char (Hungarian-aware)
- **Session Invalidation**: Added `sessionVersion` to User model; password changes invalidate all JWT sessions
- **Rate Limiting**: Added to profile PATCH (10/min), GDPR erase (3/hr), forgot-password (5/hr)

### Hardening (P1)
- **Request Body Size**: `withHandler()` now rejects payloads > 1MB
- **Contest Auth**: `contest/enter` and `contest/score` POST now require explicit authentication
- **Reset Password Audit**: Tracks `reset_requested` and `reset_completed` events

### Accessibility (P2)
- **Skip Navigation**: Added skip-to-content link for keyboard users
- **ARIA Landmarks**: Verified `<header>`, `<main id="main-content">`, `<footer>` in place
- **Language**: Changed `<html lang="en">` to `<html lang="hu">`

### Added
- 404 page (`not-found.tsx`) with Hungarian text
- MIT LICENSE file
- `src/components/providers.tsx` (extracted client providers from layout)
- Layout metadata: title, description, Open Graph, icons, robots

### Changed
- Layout converted from client component to server component (proper Next.js pattern)
- Metadata exported from server layout for SEO
- robots.txt: set to disallow indexing (internal tool)

## [5.1.0] - 2025-07

### Added
- Dreamer & Librarian scheduler (cron-based, per-workspace settings)
- WorkspaceSettings model with timezone support
- Manual trigger buttons for Dreamer/Librarian
- Human-friendly schedule presets (Hungarian)

## [5.0.0] - 2025-06

### Added
- Multi-tenant architecture with workspace isolation
- 11-tab dashboard: Overview, Briefs, Knowledge, Disputes, Agents, Ledger, Dreamer, Brain, Contest, GDPR, Connectors
- MCP (Model Context Protocol) endpoint with 13 tools
- Knowledge graph with force-directed layout
- Spreading activation neural search
- Contest system with scoring and leaderboard
- GDPR compliance: consent, erasure, export, audit log, retention

### Infrastructure
- Dockerfile (multi-stage, non-root)
- GitHub Actions CI/CD
- Graceful shutdown (SIGTERM/SIGINT)
- SQLite WAL mode
- Structured JSON logging
- Health check endpoint