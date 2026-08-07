# OneBrainer — Spec v2

**Kurált, többrétegű memória-rendszer multi-instance AI-orchestrationhöz — asszociációs motorral.**

Alaptézis: *a memória minősége íráskor dől el, nem olvasáskor.* A rendszer nem storage + search, hanem szerkesztett tudás: nyers napló (L1) → kurált kanonikus réteg (L2, kizárólag a Librarian írja) → összeszerelt brief-ek (L3, ezt fogyasztja minden agent). Erre épül rá a **Dreamer**: egy éjszakai asszociációs folyamat, ami távoli tudásdarabokat ütköztet és naponta legfeljebb egy szikrát ad.

Külön szolgáltatás, saját domainen (domain parkolva a termékesítési kapuig). A SaaS-repóktól (MCOS Engine, bernap) teljesen független. A MARKETINGOS dashboardba **read-only** kötve (brief-nézet + dispute-inbox), a write-path érintetlen.

**Változások v1 → v2:**
1. **Delta-brief:** a `brief()` a kurált L3 mellé hozzáfűzi a még feldolgozatlan L1-farkat, címkézve — a Librarian-futások közti freshness-lyuk bezárul.
2. **Strukturált `log()`:** a digest kényszerített mezőkkel megy be, nem szabad szövegként — a Librarian extrakciós minősége ezen áll.
3. **Cold-start seed:** egyszeri bootstrap-ingest a meglévő anyagokból az 1. estén.
4. **Dreamer** (7. este): sparks tábla, éjszakai ütköztetés fix budgettel, rating-visszacsatolás, kill-kritérium.

---

## 1. Architektúra

```
┌──────────────────────────────────────────────────────┐
│  Fogyasztók: Claude (web/Code), Orchestrator, GLM     │
│  worker — mind MCP-n keresztül, scope-olt kulccsal    │
└──────────────┬───────────────────────┬────────────────┘
               │ read: brief()         │ write: log()
               ▼                       ▼
        ┌─────────────┐         ┌────────────┐
        │ L3: BRIEF   │◄────────│ L1: LEDGER │  append-only
        │ + nyers farok│  build  │ (nyers)    │
        └─────────────┘         └─────┬──────┘
               ▲                      │ éjszakai / on-demand
               │                      ▼
        ┌──────┴───────────────────────────┐
        │ L2: KANONIKUS                     │
        │ facts · decisions · preferences   │
        │ · project_state · disputes        │
        │ Egyetlen író: a LIBRARIAN         │
        └──────────────┬────────────────────┘
                       │ éjszaka, Librarian után
                       ▼
        ┌───────────────────────────────────┐
        │ DREAMER: távoli elemek ütköztetése │
        │ → sparks (max 1/nap a briefbe)     │
        └───────────────────────────────────┘
```

**L1 — Ledger.** Session-digestek, append-only, soha nem törlődik. Audit trail + a Librarian nyersanyaga.

**L2 — Kanonikus réteg.** Típusozott, kis méretű, magas minőségű. Session közvetlenül SOHA nem ír ide — csak a Librarian, illetve Barni explicit ruling-ja (dispute-feloldás).

**L3 — Brief.** Projektenként/témánként összeszerelt kontextus-dokumentum, cache-elt. Kiszolgáláskor kétrétegű: kurált törzs + nyers farok (lásd 3. szakasz).

**Librarian.** Aszinkron folyamat a GLM flat planen (cron: éjszakai + on-demand). Feladatai: L1-digestek feldolgozása → L2-frissítés, supersede-láncok, lejárat-flagelés, dispute-detektálás, decision-review kitűzés, L3-újraépítés. Ellentmondásnál **nem dönt — flagel.**

**Dreamer.** Második éjszakai folyamat, a Librarian után fut. Nem kurál: nyitott szálakat és friss döntéseket ütköztet MÁS topicok kanonikus elemeivel, brutális szűrővel. Kimenete a `sparks` tábla; a másnapi brief tetejére legfeljebb EGY szikra kerül. A rating-visszacsatolásból tanulja, mely párosítások termelnek találatot (bandit-loop).

---

## 2. Séma (SQLite, FTS5)

