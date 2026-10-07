-- Word counts for the articles that were written before the column existed (used to pick featured guides).
UPDATE "Article" SET "wordCount" = COALESCE(array_length(regexp_split_to_array(trim("body"), '\s+'), 1), 0) WHERE "wordCount" = 0;
