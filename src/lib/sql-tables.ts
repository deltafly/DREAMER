/**
 * Physical table names for the handful of raw SQL statements in the codebase.
 *
 * Almost everything goes through the Prisma query builder, which resolves table
 * names for us. Three statements in brain-query.ts cannot: a variable-length
 * OR/LIKE chain and two batched CASE updates that collapse an N+1 into one
 * query. Those name their tables as text, and text is not type-checked.
 *
 * The name a model gets in the database is the MODEL name unless the model
 * carries an `@@map`. Some models here are mapped to snake_case plurals
 * (users, workspaces, neural_activity) and some are not (Fact, Association) —
 * so the convention cannot be guessed from the neighbours, which is exactly how
 * `FROM facts` once slipped in and made every brain query fail at runtime with
 * "no such table" on any database built from the repo's own migration.
 *
 * Names are pre-quoted for interpolation. test/sql-tables.test.ts checks each
 * one against the migration, and checks that no raw statement hard-codes a
 * table name instead of using this table.
 */
export const TABLES = {
  fact: '"Fact"',
  association: '"Association"',
} as const;