```sql
-- L1: nyers napló
CREATE TABLE ledger (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  agent_id TEXT NOT NULL,            -- claude-web, claude-code, orchestrator, glm-worker
  topic TEXT NOT NULL,               -- pl. 'mcos-engine', 'onebrainer', 'personal', 'mehes'
  kind TEXT NOT NULL DEFAULT 'digest',  -- digest | note | event | seed
  content TEXT NOT NULL,             -- strukturált digest JSON-ként (lásd log() szerződés)
  processed INTEGER DEFAULT 0        -- Librarian feldolgozta-e
);

-- L2: tények (lejárattal, forrással, supersede-lánccal)
CREATE TABLE facts (
  id INTEGER PRIMARY KEY,
  topic TEXT NOT NULL,
  entity TEXT NOT NULL,              -- miről (pl. 'glm-5.2', 'barion-integracio')
  attribute TEXT NOT NULL,           -- milyen tulajdonság (pl. 'default-worker-role')
  statement TEXT NOT NULL,           -- az állítás, EGY mondat
  confidence TEXT NOT NULL DEFAULT 'medium',  -- high | medium | low
  source TEXT,                       -- ledger.id vagy 'barni-direct'
  valid_from TEXT NOT NULL DEFAULT (datetime('now')),
  review_at TEXT,                    -- eddig érvényes felülvizsgálat nélkül
  superseded_by INTEGER REFERENCES facts(id),  -- NULL = élő
  stale INTEGER DEFAULT 0
);
-- Kulcs-ütközés: (topic, entity, attribute) élő rekordból csak egy lehet.

-- L2: döntések (kalibrációs hurokkal)
CREATE TABLE decisions (
  id INTEGER PRIMARY KEY,
  topic TEXT NOT NULL,
  decision TEXT NOT NULL,
  rationale TEXT NOT NULL,
  decided_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'active',  -- active | superseded | failed | completed
  superseded_by INTEGER REFERENCES decisions(id),
  review_at TEXT,                    -- mikor esedékes a kimenet-review
  outcome TEXT,
  outcome_at TEXT,
  lesson TEXT
);

-- L2: preferenciák
CREATE TABLE preferences (
  id INTEGER PRIMARY KEY,
  scope TEXT NOT NULL,               -- 'global' vagy topic
  statement TEXT NOT NULL,
  active INTEGER DEFAULT 1
);

-- L2: projekt-state (volatilis, TTL-lel)
CREATE TABLE project_state (
  id INTEGER PRIMARY KEY,
  topic TEXT NOT NULL,
  key TEXT NOT NULL,                 -- 'current-sprint', 'blocker', 'open-thread:*'
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  UNIQUE(topic, key)
);

-- Ellentmondások: workflow-objektum
CREATE TABLE disputes (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  topic TEXT NOT NULL,
  existing_ref TEXT NOT NULL,        -- 'facts:42' / 'decisions:7'
  incoming TEXT NOT NULL,            -- az új, ütköző állítás (ledger-refekkel)
  detected_by TEXT NOT NULL,         -- 'key-collision' | 'librarian-semantic'
  status TEXT NOT NULL DEFAULT 'open',
  ruling TEXT,
  resolved_at TEXT
);

-- L3: brief cache (kurált törzs; a nyers farok kiszolgáláskor fűződik hozzá)
CREATE TABLE briefs (
  topic TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  built_at TEXT NOT NULL,
  dirty INTEGER DEFAULT 0
);

-- DREAMER: szikrák
CREATE TABLE sparks (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  seed_ref TEXT NOT NULL,            -- a mag: 'project_state:12' (nyitott szál) / 'decisions:7'
  paired_ref TEXT NOT NULL,          -- a távoli elem: 'facts:88' (MÁS topicból)
  seed_topic TEXT NOT NULL,
  paired_topic TEXT NOT NULL,
  insight TEXT NOT NULL,             -- a szikra szövege: az átvihető mechanizmus, 2-3 mondat
  kind TEXT NOT NULL,                -- mechanism-transfer | analogy | hidden-contradiction
  score REAL NOT NULL,               -- a Dreamer-szűrő önértékelése (0-1), küszöb alatt be sem kerül
  delivered_at TEXT,                 -- mikor került briefbe (NULL = még sorban)
  rating INTEGER                     -- 1 = talált, 0 = nem talált, NULL = nincs visszajelzés
);

-- DREAMER: párosítási súlyok (bandit-loop állapota)
CREATE TABLE spark_weights (
  topic_pair TEXT PRIMARY KEY,       -- 'mcos-engine|mehes' (rendezett)
  trials INTEGER DEFAULT 0,
  hits INTEGER DEFAULT 0
);

-- Agent-szerződések (RBAC)
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  role TEXT NOT NULL                 -- owner | orchestrator | worker | librarian
);

CREATE VIRTUAL TABLE mem_fts USING fts5(content, ref);  -- facts+decisions+ledger indexelve
```

---

## 3. Tool-szerződések (MCP)

