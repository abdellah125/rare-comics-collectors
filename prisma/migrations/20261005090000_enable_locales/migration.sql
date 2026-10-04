-- The storefront now ships Spanish, French and German translations: switch those languages on.
-- (Done once here rather than in the seed, so a language an admin later disables stays disabled.)
UPDATE "Locale" SET "isEnabled" = true WHERE "code" IN ('es', 'fr', 'de');
