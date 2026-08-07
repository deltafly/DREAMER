-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "ownerId" INTEGER NOT NULL,
    "createdAt" TEXT NOT NULL,
    CONSTRAINT "workspaces_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TEXT NOT NULL,
    CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ledger" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ts" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'digest',
    "content" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "workspaceId" INTEGER NOT NULL,
    CONSTRAINT "Ledger_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Fact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "topic" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "source" TEXT,
    "validFrom" TEXT NOT NULL,
    "reviewAt" TEXT,
    "supersededBy" INTEGER,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "activationScore" REAL NOT NULL DEFAULT 0,
    "lastActivatedAt" TEXT,
    "workspaceId" INTEGER NOT NULL,
    CONSTRAINT "Fact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Fact_supersededBy_fkey" FOREIGN KEY ("supersededBy") REFERENCES "Fact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "topic" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "decidedAt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "supersededBy" INTEGER,
    "reviewAt" TEXT,
    "outcome" TEXT,
    "outcomeAt" TEXT,
    "lesson" TEXT,
    "workspaceId" INTEGER NOT NULL,
    CONSTRAINT "Decision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Decision_supersededBy_fkey" FOREIGN KEY ("supersededBy") REFERENCES "Decision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Preference" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scope" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "workspaceId" INTEGER NOT NULL,
    CONSTRAINT "Preference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "topic" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "expiresAt" TEXT,
    "workspaceId" INTEGER NOT NULL,
    CONSTRAINT "ProjectState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "existingRef" TEXT NOT NULL,
    "incoming" TEXT NOT NULL,
    "detectedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "ruling" TEXT,
    "resolvedAt" TEXT,
    "workspaceId" INTEGER NOT NULL,
    CONSTRAINT "Dispute_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Brief" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "topic" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "builtAt" TEXT NOT NULL,
    "dirty" BOOLEAN NOT NULL DEFAULT false,
    "workspaceId" INTEGER NOT NULL,
    CONSTRAINT "Brief_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "agentId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    CONSTRAINT "Agent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LibrarianRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "startedAt" TEXT NOT NULL,
    "endedAt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "summary" TEXT,
    "factsExtracted" INTEGER NOT NULL DEFAULT 0,
    "decisionsExtracted" INTEGER NOT NULL DEFAULT 0,
    "disputesCreated" INTEGER NOT NULL DEFAULT 0,
    "briefsRebuilt" INTEGER NOT NULL DEFAULT 0,
    "staleFlagged" INTEGER NOT NULL DEFAULT 0,
    "workspaceId" INTEGER NOT NULL,
    CONSTRAINT "LibrarianRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Spark" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" TEXT NOT NULL,
    "seedRef" TEXT NOT NULL,
    "pairedRef" TEXT NOT NULL,
    "seedTopic" TEXT NOT NULL,
    "pairedTopic" TEXT NOT NULL,
    "insight" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "deliveredAt" TEXT,
    "rating" INTEGER,
    "workspaceId" INTEGER NOT NULL,
    CONSTRAINT "Spark_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SparkWeight" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "topicPair" TEXT NOT NULL,
    "trials" INTEGER NOT NULL DEFAULT 0,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "workspaceId" INTEGER NOT NULL,
    CONSTRAINT "SparkWeight_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Association" (
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
    CONSTRAINT "Association_factIdA_fkey" FOREIGN KEY ("factIdA") REFERENCES "Fact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Association_factIdB_fkey" FOREIGN KEY ("factIdB") REFERENCES "Fact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "topics" TEXT NOT NULL,
    "actionable" BOOLEAN NOT NULL DEFAULT false,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "workspaceId" INTEGER NOT NULL,
    CONSTRAINT "Insight_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrainQuery" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "queriedAt" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "returnedIds" TEXT NOT NULL,
    "useful" BOOLEAN,
    "workspaceId" INTEGER NOT NULL,
    CONSTRAINT "BrainQuery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "neural_activity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "factId" INTEGER NOT NULL,
    "activation" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "iteration" INTEGER NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    CONSTRAINT "neural_activity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "consents" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "grantedAt" TEXT NOT NULL,
    "revokedAt" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "data_exports" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedAt" TEXT NOT NULL,
    "completedAt" TEXT,
    "filePath" TEXT,
    "expiresAt" TEXT,
    CONSTRAINT "data_exports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "contests" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startsAt" TEXT NOT NULL,
    "endsAt" TEXT NOT NULL,
    "createdBy" INTEGER,
    "prize" TEXT,
    "rules" TEXT,
    "createdAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "contest_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contestId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "score" REAL NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "submittedAt" TEXT,
    "metadata" TEXT,
    CONSTRAINT "contest_entries_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contest_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contestId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 100,
    "completedBy" TEXT,
    "completedAt" TEXT,
    CONSTRAINT "challenges_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "badge" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "earnedAt" TEXT NOT NULL,
    CONSTRAINT "achievements_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "workspace_settings" (
    "workspaceId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dreamerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dreamerSchedule" TEXT NOT NULL DEFAULT '0 3 * * *',
    "dreamerLastRunAt" TEXT,
    "dreamerNextRunAt" TEXT,
    "librarianEnabled" BOOLEAN NOT NULL DEFAULT false,
    "librarianSchedule" TEXT NOT NULL DEFAULT '0 */4 * * *',
    "librarianLastRunAt" TEXT,
    "librarianNextRunAt" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Budapest',
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    CONSTRAINT "workspace_settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_userId_workspaceId_key" ON "workspace_members"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectState_workspaceId_topic_key_key" ON "ProjectState"("workspaceId", "topic", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Brief_workspaceId_topic_key" ON "Brief"("workspaceId", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_workspaceId_agentId_key" ON "Agent"("workspaceId", "agentId");
CREATE INDEX "Agent_keyHash_idx" ON "Agent"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "SparkWeight_workspaceId_topicPair_key" ON "SparkWeight"("workspaceId", "topicPair");

-- CreateIndex
CREATE UNIQUE INDEX "Association_workspaceId_factIdA_factIdB_label_key" ON "Association"("workspaceId", "factIdA", "factIdB", "label");

-- CreateIndex
CREATE INDEX "neural_activity_workspaceId_factId_idx" ON "neural_activity"("workspaceId", "factId");

-- CreateIndex
CREATE INDEX "neural_activity_workspaceId_createdAt_idx" ON "neural_activity"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "consents_userId_kind_key" ON "consents"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "contest_entries_contestId_workspaceId_key" ON "contest_entries"("contestId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_workspaceId_badge_key" ON "achievements"("workspaceId", "badge");

-- CreateIndex (workspaceId audit fixes)
CREATE INDEX "Ledger_workspaceId_idx" ON "Ledger"("workspaceId");
CREATE INDEX "Ledger_workspaceId_topic_idx" ON "Ledger"("workspaceId", "topic");
CREATE INDEX "Fact_workspaceId_idx" ON "Fact"("workspaceId");
CREATE INDEX "Fact_workspaceId_topic_idx" ON "Fact"("workspaceId", "topic");
CREATE INDEX "Decision_workspaceId_idx" ON "Decision"("workspaceId");
CREATE INDEX "Decision_workspaceId_topic_idx" ON "Decision"("workspaceId", "topic");
CREATE INDEX "Preference_workspaceId_idx" ON "Preference"("workspaceId");
CREATE INDEX "Dispute_workspaceId_idx" ON "Dispute"("workspaceId");
CREATE INDEX "Dispute_workspaceId_topic_idx" ON "Dispute"("workspaceId", "topic");
CREATE INDEX "LibrarianRun_workspaceId_idx" ON "LibrarianRun"("workspaceId");
CREATE INDEX "Spark_workspaceId_idx" ON "Spark"("workspaceId");
CREATE INDEX "Insight_workspaceId_idx" ON "Insight"("workspaceId");
CREATE INDEX "BrainQuery_workspaceId_idx" ON "BrainQuery"("workspaceId");
CREATE INDEX "Challenge_contestId_idx" ON "challenges"("contestId");