A regisztráció **role-szűrt** — a katalógusban csak az jelenik meg, amit a szerep láthat (regisztráció-szintű kapuzás, a `BM_MCP_ALLOW_WRITE` minta általánosítása).

| Tool | Mit csinál | owner | orch. | worker |
|---|---|---|---|---|
| `brief(topic)` | delta-brief: L3 + nyers farok + dispute-ok + esedékes review-k + max 1 szikra | ✅ | ✅ | ✅ |
| `log(topic, digest)` | strukturált digest az L1-be (séma lentebb) | ✅ | ✅ | ✅ |
| `open_threads(topic)` | élő project_state + nyitott szálak | ✅ | ✅ | ✅ |
| `search(query, topic?)` | FTS fallback, ha a brief nem elég | ✅ | ✅ | ✅ |
| `assert(topic, entity, attribute, statement, review_days?)` | tény-javaslat → kulcs-ütközésnél azonnal dispute | ✅ | ✅ | ❌ |
| `decide(topic, decision, rationale, review_days?)` | döntés rögzítése | ✅ | ✅ | ❌ |
| `set_state(topic, key, value, ttl_days?)` | projekt-state frissítés | ✅ | ✅ | ✅ |
| `resolve_dispute(id, ruling)` | ruling → vesztes supersede, győztes él | ✅ | ❌ | ❌ |
| `review_decision(id, outcome, lesson?)` | kalibrációs hurok zárása | ✅ | ❌ | ❌ |
| `rate_spark(id, hit)` | szikra-visszajelzés (1/0) → spark_weights frissül | ✅ | ❌ | ❌ |

### A `brief()` kiszolgálási szerződése (delta-brief)

```
brief(topic) =
  [SZIKRA]     max 1 kézbesítetlen spark, ha van (csak owner-hívásnál)
  [ESEDÉKES]   nyitott dispute-ok + lejárt decision-review-k
  [KURÁLT]     L3 törzs (Librarian-jóváhagyott kanonikus kép)
  --- NYERS, még nem kurált (utolsó Librarian-futás óta) ---
  [FAROK]      SELECT content FROM ledger
               WHERE topic=? AND processed=0 ORDER BY ts
```

A címkézés kötelező: a fogyasztó agent tudja, hogy a törzs szerkesztett igazság, a farok friss-de-nyers. Így az eventually consistent lag nem hazugság, hanem látható tulajdonság — a délutáni worker látja a reggeli döntést, mielőtt a Librarian kanonizálta volna. Mellékhatás: a kurálás előtti anyag minden olvasásnál szem előtt van → a Librarian hibái beemelés ELŐTT buknak ki.

### A `log()` szerződése (strukturált digest)

A digest nem szabad szöveg — kényszerített JSON, mert az egész downstream minőség plafonja a digest minősége:

```json
{
  "happened":    ["mi történt, tömör pontokban"],
  "decided":     [{"decision": "...", "rationale": "..."}],
  "open":        ["mi maradt nyitva / következő lépés"],
  "fact_candidates": [{"entity": "...", "attribute": "...", "statement": "..."}],
  "free":        "opcionális szabad megjegyzés"
}
```

Minden mező lehet üres, de a szerkezet kötelező. A Librarian extrakciója így nagyrészt validálás, nem találgatás.

### Viselkedési szerződések

- **Session-indítás:** minden agent első hívása `brief(topic)`.
- **Session-zárás:** `log()` strukturált digest-tel. A session L2-t nem ír (kivéve owner/orchestrator explicit `assert`/`decide`, ami ütközésnél akkor is dispute-kapun megy át).
- **Worker:** olvas mindent, ír csak L1-et és state-et. L2-javaslata a digest `fact_candidates` mezőjén megy, a Librarian emeli fel, ha megállja.
- **Szikra-kézbesítés:** csak owner-brief tetején, naponta legfeljebb egy, a legmagasabb score-ú kézbesítetlen. Rating egy érintés (`rate_spark`). Kézbesítetlen szikrák 7 nap után csendben lejárnak.

---

## 4. A Librarian

Futás: cron éjszaka + on-demand (`librarian.run`). Motor: GLM 5.2 (flat plan → nulla határköltség). Pipeline:

1. **Ingest:** feldolgozatlan ledger-sorok topiconként.
2. **Extrakció/validálás:** a strukturált digestből tény-/döntés-jelöltek, state-változások (prompt lentebb).
3. **Ütközés-ellenőrzés:** kulcs-ütközés determinisztikusan (topic+entity+attribute); szemantikus ütközés LLM-hívással az érintett topic élő tényei ellen. Ütközés → dispute, NEM felülírás.
4. **Karbantartás:** `review_at` lejárta → `stale=1`; lejárt project_state archiválás; esedékes decision-review-k kitűzése.
5. **Brief-rebuild:** dirty topicok L3-a újraépül (kanonikus tények + élő döntések + preferenciák + state + nyitott szálak, max ~1500 token/topic), `processed=1`.
6. **Riport:** egy soros összefoglaló (új tények, dispute-ok, stale-arány).

