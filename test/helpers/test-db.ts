/**
 * Disposable database for the tests that need one.
 *
 * The rest of the suite is deliberately offline — no database, no network, no
 * key — because that keeps it instant and makes it run anywhere. But a whole
 * class of defect only exists at the boundary between the code and a real
 * schema, and none of it is reachable from a unit test. The two blockers found
 * on 2026-08-08 were both of that kind: raw SQL naming a table that the
 * migrations do not create, and a column the client selects that the migrations
 * never added. Type-checking, linting and the build all passed.
 *
 * So these tests build an actual database the way a fresh clone does — by
 * applying the migrations, not by pushing the schema. Pushing the schema would
 * defeat the purpose: it would produce the shape the client expects rather than
 * the shape a deployment actually gets, which is the exact difference those two
 * bugs lived in.
 *
 * Usage:
 *
 *     const ctx = await createTestDatabase('brain-query');
 *     try { ... } finally { await ctx.cleanup(); }
 *
 * DATABASE_URL is set before returning, so any module importing `@/lib/db`
 * afterwards binds to this database. Import those modules dynamically, after
 * the call — a static import runs first and would bind to whatever was in the
 * environment before.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Type-only: importing the client itself here would bind it to whatever
// DATABASE_URL held before createTestDatabase ran.
import type { PrismaClient } from '@prisma/client';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

export interface TestDatabase {
  /** Absolute path to the SQLite file. */
  path: string;
  /** Value written to DATABASE_URL. */
  url: string;
  /** Removes the directory and restores the previous DATABASE_URL. */
  cleanup: () => void;
}

export function createTestDatabase(label: string): TestDatabase {
  const dir = mkdtempSync(join(tmpdir(), `onebrainer-test-${label}-`));
  // Forward slashes: Prisma parses the URL, and a backslash is an escape there.
  const path = join(dir, 'test.db').replace(/\\/g, '/');
  const url = `file:${path}`;

  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;

  // The migrations, in order, exactly as a deployment applies them.
  // bunx under bun, npx otherwise, so the same file runs in CI and locally.
  const runner = typeof process.versions.bun === 'string' ? 'bunx' : 'npx';
  execFileSync(runner, ['prisma', 'migrate', 'deploy'], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  return {
    path,
    url,
    cleanup: () => {
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // A held file handle on Windows is not worth failing a green run over.
      }
    },
  };
}

// ===== Fixtures =====

const TS = '2025-01-01 00:00:00';

export interface SeedFact {
  id: number;
  topic: string;
  entity: string;
  attribute: string;
  statement: string;
  stale?: boolean;
  supersededBy?: number | null;
}

/**
 * Minimal, explicit fixtures.
 *
 * Deliberately not `seedWorkspace()`: a test should state the world it needs
 * in the file the reader is looking at, and a demo dataset that grows over time
 * makes assertions drift without anyone editing them.
 */
export async function seedWorkspaceFixture(
  db: PrismaClient,
  options: {
    workspaceId: number;
    userId: number;
    email: string;
    facts?: SeedFact[];
    associations?: { factIdA: number; factIdB: number; label: string; weight?: number }[];
  },
): Promise<void> {
  await db.user.create({
    data: {
      id: options.userId,
      email: options.email,
      name: `User ${options.userId}`,
      passwordHash: 'not-a-real-hash',
      createdAt: TS,
    },
  });

  await db.workspace.create({
    data: {
      id: options.workspaceId,
      name: `Workspace ${options.workspaceId}`,
      slug: `ws-${options.workspaceId}`,
      plan: 'free',
      ownerId: options.userId,
      createdAt: TS,
    },
  });

  for (const fact of options.facts ?? []) {
    await db.fact.create({
      data: {
        id: fact.id,
        topic: fact.topic,
        entity: fact.entity,
        attribute: fact.attribute,
        statement: fact.statement,
        confidence: 'high',
        validFrom: TS,
        stale: fact.stale ?? false,
        supersededBy: fact.supersededBy ?? null,
        activationScore: 0,
        workspaceId: options.workspaceId,
      },
    });
  }

  for (const assoc of options.associations ?? []) {
    await db.association.create({
      data: {
        factIdA: assoc.factIdA,
        factIdB: assoc.factIdB,
        label: assoc.label,
        strength: assoc.weight ?? 0.8,
        activationWeight: assoc.weight ?? 0.8,
        fireCount: 0,
        createdBy: 'test',
        createdAt: TS,
        workspaceId: options.workspaceId,
      },
    });
  }
}

// ===== Assertions =====

export function createReporter() {
  let passed = 0;
  const failures: string[] = [];

  return {
    check(name: string, ok: boolean, detail = ''): void {
      if (ok) {
        passed++;
        console.log(`  ok    ${name}`);
      } else {
        failures.push(name);
        console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
      }
    },
    finish(): void {
      console.log(`\n${passed} passed, ${failures.length} failed`);
      if (failures.length > 0) {
        console.log('\nfailures:');
        for (const f of failures) console.log(`  - ${f}`);
        process.exit(1);
      }
    },
  };
}
