/**
 * Raw-SQL / schema consistency tests.
 *
 * Framework-free and database-free: it reads the migration and the sources as
 * text, so it runs in CI with nothing provisioned.
 *
 * This exists because of a bug that nothing else in the pipeline could see.
 * Three statements in brain-query.ts referenced `facts` and `associations`,
 * while the migration creates `Fact` and `Association`. Prisma never type-checks
 * a raw string, `tsc` was clean, the build passed, and every brain query threw
 * "no such table" at runtime on any database created from the repo's own
 * migration. The seeding query is the first thing the engine does, so the
 * headline feature was dead on a fresh clone.
 *
 * Two properties are checked:
 *   1. Every name in TABLES exists in the migration.
 *   2. No raw statement hard-codes a table name instead of using TABLES.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TABLES } from '../src/lib/sql-tables';

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
  }
}

const REPO = join(import.meta.dirname, '..');

// ===== Collect the tables the migrations actually create =====

const migrationsDir = join(REPO, 'prisma', 'migrations');
const migrationSql = readdirSync(migrationsDir, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => {
    try {
      return readFileSync(join(migrationsDir, e.name, 'migration.sql'), 'utf8');
    } catch {
      return '';
    }
  })
  .join('\n');

const createdTables = new Set(
  [...migrationSql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"?([A-Za-z0-9_]+)"?/gi)]
    .map(m => m[1].toLowerCase()),
);

console.log('\nmigration');
check(`migration defines tables (${createdTables.size} found)`, createdTables.size > 0);

// ===== 1. Every declared table exists =====
console.log('\ndeclared tables exist in the schema');

for (const [key, quoted] of Object.entries(TABLES)) {
  const bare = quoted.replace(/"/g, '');
  check(
    `TABLES.${key} → ${bare}`,
    createdTables.has(bare.toLowerCase()),
    `not created by any migration. Known: ${[...createdTables].sort().join(', ')}`,
  );
}

// SQLite resolves table names case-insensitively but not across a plural, so
// the exact spelling matters. Pin it against the migration text directly.
for (const [key, quoted] of Object.entries(TABLES)) {
  const bare = quoted.replace(/"/g, '');
  check(
    `TABLES.${key} is spelled exactly as the migration spells it`,
    new RegExp(`CREATE TABLE\\s+"${bare}"`).test(migrationSql),
  );
}

// ===== 2. No raw statement hard-codes a table name =====
console.log('\nno hard-coded table names in raw SQL');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

// A table reference is "safe" when it is an interpolation (${...}) — that is a
// constant from TABLES — and suspicious when it is a bare identifier.
// Captures the template body of a raw call, covering both the call form
// (`$queryRawUnsafe<T>( `...` )`) and the tagged-template form (`$executeRaw`...``).
const RAW_CALL = /\$(?:queryRaw|executeRaw)(?:Unsafe)?\s*(?:<[^>]*>)?\s*\(?\s*`([\s\S]*?)`/g;
const TABLE_REF = /\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+([`$"'{}\w.]+)/gi;

/** Table references in a raw SQL body that are written out rather than interpolated. */
function hardCodedTables(source: string): string[] {
  const found: string[] = [];
  for (const call of source.matchAll(RAW_CALL)) {
    for (const ref of call[1].matchAll(TABLE_REF)) {
      // `${TABLES.fact}` and friends interpolate — those are the checked path.
      if (ref[1].startsWith('${')) continue;
      found.push(ref[0].trim());
    }
  }
  return found;
}

const offenders: string[] = [];
for (const file of sourceFiles(join(REPO, 'src'))) {
  const source = readFileSync(file, 'utf8');
  for (const hit of hardCodedTables(source)) {
    offenders.push(`${file.slice(REPO.length + 1)}: ${hit}`);
  }
}

check(
  'every raw statement names its table through TABLES',
  offenders.length === 0,
  offenders.join('\n        '),
);

// ===== Guard: the check above must be able to see a violation =====
// A scanner that silently matches nothing would pass forever. Prove it bites.
console.log('\nscanner self-check');

// The exact shape of the bug this file exists for.
check(
  'scanner flags a hard-coded table name',
  hardCodedTables('db.$queryRawUnsafe(`SELECT id FROM facts WHERE workspaceId = 1`)').length === 1,
);
// The multi-line, generic-parameterised shape the real call sites use.
check(
  'scanner reads across a generic parameter and a line break',
  hardCodedTables(
    'db.$queryRawUnsafe<{ id: number }[]>(\n  `SELECT id FROM facts LIMIT 200`\n);',
  ).length === 1,
);
check(
  'scanner flags a hard-coded UPDATE target',
  hardCodedTables('db.$executeRawUnsafe(`UPDATE associations SET fireCount = 1`)').length === 1,
);
check(
  'scanner accepts an interpolated table name',
  hardCodedTables('db.$queryRawUnsafe(`SELECT id FROM ${TABLES.fact} WHERE workspaceId = 1`)').length === 0,
);
// A tagged template with no table reference at all (the WAL pragma in db.ts).
check(
  'scanner ignores a statement with no table reference',
  hardCodedTables('db.$executeRaw`PRAGMA journal_mode=WAL;`').length === 0,
);

// ===== Summary =====
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nfailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
