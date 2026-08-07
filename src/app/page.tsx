'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import { useSession, signOut } from 'next-auth/react';
import {
  Brain, Search, AlertTriangle, Shield, Layers,
  BookOpen, FileText, Scale, Users, Sparkles, Flame,
  Sun, Moon, Keyboard, LogOut, Loader2, Trophy, Cable,
  X, Database, RotateCcw, Plus, Heart, RefreshCw,
} from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';

import type {
  Stats, Dispute, Decision, Fact, BriefListItem, DeltaBrief,
  DreamerStats, Spark, LedgerEntry, Preference, AgentInfo,
  TimelineItem, SearchResult,
} from '@/components/tabs/types';
import { topicColor, timeAgo } from '@/components/tabs/helpers';

import { OverviewTab } from '@/components/tabs/overview-tab';
import { BriefsTab } from '@/components/tabs/briefs-tab';
import { KnowledgeTab } from '@/components/tabs/knowledge-tab';
import { DisputesTab } from '@/components/tabs/disputes-tab';
import { AgentsTab } from '@/components/tabs/agents-tab';
import { LedgerTab } from '@/components/tabs/ledger-tab';
import { DreamerTab } from '@/components/tabs/dreamer-tab';

import { BrainTab } from '@/components/brain';
import { GdprTab } from '@/components/gdpr-tab';
import { ContestTab } from '@/components/contest-tab';
import { ConnectorsTab } from '@/components/connectors-tab';
import { LoginDialog } from '@/components/login-dialog';
import { ProfileDialog } from '@/components/profile-dialog';
import { WorkspaceSwitcher } from '@/components/workspace-switcher';
import { useWorkspaceId, wsUrl } from '@/lib/use-workspace-id';

