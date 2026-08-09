# ---- Base ----
FROM oven/bun:1 AS base
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production=false

# ---- Builder ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Migrations deliberately do NOT run here — see docker-entrypoint.sh. The
# database is volume-mounted at runtime and does not exist in this stage, so a
# migrate step here would only ever migrate nothing.

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ---- Runner ----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma schema, migrations and client, plus the CLI itself — the entrypoint
# runs `prisma migrate deploy` at startup, so the CLI has to be in this stage
# and not just in the builder.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

COPY --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh

# The database lives on a mounted volume. It has to be writable by this user —
# migrations write, and SQLite also needs to create -wal and -shm siblings in
# the same directory.
RUN mkdir -p /app/db && chown -R nextjs:nodejs /app/db

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]