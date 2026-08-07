'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plug, CheckCircle2, XCircle, Copy, Terminal, ChevronDown, ChevronRight,
  Cpu, Zap, Eye, Network, Brain, Sparkles, BookOpen, AlertTriangle,
  Lightbulb, Database, Moon, Activity, Target, RefreshCw, Loader2,
  Cable, ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useWorkspaceId, wsUrl } from '@/lib/use-workspace-id';

// ===== Types =====
interface McpToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

interface McpLogEntry {
  id: string;
  direction: 'sent' | 'received';
  method: string;
  status: 'ok' | 'error';
  timestamp: string;
  detail?: string;
}

const TOOL_ICONS: Record<string, React.ElementType> = {
  brain_query: Search,
  add_fact: Database,
  list_topics: Network,
  get_brief: BookOpen,
  get_neural_stats: Activity,
  get_knowledge_gaps: AlertTriangle,
  get_insights: Lightbulb,
  get_associations: Network,
  get_graph: Brain,
  run_dreamer: Moon,
  run_librarian: Sparkles,
  list_decisions: Target,
  list_sparks: Zap,
};

function Search(props: React.SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size ?? 16} height={props.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

// ===== MCP Status Card =====
function McpStatusCard({ status, latency, toolsCount, version }: {
  status: 'connected' | 'error' | 'checking';
  latency: number | null;
  toolsCount: number;
  version: string;
}) {
  return (
    <Card className="border-border/50 overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ring-2 ${
              status === 'connected' ? 'bg-emerald-500/10 ring-emerald-500/20' :
              status === 'error' ? 'bg-red-500/10 ring-red-500/20' :
              'bg-amber-500/10 ring-amber-500/20'
            }`}>
              {status === 'checking' ? (
                <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
              ) : status === 'connected' ? (
                <Plug className="h-5 w-5 text-emerald-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight flex items-center gap-2">
                MCP Server
                <Badge variant="outline" className={`text-[9px] font-mono px-1.5 py-0 ${
                  status === 'connected' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                  status === 'error' ? 'bg-red-500/5 border-red-500/20 text-red-600 dark:text-red-400' :
                  'bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400'
                }`}>
                  {status === 'connected' ? 'ONLINE' : status === 'error' ? 'ERROR' : 'CHECKING'}
                  {status === 'connected' && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                </Badge>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Model Context Protocol · {version} · {toolsCount} tools
                {latency !== null && ` · ${latency}ms`}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => {
                    const url = window.location.origin + '/api/mcp';
                    navigator.clipboard.writeText(url);
                    toast.success('Server URL copied');
                  }}>
                    <Copy className="h-3 w-3" />
                    <span className="hidden sm:inline">URL</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy MCP server URL</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Tool Card =====
function McpToolCard({ tool, onTest, testing }: { tool: McpToolDef; onTest: (name: string) => void; testing: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[tool.name] ?? Cpu;
  const paramCount = Object.keys(tool.inputSchema.properties).length;

  return (
    <motion.div variants={itemVariants} className="group">
      <div
        className="flex items-center gap-2.5 p-3 rounded-lg border border-border/40 bg-card/50 hover:bg-accent/30 hover:border-border/60 transition-all cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="h-7 w-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-violet-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <code className="text-xs font-semibold font-mono text-foreground/90 truncate">{tool.name}</code>
            <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
              {paramCount} param{paramCount !== 1 ? 's' : ''}
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{tool.description.slice(0, 80)}...</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onTest(tool.name); }}
            disabled={testing}
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Terminal className="h-3 w-3" />}
          </Button>
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-1 ml-9 mr-2 p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2">
              <p className="text-[11px] text-muted-foreground leading-relaxed">{tool.description}</p>
              <div className="space-y-1.5">
                {Object.entries(tool.inputSchema.properties).map(([name, schema]) => (
                  <div key={name} className="flex items-start gap-2">
                    <code className="text-[10px] font-mono text-violet-500 bg-violet-500/5 px-1 py-0.5 rounded shrink-0">
                      {name}{tool.inputSchema.required?.includes(name) ? '*' : ''}
                    </code>
                    <div className="min-w-0">
                      <span className="text-[10px] text-muted-foreground">{schema.description}</span>
                      <div className="flex gap-1 mt-0.5">
                        <span className="text-[9px] font-mono text-muted-foreground/60">{schema.type}</span>
                        {schema.enum && (
                          <span className="text-[9px] font-mono text-amber-600 dark:text-amber-400">
                            {schema.enum.join(' | ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ===== Request Log =====
function McpLogPanel({ logs }: { logs: McpLogEntry[] }) {
  if (logs.length === 0) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-semibold flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          Request Log
          <Badge variant="outline" className="text-[9px] ml-auto">{logs.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <ScrollArea className="max-h-48">
          <div className="space-y-1.5">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 text-[10px] font-mono">
                <span className="text-muted-foreground/50 shrink-0 w-14">{log.timestamp}</span>
                <span className={`shrink-0 ${log.direction === 'sent' ? 'text-violet-500' : 'text-emerald-500'}`}>
                  {log.direction === 'sent' ? '→' : '←'}
                </span>
                <span className="text-foreground/80 truncate">{log.method}</span>
                {log.status === 'ok' ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-px" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500 shrink-0 mt-px" />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ===== Main Component =====
export function McpPanel() {
  const wsId = useWorkspaceId();
  const [status, setStatus] = useState<'connected' | 'error' | 'checking'>('checking');
  const [latency, setLatency] = useState<number | null>(null);
  const [tools, setTools] = useState<McpToolDef[]>([]);
  const [version, setVersion] = useState('');
  const [logs, setLogs] = useState<McpLogEntry[]>([]);
  const [testing, setTesting] = useState<string | null>(null);

  const addLog = useCallback((entry: Omit<McpLogEntry, 'id' | 'timestamp'>) => {
    const now = new Date();
    setLogs(prev => [{
      id: `${Date.now()}-${Math.random()}`,
      timestamp: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`,
      ...entry,
    }, ...prev].slice(0, 50));
  }, []);

  // Check MCP server status and fetch tools
  useEffect(() => {
    let cancelled = false;

    async function checkMcp() {
      setStatus('checking');
      const start = performance.now();

      try {
        const res = await fetch(wsUrl('/api/mcp', wsId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
        });

        const elapsed = Math.round(performance.now() - start);
        const data = await res.json();

        if (cancelled) return;

        if (data.result) {
          setVersion(data.result.protocolVersion || 'unknown');
          setStatus('connected');
          setLatency(elapsed);
          addLog({ direction: 'sent', method: 'initialize', status: 'ok' });
          addLog({ direction: 'received', method: `protocol ${data.result.protocolVersion}`, status: 'ok' });

          const toolsStart = performance.now();
          const toolsRes = await fetch(wsUrl('/api/mcp', wsId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
          });
          const toolsData = await toolsRes.json();
          const toolsElapsed = Math.round(performance.now() - toolsStart);

          if (!cancelled && toolsData.result?.tools) {
            setTools(toolsData.result.tools as McpToolDef[]);
            addLog({ direction: 'sent', method: 'tools/list', status: 'ok' });
            addLog({ direction: 'received', method: `${toolsData.result.tools.length} tools (${toolsElapsed}ms)`, status: 'ok' });
          }
        } else if (data.error) {
          setStatus('error');
          addLog({ direction: 'sent', method: 'initialize', status: 'error', detail: data.error.message });
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          addLog({ direction: 'sent', method: 'initialize', status: 'error', detail: String(err) });
        }
      }
    }

    checkMcp();
    return () => { cancelled = true; };
  }, [addLog]);

  // Test a tool
  const testTool = useCallback(async (toolName: string) => {
    setTesting(toolName);
    addLog({ direction: 'sent', method: `tools/call ${toolName}`, status: 'ok' });

    try {
      let args: Record<string, unknown> = {};
      if (toolName === 'brain_query') args = { query: 'overview', limit: 3 };
      else if (toolName === 'add_fact') args = { topic: 'test', entity: 'mcp-test', attribute: 'status', statement: 'MCP connection test fact', confidence: 'low' };
      else if (toolName === 'get_brief') args = { topic: 'onebrainer' };

      const start = performance.now();
      const res = await fetch(wsUrl('/api/mcp', wsId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name: toolName, arguments: args },
        }),
      });

      const elapsed = Math.round(performance.now() - start);
      const data = await res.json();

      if (data.result) {
        const text = data.result.content?.[0]?.text ?? 'OK';
        addLog({ direction: 'received', method: `${toolName} → ${text.slice(0, 60)}...`, status: 'ok' });
        toast.success(`${toolName}: ${elapsed}ms`);
      } else if (data.error) {
        addLog({ direction: 'received', method: `${toolName} error`, status: 'error', detail: data.error.message });
        toast.error(`${toolName}: ${data.error.message}`);
      }
    } catch (err) {
      addLog({ direction: 'received', method: `${toolName} failed`, status: 'error', detail: String(err) });
      toast.error(`${toolName}: connection failed`);
    } finally {
      setTesting(null);
    }
  }, [addLog]);

  return (
    <motion.div variants={itemVariants}>
      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold tracking-tight flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-violet-500/10 flex items-center justify-center ring-1 ring-violet-500/20">
              <Plug className="h-4 w-4 text-violet-500" />
            </div>
            MCP Brain Extension
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 ml-auto"
                    onClick={() => {
                      setStatus('checking');
                      setTools([]);
                      setLogs([]);
                      window.location.reload();
                    }}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Re-check MCP connection</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <CardDescription className="text-[11px] text-muted-foreground">
            Connect Claude, GPT, or any AI assistant to the OneBrainer brain via the Model Context Protocol
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Status */}
          <McpStatusCard status={status} latency={latency} toolsCount={tools.length} version={version} />

          {/* Redirect to Connectors tab */}
          <div className="rounded-lg bg-violet-500/5 border border-violet-500/15 p-3 flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
              <Cable className="h-3.5 w-3.5 text-violet-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-foreground/90">Setup guides moved</p>
              <p className="text-[10px] text-muted-foreground">Connection instructions for Claude, GPT, and API are now in the <strong>Connectors</strong> tab</p>
            </div>
            <ArrowRight className="h-4 w-4 text-violet-400 shrink-0" />
          </div>

          {/* Tools list */}
          {tools.length > 0 && (
            <motion.div variants={containerVariants} initial="hidden" animate="visible">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Cpu className="h-3 w-3" />
                  Available Tools
                </span>
                <Badge variant="outline" className="text-[9px]">{tools.length}</Badge>
              </div>
              <ScrollArea className="max-h-[360px]">
                <div className="space-y-1">
                  {tools.map(tool => (
                    <McpToolCard key={tool.name} tool={tool} onTest={testTool} testing={testing === tool.name} />
                  ))}
                </div>
              </ScrollArea>
            </motion.div>
          )}

          {/* Loading state */}
          {status === 'checking' && tools.length === 0 && (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          )}

          {/* Log panel */}
          <McpLogPanel logs={logs} />
        </CardContent>
      </Card>
    </motion.div>
  );
}