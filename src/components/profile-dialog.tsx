'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, User, Lock, Mail, Save } from 'lucide-react';
import { toast } from 'sonner';

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UserProfile {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const { data: session, update } = useSession();
  const [tab, setTab] = useState<'profile' | 'password'>('profile');

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const fetchProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const r = await fetch('/api/user/profile');
      if (r.ok) {
        const data = await r.json();
        setProfile(data);
        setName(data.name || '');
      }
    } catch {
      // silent
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchProfile();
      setTab('profile');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [open, fetchProfile]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingName(true);
    try {
      const r = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error?.message || 'Failed to update profile');
        return;
      }
      toast.success('Profil sikeresen frissítve');
      // Update NextAuth session
      await update({ name: name.trim() });
      setProfile((prev) => prev ? { ...prev, name: name.trim() } : prev);
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('A jelszavak nem egyeznek');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Az új jelszó legalább 8 karakter');
      return;
    }
    setSavingPassword(true);
    try {
      const r = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error?.message || 'Failed to change password');
        return;
      }
      toast.success('Jelszó sikeresen megváltoztatva');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      toast.error('Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const displayName = session?.user?.name || profile?.name || 'Profil';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 overflow-hidden border-border/50">
        {/* Header with gradient accent */}
        <div className="relative px-6 pt-6 pb-4">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500" />
          <DialogHeader>
            <DialogTitle className="text-lg">{displayName}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {profile?.email || session?.user?.email}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/50 px-6">
          <button
            type="button"
            onClick={() => setTab('profile')}
            className={`relative px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === 'profile'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/80'
            }`}
          >
            Profil
            {tab === 'profile' && (
              <span className="absolute bottom-0 inset-x-2 h-[2px] bg-emerald-500 rounded-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('password')}
            className={`relative px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === 'password'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/80'
            }`}
          >
            Jelszó
            {tab === 'password' && (
              <span className="absolute bottom-0 inset-x-2 h-[2px] bg-emerald-500 rounded-full" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {profileLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : tab === 'profile' ? (
            <form onSubmit={handleSaveName} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="profile-email" className="text-xs text-muted-foreground">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                  <Input
                    id="profile-email"
                    type="email"
                    value={profile?.email || ''}
                    readOnly
                    className="h-9 pl-9 text-sm bg-muted/30 border-border/40 text-muted-foreground"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-name" className="text-xs text-muted-foreground">
                  Név
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                  <Input
                    id="profile-name"
                    type="text"
                    placeholder="Your name"
                    className="h-9 pl-9 text-sm bg-muted/30 border-border/40 focus:bg-background focus:border-emerald-500/50 transition-colors"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={savingName}
                    maxLength={100}
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={savingName || !name.trim()}
                className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all"
              >
                {savingName ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Mentés…
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    Mentés
                  </>
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="current-password" className="text-xs text-muted-foreground">
                  Jelenlegi jelszó
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                  <Input
                    id="current-password"
                    type="password"
                    placeholder="••••••••"
                    className="h-9 pl-9 text-sm bg-muted/30 border-border/40 focus:bg-background focus:border-emerald-500/50 transition-colors"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    disabled={savingPassword}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-xs text-muted-foreground">
                  Új jelszó (min. 8 karakter)
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="••••••••"
                    className="h-9 pl-9 text-sm bg-muted/30 border-border/40 focus:bg-background focus:border-emerald-500/50 transition-colors"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={savingPassword}
                    minLength={8}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-xs text-muted-foreground">
                  Megerősítés
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    className="h-9 pl-9 text-sm bg-muted/30 border-border/40 focus:bg-background focus:border-emerald-500/50 transition-colors"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={savingPassword}
                    minLength={8}
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all"
              >
                {savingPassword ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Módosítás…
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    Jelszó módosítása
                  </>
                )}
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}