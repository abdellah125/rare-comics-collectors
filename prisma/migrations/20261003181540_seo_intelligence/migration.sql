-- CreateTable
CREATE TABLE "SeoKeyword" (
    "id" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "norm" TEXT NOT NULL,
    "volume" INTEGER,
    "difficulty" DOUBLE PRECISION,
    "cpc" DOUBLE PRECISION,
    "competition" DOUBLE PRECISION,
    "providerIntent" TEXT,
    "serpFeaturesJson" TEXT NOT NULL DEFAULT '[]',
    "serpDomainRank" DOUBLE PRECISION,
    "serpRefDomains" DOUBLE PRECISION,
    "metricsAt" TIMESTAMP(3),
    "intent" TEXT NOT NULL DEFAULT 'informational',
    "specificJson" TEXT NOT NULL DEFAULT '[]',
    "intentBasis" TEXT,
    "relevance" INTEGER NOT NULL DEFAULT 0,
    "relevanceReason" TEXT,
    "entityType" TEXT NOT NULL DEFAULT 'topic',
    "entityLabel" TEXT,
    "clusterKey" TEXT NOT NULL DEFAULT '',
    "clusterRole" TEXT NOT NULL DEFAULT 'supporting',
    "score" INTEGER,
    "scoreJson" TEXT NOT NULL DEFAULT '{}',
    "priority" TEXT NOT NULL DEFAULT 'low',
    "priorityWhy" TEXT,
    "sourcesJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "statusManual" BOOLEAN NOT NULL DEFAULT false,
    "position" DOUBLE PRECISION,
    "prevPosition" DOUBLE PRECISION,
    "positionSource" TEXT,
    "positionAt" TIMESTAMP(3),
    "currentUrl" TEXT,
    "impressions" INTEGER,
    "clicks" INTEGER,
    "pagesJson" TEXT NOT NULL DEFAULT '[]',
    "competitorsJson" TEXT NOT NULL DEFAULT '[]',
    "serpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoCluster" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "specificJson" TEXT NOT NULL DEFAULT '[]',
    "primaryPhrase" TEXT NOT NULL,
    "secondaryJson" TEXT NOT NULL DEFAULT '[]',
    "supportingJson" TEXT NOT NULL DEFAULT '[]',
    "keywordCount" INTEGER NOT NULL DEFAULT 0,
    "totalVolume" INTEGER NOT NULL DEFAULT 0,
    "volume" INTEGER,
    "difficulty" DOUBLE PRECISION,
    "score" INTEGER,
    "priority" TEXT NOT NULL DEFAULT 'low',
    "priorityWhy" TEXT,
    "pageType" TEXT NOT NULL,
    "recommendedUrl" TEXT NOT NULL,
    "urlExists" BOOLEAN NOT NULL DEFAULT false,
    "currentUrl" TEXT,
    "bestPosition" DOUBLE PRECISION,
    "title" TEXT NOT NULL,
    "h1" TEXT NOT NULL,
    "topicsJson" TEXT NOT NULL DEFAULT '[]',
    "linksJson" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'analyzed',
    "statusManual" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoRankSnapshot" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "position" DOUBLE PRECISION,
    "url" TEXT,
    "clicks" INTEGER,
    "impressions" INTEGER,
    "source" TEXT NOT NULL,

    CONSTRAINT "SeoRankSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoCompetitor" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "keywordsSeen" INTEGER NOT NULL DEFAULT 0,
    "avgPosition" DOUBLE PRECISION,
    "organicTraffic" DOUBLE PRECISION,
    "organicKeywords" INTEGER,
    "backlinks" DOUBLE PRECISION,
    "referringDomains" DOUBLE PRECISION,
    "overviewAt" TIMESTAMP(3),
    "gapAt" TIMESTAMP(3),
    "gapKeywords" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoPage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "httpStatus" INTEGER NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "h1" TEXT,
    "h1Count" INTEGER NOT NULL DEFAULT 0,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "canonical" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "inlinks" INTEGER NOT NULL DEFAULT 0,
    "outlinks" INTEGER NOT NULL DEFAULT 0,
    "issuesJson" TEXT NOT NULL DEFAULT '[]',
    "clicks" INTEGER,
    "impressions" INTEGER,
    "position" DOUBLE PRECISION,
    "topQueriesJson" TEXT NOT NULL DEFAULT '[]',
    "crawledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoInsight" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "phrase" TEXT,
    "url" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "dataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "summary" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "detailJson" TEXT NOT NULL DEFAULT '{}',
    "actorId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SeoRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeoKeyword_norm_key" ON "SeoKeyword"("norm");

-- CreateIndex
CREATE INDEX "SeoKeyword_priority_score_idx" ON "SeoKeyword"("priority", "score");

-- CreateIndex
CREATE INDEX "SeoKeyword_clusterKey_idx" ON "SeoKeyword"("clusterKey");

-- CreateIndex
CREATE INDEX "SeoKeyword_status_idx" ON "SeoKeyword"("status");

-- CreateIndex
CREATE INDEX "SeoKeyword_intent_idx" ON "SeoKeyword"("intent");

-- CreateIndex
CREATE INDEX "SeoKeyword_metricsAt_idx" ON "SeoKeyword"("metricsAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeoCluster_key_key" ON "SeoCluster"("key");

-- CreateIndex
CREATE INDEX "SeoCluster_priority_score_idx" ON "SeoCluster"("priority", "score");

-- CreateIndex
CREATE INDEX "SeoCluster_pageType_idx" ON "SeoCluster"("pageType");

-- CreateIndex
CREATE INDEX "SeoRankSnapshot_day_idx" ON "SeoRankSnapshot"("day");

-- CreateIndex
CREATE UNIQUE INDEX "SeoRankSnapshot_keywordId_day_source_key" ON "SeoRankSnapshot"("keywordId", "day", "source");

-- CreateIndex
CREATE UNIQUE INDEX "SeoCompetitor_domain_key" ON "SeoCompetitor"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "SeoPage_url_key" ON "SeoPage"("url");

-- CreateIndex
CREATE INDEX "SeoPage_kind_idx" ON "SeoPage"("kind");

-- CreateIndex
CREATE INDEX "SeoInsight_type_weight_idx" ON "SeoInsight"("type", "weight");

-- CreateIndex
CREATE INDEX "SeoRun_kind_startedAt_idx" ON "SeoRun"("kind", "startedAt");

-- AddForeignKey
ALTER TABLE "SeoRankSnapshot" ADD CONSTRAINT "SeoRankSnapshot_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "SeoKeyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;
