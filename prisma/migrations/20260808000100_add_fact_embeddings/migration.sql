-- Optional semantic seeding.
--
-- One vector per fact, so a brain query can seed by meaning as well as by
-- shared words. The table stays empty unless EMBEDDING_MODEL is configured,
-- and nothing reads it when it is empty — with the setting unset, queries seed
-- by keyword exactly as before.
--
-- Only the distilled fact layer is embedded, never the raw ledger.

-- CreateTable
CREATE TABLE "fact_embeddings" (
    "factId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "dim" INTEGER NOT NULL,
    "vector" BLOB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    CONSTRAINT "fact_embeddings_factId_fkey" FOREIGN KEY ("factId") REFERENCES "Fact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fact_embeddings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "fact_embeddings_workspaceId_idx" ON "fact_embeddings"("workspaceId");

-- CreateIndex
CREATE INDEX "fact_embeddings_workspaceId_model_idx" ON "fact_embeddings"("workspaceId", "model");
