# Marketplace audit log

Running record of every issue found, fix shipped, and item still owed, kept so later work can be cross-referenced against it. Newest entries at the bottom of each section. Dates are the day the change was deployed to https://www.rarecomicscollectors.com.

## 1. Shipped fixes and improvements

### Platform and deployability (2026-09-04 → 2026-09-05)
- Migrated from the static/SQLite build to PostgreSQL (Neon via Vercel) with migrate + idempotent seed on every build (`scripts/db-deploy.mjs`); first-run `/admin/setup` creates the first super admin.
- Env-free bootstrap: `SESSION_SECRET` / `APP_ENCRYPTION_KEY` fall back to database-generated secrets.
- Rate limiting moved to the shared `RateLimitBucket` table (serverless-safe, atomic upsert, in-memory fallback).
- Background jobs drain on traffic (`driveJobsOnTraffic`, 30 s throttle per instance) so the once-a-day Hobby cron is only a backstop; `/api/jobs/run` accepts `JOBS_SECRET` or `CRON_SECRET`.
- Production audit (commits `ae33bdc`, `9bd042d`): closed an order-confirmation IDOR, open redirects on signed-in login/register, helper functions leaked as server actions, admin-tier escalation; paid/failed/cancel/refund/payout transitions made race-safe (22 integration checks); every admin setting that had no effect now applies (free-shipping threshold, return window, headline, name, favicon, brand colour, guest tracking); storefront error boundaries; mobile overflow/nav fixes.

### International marketplace features (2026-09-05)
- Seller ship-to country list and customs note (`SellerProfile.shipsToJson`, `customsNote`), enforced at checkout.
- Buyer currency and locale preferences honoured server-side; ship-from, customs and ETA shown on buyer order pages; destination analytics on the seller dashboard.

### Payments (2026-09-05)
- Stripe live keys + webhook verified; PayPal live verified (`PAYPAL_ENV` now case-insensitive); PayPal webhook fails closed with 400 instead of 500.
- Bank wire: structured details (beneficiary, bank, account type/number, routing, SWIFT, IBAN) from Admin › Finance › Payment providers or `BANK_*` env, rendered at checkout, confirmation, order page, guest tracking, admin order page and the "awaiting payment" email.

### Custom domain (2026-09-06)
- `*.vercel.app` 308-redirects to the canonical origin (webhooks and cron exempt); canonical/OG/sitemap/robots all on `https://www.rarecomicscollectors.com`; cookies host-scoped; no old-host references left in code.

### Email deliverability (2026-09-06, commit `b825418`)
- Multipart text + HTML on every message; From = marketplace name + the SMTP mailbox (alignment for SPF/DKIM); Reply-To = support address; own Message-ID; explicit envelope sender; misalignment warning at startup.
- RFC 8058 one-click unsubscribe (headers + link + `/api/email/unsubscribe`) on marketing broadcasts only.
- Verified with a live send: SPF PASS, not blocklisted, score 6.8/10 (remaining points are the DKIM/DMARC DNS records below).

### SEO (2026-09-06, commits `9b69d65`, `98b0281`)
- New indexable landing pages `/collections`, `/collections/[slug]`, `/publishers`, `/publishers/[slug]` with unique titles/descriptions/H1s, editorial copy, breadcrumbs, CollectionPage + ItemList JSON-LD, and cross-links from footer, home, store and product pages (footer era links previously pointed at robots-blocked `/store?era=` URLs).
- Product/Offer structured data only on product pages (store page now uses a summary ItemList); collection breadcrumb and rolling `priceValidUntil` on product pages.
- Sitemap rebuilt in `src/lib/sitemap-entries.ts` (adds the new pages, drops the noindex register page); `X-Robots-Tag: noindex` on private areas and non-media API routes.
- IndexNow: key file at `/indexnow-6c6ba387ef6cc74605a16c7a7090607d.txt`, pings on every listing change, weekly sync job.
- `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION` env vars render the ownership meta tags.
- Performance: cover scans re-encoded to WebP with day-long cache headers; home grid no longer eager-loads below-the-fold images. Lighthouse mobile (simulated): SEO 100, a11y 100, best practices 100, performance 72 (home) / 75 (store).
- Titles: home no longer repeats the site name; publisher pages no longer read "DC Comics Comics".

