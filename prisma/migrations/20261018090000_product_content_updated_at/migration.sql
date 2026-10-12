-- When a product last changed in a way a visitor or a search engine would notice. The sitemap's
-- lastmod reads it; updatedAt also moves on every stock or price sync that changes nothing visible.
ALTER TABLE "Product" ADD COLUMN "contentUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing rows: the moment they went on sale (or were created) is the best known date.
UPDATE "Product" SET "contentUpdatedAt" = COALESCE("publishedAt", "createdAt");

CREATE INDEX "Product_contentUpdatedAt_idx" ON "Product"("contentUpdatedAt");

-- Visible fields only. Stock counts as "in stock or not", not the exact number.
CREATE OR REPLACE FUNCTION product_content_touch() RETURNS trigger AS $$
BEGIN
  IF (NEW."slug", NEW."title", NEW."issue", NEW."publisher", NEW."year", NEW."era", NEW."grader", NEW."grade", NEW."label", NEW."certNumber",
      NEW."price", NEW."compareAt", NEW."stock" > 0, NEW."keyIssue", NEW."summary", NEW."description", NEW."highlightsJson", NEW."attributesJson",
      NEW."status", NEW."deletedAt" IS NULL, NEW."seoTitle", NEW."seoDescription", NEW."saleType", NEW."auctionEndsAt", NEW."categoryId")
     IS DISTINCT FROM
     (OLD."slug", OLD."title", OLD."issue", OLD."publisher", OLD."year", OLD."era", OLD."grader", OLD."grade", OLD."label", OLD."certNumber",
      OLD."price", OLD."compareAt", OLD."stock" > 0, OLD."keyIssue", OLD."summary", OLD."description", OLD."highlightsJson", OLD."attributesJson",
      OLD."status", OLD."deletedAt" IS NULL, OLD."seoTitle", OLD."seoDescription", OLD."saleType", OLD."auctionEndsAt", OLD."categoryId") THEN
    NEW."contentUpdatedAt" := (now() AT TIME ZONE 'UTC');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Product_content_touch" BEFORE UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION product_content_touch();

-- A photo added, replaced or removed changes the page too.
CREATE OR REPLACE FUNCTION product_image_touch() RETURNS trigger AS $$
BEGIN
  UPDATE "Product" SET "contentUpdatedAt" = (now() AT TIME ZONE 'UTC') WHERE "id" = COALESCE(NEW."productId", OLD."productId");
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProductImage_content_touch" AFTER INSERT OR UPDATE OR DELETE ON "ProductImage" FOR EACH ROW EXECUTE FUNCTION product_image_touch();
