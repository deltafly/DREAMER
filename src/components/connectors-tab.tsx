'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Globe, Monitor, Code2, Terminal, MessageSquare, Copy, CheckCircle2,
  Info, Shield, AlertTriangle, ExternalLink, ArrowRight, Cable, Plug,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

// ===== SERVER URL =====
const SERVER_URL =
  typeof window !== 'undefined' ? window.location.origin + '/api/mcp' : '/api/mcp';

// ===== ANIMATION VARIANTS =====
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
} as const;

// ===== HELPER COMPONENTS =====

function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
    >
      {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <div className="relative group">
      <div className="flex items-center justify-between mb-1">
        {language && <span className="text-[9px] text-muted-foreground font-mono uppercase">{language}</span>}
        <CopyBtn text={code} />
      </div>
      <pre className="bg-muted/50 rounded-lg p-3 overflow-x-auto border border-border/30 text-[10px] font-mono leading-relaxed whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Step({
  number,
  children,
  color = 'bg-foreground',
}: {
  number: number;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="flex gap-2.5 items-start">
      <span
        className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-semibold text-white shrink-0 mt-0.5 ${color}`}
      >
        {number}
      </span>
      <div className="text-[11px] text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

function InfoBox({
  children,
  variant = 'info',
  colorClass = 'border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800',
}: {
  children: React.ReactNode;
  variant?: 'info' | 'warning' | 'shield';
  colorClass?: string;
}) {
  const Icon = variant === 'warning' ? AlertTriangle : variant === 'shield' ? Shield : Info;
  return (
    <div className={`flex gap-2 p-2.5 rounded-lg border text-[10px] leading-relaxed ${colorClass}`}>
      <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function CopyServerUrlBtn() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SERVER_URL);
      setCopied(true);
      toast.success('Server URL copied!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="flex items-center gap-2 mt-3 p-2.5 rounded-lg bg-muted/60 border border-border/40">
      <Cable className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <code className="text-[10px] font-mono text-foreground truncate flex-1">{SERVER_URL}</code>
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className="h-6 px-2.5 text-[10px] gap-1.5 shrink-0"
      >
        {copied ? (
          <>
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            Copy Server URL
          </>
        )}
      </Button>
    </div>
  );
}

// ===== CONNECTOR CARD WRAPPER =====

function ConnectorCard({
  icon: Icon,
  title,
  badge,
  badgeColor,
  headerGradient,
  stepColor,
  infoBoxColor,
  children,
}: {
  icon: React.ElementType;
  title: string;
  badge: string;
  badgeColor: string;
  headerGradient: string;
  stepColor: string;
  infoBoxColor: string;
  children: (ctx: { stepColor: string; infoBoxColor: string }) => React.ReactNode;
}) {
  return (
    <motion.div variants={itemVariants}>
      <Card className="border-border/50 overflow-hidden">
        {/* Color-coded header */}
        <div className={`px-4 py-3 ${headerGradient}`}>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white/20 backdrop-blur-sm">
              <Icon className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm text-white font-semibold leading-tight">{title}</CardTitle>
            </div>
            <Badge
              variant="secondary"
              className={`${badgeColor} text-[9px] font-semibold px-2 py-0 h-5 border-0`}
            >
              {badge}
            </Badge>
          </div>
        </div>
        <CardContent className="p-4 space-y-3">{children({ stepColor, infoBoxColor })}</CardContent>
      </Card>
    </motion.div>
  );
}

// ===== 1. CLAUDE.AI CONNECTORS =====

function ClaudeAiSection() {
  return (
    <ConnectorCard
      icon={Globe}
      title="Claude.ai Connectors"
      badge="Easiest"
      badgeColor="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      headerGradient="bg-gradient-to-r from-amber-500 to-amber-600"
      stepColor="bg-amber-500"
      infoBoxColor="border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800"
    >
      {({ stepColor, infoBoxColor }) => (<>
      <CopyServerUrlBtn />

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground">Setup Steps</p>
        <Step number={1} color={stepColor}>
          Go to{' '}
          <span className="font-mono text-[10px] bg-muted/60 px-1.5 py-0.5 rounded">
            claude.ai/settings/connectors
          </span>
        </Step>
        <Step number={2} color={stepColor}>
          Click <strong>"+"</strong> → <strong>"Add custom connector"</strong>
        </Step>
        <Step number={3} color={stepColor}>
          Paste your Server URL — that&apos;s it, no config file needed
        </Step>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground">Enabling per conversation</p>
        <Step number={1} color={stepColor}>
          In any Claude.ai chat, click <strong>"+"</strong> → <strong>"Connectors"</strong>
        </Step>
        <Step number={2} color={stepColor}>
          Toggle on your OneBrainer connector
        </Step>
      </div>

      <Separator className="my-1" />

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-foreground">OAuth (Optional)</p>
        <p className="text-[10px] text-muted-foreground">
          For unauthenticated servers (like ours), just pasting the URL is enough. If you need OAuth:
        </p>
        <Step number={1} color={stepColor}>
          Open <strong>"Advanced settings"</strong> in the connector setup
        </Step>
        <Step number={2} color={stepColor}>
          Enter Client ID (and optionally Client Secret)
        </Step>
        <div className="pl-7">
          <p className="text-[10px] text-muted-foreground">
            Callback URL:{' '}
            <code className="bg-muted/50 px-1.5 py-0.5 rounded font-mono">
              https://claude.ai/api/mcp/auth_callback
            </code>
          </p>
        </div>
      </div>

      <InfoBox colorClass={infoBoxColor}>
        Claude connects <strong>from Anthropic&apos;s servers</strong> — your OneBrainer instance must be
        publicly accessible. Available on Free (1 connector), Pro, Max, Team, and Enterprise plans.
      </InfoBox>
      </>)}
    </ConnectorCard>
  );
}

// ===== 2. CLAUDE DESKTOP =====

function ClaudeDesktopSection() {
  const configJson = JSON.stringify(
    {
      mcpServers: {
        'onebrainer-brain': {
          url: 'SERVER_URL_HERE',
          transport: 'streamable-http',
        },
      },
    },
    null,
    2,
  );

  return (
    <ConnectorCard
      icon={Monitor}
      title="Claude Desktop"
      badge="Local"
      badgeColor="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
      headerGradient="bg-gradient-to-r from-violet-500 to-violet-600"
      stepColor="bg-violet-500"
      infoBoxColor="border-violet-300 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-800"
    >
      {({ stepColor, infoBoxColor }) => (<>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground">Config file location</p>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">
            <span className="font-semibold">macOS:</span>{' '}
            <code className="font-mono bg-muted/50 px-1.5 py-0.5 rounded">
              ~/Library/Application Support/Claude/claude_desktop_config.json
            </code>
          </p>
          <p className="text-[10px] text-muted-foreground">
            <span className="font-semibold">Windows:</span>{' '}
            <code className="font-mono bg-muted/50 px-1.5 py-0.5 rounded">
              %APPDATA%\Claude\claude_desktop_config.json
            </code>
          </p>
          <p className="text-[10px] text-muted-foreground">
            <span className="font-semibold">Linux:</span>{' '}
            <code className="font-mono bg-muted/50 px-1.5 py-0.5 rounded">
              ~/.config/Claude/claude_desktop_config.json
            </code>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground">Config JSON</p>
        <CodeBlock code={configJson} language="json" />
        <p className="text-[10px] text-muted-foreground">
          Replace <code className="font-mono">SERVER_URL_HERE</code> with your actual server URL, then
          restart Claude Desktop.
        </p>
      </div>

      <InfoBox colorClass={infoBoxColor}>
        Claude Desktop connects <strong>from your local machine</strong> — it works with VPNs, firewalls,
        and local networks. Supports both <code className="font-mono">streamable-http</code> and{' '}
        <code className="font-mono">stdio</code> transports.
      </InfoBox>
      </>)}
    </ConnectorCard>
  );
}

// ===== 3. CLAUDE MESSAGES API (PROGRAMMATIC) =====

function ClaudeApiSection() {
  const pythonCode = `import anthropic

client = anthropic.Anthropic()
response = client.beta.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": "What does the brain know about sprint velocity?"
    }],
    mcp_servers=[{
        "type": "url",
        "url": "SERVER_URL_HERE",
        "name": "onebrainer-brain",
    }],
    tools=[{
        "type": "mcp_toolset",
        "mcp_server_name": "onebrainer-brain"
    }],
    betas=["mcp-client-2025-11-20"],
)
print(response.content)`;

  const mcpServersSchema = JSON.stringify(
    {
      type: 'url',
      url: 'SERVER_URL_HERE',
      name: 'onebrainer-brain',
      authorization_token: '...',
    },
    null,
    2,
  );

  const mcpToolsetSchema = JSON.stringify(
    {
      type: 'mcp_toolset',
      mcp_server_name: 'onebrainer-brain',
      default_config: { enabled: true, defer_loading: false },
      configs: {
        brain_query: { enabled: true, defer_loading: false },
        run_dreamer: { enabled: true, defer_loading: true },
      },
    },
    null,
    2,
  );

  return (
    <ConnectorCard
      icon={Code2}
      title="Claude Messages API"
      badge="Beta"
      badgeColor="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
      headerGradient="bg-gradient-to-r from-emerald-500 to-emerald-600"
      stepColor="bg-emerald-500"
      infoBoxColor="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800"
    >
      {({ stepColor, infoBoxColor }) => (<>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground">Beta Header</p>
        <CodeBlock code="anthropic-beta: mcp-client-2025-11-20" language="http" />
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground">Python Example</p>
        <CodeBlock code={pythonCode} language="python" />
      </div>

      <Separator className="my-1" />

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground">mcp_servers Schema</p>
        <CodeBlock code={mcpServersSchema} language="json" />
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground">mcp_toolset Schema (Optional)</p>
        <CodeBlock code={mcpToolsetSchema} language="json" />
        <p className="text-[10px] text-muted-foreground">
          Use <code className="font-mono">default_config</code> to set defaults for all tools, or
          override per-tool with <code className="font-mono">configs</code>. Set{' '}
          <code className="font-mono">defer_loading: true</code> for expensive tools.
        </p>
      </div>

      <InfoBox colorClass={infoBoxColor}>
        This is a <strong>beta feature</strong> — requires the{' '}
        <code className="font-mono">mcp-client-2025-11-20</code> beta header. The{' '}
        <code className="font-mono">mcp_toolset</code> tool type tells Claude to use all tools from the
        named MCP server.
      </InfoBox>
      </>)}
    </ConnectorCard>
  );
}

// ===== 4. CHATGPT / OPENAI =====

function ChatGptSection() {
  return (
    <ConnectorCard
      icon={MessageSquare}
      title="ChatGPT / OpenAI"
      badge="Native"
      badgeColor="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
      headerGradient="bg-gradient-to-r from-teal-500 to-teal-600"
      stepColor="bg-teal-500"
      infoBoxColor="border-teal-300 bg-teal-50 dark:bg-teal-950/20 dark:border-teal-800"
    >
      {({ stepColor, infoBoxColor }) => (<>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground">Setup Steps</p>
        <Step number={1} color={stepColor}>
          Go to <strong>Settings</strong> → <strong>Connectors</strong> → <strong>"Create"</strong>
        </Step>
        <Step number={2} color={stepColor}>
          Enter a <strong>Name</strong> (e.g., &ldquo;OneBrainer&rdquo;) and paste your <strong>Server URL</strong>
        </Step>
        <Step number={3} color={stepColor}>
          Set Auth to <strong>"None"</strong>
        </Step>
        <Step number={4} color={stepColor}>
          Check <strong>&ldquo;I trust this source&rdquo;</strong> → <strong>Save</strong>
        </Step>
      </div>

      <Separator className="my-1" />

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground">Alternative: Developer Mode</p>
        <Step number={1} color={stepColor}>
          Go to <strong>Settings</strong> → <strong>Apps</strong> → <strong>Advanced settings</strong>
        </Step>
        <Step number={2} color={stepColor}>
          Enable <strong>Developer Mode</strong>
        </Step>
        <Step number={3} color={stepColor}>
          Add connector → paste your MCP Server URL
        </Step>
      </div>

      <InfoBox colorClass={infoBoxColor}>
        ChatGPT connects <strong>from OpenAI&apos;s servers</strong> — your OneBrainer instance must be
        publicly accessible. Both setup methods achieve the same result.
      </InfoBox>
      </>)}
    </ConnectorCard>
  );
}

// ===== 5. DIRECT JSON-RPC API =====

function DirectRpcSection() {
  const curlDiscover = `curl "${SERVER_URL}"`;
  const curlToolsList = `curl -X POST "${SERVER_URL}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'`;
  const curlBrainQuery = `curl -X POST "${SERVER_URL}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "brain_query",
      "arguments": {
        "query": "What do we know about sprint velocity?"
      }
    }
  }'`;
  const curlAddFact = `curl -X POST "${SERVER_URL}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "add_fact",
      "arguments": {
        "topic": "Engineering",
        "entity": "Team Alpha",
        "attribute": "sprint velocity",
        "statement": "Team Alpha averages 42 story points per sprint",
        "confidence": "high",
        "source": "Sprint Review Q4"
      }
    }
  }'`;
  const jsExample = `const SERVER_URL = '${SERVER_URL}';

// Discover available tools
const discover = await fetch(SERVER_URL);
console.log(await discover.json());

// Call brain_query
const response = await fetch(SERVER_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'brain_query',
      arguments: { query: 'Tell me about sprint velocity' }
    }
  })
});
const result = await response.json();
console.log(result);`;

  return (
    <ConnectorCard
      icon={Terminal}
      title="Direct JSON-RPC API"
      badge="Universal"
      badgeColor="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
      headerGradient="bg-gradient-to-r from-rose-500 to-rose-600"
      stepColor="bg-rose-500"
      infoBoxColor="border-rose-300 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-800"
    >
      {({ stepColor, infoBoxColor }) => (<>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground">Discovery (GET)</p>
        <CodeBlock code={curlDiscover} language="bash" />
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground">List Tools</p>
        <CodeBlock code={curlToolsList} language="bash" />
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground">Call brain_query</p>
        <CodeBlock code={curlBrainQuery} language="bash" />
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground">Call add_fact</p>
        <CodeBlock code={curlAddFact} language="bash" />
      </div>

      <Separator className="my-1" />

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-foreground">JavaScript / fetch Example</p>
        <CodeBlock code={jsExample} language="javascript" />
      </div>

      <InfoBox colorClass={infoBoxColor}>
        <strong>Protocol:</strong> JSON-RPC 2.0 over Streamable HTTP (MCP 2025-03-26 spec). Available methods:{' '}
        <code className="font-mono">initialize</code>, <code className="font-mono">tools/list</code>,{' '}
        <code className="font-mono">tools/call</code>, <code className="font-mono">resources/list</code>,{' '}
        <code className="font-mono">resources/read</code>, <code className="font-mono">ping</code>.
        CORS is enabled on the GET endpoint.
      </InfoBox>
      </>)}
    </ConnectorCard>
  );
}

// ===== MAIN EXPORT =====

export function ConnectorsTab() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
            <Plug className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Connectors</h2>
            <p className="text-[11px] text-muted-foreground">
              Connect your OneBrainer knowledge brain to AI platforms via MCP
            </p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 max-w-2xl">
          OneBrainer exposes an MCP (Model Context Protocol) server that any compatible AI client can
          connect to. Pick a platform below for step-by-step setup instructions.
        </p>
      </div>

      <Separator />

      {/* Connector cards grid */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.08 } },
        }}
      >
        <ClaudeAiSection />
        <ClaudeDesktopSection />
        <ClaudeApiSection />
        <ChatGptSection />
        <DirectRpcSection />
      </motion.div>

      {/* Footer note */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-2">
        <Shield className="h-3 w-3" />
        <span>
          Your data stays on your server. MCP connections only expose tool interfaces — never your raw
          knowledge base contents directly.
        </span>
      </div>
    </div>
  );
}