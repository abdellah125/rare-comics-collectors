-- AlterTable
ALTER TABLE "ImportItem" ADD COLUMN     "knowledgeJson" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "knowledgeTriedAt" TIMESTAMP(3);
