# Rare Comics Collectors

Storefront and collector-services site for Rare Comics Collectors: graded comic sales
(CGC / CBCS / raw), grading submission, pressing, restoration detection, appraisal,
consignment and vault storage. Built with Next.js 16 (App Router), React 19 and
Tailwind CSS 4.

## Getting started

```bash
npm ci
npm run dev      # http://localhost:3000
npm run lint     # ESLint
npm run build    # production build (prerenders every listing)
npm run start
```

Set `NEXT_PUBLIC_SITE_URL` in production so canonical URLs, the sitemap, Open Graph
images and structured data point at the live domain.

## Where things live

| Path | What it is |
| --- | --- |
| `src/app` | Routes: home, store + product pages, services, policies, FAQ, support, contact, cart, checkout, account, seller dashboard |
| `src/components` | UI — header/footer, cart provider + drawer, product cards, forms |
| `src/lib/products.ts` | The 17 featured key issues (hand-written copy) |
| `src/lib/catalog.ts` | 1,500 deterministic generated listings + demo sellers |
| `src/lib/services.ts`, `policies.tsx`, `site.ts` | Services, policy documents, business details (NAP, hours, socials) |
| `src/lib/pricing.ts` | Shipping / tax rules shared by cart, checkout, product pages and the shipping policy |
| `public/covers` | Cover art: real scans for the featured books, generated SVG plates for the rest |
| `scripts/fetch-gocollect-covers.mjs` | Pulls cover JPEGs for the featured products into `public/covers` |
| `wordpress/` | Separate WordPress/Elementor export — not part of the Next.js build |

## Demo boundaries

This is a front-end demo: checkout, the contact/track-order forms, authentication and
seller listings run entirely in the browser (localStorage) and are labelled as such on
each page. Before launch, connect a payment processor, a form/email backend and a real
auth provider.

Demo sign-in: `goldenageguru@demo.com` / `demo123`.
