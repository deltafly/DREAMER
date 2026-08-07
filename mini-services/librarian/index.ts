import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({
  datasources: {
    db: {
      url: 'file:../../db/custom.db',
    },
  },
});

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const daysFromNow = (d: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().replace('T', ' ').slice(0, 19);
};

interface LibrarianResult {
  factsExtracted: number;
  decisionsExtracted: number;
  disputesCreated: number;
  briefsRebuilt: number;
  staleFlagged: number;
  summary: string;
}

async function runLibrarian(): Promise<LibrarianResult> {
  const result: LibrarianResult = {
    factsExtracted: 0,
    decisionsExtracted: 0,
    disputesCreated: 0,
    briefsRebuilt: 0,
    staleFlagged: 0,
    summary: '',
  };

  const dirtyTopics = new Set<string>();

  // ===== STEP 1: Ingest unprocessed ledger rows =====
  const unprocessed = await db.ledger.findMany({
    where: { processed: false },
    orderBy: { ts: 'asc' },
  });

  if (unprocessed.length === 0) {
    result.summary = 'No unprocessed ledger entries. Checking maintenance tasks only.';
    // Still do maintenance
    await maintenanceTasks(result, dirtyTopics);
    return result;
  }

  const entriesByTopic = new Map<string, typeof unprocessed>();
  for (const entry of unprocessed) {
    const existing = entriesByTopic.get(entry.topic) || [];
    existing.push(entry);
    entriesByTopic.set(entry.topic, existing);
  }

  // ===== STEP 2: Extract candidates from each topic =====
  for (const [topic, entries] of entriesByTopic) {
    // Get existing live facts for collision detection
    const liveFacts = await db.fact.findMany({
      where: { topic, supersededBy: null },
    });

    for (const entry of entries) {
      // Simple heuristic extraction based on content patterns
      const content = entry.content;

      // Decision detection
      if (entry.kind === 'decision' || content.match(/decided to|decision:|döntés/i)) {
        const decisionMatch = content.match(/(?:decided to|decision:)\s*(.+?)(?:\.|\n)/i);
        const rationaleMatch = content.match(/(?:rationale|miért|because|reason):\s*(.+?)(?:\.|\n)/i);

        if (decisionMatch) {
          const existingDecisions = await db.decision.findMany({
            where: { topic, status: 'active' },
          });

          await db.decision.create({
            data: {
              topic,
              decision: decisionMatch[1].trim(),
              rationale: rationaleMatch ? rationaleMatch[1].trim() : 'Not recorded in digest',
              decidedAt: entry.ts,
              status: 'active',
              reviewAt: daysFromNow(60),
            },
          });
          result.decisionsExtracted++;
          dirtyTopics.add(topic);
        }
      }

      // Fact detection — look for declarative statements about entities
      const factPatterns = [
        /(?:uses?|implements?|processes?)\s+(.+)/gi,
        /(?:configured|set up|deployed)\s+(?:to\s+)?(.+)/gi,
        /(\w+(?:\s+\w+)?)\s+(?:is|are)\s+(.+)/gi,
      ];

      let factFound = false;
      for (const pattern of factPatterns) {
        const matches = [...content.matchAll(pattern)];
        for (const match of matches) {
          const statement = match[0].replace(/\.$/, '').trim();
          if (statement.length < 15 || statement.length > 200) continue;

          // Try to determine entity+attribute from the statement
          const entityGuess = entry.topic.replace(/-/g, '-');
          const attrGuess = match[1]?.split(' ')[0] || 'general';

          // Key collision check
          const collision = liveFacts.find(
            f => f.entity === entityGuess && f.attribute === attrGuess && f.supersededBy === null
          );

          if (collision) {
            // Create dispute
            await db.dispute.create({
              data: {
                createdAt: now(),
                topic,
                existingRef: `facts:${collision.id}`,
                incoming: `From ledger:${entry.id} — "${statement}"`,
                detectedBy: 'key-collision',
                status: 'open',
              },
            });
            result.disputesCreated++;
          } else {
            // Create fact
            await db.fact.create({
              data: {
                topic,
                entity: entityGuess,
                attribute: attrGuess.slice(0, 50),
                statement,
                confidence: 'medium',
                source: `ledger:${entry.id}`,
                validFrom: entry.ts,
                reviewAt: daysFromNow(60),
              },
            });
            result.factsExtracted++;
            dirtyTopics.add(topic);
          }
          factFound = true;
          break; // One fact per entry max in v1
        }
        if (factFound) break;
      }

      // Mark as processed
      await db.ledger.update({
        where: { id: entry.id },
        data: { processed: true },
      });
    }
  }

  // ===== STEP 3: Maintenance tasks =====
  await maintenanceTasks(result, dirtyTopics);

  // ===== STEP 4: Rebuild dirty briefs =====
  for (const topic of dirtyTopics) {
    await rebuildBrief(topic);
    result.briefsRebuilt++;
  }

  // Also rebuild briefs for topics with recent disputes
  const recentDisputes = await db.dispute.findMany({
    where: { status: 'open' },
    select: { topic: true },
    distinct: ['topic'],
  });
  for (const d of recentDisputes) {
    if (!dirtyTopics.has(d.topic)) {
      await rebuildBrief(d.topic);
      result.briefsRebuilt++;
    }
  }

  // Build summary
  const parts = [
    `Processed ${unprocessed.length} new ledger entries.`,
    `Extracted ${result.factsExtracted} facts, ${result.decisionsExtracted} decisions.`,
    result.disputesCreated > 0 ? `Detected ${result.disputesCreated} dispute(s).` : 'No disputes.',
    `Rebuilt ${result.briefsRebuilt} brief(s).`,
    result.staleFlagged > 0 ? `Flagged ${result.staleFlagged} stale fact(s).` : '',
  ].filter(Boolean);

  result.summary = parts.join(' ');
  return result;
}

