import { PrismaClient } from '@prisma/client'
import { isDevMode } from '@/lib/runtime-mode'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Query logging is a development convenience and is gated positively: an
    // unset NODE_ENV should not start writing every statement to stdout.
    ...(isDevMode() && { log: ['query'] as const }),
  })

// Deliberately the negative test. This one is about surviving Next's hot
// reload, not about access, and caching the client one time too many is
// harmless where opening a hole is not.
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Enable WAL mode for better concurrent read performance
if (typeof db.$queryRaw !== 'undefined') {
  db.$executeRaw`PRAGMA journal_mode=WAL;`.catch(() => {
    // Ignore if not supported
  });
}