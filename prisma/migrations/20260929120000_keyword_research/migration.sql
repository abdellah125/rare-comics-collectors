-- Semrush keyword cache and metered-API usage log.
CREATE TABLE "KeywordMetric" (
    "id" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "database" TEXT NOT NULL,
    "volume" INTEGER,
    "cpc" DOUBLE PRECISION,
    "competition" DOUBLE PRECISION,
    "results" DOUBLE PRECISION,
    "difficulty" DOUBLE PRECISION,
    "intents" TEXT,
    "trendJson" TEXT,
    "relatedJson" TEXT NOT NULL DEFAULT '[]',
    "questionsJson" TEXT NOT NULL DEFAULT '[]',
    "relatedFetchedAt" TIMESTAMP(3),
    "questionsFetchedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unitsSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeywordMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiUsage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "params" TEXT NOT NULL,
    "lines" INTEGER NOT NULL DEFAULT 0,
    "units" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "durationMs" INTEGER,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KeywordMetric_phrase_database_key" ON "KeywordMetric"("phrase", "database");
CREATE INDEX "KeywordMetric_database_volume_idx" ON "KeywordMetric"("database", "volume");
CREATE INDEX "ApiUsage_provider_createdAt_idx" ON "ApiUsage"("provider", "createdAt");
CREATE INDEX "ApiUsage_provider_endpoint_idx" ON "ApiUsage"("provider", "endpoint");
