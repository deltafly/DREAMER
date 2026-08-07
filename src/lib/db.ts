import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(process.env.NODE_ENV !== 'production' && { log: ['query'] }),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Enable WAL mode for better concurrent read performance
if (typeof db.$queryRaw !== 'undefined') {
  db.$executeRaw`PRAGMA journal_mode=WAL;`.catch(() => {
    // Ignore if not supported
  });
}