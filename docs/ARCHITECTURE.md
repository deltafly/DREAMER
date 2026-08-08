# OneBrainer — Rendszerarchitektúra

> **Összefoglaló**: Az OneBrainer egy "második agy" (second brain) SaaS tudásbázis dashboard, amely AI-t használ a tudás kinyerésére, összekapcsolására és "álmodására" (cross-topic insight generálás). A rendszer háromrétegű tudásarchitektúrát implementál (L1→L2→L3), neurális hálózatot szimuláló spreading activationnel, Hebbian tanulással és szinaptikus plaszticitással.

**Stack**: Next.js 16 · React 19 · TypeScript · Prisma 6 · SQLite · shadcn/ui · Tailwind CSS 4 · NextAuth v4 (JWT)

---

## Tartalomjegyzék

1. [Komponens hierarchia](#komponens-hierarchia)
2. [Adatbázis modell kapcsolatok](#adatbázis-modell-kapcsolatok)
3. [API route struktúra](#api-route-struktúra)
4. [Lib réteg](#lib-réteg)
5. [Frontend state management](#frontend-state-management)
6. [Auth rendszer](#auth-rendszer)

---

## Komponens hierarchia

### Layout réteg

```
RootLayout (layout.tsx)
  └── ThemeProvider (next-themes)
       └── AuthProvider (auth-provider.tsx)
            └── QueryProvider (query-provider.tsx — TanStack Query)
                 └── {children}
```

### Főoldal és tab-ok

```
page.tsx (~691 sor) — Fő orchestrator
  ├── Header (keresés, sötét mód toggle, user menu, logout)
  ├── Tabs (shadcn Tabs)
  │    ├── 1. OverviewTab        — overview-tab.tsx (~461 sor)
  │    ├── 2. BriefsTab          — briefs-tab.tsx (~202 sor)
  │    ├── 3. KnowledgeTab       — knowledge-tab.tsx (~134 sor)
  │    ├── 4. DisputesTab        — disputes-tab.tsx (~298 sor)
  │    ├── 5. AgentsTab          — agents-tab.tsx (~48 sor)
  │    ├── 6. LedgerTab          — ledger-tab.tsx (~117 sor)
  │    ├── 7. DreamerTab         — dreamer-tab.tsx (~213 sor)
  │    ├── 8. BrainTab           — brain/index.tsx (~94 sor)
  │    ├── 9. ContestTab         — contest-tab.tsx
  │    ├── 10. GDPR Tab           — gdpr-tab.tsx
  │    ├── 11. Connectors Tab     — connectors-tab.tsx
  │    └── MCP Panel              — mcp-panel.tsx
  └── Footer (health score, verzió, utolsó frissítés)
```

### BrainTab belső struktúra

A Brain tab a legösszetettebb komponens, 6 szakaszból áll:

```
BrainTab (brain/index.tsx)
  ├── AskBrainSection          — ask-brain-section.tsx (~259 sor)
  │    └── RelevanceBar, ConfidenceIndicator
  ├── KnowledgeGraphSection    — knowledge-graph-section.tsx (~410 sor)
  │    └── runForceLayout() (force-layout.ts)
  ├── BrainInsightsSection     — insights-section.tsx (~182 sor)
  ├── KnowledgeGapsSection     — gaps-section.tsx (~182 sor)
  ├── NeuralStatsSection       — neural-stats-section.tsx (~443 sor)
  │    ├── Coverage Ring (SVG)
  │    ├── 7-napos activity sparkline
  │    ├── Activation distribution
  │    ├── Most activated neurons
  │    └── Cross-topic pathways
  └── DreamAndScheduleSection  — dream-schedule-section.tsx (~462 sor)
       ├── Dreamer toggle + schedule preset
       ├── Librarian toggle + schedule preset
       ├── Manual trigger gombok
       └── Timezone selector
```

### Megosztott modulok

| Fájl | Leírás |
|------|--------|
| `components/tabs/types.ts` | 15 shared interface (Stats, Fact, Decision, Spark, stb.) |
| `components/tabs/helpers.tsx` | timeAgo, topicColor, roleIcon, confidenceColor, stb. |
| `components/tabs/animated-counter.tsx` | Számláló animáció requestAnimationFrame-mel |
| `components/tabs/health-gauge.tsx` | SVG kör health indikátor |
| `components/brain/types.ts` | 10 neurális interface (BrainQueryResult, GraphNode, stb.) |
| `components/brain/constants.ts` | Topic színek, él stílusok, severity konfig, animációk |
| `components/brain/force-layout.ts` | Pure force-directed layout algoritmus |

---

## Adatbázis modell kapcsolatok

### Multi-tenant workspace alapú architektúra

A rendszer 22 Prisma modellt használ, mindegyik `workspaceId` mezővel rendelkezik (kivéve User, Contest, Challenge), ami biztosítja a workspace-izolációt. A `Workspace` modell központi hub, minden workspace-specifikus modell hozzá tartozik `onDelete: Cascade` relációval.

### Háromrétegű tudásarchitektúra (L1 → L2 → L3)

```
L1: Ledger (append-only, soha nem törölhető)
  └──> L2: Fact, Decision, Preference, ProjectState (kurált, Librarian-only írás)
        └──> L3: Brief (gyorsítótárazott összefoglalók)
```

### Modell kategóriák

#### Identitás és hozzáférés (3 modell)
| Modell | Tábla | Leírás |
|--------|-------|--------|
| `User` | `users` | Felhasználók (email, passwordHash) |
| `Workspace` | `workspaces` | Munkaterületek (name, slug, plan) |
| `WorkspaceMember` | `workspace_members` | Tagok szerepkörrel (owner/member) |

#### L1 — Nyers adatgyűjtés (1 modell)
| Modell | Tábla | Leírás |
|--------|-------|--------|
| `Ledger` | `ledger` | Append-only naplóbejegyzések (topic, kind, content, processed) |

#### L2 — Kurált tudás (4 modell)
| Modell | Tábla | Leírás |
|--------|-------|--------|
| `Fact` | `fact` | Tények (entity, attribute, statement, confidence, supersede chain, activationScore) |
| `Decision` | `decision` | Döntések (rationale, status, outcome, supersede chain) |
| `Preference` | `preference` | Preferenciák (scope, statement, active) |
| `ProjectState` | `project_state` | Volatilis állapot kulcsok (key, value, expiresAt) |

#### L2 — Munkafolyamat (1 modell)
| Modell | Tábla | Leírás |
|--------|-------|--------|
| `Dispute` | `dispute` | Viták (existingRef, incoming, detectedBy, ruling) |

#### L3 — Gyorsítótár (1 modell)
| Modell | Tábla | Leírás |
|--------|-------|--------|
| `Brief` | `brief` | Tudás összefoglalók (topic, content, dirty flag) |

#### Agent és pipeline (2 modell)
| Modell | Tábla | Leírás |
|--------|-------|--------|
| `Agent` | `agent` | Agent szerződések (agentId, keyHash, role) |
| `LibrarianRun` | `librarian_run` | Librarian futtatási napló |

#### Neurális hálózat (4 modell)
| Modell | Tábla | Leírás |
|--------|-------|--------|
| `Association` | `association` | Tények közötti neurális linkek (label, activationWeight, fireCount) |
| `NeuralActivity` | `neural_activity` | Spreading activation események (activation, source, iteration) |
| `Insight` | `insight` | Öngenerált megfigyelések (kind, severity, actionable, dismissed) |
| `BrainQuery` | `brain_query` | Query naplózás (context, returnedIds, useful) |

#### Dreamer (2 modell)
| Modell | Tábla | Leírás |
|--------|-------|--------|
| `Spark` | `spark` | Cross-topic asszociatív insightok (kind, score, rating) |
| `SparkWeight` | `spark_weight` | Bandit-loop állapot (topicPair, trials, hits) |

#### GDPR (3 modell)
| Modell | Tábla | Leírás |
|--------|-------|--------|
| `Consent` | `consents` | Felhasználói hozzájárulások (kind, granted) |
| `DataExport` | `data_exports` | Adatexport kérések (status, filePath, expiresAt) |
| `AuditLog` | `audit_logs` | GDPR audit trail |

#### Gamifikáció — Contest V2 (4 modell)
| Modell | Tábla | Leírás |
|--------|-------|--------|
| `Contest` | `contests` | Versenyek (kind, status, startsAt, endsAt) |
| `ContestEntry` | `contest_entries` | Versenyben résztvevő workspacok (score, rank) |
| `Challenge` | `challenges` | Versenyfeladatok (kind, points, completedBy) |
| `Achievement` | `achievements` | Megszerezhető jelvények (badge, title) |

#### Ütemezés (1 modell)
| Modell | Tábla | Leírás |
|--------|-------|--------|
| `WorkspaceSettings` | `workspace_settings` | Scheduler beállítások (dreamer/librarian enabled, schedule, timezone) |

### Kulcs relációk

```
Workspace 1──N  Ledger, Fact, Decision, Preference, ProjectState,
                 Dispute, Brief, Agent, LibrarianRun, Spark,
                 SparkWeight, Association, Insight, BrainQuery,
                 NeuralActivity, ContestEntry, Achievement, WorkspaceSettings

Fact N──N Fact  (via Association: factIdA ↔ factIdB)
Fact 1──N Fact  (SupersedeChain: supersededBy self-relation)
Decision 1──N Decision (DecisionSupersede: supersededBy self-relation)

User 1──N  WorkspaceMember N──1 Workspace
User 1──N  Consent
User 1──N  DataExport
```

---

## API route struktúra

Az alkalmazás 45+ API endpointot tartalmaz, szervezve a következő kategóriákban:

```
src/app/api/
├── auth/
│   ├── [...nextauth]/route.ts    — NextAuth auth végpont
│   └── register/route.ts         — Regisztráció
├── brain/
│   ├── query/route.ts            — Neurális keresés (spreading activation)
│   ├── neural-stats/route.ts     — Neurális statisztikák
│   ├── gaps/route.ts             — Tudáshiányok
│   ├── insights/route.ts         — Brain insight generálás/listázás
│   ├── graph/route.ts            — Tudásgráf adatok
│   ├── plasticity/route.ts       — Szinaptikus plaszticitás (decay)
│   └── associations/route.ts     — Asszociációk listázása
├── dreamer/
│   └── run/route.ts              — Dreamer pipeline futtatás
├── gdpr/
│   ├── consent/route.ts          — Hozzájárulás kezelés
│   ├── export/route.ts           — Adatexport
│   ├── erase/route.ts            — Jog a törléshez
│   ├── audit/route.ts            — Audit napló
│   ├── privacy/route.ts          — Adatvédelmi tájékoztató
│   └── retention/route.ts        — Adatmegőrzés
├── contest/
│   ├── contests/route.ts         — Versenyek listázása/létrehozása
│   ├── contests/[id]/route.ts    — Verseny CRUD
│   ├── enter/route.ts            — Belépés versenybe
│   ├── score/route.ts            — Pontszám számítás
│   ├── leaderboard/route.ts      — Ranglista
│   ├── achievements/route.ts     — Jelvények
│   └── challenges/route.ts       — Feladatok
├── facts/route.ts                — Tények CRUD + keresés
├── decisions/route.ts            — Döntések listázás
├── decisions/review/route.ts     — Döntés felülvizsgálat
├── preferences/route.ts          — Preferenciák listázás
├── disputes/route.ts             — Viták listázás
├── disputes/resolve/route.ts     — Vita megoldás
├── ledger/route.ts               — Ledger bejegyzések
├── briefs/route.ts               — Brief-ek listázása
├── briefs/[topic]/route.ts       — Topic specifikus delta-brief
├── agents/route.ts               — Agent-ek listázása
├── sparks/route.ts               — Spark-ek listázása/szűrése
├── sparks/rate/route.ts          — Spark értékelés (bandit)
├── librarian/route.ts            — Librarian futtatás
├── librarian-runs/route.ts       — Librarian futtatási napló
├── search/route.ts               — Globális keresés
├── stats/route.ts                — Dashboard statisztikák
├── activity/route.ts             — Aktivitás idővonal
├── settings/route.ts             — Workspace beállítások (scheduler)
├── scheduler/tick/route.ts       — Scheduler cron trigger
├── mcp/route.ts                  — MCP (Model Context Protocol) szerver
├── workspaces/route.ts           — Workspace-ok listázása
├── workspaces/[id]/route.ts      — Workspace részletek
├── health/route.ts               — Health check
└── project-states/route.ts       — Projekt állapotok
```

Lásd még: [`API.md`](./API.md) a teljes endpoint referenciáért.

---

## Lib réteg

A `src/lib/` könyvtár tartalmazza az összes üzleti logikát, amit az API route-ok vékony wrapper-ekként hívnak.

### Neurális agy modulok

| Fájl | Exportált függvény | Leírás |
|------|-------------------|--------|
| `brain-query.ts` | `executeBrainQuery(workspaceId, input)` | Spreading activation + Hebbian learning. Zod validált input, stop-word szűrés, 3 iterációs neurális jelpropagáció, súlyozott találati pontszámok. |
| `brain-stats.ts` | `getNeuralStats(workspaceId)` | Topológiai, aktivációs, plaszticitási, súlyeloszlási és health metrikák számítása. |
| `brain-gaps.ts` | `getKnowledgeGaps(workspaceId)` | Tudáshiányok detektálása: üres témák, elavult tények, ritka tudás, nyitott szálak. |
| `brain-insights.ts` | `generateInsights(workspaceId)`, `dismissInsight(id, workspaceId)`, `getInsights(workspaceId)` | Öngenerált megfigyelések: trendek, ellentmondások, javaslatok. Generálás DB-t is ír, listázás read-only. |
| `brain-graph.ts` | `getKnowledgeGraph(workspaceId)` | Gráf adatok generálása: node-ok (tények, döntések), élek (asszociációk), topic klaszterek színekkel. |

### Üzleti logika modulok

| Fájl | Exportált függvény | Leírás |
|------|-------------------|--------|
| `dreamer.ts` | `runDreamer(workspaceId)` | Cross-topic "álmodás": ε-greedy párosítás, UCB1 bandit scoring, LLM ütköztetés, spark + asszociáció létrehozás. O(n²)→O(budget) optimalizált. |
| `librarian.ts` | `runLibrarian(workspaceId)` | L1→L2→L3 desztillációs pipeline: regex heurisztika + LLM kinyerés, auto-asszociáció, brief rebuild. |
| `scheduler.ts` | `getScheduler()` | Singleton cron scheduler (croner). Lazy inicializáció, overlap védelem, dev-mode guard (Turbopack kompatibilitás). |

### LLM réteg

Minden modellhívás ezen a két modulon megy át — provider SDK-t közvetlenül hívni tilos.

| Fájl | Export | Leírás |
|------|--------|--------|
| `llm-client.ts` | `complete()`, `resolveProvider()`, `resolveModel()`, `describeLLM()` | Provider-agnosztikus belépési pont. Három adapter: `anthropic` (hivatalos SDK), `openai` (bármely OpenAI-kompatibilis `/chat/completions` — OpenAI, Groq, OpenRouter, vLLM, Ollama), `zai` (legacy, csak explicit `LLM_PROVIDER=zai` esetén). Az adapter nyeli le a provider-eltéréseket: a `temperature` NEM megy a Claude-nak (400-zal utasítaná el), az `effort` hintet a nem ismerő providerek eldobják, a Claude `refusal` stop reason-je `LLMUnavailableError`-rá alakul. Konfigurálatlan állapotban beszédes hibát dob. |
| `llm-safety.ts` | `wrapUntrusted()`, `injectionGuard()`, `newNonce()`, `parseLLMJson()` + Zod sémák | Prompt-injection behatárolás. Hívásonkénti véletlen nonce keríti a megbízhatatlan szöveget; minden választ Zod-séma validál a DB-írás ELŐTT (zárt enumok, hossz- és tömbkorlátok). Nem illeszkedő válasz = teljes eldobás. |

### Infrastruktúra modulok

| Fájl | Export | Leírás |
|------|--------|--------|
| `auth.ts` | `authOptions` | NextAuth v4 konfiguráció: Credentials provider, JWT strategy, bcrypt jelszó ellenőrzés. |
| `auth-helpers.ts` | `requireAuth()`, `getWorkspaceId()`, `verifyWorkspaceAccess()` | Auth + workspace feloldás. Dev: workspace 1 fallback. Prod: kötelező auth + RBAC. |
| `mcp-permissions.ts` | `checkToolAccess()`, `isPrivilegedTool()`, `allowedRolesFor()` | Role-gate az MCP toolokra. A pipeline-indító `run_dreamer` / `run_librarian` csak megfelelő szerepkörrel hívható. Tiszta függvények, DB nélkül tesztelhetők. |
| `api-handler.ts` | `withHandler()` | API route wrapper: requestId, struktúrált error response, lassú kérés figyelmeztetés (>1s). |
| `errors.ts` | `AppError`, `ValidationError`, `AuthError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `RateLimitError` | Tipizált hiba osztályok. |
| `db.ts` | `db` | PrismaClient singleton, dev-ben query logging. |
| `env.ts` | `validateEnv()`, `assertEnv()` | Env var validáció, production fail-fast. |
| `logger.ts` | `logger` | Strukturált logger: JSON (prod) / színes emberi olvasható (dev), LOG_LEVEL támogatás. |
| `pagination.ts` | `parsePagination()`, `PaginatedResponse<T>` | Közös pagination helper (limit/offset, max 500). |
| `task-lock.ts` | `acquireTaskLock()`, `releaseTaskLock()`, `withTaskLock()`, `getActiveLocks()` | In-memory overlap védelem Map alapú, 10 perces stale lock timeout. |
| `utils.ts` | `cn()` | Tailwind class merge helper (clsx + tailwind-merge). |
| `seed-workspace.ts` | Seed adatok | Alap workspace, tények, döntések, preferenciák, viták, brief-ek seed-elése. |
| `seed-contest.ts` | Contest seed | GDPR consent-ek, audit log, contest-ek, challenge-ek, achievement-ek seed-elése. |

---

## Frontend state management

### Adatfetching: TanStack Query v5

A `QueryProvider` a layout-ban van elhelyezve, az összes komponens számára elérhető.

- **Brain tab**: `useQuery` + `useMutation` a neurális query-khez, statisztikákhoz, insight-okhoz, ütemezés beállításokhoz
- **Változtatás utáni invalidálás**: `queryClient.invalidateQueries()` a mutation-ok után
- **POST→GET fallback minta**: Insight generálásnál POST trigger, majd GET az eredmény lekérésére

### Állapotkezelés: useState + props drilling

A fő `page.tsx` orchestrator tartja a közös állapotot:

- `stats`, `facts`, `decisions`, `disputes`, `ledger`, `briefs`, `sparks`, `agents`, `preferences`, `activity`
- `activeTab`, `searchQuery`, `refreshKey`
- Dialog állapotok (review, resolve, log entry)
- Mentőág (refresh) függvények a tab komponensek számára

### Kliens oldali optimalizációk

- **Animated counter**: `requestAnimationFrame` cubic ease-out animáció
- **Force-directed layout**: Pure function, memoizált számítás
- **Framer Motion**: Staggered fade-in, tab váltás animációk
- **Keyboard shortcuts**: `⌘K`/`Ctrl+K` keresés, `1-9` tab váltás, `R` frissítés

---

## Auth rendszer

### NextAuth v4 — JWT Strategy

```
Bejelentkezés
  → CredentialsProvider (email + password)
  → bcrypt.compare(passwordHash)
  → JWT token generálás (userId a token-ben)
  → session callback: userId beinjektálása

Minden API kérés
  → getServerSession(authOptions)
  → token.userId kinyerése
  → getWorkspaceId(request)
     → query param (?workspace=)
     → header (x-workspace-id)
     → user első workspace-e
     → DEV fallback: workspace 1
```

### Dev vs Production különbségek

| Aspektus | Development | Production |
|----------|-------------|------------|
| Auth kötelező | Nem (workspace 1 fallback) | Igen — AuthError dobás |
| NEXTAUTH_SECRET | Hardcoded dev secret | Kötelező (openssl rand -base64 32) |
| DB query logging | Igen (`log: ['query']`) | Nem |
| Logger output | Színes emberi olvasható | JSON |
| Scheduler cron | Kikapcsolva (Turbopack védelem) | Aktív (croner) |
| API self-call | Nincs (direkt import) | Nincs (direkt import) |

### Workspace izoláció

Minden adatbázis lekérdezés `workspaceId`-vel van szűrve. A `verifyWorkspaceAccess()` ellenőrzi, hogy a felhasználó tagja-e a workspace-nek. A `WorkspaceMember` tábla `role` mezője alapján RBAC valósítható meg (jelenleg owner/member).