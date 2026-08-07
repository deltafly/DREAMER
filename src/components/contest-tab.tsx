'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useWorkspaceId, wsUrl } from '@/lib/use-workspace-id';
import {
  Trophy, Target, Zap, Clock, Users, Medal, Star, Award, Lock,
  CheckCircle2, TrendingUp, Brain, BookOpen, Scale, Link2, Lightbulb,
  RefreshCw, ChevronRight, Crown, ChevronDown, Loader2, Gift,
  Swords, BookMarked, Flame, Timer, Hash, Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';

// ===== TYPES =====

interface Achievement {
  id: number;
  badge: string;
  title: string;
  description: string;
  earnedAt: string;
}

interface Contest {
  id: number;
  title: string;
  description: string;
  kind: string;
  status: string;
  startsAt: string;
  endsAt: string;
  prize: string | null;
  rules: string | null;
  _count?: { entries: number; challenges: number };
  entryCount?: number;
  challengeCount?: number;
}

interface Challenge {
  id: number;
  title: string;
  description: string;
  kind: string;
  points: number;
  completedBy: number | null;
  completedAt: string | null;
}

interface LeaderboardEntry {
  rank: number;
  workspaceId: number;
  score: number;
  submittedAt: string;
}

interface ContestEntry {
  id: number;
  contestId: number;
  workspaceId: number;
  score: number;
  submittedAt: string;
  metadata: string | null;
  rank?: number;
  workspace?: { id: number; name: string; slug: string };
}

interface ScoreBreakdownItem {
  count: number;
  points: number;
  per: number;
}

interface ScoreBreakdown {
  facts?: ScoreBreakdownItem;
  decisions?: ScoreBreakdownItem;
  associations?: ScoreBreakdownItem;
  insights?: ScoreBreakdownItem;
  sparks?: ScoreBreakdownItem;
  breadth?: ScoreBreakdownItem;
  freshnessBonus?: ScoreBreakdownItem;
}

// ===== CONSTANTS =====

const ACHIEVEMENT_DEFS: { badge: string; title: string; description: string; points: number }[] = [
  { badge: 'first-fact', title: 'First Fact', description: 'Recorded your first fact', points: 10 },
  { badge: 'knowledge-builder', title: 'Knowledge Builder', description: 'Accumulated 10+ live facts', points: 50 },
  { badge: 'decision-maker', title: 'Decision Maker', description: 'Made 5+ active decisions', points: 30 },
  { badge: 'well-connected', title: 'Well Connected', description: 'Created 10+ associations', points: 40 },
  { badge: 'brain-awake', title: 'Brain Awake', description: 'Generated 5+ non-dismissed insights', points: 25 },
  { badge: 'spark-igniter', title: 'Spark Igniter', description: 'Delivered 5+ sparks', points: 35 },
  { badge: 'contender', title: 'Contender', description: 'Entered any contest', points: 20 },
  { badge: 'knowledge-complete', title: 'Knowledge Complete', description: 'Has facts in 5+ unique topics', points: 60 },
  { badge: 'fresh-mind', title: 'Fresh Mind', description: 'No stale facts in workspace', points: 15 },
];

const BADGE_ICONS: Record<string, React.ElementType> = {
  'first-fact': BookOpen,
  'knowledge-builder': BookMarked,
  'decision-maker': Scale,
  'well-connected': Link2,
  'brain-awake': Lightbulb,
  'spark-igniter': Zap,
  'contender': Trophy,
  'knowledge-complete': Brain,
  'fresh-mind': RefreshCw,
};

const KIND_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  'knowledge-completeness': {
    label: 'Knowledge',
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    icon: BookOpen,
  },
  'freshness-challenge': {
    label: 'Freshness',
    color: 'text-cyan-700 dark:text-cyan-300',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    icon: Flame,
  },
  'association-density': {
    label: 'Density',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    icon: Link2,
  },
  'decision-outcome': {
    label: 'Decision',
    color: 'text-rose-700 dark:text-rose-300',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    icon: Scale,
  },
  'weekly-quiz': {
    label: 'Quiz',
    color: 'text-violet-700 dark:text-violet-300',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    icon: Target,
  },
};

const MAX_SCORE = 500;

// ===== HELPERS =====

