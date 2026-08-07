/**
 * OneBrainer MCP Server — Minimal Streamable HTTP Implementation
 *
 * Exposes the Brain's knowledge graph as MCP tools for Claude, OpenAI, and any MCP client.
 * Implements MCP JSON-RPC 2.0 manually (no SDK transport dependency — avoids bun compatibility issues).
 *
 * Tools:
 *   - brain_query       — Neural spreading activation query
 *   - add_fact         — Register a new fact
 *   - add_ledger_entry — Submit raw knowledge for librarian processing
 *   - list_topics      — Enumerate knowledge topics
 *   - get_brief        — Retrieve a topic's knowledge brief
 *   - search_facts     — Search facts by entity/attribute
 *   - get_stats        — Brain health & neural statistics
 *   - list_disputes    — Open knowledge conflicts
 */

// ─── Config ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.MCP_PORT || '3004', 10);
const MAIN_APP = process.env.MAIN_APP_URL || 'http://localhost:3000';
const WORKSPACE_ID = parseInt(process.env.WORKSPACE_ID || '1', 10);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const wsParam = `workspace=${WORKSPACE_ID}`;

async function apiGet(path: string): Promise<unknown> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${MAIN_APP}${path}${sep}${wsParam}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(path: string, body: unknown): Promise<unknown> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${MAIN_APP}${path}${sep}${wsParam}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

function mcpResult(content: string | Array<{ type: string; text: string }>) {
  const c = typeof content === 'string' ? [{ type: 'text' as const, text: content }] : content;
  return { content: c };
}

function mcpError(code: number, message: string, id: string | number | null = null) {
  return { jsonrpc: '2.0' as const, error: { code, message }, id };
}

function mcpResponse(result: unknown, id: string | number | null) {
  return { jsonrpc: '2.0' as const, result, id };
}

// ─── Tool Definitions ───────────────────────────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<ReturnType<typeof mcpResult>>;
}

