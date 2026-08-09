-- Association -> Fact becomes ON DELETE CASCADE, from the default RESTRICT.
--
-- An association is a statement about two facts. With one endpoint gone it is
-- not a weaker edge, it is a dangling one, and RESTRICT made that everyone
-- else's problem: deleting a fact that any association touched failed with a
-- foreign key error. Nothing in the codebase deletes a single fact today — the
-- Librarian supersedes rather than deletes — so this was a trap waiting for
-- whoever added it, not a live failure.
--
-- Deleting a whole workspace was never affected: that cascade reaches Fact and
-- Association together, so the GDPR erase path worked and still works.
--
-- SQLite cannot alter a foreign key in place, hence the rebuild. Rows are
-- copied, so existing associations survive.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Association" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "factIdA" INTEGER NOT NULL,
    "factIdB" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "strength" REAL NOT NULL DEFAULT 0.5,
    "activationWeight" REAL NOT NULL DEFAULT 0.5,
    "fireCount" INTEGER NOT NULL DEFAULT 0,
    "lastFiredAt" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'librarian',
    "createdAt" TEXT NOT NULL,
    "description" TEXT,
    "workspaceId" INTEGER NOT NULL,
    CONSTRAINT "Association_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Association_factIdA_fkey" FOREIGN KEY ("factIdA") REFERENCES "Fact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Association_factIdB_fkey" FOREIGN KEY ("factIdB") REFERENCES "Fact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Association" ("activationWeight", "createdAt", "createdBy", "description", "factIdA", "factIdB", "fireCount", "id", "label", "lastFiredAt", "strength", "workspaceId") SELECT "activationWeight", "createdAt", "createdBy", "description", "factIdA", "factIdB", "fireCount", "id", "label", "lastFiredAt", "strength", "workspaceId" FROM "Association";
DROP TABLE "Association";
ALTER TABLE "new_Association" RENAME TO "Association";
CREATE UNIQUE INDEX "Association_workspaceId_factIdA_factIdB_label_key" ON "Association"("workspaceId", "factIdA", "factIdB", "label");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
