-- Password reset tokens move out of process memory and into the database.
--
-- They lived in a module-level Map, which failed quietly in three ordinary
-- situations: a restart or deploy invalidated every reset link already sitting
-- in someone's inbox; a second instance never saw the first one's tokens; and
-- anything that read process memory walked away with live credentials in
-- plaintext.
--
-- Only the SHA-256 of the emailed token is stored. Reading this table gives an
-- attacker nothing usable, on the same reasoning as a password column.
--
-- No data migration: any token outstanding at deploy time lived in the memory
-- of the process being replaced, so it is already gone. Affected users request
-- a new link.

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");
