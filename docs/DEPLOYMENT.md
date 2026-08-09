# OneBrainer — Deployment útmutató

> **Összefoglaló**: Ez a dokumentum az OneBrainer SaaS alkalmazás telepítését, konfigurálását és üzemeltetését írja le. A rendszer Next.js 16 standalone output-tal, SQLite adatbázissal és Prisma ORM-mel működik.

---

## Tartalomjegyzék

0. [Egyetlen példány](#egyetlen-példány)
1. [Előfeltételek](#előfeltételek)
2. [Environment változók](#environment-változók)
3. [Telepítés](#telepítés)
4. [Build folyamat](#build-folyamat)
5. [Dev vs Production különbségek](#dev-vs-production-különbségek)
6. [Migration kezelés](#migration-kezelés)
7. [Seed adatok](#seed-adatok)
8. [Fordított proxy (Caddy)](#fordított-proxy-caddy)
9. [Üzemeltetés](#üzemeltetés)

---

## Egyetlen példány

**Ezt a rendszert egyetlen példányban kell futtatni.** Nem ajánlás, hanem
következmény: az adat egyetlen SQLite fájlban van, amibe egyszerre egy író fér
hozzá. Aki két konténert indít ugyanarra a kötetre, az nem duplázza a
kapacitást, hanem elrontja a következő három dolgot — és mindhárom **némán**
romlik el, hibaüzenet nélkül:

| Mi | Mi történik két példánynál |
|----|----------------------------|
| **Rate limit** (`src/lib/rate-limiter.ts`) | Példányonként külön számol → a tényleges limit a beállított **szorozva a példányszámmal**. Újraindításkor nullázódik. |
| **Task lock** (`src/lib/task-lock.ts`) | Példányonként külön → a Librarian vagy a Dreamer **párhuzamosan is elindulhat** ugyanarra a workspace-re, duplikált tényeket és fölösleges LLM-költséget termelve. |
| **SQLite írás** | `database is locked` hibák terhelés alatt. |

Amit **nem** érint: a session (JWT, állapotmentes), a jelszó-visszaállító
tokenek (2026-08-09 óta adatbázisban) és maga a tudásbázis.

Ha vízszintesen kell skálázni, a sorrend: **előbb Postgres**, és csak utána
megosztott rate limit és task lock (Redis vagy tábla). Fordítva nincs értelme —
megosztott lock egy nem megosztott adatbázis fölött csak látszat.

---

## Előfeltételek

| Követelmény | Verzió | Megjegyzés |
|-------------|--------|------------|
| Node.js / Bun | Node 18+ vagy Bun 1.3+ | Ajánlott: Bun (gyorsabb) |
| SQLite | Beépített Prisma-ban | Fájl alapú (`file:` URL) |
| Git | Bármely | Forráskód kezelés |
| Caddy (opcionális) | 2.x | Fordított proxy, HTTPS |

### Ajánlott hardver

| Erőforrás | Minimum | Ajánlott |
|-----------|---------|----------|
| RAM | 512 MB | 1 GB |
| CPU | 1 mag | 2 mag |
| Disk | 100 MB | 500 MB (log-okkal) |

---

## Environment változók

A projekt `.env.example` fájl tartalmazza a dokumentált sablont.

### Kötelező

| Változó | Leírás | Példa |
|---------|--------|-------|
| `DATABASE_URL` | SQLite adatbázis elérési út | `file:/app/data/onebrainer.db` |

### LLM provider (a Librarian / Dreamer / benchmark ehhez kell)

Legalább **egy** kulcs kell, különben a modellhívások beszédes hibával leállnak
(a REST API és a Brain keresés kulcs nélkül is működik). A provider automatikusan
kiderül abból, amelyik be van állítva.

| Változó | Leírás | Alapérték |
|---------|--------|-----------|
| `ANTHROPIC_API_KEY` | Kiválasztja és hitelesíti az Anthropic adaptert | — |
| `OPENAI_API_KEY` | Kiválasztja és hitelesíti az OpenAI-kompatibilis adaptert | — |
| `OPENAI_BASE_URL` | Más OpenAI-kompatibilis szerver (OpenRouter, Groq, Ollama, vLLM). Önmagában is elég — lokális szerverhez nem kell kulcs. | `https://api.openai.com/v1` |
| `LLM_PROVIDER` | Explicit provider: `anthropic` / `openai`. Felülírja az auto-detektálást. | *(auto)* |
| `LLM_MODEL` | Felülírja a provider alapmodelljét | `claude-opus-5` / `gpt-4o-mini` |

**Modell- és szolgáltatóváltás kódmódosítás nélkül.** Az OpenAI-kompatibilis adapter
szándékosan a széles kapu: bármi, ami ugyanazt az alakot beszéli, elérhető rajta —
a modell neve a `LLM_MODEL`-ben utazik.

| Cél | `OPENAI_BASE_URL` | `LLM_MODEL` példa |
|-----|-------------------|-------------------|
| OpenAI | `https://api.openai.com/v1` (alapérték) | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `z-ai/glm-5.2` |
| Groq | `https://api.groq.com/openai/v1` | *(Groq modellnév)* |
| Ollama (lokális, kulcs nélkül) | `http://localhost:11434/v1` | *(lokális modellnév)* |

### Production-ban kötelező

| Változó | Leírás | Generálás |
|---------|--------|-----------|
| `NEXTAUTH_SECRET` | JWT aláíró titok | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Publikus URL | `https://onebrainer.example.com` |

### Opcionális

| Változó | Leírás | Alapérték |
|---------|--------|-----------|
| `SCHEDULER_SECRET` | Scheduler tick endpoint auth titok | — |
| `LOG_LEVEL` | Minimális log szint | `info` (debug/info/warn/error) |
| `MCP_ALLOWED_ORIGINS` | MCP CORS engedélyezett origók (vesszővel elválasztva) | `*` (dev) |
| `NEXT_PUBLIC_APP_URL` | Publikus app URL (MCP self-reference) | — |
| `NODE_ENV` | Környezet | `development` / `production` |

### Példa `.env` fájl (production)

```env
# ===== Kötelező =====
DATABASE_URL=file:/app/data/onebrainer.db

# ===== LLM provider (egy kulcs elég) =====
ANTHROPIC_API_KEY=sk-ant-...
# vagy: OPENAI_API_KEY=sk-...
# vagy lokális szerver, kulcs nélkül: OPENAI_BASE_URL=http://localhost:11434/v1
# LLM_MODEL=claude-opus-5

# ===== Auth (production kötelező) =====
NEXTAUTH_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
NEXTAUTH_URL=https://onebrainer.example.com

# ===== Scheduler =====
SCHEDULER_SECRET=my-cron-secret-here

# ===== Logging =====
LOG_LEVEL=info

# ===== MCP =====
MCP_ALLOWED_ORIGINS=https://claude.ai,https://onebrainer.example.com

# ===== Public URL =====
NEXT_PUBLIC_APP_URL=https://onebrainer.example.com
NODE_ENV=production
```

---

## Telepítés

### 1. Forráskód letöltés

```bash
git clone <repo-url> onebrainer
cd onebrainer
```

### 2. Függőségek telepítése

```bash
bun install
# vagy
npm install
```

A `postinstall` hook automatikusan lefuttatja a `prisma generate`-t.

### 3. Környezeti változók beállítása

```bash
cp .env.example .env
# Szerkeszd az .env fájlt a fenti leírás szerint
```

### 4. Adatbázis inicializálás

```bash
# Migration-ek alkalmazása
bun run db:migrate:deploy

# Seed adatok betöltése (opcionális, de ajánlott)
bun run db:seed
```

### 5. Dev server indítás

```bash
bun run dev
```

A dashboard elérhető: `http://localhost:3000`

---

## Build folyamat

A `package.json` build scriptje:

```bash
"build": "prisma generate && next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/"
```

### Lépések sorrendje

1. **`prisma generate`** — Prisma Client generálás a séma alapján
2. **`next build`** — Next.js standalone build (`output: "standalone"` a `next.config.ts`-ben)
3. **`cp -r .next/static`** — Statikus fájlok másolása a standalone könyvtárba
4. **`cp -r public`** — Public mappa másolása a standalone könyvtárba

> **A build NEM migrál.** Korábban a `prisma migrate deploy` a build része volt, a
> Dockerfile-ban ráadásul `|| true`-val. Ez két okból rossz: egy build ne írjon
> adatbázisba, a Docker builder stage-ben pedig **nincs is adatbázis** (a `db/` a
> `.dockerignore`-ban van, az éles fájl futásidőben mountolódik) — vagyis a parancs
> a semmire futott, elbukott, a `|| true` elnyelte, és **az éles adatbázis soha nem
> lett migrálva**. A konténer elindult egy régebbi sémára, és később, futásidőben
> hasalt el az első olyan kérésnél, ami hiányzó oszlopot érintett.
>
> A migráció mostantól **indításkor** fut, `|| true` nélkül: ha nem megy át, a
> szolgáltatás nem indul el. Rossz sémán futó szerver rosszabb, mint egy leállt
> szerver, mert úgy néz ki, mintha működne.

### Production indítás

Docker esetén semmi teendő — a `docker-entrypoint.sh` migrál, majd indít.

Docker nélkül a migrációt indítás előtt kell futtatni:

```bash
bun run migrate:start
```

vagy kézzel:

```bash
prisma migrate deploy
NODE_ENV=production bun .next/standalone/server.js
```

A server alapértelmezetten a 3000-es porton hallgat.

---

## Dev vs Production különbségek

| Aspektus | Development | Production |
|----------|-------------|------------|
| **Parancs** | `bun run dev` | `bun run start` |
| **Build** | Nincs (Turbopack JIT) | `bun run build` |
| **NEXTAUTH_SECRET** | Hardcoded dev secret | **Kötelező** (else throw) |
| **NEXTAUTH_URL** | `http://localhost:3000` | **Kötelező** |
| **Auth** | Nem kötelező (workspace 1 fallback) | Kötelező minden API route-n |
| **DB query log** | Igen (`log: ['query']`) | Nem |
| **Logger** | Színes emberi formátum | JSON (log aggregációhoz) |
| **Scheduler cron** | Kikapcsolva (Turbopack védelem) | Aktív (croner) |
| **API self-call** | Nincs | Nincs |
| **TypeScript** | `ignoreBuildErrors: true` | Build (`next build`) szintén ignore |
| **React Strict Mode** | Kikapcsolva | Kikapcsolva |

---

## Migration kezelés

A projekt `prisma migrate` infrastruktúrát használ (baseline migration: `0_init`).

### Új migration létrehozása (fejlesztés)

```bash
bun run db:migrate:dev --name leiras
```

Ez a parancs:
1. Létrehoz egy új migration SQL fájlt a `prisma/migrations/` könyvtárban
2. Interaktívan megerősíti a migration-t
3. Frissíti az adatbázist
4. Újragenerálja a Prisma Client-et

### Migration alkalmazása (production)

```bash
bun run db:migrate:deploy
```

Non-interactive — csak a még nem alkalmazott migration-eket futtatja.

### Migration státusz ellenőrzése

```bash
bun run db:migrate:status
```

### Adatbázis reset (fejlesztés only!)

```bash
bun run db:reset
```

**Figyelem**: Ez törli az összes adatot és újra futtatja a seed scriptet!

### Régi `db:push` vs új `migrate`

A korábbi verziók `prisma db push`-t használtak, ami nem hagy migration history-t. A `db:push` script még elérhető, de **production-ban ne használd** — nincs rollback lehetőség, nincs history, a destruktív változások nem detektálhatók.

---

## Seed adatok

A seed script (`prisma/seed.ts`) létrehozza a demo workspace alapadatokat:

| Entitás | Mennyiség | Leírás |
|---------|-----------|--------|
| User | 1 | `demo@onebrainer.ai` (Demo User) |
| Workspace | 1 | "Demo Brain" (plan: pro) |
| WorkspaceSettings | 1 | Scheduler alapbeállítások |
| Agents | 5 | claude-web (owner), claude-code (worker), orchestrator, glm-worker-1 (worker), librarian — **kulcsonként friss véletlen API-kulcs, egyszer kiírva** |
| Preferences | 7 | Kódolási stílus, PR review, commit convention, stb. |
| Ledger | 12 | Strukturált JSON digest bejegyzések |
| Facts | 18 | Tények 6 témában (backend, frontend, infra, auth, testing, CI/CD) |
| Decisions | 6 | Aktív és completed döntések |
| ProjectState | 5 | Volatilis állapot kulcsok |
| Disputes | 3 | Nyitott és megoldott viták |
| Briefs | 3 | Tudás összefoglalók (delta-brief formátum) |
| LibrarianRuns | 5 | Múltbeli librarian futtatások |
| Associations | 12 | Tények közötti neurális linkek |
| Sparks | 8 | Dreamer generált insight-ok |
| SparkWeights | 5 | Bandit-loop súlyok |
| Insights | 8 | Pre-seeded brain insight-ok |
| Consents (GDPR) | 4 | data_processing, analytics, marketing, essential |
| AuditLogs | 5 | GDPR audit bejegyzések |
| Contests | 3 | 2 aktív, 1 befejezett |
| Challenges | 10 | Versenyfeladatok |
| Achievements | 3 | knowledge-builder, well-connected, brain-awake |

### Seed futtatása

```bash
bun run db:seed
```

A seed minden agenthez **friss véletlen API-kulcsot** generál, és csak a SHA-256
hash-t tárolja — a plaintext egyszer jelenik meg a kimeneten, pontosan úgy, ahogy a
`POST /api/agents` viselkedik. Mentsd el őket futtatáskor; utólag nem visszanyerhetők,
csak új kulcsot lehet kiadni:

```
=== Agent API keys (shown once — store them now) ===
  claude-web       owner         ob_3f9a…
  claude-code      worker        ob_71c4…
  ...
```

Használat: `Authorization: Bearer <kulcs>` a `POST /api/mcp` ellen.

### Seed újrafuttatása

```bash
bun run db:reset  # Teljes reset + seed
```

---

## Fordított proxy (Caddy)

A projekt tartalmaz egy `Caddyfile`-t, amely HTTPS terminációt és fordított proxy-t biztosít.

### Alap Caddyfile

```
:81 {
    reverse_proxy localhost:3000 {
        header_up Host {host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }
}
```

### Port átirányítás (fejlesztői)

A Caddyfile támogat dinamikus port átirányítást:

```
:81 {
    @transform_port_query {
        query XTransformPort=*
    }
    handle @transform_port_query {
        reverse_proxy localhost:{query.XTransformPort}
    }
    handle {
        reverse_proxy localhost:3000
    }
}
```

---

## Üzemeltetés

### Health check

```bash
curl http://localhost:3000/api/health
```

Válasz:

```json
{
  "status": "ok",
  "version": "5.2.0",
  "uptime": 3600,
  "db": "connected",
  "checks": { "factTableAccessible": true },
  "activeTaskLocks": []
}
```

### Scheduler

A scheduler automatikusan indul a production build-ben (`getScheduler()` lazy init). Cron job-okat a `/api/settings` endpointon keresztül lehet konfigurálni.

Külső cron trigger (opcionális):

```bash
curl -X POST http://localhost:3000/api/scheduler/tick \
  -H "Authorization: Bearer $SCHEDULER_SECRET"
```

**Timing-safe**: A titok összehasonlítás `crypto.timingSafeEqual`-t használ.

### Log szintek

```bash
LOG_LEVEL=debug bun run start   # Minden log
LOG_LEVEL=warn bun run start    # Csak warning + error
LOG_LEVEL=error bun run start   # Csak error
```

### Dev server auto-restart

A `start.sh` egy végtelen ciklus, amely újraindítja a dev server-t ha az összeomlik:

```bash
#!/bin/bash
cd /home/z/my-project
while true; do
  bun run dev
  sleep 2
done
```

### NPM script összefoglaló

| Script | Parancs | Leírás |
|--------|---------|--------|
| `dev` | `next dev -p 3000` | Dev server (Turbopack) |
| `build` | `prisma generate && next build` | Production build (nem migrál) |
| `migrate:start` | `prisma migrate deploy && bun .next/standalone/server.js` | Migrálás, majd indítás Docker nélkül |
| `start` | `node .next/standalone/server.js` | Production server |
| `lint` | `eslint .` | Kódellenőrzés |
| `db:generate` | `prisma generate` | Prisma Client generálás |
| `db:migrate:dev` | `prisma migrate dev` | Interaktív migration (dev) |
| `db:migrate:deploy` | `prisma migrate deploy` | Migration alkalmazás (prod) |
| `db:migrate:status` | `prisma migrate status` | Migration státusz |
| `db:push` | `prisma db push` | Séma push (⚠️ production-ban ne használd) |
| `db:reset` | `prisma migrate reset` | Teljes DB reset |
| `db:seed` | `bun run prisma/seed.ts` | Seed adatok betöltése |
| `postinstall` | `prisma generate` | Automatikus client gen (install után) |