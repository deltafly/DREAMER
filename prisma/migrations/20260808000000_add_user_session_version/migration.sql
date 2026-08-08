-- A repair, not a new feature.
--
-- users.sessionVersion has been in schema.prisma since 5.2.0 and is read on
-- every token refresh (src/lib/auth.ts) and incremented on password reset and
-- profile change, but it was never added to a migration. A database built from
-- the migrations therefore failed on registration ("table users has no column
-- named sessionVersion") and on every session refresh. Machines whose database
-- came from `prisma db push` had the column and never saw the problem.
--
-- Written as ADD COLUMN rather than the table rebuild `prisma migrate diff`
-- suggests. That rebuild exists only to place the column before createdAt;
-- column order has no effect, and dropping and recreating a table other tables
-- reference is not worth a cosmetic ordering.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- RedefineIndex
-- Cosmetic, and unrelated: 0_init named this index after the model, while the
-- schema maps the table to "challenges". Renamed here so `migrate diff` stops
-- reporting a difference that does not matter.
DROP INDEX "Challenge_contestId_idx";
CREATE INDEX "challenges_contestId_idx" ON "challenges"("contestId");
