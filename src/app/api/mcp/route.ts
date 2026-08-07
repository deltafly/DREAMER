import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { executeBrainQuery } from '@/lib/brain-query';
import { getNeuralStats } from '@/lib/brain-stats';
import { getKnowledgeGaps } from '@/lib/brain-gaps';
import { generateInsights } from '@/lib/brain-insights';
import { getKnowledgeGraph } from '@/lib/brain-graph';
import { extractClientIp, rateLimit } from '@/lib/rate-limiter';

// ===================================================================
// MCP (Model Context Protocol) Server — OneBrainer Brain Extension
// Compatible with Claude Desktop & OpenAI (via MCP adapters)
// Transport: Streamable HTTP (MCP 2025-03-26 spec)
// ===================================================================

const MCP_VERSION = '2025-03-26';

// ===== CORS Configuration =====
const MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS
  ? process.env.MCP_ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : process.env.NODE_ENV === 'production'
    ? [] // Production: must be explicitly configured
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

function getAllowedOrigin(request: NextRequest): string {
  const origin = request.headers.get('origin') || '';
  if (MCP_ALLOWED_ORIGINS.includes('*')) return '*';
  if (MCP_ALLOWED_ORIGINS.includes(origin)) return origin;
  return '';
}

function mcpCorsHeaders(request: NextRequest): Record<string, string> {
  const allowed = getAllowedOrigin(request);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
  };
  if (allowed) headers['Access-Control-Allow-Origin'] = allowed;
  return headers;
}

// ===== JSON-RPC Types =====
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: number | string | null;
  result: unknown;
}

interface JsonRpcError {
  jsonrpc: '2.0';
  id: number | string | null;
  error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

// ===== MCP Tool Definitions =====
const MCP_TOOLS = [
  {
    name: 'brain_query',
    description:
      'Neural memory retrieval using spreading activation. Query the OneBrainer brain for relevant facts, decisions, and knowledge. The brain uses Hebbian learning — associations that fire together get stronger. Returns results ranked by neural activation score with explanations of how each fact was activated.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query to search the brain\'s knowledge (e.g., "What is the sprint velocity?", "deployment architecture", "webhook configuration")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (1-50, default 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'add_fact',
    description:
      'Store a new fact in the brain\'s neural knowledge base. Facts are the fundamental unit of knowledge — each has a topic, entity, attribute, and statement. The brain will automatically create neural associations via the Librarian when it runs.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          description: 'Knowledge domain/topic area (e.g., "backend", "frontend", "infrastructure")',
        },
        entity: {
          type: 'string',
          description: 'The thing this fact is about (e.g., "sprint-velocity", "auth-service")',
        },
        attribute: {
          type: 'string',
          description: 'Property/aspect being described (e.g., "current", "status", "config")',
        },
        statement: {
          type: 'string',
          description: 'The actual fact statement (e.g., "Sprint 4 delivered 38 story points")',
        },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Confidence level (default: "medium")',
        },
        source: {
          type: 'string',
          description: 'Where this fact came from (optional)',
        },
      },
      required: ['topic', 'entity', 'attribute', 'statement'],
    },
  },
  {
    name: 'list_topics',
    description:
      'List all knowledge topics in the brain with fact counts, decision counts, and association counts. Shows the breadth of the brain\'s knowledge coverage.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_brief',
    description:
      'Get a compiled brief for a specific topic. Briefs are auto-generated summaries that the Librarian maintains — they give a quick overview of everything the brain knows about a topic.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          description: 'The topic name to get the brief for',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'get_neural_stats',
    description:
      'Get comprehensive neural network health metrics: topology (nodes, edges, density), activation distribution, plasticity index, weight distribution, network health score, and recent activity patterns.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_knowledge_gaps',
    description:
      'The brain\'s self-awareness capability. Analyzes knowledge gaps: topics with zero facts, stale facts, sparse knowledge areas, decisions without outcomes, and unprocessed entries. Returns sorted by severity.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_insights',
    description:
      'Get brain-generated observations: patterns (velocity trends, documentation density), contradictions (conflicting facts), gaps (missing knowledge), and suggestions (stale decisions, unprocessed data). The brain thinks about its own knowledge.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_associations',
    description:
      'Get neural links (associations) between facts. Shows how different pieces of knowledge are connected in the brain\'s neural network. Each association has a weight that strengthens through Hebbian learning.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          description: 'Optional: filter by topic',
        },
      },
    },
  },
  {
    name: 'get_graph',
    description:
      'Get the full knowledge graph structure with nodes (facts, decisions, preferences), edges (associations), and topic clusters. Useful for visualizing the brain\'s neural architecture.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'run_dreamer',
    description:
      'Trigger the Dreamer — the brain\'s creative associative thinking engine. The Dreamer takes pairs of unrelated topics, collides them using an LLM, and generates novel "sparks" (insights, analogies, contradictions, opportunities). This is how the brain dreams.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'run_librarian',
    description:
      'Trigger the Librarian — the brain\'s knowledge curator. The Librarian processes raw ledger entries, extracts structured facts and decisions using AI, auto-associates new facts with existing knowledge, rebuilds topic briefs, and flags stale knowledge.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'list_decisions',
    description:
      'List all active architectural decisions in the brain. Each decision includes the topic, the decision made, its rationale, when it was decided, and optionally its outcome and lessons learned.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          description: 'Optional: filter by topic',
        },
      },
    },
  },
  {
    name: 'list_sparks',
    description:
      'List sparks generated by the Dreamer. Sparks are creative insights from cross-topic collision — analogies, contradictions, opportunities, risks, and optimization ideas that the brain dreamed up.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Max sparks to return (default 20)',
        },
      },
    },
  },
] as const;

