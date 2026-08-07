'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
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
import { Brain, Loader2, Mail, Lock, User } from 'lucide-react';
import { toast } from 'sonner';

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
  const { data: session } = useSession();
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sign in fields
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');

  // Sign up fields
  const [signUpName, setSignUpName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');

  // If already logged in and dialog somehow opened, close it
  if (session && open) {
    onOpenChange(false);
    return null;
  }

  const resetFields = () => {
    setSignInEmail('');
    setSignInPassword('');
    setSignUpName('');
    setSignUpEmail('');
    setSignUpPassword('');
    setError('');
    setLoading(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetFields();
    onOpenChange(v);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn('credentials', {
        email: signInEmail,
        password: signInPassword,
        redirect: false,
      });
      if (result?.error) {
        setError('Invalid email or password');
      } else {
        toast.success('Welcome back!');
        onOpenChange(false);
        window.location.reload();
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: signUpName,
          email: signUpEmail,
          password: signUpPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }
      // Auto sign in
      const result = await signIn('credentials', {
        email: signUpEmail,
        password: signUpPassword,
        redirect: false,
      });
      if (result?.error) {
        setError('Account created but sign-in failed. Please sign in manually.');
        setTab('signin');
      } else {
        toast.success('Account created! Welcome to OneBrainer.');
        onOpenChange(false);
        window.location.reload();
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 overflow-hidden border-border/50">
        {/* Header with gradient accent */}
        <div className="relative px-6 pt-6 pb-4">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500" />
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Brain className="h-4 w-4 text-white" />
              </div>
              <span>OneBrainer</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {tab === 'signin'
                ? 'Sign in to access your brain'
                : 'Create an account to get started'}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/50 px-6">
          <button
            type="button"
            onClick={() => { setTab('signin'); setError(''); }}
            className={`relative px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === 'signin'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/80'
            }`}
          >
            Sign In
            {tab === 'signin' && (
              <span className="absolute bottom-0 inset-x-2 h-[2px] bg-emerald-500 rounded-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() => { setTab('signup'); setError(''); }}
            className={`relative px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === 'signup'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/80'
            }`}
          >
            Sign Up
            {tab === 'signup' && (
              <span className="absolute bottom-0 inset-x-2 h-[2px] bg-emerald-500 rounded-full" />
            )}
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5">
          {tab === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="signin-email" className="text-xs text-muted-foreground">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="you@example.com"
                    className="h-9 pl-9 text-sm bg-muted/30 border-border/40 focus:bg-background focus:border-emerald-500/50 transition-colors"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signin-password" className="text-xs text-muted-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="••••••••"
                    className="h-9 pl-9 text-sm bg-muted/30 border-border/40 focus:bg-background focus:border-emerald-500/50 transition-colors"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              {error && (
                <p className="text-[11px] text-rose-500 font-medium flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-rose-500 shrink-0" />
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="signup-name" className="text-xs text-muted-foreground">
                  Name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Your name"
                    className="h-9 pl-9 text-sm bg-muted/30 border-border/40 focus:bg-background focus:border-emerald-500/50 transition-colors"
                    value={signUpName}
                    onChange={(e) => setSignUpName(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-email" className="text-xs text-muted-foreground">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    className="h-9 pl-9 text-sm bg-muted/30 border-border/40 focus:bg-background focus:border-emerald-500/50 transition-colors"
                    value={signUpEmail}
                    onChange={(e) => setSignUpEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-password" className="text-xs text-muted-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Min. 6 characters"
                    className="h-9 pl-9 text-sm bg-muted/30 border-border/40 focus:bg-background focus:border-emerald-500/50 transition-colors"
                    value={signUpPassword}
                    onChange={(e) => setSignUpPassword(e.target.value)}
                    required
                    minLength={6}
                    disabled={loading}
                  />
                </div>
              </div>

              {error && (
                <p className="text-[11px] text-rose-500 font-medium flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-rose-500 shrink-0" />
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Creating account…
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}