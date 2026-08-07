import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const daysAgo = (d: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString().replace('T', ' ').slice(0, 19);
};
const daysFromNow = (d: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().replace('T', ' ').slice(0, 19);
};

/** v2 structured digest JSON as per the log() contract */
const structuredDigest = (data: {
  happened?: string[];
  decided?: { decision: string; rationale: string }[];
  open?: string[];
  fact_candidates?: { entity: string; attribute: string; statement: string }[];
  free?: string;
}) => JSON.stringify(data);

async function main() {
  // === WORKSPACE + USER ===
  const user = await db.user.create({
    data: { email: 'demo@onebrainer.ai', name: 'Demo User', passwordHash: 'sha256:demo', createdAt: daysAgo(30) },
  });
  await db.workspace.create({
    data: { name: 'Demo Brain', slug: 'demo-brain', plan: 'pro', ownerId: user.id, createdAt: daysAgo(30) },
  });

  // === WORKSPACE SETTINGS (scheduler) ===
  await db.workspaceSettings.create({
    data: {
      workspaceId: 1,
      dreamerEnabled: false,
      dreamerSchedule: '0 3 * * *',
      librarianEnabled: false,
      librarianSchedule: '0 */4 * * *',
      timezone: 'Europe/Budapest',
      createdAt: now(),
      updatedAt: now(),
    },
  });

  // === AGENTS ===
  await db.agent.createMany({
    data: [
      { agentId: 'claude-web', keyHash: 'sha256:abc123', role: 'owner', workspaceId: 1 },
      { agentId: 'claude-code', keyHash: 'sha256:def456', role: 'worker', workspaceId: 1 },
      { agentId: 'orchestrator', keyHash: 'sha256:ghi789', role: 'orchestrator', workspaceId: 1 },
      { agentId: 'glm-worker-1', keyHash: 'sha256:jkl012', role: 'worker', workspaceId: 1 },
      { agentId: 'librarian', keyHash: 'sha256:mno345', role: 'librarian', workspaceId: 1 },
    ]
  });

  // === PREFERENCES ===
  await db.preference.createMany({
    data: [
      { scope: 'global', statement: 'Always write code in TypeScript unless explicitly asked otherwise.', active: true, workspaceId: 1 },
      { scope: 'global', statement: 'Prefer functional composition over class inheritance.', active: true, workspaceId: 1 },
      { scope: 'global', statement: 'All API responses must include explicit error types, not just HTTP status codes.', active: true, workspaceId: 1 },
      { scope: 'mcos-engine', statement: 'Use Prisma ORM for all database operations — no raw SQL in application code.', active: true, workspaceId: 1 },
      { scope: 'mcos-engine', statement: 'Every new endpoint must have input validation via Zod schemas.', active: true, workspaceId: 1 },
      { scope: 'onebrainer', statement: 'Briefs must stay under 1500 tokens per topic.', active: true, workspaceId: 1 },
      { scope: 'onebrainer', statement: 'The Librarian never deletes — only supersedes, stale-flags, or archives.', active: true, workspaceId: 1 },
    ]
  });

  // === L1: LEDGER ===
  await db.ledger.createMany({
    data: [
      // Cold-start seed entries (kind='seed')
      { ts: daysAgo(20), agentId: 'claude-web', topic: 'mcos-engine', kind: 'seed', content: structuredDigest({
        happened: ['Completed the Barion payment gateway integration.', 'Webhook handler processes 3 event types: payment.success, payment.failed, refund.processed.', 'All webhook payloads validated with HMAC-SHA256.', 'Added retry logic with exponential backoff (3 attempts, 5s/15s/45s).'],
        decided: [{ decision: 'Use Barion as payment provider', rationale: 'Hungarian market leader, good API docs, HMAC webhook security.' }],
        fact_candidates: [
          { entity: 'barion-integration', attribute: 'webhook-events', statement: 'Barion webhook handler processes three event types: payment.success, payment.failed, and refund.processed.' },
          { entity: 'barion-integration', attribute: 'payload-validation', statement: 'All Barion webhook payloads are validated with HMAC-SHA256 before processing.' },
        ],
        free: 'Bootstrap-ingest from 18-chapter architecture brief.'
      }), processed: true, workspaceId: 1 },

      { ts: daysAgo(20), agentId: 'claude-web', topic: 'onebrainer', kind: 'seed', content: structuredDigest({
        happened: ['Designed the three-layer memory architecture: L1 (raw ledger) → L2 (canonical curated) → L3 (assembled briefs).', 'Key design: only the Librarian writes to L2, never sessions directly.'],
        decided: [
          { decision: 'Three-layer memory architecture (L1→L2→L3)', rationale: 'Quality is determined at write-time, not read-time. Only the Librarian writes to L2.' },
          { decision: 'No vector search in v1', rationale: 'FTS5 + brief-based retrieval should suffice for the first 60-90 days.' },
        ],
        fact_candidates: [
          { entity: 'architecture', attribute: 'layers', statement: 'OneBrainer uses a three-layer memory architecture: L1 (raw ledger), L2 (canonical curated), L3 (assembled briefs).' },
          { entity: 'librarian', attribute: 'write-access', statement: 'Only the Librarian process writes to the L2 canonical layer — sessions never write directly.' },
        ],
        free: 'Cold-start bootstrap from architecture brief.'
      }), processed: true, workspaceId: 1 },

      { ts: daysAgo(20), agentId: 'claude-web', topic: 'personal', kind: 'seed', content: structuredDigest({
        happened: ['Initial personal knowledge base setup.'],
        free: 'Bootstrap from personal notes and preferences.'
      }), processed: true, workspaceId: 1 },

      // Regular session digests (structured format per v2)
      { ts: daysAgo(12), agentId: 'claude-code', topic: 'mcos-engine', kind: 'digest', content: structuredDigest({
        happened: ['Decided to use SQLite for v1 of MCOS Engine instead of PostgreSQL.'],
        decided: [{ decision: 'Use SQLite for v1 instead of PostgreSQL', rationale: 'Single-tenant, no horizontal scaling needed in v1, zero ops overhead. Migration path to PostgreSQL documented in ADR-007.' }],
        fact_candidates: [
          { entity: 'database', attribute: 'engine', statement: 'MCOS Engine v1 uses SQLite as its primary database.' },
        ],
        free: ''
      }), processed: true, workspaceId: 1 },

      { ts: daysAgo(10), agentId: 'orchestrator', topic: 'mcos-engine', kind: 'digest', content: structuredDigest({
        happened: ['Sprint 4 completed.', 'Delivered: user auth flow, 3 public API endpoints, admin dashboard skeleton.', 'Remaining from sprint: rate limiter middleware, API key rotation UI.'],
        decided: [],
        open: ['Rate limiter middleware implementation.', 'API key rotation UI design.'],
        free: 'No blockers.'
      }), processed: true, workspaceId: 1 },

      { ts: daysAgo(8), agentId: 'glm-worker-1', topic: 'mcos-engine', kind: 'digest', content: structuredDigest({
        happened: ['Implemented rate limiter using sliding window algorithm.', 'Configured: 100 req/min for free tier, 1000 req/min for pro.', 'Redis-backed counter with 1-minute TTL.', 'Unit tests pass (14/14).'],
        decided: [{ decision: 'Implement rate limiter with sliding window algorithm', rationale: 'More accurate than fixed window, less complex than token bucket. Redis provides atomic counters with TTL.' }],
        fact_candidates: [
          { entity: 'rate-limiter', attribute: 'algorithm', statement: 'Rate limiting uses a sliding window algorithm with Redis-backed counters.' },
          { entity: 'rate-limiter', attribute: 'free-tier-limit', statement: 'Free tier rate limit is 100 requests per minute.' },
          { entity: 'rate-limiter', attribute: 'pro-tier-limit', statement: 'Pro tier rate limit is 1000 requests per minute.' },
        ],
        free: ''
      }), processed: true, workspaceId: 1 },

      { ts: daysAgo(6), agentId: 'claude-code', topic: 'onebrainer', kind: 'digest', content: structuredDigest({
        happened: ['Librarian v1 pipeline implemented.', 'Pipeline: ingest unprocessed ledger rows → extract fact/decision/state candidates → detect key-collisions → flag disputes → rebuild dirty briefs.', 'Tested with 3 topics, all briefs under 1200 tokens.'],
        decided: [],
        fact_candidates: [
          { entity: 'librarian', attribute: 'engine', statement: 'The Librarian runs on GLM 5.2 with a flat plan execution model for zero marginal cost.' },
          { entity: 'dashboard', attribute: 'access', statement: 'The MARKETINGOS dashboard has read-only access to OneBrainer data.' },
        ],
        free: ''
      }), processed: true, workspaceId: 1 },

      { ts: daysAgo(5), agentId: 'claude-web', topic: 'onebrainer', kind: 'digest', content: structuredDigest({
        happened: ['Spec v2 designed: delta-brief, structured log(), cold-start seed, Dreamer.'],
        decided: [{ decision: 'No vector search in v1', rationale: 'FTS5 + brief-based retrieval should suffice for 60-90 days. Embedding infrastructure has non-trivial cost and complexity.' }],
        fact_candidates: [
          { entity: 'search', attribute: 'v1-strategy', statement: 'OneBrainer v1 uses FTS5 full-text search instead of vector embeddings.' },
          { entity: 'brief', attribute: 'token-limit', statement: 'Each topic brief must stay under 1500 tokens.' },
        ],
        free: ''
      }), processed: true, workspaceId: 1 },

      { ts: daysAgo(4), agentId: 'orchestrator', topic: 'onebrainer', kind: 'digest', content: structuredDigest({
        happened: ['Librarian v1 pipeline implemented: ingest → extract → collision detect → dispute flag → brief rebuild.', 'Brief-rebuild now includes delta format: SZIKRA + ESEDÉKES + KURÁLT + FAROK.'],
        decided: [],
        open: ['LLM integration for Librarian extraction quality.', 'FTS5 virtual table creation.'],
        free: ''
      }), processed: true, workspaceId: 1 },

      // Unprocessed entries (these form the "farok" / raw tail)
      { ts: daysAgo(3), agentId: 'glm-worker-1', topic: 'mcos-engine', kind: 'event', content: structuredDigest({
        happened: ['Barion sandbox environment returned 503 for 2 hours (14:00-16:00 CET).', 'Our retry logic handled it gracefully — no data loss.', 'Monitoring alert triggered at 14:15, resolved by Barion at 16:03.'],
        decided: [],
        open: [],
        free: 'External dependency incident.'
      }), processed: false, workspaceId: 1 },

      { ts: daysAgo(2), agentId: 'claude-code', topic: 'mcos-engine', kind: 'digest', content: structuredDigest({
        happened: ['Started API key rotation implementation.', 'Current design: keys stored with prefix + hash, rotation generates new key and marks old one for 24h grace period.'],
        decided: [],
        open: ['Should rotation invalidate all active sessions or preserve them?'],
        fact_candidates: [
          { entity: 'api-key-rotation', attribute: 'grace-period', statement: 'API key rotation grants a 24-hour grace period for the old key before full invalidation.' },
        ],
        free: ''
      }), processed: false, workspaceId: 1 },

      { ts: daysAgo(1), agentId: 'claude-web', topic: 'onebrainer', kind: 'digest', content: structuredDigest({
        happened: ['Dashboard wireframe approved.', 'Read-only view: brief viewer with topic selector, dispute inbox, knowledge layer stats.', 'Dreamer tab design: spark history, rating stats, bandit-loop visualization.'],
        decided: [{ decision: 'Dashboard is read-only; write path stays MCP-only', rationale: 'Prevents accidental data corruption through the UI. All writes go through the MCP tool contracts with proper role-checking.' }],
        open: ['Dreamer implementation.', 'Delta-brief rendering in dashboard.'],
        free: ''
      }), processed: false, workspaceId: 1 },

      { ts: daysAgo(1), agentId: 'orchestrator', topic: 'mcos-engine', kind: 'digest', content: structuredDigest({
        happened: ['Sprint 5 planning completed.', 'Scope: API key rotation (finish), webhook dashboard panel, tenant-isolation audit.', 'Velocity trending up: 38 story points last sprint vs 32 before.'],
        decided: [],
        fact_candidates: [
          { entity: 'sprint-velocity', attribute: 'current', statement: 'Sprint 4 delivered 38 story points, up from 32 in Sprint 3.' },
        ],
        free: ''
      }), processed: false, workspaceId: 1 },

      { ts: daysAgo(0), agentId: 'claude-code', topic: 'personal', kind: 'note', content: structuredDigest({
        happened: [],
        decided: [],
        open: ['Discuss OneBrainer productization timeline with team.'],
        free: 'Bar特别注意：下次和团队同步时，需要讨论 OneBrainer 的 produktesítési 时间线。当前计划是 60-90 天自我使用后评估。'
      }), processed: false, workspaceId: 1 },
    ]
  });

  // === L2: FACTS ===
  await db.fact.createMany({
    data: [
      { topic: 'mcos-engine', entity: 'barion-integration', attribute: 'webhook-events', statement: 'Barion webhook handler processes three event types: payment.success, payment.failed, and refund.processed.', confidence: 'high', source: 'ledger:1', validFrom: daysAgo(20), reviewAt: daysFromNow(60), stale: false, workspaceId: 1 },
      { topic: 'mcos-engine', entity: 'barion-integration', attribute: 'payload-validation', statement: 'All Barion webhook payloads are validated with HMAC-SHA256 before processing.', confidence: 'high', source: 'ledger:1', validFrom: daysAgo(20), reviewAt: daysFromNow(90), stale: false, workspaceId: 1 },
      { topic: 'mcos-engine', entity: 'database', attribute: 'engine', statement: 'MCOS Engine v1 uses SQLite as its primary database.', confidence: 'high', source: 'barni-direct', validFrom: daysAgo(12), reviewAt: daysFromNow(90), stale: false, workspaceId: 1 },
      { topic: 'mcos-engine', entity: 'database', attribute: 'orm', statement: 'All database operations use Prisma ORM — no raw SQL in application code.', confidence: 'high', source: 'barni-direct', validFrom: daysAgo(10), reviewAt: daysFromNow(180), stale: false, workspaceId: 1 },
      { topic: 'mcos-engine', entity: 'rate-limiter', attribute: 'algorithm', statement: 'Rate limiting uses a sliding window algorithm with Redis-backed counters.', confidence: 'high', source: 'ledger:6', validFrom: daysAgo(8), reviewAt: daysFromNow(60), stale: false, workspaceId: 1 },
      { topic: 'mcos-engine', entity: 'rate-limiter', attribute: 'free-tier-limit', statement: 'Free tier rate limit is 100 requests per minute.', confidence: 'high', source: 'ledger:6', validFrom: daysAgo(8), reviewAt: daysFromNow(60), stale: false, workspaceId: 1 },
      { topic: 'mcos-engine', entity: 'rate-limiter', attribute: 'pro-tier-limit', statement: 'Pro tier rate limit is 1000 requests per minute.', confidence: 'high', source: 'ledger:6', validFrom: daysAgo(8), reviewAt: daysFromNow(60), stale: false, workspaceId: 1 },
      { topic: 'mcos-engine', entity: 'api-key-rotation', attribute: 'grace-period', statement: 'API key rotation grants a 24-hour grace period for the old key before full invalidation.', confidence: 'medium', source: 'ledger:11', validFrom: daysAgo(2), reviewAt: daysFromNow(30), stale: false, workspaceId: 1 },
      { topic: 'mcos-engine', entity: 'sprint-velocity', attribute: 'current', statement: 'Sprint 4 delivered 38 story points, up from 32 in Sprint 3.', confidence: 'medium', source: 'ledger:13', validFrom: daysAgo(1), reviewAt: daysFromNow(14), stale: false, workspaceId: 1 },
      { topic: 'onebrainer', entity: 'architecture', attribute: 'layers', statement: 'OneBrainer uses a three-layer memory architecture: L1 (raw ledger), L2 (canonical curated), L3 (assembled briefs).', confidence: 'high', source: 'barni-direct', validFrom: daysAgo(20), reviewAt: daysFromNow(180), stale: false, workspaceId: 1 },
      { topic: 'onebrainer', entity: 'librarian', attribute: 'write-access', statement: 'Only the Librarian process writes to the L2 canonical layer — sessions never write directly.', confidence: 'high', source: 'barni-direct', validFrom: daysAgo(20), reviewAt: daysFromNow(180), stale: false, workspaceId: 1 },
      { topic: 'onebrainer', entity: 'search', attribute: 'v1-strategy', statement: 'OneBrainer v1 uses FTS5 full-text search instead of vector embeddings.', confidence: 'high', source: 'barni-direct', validFrom: daysAgo(5), reviewAt: daysFromNow(90), stale: false, workspaceId: 1 },
      { topic: 'onebrainer', entity: 'brief', attribute: 'token-limit', statement: 'Each topic brief must stay under 1500 tokens.', confidence: 'high', source: 'barni-direct', validFrom: daysAgo(6), reviewAt: daysFromNow(90), stale: false, workspaceId: 1 },
      { topic: 'onebrainer', entity: 'librarian', attribute: 'engine', statement: 'The Librarian runs on GLM 5.2 with a flat plan execution model for zero marginal cost.', confidence: 'high', source: 'barni-direct', validFrom: daysAgo(6), reviewAt: daysFromNow(120), stale: false, workspaceId: 1 },
      { topic: 'onebrainer', entity: 'dashboard', attribute: 'access', statement: 'The MARKETINGOS dashboard has read-only access to OneBrainer data.', confidence: 'high', source: 'barni-direct', validFrom: daysAgo(1), reviewAt: daysFromNow(90), stale: false, workspaceId: 1 },
      { topic: 'onebrainer', entity: 'dreamer', attribute: 'purpose', statement: 'The Dreamer is an associative engine that collides open problems with remote knowledge pieces, producing at most one spark per day for the owner brief.', confidence: 'high', source: 'barni-direct', validFrom: daysAgo(3), reviewAt: daysFromNow(120), stale: false, workspaceId: 1 },
      { topic: 'onebrainer', entity: 'brief', attribute: 'delta-format', statement: 'The brief() function returns a delta-brief with four sections: SZIKRA (spark), ESEDÉKES (pending), KURÁLT (curated trunk), and FAROK (raw tail).', confidence: 'high', source: 'barni-direct', validFrom: daysAgo(3), reviewAt: daysFromNow(90), stale: false, workspaceId: 1 },
      // Stale fact for demo
      { topic: 'mcos-engine', entity: 'auth', attribute: 'provider', statement: 'Authentication uses NextAuth.js v4 with credentials provider only.', confidence: 'medium', source: 'ledger:5', validFrom: daysAgo(10), reviewAt: daysAgo(1), stale: true, workspaceId: 1 },
    ]
  });

  // === L2: DECISIONS ===
  await db.decision.createMany({
    data: [
      { topic: 'mcos-engine', decision: 'Use SQLite for v1 instead of PostgreSQL', rationale: 'Single-tenant application with no horizontal scaling requirement in v1. Zero ops overhead. Migration path documented in ADR-007.', decidedAt: daysAgo(12), status: 'active', reviewAt: daysFromNow(30), workspaceId: 1 },
      { topic: 'mcos-engine', decision: 'Implement rate limiter with sliding window algorithm', rationale: 'More accurate than fixed window, less complex than token bucket. Redis provides atomic counters with TTL.', decidedAt: daysAgo(8), status: 'completed', reviewAt: daysAgo(1), outcome: 'Implemented and deployed. 14/14 unit tests passing. No production issues after 8 days.', outcomeAt: daysAgo(1), lesson: 'Sliding window with Redis was straightforward. Next time consider in-memory for single-instance deployments.', workspaceId: 1 },
      { topic: 'onebrainer', decision: 'No vector search in v1', rationale: 'FTS5 + brief-based retrieval should suffice for 60-90 days. Embedding infrastructure has non-trivial cost and complexity.', decidedAt: daysAgo(5), status: 'active', reviewAt: daysFromNow(55), workspaceId: 1 },
      { topic: 'onebrainer', decision: 'Three-layer memory architecture (L1→L2→L3)', rationale: 'Quality is determined at write-time, not read-time. Only the Librarian writes to L2, ensuring curated, high-quality knowledge.', decidedAt: daysAgo(6), status: 'active', reviewAt: daysFromNow(84), workspaceId: 1 },
      { topic: 'onebrainer', decision: 'Dashboard is read-only; write path stays MCP-only', rationale: 'Prevents accidental data corruption through the UI. All writes go through the MCP tool contracts with proper role-checking.', decidedAt: daysAgo(1), status: 'active', reviewAt: daysFromNow(59), workspaceId: 1 },
      { topic: 'mcos-engine', decision: 'Barion webhook retry with exponential backoff', rationale: 'External payment provider may have transient failures. 3 attempts (5s/15s/45s) cover most scenarios without blocking the queue.', decidedAt: daysAgo(14), status: 'active', reviewAt: daysFromNow(16), workspaceId: 1 },
    ]
  });

  // === L2: PROJECT STATE ===
  await db.projectState.createMany({
    data: [
      { topic: 'mcos-engine', key: 'current-sprint', value: 'Sprint 5 — API key rotation, webhook dashboard, tenant-isolation audit', updatedAt: daysAgo(1), expiresAt: daysFromNow(14), workspaceId: 1 },
      { topic: 'mcos-engine', key: 'blocker', value: 'None', updatedAt: daysAgo(1), expiresAt: daysFromNow(7), workspaceId: 1 },
      { topic: 'mcos-engine', key: 'open-thread:api-key-session', value: 'API key rotation: should rotation invalidate all active sessions or preserve them?', updatedAt: daysAgo(2), expiresAt: daysFromNow(7), workspaceId: 1 },
      { topic: 'onebrainer', key: 'current-phase', value: 'Build step 7 in progress — Dreamer implementation', updatedAt: daysAgo(0), expiresAt: daysFromNow(14), workspaceId: 1 },
      { topic: 'onebrainer', key: 'open-thread:llm-extraction', value: 'LLM integration for Librarian extraction quality improvement', updatedAt: daysAgo(1), expiresAt: daysFromNow(14), workspaceId: 1 },
    ]
  });

  // === DISPUTES ===
  await db.dispute.createMany({
    data: [
      {
        createdAt: daysAgo(2),
        topic: 'mcos-engine',
        existingRef: 'facts:1',
        incoming: 'Barion webhook should also handle subscription.renewed event type (from ledger:11 — API key rotation discussion mentions subscription lifecycle).',
        detectedBy: 'librarian-semantic',
        status: 'open',
        workspaceId: 1,
      },
      {
        createdAt: daysAgo(1),
        topic: 'onebrainer',
        existingRef: 'facts:12',
        incoming: 'FTS5 alone is insufficient for cross-topic semantic queries — consider adding a lightweight embedding layer for the L2 fact corpus.',
        detectedBy: 'librarian-semantic',
        status: 'open',
        workspaceId: 1,
      },
      {
        createdAt: daysAgo(3),
        topic: 'mcos-engine',
        existingRef: 'decisions:1',
        incoming: 'Sprint 5 tenant-isolation audit may reveal that SQLite cannot support the required row-level security — PostgreSQL migration may need to be fast-tracked.',
        detectedBy: 'librarian-semantic',
        status: 'open',
        workspaceId: 1,
      },
    ]
  });

  // === L3: BRIEFS ===
  const mcosBrief = `# MCOS Engine — Knowledge Brief

> Built: ${daysAgo(0)} · 16 facts · 6 decisions · 3 active state keys

## Key Facts
- **barion-integration** (webhook-events, high): Barion webhook handler processes three event types: payment.success, payment.failed, and refund.processed.
- **barion-integration** (payload-validation, high): All Barion webhook payloads are validated with HMAC-SHA256 before processing.
- **rate-limiter** (algorithm, high): Rate limiting uses a sliding window algorithm with Redis-backed counters.
- **rate-limiter** (free-tier-limit, high): Free tier rate limit is 100 requests per minute.
- **database** (engine, high): MCOS Engine v1 uses SQLite as its primary database.
- **database** (orm, high): All database operations use Prisma ORM — no raw SQL in application code.

## Active Decisions
- **Use SQLite for v1** — Single-tenant, zero ops overhead. Review: 30d
- **No vector search v1** — FTS5 suffices. Review: 55d

## Current State
- **current-sprint**: Sprint 5 — API key rotation, webhook dashboard, tenant-isolation audit
- **blocker**: None
- **open-thread:api-key-session**: API key rotation: should rotation invalidate all active sessions or preserve them?

## Preferences
- Prisma ORM for all DB operations — no raw SQL
- Zod schemas for all endpoint input validation`;

  const onebrainerBrief = `# OneBrainer — Knowledge Brief

> Built: ${daysAgo(0)} · 7 facts · 4 decisions · 2 active state keys

## Key Facts
- **architecture** (layers, high): Three-layer memory: L1 (raw ledger), L2 (canonical curated), L3 (assembled briefs)
- **librarian** (write-access, high): Only the Librarian writes to L2 — sessions never write directly
- **dreamer** (purpose, high): Associative engine colliding open problems with remote knowledge, max 1 spark/day
- **brief** (delta-format, high): Delta-brief: SZIKRA + ESEDÉKES + KURÁLT + FAROK
- **search** (v1-strategy, high): FTS5 full-text search, no vector embeddings in v1

## Active Decisions
- **Three-layer architecture** — Quality at write-time. Review: 84d
- **No vector search v1** — FTS5 + brief retrieval. Review: 55d
- **Dashboard read-only** — MCP-only writes. Review: 59d

## Current State
- **current-phase**: Build step 7 in progress — Dreamer implementation
- **open-thread:llm-extraction**: LLM integration for Librarian extraction quality

## Preferences
- Briefs under 1500 tokens/topic
- Librarian never deletes — only supersedes, stale-flags, archives`;

  const personalBrief = `# Personal — Knowledge Brief

> Built: ${daysAgo(0)} · 0 facts · 0 decisions · 0 active state keys

## No structured knowledge yet for this topic.

## Recent Activity
- Note (0d ago): Discuss OneBrainer productization timeline with team (60-90 day gate).`;

  await db.brief.createMany({
    data: [
      { topic: 'mcos-engine', content: mcosBrief, builtAt: daysAgo(0), dirty: false, workspaceId: 1 },
      { topic: 'onebrainer', content: onebrainerBrief, builtAt: daysAgo(0), dirty: false, workspaceId: 1 },
      { topic: 'personal', content: personalBrief, builtAt: daysAgo(0), dirty: false, workspaceId: 1 },
    ]
  });

  // === LIBRARIAN RUNS ===
  await db.librarianRun.createMany({
    data: [
      { startedAt: daysAgo(6) + ' 02:00:00', endedAt: daysAgo(6) + ' 02:05:12', status: 'completed', summary: 'Cold-start: processed 3 seed entries. Extracted 5 facts, 3 decisions. Rebuilt 2 briefs (mcos-engine, onebrainer).', factsExtracted: 5, decisionsExtracted: 3, disputesCreated: 0, briefsRebuilt: 2, staleFlagged: 0, workspaceId: 1 },
      { startedAt: daysAgo(4) + ' 02:00:00', endedAt: daysAgo(4) + ' 02:04:23', status: 'completed', summary: 'Processed 4 digests. Extracted 8 facts, 2 decisions. No disputes. Rebuilt 2 briefs.', factsExtracted: 8, decisionsExtracted: 2, disputesCreated: 0, briefsRebuilt: 2, staleFlagged: 1, workspaceId: 1 },
      { startedAt: daysAgo(3) + ' 02:00:00', endedAt: daysAgo(3) + ' 02:06:11', status: 'completed', summary: 'Processed 2 digests. Extracted 3 facts, 1 decision. Detected 1 semantic dispute. Rebuilt 1 brief.', factsExtracted: 3, decisionsExtracted: 1, disputesCreated: 1, briefsRebuilt: 1, staleFlagged: 1, workspaceId: 1 },
      { startedAt: daysAgo(2) + ' 02:00:00', endedAt: daysAgo(2) + ' 02:03:45', status: 'completed', summary: 'Processed 1 digest. Extracted 2 facts. Detected 1 key-collision dispute. Rebuilt 1 brief.', factsExtracted: 2, decisionsExtracted: 0, disputesCreated: 1, briefsRebuilt: 1, staleFlagged: 0, workspaceId: 1 },
      { startedAt: daysAgo(1) + ' 02:00:00', endedAt: daysAgo(1) + ' 02:05:02', status: 'completed', summary: 'Processed 2 digests. Extracted 3 facts, 1 decision. Detected 1 semantic dispute. Rebuilt 2 briefs.', factsExtracted: 3, decisionsExtracted: 1, disputesCreated: 1, briefsRebuilt: 2, staleFlagged: 0, workspaceId: 1 },
      { startedAt: daysAgo(0) + ' 02:00:00', endedAt: daysAgo(0) + ' 02:02:18', status: 'completed', summary: 'Processed 1 digest. Extracted 1 fact. No disputes. No briefs needed rebuild.', factsExtracted: 1, decisionsExtracted: 0, disputesCreated: 0, briefsRebuilt: 0, staleFlagged: 0, workspaceId: 1 },
    ]
  });

  // === DREAMER: SPARKS ===
  await db.spark.createMany({
    data: [
      {
        createdAt: daysAgo(12), seedRef: 'project_state:5', pairedRef: 'facts:1',
        seedTopic: 'mcos-engine', pairedTopic: 'mcos-engine',
        insight: 'The HMAC-SHA256 webhook validation pattern from Barion could be applied to MCP tool invocations — each tool call could carry a signed payload to prevent tampering between the MCP layer and the knowledge base.',
        kind: 'mechanism-transfer', score: 0.82,
        deliveredAt: daysAgo(11), rating: 1,
        workspaceId: 1,
      },
      {
        createdAt: daysAgo(10), seedRef: 'decisions:2', pairedRef: 'facts:10',
        seedTopic: 'mcos-engine', pairedTopic: 'onebrainer',
        insight: 'The sliding window rate limiter\'s concept of bounded resource consumption maps to the Librarian\'s extraction budget — both need a hard ceiling to prevent runaway processing. The Dreamer\'s 30-pair/night limit follows the same pattern.',
        kind: 'mechanism-transfer', score: 0.75,
        deliveredAt: daysAgo(9), rating: 1,
        workspaceId: 1,
      },
      {
        createdAt: daysAgo(8), seedRef: 'project_state:5', pairedRef: 'facts:13',
        seedTopic: 'mcos-engine', pairedTopic: 'onebrainer',
        insight: 'Hidden contradiction: the MCOS Engine rate limiter uses Redis for atomic counters (external dependency), while OneBrainer\'s spec explicitly avoids external dependencies (SQLite-only). If both share the same infra, this creates an operational split.',
        kind: 'hidden-contradiction', score: 0.71,
        deliveredAt: daysAgo(7), rating: 0,
        workspaceId: 1,
      },
      {
        createdAt: daysAgo(6), seedRef: 'decisions:5', pairedRef: 'facts:6',
        seedTopic: 'onebrainer', pairedTopic: 'mcos-engine',
        insight: 'The "read-only dashboard" decision mirrors the principle behind the Barion retry mechanism: both accept eventual consistency as a feature, not a bug. The dashboard shows the curated trunk plus the raw tail — analogous to how retry logic accepts temporary failure.',
        kind: 'analogy', score: 0.68,
        deliveredAt: daysAgo(5), rating: null,
        workspaceId: 1,
      },
      {
        createdAt: daysAgo(4), seedRef: 'project_state:5', pairedRef: 'facts:15',
        seedTopic: 'mcos-engine', pairedTopic: 'onebrainer',
        insight: 'The "open-thread:api-key-session" about session invalidation during key rotation has a parallel in the Librarian\'s supersede chain: both need a graceful handoff period where old and new coexist briefly.',
        kind: 'mechanism-transfer', score: 0.73,
        deliveredAt: daysAgo(3), rating: null,
        workspaceId: 1,
      },
      {
        createdAt: daysAgo(2), seedRef: 'decisions:6', pairedRef: 'facts:11',
        seedTopic: 'mcos-engine', pairedTopic: 'onebrainer',
        insight: 'The webhook retry\'s exponential backoff (5s/15s/45s) could inform the Dreamer\'s threshold auto-adjustment: when too many sparks pass the filter, the threshold should increase exponentially, not linearly.',
        kind: 'mechanism-transfer', score: 0.78,
        deliveredAt: daysAgo(1), rating: null,
        workspaceId: 1,
      },
      {
        createdAt: daysAgo(1), seedRef: 'project_state:5', pairedRef: 'facts:16',
        seedTopic: 'onebrainer', pairedTopic: 'onebrainer',
        insight: 'The delta-brief\'s SZIKRA section (max 1 spark/day) and the Dreamer\'s 30-pair/night budget both embody the same principle: artificial scarcity drives quality. This is the same mechanism behind the brief\'s 1500-token limit.',
        kind: 'analogy', score: 0.65,
        deliveredAt: null, rating: null,
        workspaceId: 1,
      },
      {
        createdAt: daysAgo(0), seedRef: 'project_state:5', pairedRef: 'facts:3',
        seedTopic: 'mcos-engine', pairedTopic: 'mcos-engine',
        insight: 'SQLite\'s single-file simplicity could be a metaphor for the brief\'s design: a single portable artifact that captures the full state. Could the brief be the "SQLite of knowledge" — one file per topic that any agent can consume?',
        kind: 'analogy', score: 0.72,
        deliveredAt: null, rating: null,
        workspaceId: 1,
      },
    ]
  });

  // === DREAMER: SPARK WEIGHTS (bandit loop state) ===
  await db.sparkWeight.createMany({
    data: [
      { topicPair: 'mcos-engine|onebrainer', trials: 12, hits: 2, workspaceId: 1 },
      { topicPair: 'mcos-engine|personal', trials: 3, hits: 0, workspaceId: 1 },
      { topicPair: 'onebrainer|personal', trials: 2, hits: 0, workspaceId: 1 },
      { topicPair: 'mcos-engine|mcos-engine', trials: 5, hits: 1, workspaceId: 1 },
      { topicPair: 'onebrainer|onebrainer', trials: 4, hits: 0, workspaceId: 1 },
    ]
  });

  // === NEURAL LINKS: ASSOCIATIONS ===
  await db.association.createMany({
    data: [
      { factIdA: 1, factIdB: 2, label: 'extends', strength: 0.9, createdBy: 'librarian', createdAt: daysAgo(6), description: 'Both facts describe the Barion webhook integration pipeline', workspaceId: 1 },
      { factIdA: 3, factIdB: 4, label: 'requires', strength: 0.8, createdBy: 'librarian', createdAt: daysAgo(6), description: 'SQLite engine requires Prisma ORM as the database access layer', workspaceId: 1 },
      { factIdA: 5, factIdB: 6, label: 'extends', strength: 0.7, createdBy: 'librarian', createdAt: daysAgo(3), description: 'Both describe the rate limiting configuration', workspaceId: 1 },
      { factIdA: 5, factIdB: 7, label: 'extends', strength: 0.7, createdBy: 'librarian', createdAt: daysAgo(3), description: 'Both describe the rate limiting configuration', workspaceId: 1 },
      { factIdA: 8, factIdB: 2, label: 'related', strength: 0.4, createdBy: 'librarian', createdAt: daysAgo(2), description: 'API key rotation and payload validation both handle security concerns', workspaceId: 1 },
      { factIdA: 9, factIdB: 5, label: 'causes', strength: 0.5, createdBy: 'librarian', createdAt: daysAgo(1), description: 'Higher sprint velocity may be attributed to sliding window implementation', workspaceId: 1 },
      { factIdA: 10, factIdB: 11, label: 'supports', strength: 0.9, createdBy: 'librarian', createdAt: daysAgo(6), description: 'Three-layer architecture is enforced by librarian write access control', workspaceId: 1 },
      { factIdA: 12, factIdB: 13, label: 'related', strength: 0.6, createdBy: 'librarian', createdAt: daysAgo(5), description: 'FTS5 search strategy relates to brief token limits', workspaceId: 1 },
      { factIdA: 14, factIdB: 10, label: 'supports', strength: 0.8, createdBy: 'librarian', createdAt: daysAgo(4), description: 'GLM 5.2 Librarian operates within the three-layer architecture', workspaceId: 1 },
      { factIdA: 16, factIdB: 17, label: 'related', strength: 0.7, createdBy: 'librarian', createdAt: daysAgo(3), description: 'Dreamer sparks feed into the delta-brief format', workspaceId: 1 },
      { factIdA: 11, factIdB: 15, label: 'supports', strength: 0.7, createdBy: 'librarian', createdAt: daysAgo(2), description: 'Librarian write access control aligns with dashboard read-only access', workspaceId: 1 },
      { factIdA: 18, factIdB: 3, label: 'contradicts', strength: 0.6, createdBy: 'librarian', createdAt: daysAgo(1), description: 'Auth uses NextAuth.js v4 but database decision says SQLite (potential mismatch — NextAuth typically needs a separate auth DB)', workspaceId: 1 },
    ]
  });

  // === BRAIN INSIGHTS: PRE-SEEDED OBSERVATIONS ===
  await db.insight.createMany({
    data: [
      { createdAt: daysAgo(2), kind: 'pattern', severity: 'info', title: 'Sprint velocity trending up', description: 'Sprint 3: 32 points → Sprint 4: 38 points (+18.75% increase). Trend suggests team is accelerating.', topics: JSON.stringify(['mcos-engine']), actionable: false, workspaceId: 1 },
      { createdAt: daysAgo(3), kind: 'gap', severity: 'warning', title: 'Topic "personal" has zero facts', description: 'The personal topic exists in the ledger but has no extracted facts. Consider adding personal workflow preferences or context.', topics: JSON.stringify(['personal']), actionable: true, workspaceId: 1 },
      { createdAt: daysAgo(1), kind: 'contradiction', severity: 'critical', title: 'Auth provider fact is stale', description: 'Fact about NextAuth.js v4 auth provider is marked stale (review date passed). Auth implementation may have changed.', topics: JSON.stringify(['mcos-engine']), actionable: true, workspaceId: 1 },
      { createdAt: daysAgo(2), kind: 'suggestion', severity: 'info', title: '3 rate-limiter facts from same source', description: 'Three rate-limiter facts all sourced from ledger:6. Consider consolidating into a single comprehensive fact.', topics: JSON.stringify(['mcos-engine']), actionable: true, workspaceId: 1 },
      { createdAt: daysAgo(4), kind: 'gap', severity: 'warning', title: 'No deployment or infrastructure facts', description: 'Knowledge base has 9 mcos-engine facts but none about deployment, CI/CD, or infrastructure.', topics: JSON.stringify(['mcos-engine']), actionable: false, workspaceId: 1 },
      { createdAt: daysAgo(3), kind: 'pattern', severity: 'info', title: 'OneBrainer architecture well-documented', description: '8 facts cover the onebrainer topic across architecture, librarian, search, brief, dreamer, and dashboard — good coverage.', topics: JSON.stringify(['onebrainer']), actionable: false, workspaceId: 1 },
      { createdAt: daysAgo(1), kind: 'suggestion', severity: 'info', title: '2 unprocessed ledger entries may contain new knowledge', description: 'Ledger entries 11 and 12 are unprocessed. Running the Librarian could extract new facts.', topics: JSON.stringify(['mcos-engine', 'onebrainer']), actionable: true, workspaceId: 1 },
      { createdAt: daysAgo(5), kind: 'trend', severity: 'info', title: 'Decision density: mcos-engine leads', description: '4 out of 6 decisions are for mcos-engine. onebrainer has 3 decisions, personal has 0.', topics: JSON.stringify(['mcos-engine', 'onebrainer', 'personal']), actionable: false, workspaceId: 1 },
    ]
  });

  console.log('✅ Seed complete (v2 — with Dreamer + Brain)');
}

main()
  .catch(console.error)