const tools: ToolDef[] = [
  {
    name: 'brain_query',
    description: 'Query the OneBrainer knowledge brain using neural spreading activation. Use this as your long-term memory — ask anything the brain might know. Returns relevant facts ranked by activation score.',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', description: 'Natural language query' },
        limit: { type: 'number', description: 'Max results (1-20, default 8)' },
      },
      required: ['context'],
    },
    handler: async ({ context, limit }) => {
      const data = await apiPost('/api/brain/query', { context, limit: limit ?? 8 }) as Record<string, unknown>;
      const results = (data.results as Array<Record<string, unknown>>) || [];
      const neural = data.neural as Record<string, unknown> | undefined;

      if (results.length === 0) {
        return mcpResult('No matching memories found. Try `add_fact` or `add_ledger_entry` to teach the brain.');
      }

      let text = `**Query:** "${context}"\n\n`;
      for (const r of results) {
        const fact = r.fact as Record<string, unknown>;
        const act = typeof r.activation === 'number' ? `${(r.activation as number * 100).toFixed(0)}%` : '?';
        const seed = r.isSeed ? '⚡' : '🔗';
        text += `${seed} **${fact.entity}**/${fact.attribute} [\`${fact.topic}\`] (${act}) — ${fact.statement}\n`;
      }
      if (neural) {
        text += `\n*Neural: ${neural.seedFacts} seeds, ${neural.spreadFacts} spread, ${neural.hebbianUpdates} Hebbian, ${neural.iterations} iterations*`;
      }
      return mcpResult(text);
    },
  },
  {
    name: 'add_fact',
    description: 'Register a new fact in the knowledge base. Facts are assertions that will be true for weeks.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Knowledge domain (e.g., "mcos-engine")' },
        entity: { type: 'string', description: 'The thing the fact is about' },
        attribute: { type: 'string', description: 'Specific aspect' },
        statement: { type: 'string', description: 'The fact — one clear sentence' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Confidence (default: medium)' },
      },
      required: ['topic', 'entity', 'attribute', 'statement'],
    },
    handler: async ({ topic, entity, attribute, statement, confidence }) => {
      const data = await apiPost('/api/facts', { topic, entity, attribute, statement, confidence: confidence ?? 'medium', source: 'mcp-tool' }) as Record<string, unknown>;
      return mcpResult(`✅ Fact #${data.id} registered: **${entity}/${attribute}** [\`${topic}\`] (${confidence ?? 'medium'})`);
    },
  },
  {
    name: 'add_ledger_entry',
    description: 'Submit raw knowledge for the Librarian to process via LLM. Use for unstructured knowledge (conversation snippets, meeting notes, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Knowledge domain' },
        kind: { type: 'string', enum: ['fact', 'decision', 'observation', 'correction', 'question'], description: 'Entry type' },
        content: { type: 'string', description: 'Raw content to process' },
      },
      required: ['topic', 'content'],
    },
    handler: async ({ topic, kind, content }) => {
      await apiPost('/api/ledger', { topic, kind: kind ?? 'observation', content });
      return mcpResult(`📝 Ledger entry submitted to \`${topic}\`. Librarian will extract structured knowledge on next run.`);
    },
  },
  {
    name: 'list_topics',
    description: 'List all knowledge topics with fact counts and activity.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const allFacts = await apiGet('/api/facts') as Array<Record<string, unknown>>;
      const topicMap = new Map<string, { total: number; active: number; stale: number }>();
      for (const f of allFacts) {
        const t = f.topic as string;
        if (!topicMap.has(t)) topicMap.set(t, { total: 0, active: 0, stale: 0 });
        const e = topicMap.get(t)!;
        e.total++;
        if ((f.activationScore as number) > 0) e.active++;
        if (f.stale) e.stale++;
      }
      if (topicMap.size === 0) return mcpResult('No topics found in the brain yet.');

      let text = `## Knowledge Topics (${topicMap.size})\n\n`;
      text += '| Topic | Total | Active | Stale |\n|---|---|---|---|\n';
      for (const [topic, v] of topicMap) {
        text += `| \`${topic}\` | ${v.total} | ${v.active} | ${v.stale} |\n`;
      }
      return mcpResult(text);
    },
  },
  {
    name: 'get_brief',
    description: 'Get the knowledge brief for a topic — a synthesized summary of all known facts, decisions, and state.',
    inputSchema: { type: 'object', properties: { topic: { type: 'string', description: 'Topic name' } }, required: ['topic'] },
    handler: async ({ topic }) => {
      const data = await apiGet(`/api/briefs/${encodeURIComponent(topic)}`) as Record<string, unknown>;
      if (!data || !data.content) return mcpResult(`No brief for \`${topic}\`. The brain may not have enough knowledge yet.`);
      return mcpResult(`## Brief: ${topic}\n\n${data.content as string}`);
    },
  },
  {
    name: 'search_facts',
    description: 'Search facts by entity, attribute, or keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        topic: { type: 'string', description: 'Filter by topic' },
      },
      required: ['query'],
    },
    handler: async ({ query, topic }) => {
      const params = new URLSearchParams({ q: query, limit: '20' });
      if (topic) params.set('topic', topic);
      const data = await apiGet(`/api/search?${params}`) as Record<string, unknown>;
      const facts = (data.results as Array<Record<string, unknown>>) || [];
      if (facts.length === 0) return mcpResult(`No facts matching "${query}"${topic ? ` in \`${topic}\`` : ''}.`);

      let text = `**${facts.length} results for "${query}"**\n\n`;
      for (const f of facts) {
        const stale = f.stale ? ' ⚠️STALE' : '';
        text += `- **${f.entity}**/${f.attribute} [\`${f.topic}\`] (${f.confidence}${stale}) — ${f.statement}\n`;
      }
      return mcpResult(text);
    },
  },
  {
    name: 'get_stats',
    description: "Get the brain's neural network health: topology, activation coverage, plasticity, weight distribution.",
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const s = await apiGet('/api/brain/neural-stats') as Record<string, unknown>;
      const t = s.topology as Record<string, unknown>;
      const a = s.activation as Record<string, unknown>;
      const p = s.plasticity as Record<string, unknown>;
      const h = s.health as Record<string, unknown>;
      const w = s.weights as Record<string, unknown>;
      const q = s.queries as Record<string, unknown>;
      return mcpResult(
        `**Health:** ${h.score}% (${h.label})\n` +
        `**Topology:** ${t.nodes} nodes · ${t.edges} edges · density ${t.density}\n` +
        `**Activation:** ${a.activeFacts}/${a.totalFacts} active · coverage ${(a.coverage as number * 100).toFixed(0)}%\n` +
        `**Plasticity:** ${(p.index as number * 100).toFixed(0)}% · ${p.totalFires} fires · ${p.neverFired} dormant\n` +
        `**Weights:** avg ${w.avg} · range ${w.min}–${w.max}\n` +
        `**Queries:** ${q.total} processed`,
      );
    },
  },
  {
    name: 'list_disputes',
    description: 'List open knowledge disputes — cases where new information conflicts with existing facts.',
    inputSchema: { type: 'object', properties: { topic: { type: 'string', description: 'Filter by topic' } } },
    handler: async ({ topic }) => {
      const params = new URLSearchParams({ status: 'open' });
      if (topic) params.set('topic', topic);
      const data = await apiGet(`/api/disputes?${params}`) as Record<string, unknown>;
      const disputes = (data.disputes as Array<Record<string, unknown>>) || [];
      if (disputes.length === 0) return mcpResult('No open disputes. Knowledge base is consistent.');

      let text = `## ${disputes.length} Open Disputes\n\n`;
      for (const d of disputes) {
        text += `### #${d.id} [\`${d.topic}\`] — detected by ${d.detectedBy}\n- **Existing:** ${d.existingRef}\n- **Incoming:** ${d.incoming}\n\n`;
      }
      return mcpResult(text);
    },
  },
];