### Librarian-prompt v1

```
Te a OneBrainer Librarianje vagy — könyvtáros, nem döntéshozó.

Feladatod: az alábbi strukturált session-digestekből validálni és a
kanonikus tudásba emelni az arra érdemes elemeket. Szigorú vagy: a
kanonikus réteg kicsi és megbízható, nem teljes.

TÉNY az, ami: (a) állítás a világról vagy a rendszerről, (b) várhatóan
hetekig-hónapokig érvényes, (c) entity+attribute párra bontható.
NEM tény: vélemény, hangulat, egyszeri esemény, folyamatban lévő munka
állása (az state), terv (az döntés vagy nyitott szál).

DÖNTÉS az, ami: kimondott választás alternatívák között, indoklással.
Ha az indoklás hiányzik, "rationale: nem rögzített" — ne találj ki.

Minden elemhez: topic, entity, attribute (tényeknél), statement (EGY
mondat), javasolt review_days (volatilis: 30-60, stabil: 90-180,
strukturális: 365), forrás ledger-id.

Ütközés-gyanú: ha egy állítás tartalmilag ellentmond a mellékelt élő
kanonikus tényeknek — más szavakkal is —, NE írd felül: DISPUTE,
mindkét oldal hivatkozásával.

Ha bizonytalan vagy, hogy valami tény-e: nem az. Marad az L1-ben.

Kimenet: szigorú JSON, semmi más.
{ "facts": [...], "decisions": [...], "state_changes": [...],
  "disputes": [...], "open_threads": [...] }
```

---

## 5. A Dreamer

**Mit csinál:** a REM-alvás inkubációs mechanizmusának leképezése — nyitott problémákat távoli tudásdarabokkal ütköztet, és csak a szikrát adja tovább. Nem memória-funkció, hanem asszociációs motor: Barni innovációs elve (két meglévő kombinálása / mechanizmus-import másik iparágból) cron jobbá alakítva.

**Futás:** éjszakai cron, a Librarian UTÁN (friss kanonikus képen dolgozik). Motor: GLM flat plan.

**Pipeline (fix budget, nincs kombinatorikus robbanás):**

1. **Magok:** élő `open-thread:*` state-ek + elmúlt 14 nap döntései. Max 6 mag/éjszaka.
2. **Párosítás:** magonként max 5 távoli elem — kanonikus tények/döntések **MÁS topicból**, spark_weights-súlyozott véletlen mintavétellel (ε-greedy: 70% a jól teljesítő topic-párokból, 30% tiszta véletlen a felfedezéshez). Összesen max 30 pár/éjszaka.
3. **Szűrő:** minden párra egy hívás a lenti prompttal. Küszöb: score ≥ 0.7 kerül a sparks-ba. Elvárt áteresztés: a párok ~95%-a hulljon ki. Ha egy éjszaka 3-nál több megy át, a küszöb automatikusan emelkedik — a szűkösség feature.
4. **Kézbesítés:** másnapi owner-brief tetején a legmagasabb score-ú EGY szikra.
5. **Tanulás:** `rate_spark` → spark_weights (trials/hits) frissül. 3 hónap alatt a rendszer Barni asszociációs ízlésére kalibrálódik.

### Dreamer-prompt v1

```
Két, egymástól független kontextusból származó elemet kapsz:
MAG (nyitott probléma vagy friss döntés) és TÁVOLI ELEM (másik
területről származó tény vagy tanulság).

Egyetlen kérdés: van-e a kettő között ÁTVIHETŐ MECHANIZMUS, valódi
szerkezeti analógia, vagy REJTETT ELLENTMONDÁS?

Szigorú vagy. NEM elég: közös tulajdonság, felszíni hasonlóság,
"mindkettő rendszer", metafora. CSAK az számít, ahol a távoli elem
mechanizmusa konkrétan alkalmazható a mag problémájára, vagy ahol a
kettő együtt olyan ellentmondást tár fel, ami külön nem látszik.

Ha nem NYILVÁNVALÓAN igen → {"spark": false}. A párok túlnyomó
többségénél ez a helyes válasz.

Ha igen:
{ "spark": true, "kind": "mechanism-transfer|analogy|hidden-contradiction",
  "score": 0.0-1.0, "insight": "2-3 mondat: MI a mechanizmus és HOGYAN
  alkalmazható — nem az, hogy 'érdekes hasonlóság'." }
```

