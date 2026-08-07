import bcrypt from 'bcryptjs';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
// db is used in jwt() callback to check sessionVersion on token refresh

// Block startup if secret is missing in production
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
if (!NEXTAUTH_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error(
    'FATAL: NEXTAUTH_SECRET environment variable is required in production. ' +
    'Generate one with: openssl rand -base64 32'
  );
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Note: rate limiting is handled at the route level
        // (auth/[...nextauth]/route.ts) via IP-keyed limiter.
        // This prevents both brute-force AND account-lockout DoS.

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  cookies: {
    // NextAuth expects the flags under `options` — putting them at the top level
    // type-checks as excess properties and is silently ignored at runtime.
    sessionToken: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
    },
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      // On sign-in, store userId and sessionVersion in the JWT
      if (user) {
        token.userId = Number(user.id);
        token.sessionVersion = (user as unknown as Record<string, unknown>).sessionVersion as number ?? 0;
      }
      // On every token refresh, re-check sessionVersion from DB
      // This invalidates sessions after password changes
      if (trigger === 'update' && token.userId) {
        const dbUser = await db.user.findUnique({
          where: { id: token.userId as number },
          select: { sessionVersion: true },
        });
        if (dbUser && dbUser.sessionVersion !== token.sessionVersion) {
          // Session version mismatch (e.g. password changed) — force re-auth
          // by returning an empty token, which NextAuth treats as unauthenticated.
          return {};
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as Record<string, unknown>).userId = token.userId;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
  secret: NEXTAUTH_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-do-not-use-in-production' : undefined),
};