const toolMap = new Map(tools.map(t => [t.name, t]));

// ─── JSON-RPC Handler ──────────────────────────────────────────────────────────

async function handleMcp(body: string): Promise<Record<string, unknown>> {
  const msg = JSON.parse(body);
  const { method, params, id } = msg;
  if (!method) return mcpError(-32600, 'Missing method', id ?? null);

  switch (method) {
    case 'initialize': {
      return {
        jsonrpc: '2.0' as const,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'onebrainer', version: '1.0.0' },
        },
        id,
      };
    }

    case 'notifications/initialized':
      return { jsonrpc: '2.0' as const, result: {}, id: id ?? null };

    case 'tools/list': {
      return mcpResponse(
        tools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        id,
      );
    }

    case 'tools/call': {
      const { name, arguments: args } = params as { name: string; arguments?: Record<string, unknown> };
      const tool = toolMap.get(name);
      if (!tool) return mcpError(-32601, `Unknown tool: ${name}`, id);

      try {
        return mcpResponse(await tool.handler(args ?? {}), id);
      } catch (err) {
        return mcpError(-32603, `Tool error: ${err instanceof Error ? err.message : String(err)}`, id);
      }
    }

    default:
      return mcpError(-32601, `Method not found: ${method}`, id);
  }
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => console.error('[MCP] Uncaught:', err));
process.on('unhandledRejection', (reason) => console.error('[MCP] Rejection:', reason));

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'onebrainer-mcp', version: '1.0.0', workspaceId: WORKSPACE_ID }));
    return;
  }

  if (url.pathname === '/mcp' && req.method === 'POST') {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString('utf-8');
      console.log(`[MCP] Request (${body.length} chars) id=${JSON.parse(body).id ?? '?'}`);
      const result = await handleMcp(body);
      console.log(`[MCP] ${result.error ? 'ERROR' : 'OK'} (${JSON.stringify(result).length} chars)`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('[MCP] Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mcpError(-32700, err instanceof Error ? err.message : String(err))));
    }
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    name: 'OneBrainer MCP',
    version: '1.0.0',
    mcpEndpoint: '/mcp',
    healthCheck: '/health',
    protocol: 'MCP Streamable HTTP (2025-03-26)',
    tools: tools.map(t => t.name),
    claudeDesktopConfig: { mcpServers: { onebrainer: { url: `http://localhost:${PORT}/mcp` } } },
  }));
});

httpServer.listen(PORT, () => {
  console.log(`   Endpoint: http://localhost:${PORT}/mcp`);
  console.log(`   Health:    http://localhost:${PORT}/health`);
});