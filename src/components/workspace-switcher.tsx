'use client';

import { useState, useEffect, useCallback } from 'react';
import { Brain, ChevronDown, Plus, Loader2, Check, Shield, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface Workspace {
  id: number;
  name: string;
  plan: string;
  role: string;
  createdAt: string;
}

const planBadge = (plan: string) => {
  switch (plan) {
    case 'pro':
      return (
        <Badge className="h-4 px-1.5 text-[9px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/15">
          Pro
        </Badge>
      );
    case 'team':
      return (
        <Badge className="h-4 px-1.5 text-[9px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15">
          Team
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-medium text-muted-foreground">
          Free
        </Badge>
      );
  }
};

const roleBadge = (role: string) => {
  return role === 'owner' ? (
    <span className="flex items-center gap-0.5 text-[9px] text-amber-600 dark:text-amber-400 font-medium">
      <Shield className="h-2.5 w-2.5" />Owner
    </span>
  ) : (
    <span className="text-[9px] text-muted-foreground font-medium">Member</span>
  );
};

export function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // Rename state
  const [renameTarget, setRenameTarget] = useState<Workspace | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const r = await fetch('/api/workspaces');
      if (r.ok) {
        const data = await r.json();
        setWorkspaces(Array.isArray(data) ? data : data.workspaces || []);
      }
    } catch {
      // silently fail — will show defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    const saved = localStorage.getItem('onebrainer-workspace-id');
    if (saved) setCurrentId(saved);
    else if (workspaces.length > 0) {
      setCurrentId(String(workspaces[0].id));
      localStorage.setItem('onebrainer-workspace-id', String(workspaces[0].id));
    }
  }, [workspaces]);

  const currentWorkspace = workspaces.find((w) => String(w.id) === currentId);

  const handleSwitch = (id: string) => {
    setCurrentId(id);
    localStorage.setItem('onebrainer-workspace-id', id);
    window.location.reload();
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (r.ok) {
        const data = await r.json();
        toast.success(`Brain "${newName.trim()}" created!`);
        setNewName('');
        setShowCreate(false);
        await fetchWorkspaces();
        // Switch to newly created workspace
        handleSwitch(String(data.id));
      } else {
        const data = await r.json();
        toast.error(data.error || 'Failed to create brain');
      }
    } catch {
      toast.error('Failed to create brain');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameName.trim()) return;
    setRenaming(true);
    try {
      const r = await fetch(`/api/workspaces/${renameTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameName.trim() }),
      });
      if (r.ok) {
        toast.success(`Brain renamed to "${renameName.trim()}"`);
        setRenameTarget(null);
        setRenameName('');
        await fetchWorkspaces();
      } else {
        const data = await r.json();
        toast.error(data.error || 'Failed to rename brain');
      }
    } catch {
      toast.error('Failed to rename brain');
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/workspaces/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (r.ok) {
        toast.success(`Brain "${deleteTarget.name}" deleted`);
        const deletedId = String(deleteTarget.id);
        setDeleteTarget(null);
        await fetchWorkspaces();
        // If deleted the current workspace, switch to the next available
        if (deletedId === currentId) {
          const remaining = workspaces.filter((w) => String(w.id) !== deletedId);
          if (remaining.length > 0) {
            handleSwitch(String(remaining[0].id));
          } else {
            localStorage.removeItem('onebrainer-workspace-id');
            window.location.reload();
          }
        }
      } else {
        const data = await r.json();
        toast.error(data.error || 'Failed to delete brain');
      }
    } catch {
      toast.error('Failed to delete brain');
    } finally {
      setDeleting(false);
    }
  };

  const openRename = (ws: Workspace) => {
    setRenameTarget(ws);
    setRenameName(ws.name);
  };

  // Fallback: if no workspaces fetched, show default
  const displayName = currentWorkspace?.name || 'Default Brain';
  const displayCount = workspaces.length;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs font-medium hover:bg-muted/60 transition-colors"
          >
            <div className="h-5 w-5 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Brain className="h-3 w-3 text-white" />
            </div>
            <span className="hidden sm:inline max-w-[100px] truncate">{displayName}</span>
            {displayCount > 1 && (
              <Badge
                variant="outline"
                className="h-4 px-1 text-[9px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              >
                {displayCount}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 p-1.5">
          <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Brains
          </DropdownMenuLabel>

          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </div>
          ) : workspaces.length === 0 ? (
            <div className="px-2 py-3 text-center">
              <p className="text-[11px] text-muted-foreground">No brains yet</p>
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto">
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className={`group flex items-center gap-1 px-1 rounded-lg mx-0.5 my-0.5 ${
                    String(ws.id) === currentId
                      ? 'bg-emerald-500/10 dark:bg-emerald-500/5'
                      : ''
                  }`}
                >
                  {/* Main clickable area */}
                  <button
                    type="button"
                    onClick={() => handleSwitch(String(ws.id))}
                    className="flex-1 flex items-center gap-2.5 px-1.5 py-2 rounded-lg cursor-pointer text-left min-w-0"
                  >
                    <div className="h-7 w-7 rounded-md bg-muted/60 flex items-center justify-center shrink-0">
                      <Brain className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate">{ws.name}</span>
                        {String(ws.id) === currentId && (
                          <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {planBadge(ws.plan)}
                        <span className="text-muted-foreground/30">·</span>
                        {roleBadge(ws.role)}
                      </div>
                    </div>
                  </button>

                  {/* Owner action buttons — visible on hover */}
                  {ws.role === 'owner' && (
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openRename(ws); }}
                        className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                        title="Rename"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(ws); }}
                        className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <DropdownMenuSeparator className="my-1" />

          {showCreate ? (
            <div className="px-2 py-1.5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreate();
                }}
                className="flex items-center gap-1.5"
              >
                <Input
                  autoFocus
                  placeholder="Brain name…"
                  className="h-7 text-xs bg-muted/30 border-border/40"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={creating}
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-7 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                  disabled={creating || !newName.trim()}
                >
                  {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Create'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-muted-foreground shrink-0"
                  onClick={() => { setShowCreate(false); setNewName(''); }}
                >
                  <span className="sr-only">Cancel</span>
                </Button>
              </form>
            </div>
          ) : (
            <DropdownMenuItem
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer text-emerald-600 dark:text-emerald-400 focus:bg-emerald-500/10"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Create New Brain</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => { if (!open) { setRenameTarget(null); setRenameName(''); } }}>
        <DialogContent className="sm:max-w-[380px] p-0 gap-0 overflow-hidden border-border/50">
          <div className="relative px-6 pt-6 pb-4">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500" />
            <DialogHeader>
              <DialogTitle className="text-lg">Rename Brain</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Change the name of &ldquo;{renameTarget?.name}&rdquo;
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-6 py-5">
            <form onSubmit={(e) => { e.preventDefault(); handleRename(); }} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="rename-input" className="text-xs text-muted-foreground">New name</Label>
                <Input
                  id="rename-input"
                  autoFocus
                  placeholder="Brain name…"
                  className="h-9 text-sm bg-muted/30 border-border/40 focus:bg-background focus:border-emerald-500/50 transition-colors"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  disabled={renaming}
                  maxLength={50}
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-9 text-xs"
                  disabled={renaming}
                  onClick={() => { setRenameTarget(null); setRenameName(''); }}
                >
                  Mégse
                </Button>
                <Button
                  type="submit"
                  className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all"
                  disabled={renaming || !renameName.trim()}
                >
                  {renaming ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Mentés…
                    </>
                  ) : 'Mentés'}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="sm:max-w-[380px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Biztosan törlöd?</AlertDialogTitle>
            <AlertDialogDescription>
              A &ldquo;{deleteTarget?.name}&rdquo; brain és minden hozzá tartozó adat véglegesen törlődik. Ez a művelet nem visszafordítható.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Mégse</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Törlés…
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  Törlés
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}