// ===== Zod schemas for tool inputs =====
const BrainQueryInput = z.object({
  query: z.string().min(2).max(5000),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

const AddFactInput = z.object({
  topic: z.string().min(1).max(100),
  entity: z.string().min(1).max(200),
  attribute: z.string().min(1).max(200),
  statement: z.string().min(1).max(2000),
  confidence: z.enum(['high', 'medium', 'low']).optional().default('medium'),
  source: z.string().max(500).optional(),
});

const GetBriefInput = z.object({
  topic: z.string().min(1),
});

const GetAssociationsInput = z.object({
  topic: z.string().optional(),
});

const ListDecisionsInput = z.object({
  topic: z.string().optional(),
});

const ListSparksInput = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
});

// ===== Input Sanitization (prompt injection defense) =====

/**
 * Strip control characters and normalize whitespace in user-supplied strings.
 * Prevents markdown injection and control-char based attacks in MCP responses.
 */
function sanitizeString(value: unknown, maxLen = 5000): string {
  if (typeof value !== 'string') return String(value ?? '').slice(0, maxLen);
  // Remove control chars (except newline, tab) and normalize
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars
    .replace(/\r\n/g, '\n')                                     // normalize line endings
    .replace(/\t/g, '  ')                                         // tabs to spaces
    .slice(0, maxLen);
}

