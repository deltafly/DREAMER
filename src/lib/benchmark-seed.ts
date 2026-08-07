/**
 * Benchmark seed data — 10 questions across 3 types (single_session, multi_session, temporal).
 *
 * These are synthetic LongMemEval-style questions designed to test the brain/query pipeline.
 * Each question has evidence sessions with backdated timestamps.
 *
 * Usage: POST /api/benchmark/run with this as the `questions` field.
 *
 * Types:
 * - single_session: question can be answered from a single evidence session
 * - multi_session: requires combining info from 2+ sessions
 * - temporal: tests temporal ordering (which came first, latest state, etc.)
 */

export const SEED_QUESTIONS = [
  // ===== SINGLE SESSION (keyword match should work, tests basic recall) =====
  {
    id: 'ss-1',
    type: 'single_session' as const,
    question: 'What technology does the team use for the authentication layer?',
    expectedAnswer: 'JWT tokens with httpOnly cookies and NextAuth.js v4',
    evidenceSessions: [
      {
        topic: 'auth-system',
        content: 'The team discussed the authentication architecture. They decided to use JWT tokens stored in httpOnly cookies for security, implemented through NextAuth.js v4. The session includes both access token and refresh token rotation. Password validation requires uppercase, digits, and special characters with minimum 8 characters.',
        ts: '2025-03-10 09:00',
      },
    ],
  },
  {
    id: 'ss-2',
    type: 'single_session' as const,
    question: 'What is the primary database technology used in the project?',
    expectedAnswer: 'SQLite with Prisma ORM and WAL mode for concurrent access',
    evidenceSessions: [
      {
        topic: 'data-layer',
        content: 'Architecture decision: The project uses SQLite as the primary database with Prisma ORM for type-safe queries. WAL mode is enabled for concurrent read access. The database file is stored at db/custom.db. Migration strategy uses prisma db push for rapid development.',
        ts: '2025-03-12 14:00',
      },
    ],
  },
  {
    id: 'ss-3',
    type: 'single_session' as const,
    question: 'How does the neural spreading activation work in the brain query system?',
    expectedAnswer: 'Keyword-seeded initial activation propagates through Hebbian-weighted associations over multiple iterations',
    evidenceSessions: [
      {
        topic: 'brain-query',
        content: 'The brain query system uses neural spreading activation. Phase 1: keyword-matched facts get initial activation scores (topic +3, entity +2, attribute +1, statement hits +1 each). Phase 2: activation propagates through association edges using dynamic activationWeight, with 0.3 damping per iteration. Phase 3: Hebbian learning strengthens associations that carried signal. The system runs 3 iterations by default with a 0.05 activation threshold.',
        ts: '2025-04-01 11:00',
      },
    ],
  },
  // ===== MULTI SESSION (tests graph spreading across topics) =====
  {
    id: 'ms-1',
    type: 'multi_session' as const,
    question: 'How does the knowledge base connect the payment system to the notification service?',
    expectedAnswer: 'Payment events trigger webhook calls that the notification service consumes to send email alerts',
    evidenceSessions: [
      {
        topic: 'payment-module',
        content: 'The payment module processes subscriptions via Stripe. On successful payment, it emits a payment.completed event through the internal event bus. The event includes subscription details, amount, and customer email.',
        ts: '2025-03-15 10:00',
      },
      {
        topic: 'notification-service',
        content: 'The notification service listens to payment.completed events from the event bus. When received, it sends a confirmation email to the customer with receipt details. It also triggers an in-app notification for the billing dashboard.',
        ts: '2025-03-18 16:00',
      },
    ],
  },
  {
    id: 'ms-2',
    type: 'multi_session' as const,
    question: 'What is the relationship between the Dreamer module and the Spark system?',
    expectedAnswer: 'The Dreamer uses epsilon-greedy bandit selection on SparkWeights to pick topic pairs, then generates Sparks (insights) and Associations between facts across topics',
    evidenceSessions: [
      {
        topic: 'dreamer',
        content: 'The Dreamer is an associative thinking engine. It uses epsilon-greedy (ε=0.15) topic pair selection based on SparkWeight bandit state. For each selected pair, it fetches top facts from both topics and asks the LLM to find non-obvious insights (Sparks) and connections (Associations). Budget is 30 topic pairs per run.',
        ts: '2025-04-05 09:30',
      },
      {
        topic: 'sparks',
        content: 'Sparks are AI-generated insights from cross-topic analysis. Each Spark has a kind (analogy, contradiction, opportunity, risk, missing-link, optimization) and a score 0-1. Users can rate Sparks, which feeds back into the bandit algorithm via SparkWeight. The Dreamer generates Sparks, but users can also create them manually.',
        ts: '2025-04-08 14:00',
      },
    ],
  },
  {
    id: 'ms-3',
    type: 'multi_session' as const,
    question: 'How does the Librarian handle conflicting information from different sources?',
    expectedAnswer: 'It creates Dispute records when new information conflicts with existing facts, flagged by the LLM extraction or key-collision detection',
    evidenceSessions: [
      {
        topic: 'librarian',
        content: 'The Librarian processes unprocessed ledger entries using LLM extraction. If the LLM detects conflicting information with existing knowledge, it creates a Dispute record. Disputes have a status (open/resolved), a detectedBy field, and track both the existing reference and the incoming challenge.',
        ts: '2025-04-10 11:00',
      },
      {
        topic: 'disputes',
        content: 'When two facts about the same entity/attribute conflict, the system creates a Dispute. The dispute references the existing fact and describes the incoming contradiction. Disputes are visible in the knowledge brief and must be resolved manually by a human reviewer who decides which fact is correct.',
        ts: '2025-04-12 15:00',
      },
    ],
  },
  // ===== TEMPORAL (tests backdated ts — requires the ts fix) =====
  {
    id: 'tmp-1',
    type: 'temporal' as const,
    question: 'When did the team switch from REST to GraphQL for the API layer?',
    expectedAnswer: 'March 20, 2025',
    evidenceSessions: [
      {
        topic: 'api-architecture',
        content: 'The team decided to migrate from REST endpoints to GraphQL. The transition will start with the dashboard API and gradually cover all endpoints. Code-first schema approach with TypeGraphQL.',
        ts: '2025-03-20 10:00',
      },
    ],
  },
  {
    id: 'tmp-2',
    type: 'temporal' as const,
    question: 'What was the first database technology the project used before switching?',
    expectedAnswer: 'PostgreSQL, used until early March 2025 when they migrated to SQLite',
    evidenceSessions: [
      {
        topic: 'data-layer',
        content: 'The project originally used PostgreSQL for the database. However, due to deployment complexity and the single-tenant SaaS model, the team decided to migrate to SQLite with Prisma ORM. The migration was completed by March 5, 2025.',
        ts: '2025-03-01 09:00',
      },
      {
        topic: 'data-layer',
        content: 'Architecture decision: The project uses SQLite as the primary database with Prisma ORM for type-safe queries. WAL mode is enabled for concurrent read access. The database file is stored at db/custom.db.',
        ts: '2025-03-12 14:00',
      },
    ],
  },
  {
    id: 'tmp-3',
    type: 'temporal' as const,
    question: 'How many iterations did the brain query system use initially vs. the updated version?',
    expectedAnswer: 'Initially 1 iteration, later updated to 3 iterations (March 25, 2025)',
    evidenceSessions: [
      {
        topic: 'brain-query',
        content: 'Initial implementation of brain query uses 1 iteration of spreading activation. The activation threshold is set to 0.1. Testing shows this is too few for multi-hop queries.',
        ts: '2025-03-15 16:00',
      },
      {
        topic: 'brain-query',
        content: 'Updated the brain query to use 3 iterations by default (up from 1). This significantly improves multi-hop recall. Also lowered activation threshold from 0.1 to 0.05 to catch more weakly activated facts.',
        ts: '2025-03-25 11:00',
      },
    ],
  },
  {
    id: 'ss-4',
    type: 'single_session' as const,
    question: 'What security measure prevents clickjacking in the application?',
    expectedAnswer: 'X-Frame-Options: DENY header and frame-ancestors none in CSP',
    evidenceSessions: [
      {
        topic: 'security-headers',
        content: 'Security headers review: The application sets X-Frame-Options to DENY to prevent clickjacking. The Content Security Policy includes frame-ancestors none as an additional layer. X-Content-Type-Options is set to nosniff. HSTS is enabled with 1 year max-age, includeSubDomains, and preload eligibility.',
        ts: '2025-05-01 10:00',
      },
    ],
  },
];