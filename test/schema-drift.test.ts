/**
 * Migration / schema drift test.
 *
 * Reads prisma/schema.prisma and every migration.sql as text and checks that
 * the migrations build the tables and columns the Prisma client will ask for.
 * No database and no prisma CLI, so it runs in CI with nothing provisioned.
 *
 * This class of bug is invisible to everything else in the pipeline. The
 * schema declared `users.sessionVersion`, the client selected it on every token
 * refresh, and 0_init never created it — so registration and sessions failed on
 * any database built from the migrations, while a machine whose database came
 * from `prisma db push` had the column and worked fine. `tsc` cannot see it,
 * lint cannot see it, and the build only runs `migrate deploy`, which applies
 * the migrations happily and never compares them to the schema.
 *
 * Scope: table and column NAMES. Types, defaults, indexes and column order are
 * not compared — that would need a real database.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

// Prisma scalar types. A field of any other type is a relation and has no
// column of its own (its foreign key is declared as a separate scalar field).
const SCALARS = new Set([
  'String', 'Boolean', 'Int', 'BigInt', 'Float', 'Decimal', 'DateTime', 'Json', 'Bytes',
]);

/** table name -> column names, as declared in schema.prisma */
export function parseSchema(source: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const modelBlocks = source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);

  for (const [, modelName, body] of modelBlocks) {
    const mapped = /@@map\("([^"]+)"\)/.exec(body);
    const table = mapped ? mapped[1] : modelName;
    const columns = new Set<string>();

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;

      const field = /^(\w+)\s+(\w+)(\[\])?(\?)?/.exec(line);
      if (!field) continue;

      const [, fieldName, fieldType, isList] = field;
      if (!SCALARS.has(fieldType) || isList) continue;

      const renamed = /@map\("([^"]+)"\)/.exec(line);
      columns.add(renamed ? renamed[1] : fieldName);
    }

    tables.set(table, columns);
  }
  return tables;
}

/** table name -> column names, as built by the migrations, applied in order */
export function parseMigrations(sqlFiles: string[]): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();

  for (const sql of sqlFiles) {
    for (const [, name, body] of sql.matchAll(
      /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"?([A-Za-z0-9_]+)"?\s*\(([\s\S]*?)\n\);/g,
    )) {
      const columns = new Set<string>();
      for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();
        // Skip table-level constraints; keep column definitions.
        if (/^(CONSTRAINT|PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK)\b/i.test(line)) continue;
        const col = /^"([^"]+)"/.exec(line);
        if (col) columns.add(col[1]);
      }
      tables.set(name, columns);
    }

    for (const [, table, column] of sql.matchAll(
      /ALTER TABLE\s+"?([A-Za-z0-9_]+)"?\s+ADD COLUMN\s+"?([A-Za-z0-9_]+)"?/gi,
    )) {
      tables.get(table)?.add(column);
    }

    // The rebuild dance Prisma emits for SQLite: build new_X, copy, rename over X.
    for (const [, temp, final] of sql.matchAll(
      /ALTER TABLE\s+"?([A-Za-z0-9_]+)"?\s+RENAME TO\s+"?([A-Za-z0-9_]+)"?/gi,
    )) {
      const rebuilt = tables.get(temp);
      if (rebuilt) {
        tables.set(final, rebuilt);
        tables.delete(temp);
      }
    }

    for (const [, table] of sql.matchAll(/DROP TABLE\s+"?([A-Za-z0-9_]+)"?/gi)) {
      // A drop inside the rebuild dance is immediately followed by the rename
      // above, which reinstates the table — so only delete what is still gone.
      if (!sql.includes(`RENAME TO "${table}"`)) tables.delete(table);
    }
  }
  return tables;
}

// ===== Load =====

const schema = parseSchema(readFileSync(join(REPO, 'prisma', 'schema.prisma'), 'utf8'));

const migrationsDir = join(REPO, 'prisma', 'migrations');
const migrationFiles = readdirSync(migrationsDir, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name)
  .sort() // Prisma applies migrations in lexicographic order
  .map(name => readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8'));

const migrated = parseMigrations(migrationFiles);

console.log('\nparsing');
check(`schema declares tables (${schema.size} found)`, schema.size > 10);
check(`migrations build tables (${migrated.size} found)`, migrated.size > 10);
check('migration_lock.toml is present',
  readdirSync(migrationsDir).includes('migration_lock.toml'));

// ===== 1. Every table the client expects exists =====
console.log('\ntables');

const missingTables = [...schema.keys()].filter(t => !migrated.has(t));
check('every model has a table', missingTables.length === 0,
  `not created by any migration: ${missingTables.join(', ')}`);

// ===== 2. Every column the client selects exists =====
console.log('\ncolumns');

const columnGaps: string[] = [];
for (const [table, columns] of schema) {
  const built = migrated.get(table);
  if (!built) continue; // already reported above
  for (const column of columns) {
    if (!built.has(column)) columnGaps.push(`${table}.${column}`);
  }
}
check('every scalar field has a column', columnGaps.length === 0,
  `declared in schema.prisma but never created: ${columnGaps.join(', ')}`);

// ===== Guard: the parsers must actually be able to see a gap =====
// A parser that quietly returns nothing would pass forever.
console.log('\nparser self-check');

const sampleSchema = `
model Widget {
  id    Int    @id @default(autoincrement())
  label String
  ghost Int
  owner User   @relation(fields: [ownerId], references: [id])
  ownerId Int
  tags  Tag[]

  @@map("widgets")
}
`;
const parsedSample = parseSchema(sampleSchema);
check('parser applies @@map', parsedSample.has('widgets'));
check('parser keeps scalar fields',
  ['id', 'label', 'ghost', 'ownerId'].every(c => parsedSample.get('widgets')?.has(c)));
check('parser drops relation fields',
  !parsedSample.get('widgets')?.has('owner') && !parsedSample.get('widgets')?.has('tags'));

const sampleMigration = `
CREATE TABLE "widgets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "label" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    CONSTRAINT "widgets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id")
);
`;
const parsedMigration = parseMigrations([sampleMigration]);
check('parser reads columns and skips constraints',
  parsedMigration.get('widgets')?.size === 3);
// `ghost` is declared in the model and never created — exactly the sessionVersion shape.
check('a declared-but-never-created column is detected',
  !parsedMigration.get('widgets')?.has('ghost'));
check('ADD COLUMN closes the gap',
  parseMigrations([sampleMigration, 'ALTER TABLE "widgets" ADD COLUMN "ghost" INTEGER NOT NULL DEFAULT 0;'])
    .get('widgets')?.has('ghost') === true);
check('the rebuild-and-rename dance is followed',
  parseMigrations([
    sampleMigration,
    `CREATE TABLE "new_widgets" (\n    "id" INTEGER NOT NULL PRIMARY KEY,\n    "label" TEXT NOT NULL,\n    "ghost" INTEGER NOT NULL\n);\nDROP TABLE "widgets";\nALTER TABLE "new_widgets" RENAME TO "widgets";`,
  ]).get('widgets')?.has('ghost') === true);

// ===== Summary =====
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nfailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