/**
 * Sanitize all string values in a record (tool arguments).
 */
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(v => typeof v === 'string' ? sanitizeString(v) : v);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeArgs(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Validate a resource URI to prevent injection.
 * Only allows: brain://overview, brain://topic/{alphanumeric-topic}
 */
function isValidResourceUri(uri: string): boolean {
  if (uri === 'brain://overview') return true;
  if (uri.startsWith('brain://topic/')) {
    const topic = uri.slice('brain://topic/'.length);
    // Topic must be non-empty, reasonable length, and contain only safe characters
    // Disallow: path traversal (..), slashes, dots-only, control chars
    if (topic.length === 0 || topic.length > 100) return false;
    if (topic.includes('..') || topic.includes('/') || topic.includes('\\')) return false;
    return /^[\w\-\sáéíóöőúüűÁÉÍÓÖŐÚÜŰ.]+$/.test(topic);
  }
  return false;
}

// ===== JSON-RPC helpers =====
function success(id: number | string | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function error(id: number | string | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

function mcpContent(text: string, type: 'text' | 'markdown' = 'text'): { type: string; text: string }[] {
  return [{ type, text }];
}

function mcpError(code: number, message: string, data?: unknown): never {
  throw { code, message, data };
}

// ===== Tool Handlers =====
async function handleBrainQuery(workspaceId: number, args: Record<string, unknown>) {
  const parsed = BrainQueryInput.safeParse(args);
  if (!parsed.success) mcpError(-32602, `Invalid arguments: ${parsed.error.issues.map(i => i.message).join(', ')}`);

  const { query, limit } = parsed.data;

  const data = await executeBrainQuery(workspaceId, query, { limit });

  // Format results for AI consumption
  let response = `## Brain Query Results for: "${query}"\n\n`;
  response += `**Neural activation stats:** ${data.neural.seedFacts} seed facts, ${data.neural.spreadFacts} spread facts, ${data.neural.associationsFired} associations fired, ${data.neural.hebbianUpdates} Hebbian updates (${data.neural.iterations} iterations)\n\n`;

  if (data.results.length === 0) {
    response += '*No matching facts found in the brain.*\n';
  } else {
    for (let i = 0; i < data.results.length; i++) {
      const r = data.results[i];
      response += `### ${i + 1}. ${r.fact.entity} (${r.fact.topic})\n`;
      response += `- **Statement:** ${r.fact.statement}\n`;
      response += `- **Attribute:** ${r.fact.attribute}\n`;
      response += `- **Confidence:** ${r.fact.confidence}\n`;
      response += `- **Activation:** ${r.activation} ${r.isSeed ? '(seed)' : '(spread)'}\n`;
      response += `- **Reason:** ${r.reason}\n\n`;
    }
  }

  return { content: mcpContent(response, 'text') };
}

async function handleAddFact(workspaceId: number, args: Record<string, unknown>) {
  const parsed = AddFactInput.safeParse(args);
  if (!parsed.success) mcpError(-32602, `Invalid arguments: ${parsed.error.issues.map(i => i.message).join(', ')}`);

  const { topic, entity, attribute, statement, confidence, source } = parsed.data;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  await db.fact.create({
    data: {
      topic,
      entity,
      attribute,
      statement,
      confidence,
      source: source ?? null,
      validFrom: now,
      workspaceId,
    },
  });

  return {
    content: mcpContent(`Fact stored successfully in the brain:\n\n- **Topic:** ${topic}\n- **Entity:** ${entity}\n- **Attribute:** ${attribute}\n- **Statement:** ${statement}\n- **Confidence:** ${confidence}\n\nThe Librarian will auto-associate this fact with related knowledge on its next run.`, 'text'),
  };
}

async function handleListTopics(workspaceId: number) {
  const facts = await db.fact.groupBy({
    by: ['topic'],
    where: { supersededBy: null, stale: false, workspaceId },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const decisions = await db.decision.groupBy({
    by: ['topic'],
    where: { status: 'active', workspaceId },
    _count: { id: true },
  });

  const associations = await db.association.findMany({
    where: { workspaceId },
    include: { factA: { select: { topic: true } }, factB: { select: { topic: true } } },
  });

  const topicAssocCount: Record<string, number> = {};
  for (const a of associations) {
    const tA = a.factA.topic;
    const tB = a.factB.topic;
    topicAssocCount[tA] = (topicAssocCount[tA] || 0) + 1;
    topicAssocCount[tB] = (topicAssocCount[tB] || 0) + 1;
  }

  const decisionCountMap = new Map(decisions.map(d => [d.topic, d._count.id]));
  const allTopics = new Set([...facts.map(f => f.topic), ...decisions.map(d => d.topic)]);

  let response = `## Brain Topics (${allTopics.size} total)\n\n`;
  response += `| Topic | Facts | Decisions | Associations |\n`;
  response += `|-------|-------|-----------|-------------|\n`;

  for (const f of facts) {
    const decCount = decisionCountMap.get(f.topic) ?? 0;
    const assocCount = topicAssocCount[f.topic] ?? 0;
    response += `| ${f.topic} | ${f._count.id} | ${decCount} | ${assocCount} |\n`;
  }

  // Add topics that only have decisions
  for (const d of decisions) {
    if (!facts.find(f => f.topic === d.topic)) {
      const assocCount = topicAssocCount[d.topic] ?? 0;
      response += `| ${d.topic} | 0 | ${d._count.id} | ${assocCount} |\n`;
    }
  }

  return { content: mcpContent(response, 'text') };
}

async function handleGetBrief(workspaceId: number, args: Record<string, unknown>) {
  const parsed = GetBriefInput.safeParse(args);
  if (!parsed.success) mcpError(-32602, `Invalid arguments: ${parsed.error.issues.map(i => i.message).join(', ')}`);

  const brief = await db.brief.findFirst({
    where: { topic: parsed.data.topic, workspaceId },
  });

  if (!brief) {
    // Generate an on-the-fly brief from available facts
    const facts = await db.fact.findMany({
      where: { topic: parsed.data.topic, supersededBy: null, stale: false, workspaceId },
      orderBy: { validFrom: 'desc' },
    });

    if (facts.length === 0) {
      return { content: mcpContent(`No brief found for topic "${parsed.data.topic}" and no active facts exist. This topic may need knowledge seeding.`, 'text') };
    }

    let response = `## Brief: ${parsed.data.topic}\n\n`;
    response += `*Auto-generated from ${facts.length} active fact(s)*\n\n`;
    for (const f of facts) {
      response += `- **${f.entity}** (${f.attribute}): ${f.statement} [${f.confidence}]\n`;
    }
    return { content: mcpContent(response, 'text') };
  }

  return {
    content: mcpContent(`## Brief: ${brief.topic}\n\n${brief.content}\n\n---\n*Built: ${brief.builtAt} | Dirty: ${brief.dirty ? 'Yes (needs rebuild)' : 'No'}*`, 'text'),
  };
}

async function handleGetNeuralStats(workspaceId: number) {
  const data = await getNeuralStats(workspaceId);

  let response = `## Neural Network Statistics\n\n`;
  response += `### Network Topology\n`;
  response += `- **Nodes (facts):** ${data.topology.nodes}\n`;
  response += `- **Edges (associations):** ${data.topology.edges}\n`;
  response += `- **Density:** ${data.topology.density} (${data.topology.avgConnectivity} avg connections/node)\n\n`;
  response += `### Network Health: ${data.health.score}/100 (${data.health.label})\n`;
  response += `### Plasticity Index: ${data.plasticity.index} (${data.plasticity.lastDayFires} associations fired in last 24h)\n\n`;
  response += `### Activation Distribution\n`;
  response += `- **Active facts:** ${data.activation.activeFacts}/${data.activation.totalFacts} (${Math.round(data.activation.coverage * 100)}% coverage)\n`;
  response += `- **Average activation:** ${data.activation.avgActivation}\n`;
  response += `- **Peak activation:** ${data.activation.peakActivation}\n\n`;
  response += `### Weight Distribution\n`;
  response += `- **Average:** ${data.weights.avg} | **Range:** ${data.weights.min}–${data.weights.max}\n`;
  response += `- **Buckets:** dormant=${data.weights.distribution.dormant}, weak=${data.weights.distribution.weak}, medium=${data.weights.distribution.medium}, strong=${data.weights.distribution.strong}, peak=${data.weights.distribution.peak}\n\n`;
  response += `### Top Exercised Synapses\n`;
  for (const a of data.topAssociations) {
    response += `- **${a.label}:** weight=${a.weight}, fired=${a.fireCount}x, last=${a.lastFired ?? 'never'}\n`;
  }
  response += `\n### Total Queries Processed: ${data.queries.total}\n`;

  return { content: mcpContent(response, 'text') };
}

async function handleGetKnowledgeGaps(workspaceId: number) {
  const data = await getKnowledgeGaps(workspaceId);

  if (data.gaps.length === 0) {
    return { content: mcpContent('## Knowledge Gaps Analysis\n\nNo knowledge gaps detected. The brain\'s knowledge appears complete and well-maintained.', 'text') };
  }

  let response = `## Knowledge Gaps (${data.gaps.length} found)\n\n`;

  const bySeverity = { high: data.gaps.filter((g: { severity: string }) => g.severity === 'high'), medium: data.gaps.filter((g: { severity: string }) => g.severity === 'medium'), low: data.gaps.filter((g: { severity: string }) => g.severity === 'low') };

  if (bySeverity.high.length > 0) {
    response += `### 🔴 High Severity (${bySeverity.high.length})\n`;
    for (const g of bySeverity.high) {
      response += `- **[${g.topic}]** ${g.missing}\n  > ${g.suggestion}\n\n`;
    }
  }

  if (bySeverity.medium.length > 0) {
    response += `### 🟡 Medium Severity (${bySeverity.medium.length})\n`;
    for (const g of bySeverity.medium) {
      response += `- **[${g.topic}]** ${g.missing}\n  > ${g.suggestion}\n\n`;
    }
  }

  if (bySeverity.low.length > 0) {
    response += `### 🟢 Low Severity (${bySeverity.low.length})\n`;
    for (const g of bySeverity.low) {
      response += `- **[${g.topic}]** ${g.missing}\n  > ${g.suggestion}\n\n`;
    }
  }

  return { content: mcpContent(response, 'text') };
}

async function handleGetInsights(workspaceId: number) {
  const data = await generateInsights(workspaceId);
  const insights = data.insights.filter((i: { dismissed: boolean }) => !i.dismissed);

  if (insights.length === 0) {
    return { content: mcpContent('## Brain Insights\n\nNo active insights. The brain is content.', 'text') };
  }

  let response = `## Brain Insights (${insights.length} active)\n\n`;

  const byKind = new Map<string, typeof insights>();
  for (const i of insights) {
    const list = byKind.get(i.kind) ?? [];
    list.push(i);
    byKind.set(i.kind, list);
  }

  for (const [kind, items] of byKind) {
    const emoji = { pattern: '📊', contradiction: '⚠️', gap: '🕳️', trend: '📈', suggestion: '💡' }[kind] ?? '🧠';
    response += `### ${emoji} ${kind.charAt(0).toUpperCase() + kind.slice(1)}s (${items.length})\n`;
    for (const i of items) {
      const sevIcon = i.severity === 'critical' ? '🔴' : i.severity === 'warning' ? '🟡' : '🟢';
      response += `- ${sevIcon} **${i.title}** ${i.actionable ? '(actionable)' : ''}\n  ${i.description}\n\n`;
    }
  }

  return { content: mcpContent(response, 'text') };
}

async function handleGetAssociations(workspaceId: number, args: Record<string, unknown>) {
  const parsed = GetAssociationsInput.safeParse(args);
  if (!parsed.success) mcpError(-32602, `Invalid arguments: ${parsed.error.issues.map(i => i.message).join(', ')}`);

  const where: Record<string, unknown> = { workspaceId };
  if (parsed.data.topic) {
    where.OR = [
      { factA: { topic: parsed.data.topic } },
      { factB: { topic: parsed.data.topic } },
    ];
  }

  const associations = await db.association.findMany({
    where,
    include: {
      factA: { select: { topic: true, entity: true, statement: true } },
      factB: { select: { topic: true, entity: true, statement: true } },
    },
    orderBy: { activationWeight: 'desc' },
    take: 50,
  });

  if (associations.length === 0) {
    return { content: mcpContent('## Neural Associations\n\nNo associations found in the brain\'s neural network.', 'text') };
  }

  let response = `## Neural Associations (${associations.length} links)\n\n`;
  response += `| Label | From | To | Weight | Fired | Created By |\n`;
  response += `|-------|------|----|--------|-------|-----------|\n`;

  for (const a of associations) {
    response += `| ${a.label} | ${a.factA.entity} (${a.factA.topic}) | ${a.factB.entity} (${a.factB.topic}) | ${Math.round(a.activationWeight * 100)}% | ${a.fireCount}x | ${a.createdBy} |\n`;
  }

  return { content: mcpContent(response, 'text') };
}

async function handleGetGraph(workspaceId: number) {
  const data = await getKnowledgeGraph(workspaceId);

  let response = `## Knowledge Graph\n\n`;
  response += `### Summary\n`;
  response += `- **Nodes:** ${data.nodes.length} | **Edges:** ${data.edges.length} | **Clusters:** ${data.clusters.length}\n\n`;

  response += `### Topic Clusters\n`;
  for (const c of data.clusters) {
    response += `- **${c.topic}:** ${c.count} nodes\n`;
  }

  response += `\n### Nodes\n`;
  for (const n of data.nodes) {
    const act = n.activationScore > 0 ? ` 🔥${n.activationScore}` : '';
    response += `- [${n.type}] **${n.label}** (${n.topic})${act}\n`;
  }

  response += `\n### Edges\n`;
  for (const e of data.edges) {
    response += `- ${e.source} → ${e.target}: ${e.label} (weight: ${Math.round(e.activationWeight * 100)}%, fired: ${e.fireCount}x)\n`;
  }

  return { content: mcpContent(response, 'text') };
}

async function handleRunDreamer(workspaceId: number) {
  // Dynamic import to avoid TDZ issues
  const { runDreamer } = await import('@/lib/dreamer');
  const result = await runDreamer(workspaceId);

  let response = `## Dreamer Complete\n\n`;
  response += `**Sparks generated:** ${result.sparksCreated ?? 0}\n`;
  response += `**Associations created:** ${result.associationsCreated ?? 0}\n`;
  response += `**Pairs explored:** ${result.pairsExplored ?? 0}\n`;
  response += `**Duration:** ${result.duration ?? 'N/A'}\n\n`;

  const sparks = result.sparks as Array<{ kind: string; insight: string; score: number }> | undefined;
  if (sparks && sparks.length > 0) {
    response += `### Top Sparks\n`;
    for (const spark of sparks.slice(0, 5)) {
      response += `- **[${spark.kind}]** ${spark.insight.slice(0, 200)}${spark.insight.length > 200 ? '...' : ''} (score: ${spark.score})\n`;
    }
  }

  return { content: mcpContent(response, 'text') };
}

async function handleRunLibrarian(workspaceId: number) {
  // Dynamic import to avoid TDZ issues
  const { runLibrarian } = await import('@/lib/librarian');
  const result = await runLibrarian(workspaceId);

  let response = `## Librarian Complete\n\n`;
  response += `**Facts extracted:** ${result.factsExtracted ?? 0}\n`;
  response += `**Decisions extracted:** ${result.decisionsExtracted ?? 0}\n`;
  response += `**Disputes created:** ${result.disputesCreated ?? 0}\n`;
  response += `**Briefs rebuilt:** ${result.briefsRebuilt ?? 0}\n`;
  response += `**Stale flagged:** ${result.staleFlagged ?? 0}\n`;
  response += `**Associations created:** ${result.associationsCreated ?? 0}\n`;
  response += `**Duration:** ${result.duration ?? 'N/A'}\n\n`;

  if (result.summary) {
    response += `### Summary\n${result.summary}\n`;
  }

  return { content: mcpContent(response, 'text') };
}

async function handleListDecisions(workspaceId: number, args: Record<string, unknown>) {
  const parsed = ListDecisionsInput.safeParse(args);
  if (!parsed.success) mcpError(-32602, `Invalid arguments: ${parsed.error.issues.map(i => i.message).join(', ')}`);

  const where: Record<string, unknown> = { workspaceId, status: 'active' };
  if (parsed.data.topic) where.topic = parsed.data.topic;

  const decisions = await db.decision.findMany({
    where,
    orderBy: { decidedAt: 'desc' },
    take: 30,
  });

  if (decisions.length === 0) {
    return { content: mcpContent('## Decisions\n\nNo active decisions found.', 'text') };
  }

  let response = `## Active Decisions (${decisions.length})\n\n`;

  for (const d of decisions) {
    response += `### ${d.topic}: ${d.decision.slice(0, 100)}${d.decision.length > 100 ? '...' : ''}\n`;
    response += `- **Rationale:** ${d.rationale.slice(0, 200)}${d.rationale.length > 200 ? '...' : ''}\n`;
    response += `- **Decided:** ${d.decidedAt}\n`;
    if (d.outcome) response += `- **Outcome:** ${d.outcome}\n`;
    if (d.lesson) response += `- **Lesson:** ${d.lesson}\n`;
    if (d.reviewAt) response += `- **Review at:** ${d.reviewAt}\n`;
    response += '\n';
  }

  return { content: mcpContent(response, 'text') };
}

async function handleListSparks(workspaceId: number, args: Record<string, unknown>) {
  const parsed = ListSparksInput.safeParse(args);
  if (!parsed.success) mcpError(-32602, `Invalid arguments: ${parsed.error.issues.map(i => i.message).join(', ')}`);

  const sparks = await db.spark.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: parsed.data.limit,
  });

  if (sparks.length === 0) {
    return { content: mcpContent('## Sparks\n\nNo sparks have been generated yet. Run the Dreamer to create sparks.', 'text') };
  }

  let response = `## Dreamer Sparks (${sparks.length} most recent)\n\n`;

  const byKind = new Map<string, typeof sparks>();
  for (const s of sparks) {
    const list = byKind.get(s.kind) ?? [];
    list.push(s);
    byKind.set(s.kind, list);
  }

  for (const [kind, items] of byKind) {
    response += `### ${kind} (${items.length})\n`;
    for (const s of items) {
      const rating = s.rating ? ` ⭐${s.rating}/5` : '';
      const status = s.deliveredAt ? '✅' : '⏳';
      response += `- ${status} **${s.seedTopic} × ${s.pairedTopic}** (score: ${s.score.toFixed(2)}${rating})\n  ${s.insight.slice(0, 200)}${s.insight.length > 200 ? '...' : ''}\n\n`;
    }
  }

  return { content: mcpContent(response, 'text') };
}

// ===== Tool dispatch table =====
const TOOL_HANDLERS: Record<string, (workspaceId: number, args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>> = {
  brain_query: handleBrainQuery,
  add_fact: handleAddFact,
  list_topics: handleListTopics,
  get_brief: handleGetBrief,
  get_neural_stats: handleGetNeuralStats,
  get_knowledge_gaps: handleGetKnowledgeGaps,
  get_insights: handleGetInsights,
  get_associations: handleGetAssociations,
  get_graph: handleGetGraph,
  run_dreamer: handleRunDreamer,
  run_librarian: handleRunLibrarian,
  list_decisions: handleListDecisions,
  list_sparks: handleListSparks,
};

/**
 * Authenticate an MCP request via agent API key.
 *
 * Flow:
 *  1. Check for Authorization: Bearer <key> header
 *  2. SHA-256 hash the key → look up Agent record
 *  3. If found → return workspaceId + agent info
 *  4. If no Bearer header → return null (caller should fall back to session auth)
 *  5. If Bearer present but invalid → throw AuthError
 */
async function authenticateAgentKey(request: NextRequest): Promise<{
  workspaceId: number;
  agentId: string;
  role: string;
} | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null; // No API key — let caller fall back to session
  }

  const rawKey = authHeader.slice(7); // Remove "Bearer "
  if (!rawKey) {
    return null;
  }

  // Hash with SHA-256, same format as stored in DB
  const hash = `sha256:${createHash('sha256').update(rawKey).digest('hex')}`;

  const agent = await db.agent.findFirst({
    where: { keyHash: hash },
    select: { agentId: true, role: true, workspaceId: true },
  });

  if (!agent) {
    // Bearer token was provided but doesn't match any agent
    // Return a generic error — do not reveal whether the agent exists
    logger.warn('MCP agent authentication failed: invalid API key', {
      hashPrefix: hash.slice(0, 16),
    });
    return null; // Will fall through to session auth, which will also fail
  }

  return {
    workspaceId: agent.workspaceId,
    agentId: agent.agentId,
    role: agent.role,
  };
}

// ===== Main MCP Request Handler =====
async function handleMcpRequest(request: NextRequest): Promise<JsonRpcResponse | Response> {
  // Try agent-key auth first, then fall back to session/dev auth
  const agentAuth = await authenticateAgentKey(request);
  const workspaceId = agentAuth?.workspaceId ?? await getWorkspaceId(request);

  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: invalid JSON' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { id, method, params = {} } = body;

  // Handle MCP protocol methods
  switch (method) {
    case 'initialize': {
      return success(id ?? null, {
        protocolVersion: MCP_VERSION,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: 'onebrainer-brain',
          version: '5.2.0',
          description: 'OneBrainer Neural Knowledge Brain — AI memory extension with spreading activation, Hebbian learning, dreaming, and self-awareness',
        },
      });
    }

    case 'notifications/initialized': {
      // Notification — no response needed
      return new Response(null, { status: 202 });
    }

    case 'ping': {
      return success(id ?? null, {});
    }

    case 'tools/list': {
      return success(id ?? null, {
        tools: MCP_TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    }

    case 'tools/call': {
      const toolName = params.name as string;
      // Sanitize tool name — only allow alphanumeric + underscore
      if (!/^[a-z_]+$/.test(toolName)) {
        return error(id ?? null, -32602, `Invalid tool name: must be lowercase alphanumeric with underscores`);
      }
      const toolArgs = sanitizeArgs((params.arguments as Record<string, unknown>) ?? {});

      const handler = TOOL_HANDLERS[toolName];
      if (!handler) {
        return error(id ?? null, -32601, `Unknown tool: ${toolName}. Available tools: ${Object.keys(TOOL_HANDLERS).join(', ')}`);
      }

      try {
        const result = await handler(workspaceId, toolArgs);
        return success(id ?? null, result);
      } catch (err) {
        const errObj = err as { code?: number; message?: string; data?: unknown } | Error;
        if ('code' in errObj && typeof errObj.code === 'number') {
          return error(id ?? null, errObj.code, errObj.message ?? 'Tool execution failed', errObj.data);
        }
        console.error(`[MCP] Tool ${toolName} error:`, err);
        return error(id ?? null, -32603, `Tool execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    case 'resources/list': {
      // MCP resources — expose brain state as resources
      const topics = await db.fact.groupBy({
        by: ['topic'],
        where: { supersededBy: null, stale: false, workspaceId },
        _count: { id: true },
      });

      const resources = [
        {
          uri: 'brain://overview',
          name: 'Brain Overview',
          description: 'High-level summary of the brain\'s knowledge state',
          mimeType: 'text/plain',
        },
        ...topics.map(t => ({
          uri: `brain://topic/${t.topic}`,
          name: `Topic: ${t.topic}`,
          description: `${t._count.id} active facts about ${t.topic}`,
          mimeType: 'text/plain',
        })),
      ];

      return success(id ?? null, { resources });
    }

    case 'resources/read': {
      const uri = (params.uri as string) ?? '';

      // Validate URI format to prevent injection
      if (!isValidResourceUri(uri)) {
        return error(id ?? null, -32602, `Invalid or unknown resource URI. Allowed: brain://overview, brain://topic/{topic-name}`);
      }

      if (uri === 'brain://overview') {
        const [factCount, assocCount, decisionCount, sparkCount] = await Promise.all([
          db.fact.count({ where: { supersededBy: null, stale: false, workspaceId } }),
          db.association.count({ where: { workspaceId } }),
          db.decision.count({ where: { status: 'active', workspaceId } }),
          db.spark.count({ where: { workspaceId } }),
        ]);

        const text = [
          `OneBrainer Brain — Knowledge Overview`,
          `========================================`,
          `Active Facts: ${factCount}`,
          `Neural Associations: ${assocCount}`,
          `Active Decisions: ${decisionCount}`,
          `Dreamer Sparks: ${sparkCount}`,
          ``,
          `This brain uses spreading activation and Hebbian learning.`,
          `Query it with brain_query to retrieve relevant knowledge.`,
        ].join('\n');

        return success(id ?? null, {
          contents: [{ uri, mimeType: 'text/plain', text }],
        });
      }

      if (uri.startsWith('brain://topic/')) {
        const topic = uri.replace('brain://topic/', '');
        const facts = await db.fact.findMany({
          where: { topic, supersededBy: null, stale: false, workspaceId },
          orderBy: { validFrom: 'desc' },
        });

        const text = [
          `Topic: ${topic} (${facts.length} facts)`,
          `========================================`,
          ...facts.map(f => `[${f.confidence}] ${f.entity} / ${f.attribute}: ${f.statement}`),
        ].join('\n');

        return success(id ?? null, {
          contents: [{ uri, mimeType: 'text/plain', text }],
        });
      }

      return error(id ?? null, -32602, `Unknown resource URI: ${uri}`);
    }

    default:
      return error(id ?? null, -32601, `Method not found: ${method}`);
  }
}

// ===== Next.js Route Handler =====

// MCP rate limit: 60 requests per minute per IP (generous for AI tool use)
const MCP_RATE_LIMIT = { windowMs: 60_000, maxRequests: 60 };

export async function POST(request: NextRequest) {
  // Rate limit MCP requests
  const ip = extractClientIp(request);
  const mcpRateResult = rateLimit(`mcp:${ip}`, MCP_RATE_LIMIT);
  if (!mcpRateResult.allowed) {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: 'Rate limited. Too many MCP requests.' },
      }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(mcpRateResult.retryAfterMs / 1000)) } },
    );
  }

  try {
    const response = await handleMcpRequest(request);

    // If it's already a NextResponse (for notifications), return as-is
    if (response instanceof Response) return response;

    // Return JSON-RPC response
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...mcpCorsHeaders(request),
      },
    });
  } catch (err) {
    logger.error('[MCP] Unhandled error', { err: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: 'Internal server error' },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: mcpCorsHeaders(request),
  });
}