### Catalogue import (2026-09-06)
- WooCommerce export (`wc-product-export-30-4-2023`, 60 rows) converted by `scripts/import-woocommerce.mjs` with the profile `scripts/import-profiles/waymaker-2023-04.mjs` into `prisma/data/catalog-imports/waymaker-2023-04.json`; the seed creates 6 consignment sellers and 57 listings idempotently (3 exact duplicate rows dropped: WooCommerce IDs 372, 421, 443).
- Data normalised: year/era/publisher corrected where the export was wrong (e.g. Zip Comics #3 1940 was filed under Silver Age, Hulk #181 under Silver Age, Wow Comics listed "Marvel" as publisher), grader read from the name (Panic #5 is CBCS, not CGC), labels for Signature Series / restored copies, sale price → price with the regular price as `compareAt`, WooCommerce character categories → tags and a "Character" attribute, page quality extracted into an attribute, one listing's "US only" note preserved as an allowed-country restriction.
- Descriptions kept verbatim (HTML stripped, encoding repaired, seller shipping boilerplate removed); five rows whose text was unusable (empty, contradictory grader, or a broken spec dump) got a short factual description.
- The export's photo host (waymakercomics.com) is offline and not archived, so listings use the issue's cover scan instead of the seller's slab photos (48 of 50 issues found; Detective Comics (2011) #20 and War Machine #1 fall back to the gradient plate).

### Storefront fixes found during the import QA pass (2026-09-06)
- Cover plates no longer request a per-product SVG that only exists for the seed catalogue (every non-seed listing produced a 404 per card).
- CBCS "Verified Signature" labels now get the same yellow treatment and badge as CGC Signature Series; product cards strip any label colour suffix, not just "(Yellow)".
- A bare visit to /report explains how to report instead of returning a 404.
- Verified on production after deploy (commit `32193b4`): sitemap lists 74 product and 6 seller URLs, 83/84 import checks and 104/104 SEO checks pass (the one miss is a test-script artefact), unit 42/42, integration 22/22, e2e 18/18 (two specs re-run against the dev server they are written for).

## 2. Still owed by the site owner (cannot be done from the codebase)
- DNS at Namecheap: CNAME `default._domainkey` → `default._domainkey.privateemail.com` (DKIM) and TXT `_dmarc` → `v=DMARC1; p=none; rua=mailto:<mailbox>` (DMARC). Until then mail authenticates on SPF only.
- Google Search Console: verify ownership (HTML-tag value into `GOOGLE_SITE_VERIFICATION`, redeploy), submit `/sitemap.xml`.
- Bing Webmaster Tools: verify (meta-tag value into `BING_SITE_VERIFICATION`, redeploy), submit the sitemap.
- Stripe: repoint webhook `we_1UCLmDGgZ8ar330hV5tfiYjy` from the vercel.app host to the live domain; fix the business profile URL (was www.theplanpalette.com).
- PayPal: repoint the webhook to the live domain.
- Bank-wire fields: confirm they are filled in Admin › Finance › Payment providers (or `BANK_*` env).
- Vercel dashboard "Redeploy" has not produced deployments; push an empty commit to apply env changes.
- Imported sellers: rename/replace the six placeholder seller accounts (`*@sellers.rarecomicscollectors.com`) with real consignors when available; they sign in via "Forgot password".

## 3. Known limitations and recommendations (not yet done)
- Mobile Lighthouse performance sits in the low 70s because of client-side JavaScript (header, cart, currency providers, store browser); trimming hydration is the next lever.
- Back/forward cache is disabled by `Cache-Control: no-store` on dynamic HTML.
- Product cover art for imported listings is the issue's cover scan, not photos of the actual slab; sellers should upload real photos from their dashboard.
- Live Stripe/PayPal have not been exercised with a real charge; the `test` provider covers checkout → refund end-to-end.
