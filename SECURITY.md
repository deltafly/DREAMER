# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Open a [GitHub security advisory](https://github.com/deltafly/DREAMER/security/advisories/new)
instead. You can expect an initial response within a few days.

## Scope and current state

OneBrainer went through a full security audit in July 2026; the findings and their fixes
are documented in [`CHANGELOG.md`](./CHANGELOG.md) under `[5.2.0]`. Key controls in place:

- Multi-tenant isolation enforced per route (`requireAuth()` → `verifyWorkspaceAccess()`)
- RBAC (owner/admin/member) on privileged routes
- JWT session invalidation via `User.sessionVersion`
- IP- and identity-based rate limiting on auth endpoints
- Agent API keys stored as SHA-256 hashes, shown once at creation
- CSP headers, 1 MB request body cap, Zod validation on all inputs
- Audit logging across 10 sensitive event types

### Known open issue

**Prompt injection in the Librarian extraction path.** The Librarian ingests arbitrary
user-supplied text (L1 ledger entries) and passes it to an LLM for structured extraction.
A crafted entry can influence extraction output. Mitigation is on the roadmap; until then,
treat ingested content as untrusted and do not grant the extraction pipeline privileged
side effects.

### Not in scope

- The demo seed data (`prisma/seed.ts`) and its `demo@onebrainer.ai` account
- The development-mode workspace fallback (`?workspace=1`), which is disabled in production
