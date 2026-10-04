-- AlterTable
ALTER TABLE "SeoCompetitor" ADD COLUMN     "comparedAt" TIMESTAMP(3),
ADD COLUMN     "etv" DOUBLE PRECISION,
ADD COLUMN     "medianPosition" DOUBLE PRECISION,
ADD COLUMN     "profileJson" TEXT NOT NULL DEFAULT '{}',
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "visibility" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "SeoKeyword" ADD COLUMN     "attackJson" TEXT NOT NULL DEFAULT '{}',
ADD COLUMN     "attackScore" INTEGER,
ADD COLUMN     "weakness" INTEGER;

-- AlterTable
ALTER TABLE "SeoPage" ADD COLUMN     "linksJson" TEXT NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "SeoCompetitorPage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "httpStatus" INTEGER NOT NULL,
    "title" TEXT,
    "wordCount" INTEGER,
    "hasOffer" BOOLEAN,
    "latestYear" INTEGER,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoCompetitorPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoTopic" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "hubUrl" TEXT,
    "hubExists" BOOLEAN NOT NULL DEFAULT false,
    "clusterCount" INTEGER NOT NULL DEFAULT 0,
    "volume" INTEGER NOT NULL DEFAULT 0,
    "pagesExisting" INTEGER NOT NULL DEFAULT 0,
    "pagesMissing" INTEGER NOT NULL DEFAULT 0,
    "ranking" INTEGER NOT NULL DEFAULT 0,
    "top10" INTEGER NOT NULL DEFAULT 0,
    "coverage" INTEGER NOT NULL DEFAULT 0,
    "membersJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoLinkRec" (
    "id" TEXT NOT NULL,
    "fromUrl" TEXT NOT NULL,
    "toUrl" TEXT NOT NULL,
    "anchor" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "present" BOOLEAN,
    "weight" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SeoLinkRec_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeoCompetitorPage_url_key" ON "SeoCompetitorPage"("url");

-- CreateIndex
CREATE INDEX "SeoCompetitorPage_domain_idx" ON "SeoCompetitorPage"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "SeoTopic_key_key" ON "SeoTopic"("key");

-- CreateIndex
CREATE INDEX "SeoTopic_type_volume_idx" ON "SeoTopic"("type", "volume");

-- CreateIndex
CREATE INDEX "SeoLinkRec_present_weight_idx" ON "SeoLinkRec"("present", "weight");

-- CreateIndex
CREATE UNIQUE INDEX "SeoLinkRec_fromUrl_toUrl_key" ON "SeoLinkRec"("fromUrl", "toUrl");

-- CreateIndex
CREATE INDEX "SeoKeyword_attackScore_idx" ON "SeoKeyword"("attackScore");
