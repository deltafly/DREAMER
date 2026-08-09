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

### Fixed (deployment)

- **The production database was never migrated.** The Dockerfile ran
  `prisma migrate deploy || true` in the builder stage, where the database does not
  exist — `db/` is excluded by `.dockerignore` and the real file is volume-mounted at
  runtime. So it ran against nothing, failed, was swallowed by `|| true`, and a
  container would start on a schema older than its code and fail later at runtime, on
  whichever request first touched a missing column. Migrations moved to
  `docker-entrypoint.sh`, with no `|| true`: a migration that cannot be applied stops
  the container instead of starting a server against the wrong schema.
- `prisma migrate deploy` removed from the `build` script — a build has no business
  writing to a database. Verified that `next build` completes against an empty
  database with no migrations applied. Added `bun run migrate:start` for non-Docker
  deployments.
- **Deleting a fact with associations failed** with a foreign key error;
  `Association → Fact` was on the default `RESTRICT`. Now `CASCADE`: an association
  whose endpoint is gone is a dangling edge, not a weaker one. Nothing in the codebase
  deletes single facts today, so this was a trap for whoever added it rather than a
  live failure — deleting a whole workspace was always fine, because that cascade
  reaches both tables.
- **Password reset tokens moved out of process memory into the database**, stored as
  SHA-256 hashes. In a Map they failed silently in three ordinary situations: a
  restart or deploy invalidated every link already in someone's inbox, a second
  instance never saw the first one's tokens, and anything reading process memory got
  live credentials in plaintext. Requesting a new link now also invalidates the
  previous one.
- Documented, in `docs/DEPLOYMENT.md` and in the code, that the app runs as a **single
  instance** and precisely what breaks quietly if it does not — per-instance rate
  limit counters and per-instance task locks, the latter letting two Librarian runs
  start on the same workspace.

### Security

- **The development shortcuts failed open.** They were gated on
  `NODE_ENV !== 'production'`, so an unset variable, an empty string, `Production`
  with a capital P, or a service manager that did not pass the environment through
  would silently unlock all four of them at once: unauthenticated access to the
  default workspace, MCP without an agent key, the password reset token returned in
  the API response, and a NextAuth secret falling back to a constant published in
  this repository — which makes every session forgeable by anyone. No error, no log
  line; the service would look like it was working.
  The gate is now a positive test in `src/lib/runtime-mode.ts`: development has to
  say so exactly, and everything else is locked. A missing `NEXTAUTH_SECRET` now
  stops startup unless development is declared, rather than reaching for the
  published fallback. The first request that does take a shortcut logs a warning
  saying the service is unauthenticated.
  Next's standalone `server.js` sets `NODE_ENV=production` itself, so the shipped
  path was never open — which is the point: the security posture rested on a default
  someone else chose, and nothing here asserted it.
- **Agent keys are no longer a constant in the source.** `seedWorkspace()` inserted
  five literal `keyHash` values committed to this repository, and it runs on every
  registration and every workspace creation — so every workspace of every deployment
  shared the same set of credentials, one of them `role: owner`, with no way to
  replace them. Keys are now generated per workspace, returned once in the
  registration and workspace-creation responses, and stored only as hashes.
  `test/agent-keys.test.ts` scans `src/` and `prisma/` so a literal key or key hash
  fails CI.
- **Added `POST /api/agents/{id}/rotate`.** There was no way to replace a leaked
  agent key short of editing the database by hand. Owner/admin only, scoped to the
  agent's own workspace, rate limited, audited — and the key never reaches the log.
- **`GET /api/agents` no longer returns `keyHash`.** It is the stored form of a
  credential and an offline target; listing agents is no reason to hand it to every
  workspace member. Nothing in the UI ever read it.
- Key hashing moved to `src/lib/agent-keys.ts`, so the form the MCP route verifies
  and the form the seeder stores cannot drift apart.
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
- **A database-backed test suite** (`test/db/`, `bun run test:db`), wired into CI.
  It applies the migrations to a temporary file the way a fresh clone does —
  deliberately not `prisma db push`, which would build the shape the client expects
  and so could never reveal the mismatch that broke every clone. Covers the brain
  query engine end to end (including spreading activation, Hebbian write-back and
  tenant isolation), agent key issuing, verification and rotation, reset token
  lifecycle, and the Librarian's heuristic ingestion path with no LLM configured.
  Verified that reverting the table-name fix makes it fail with the original
  runtime error.

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