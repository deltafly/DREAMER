# Changelog

All notable changes to the OneBrainer project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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