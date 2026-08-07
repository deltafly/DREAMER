'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'onebrainer-workspace-id';

/**
 * Read the active workspace ID from localStorage (same key WorkspaceSwitcher writes).
 * Returns a string so it can be directly used as a URL search param value.
 */
export function useWorkspaceId(): string | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    // Read on mount + listen for storage events (e.g. another tab switching)
    const read = () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      setId(raw);
    };
    read();
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
  }, []);

  return id;
}

/**
 * Append ?workspace=X (or &workspace=X) to a URL string.
 * If workspaceId is falsy, returns the URL unchanged.
 */
export function wsUrl(url: string, workspaceId: string | null | undefined): string {
  if (!workspaceId) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}workspace=${workspaceId}`;
}