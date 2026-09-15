-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "charactersJson" TEXT NOT NULL DEFAULT '[]',
    "titlesJson" TEXT NOT NULL DEFAULT '[]',
    "publishersJson" TEXT NOT NULL DEFAULT '[]',
    "faqJson" TEXT NOT NULL DEFAULT '[]',
    "relatedJson" TEXT NOT NULL DEFAULT '[]',
    "sourcesJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "eventDate" TIMESTAMP(3),
    "authorName" TEXT,
    "publishedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_status_publishedAt_idx" ON "Article"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Article_topic_status_idx" ON "Article"("topic", "status");

-- CreateIndex
CREATE INDEX "Article_eventDate_idx" ON "Article"("eventDate");