async function maintenanceTasks(result: LibrarianResult, dirtyTopics: Set<string>) {
  const n = now();

  // Flag stale facts (past review_at)
  const staleFacts = await db.fact.findMany({
    where: {
      reviewAt: { lte: n },
      stale: false,
      supersededBy: null,
    },
  });

  for (const fact of staleFacts) {
    await db.fact.update({
      where: { id: fact.id },
      data: { stale: true },
    });
    result.staleFlagged++;
    dirtyTopics.add(fact.topic);
  }
}

async function rebuildBrief(topic: string) {
  const [facts, decisions, preferences, states, openDisputes, upcomingReviews, openThreads] = await Promise.all([
    db.fact.findMany({
      where: { topic, supersededBy: null, stale: false },
      orderBy: { id: 'asc' },
    }),
    db.decision.findMany({
      where: { topic, status: { in: ['active', 'completed'] } },
      orderBy: { decidedAt: 'desc' },
    }),
    db.preference.findMany({
      where: { active: true, OR: [{ scope: 'global' }, { scope: topic }] },
    }),
    db.projectState.findMany({
      where: { topic },
    }),
    db.dispute.findMany({
      where: { topic, status: 'open' },
      orderBy: { createdAt: 'desc' },
    }),
    db.decision.findMany({
      where: {
        topic,
        status: 'active',
        reviewAt: { lte: daysFromNow(30) },
      },
      orderBy: { reviewAt: 'asc' },
    }),
    db.projectState.findMany({
      where: { topic, key: 'open-thread' },
    }),
  ]);

  let md = `# ${topic} — Knowledge Brief\n\n`;
  md += `> Built: ${now()} · ${facts.length} facts · ${decisions.length} decisions · ${states.length} active state keys\n\n`;

  // Open disputes
  if (openDisputes.length > 0) {
    md += `## ⚠️ Open Disputes (${openDisputes.length})\n`;
    openDisputes.forEach((d, i) => {
      md += `${i + 1}. **${d.detectedBy}** — ${d.incoming.slice(0, 100)}${d.incoming.length > 100 ? '…' : ''} (${d.existingRef}, ${d.createdAt})\n`;
    });
    md += '\n';
  }

  // Decision reviews
  if (upcomingReviews.length > 0) {
    md += `## ⏰ Decision Reviews Due\n`;
    upcomingReviews.forEach(d => {
      md += `- **${d.decision.slice(0, 60)}** — Review at ${d.reviewAt}\n`;
      if (d.outcome) md += `  Outcome: ${d.outcome}\n`;
    });
    md += '\n';
  }

  // Facts
  if (facts.length > 0) {
    md += `## Key Facts\n`;
    facts.forEach(f => {
      md += `- **${f.entity}** (${f.attribute}, ${f.confidence}): ${f.statement}\n`;
    });
    md += '\n';
  }

  // State
  if (states.length > 0) {
    md += `## Current State\n`;
    states.forEach(s => {
      md += `- **${s.key}**: ${s.value}\n`;
    });
    md += '\n';
  }

  // Preferences
  const topicPrefs = preferences.filter(p => p.scope === topic);
  if (topicPrefs.length > 0) {
    md += `## Preferences\n`;
    topicPrefs.forEach(p => {
      md += `- ${p.statement}\n`;
    });
    md += '\n';
  }

  const content = md.trim();

  await db.brief.upsert({
    where: { topic },
    update: { content, builtAt: now(), dirty: false },
    create: { topic, content, builtAt: now(), dirty: false },
  });
}

// ===== HTTP SERVER =====
const PORT = 3010;

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'librarian', port: PORT });
    }

    // Trigger run
    if (url.pathname === '/run' && req.method === 'POST') {
      const runStart = now();

      const run = await db.librarianRun.create({
        data: {
          startedAt: runStart,
          status: 'running',
        },
      });

      try {
        const result = await runLibrarian();

        await db.librarianRun.update({
          where: { id: run.id },
          data: {
            endedAt: now(),
            status: 'completed',
            summary: result.summary,
            factsExtracted: result.factsExtracted,
            decisionsExtracted: result.decisionsExtracted,
            disputesCreated: result.disputesCreated,
            briefsRebuilt: result.briefsRebuilt,
            staleFlagged: result.staleFlagged,
          },
        });

        return Response.json({
          success: true,
          runId: run.id,
          ...result,
        });
      } catch (error) {
        await db.librarianRun.update({
          where: { id: run.id },
          data: {
            endedAt: now(),
            status: 'failed',
            summary: error instanceof Error ? error.message : 'Unknown error',
          },
        });

        return Response.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
      }
    }

    // Status
    if (url.pathname === '/status') {
      const lastRun = await db.librarianRun.findFirst({
        orderBy: { id: 'desc' },
      });
      const unprocessed = await db.ledger.count({ where: { processed: false } });
      return Response.json({
        lastRun,
        unprocessedEntries: unprocessed,
        ready: lastRun?.status !== 'running',
      });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
});

console.log(`📚 OneBrainer Librarian service running on port ${PORT}`);