// ===== MAIN COMPONENT =====
export default function OneBrainerDashboard() {
  const { theme, setTheme } = useTheme();
  const { data: session, status } = useSession();
  const [showLogin, setShowLogin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [briefs, setBriefs] = useState<BriefListItem[]>([]);
  const [selectedBrief, setSelectedBrief] = useState<DeltaBrief | null>(null);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [sparkStats, setSparkStats] = useState<DreamerStats | null>(null);
  const [sparkFilter, setSparkFilter] = useState<string>('all');
  const [sparkKindFilter, setSparkKindFilter] = useState<string>('all');
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<Dispute | null>(null);
  const [resolveRuling, setResolveRuling] = useState('');
  const [resolveWinner, setResolveWinner] = useState<'existing' | 'incoming'>('existing');
  const [isResolving, setIsResolving] = useState(false);
  const [isTriggeringLibrarian, setIsTriggeringLibrarian] = useState(false);
  const [factTopic, setFactTopic] = useState<string>('all');
  const [decisionStatus, setDecisionStatus] = useState<string>('all');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<Decision | null>(null);
  const [reviewOutcome, setReviewOutcome] = useState('');
  const [reviewLesson, setReviewLesson] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logTopic, setLogTopic] = useState('');
  const [logContent, setLogContent] = useState('');
  const [logKind, setLogKind] = useState('digest');
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string>('');
  const [expandedLedger, setExpandedLedger] = useState<number | null>(null);
  const [ledgerKindFilter, setLedgerKindFilter] = useState<string>('all');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const wsId = useWorkspaceId();

  useEffect(() => setMounted(true), []);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(wsUrl('/api/stats', wsId));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setStats(await r.json());
    } catch (e) { console.warn('fetchStats failed:', e); }
  }, [wsId]);
  const fetchBriefs = useCallback(async () => {
    try {
      const r = await fetch(wsUrl('/api/briefs?limit=100', wsId));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const list = d.data || d;
      setBriefs(list);
      if (list.length > 0 && !selectedBrief) fetchBriefDetail(list[0].topic);
    } catch (e) { console.warn('fetchBriefs failed:', e); }
  }, [selectedBrief, wsId]);
  const fetchDisputes = useCallback(async () => {
    try {
      const r = await fetch(wsUrl('/api/disputes?limit=100', wsId));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setDisputes(d.data || d);
    } catch (e) { console.warn('fetchDisputes failed:', e); }
  }, [wsId]);
  const fetchFacts = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (factTopic !== 'all') p.set('topic', factTopic);
      p.set('stale', 'true');
      p.set('limit', '200');
      const r = await fetch(wsUrl(`/api/facts?${p}`, wsId));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setFacts(d.data || d);
    } catch (e) { console.warn('fetchFacts failed:', e); }
  }, [factTopic, wsId]);
  const fetchDecisions = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (decisionStatus !== 'all') p.set('status', decisionStatus);
      p.set('limit', '200');
      const r = await fetch(wsUrl(`/api/decisions?${p}`, wsId));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setDecisions(d.data || d);
    } catch (e) { console.warn('fetchDecisions failed:', e); }
  }, [decisionStatus, wsId]);
  const fetchLedger = useCallback(async () => {
    try {
      const r = await fetch(wsUrl('/api/ledger?limit=30', wsId));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setLedger(await r.json());
    } catch (e) { console.warn('fetchLedger failed:', e); }
  }, [wsId]);
  const fetchPreferences = useCallback(async () => {
    try {
      const r = await fetch(wsUrl('/api/preferences', wsId));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setPreferences(await r.json());
    } catch (e) { console.warn('fetchPreferences failed:', e); }
  }, [wsId]);
  const fetchAgents = useCallback(async () => {
    try {
      const r = await fetch(wsUrl('/api/agents?limit=100', wsId));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setAgents(d.data || d);
    } catch (e) { console.warn('fetchAgents failed:', e); }
  }, [wsId]);
  const fetchTimeline = useCallback(async () => {
    try {
      const r = await fetch(wsUrl('/api/activity', wsId));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setTimeline(await r.json());
    } catch (e) { console.warn('fetchTimeline failed:', e); }
  }, [wsId]);
  const fetchBriefDetail = useCallback(async (topic: string) => {
    try {
      const r = await fetch(wsUrl(`/api/briefs/${topic}`, wsId));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setSelectedBrief(data);
    } catch (e) { console.warn('fetchBriefDetail failed:', e); }
  }, [wsId]);

  const fetchSparks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (sparkFilter !== 'all') params.set('topic', sparkFilter);
      if (sparkKindFilter !== 'all') params.set('kind', sparkKindFilter);
      const r = await fetch(wsUrl(`/api/sparks?${params}`, wsId));
      const data = await r.json();
      setSparks(data.sparks || []);
      setSparkStats(data.stats || null);
    } catch (e) { console.warn('fetchSparks failed:', e); }
  }, [sparkFilter, sparkKindFilter, wsId]);

  const [isRunningDreamer, setIsRunningDreamer] = useState(false);
  const [dreamerResult, setDreamerResult] = useState<string | null>(null);

  const handleRunDreamer = async () => {
    setIsRunningDreamer(true);
    setDreamerResult(null);
    try {
      const r = await fetch(wsUrl('/api/dreamer/run', wsId), { method: 'POST' });
      const data = await r.json();
      if (data.success) {
        toast.success('Dreamer completed', { description: data.summary });
        setDreamerResult(data.summary);
        fetchSparks(); fetchStats();
      } else {
        toast.error('Dreamer failed', { description: data.error });
        setDreamerResult(`Error: ${data.error}`);
      }
    } catch { toast.error('Error', { description: 'Network error' }); }
    setIsRunningDreamer(false);
  };

  const handleRateSpark = async (id: number, hit: boolean) => {
    try {
      const r = await fetch(wsUrl('/api/sparks/rate', wsId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, hit }),
      });
      if (r.ok) {
        toast.success(hit ? 'Spark rated as hit ✓' : 'Spark rated as miss ✗', { description: 'Bandit weights updated.' });
        fetchSparks(); fetchStats();
      } else {
        const err = await r.json();
        toast.error('Rating failed', { description: JSON.stringify(err.error) });
      }
    } catch { toast.error('Error', { description: 'Network error' }); }
  };

  const refreshAll = useCallback(() => {
    fetchStats(); fetchBriefs(); fetchDisputes(); fetchFacts();
    fetchDecisions(); fetchLedger(); fetchPreferences(); fetchAgents(); fetchTimeline(); fetchSparks();
  }, [fetchStats, fetchBriefs, fetchDisputes, fetchFacts, fetchDecisions, fetchLedger, fetchPreferences, fetchAgents, fetchTimeline, fetchSparks]);

  useEffect(() => {
    Promise.all([fetchStats(), fetchBriefs(), fetchDisputes(), fetchFacts(), fetchDecisions(), fetchLedger(), fetchPreferences(), fetchAgents(), fetchTimeline(), fetchSparks()])
      .finally(() => setDataLoaded(true));
  }, [refreshAll]);
  useEffect(() => { fetchFacts(); }, [factTopic, fetchFacts]);
  useEffect(() => { fetchDecisions(); }, [decisionStatus, fetchDecisions]);
  useEffect(() => { fetchSparks(); }, [sparkFilter, sparkKindFilter, fetchSparks]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchInputRef.current?.focus(); return; }
      if (e.key === '/' && !isInput) { e.preventDefault(); searchInputRef.current?.focus(); return; }
      if (isInput) return;
      const tabMap: Record<string, string> = { '1': 'overview', '2': 'briefs', '3': 'knowledge', '4': 'disputes', '5': 'agents', '6': 'ledger', '7': 'dreamer', '8': 'brain', '9': 'contest', '0': 'gdpr' };
      if (tabMap[e.key]) { setActiveTab(tabMap[e.key]); return; }
      if (e.key === 'r' || e.key === 'R') { refreshAll(); setLastRefresh(new Date().toLocaleTimeString()); toast.success('Refreshed', { description: 'All data reloaded' }); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [refreshAll]);

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    try {
      const r = await fetch(wsUrl(`/api/search?q=${encodeURIComponent(q)}`, wsId));
      const d = await r.json();
      setSearchResults(d.results || []);
    } catch (e) { console.warn('handleSearch failed:', e); } finally { setIsSearching(false); }
  }, []);

  const openResolveDialog = (d: Dispute) => {
    setResolveTarget(d); setResolveRuling(''); setResolveWinner('existing'); setResolveDialogOpen(true);
  };

  const handleResolve = async () => {
    if (!resolveTarget || resolveRuling.length < 10) return;
    setIsResolving(true);
    try {
      const r = await fetch(wsUrl('/api/disputes/resolve', wsId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: resolveTarget.id, ruling: resolveRuling, winner: resolveWinner }),
      });
      if (r.ok) {
        toast.success('Dispute resolved', { description: `${resolveTarget.topic} — ruling recorded.` });
        setResolveDialogOpen(false);
        refreshAll();
      } else {
        const err = await r.json();
        toast.error('Failed', { description: JSON.stringify(err.error) });
      }
    } catch { toast.error('Error', { description: 'Network error' }); }
    finally { setIsResolving(false); }
  };

  const handleReviewDecision = async () => {
    if (!reviewTarget || !reviewOutcome.trim()) return;
    setIsSubmittingReview(true);
    try {
      const r = await fetch(wsUrl('/api/decisions/review', wsId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reviewTarget.id, outcome: reviewOutcome, lesson: reviewLesson || undefined }),
      });
      if (r.ok) {
        toast.success('Decision reviewed', { description: `Calibration loop closed for: ${reviewTarget.decision.slice(0, 50)}` });
        setReviewDialogOpen(false); setReviewOutcome(''); setReviewLesson('');
        fetchDecisions(); fetchStats();
      } else toast.error('Failed', { description: 'Could not submit review' });
    } catch { toast.error('Error', { description: 'Network error' }); }
    finally { setIsSubmittingReview(false); }
  };

  const handleLogEntry = async () => {
    if (!logTopic.trim() || !logContent.trim()) return;
    setIsSubmittingLog(true);
    try {
      const r = await fetch(wsUrl('/api/ledger', wsId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: logTopic, content: logContent, kind: logKind }),
      });
      if (r.ok) {
        toast.success('Entry logged', { description: `New ${logKind} added to ${logTopic} — pending Librarian processing.` });
        setLogDialogOpen(false); setLogTopic(''); setLogContent(''); setLogKind('digest');
        fetchStats(); fetchLedger();
      } else toast.error('Failed', { description: 'Could not log entry' });
    } catch { toast.error('Error', { description: 'Network error' }); }
    finally { setIsSubmittingLog(false); }
  };

  const handleTriggerLibrarian = async () => {
    setIsTriggeringLibrarian(true);
    try {
      const r = await fetch(wsUrl('/api/librarian', wsId), { method: 'POST' });
      const d = await r.json();
      if (d.success) {
        toast.success('Librarian complete', { description: d.summary });
        refreshAll();
      } else toast.error('Failed', { description: d.error });
    } catch { toast.error('Unavailable'); }
    finally { setIsTriggeringLibrarian(false); }
  };

  // Derived values
  const openDisputes = disputes.filter(d => d.status === 'open');
  const totalTopics = stats?.layers.l1.byTopic.length || 0;
  const healthScore = stats ? Math.round(
    ((100 - stats.layers.l2.facts.staleRatio) * 0.30) +
    (stats.layers.l1.total > 0 ? ((stats.layers.l1.total - stats.health.unprocessedLedger) / stats.layers.l1.total * 100) * 0.25 : 25) +
    (stats.disputes.open === 0 ? 100 : Math.max(0, 100 - stats.disputes.open * 20)) * 0.25 +
    (stats.layers.l3.dirty === 0 ? 100 : Math.max(0, 100 - stats.layers.l3.dirty * 25)) * 0.20
  ) : 0;

  return (
    <div className="min-h-screen flex flex-col">
      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-[100] border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="relative group">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-600 via-purple-600 to-orange-500 flex items-center justify-center shadow-lg shadow-violet-500/20 group-hover:shadow-violet-500/30 transition-shadow">
                  <Brain className="h-4.5 w-4.5 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background">
                  <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75" />
                </div>
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">OneBrainer</h1>
                <p className="text-[10px] text-muted-foreground leading-none font-medium">Curated Memory System</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 sm:hidden" onClick={() => setMobileSearchOpen(!mobileSearchOpen)} aria-label="Keresés">
                <Search className="h-4 w-4" />
              </Button>

              <div className={`relative ${mobileSearchOpen ? 'flex sm:hidden' : 'hidden sm:block'}`}>
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search…  ⌘K"
                  className="h-8 w-56 lg:w-64 pl-8 pr-8 text-xs bg-muted/40 border-border/40 focus:bg-background focus:border-border/60 transition-all search-glow"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                />
                {isSearching && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    <div className="h-3.5 w-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                  </div>
                )}
                {searchQuery && !isSearching && (
                  <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {status === 'authenticated' && session?.user ? (
                <>
                  <WorkspaceSwitcher />
                  <Separator orientation="vertical" className="h-5 hidden sm:block" />
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setShowProfile(true)} className="flex items-center gap-1.5 rounded-md hover:bg-muted/60 px-1 py-0.5 transition-colors cursor-pointer" title="Profil">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="h-7 w-7 text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          {session.user.name?.charAt(0)?.toUpperCase() || session.user.email?.charAt(0)?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium hidden md:inline max-w-[80px] truncate">
                        {session.user.name || session.user.email?.split('@')[0]}
                      </span>
                    </button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10" onClick={() => signOut({ callbackUrl: '/' })} aria-label="Kijelentkezés" title="Kijelentkezés">
                      <LogOut className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              ) : status === 'unauthenticated' ? (
                <Button variant="outline" size="sm" className="h-8 text-[11px] font-medium border-border/50 hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/5 transition-all" onClick={() => setShowLogin(true)}>
                  Sign In
                </Button>
              ) : null}

              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Téma váltás">
                {mounted && (theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />)}
              </Button>

              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { refreshAll(); setLastRefresh(new Date().toLocaleTimeString()); }} aria-label="Frissítés">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>

              {stats && (
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm"
                    className="h-8 text-[11px] gap-1.5 text-violet-600 dark:text-violet-400 hover:text-violet-700 hover:bg-violet-500/10 hidden sm:flex"
                    disabled={isTriggeringLibrarian} onClick={handleTriggerLibrarian}
                  >
                    {isTriggeringLibrarian ? (
                      <div className="h-3.5 w-3.5 border-2 border-violet-400/30 border-t-violet-500 rounded-full animate-spin" />
                    ) : <Sparkles className="h-3.5 w-3.5" />}
                    <span className="hidden lg:inline font-medium">Run Librarian</span>
                  </Button>
                  <Button variant="ghost" size="sm"
                    className="h-8 text-[11px] gap-1.5 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 hover:bg-emerald-500/10 hidden md:flex"
                    onClick={() => setLogDialogOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" /><span className="hidden lg:inline font-medium">Log Entry</span>
                  </Button>
                  {stats.health.openDisputes > 0 && (
                    <Badge variant="outline" className="h-7 px-2 text-[10px] gap-1 border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 font-medium">
                      <AlertTriangle className="h-3 w-3" />{stats.health.openDisputes}
                    </Badge>
                  )}
                  {stats.health.unprocessedLedger > 0 && (
                    <Badge variant="outline" className="h-7 px-2 text-[10px] gap-1 border-sky-500/20 bg-sky-500/5 text-sky-600 dark:text-sky-400 hidden md:flex font-medium">
                      <Database className="h-3 w-3" />{stats.health.unprocessedLedger}
                    </Badge>
                  )}
                  {stats.health.dirtyBriefs > 0 && (
                    <Badge variant="outline" className="h-7 px-2 text-[10px] gap-1 border-orange-500/20 bg-orange-500/5 text-orange-600 dark:text-orange-400 hidden lg:flex font-medium">
                      <RotateCcw className="h-3 w-3" />{stats.health.dirtyBriefs}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.2 }}
              className="absolute top-full left-0 right-0 z-50 mx-auto max-w-2xl px-4">
              <Card className="border-border/60 shadow-2xl shadow-black/10 dark:shadow-black/40 overflow-hidden">
                <div className="px-3 py-2 border-b border-border/30 bg-muted/30">
                  <p className="text-[10px] font-medium text-muted-foreground">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;</p>
                </div>
                <ScrollArea className="max-h-80">
                  <div className="p-1.5 space-y-0.5">
                    {searchResults.map((r, i) => (
                      <motion.button key={`${r.type}-${r.id}-${i}`}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                        className="w-full text-left p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                        onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[9px] px-1.5 h-4 font-medium">{r.type}</Badge>
                          <Badge variant="outline" className={`text-[9px] px-1.5 h-4 ${topicColor(r.topic)}`}>{r.topic}</Badge>
                          <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(r.ts)}</span>
                        </div>
                        <p className="text-xs text-foreground/90 line-clamp-2 leading-relaxed">{r.snippet}</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">{r.meta}</p>
                      </motion.button>
                    ))}
                  </div>
                </ScrollArea>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ===== MAIN ===== */}
      {status === 'loading' ? (
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            <p className="text-xs text-muted-foreground">Loading…</p>
          </div>
        </main>
      ) : (
      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 dot-grid-bg">
        <div className="hidden lg:flex items-center gap-1.5 mb-3">
          <Keyboard className="h-3 w-3 text-muted-foreground/40" />
          <span className="text-[10px] text-muted-foreground/40">Press 0-9 to switch tabs · R to refresh · ⌘K to search</span>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/40 border border-border/40 p-1 h-10 rounded-xl">
            <TabsTrigger value="overview" title="Áttekintés" className="text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg px-3.5 font-medium">
              <Layers className="h-3.5 w-3.5" /><span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="briefs" title="Briefs" className="text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg px-3.5 font-medium">
              <BookOpen className="h-3.5 w-3.5" /><span className="hidden sm:inline">Briefs</span>
              {openDisputes.length > 0 && <span className="h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-bold">{openDisputes.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="knowledge" title="Tudásbázis" className="text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg px-3.5 font-medium">
              <Brain className="h-3.5 w-3.5" /><span className="hidden sm:inline">Knowledge</span>
            </TabsTrigger>
            <TabsTrigger value="disputes" title="Viták" className="text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg px-3.5 font-medium">
              <Scale className="h-3.5 w-3.5" /><span className="hidden sm:inline">Disputes</span>
              {openDisputes.length > 0 && <span className="h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-bold">{openDisputes.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="agents" title="Agentek" className="text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg px-3.5 font-medium">
              <Users className="h-3.5 w-3.5" /><span className="hidden sm:inline">Agents</span>
            </TabsTrigger>
            <TabsTrigger value="ledger" title="Napló" className="text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg px-3.5 font-medium">
              <FileText className="h-3.5 w-3.5" /><span className="hidden sm:inline">Ledger</span>
            </TabsTrigger>
            <TabsTrigger value="dreamer" title="Dreamer" className="text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg px-3.5 font-medium">
              <Flame className="h-3.5 w-3.5" /><span className="hidden sm:inline">Dreamer</span>
              {stats?.dreamer?.pending && stats.dreamer.pending > 0 && <span className="h-4 min-w-4 px-1 rounded-full bg-orange-500 text-white text-[9px] flex items-center justify-center font-bold">{stats.dreamer.pending}</span>}
            </TabsTrigger>
            <TabsTrigger value="brain" title="Brain" className="text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg px-3.5 font-medium">
              <Sparkles className="h-3.5 w-3.5" /><span className="hidden sm:inline">Brain</span>
            </TabsTrigger>
            <TabsTrigger value="contest" title="Contest" className="text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg px-3.5 font-medium">
              <Trophy className="h-3.5 w-3.5" /><span className="hidden sm:inline">Contest</span>
            </TabsTrigger>
            <TabsTrigger value="gdpr" title="GDPR" className="text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg px-3.5 font-medium">
              <Shield className="h-3.5 w-3.5" /><span className="hidden sm:inline">GDPR</span>
            </TabsTrigger>
            <TabsTrigger value="connectors" title="Connectors" className="text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg px-3.5 font-medium">
              <Cable className="h-3.5 w-3.5" /><span className="hidden sm:inline">Connectors</span>
            </TabsTrigger>
          </TabsList>

          {/* ===== TAB CONTENT ===== */}
          {!dataLoaded ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
          <>
          <TabsContent value="overview" className="space-y-6">
            <OverviewTab
              stats={stats}
              timeline={timeline}
              preferences={preferences}
              disputes={disputes}
              lastRefresh={lastRefresh}
              onNavigateToTab={setActiveTab}
            />
          </TabsContent>

          <TabsContent value="briefs" className="space-y-4">
            <BriefsTab
              briefs={briefs}
              selectedBrief={selectedBrief}
              stats={stats}
              onSelectBrief={fetchBriefDetail}
              refreshAll={refreshAll}
            />
          </TabsContent>

          <TabsContent value="knowledge" className="space-y-4">
            <KnowledgeTab
              facts={facts}
              decisions={decisions}
              factTopic={factTopic}
              decisionStatus={decisionStatus}
              stats={stats}
              onFactTopicChange={setFactTopic}
              onDecisionStatusChange={setDecisionStatus}
              onOpenReviewDialog={(d) => { setReviewTarget(d); setReviewDialogOpen(true); setReviewOutcome(''); setReviewLesson(''); }}
            />
          </TabsContent>

          <TabsContent value="disputes" className="space-y-4">
            <DisputesTab
              disputes={disputes}
              stats={stats}
              resolveDialogOpen={resolveDialogOpen}
              resolveTarget={resolveTarget}
              resolveRuling={resolveRuling}
              resolveWinner={resolveWinner}
              isResolving={isResolving}
              reviewDialogOpen={reviewDialogOpen}
              reviewTarget={reviewTarget}
              reviewOutcome={reviewOutcome}
              reviewLesson={reviewLesson}
              isSubmittingReview={isSubmittingReview}
              logDialogOpen={logDialogOpen}
              logTopic={logTopic}
              logContent={logContent}
              logKind={logKind}
              isSubmittingLog={isSubmittingLog}
              onOpenResolveDialog={openResolveDialog}
              onResolveRulingChange={setResolveRuling}
              onResolveWinnerChange={setResolveWinner}
              onSetResolveDialogOpen={setResolveDialogOpen}
              onResolve={handleResolve}
              onOpenReviewDialog={(d) => { setReviewTarget(d); setReviewDialogOpen(true); setReviewOutcome(''); setReviewLesson(''); }}
              onReviewOutcomeChange={setReviewOutcome}
              onReviewLessonChange={setReviewLesson}
              onSetReviewDialogOpen={setReviewDialogOpen}
              onSubmitReview={handleReviewDecision}
              onSetLogDialogOpen={setLogDialogOpen}
              onLogTopicChange={setLogTopic}
              onLogContentChange={setLogContent}
              onLogKindChange={setLogKind}
              onSubmitLog={handleLogEntry}
            />
          </TabsContent>

          <TabsContent value="agents" className="space-y-4">
            <AgentsTab agents={agents} timeline={timeline} />
          </TabsContent>

          <TabsContent value="ledger" className="space-y-4">
            <LedgerTab
              ledger={ledger}
              preferences={preferences}
              expandedLedger={expandedLedger}
              ledgerKindFilter={ledgerKindFilter}
              stats={stats}
              onSetExpandedLedger={setExpandedLedger}
              onLedgerKindFilterChange={setLedgerKindFilter}
            />
          </TabsContent>

          <TabsContent value="dreamer" className="space-y-4">
            <DreamerTab
              sparks={sparks}
              sparkStats={sparkStats}
              sparkFilter={sparkFilter}
              sparkKindFilter={sparkKindFilter}
              isRunningDreamer={isRunningDreamer}
              dreamerResult={dreamerResult}
              stats={stats}
              onSparkFilterChange={setSparkFilter}
              onSparkKindFilterChange={setSparkKindFilter}
              onRunDreamer={handleRunDreamer}
              onRateSpark={handleRateSpark}
            />
          </TabsContent>

          <TabsContent value="brain" className="space-y-4">
            <BrainTab searchQuery={searchQuery} />
          </TabsContent>

          <TabsContent value="contest" className="space-y-4">
            <ContestTab />
          </TabsContent>

          <TabsContent value="gdpr" className="space-y-4">
            <GdprTab />
          </TabsContent>

          <TabsContent value="connectors" className="space-y-4">
            <ConnectorsTab />
          </TabsContent>
          </>
          )}
        </Tabs>
      </main>
      )}

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-border/40 bg-muted/20 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <div className="h-4 w-4 rounded bg-gradient-to-br from-violet-500 to-orange-500 flex items-center justify-center">
                <Brain className="h-2.5 w-2.5 text-white" />
              </div>
              <span className="font-medium">OneBrainer v5.2.0</span>
              <span className="text-muted-foreground/50">·</span>
              <span>Brain + GDPR + Contest</span>
              {lastRefresh && <><span className="text-muted-foreground/50">·</span><span className="text-muted-foreground/60">Updated {lastRefresh}</span></>}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
              {stats && (
                <>
                  <span className="flex items-center gap-1">
                    <Heart className="h-3 w-3 text-rose-400" />
                    <span className={`font-bold ${healthScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' : healthScore >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                      {healthScore}%
                    </span>
                  </span>
                  <span>·</span>
                  <span>{stats.agents} agents</span>
                  <span>·</span>
                  <span>{totalTopics} topics</span>
                  <span>·</span>
                  <span>{stats.librarian.totalRuns} librarian runs</span>
                </>
              )}
            </div>
          </div>
        </div>
      </footer>
      <LoginDialog open={showLogin} onOpenChange={setShowLogin} />
      <ProfileDialog open={showProfile} onOpenChange={setShowProfile} />
    </div>
  );
}