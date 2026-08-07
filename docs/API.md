# OneBrainer — API referencia

> **Összefoglaló**: Az OneBrainer 45+ REST API endpointot és 1 MCP (Model Context Protocol) szervert biztosít. Az összes endpoint workspace-izolált (`?workspace=` query param vagy `x-workspace-id` header). A hibák egységes struktúrával térnek vissza (`withHandler` wrapper).

---

## Általános információk

### Authentikáció

- **Dev módban**: Auth nem kötelező, alapértelmezetten workspace 1
- **Production-ban**: NextAuth JWT session kötelező (`getServerSession`)
- **Scheduler tick**: Bearer token auth (`SCHEDULER_SECRET` environment változó)
- **Workspace kiválasztás**: `?workspace=<id>` query param VAGY `x-workspace-id` header

### Hibaválasz formátum

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [...]
  },
  "meta": {
    "timestamp": "2025-01-01T00:00:00.000Z",
    "requestId": "abc123-def456"
  }
}
```

### Hibakódok

| Kód | HTTP státusz | Leírás |
|-----|-------------|--------|
| `VALIDATION_ERROR` | 400 | Érvénytelen bemenet (Zod validáció) |
| `AUTH_REQUIRED` | 401 | Authentikáció szükséges |
| `FORBIDDEN` | 403 | Nincs jogosultság a workspace-hez |
| `NOT_FOUND` | 404 | Erőforrás nem található |
| `CONFLICT` | 409 | Ütközés (pl. már létezik) |
| `RATE_LIMITED` | 429 | Túl sok kérés |
| `INTERNAL_ERROR` | 500 | Belső hiba |

### Pagináció

Az oldalazható endpointok a következő paramétereket támogatják:

| Paraméter | Alapérték | Maximum | Leírás |
|-----------|-----------|---------|--------|
| `limit` | 100 | 500 | Elemek száma oldalanként |
| `offset` | 0 | — | Eltolás |

Válasz formátum:

```json
{
  "data": [...],
  "total": 150,
  "limit": 100,
  "offset": 0
}
```

---

## Knowledge — Tudás CRUD

### `GET /api/facts`

Tények listázása, szűréssel és oldalazással.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Query paraméterek**: `topic`, `limit`, `offset`

**Válasz**: `PaginatedResponse<Fact>`

---

### `POST /api/facts`

Új tény létrehozása (Zod validált).

**Auth**: Dev: nem kötelező · Prod: kötelező

**Request body** (Zod `CreateFactSchema`):

```json
{
  "topic": "backend",
  "entity": "auth-service",
  "attribute": "status",
  "statement": "JWT auth aktív, session 24h",
  "confidence": "high",
  "source": "sprint-review"
}
```

| Mező | Típus | Kötelező | Leírás |
|------|------|----------|--------|
| `topic` | string | Igen | Tudás terület |
| `entity` | string | Igen | Entitás neve |
| `attribute` | string | Igen | Tulajdonság |
| `statement` | string | Igen | Tényállítás |
| `confidence` | string | Nem | `"low"` / `"medium"` / `"high"` (alap: medium) |
| `source` | string | Nem | Forrás |

---

### `GET /api/decisions`

Döntések listázása, szűréssel és oldalazással.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Query paraméterek**: `topic`, `status`, `limit`, `offset`

---

### `POST /api/decisions/review`

Döntés felülvizsgálat.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `GET /api/preferences`

Preferenciák listázása.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

## Brain — Neurális hálózat

### `POST /api/brain/query`

Neurális keresés spreading activationnel és Hebbian tanulással.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Request body** (Zod `BrainQueryInput`):

```json
{
  "query": "sprint velocity és deployment architecture",
  "limit": 10,
  "iterations": 3,
  "activationThreshold": 0.05
}
```

| Mező | Típus | Alapérték | Leírás |
|------|------|-----------|--------|
| `query` | string (2-5000) | — | Keresési kontextus |
| `limit` | int (1-50) | 10 | Max találatok |
| `iterations` | int (1-5) | 3 | Spreading activation iterációk |
| `activationThreshold` | float (0-1) | 0.05 | Aktivációs küszöb |

**Rate limit**: 20 kérés / perc.

**Válasz** (`BrainQueryResult`):

```json
{
  "results": [
    {
      "fact": { "id": 1, "topic": "backend", "entity": "...", "attribute": "...", "statement": "...", "confidence": "high" },
      "activation": 0.85,
      "isSeed": true,
      "reason": "topic match (+3), entity match (+2)"
    }
  ],
  "neural": {
    "totalActivated": 5,
    "seedFacts": 2,
    "spreadFacts": 3,
    "associationsFired": 4,
    "hebbianUpdates": 2,
    "iterations": 3,
    "activationThreshold": 0.05
  }
}
```

**Mellékhatás**: Hebbian learning (súly frissítés), BrainQuery naplózás, NeuralActivity rögzítés.

---

### `GET /api/brain/neural-stats`

Neurális statisztikák: topológia, aktiváció, plaszticitás, súlyeloszlás, health score.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Válasz** (`NeuralStatsResult`): health score, node/edge topology, activation distribution, weight buckets, most activated facts, 7-day activity sparkline, cross-topic connectivity, recent neural activity feed.

---

### `GET /api/brain/gaps`

Tudáshiányok automatikus detektálása.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Válasz**: Téma szerinti hiányok (üres témák, elavult tények, ritka tudás, nyitott szálak), súlyossági szinttel (high/medium/low) és javaslatokkal.

---

### `GET /api/brain/insights`

Brain insight-ok listázása (read-only, nem generál új insight-ot).

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `POST /api/brain/insights`

Új insight-ok generálása és mentése az adatbázisba.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Mellékhatás**: Insight rekordok létrehozása a DB-ben.

---

### `PATCH /api/brain/insights`

Insight elvetése (dismiss).

**Auth**: Dev: nem kötelező · Prod: kötelező

**Request body**: `{ "id": <insight_id> }`

---

### `GET /api/brain/graph`

Tudásgráf adatai: node-ok, élek, topic klaszterek.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Válasz** (`GraphResult`):

```json
{
  "nodes": [{ "id": "fact-1", "label": "entity", "topic": "backend", "confidence": "high", "activationScore": 0.5, "stale": false, "connections": 3 }],
  "edges": [{ "source": "fact-1", "target": "fact-2", "label": "extends", "weight": 0.7, "activationWeight": 0.6, "fireCount": 3 }],
  "clusters": [{ "id": "backend", "topic": "backend", "color": "#10b981", "count": 8 }]
}
```

---

### `POST /api/brain/plasticity`

Szinaptikus plaszticitás — exponenciális felejtési görbe lefuttatása. 0.5%/nap decay, minimum súly 0.05. LTP: fireCount > 5 ellenáll a decay-nek.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Task lock**: Igen — párhuzamos futás megakadályozva.

---

### `GET /api/brain/associations`

Asszociációk listázása tény részletekkel.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Query paraméterek**: `topic` (opcionális szűrő)

---

## Ledger — L1 nyers napló

### `GET /api/ledger`

Ledger bejegyzések listázása.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Query paraméterek**: `kind` (digest/decision/event/note/seed), `limit`, `offset`

---

### `POST /api/ledger`

Új ledger bejegyzés létrehozása.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Request body** (Zod `CreateLedgerSchema`):

```json
{
  "topic": "backend",
  "content": "{\"type\": \"digest\", ...}",
  "kind": "digest",
  "agentId": "claude-4"
}
```

---

## Dreamer — Cross-topic "álmodás"

### `POST /api/dreamer/run`

Dreamer pipeline futtatás: ε-greedy párosítás → UCB1 scoring → LLM ütköztetés → spark + asszociáció generálás → bandit frissítés.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Task lock**: Igen — `dreamer` lock, párhuzamos futás megakadályozva.

**Válasz**: Generált spark-ok és asszociációk száma, párosítások, bandit frissítések.

---

### `GET /api/dreamer/run`

Dreamer állapot lekérdezés: témák, lehetséges párok, feltárt lefedettség, top párok, legutóbbi spark-ok.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

## Librarian — L1→L2→L3 desztilláció

### `POST /api/librarian`

Librarian pipeline futtatás: regex heurisztika + LLM kinyerés → Fact/Decision létrehozás → Dispute detektálás → Auto-asszociáció → Brief rebuild.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Task lock**: Igen — `librarian` lock.

**Válasz**: Kinyert tények, döntések, létrehozott viták, rebuilt brief-ek száma.

---

### `GET /api/librarian`

Librarian állapot lekérdezés.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `GET /api/librarian-runs`

Librarian futtatási napló listázása.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

## Briefs — L3 tudás összefoglalók

### `GET /api/briefs`

Brief-ek listázása (topic + dirty státusz).

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `GET /api/briefs/:topic`

Delta-brief lekérdezés egy témához.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Válasz** (4 szekciós formátum):

```json
{
  "topic": "backend",
  "szikra": "...",
  "esedekes": "...",
  "kuralt": "...",
  "farok": "..."
}
```

---

## Disputes — Viták

### `GET /api/disputes`

Viták listázása, szűréssel és oldalazással.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `POST /api/disputes/resolve`

Vita megoldása.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Request body**: `{ "id": <dispute_id>, "ruling": "..." }`

---

## Agents — Agent szerződések

### `GET /api/agents`

Agent-ek listázása szerepkörrel és aktivitással.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

## Sparks — Dreamer insight-ok

### `GET /api/sparks`

Spark-ok listázása szűréssel.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Query paraméterek**: `topic`, `kind`, `delivered`, `rated`, `limit`, `offset`

---

### `POST /api/sparks/rate`

Spark értékelés — bandit-loop súly frissítés.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Request body**: `{ "id": <spark_id>, "rating": 1 }` (1=hit, 0=miss)

---

## Connectors — Külső kapcsolatok

### `GET /api/connectors` (komponens szintű)

Kapcsolat panel a dashboardon (nem dedikált API route).

---

## MCP — Model Context Protocol

### `POST /api/mcp`

MCP JSON-RPC szerver (Streamable HTTP, MCP 2025-03-26 spec). Kompatibilis Claude Desktop-pal és OpenAI-val MCP adapter-en keresztül.

**Auth**: Nem kötelező (workspace opcionális)
**CORS**: Konfigurálható `MCP_ALLOWED_ORIGINS` env var-al

### MCP Tool-ok (13 db)

| Tool neve | Leírás |
|-----------|--------|
| `brain_query` | Természetes nyelvű neurális keresés a tudásbázisban |
| `add_fact` | Új tény hozzáadása (topic, entity, attribute, statement) |
| `list_topics` | Témák listázása |
| `get_brief` | Delta-brief lekérdezése témánként |
| `get_neural_stats` | Neurális statisztikák lekérdezése |
| `get_knowledge_gaps` | Tudáshiányok lekérdezése |
| `get_insights` | Brain insight-ok lekérdezése |
| `get_associations` | Asszociációk listázása (opcionális topic szűrő) |
| `get_graph` | Tudásgráf adatai |
| `run_dreamer` | Dreamer pipeline futtatás |
| `run_librarian` | Librarian pipeline futtatás |
| `list_decisions` | Döntések listázása (opcionális topic szűrő) |
| `list_sparks` | Spark-ok listázása (opcionális topic/kind szűrő) |

### `GET /api/mcp`

MCP szerver felfedezés — JSON formátumú tool lista.

---

## Scheduler — Ütemezés

### `POST /api/scheduler/tick`

Cron-trigger által hívott endpoint. Bearer token auth (`Authorization: Bearer <SCHEDULER_SECRET>`). Timing-safe titok összehasonlítás. Értesíti a schedulert, hogy fusson le az esedékes task.

**Auth**: Bearer token (`SCHEDULER_SECRET`)

---

## Settings — Workspace beállítások

### `GET /api/settings`

Workspace scheduler beállítások lekérdezése. Ha nincs még beállítás, alapértékeket ad vissza.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `PATCH /api/settings`

Workspace scheduler beállítások módosítása (cron formátum és IANA timezone validációval).

**Auth**: Dev: nem kötelező · Prod: kötelező

**Request body**:

```json
{
  "dreamerEnabled": true,
  "dreamerSchedule": "0 3 * * *",
  "librarianEnabled": true,
  "librarianSchedule": "0 */4 * * *",
  "timezone": "Europe/Budapest"
}
```

---

## Contest — Gamifikáció

### `GET /api/contest/contests`

Versenyek listázása.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `POST /api/contest/contests`

Új verseny létrehozása.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `GET /api/contest/contests/:id`

Verseny részletek (challenge-ekkel és entry-kkel).

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `PATCH /api/contest/contests/:id`

Verseny módosítása.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `DELETE /api/contest/contests/:id`

Verseny törlése.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `POST /api/contest/enter`

Belépés egy versenybe.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `POST /api/contest/score`

Pontszám újraszámítás 7-faktoros képlettel: facts×2, decisions×3, associations×5, insights×1, sparks×4, breadth×10, freshness+50.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `GET /api/contest/leaderboard`

Ranglista lekérdezés versenyenként.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `GET /api/contest/achievements`

Jelvények listázása.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `POST /api/contest/achievements`

Jelvény ellenőrzés és odaítélés.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `GET /api/contest/challenges`

Feladatok listázása.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `POST /api/contest/challenges`

Új feladat létrehozása.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

## GDPR — Adatvédelem

### `GET /api/gdpr/consent`

Hozzájárulások listázása.

**Auth**: Kötelező (userId szükséges)

---

### `POST /api/gdpr/consent`

Hozzájárulás módosítás (toggle granted/revoked).

**Auth**: Kötelező

**Request body**: `{ "kind": "analytics", "granted": true }`

---

### `POST /api/gdpr/export`

Adatexport kérés létrehozása (JSON formátum, minden felhasználói adat).

**Auth**: Kötelező

---

### `GET /api/gdpr/export`

Adatexport státusz és letöltés.

**Auth**: Kötelező

---

### `POST /api/gdpr/erase`

Jog a törléshez — minden felhasználói adat törlése (`$transaction`).

**Auth**: Kötelező · Demo fiók: 403 Forbidden

---

### `GET /api/gdpr/audit`

Audit napló lekérdezés (oldalazott).

**Auth**: Kötelező

**Query paraméterek**: `limit`, `offset`

---

### `GET /api/gdpr/privacy`

Statikus adatvédelmi tájékoztató.

**Auth**: Nem kötelező

---

### `GET /api/gdpr/retention`

Adatmegőrzési összefoglaló.

**Auth**: Nem kötelező

---

### `POST /api/gdpr/retention`

Adatmegőrzési takarítás (audit log >90 nap törlése).

**Auth**: Nem kötelező

---

## Auth — Hitelesítés

### `GET /api/auth/[...nextauth]`

NextAuth végpontok (signIn, signOut, callback, session).

**Auth**: N/A (ez maga a auth végpont)

---

### `POST /api/auth/register`

Új felhasználó regisztráció (bcrypt hashelt jelszó).

**Auth**: Nem kötelező

**Request body**: `{ "email": "...", "name": "...", "password": "..." }`

---

## Workspaces — Munkaterületek

### `GET /api/workspaces`

Workspacok listázása.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `POST /api/workspaces`

Új workspace létrehozása.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `GET /api/workspaces/:id`

Workspace részletek.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `PATCH /api/workspaces/:id`

Workspace módosítása.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `DELETE /api/workspaces/:id`

Workspace törlése (cascade: minden hozzá tartozó adat törlődik).

**Auth**: Dev: nem kötelező · Prod: kötelező

---

## Egyéb végpontok

### `GET /api/health`

Health check — DB connectivity, verzió, uptime, aktív task lockok.

**Auth**: Nem kötelező

---

### `GET /api/stats`

Dashboard statisztikák: L1/L2/L3 rétegek, dreamer statisztikák, health score.

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `GET /api/activity`

Aktivitás idővonal (legutóbbi események).

**Auth**: Dev: nem kötelező · Prod: kötelező

---

### `GET /api/search`

Globális keresés tények, döntések, preferenciák, brief-ek között.

**Auth**: Dev: nem kötelező · Prod: kötelező

**Query paraméterek**: `q` (keresési kifejezés)