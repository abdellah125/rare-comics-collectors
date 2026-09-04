# Rare Comics Collectors

Marketplace for graded comics (CGC / CBCS / raw) with collector services, a multi-vendor
seller programme, buyer accounts and a full administration panel. Next.js 16 (App Router,
Turbopack), React 19, Tailwind CSS 4, Prisma 6.

## Getting started

```bash
npm ci
cp .env.example .env          # then fill in SESSION_SECRET, APP_ENCRYPTION_KEY, ADMIN_EMAIL/PASSWORD
npm run db:migrate:dev        # creates the SQLite database from prisma/schema.prisma
npm run db:seed               # roles, super admin, currencies, countries, shipping, tax, templates, catalogue
npm run dev                   # http://localhost:3000
```

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Development server, production build (`prisma generate` first), production server |
| `npm run lint`, `npm run typecheck` | ESLint, `tsc --noEmit` |
| `npm test` | Vitest unit tests (`tests/unit`) |
| `npm run test:e2e` | Playwright end-to-end suite (`tests/e2e`; seeds its own accounts, starts the dev server) |
| `npm run db:migrate` / `db:migrate:dev` / `db:studio` / `db:reset` | Prisma migrations and tooling |
| `npm run db:seed` | Idempotent seed (`SEED_DEMO=true` also creates demo buyer/seller accounts and orders) |

## Admin panel

The panel lives at **`/admin`** (login at `/admin/login`). The first super admin comes from
`ADMIN_EMAIL` / `ADMIN_PASSWORD` when you seed; change the password after the first login.
Two-factor authentication is required for every admin account by default (`Settings › Security`),
so the first sign-in walks through authenticator enrolment.

Every admin page and server action checks a permission on the server
(`src/lib/permissions.ts`; wildcard `*` for super admins). Roles are editable under
`Admins & roles`; the built-in ones are Super Admin, Admin, Moderator, Support and Finance.
Optional hardening: `ADMIN_IP_ALLOWLIST` (comma-separated IPs / CIDR prefixes) makes `/admin`
return 404 to everyone else.

Sections: dashboard and reports (CSV export via `/api/admin/export/<report>`), orders,
payments/refunds, returns, disputes and chargebacks, shipping (zones, methods, carriers,
countries), listings and catalogue, reviews, promotions (coupons, campaigns, featured),
users (with audited impersonation), sellers (applications, verification, payouts), finance
(payouts, providers, currencies, taxes, fees), support tickets, moderation (reports,
violations, appeals), notifications (templates, announcements, broadcast, email log),
settings (branding, commerce, sellers, features, security, localization, maintenance mode),
admins and roles, audit and security log, jobs and webhooks.

## Architecture

| Path | What it is |
| --- | --- |
| `src/app/(site)` | Storefront: home, store, product pages, seller storefronts, cart, checkout, tracking, account area, seller dashboard |
| `src/app/admin` | Admin panel pages (server components + server actions) |
| `src/app/api` | Session DTO, media delivery, payment webhooks, cron job runner, CSV exports |
| `src/lib/auth` | Sessions (DB-backed, httpOnly cookie), passwords, TOTP, login/lockout, impersonation |
| `src/lib/admin` | Admin action modules, list/query helpers, metrics, reports, CSV, settings spec |
| `src/lib/payments` | Provider interface + registry (`test`, `bank_transfer`, `stripe`, `paypal`), webhook ingestion, refunds |
| `src/lib/finance` | Seller ledger, balances, payouts |
| `src/lib/orders`, `src/lib/commerce` | Order lifecycle, fulfilment, checkout, pricing, coupons, countries |
| `src/lib/jobs` | Database job queue, handlers, recurring jobs |
| `src/lib/settings.ts` | Typed settings with defaults, overridable from the admin panel |
| `src/components/admin` | Admin design system (shell, tables, filters, forms, bulk actions, confirm dialogs) |
| `src/components/charts` | Dependency-free SVG charts used by the dashboard and reports |
| `prisma/` | Schema, migrations, seed |
| `tests/unit`, `tests/e2e` | Vitest and Playwright suites |

Key rules baked into the code:

- Money is stored as integers in the base currency's minor units; other currencies are
  presentment only (rates refresh from `EXCHANGE_RATE_API_URL`).
- Payment secrets stay in environment variables. The database never holds card numbers or
  provider keys; providers return tokens/references only.
- Every privileged change writes an `AuditLog` row (actor, target, before/after, IP).
  Security-relevant events (logins, lockouts, 2FA, impersonation) go to `SecurityEvent`.
- Checkout is idempotent (`IdempotencyKey`), reserves stock atomically and expires unpaid
  orders through the job queue.

## Database

Development uses SQLite (`DATABASE_URL="file:./dev.db"`). The schema avoids SQLite-only and
Postgres-only features (no enums, JSON stored as text, integers for money), so switching is:

1. Set `provider = "postgresql"` in `prisma/schema.prisma` and `DATABASE_URL` to the Postgres URL.
2. Delete `prisma/migrations` and run `npm run db:migrate:dev -- --name init` to generate a
   fresh migration for the new provider (or hand-port the existing one).
3. `npm run db:seed`.

## Background jobs

Emails, exchange rates, unpaid-order expiry, auto-completion, payout scheduling and cleanup
run through the `Job` table. On a long-running Node server the in-process worker in
`src/instrumentation.ts` polls it. On serverless hosts schedule a cron that calls
`POST /api/jobs/run` with `Authorization: Bearer $JOBS_SECRET` every minute. The admin panel
(`Jobs & webhooks`) can retry, cancel and run jobs manually.

## Payments

Enable providers under `Finance › Payment providers`. Stripe and PayPal read their keys from
the environment and receive webhooks at `/api/webhooks/stripe` and `/api/webhooks/paypal`
(signature-verified, stored once, reprocessable from the admin panel). `bank_transfer` records
offline instructions; `test` is a zero-cost provider for local development and the e2e suite.
Live Stripe/PayPal flows have not been exercised against real accounts in this repository —
run a sandbox transaction before launch.

## Deployment checklist

- `NEXT_PUBLIC_SITE_URL`, `SESSION_SECRET`, `APP_ENCRYPTION_KEY`, `JOBS_SECRET` set; `UPLOAD_DIR`
  on persistent storage (or put uploads behind object storage by swapping `src/lib/media.ts`).
- SMTP configured (otherwise mail is only logged), payment keys and webhook secrets set.
- `npm run build && npm run start` behind HTTPS; a cron for `/api/jobs/run` if the process is
  not long-lived; database backups.
- Seed, sign in at `/admin/login`, enrol 2FA, rotate the seeded password, review
  `Settings` and `Finance` before opening the store.

`wordpress/` contains an unrelated WordPress/Elementor export and is not part of the build.
