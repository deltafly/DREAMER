'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Shield,
  Download,
  Trash2,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  Scale,
  ChevronDown,
  ChevronRight,
  Database,
  BarChart3,
  Megaphone,
  Lock,
  Loader2,
  RefreshCw,
  History,
  HardDrive,
  ArrowDownToLine,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConsentRecord {
  id: string;
  kind: string;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
}

interface ExportRecord {
  id: string;
  status: 'pending' | 'completed' | 'expired';
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
}

interface AuditLogEntry {
  id: string;
  action: string;
  resource: string;
  details: string;
  createdAt: string;
}

interface PrivacyPolicy {
  dataController: string;
  dataCollected: string[];
  purposes: string[];
  legalBasis: string[];
  retentionPeriods: Record<string, string>;
  userRights: string[];
  contact: string;
}

interface RetentionSummary {
  [key: string]: number;
}

interface RetentionData {
  summary: RetentionSummary;
  total: number;
}

// ─── Consent Config ───────────────────────────────────────────────────────────

const CONSENT_CONFIG: Record<
  string,
  {
    icon: React.ElementType;
    title: string;
    description: string;
    essential: boolean;
  }
> = {
  data_processing: {
    icon: Database,
    title: 'Data Processing',
    description:
      'Allow processing of your personal data to provide core platform services and maintain your account.',
    essential: false,
  },
  analytics: {
    icon: BarChart3,
    title: 'Analytics',
    description:
      'Help us improve the platform by collecting anonymized usage patterns and performance metrics.',
    essential: false,
  },
  marketing: {
    icon: Megaphone,
    title: 'Marketing',
    description:
      'Receive updates about new features, tips, and promotional content relevant to your interests.',
    essential: false,
  },
  essential: {
    icon: Lock,
    title: 'Essential',
    description:
      'Required for the platform to function. Includes authentication, security, and session management.',
    essential: true,
  },
};

// ─── Animation Variants ───────────────────────────────────────────────────────

const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: 'easeOut' as const },
  }),
} as const;

const fadeVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function statusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200">Completed</Badge>;
    case 'pending':
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200">Pending</Badge>;
    case 'expired':
      return <Badge className="bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400 border-neutral-200">Expired</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function actionIcon(action: string) {
  const a = action.toLowerCase();
  if (a.includes('create') || a.includes('grant') || a.includes('allow'))
    return <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />;
  if (a.includes('delete') || a.includes('revoke') || a.includes('erase'))
    return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
  if (a.includes('export') || a.includes('download'))
    return <Download className="h-4 w-4 text-teal-500 shrink-0" />;
  if (a.includes('update') || a.includes('modify'))
    return <RefreshCw className="h-4 w-4 text-amber-500 shrink-0" />;
  return <Eye className="h-4 w-4 text-neutral-400 shrink-0" />;
}

// ─── Skeleton Loaders ─────────────────────────────────────────────────────────

function PrivacyPolicySkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-4" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ConsentSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GdprTab() {
  // State — privacy policy
  const [privacyPolicy, setPrivacyPolicy] = useState<PrivacyPolicy | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(true);

  // State — consents
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [consentsLoading, setConsentsLoading] = useState(true);
  const [togglingKind, setTogglingKind] = useState<string | null>(null);

  // State — exports
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [exportsLoading, setExportsLoading] = useState(true);
  const [exportRequesting, setExportRequesting] = useState(false);

  // State — erasure
  const [eraseLoading, setEraseLoading] = useState(false);

  // State — retention
  const [retention, setRetention] = useState<RetentionData | null>(null);
  const [retentionLoading, setRetentionLoading] = useState(true);
  const [retentionProcessing, setRetentionProcessing] = useState(false);

  // State — audit
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditPage, setAuditPage] = useState(1);

  // ─── Fetchers ─────────────────────────────────────────────────────────────

  const fetchPrivacy = useCallback(async () => {
    try {
      const res = await fetch('/api/gdpr/privacy');
      if (!res.ok) throw new Error('Failed to load privacy policy');
      const data = await res.json();
      setPrivacyPolicy(data.policy);
    } catch (err) {
      toast.error('Could not load privacy policy');
    } finally {
      setPrivacyLoading(false);
    }
  }, []);

  const fetchConsents = useCallback(async () => {
    try {
      const res = await fetch('/api/gdpr/consent');
      if (!res.ok) throw new Error('Failed to load consents');
      const data = await res.json();
      setConsents(data.consents ?? []);
    } catch (err) {
      toast.error('Could not load consent preferences');
    } finally {
      setConsentsLoading(false);
    }
  }, []);

  const fetchExports = useCallback(async () => {
    try {
      const res = await fetch('/api/gdpr/export');
      if (!res.ok) throw new Error('Failed to load exports');
      const data = await res.json();
      setExports(data.exports ?? []);
    } catch (err) {
      toast.error('Could not load export history');
    } finally {
      setExportsLoading(false);
    }
  }, []);

  const fetchRetention = useCallback(async () => {
    try {
      const res = await fetch('/api/gdpr/retention');
      if (!res.ok) throw new Error('Failed to load retention data');
      const data = await res.json();
      setRetention(data);
    } catch (err) {
      toast.error('Could not load retention summary');
    } finally {
      setRetentionLoading(false);
    }
  }, []);

  const fetchAudit = useCallback(
    async (page: number, append: boolean = false) => {
      try {
        setAuditLoading(true);
        const res = await fetch(`/api/gdpr/audit?page=${page}`);
        if (!res.ok) throw new Error('Failed to load audit log');
        const data = await res.json();
        setAuditLogs((prev) => (append ? [...prev, ...(data.logs ?? [])] : data.logs ?? []));
        setAuditTotal(data.total ?? 0);
        setAuditPage(page);
      } catch (err) {
        toast.error('Could not load audit log');
      } finally {
        setAuditLoading(false);
      }
    },
    []
  );

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleToggleConsent = async (kind: string, granted: boolean) => {
    setTogglingKind(kind);
    try {
      const res = await fetch('/api/gdpr/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, granted }),
      });
      if (!res.ok) throw new Error('Failed to update consent');
      const data = await res.json();
      setConsents((prev) => {
        const exists = prev.find((c) => c.kind === kind);
        if (exists) {
          return prev.map((c) =>
            c.kind === kind
              ? { ...c, granted, revokedAt: granted ? null : new Date().toISOString() }
              : c
          );
        }
        return [
          ...prev,
          {
            id: data.id ?? crypto.randomUUID(),
            kind,
            granted,
            grantedAt: granted ? new Date().toISOString() : null,
            revokedAt: granted ? null : new Date().toISOString(),
          },
        ];
      });
      toast.success(
        granted
          ? `Consent for ${CONSENT_CONFIG[kind]?.title ?? kind} granted`
          : `Consent for ${CONSENT_CONFIG[kind]?.title ?? kind} revoked`
      );
    } catch (err) {
      toast.error('Failed to update consent preference');
    } finally {
      setTogglingKind(null);
    }
  };

  const handleRequestExport = async () => {
    setExportRequesting(true);
    try {
      const res = await fetch('/api/gdpr/export', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to request export');
      const data = await res.json();
      setExports((prev) => [data, ...prev]);
      toast.success('Data export requested successfully');
    } catch (err) {
      toast.error('Failed to request data export');
    } finally {
      setExportRequesting(false);
    }
  };

  const handleDownloadExport = async (exportId: string) => {
    try {
      const res = await fetch('/api/gdpr/export');
      if (!res.ok) throw new Error('Failed to fetch exports');
      const data = await res.json();
      const target = (data.exports ?? []).find((e: ExportRecord) => e.id === exportId);
      if (!target) throw new Error('Export not found');

      // Create a downloadable JSON blob with the export metadata
      const blob = new Blob([JSON.stringify(target, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `onebrainer-data-export-${exportId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (err) {
      toast.error('Failed to download export');
    }
  };

  const handleEraseData = async () => {
    setEraseLoading(true);
    try {
      const res = await fetch('/api/gdpr/erase', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Erasure failed');
      }
      toast.success('Your data has been erased successfully');
      // Refresh all data
      fetchConsents();
      fetchExports();
      fetchRetention();
      fetchAudit(1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erasure failed';
      toast.error(message);
    } finally {
      setEraseLoading(false);
    }
  };

  const handleProcessRetention = async () => {
    setRetentionProcessing(true);
    try {
      const res = await fetch('/api/gdpr/retention', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to process retention');
      const data = await res.json();
      toast.success(`${data.deleted ?? 0} expired records cleaned up`);
      fetchRetention();
      fetchAudit(1);
    } catch (err) {
      toast.error('Failed to process retention cleanup');
    } finally {
      setRetentionProcessing(false);
    }
  };

  // ─── Init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchPrivacy();
    fetchConsents();
    fetchExports();
    fetchRetention();
    fetchAudit(1);
  }, [fetchPrivacy, fetchConsents, fetchExports, fetchRetention, fetchAudit]);

  // ─── Derived ─────────────────────────────────────────────────────────────

  const grantedCount = consents.filter((c) => c.granted).length;
  const totalConsents = Object.keys(CONSENT_CONFIG).length;
  const consentMap = Object.fromEntries(consents.map((c) => [c.kind, c]));

  const DATA_TYPES_TO_ERASE = [
    'Personal profile information',
    'Authentication & session data',
    'Consent preferences & history',
    'Analytics & usage data',
    'Export request history',
    'Audit log entries',
    'Marketing preferences',
    'All associated metadata',
  ];

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Section 1: Privacy Policy ─────────────────────────────────────── */}
      <motion.div custom={0} variants={sectionVariants} initial="hidden" animate="visible">
        {privacyLoading ? (
          <PrivacyPolicySkeleton />
        ) : privacyPolicy ? (
          <Card className="border-emerald-200/60 dark:border-emerald-800/40">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/60">
                  <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">Privacy Policy</CardTitle>
                  <CardDescription>
                    Data controller: {privacyPolicy.dataController}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 px-6 pb-6">
              {/* Data Controller */}
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Data Controller</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3 pt-1 text-sm text-muted-foreground">
                    {privacyPolicy.dataController}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Separator />

              {/* Data Collected */}
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Data Collected</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="px-3 pb-3 pt-1 space-y-1.5">
                    {privacyPolicy.dataCollected.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>

              <Separator />

              {/* Purposes */}
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Purposes of Processing</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="px-3 pb-3 pt-1 space-y-1.5">
                    {privacyPolicy.purposes.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-teal-500 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>

              <Separator />

              {/* Legal Basis */}
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Legal Basis</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="px-3 pb-3 pt-1 space-y-1.5">
                    {privacyPolicy.legalBasis.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>

              <Separator />

              {/* Retention Periods */}
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Retention Periods</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3 pt-1 space-y-2">
                    {Object.entries(privacyPolicy.retentionPeriods).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="font-medium capitalize text-foreground/80">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="text-muted-foreground">{value}</span>
                        </div>
                      )
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Separator />

              {/* User Rights */}
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Your Rights (GDPR)</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="px-3 pb-3 pt-1 space-y-1.5">
                    {privacyPolicy.userRights.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-500 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>

              <Separator />

              {/* Contact */}
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Contact</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3 pt-1 text-sm text-muted-foreground">
                    {privacyPolicy.contact}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Could not load privacy policy.
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* ── Section 2: Consent Management ─────────────────────────────────── */}
      <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/60">
            <CheckCircle className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Consent Management</h3>
            <p className="text-sm text-muted-foreground">
              Manage how your data is processed
            </p>
          </div>
        </div>

        {/* Consent summary bar */}
        {!consentsLoading && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                {grantedCount} of {totalConsents} consents granted
              </p>
              <div className="mt-1.5 h-2 w-full max-w-xs overflow-hidden rounded-full bg-emerald-200 dark:bg-emerald-800">
                <motion.div
                  className="h-full rounded-full bg-emerald-500"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${totalConsents > 0 ? (grantedCount / totalConsents) * 100 : 0}%`,
                  }}
                  transition={{ duration: 0.6, ease: 'easeOut' as const }}
                />
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
            >
              {Math.round(
                totalConsents > 0 ? (grantedCount / totalConsents) * 100 : 0
              )}
              %
            </Badge>
          </div>
        )}

        {consentsLoading ? (
          <ConsentSkeleton />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(CONSENT_CONFIG).map(([kind, config]) => {
              const record = consentMap[kind];
              const granted = record?.granted ?? false;
              const Icon = config.icon;
              const isToggling = togglingKind === kind;

              return (
                <motion.div
                  key={kind}
                  variants={fadeVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <Card
                    className={`transition-colors ${
                      config.essential
                        ? 'border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/30 dark:bg-emerald-950/10'
                        : granted
                          ? 'border-emerald-200/60 dark:border-emerald-800/40'
                          : ''
                    }`}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                              config.essential
                                ? 'bg-emerald-100 dark:bg-emerald-900/60'
                                : granted
                                  ? 'bg-emerald-100 dark:bg-emerald-900/60'
                                  : 'bg-muted'
                            }`}
                          >
                            <Icon
                              className={`h-5 w-5 ${
                                config.essential || granted
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-muted-foreground'
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold">{config.title}</h4>
                              {config.essential && (
                                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 text-[10px] px-1.5 py-0">
                                  Required
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                              {config.description}
                            </p>
                            {record?.grantedAt && (
                              <p className="mt-2 text-[11px] text-muted-foreground/70">
                                Last updated: {formatShortDate(record.grantedAt)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 pt-1">
                          {isToggling ? (
                            <div className="flex h-5 w-9 items-center justify-center">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          ) : (
                            <Switch
                              checked={config.essential ? true : granted}
                              disabled={config.essential}
                              onCheckedChange={(checked) =>
                                handleToggleConsent(kind, checked)
                              }
                              className="data-[state=checked]:bg-emerald-600"
                            />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* ── Section 3: Data Export ────────────────────────────────────────── */}
      <motion.div custom={2} variants={sectionVariants} initial="hidden" animate="visible">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/60">
              <Download className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Data Export</h3>
              <p className="text-sm text-muted-foreground">
                Right to access — GDPR Art. 15
              </p>
            </div>
          </div>
          <Button
            onClick={handleRequestExport}
            disabled={exportRequesting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {exportRequesting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowDownToLine className="mr-2 h-4 w-4" />
            )}
            Request Data Export
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {exportsLoading ? (
              <div className="p-5">
                <TableSkeleton />
              </div>
            ) : exports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No exports requested</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Request a data export to download a copy of all your data.
                </p>
              </div>
            ) : (
              <ScrollArea className="max-h-72">
                <div className="divide-y">
                  {exports.map((exp) => (
                    <div
                      key={exp.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium truncate">
                            Export #{exp.id.slice(0, 8)}
                          </span>
                          {statusBadge(exp.status)}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Requested: {formatDate(exp.requestedAt)}
                          {exp.completedAt && (
                            <> · Completed: {formatShortDate(exp.completedAt)}</>
                          )}
                          {exp.expiresAt && (
                            <> · Expires: {formatShortDate(exp.expiresAt)}</>
                          )}
                        </p>
                      </div>
                      {exp.status === 'completed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadExport(exp.id)}
                          className="shrink-0 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          Download
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Section 4: Right to Erasure ───────────────────────────────────── */}
      <motion.div custom={3} variants={sectionVariants} initial="hidden" animate="visible">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40">
            <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Right to Erasure</h3>
            <p className="text-sm text-muted-foreground">
              GDPR Art. 17 — Permanent and irreversible
            </p>
          </div>
        </div>

        <Card className="border-red-200/60 dark:border-red-800/40 bg-red-50/30 dark:bg-red-950/10">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle className="text-base text-red-700 dark:text-red-300">
                  Danger Zone
                </CardTitle>
                <CardDescription className="text-red-600/80 dark:text-red-400/80">
                  This action is permanent and cannot be undone. All your data will be
                  irreversibly deleted from our systems.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2 text-foreground/80">
                The following data will be permanently deleted:
              </p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {DATA_TYPES_TO_ERASE.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <Separator className="bg-red-200/60 dark:bg-red-800/40" />

            {/* Demo account notice */}
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/20 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <span className="font-semibold">Demo Account:</span> Data erasure is
                disabled for demonstration accounts. This is a preview of the erasure
                flow.
              </p>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={eraseLoading}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {eraseLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete All My Data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
                    <AlertTriangle className="h-5 w-5" />
                    Confirm Data Erasure
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3">
                      <p>
                        Are you absolutely sure? This will permanently delete all your
                        personal data, including:
                      </p>
                      <ul className="list-disc list-inside text-sm space-y-1 ml-1">
                        <li>Your account and profile information</li>
                        <li>All consent preferences and history</li>
                        <li>Analytics and usage data</li>
                        <li>Export request history</li>
                        <li>All associated metadata and logs</li>
                      </ul>
                      <p className="font-semibold text-red-600 dark:text-red-400">
                        This action cannot be reversed.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleEraseData}
                    disabled={eraseLoading}
                    className="bg-red-600 hover:bg-red-700 text-white focus:ring-red-600"
                  >
                    {eraseLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Yes, Delete Everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Section 5: Data Retention ─────────────────────────────────────── */}
      <motion.div custom={4} variants={sectionVariants} initial="hidden" animate="visible">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/60">
              <HardDrive className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Data Retention</h3>
              <p className="text-sm text-muted-foreground">
                Records older than 90 days eligible for cleanup
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleProcessRetention}
            disabled={retentionProcessing || (retention?.total ?? 0) === 0}
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
          >
            {retentionProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Process Retention
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {retentionLoading ? (
              <div className="p-5">
                <TableSkeleton />
              </div>
            ) : retention && retention.total > 0 ? (
              <ScrollArea className="max-h-72">
                <div className="divide-y">
                  {Object.entries(retention.summary).map(([model, count]) => (
                    <div
                      key={model}
                      className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                          <Database className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium capitalize">
                            {model.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Eligible for cleanup
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-amber-700 border-amber-200 dark:text-amber-300 dark:border-amber-800">
                        {count as number} record{(count as number) !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 mb-3">
                  <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-sm font-medium">All clear</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No records older than 90 days found.
                </p>
              </div>
            )}
          </CardContent>
          {retention && retention.total > 0 && (
            <div className="border-t px-5 py-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">
                Total old records:{' '}
                <span className="font-semibold text-foreground">
                  {retention.total}
                </span>
              </p>
            </div>
          )}
        </Card>
      </motion.div>

      {/* ── Section 6: Audit Log ──────────────────────────────────────────── */}
      <motion.div custom={5} variants={sectionVariants} initial="hidden" animate="visible">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/60">
            <History className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Audit Log</h3>
            <p className="text-sm text-muted-foreground">
              Recent data processing activities
              {auditTotal > 0 && (
                <span className="ml-1 text-xs text-muted-foreground/70">
                  ({auditTotal} total)
                </span>
              )}
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {auditLogs.length === 0 && auditLoading ? (
              <div className="p-5">
                <TableSkeleton />
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                  <History className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No audit entries</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Audit log entries will appear as data processing activities occur.
                </p>
              </div>
            ) : (
              <>
                <ScrollArea className="max-h-96">
                  <div className="divide-y">
                    {auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 px-5 py-3 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-2 shrink-0 sm:w-40">
                          {actionIcon(log.action)}
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(log.createdAt)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[11px] shrink-0 font-mono">
                            {log.action}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate">
                            {log.resource}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground/70 truncate sm:text-right sm:max-w-[200px]">
                          {log.details}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                {auditLogs.length < auditTotal && (
                  <div className="border-t px-5 py-3 bg-muted/30 flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fetchAudit(auditPage + 1, true)}
                      disabled={auditLoading}
                      className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    >
                      {auditLoading ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Clock className="mr-2 h-3.5 w-3.5" />
                      )}
                      Load More
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}