// GET handler — returns MCP server info for discovery with all adapter schemas
export async function GET(request: NextRequest) {
  const SERVER_URL = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/mcp`
    : 'http://localhost:3000/api/mcp';

  return new Response(
    JSON.stringify({
      name: 'onebrainer-brain',
      version: '5.2.0',
      protocolVersion: MCP_VERSION,
      description: 'OneBrainer Neural Knowledge Brain — MCP Server for Claude & OpenAI',
      transport: 'streamable-http',
      endpoint: '/api/mcp',
      tools: MCP_TOOLS.map(t => t.name),
      adapters: {
        'claude-web': {
          platform: 'Claude.ai (Web)',
          type: 'custom-connector',
          transport: 'remote-mcp',
          setup: 'Customize → Connectors → "+ Add custom connector" → "Web" → paste URL',
          url: SERVER_URL,
          auth: 'optional-oauth',
          note: 'Available on Free (1 connector), Pro, Max, Team, Enterprise. Claude connects from Anthropic servers — MCP server must be publicly accessible.',
        },
        'claude-desktop': {
          platform: 'Claude Desktop',
          type: 'mcp-server',
          transport: 'streamable-http',
          config: {
            mcpServers: {
              'onebrainer-brain': {
                url: SERVER_URL,
                transport: 'streamable-http',
              },
            },
          },
          configPath: {
            macos: '~/Library/Application Support/Claude/claude_desktop_config.json',
            windows: '%APPDATA%\\Claude\\claude_desktop_config.json',
            linux: '~/.config/Claude/claude_desktop_config.json',
          },
          note: 'Connects from local machine. Supports both streamable-http and stdio transports.',
        },
        'claude-api': {
          platform: 'Claude Messages API',
          type: 'mcp-connector',
          betaHeader: 'anthropic-beta: mcp-client-2025-11-20',
          mcpServers: [{
            type: 'url',
            url: SERVER_URL,
            name: 'onebrainer-brain',
          }],
          tools: [{
            type: 'mcp_toolset',
            mcp_server_name: 'onebrainer-brain',
            default_config: { enabled: true, defer_loading: false },
          }],
          note: 'Programmatic integration. Supports per-tool config, OAuth, and multiple servers.',
        },
        'chatgpt': {
          platform: 'ChatGPT',
          type: 'connector',
          setup: 'Settings → Connectors → Create → paste URL',
          url: SERVER_URL,
          auth: 'none',
          altSetup: 'Settings → Apps → Advanced → Enable Developer Mode → Add connector',
          note: 'ChatGPT connects from OpenAI servers — MCP server must be publicly accessible.',
        },
        'direct': {
          platform: 'Any HTTP Client',
          type: 'json-rpc-2.0',
          protocol: 'MCP 2025-03-26 (Streamable HTTP)',
          methods: ['initialize', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'ping'],
          example: {
            initialize: { jsonrpc: '2.0', id: 1, method: 'initialize' },
            tools_call: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'brain_query', arguments: { query: 'sprint velocity' } } },
          },
        },
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': getAllowedOrigin(request) || 'null',
      },
    },
  );
}