function getTimeRemaining(endsAt: string): string {
  const now = new Date();
  const end = new Date(endsAt);
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) {
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m left`;
  }
  const mins = Math.floor(diff / (1000 * 60));
  return `${mins}m left`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getContestEntryCount(c: Contest): number {
  return c.entryCount ?? c._count?.entries ?? 0;
}

function getContestChallengeCount(c: Contest): number {
  return c.challengeCount ?? c._count?.challenges ?? 0;
}

// ===== ANIMATION VARIANTS =====

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
  },
} as const;

const badgePopVariants = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 400, damping: 20, delay: 0.1 },
  },
} as const;

const scoreCounterVariants = {
  initial: { scale: 1 },
  pulse: { scale: 1.15, transition: { duration: 0.2, yoyo: Infinity, repeat: 3 } },
};

// ===== SUB-COMPONENTS =====

function AchievementBadgeSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 p-3">
      <Skeleton className="h-12 w-12 rounded-xl" />
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-2.5 w-12" />
    </div>
  );
}

function ContestCardSkeleton() {
  return (
    <Card className="p-0 overflow-hidden">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-8 w-32 rounded-lg" />
      </CardContent>
    </Card>
  );
}

function LeaderboardRow({
  entry,
  isCurrent,
  index,
}: {
  entry: LeaderboardEntry;
  isCurrent: boolean;
  index: number;
}) {
  const medalIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-4 w-4 text-amber-400" />;
    if (rank === 2) return <Medal className="h-4 w-4 text-slate-300" />;
    if (rank === 3) return <Medal className="h-4 w-4 text-amber-600" />;
    return <span className="text-xs font-mono text-muted-foreground w-4 text-center">#{rank}</span>;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
        isCurrent
          ? 'bg-emerald-500/10 border border-emerald-500/20'
          : 'hover:bg-muted/50'
      }`}
    >
      <div className="w-6 flex items-center justify-center shrink-0">
        {medalIcon(entry.rank)}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isCurrent ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>
          {isCurrent ? 'Te (Saját workspace)' : `#${entry.workspaceId}`}
        </p>
        <p className="text-[11px] text-muted-foreground">{formatDate(entry.submittedAt)}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
          {entry.score.toLocaleString()}
        </p>
        <p className="text-[10px] text-muted-foreground">pts</p>
      </div>
    </motion.div>
  );
}

// ===== MAIN COMPONENT =====

