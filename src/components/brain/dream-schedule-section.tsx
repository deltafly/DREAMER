'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles, Moon, BookOpen, Clock, Play, Loader2, Calendar, Globe,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { useWorkspaceId, wsUrl } from '@/lib/use-workspace-id';

// ===== DREAM & SCHEDULE SECTION =====

const DREAMER_PRESETS = [
  { label: 'Minden éjjel 3:00', value: '0 3 * * *' },
  { label: 'Kétnaponta hajnalban', value: '0 3 */2 * *' },
  { label: '6 óránként', value: '0 */6 * * *' },
  { label: 'Hetente vasárnap éjjel', value: '0 2 * * 0' },
  { label: 'Havonta 1-jén', value: '0 3 1 * *' },
  { label: 'Egyéni (cron)', value: '__custom__' },
];

const LIBRARIAN_PRESETS = [
  { label: '4 óránként', value: '0 */4 * * *' },
  { label: '6 óránként', value: '0 */6 * * *' },
  { label: '8 óránként', value: '0 */8 * * *' },
  { label: 'Naponta éjjel', value: '0 2 * * *' },
  { label: 'Naponta délben', value: '0 12 * * *' },
  { label: 'Egyéni (cron)', value: '__custom__' },
];

const COMMON_TIMEZONES = [
  { label: 'Europe/Budapest', value: 'Europe/Budapest' },
  { label: 'Europe/London', value: 'Europe/London' },
  { label: 'Europe/Berlin', value: 'Europe/Berlin' },
  { label: 'US/Eastern', value: 'US/Eastern' },
  { label: 'US/Pacific', value: 'US/Pacific' },
  { label: 'Asia/Tokyo', value: 'Asia/Tokyo' },
  { label: 'UTC', value: 'UTC' },
];

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Soha';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('hu-HU', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function DreamAndScheduleSection() {
  const queryClient = useQueryClient();
  const wsId = useWorkspaceId();

  // Fetch settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['workspace-settings', wsId],
    queryFn: () => fetch(wsUrl('/api/settings', wsId)).then(r => r.json()),
    staleTime: 10_000,
  });

  // Local UI state only for transient interactions
  const [customDreamerCron, setCustomDreamerCron] = useState('');
  const [customLibrarianCron, setCustomLibrarianCron] = useState('');
  const [showCustomDreamer, setShowCustomDreamer] = useState(false);
  const [showCustomLibrarian, setShowCustomLibrarian] = useState(false);

  // Derive from server state
  const dreamerEnabled = settings?.dreamerEnabled ?? false;
  const librarianEnabled = settings?.librarianEnabled ?? false;
  const dreamerSchedule = settings?.dreamerSchedule ?? '0 3 * * *';
  const librarianSchedule = settings?.librarianSchedule ?? '0 */4 * * *';
  const timezone = settings?.timezone ?? 'Europe/Budapest';

  const isDreamerCustom = !DREAMER_PRESETS.find(p => p.value === dreamerSchedule);
  const isLibrarianCustom = !LIBRARIAN_PRESETS.find(p => p.value === librarianSchedule);

  // Update settings mutation
  const updateSettings = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const res = await fetch(wsUrl('/api/settings', wsId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Settings update failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-settings', wsId] });
      queryClient.invalidateQueries({ queryKey: ['sparks'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['neural-stats'] });
    },
  });

  // Manual trigger mutations
  const runDreamerManual = useMutation({
    mutationFn: () => fetch(wsUrl('/api/dreamer/run', wsId), { method: 'POST' }).then(r => r.json()),
    onSuccess: (data) => {
      toast.success(data.summary || 'Dreamer futás befejeződött');
      queryClient.invalidateQueries({ queryKey: ['workspace-settings', wsId] });
      queryClient.invalidateQueries({ queryKey: ['sparks'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (err: Error) => toast.error(`Dreamer hiba: ${err.message}`),
  });

  const runLibrarianManual = useMutation({
    mutationFn: () => fetch(wsUrl('/api/librarian', wsId), { method: 'POST' }).then(r => r.json()),
    onSuccess: (data) => {
      toast.success(data.summary || 'Librarian futás befejeződött');
      queryClient.invalidateQueries({ queryKey: ['workspace-settings', wsId] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (err: Error) => toast.error(`Librarian hiba: ${err.message}`),
  });

  const handleDreamerScheduleChange = (value: string) => {
    if (value === '__custom__') {
      setShowCustomDreamer(true);
      setCustomDreamerCron(dreamerSchedule);
      return;
    }
    setShowCustomDreamer(false);
    updateSettings.mutate({ dreamerSchedule: value });
  };

  const handleLibrarianScheduleChange = (value: string) => {
    if (value === '__custom__') {
      setShowCustomLibrarian(true);
      setCustomLibrarianCron(librarianSchedule);
      return;
    }
    setShowCustomLibrarian(false);
    updateSettings.mutate({ librarianSchedule: value });
  };

  const handleCustomDreamerApply = () => {
    if (customDreamerCron.trim()) {
      updateSettings.mutate({ dreamerSchedule: customDreamerCron.trim() });
    }
  };

  const handleCustomLibrarianApply = () => {
    if (customLibrarianCron.trim()) {
      updateSettings.mutate({ librarianSchedule: customLibrarianCron.trim() });
    }
  };

  if (settingsLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isUpdating = updateSettings.isPending;
  const dreamerRunning = runDreamerManual.isPending;
  const librarianRunning = runLibrarianManual.isPending;

  // The Select value must be one of the preset values or '__custom__'
  const dreamerSelectValue = isDreamerCustom ? '__custom__' : dreamerSchedule;
  const librarianSelectValue = isLibrarianCustom ? '__custom__' : librarianSchedule;
  const showDreamerCustomInput = showCustomDreamer || isDreamerCustom;
  const showLibrarianCustomInput = showCustomLibrarian || isLibrarianCustom;

  return (
    <TooltipProvider delayDuration={300}>
      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center ring-2 ring-violet-500/10">
                <Moon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold tracking-tight flex items-center gap-2">
                  Álom és ütemezés
                  {settings?.dreamerEnabled || settings?.librarianEnabled ? (
                    <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 bg-violet-500/5 border-violet-500/20 text-violet-600 dark:text-violet-400">
                      AKTÍV
                      <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 text-muted-foreground">
                      INAKTÍV
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-[11px] mt-0.5">
                  A Dreamer és Librarian automatikus, ütemezett futtatása
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ─── Dreamer Card ─── */}
            <div className="p-4 rounded-xl border border-border/50 bg-gradient-to-br from-violet-500/5 to-transparent space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <Label htmlFor="dreamer-toggle" className="text-xs font-semibold cursor-pointer">
                    Éjszakai álom (Dreamer)
                  </Label>
                </div>
                <Switch
                  id="dreamer-toggle"
                  checked={dreamerEnabled}
                  onCheckedChange={(checked) => updateSettings.mutate({ dreamerEnabled: checked })}
                  disabled={isUpdating}
                />
              </div>

              {/* Schedule selector */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Ütemezés</Label>
                <Select value={dreamerSelectValue} onValueChange={handleDreamerScheduleChange} disabled={isUpdating}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Válassz ütemezést..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DREAMER_PRESETS.map(p => (
                      <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {showDreamerCustomInput && (
                  <div className="flex gap-1.5">
                    <Input
                      value={customDreamerCron}
                      onChange={e => setCustomDreamerCron(e.target.value)}
                      placeholder="0 3 * * *"
                      className="h-7 text-xs font-mono"
                      onKeyDown={e => e.key === 'Enter' && handleCustomDreamerApply()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[10px] shrink-0"
                      onClick={handleCustomDreamerApply}
                      disabled={isUpdating || !customDreamerCron.trim()}
                    >
                      Mentés
                    </Button>
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-help">
                      <Clock className="h-3 w-3" />
                      <span>Utolsó: {formatRelativeTime(settings?.dreamerLastRunAt)}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {formatDateTime(settings?.dreamerLastRunAt)}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-help">
                      <Calendar className="h-3 w-3" />
                      <span>Következő: {formatRelativeTime(settings?.dreamerNextRunAt)}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {formatDateTime(settings?.dreamerNextRunAt)}
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Manual trigger */}
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs gap-1.5 border-violet-500/20 text-violet-600 hover:bg-violet-500/10 dark:text-violet-400"
                onClick={() => runDreamerManual.mutate()}
                disabled={dreamerRunning}
              >
                {dreamerRunning ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Álmodik...</>
                ) : (
                  <><Play className="h-3 w-3" /> Álmodj most</>
                )}
              </Button>
            </div>

            {/* ─── Librarian Card ─── */}
            <div className="p-4 rounded-xl border border-border/50 bg-gradient-to-br from-amber-500/5 to-transparent space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-amber-500" />
                  <Label htmlFor="librarian-toggle" className="text-xs font-semibold cursor-pointer">
                    Automatikus rendezés (Librarian)
                  </Label>
                </div>
                <Switch
                  id="librarian-toggle"
                  checked={librarianEnabled}
                  onCheckedChange={(checked) => updateSettings.mutate({ librarianEnabled: checked })}
                  disabled={isUpdating}
                />
              </div>

              {/* Schedule selector */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Ütemezés</Label>
                <Select value={librarianSelectValue} onValueChange={handleLibrarianScheduleChange} disabled={isUpdating}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Válassz ütemezést..." />
                  </SelectTrigger>
                  <SelectContent>
                    {LIBRARIAN_PRESETS.map(p => (
                      <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {showLibrarianCustomInput && (
                  <div className="flex gap-1.5">
                    <Input
                      value={customLibrarianCron}
                      onChange={e => setCustomLibrarianCron(e.target.value)}
                      placeholder="0 */4 * * *"
                      className="h-7 text-xs font-mono"
                      onKeyDown={e => e.key === 'Enter' && handleCustomLibrarianApply()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[10px] shrink-0"
                      onClick={handleCustomLibrarianApply}
                      disabled={isUpdating || !customLibrarianCron.trim()}
                    >
                      Mentés
                    </Button>
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-help">
                      <Clock className="h-3 w-3" />
                      <span>Utolsó: {formatRelativeTime(settings?.librarianLastRunAt)}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {formatDateTime(settings?.librarianLastRunAt)}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-help">
                      <Calendar className="h-3 w-3" />
                      <span>Következő: {formatRelativeTime(settings?.librarianNextRunAt)}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {formatDateTime(settings?.librarianNextRunAt)}
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Manual trigger */}
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs gap-1.5 border-amber-500/20 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                onClick={() => runLibrarianManual.mutate()}
                disabled={librarianRunning}
              >
                {librarianRunning ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Rendez...</>
                ) : (
                  <><Play className="h-3 w-3" /> Rendezd most</>
                )}
              </Button>
            </div>
          </div>

          {/* ─── Timezone ─── */}
          <Separator className="my-1" />
          <div className="flex items-center gap-3">
            <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider shrink-0">Időzóna</Label>
            <Select value={timezone} onValueChange={(v) => updateSettings.mutate({ timezone: v })} disabled={isUpdating}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map(tz => (
                  <SelectItem key={tz.value} value={tz.value} className="text-xs">{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mutation error display */}
          <AnimatePresence>
            {updateSettings.isError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-xs text-red-500 bg-red-500/10 rounded-lg p-2.5"
              >
                {updateSettings.error instanceof Error ? updateSettings.error.message : 'Hiba a mentésnél'}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}