**Kill-kritérium:** ha 6 hét után a rating-hit-arány < 10%, vagy Barni két hétig nem ratingel (= zajjá vált), a Dreamer kikapcsol. A rendszer többi része nélküle teljes értékű — a Dreamer gyertya a tortán, nem a torta.

**Várható hozam (kalibrált):** az első hetekben a szikrák 60-80%-a felszínes lesz; a reális jó kimenet havi 1-2 valódi találat. Ha az egy megelőzött hiba vagy egy architekturális belátás, az ár (egy este + nulla forint) sokszorosan megtérült.

---

## 6. Infra és bekötés

- **Tárolás:** SQLite egy fájlban, napi dump S3-ra (vagy git-alapú backup). Vektorkeresés v1-ben NINCS — a delta-brief + FTS5 mellett embedding later-if-ever.
- **MCP réteg:** vékony HTTP/stdio szerver a meglévő infrán, külön process/container. Auth v1: bearer kulcs role-onként. Az OAuth 2.0 réteg (claude.ai remote connector) külön munkadarab — ha megépül a MARKETINGOS-hoz, ez a szerver örökli.
- **Compute-budget:** Librarian + Dreamer együtt nagyságrendileg néhány tízezer token/éjszaka a GLM flat planen — kerekítési hiba a nappali worker-forgalom mellett. A Dreamer 30 pár/éjszaka kemény plafonja garantálja, hogy ez nem nő.
- **MARKETINGOS dashboard:** read-only widget — brief-nézegető + dispute-inbox (resolve gomb owner-kulccsal) + szikra-történet rating-statisztikával. A dashboard SOHA nem ír L1/L2-t közvetlenül.
- **Domain:** parkolva a termékesítési kapuig. A kód domain-agnosztikus.

---

## 7. Build-sorrend (minden este után működő rendszer)

| Este | Mit | Eredmény |
|---|---|---|
| 1 | Séma + `brief`(delta!)/`log`(strukturált)/`search`/`set_state` + **cold-start seed**: egyszeri bootstrap-ingest a meglévő anyagokból (18 fejezetes architektúra-brief, MCOS-termékréteg-brief, memória-összefoglaló) `kind='seed'` ledger-sorokként | Már holnap használható, és nem üresen indul |
| 2 | Librarian v1: ingest + extrakció + brief-rebuild (cron) — első futása a seedet dolgozza fel | Automata distilláció, feltöltött L2 |
| 3 | Lejárat + stale-flagelés + `assert`/`decide` + role-kulcsok | Karbantartott tudás + RBAC |
| 4 | Dispute: kulcs-ütközés + szemantikus detektálás + `resolve_dispute` | Ellentmondás-workflow |
| 5 | Decision-review kitűzés + `review_decision` + brief-be tűzés | Kalibrációs hurok |
| 6 | Dashboard-widget (read-only) + backup-cron + polish | Látható + biztonságos |
| 7 | **Dreamer:** sparks + spark_weights séma, éjszakai pipeline, szűrő-prompt, `rate_spark`, brief-be kézbesítés | Asszociációs motor — CSAK ha a 3. heti leading indicator él |

## 8. Amit v2 TUDATOSAN nem csinál

- Nincs vektorkeresés, nincs embedding-infra — amíg a delta-brief + FTS nem bizonyul kevésnek.
- Nincs Brier-score / számszerű kalibráció — 30+ lezárt decision-review után értékelhető.
- Nincs multi-user, nincs tenant — ez Barni példánya. Termékesítés a 60-90 napos kapu UTÁNI döntés, MCOS-modulként.
- A Librarian nem töröl soha — csak supersede, stale-flag, archiválás.
- A Dreamer nem ír L2-t, nem kurál, nem dönt — csak szikrát ad, és kikapcsolható következmény nélkül.

## 9. Siker-mérce

- **Kapu (3. hét):** napi `brief()`-hívás megvan-e — ez kapuzza a 7. estét és minden termékesítési gondolatot.
- **Kurálás egészsége:** dispute-inbox átnézési ideje < 1 hét; stale-tények aránya az élő L2-ben < 20%.
- **Dreamer (6. héttől):** rating-hit-arány ≥ 10% ÉS aktív ratingelés — különben kill.
- **Napi teher:** ~10 mp (szikra + rating) + heti pár perc dispute-inbox. Ha ennél több kell, a rendszer rosszul hangolt — az hiba, nem tűrnivaló.
