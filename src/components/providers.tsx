'use client';

import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/components/auth-provider';
import { QueryProvider } from '@/components/query-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <AuthProvider>
        <QueryProvider>{children}</QueryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}