export function ContestTab() {
  // Data state
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [activeContests, setActiveContests] = useState<Contest[]>([]);
  const [completedContests, setCompletedContests] = useState<Contest[]>([]);

  // Detail / dialog state
  const [selectedContestId, setSelectedContestId] = useState<number | null>(null);
  const [contestDetail, setContestDetail] = useState<{
    contest: Contest;
    challenges: Challenge[];
    entries: ContestEntry[];
  } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown | null>(null);
  const [currentScore, setCurrentScore] = useState<number | null>(null);
  const [currentRank, setCurrentRank] = useState<number | null>(null);

  // UI state
  const [achievementsLoading, setAchievementsLoading] = useState(true);
  const [contestsLoading, setContestsLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [enteringContest, setEnteringContest] = useState<number | null>(null);
  const [scoringContest, setScoringContest] = useState<number | null>(null);
  const [checkingAchievements, setCheckingAchievements] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [newlyEarned, setNewlyEarned] = useState<string[]>([]);

  // Timer for countdown
  const [tick, setTick] = useState(0);

  const wsId = useWorkspaceId();
  const workspaceIdRef = useRef<string | null>(null);

  // Keep ref in sync with hook
  useEffect(() => { workspaceIdRef.current = wsId; }, [wsId]);

  // Countdown tick
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Fetch achievements
  const fetchAchievements = useCallback(async () => {
    setAchievementsLoading(true);
    try {
      const r = await fetch(wsUrl('/api/contest/achievements', wsId));
      if (r.ok) {
        const data = await r.json();
        setAchievements(data.achievements ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setAchievementsLoading(false);
    }
  }, []);

  // Fetch contests (active + completed)
  const fetchContests = useCallback(async () => {
    setContestsLoading(true);
    try {
      const [activeRes, completedRes] = await Promise.all([
        fetch(wsUrl('/api/contest/contests?status=active', wsId)),
        fetch(wsUrl('/api/contest/contests?status=completed', wsId)),
      ]);
      if (activeRes.ok) {
        const data = await activeRes.json();
        setActiveContests((data.contests ?? []).map((c: Contest) => ({
          ...c,
          entryCount: c.entryCount ?? c._count?.entries ?? 0,
          challengeCount: c.challengeCount ?? c._count?.challenges ?? 0,
        })));
      }
      if (completedRes.ok) {
        const data = await completedRes.json();
        setCompletedContests((data.contests ?? []).map((c: Contest) => ({
          ...c,
          entryCount: c.entryCount ?? c._count?.entries ?? 0,
          challengeCount: c.challengeCount ?? c._count?.challenges ?? 0,
        })));
      }
    } catch {
      // silently fail
    } finally {
      setContestsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAchievements();
    fetchContests();
  }, [fetchAchievements, fetchContests]);

  // Open contest detail
  const openContestDetail = useCallback(async (contestId: number) => {
    setSelectedContestId(contestId);
    setContestDetail(null);
    setLeaderboard([]);
    setScoreBreakdown(null);
    setCurrentScore(null);
    setCurrentRank(null);
    setDetailLoading(true);
    setLeaderboardLoading(true);

    try {
      const [detailRes, lbRes] = await Promise.all([
        fetch(wsUrl(`/api/contest/contests/${contestId}`, wsId)),
        fetch(wsUrl(`/api/contest/leaderboard?contestId=${contestId}`, wsId)),
      ]);

      if (detailRes.ok) {
        const data = await detailRes.json();
        setContestDetail(data);

        // Find current workspace entry
        const wsId = workspaceIdRef.current;
        if (wsId) {
          const myEntry = (data.entries ?? []).find(
            (e: ContestEntry) => String(e.workspaceId) === wsId
          );
          if (myEntry) {
            setCurrentScore(myEntry.score);
            setCurrentRank(myEntry.rank ?? null);
            try {
              if (myEntry.metadata) {
                setScoreBreakdown(JSON.parse(myEntry.metadata));
              }
            } catch {
              // ignore parse error
            }
          }
        }
      }

      if (lbRes.ok) {
        const data = await lbRes.json();
        setLeaderboard(data.leaderboard ?? []);
      }
    } catch {
      toast.error('Failed to load contest details');
    } finally {
      setDetailLoading(false);
      setLeaderboardLoading(false);
    }
  }, []);

  // Enter contest
  const handleEnterContest = useCallback(async (contestId: number) => {
    setEnteringContest(contestId);
    try {
      const r = await fetch(wsUrl('/api/contest/enter', wsId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contestId }),
      });
      if (r.ok) {
        const data = await r.json();
        toast.success(`Entered contest! Initial score: ${data.score} pts`);
        if (selectedContestId === contestId) {
          openContestDetail(contestId);
        }
        fetchContests();
        // Check for new achievements
        handleCheckAchievements();
      } else {
        const data = await r.json();
        toast.error(data.error || 'Failed to enter contest');
      }
    } catch {
      toast.error('Failed to enter contest');
    } finally {
      setEnteringContest(null);
    }
  }, [selectedContestId, openContestDetail, fetchContests]);

  // Recalculate score
  const handleRecalcScore = useCallback(async (contestId: number) => {
    setScoringContest(contestId);
    try {
      const r = await fetch(wsUrl('/api/contest/score', wsId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contestId }),
      });
      if (r.ok) {
        const data = await r.json();
        setCurrentScore(data.score);
        setCurrentRank(data.rank);
        setScoreBreakdown(data.breakdown);
        toast.success(`Score updated: ${data.score} pts — Rank #${data.rank}`);
        // Refresh leaderboard
        const lbRes = await fetch(wsUrl(`/api/contest/leaderboard?contestId=${contestId}`, wsId));
        if (lbRes.ok) {
          const lbData = await lbRes.json();
          setLeaderboard(lbData.leaderboard ?? []);
        }
        fetchContests();
      } else {
        const data = await r.json();
        toast.error(data.error || 'Failed to recalculate score');
      }
    } catch {
      toast.error('Failed to recalculate score');
    } finally {
      setScoringContest(null);
    }
  }, [fetchContests]);

  // Check new achievements
  const handleCheckAchievements = useCallback(async () => {
    setCheckingAchievements(true);
    try {
      const r = await fetch(wsUrl('/api/contest/achievements', wsId), {
        method: 'POST',
      });
      if (r.ok) {
        const data = await r.json();
        if (data.newAchievements && data.newAchievements.length > 0) {
          const badges = data.newAchievements.map((a: Achievement) => a.badge);
          setNewlyEarned(badges);
          toast.success(
            `🏆 ${data.newAchievements.length} new achievement${data.newAchievements.length > 1 ? 's' : ''} unlocked! +${data.totalPoints} total pts`,
            { duration: 5000 }
          );
          // Clear newly earned animation after 3s
          setTimeout(() => setNewlyEarned([]), 3000);
          // Refresh achievements list
          fetchAchievements();
        } else {
          toast.info('No new achievements yet — keep building your brain!');
        }
      }
    } catch {
      toast.error('Failed to check achievements');
    } finally {
      setCheckingAchievements(false);
    }
  }, [fetchAchievements]);

  // Computed
  const earnedBadges = new Set(achievements.map((a) => a.badge));
  const totalPoints = achievements.reduce((sum, a) => {
    const def = ACHIEVEMENT_DEFS.find((d) => d.badge === a.badge);
    return sum + (def?.points ?? 0);
  }, 0);

  // Is current workspace entered in a contest?
  const isEntered = useCallback(
    (contestId: number) => {
      if (!contestDetail || contestDetail.contest.id !== contestId) return false;
      const wsId = workspaceIdRef.current;
      return (contestDetail.entries ?? []).some(
        (e: ContestEntry) => String(e.workspaceId) === wsId
      );
    },
    [contestDetail]
  );

  // ===== RENDER =====

  return (
    <div className="space-y-6">
      {/* ===== SECTION 1: ACHIEVEMENTS SHOWCASE ===== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
              <Award className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Achievements</h2>
              <p className="text-[11px] text-muted-foreground">
                {achievements.length}/{ACHIEVEMENT_DEFS.length} unlocked
                {totalPoints > 0 && (
                  <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-medium">
                    · {totalPoints} pts
                  </span>
                )}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
            onClick={handleCheckAchievements}
            disabled={checkingAchievements}
          >
            {checkingAchievements ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Check New
          </Button>
        </div>

        {achievementsLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-9 gap-2">
            {Array.from({ length: 9 }).map((_, i) => (
              <AchievementBadgeSkeleton key={i} />
            ))}
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-9 gap-2"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {ACHIEVEMENT_DEFS.map((def) => {
              const earned = earnedBadges.has(def.badge);
              const Icon = BADGE_ICONS[def.badge] ?? Star;
              const isNew = newlyEarned.includes(def.badge);

              return (
                <motion.div
                  key={def.badge}
                  variants={isNew ? badgePopVariants : itemVariants}
                  className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200 ${
                    earned
                      ? 'bg-gradient-to-b from-emerald-500/10 to-teal-500/5 border-emerald-500/20 hover:border-emerald-500/40 hover:shadow-[0_0_16px_rgba(16,185,129,0.12)] cursor-default'
                      : 'bg-muted/30 border-muted/50 opacity-50 cursor-default'
                  }`}
                >
                  {isNew && (
                    <motion.div
                      className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-amber-400 flex items-center justify-center shadow-sm"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, delay: 0.3 }}
                    >
                      <Star className="h-2.5 w-2.5 text-white" fill="white" />
                    </motion.div>
                  )}
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                      earned
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm'
                        : 'bg-muted/80 text-muted-foreground'
                    }`}
                  >
                    {earned ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                  </div>
                  <span
                    className={`text-[10px] font-semibold text-center leading-tight ${
                      earned ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {def.title}
                  </span>
                  <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">
                    {def.points} pts
                  </span>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Achievement progress bar */}
        <div className="mt-3 flex items-center gap-3">
          <Progress
            value={(achievements.length / ACHIEVEMENT_DEFS.length) * 100}
            className="h-2 flex-1 [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-teal-400"
          />
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums w-10 text-right">
            {Math.round((achievements.length / ACHIEVEMENT_DEFS.length) * 100)}%
          </span>
        </div>
      </section>

      <Separator />

      {/* ===== SECTION 2: ACTIVE CONTESTS ===== */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-sm">
            <Swords className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Active Contests</h2>
            <p className="text-[11px] text-muted-foreground">
              Compete and climb the leaderboard
            </p>
          </div>
        </div>

        {contestsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <ContestCardSkeleton key={i} />
            ))}
          </div>
        ) : activeContests.length === 0 ? (
          <Card className="p-8 flex flex-col items-center justify-center text-center border-dashed border-muted-foreground/20">
            <Trophy className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No active contests</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Check back later for new challenges
            </p>
          </Card>
        ) : (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {activeContests.map((contest) => {
              const kind = KIND_CONFIG[contest.kind] ?? {
                label: contest.kind,
                color: 'text-muted-foreground',
                bg: 'bg-muted',
                border: 'border-muted',
                icon: Trophy,
              };
              const KindIcon = kind.icon;
              const timeLeft = getTimeRemaining(contest.endsAt);
              const isEnded = timeLeft === 'Ended';
              const entryCount = getContestEntryCount(contest);
              const challengeCount = getContestChallengeCount(contest);
              const entered = selectedContestId === contest.id ? isEntered(contest.id) : false;

              // Score from contest detail if it's the selected one
              const score = selectedContestId === contest.id ? currentScore : null;
              const rank = selectedContestId === contest.id ? currentRank : null;

              return (
                <motion.div
                  key={contest.id}
                  variants={itemVariants}
                  whileHover={{ y: -2, transition: { duration: 0.2 } }}
                >
                  <Card
                    className="overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-[0_0_24px_rgba(16,185,129,0.08)] hover:border-emerald-500/30 group"
                    onClick={() => openContestDetail(contest.id)}
                  >
                    <CardContent className="p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`h-5 text-[10px] font-semibold px-2 ${kind.bg} ${kind.color} ${kind.border} border`}
                          >
                            <KindIcon className="h-3 w-3 mr-1" />
                            {kind.label}
                          </Badge>
                          {contest.prize && (
                            <Badge className="h-5 text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 hover:bg-amber-500/15">
                              <Gift className="h-3 w-3 mr-1" />
                              {contest.prize}
                            </Badge>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-semibold mb-1.5 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                        {contest.title}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                        {contest.description}
                      </p>

                      {/* Meta */}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-3">
                        <span className={`flex items-center gap-1 ${isEnded ? 'text-rose-500' : ''}`}>
                          <Clock className="h-3 w-3" />
                          {timeLeft}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          {challengeCount} {challengeCount === 1 ? 'challenge' : 'challenges'}
                        </span>
                      </div>

                      {/* Score / Progress */}
                      {score !== null && (
                        <div className="mb-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-muted-foreground">
                              Your Score
                            </span>
                            <motion.span
                              key={score}
                              variants={scoreCounterVariants}
                              initial="initial"
                              animate="pulse"
                              className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums"
                            >
                              {score.toLocaleString()} pts
                            </motion.span>
                          </div>
                          <Progress
                            value={Math.min((score / MAX_SCORE) * 100, 100)}
                            className="h-1.5 [&>div]:bg-gradient-to-r [&>div]:from-amber-400 [&>div]:to-amber-500"
                          />
                          {rank !== null && (
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <TrendingUp className="h-3 w-3 text-emerald-500" />
                              Rank <span className="font-semibold text-foreground">#{rank}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action button */}
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {entered ? (
                          <Button
                            size="sm"
                            className="h-7 text-[11px] gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => handleRecalcScore(contest.id)}
                            disabled={scoringContest === contest.id}
                          >
                            {scoringContest === contest.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Recalculate Score
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 text-[11px] gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm"
                            onClick={() => handleEnterContest(contest.id)}
                            disabled={enteringContest === contest.id || isEnded}
                          >
                            {enteringContest === contest.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Zap className="h-3 w-3" />
                            )}
                            {isEnded ? 'Contest Ended' : 'Enter Contest'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px] text-muted-foreground hover:text-emerald-600"
                          onClick={() => openContestDetail(contest.id)}
                        >
                          Details
                          <ChevronRight className="h-3 w-3 ml-0.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </section>

      <Separator />

      {/* ===== SECTION 5: COMPLETED CONTESTS ===== */}
      {completedContests.length > 0 && (
        <section>
          <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2.5 mb-4 group w-full text-left">
                <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <h2 className="text-sm font-semibold">Completed Contests</h2>
                  <p className="text-[11px] text-muted-foreground">
                    {completedContests.length} past {completedContests.length === 1 ? 'contest' : 'contests'}
                  </p>
                </div>
                <motion.div
                  animate={{ rotate: completedOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </motion.div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <motion.div
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.3 }}
              >
                {completedContests.map((contest) => {
                  const kind = KIND_CONFIG[contest.kind] ?? {
                    label: contest.kind,
                    color: 'text-muted-foreground',
                    bg: 'bg-muted',
                    border: 'border-muted',
                    icon: Trophy,
                  };
                  const KindIcon = kind.icon;
                  const entryCount = getContestEntryCount(contest);

                  return (
                    <Card
                      key={contest.id}
                      className="p-4 opacity-75 hover:opacity-100 transition-opacity cursor-pointer"
                      onClick={() => openContestDetail(contest.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <Badge
                            variant="outline"
                            className={`h-5 text-[10px] font-semibold px-2 ${kind.bg} ${kind.color} ${kind.border} border`}
                          >
                            <KindIcon className="h-3 w-3 mr-1" />
                            {kind.label}
                          </Badge>
                          <Badge className="h-5 text-[10px] font-semibold bg-muted/80 text-muted-foreground">
                            Completed
                          </Badge>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                      </div>
                      <h4 className="text-sm font-medium mb-1">{contest.title}</h4>
                      <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                        {contest.description}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(contest.endsAt)}
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </motion.div>
            </CollapsibleContent>
          </Collapsible>
        </section>
      )}

      {/* ===== SECTIONS 3 & 4: CONTEST DETAIL DIALOG ===== */}
      <Dialog
        open={selectedContestId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedContestId(null);
            setContestDetail(null);
            setLeaderboard([]);
            setScoreBreakdown(null);
            setCurrentScore(null);
            setCurrentRank(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
          {detailLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <div className="space-y-2 mt-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ) : contestDetail ? (
            <>
              <DialogHeader className="p-6 pb-0">
                <div className="flex items-center gap-2 mb-2">
                  {(() => {
                    const kind = KIND_CONFIG[contestDetail.contest.kind] ?? {
                      label: contestDetail.contest.kind,
                      color: 'text-muted-foreground',
                      bg: 'bg-muted',
                      border: 'border-muted',
                      icon: Trophy,
                    };
                    const KindIcon = kind.icon;
                    return (
                      <Badge
                        variant="outline"
                        className={`h-5 text-[10px] font-semibold px-2 ${kind.bg} ${kind.color} ${kind.border} border`}
                      >
                        <KindIcon className="h-3 w-3 mr-1" />
                        {kind.label}
                      </Badge>
                    );
                  })()}
                  {contestDetail.contest.prize && (
                    <Badge className="h-5 text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20">
                      <Gift className="h-3 w-3 mr-1" />
                      {contestDetail.contest.prize}
                    </Badge>
                  )}
                  <Badge className="h-5 text-[10px] font-semibold bg-muted/80 text-muted-foreground ml-auto">
                    {getTimeRemaining(contestDetail.contest.endsAt)}
                  </Badge>
                </div>
                <DialogTitle className="text-base">{contestDetail.contest.title}</DialogTitle>
                <DialogDescription className="text-xs leading-relaxed">
                  {contestDetail.contest.description}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="flex-1 px-6 pb-6">
                <div className="space-y-5 pt-4">
                  {/* Rules */}
                  {contestDetail.contest.rules && (
                    <div className="p-3 rounded-lg bg-muted/40 border border-muted/60">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                        Rules
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {contestDetail.contest.rules}
                      </p>
                    </div>
                  )}

                  {/* Score display and action */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {currentScore !== null ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Star className="h-5 w-5 text-amber-500" fill="currentColor" />
                            <motion.span
                              key={currentScore}
                              initial={{ scale: 1.3 }}
                              animate={{ scale: 1 }}
                              className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums"
                            >
                              {currentScore.toLocaleString()}
                            </motion.span>
                            <span className="text-xs text-muted-foreground">pts</span>
                          </div>
                          {currentRank !== null && (
                            <Badge
                              variant="outline"
                              className="h-6 text-xs font-semibold border-amber-500/30 text-amber-700 dark:text-amber-300"
                            >
                              <Trophy className="h-3 w-3 mr-1" />
                              Rank #{currentRank}
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          Not entered yet
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className={`h-8 text-xs gap-1.5 shadow-sm ${
                        currentScore !== null
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white'
                      }`}
                      onClick={() =>
                        currentScore !== null
                          ? handleRecalcScore(contestDetail.contest.id)
                          : handleEnterContest(contestDetail.contest.id)
                      }
                      disabled={
                        enteringContest === contestDetail.contest.id ||
                        scoringContest === contestDetail.contest.id
                      }
                    >
                      {enteringContest === contestDetail.contest.id ||
                      scoringContest === contestDetail.contest.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : currentScore !== null ? (
                        <RefreshCw className="h-3.5 w-3.5" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                      {currentScore !== null ? 'Recalculate' : 'Enter Contest'}
                    </Button>
                  </div>

                  {/* Score Breakdown */}
                  <AnimatePresence>
                    {scoreBreakdown && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Score Breakdown
                        </p>
                        <div className="rounded-lg border border-amber-500/15 bg-amber-500/5 p-3 space-y-1.5">
                          {Object.entries(scoreBreakdown).map(([key, val]) => {
                            const labelMap: Record<string, string> = {
                              facts: 'Facts',
                              decisions: 'Decisions',
                              associations: 'Associations',
                              insights: 'Insights',
                              sparks: 'Sparks',
                              breadth: 'Topic Breadth',
                              freshnessBonus: 'Freshness Bonus',
                            };
                            const iconMap: Record<string, React.ElementType> = {
                              facts: BookOpen,
                              decisions: Scale,
                              associations: Link2,
                              insights: Lightbulb,
                              sparks: Zap,
                              breadth: Hash,
                              freshnessBonus: RefreshCw,
                            };
                            const ItemIcon = iconMap[key] ?? Star;

                            return (
                              <motion.div
                                key={key}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2 }}
                                className="flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <ItemIcon className="h-3.5 w-3.5 text-amber-500/70" />
                                  <span>{labelMap[key] ?? key}</span>
                                  <span className="text-muted-foreground/60">
                                    {val.count} × {val.per}
                                  </span>
                                </div>
                                <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                                  +{val.points}
                                </span>
                              </motion.div>
                            );
                          })}
                          <Separator className="my-2 bg-amber-500/15" />
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-foreground">Total</span>
                            <span className="text-amber-600 dark:text-amber-400 tabular-nums text-sm">
                              {currentScore?.toLocaleString()} pts
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Separator />

                  {/* Challenges */}
                  {contestDetail.challenges.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Challenges ({contestDetail.challenges.length})
                      </p>
                      <div className="space-y-2">
                        {contestDetail.challenges.map((challenge, idx) => (
                          <motion.div
                            key={challenge.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-muted/40"
                          >
                            <div className="mt-0.5">
                              {challenge.completedAt ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium">{challenge.title}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                {challenge.description}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className="h-5 text-[10px] font-semibold px-1.5 shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
                            >
                              {challenge.points} pts
                            </Badge>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* Leaderboard */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Leaderboard
                      </p>
                      <span className="text-[10px] text-muted-foreground">
                        {leaderboard.length} {leaderboard.length === 1 ? 'participant' : 'participants'}
                      </span>
                    </div>

                    {leaderboardLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full rounded-lg" />
                        ))}
                      </div>
                    ) : leaderboard.length === 0 ? (
                      <div className="p-6 text-center rounded-lg border border-dashed border-muted-foreground/15">
                        <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">No entries yet</p>
                        <p className="text-[11px] text-muted-foreground/60 mt-1">
                          Be the first to enter this contest!
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                        {leaderboard.map((entry, idx) => (
                          <LeaderboardRow
                            key={entry.workspaceId}
                            entry={entry}
                            isCurrent={String(entry.workspaceId) === workspaceIdRef.current}
                            index={idx}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="p-6 text-center">
              <p className="text-sm text-muted-foreground">Failed to load contest details</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}