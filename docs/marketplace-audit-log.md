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

### Analytics (2026-09-08)
- Google tag `GT-NGWX2GTZ` (gtag.js) loads on every storefront page after hydration, production deployment only (`src/components/google-tag.tsx`; `NEXT_PUBLIC_GOOGLE_TAG_ID` overrides the id). Admin pages are excluded.
- Consent Mode v2 defaults: storage denied for EEA/UK/Switzerland visitors (cookieless pings until a future consent banner grants it), granted elsewhere.
- Verified live: gtag.js loads, consent defaults are queued before config, a measurement hit fires to Merchant Center analytics (destination MC-TPG2B1JPZW, `gcs=G111`), `_ga` cookies set outside Europe, nothing loads on admin pages. The GT container has no Google Analytics 4 destination attached, so GA4 reports stay empty until a G- measurement id is added to the tag in Google`s tag settings (or passed as a second config).
- Cookie policy corrected to the real cookies (`rcc_session` is a cookie, not local storage; obsolete `rcc_users`/`rcc_listings` rows removed; currency/locale/2FA cookies and the `_ga` cookies added) and the privacy policy now lists Google Analytics as a processor.

### Purchase tracking (2026-09-08)
- Conversion page: every placed order lands on `/checkout/complete?order=<number>` (card, PayPal, wire, all payment methods); declined or cancelled payments now land on `/checkout/failed?order=<number>` instead of sharing the URL, and each page redirects to the other if the order state does not match. Both are noindex and robots-blocked.
- The confirmation page queues a GA4-shaped `purchase` event on the Google tag dataLayer once per order (transaction_id = order number, value/tax/shipping in USD, payment_type, items with SKU, name, unit price, quantity), deduplicated across refreshes via sessionStorage. The e2e order flow asserts it fires exactly once.

### Google Merchant Center feed (2026-09-08)
- `https://www.rarecomicscollectors.com/google-shopping-feed.xml` — RSS 2.0 with the `g:` namespace, built from the live catalogue by `src/lib/merchant-feed.ts` (route `src/app/google-shopping-feed.xml/route.ts`): every published, non-deleted listing from an approved seller with stock on hand. Regenerated at most every 15 minutes (ISR + CDN cache) and invalidated immediately when a listing is published, edited, hidden or removed (`listingChanged()` also drops the sitemap, collection and publisher caches and pings IndexNow).
- Per item: id = SKU, title (≤150), description (summary + full text + grading facts, ≤5000), canonical link, image_link + additional_image_link, availability, price / sale_price (compare-at as the regular price), condition used, brand = publisher, identifier_exists = no (no GTIN/MPN is ever invented), google_product_category "Media > Books", product_type paths (era, publisher, grader), shipping (cheapest option to the marketplace country, the figure the product page quotes), shipping_weight, external_seller_id + custom_label_0 = seller, product_detail (grade, label, cert number, page quality, publisher, year, era, key issue) and product_highlight.
- Shipping quoted per item is the cheapest option that actually delivers (`cheapestDeliveryOption`); the product page uses the same helper, so "free insured shipping" is never claimed on the strength of the in-person pickup option.
- Listings Google would disapprove are skipped and logged (`[merchant-feed] skipped <sku>: <reason>`): no image, non-positive price, missing SKU/title, duplicate id; the skip list is also written as an XML comment at the end of the feed and in the `x-feed-skipped` header.
- Verified on production (commit `bd868dd`): 72 items, 2 skipped (the two imports without cover art), 40/40 validator checks (well-formed XML, unique ids, every required attribute, 8 items cross-checked against their product pages for price, availability, image and URL, images fetchable); the order-flow e2e proves the purchase event fires exactly once per order.

### Mobile performance (2026-09-09)
- Baseline (Lighthouse 12, mobile, simulated slow 4G): home 43, store 55, product 54, collection 56. Main causes: the Google tag library (150 KB, ~0.8 s main-thread blocking during startup, competing with fonts and covers for bandwidth), web fonts swapping in after first paint (LCP re-candidate and the only layout shift), a session fetch and re-render after hydration, cover scans served at one size, and short cache lifetimes on covers.
- Round one: Google tag deferred to `lazyOnload`; fonts `display: optional` with size-adjusted fallbacks; session DTO rendered into the HTML (`src/lib/auth/session-dto.ts`) so AuthProvider no longer fetches on start; 192/256/384 px cover variants through a next/image loader with honest `sizes` on the hero and product page; `/covers/*` immutable for a year; publisher-chip counts raised from 3.2:1 to 4.9:1 contrast.
- Tried and rejected: `experimental.inlineCss` (Turbopack inlined the stylesheet three times per page: 453 KB HTML / 72 KB gzipped versus a 10 KB cached stylesheet).
- Cover scans are high-entropy halftone art (entropy 7.7 bits): WebP quality 30 only halves a 300 px file and AVIF q50 saves about 27%, so the "compress images" estimate is not achievable without visible loss; right-sizing is what was done.

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
- No cookie-consent banner yet: EEA/UK/CH visitors are measured cookielessly (Consent Mode default denied) and never get the chance to opt in; add a small banner that calls `gtag(consent,update,…)` if full analytics coverage in Europe is wanted.
