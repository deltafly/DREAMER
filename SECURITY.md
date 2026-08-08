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
- Agent API keys stored as SHA-256 hashes, generated randomly and shown once at
  creation — including by `prisma/seed.ts`, so no deployment ships a shared key
- MCP tools that start an LLM pipeline (`run_dreamer`, `run_librarian`) are role-gated
  in `src/lib/mcp-permissions.ts`; a read-only `worker` key cannot reach them
- CSP headers, 1 MB request body cap, Zod validation on all inputs
- Audit logging across 10 sensitive event types

### Prompt injection — mitigated, not eliminated

L1 ledger content is fully attacker-controlled: anyone who can reach `POST /api/ledger`
or the MCP `ingest` tool supplies text that the Librarian hands to an LLM. Extracted
facts are attacker-influenced in turn and get re-sent to the model by the
auto-associator and the Dreamer, so one poisoned entry reaches three model calls.

`src/lib/llm-safety.ts` applies two independent layers to every such call:

1. **Unforgeable fencing.** Untrusted text is wrapped between markers carrying a
   128-bit random nonce generated per call. Static delimiters are useless here — the
   attacker can simply type them — so the nonce is what makes the boundary real. Any
   marker-shaped text inside the payload is neutralised, and trusted metadata (entry
   ids, topics, pair indices) is kept outside the fence so it cannot be forged from
   within the content.
2. **Schema containment.** Every response is validated against a strict Zod schema
   before a single row is written: closed enums, per-field length caps, and array caps
   (50 facts, 25 decisions, 10 associations, 3 sparks per pair). A reply that misses the
   contract is discarded whole — the Librarian falls back to heuristic extraction. Fact
   ids the model did not receive are rejected, which also makes cross-workspace
   associations impossible.

Layer 2 is the one that matters: even a fully compromised model cannot write outside
the schema. Coverage is in `test/llm-safety.test.ts` (20 checks, enforced in CI).

**What remains.** This bounds the blast radius; it does not eliminate the risk. An
attacker can still influence *which* well-formed facts get extracted — a plausible but
false fact can be pushed into the knowledge base, and briefs assembled from it are read
by downstream agents. Review disputes and treat extracted knowledge as attributable to
its source (`Fact.source` carries the originating ledger ids), not as ground truth.

### Not in scope

- The demo seed data (`prisma/seed.ts`) and its `demo@onebrainer.ai` account
- The development-mode workspace fallback (`?workspace=1`), which is disabled in production
