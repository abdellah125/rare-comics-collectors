/**
 * Idempotent seed: roles, bootstrap super admin, reference data (currencies,
 * countries, shipping zones, carriers, tax rules, locales), email templates,
 * categories/brands and the house inventory from src/lib/products.ts.
 *
 *   npm run db:seed              # production-safe (no demo accounts)
 *   SEED_DEMO=true npm run db:seed   # also creates demo buyer/seller/support accounts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { products } from "../src/lib/products";
import { DEFAULT_ROLES } from "../src/lib/permissions";
import coverMap from "../src/lib/gocovers-map.json";

const db = new PrismaClient();
const log = (msg: string) => console.log(`  • ${msg}`);

async function seedRoles() {
  for (const r of DEFAULT_ROLES) {
    await db.role.upsert({
      where: { slug: r.slug },
      create: { slug: r.slug, name: r.name, description: r.description, permissionsJson: JSON.stringify(r.permissions), isSystem: true },
      update: { name: r.name, description: r.description, isSystem: true },
    });
  }
  log(`${DEFAULT_ROLES.length} roles`);
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    log("ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping super admin");
    return;
  }
  const role = await db.role.findUniqueOrThrow({ where: { slug: "super_admin" } });
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await db.user.update({ where: { id: existing.id }, data: { roleId: role.id, status: "active" } });
    log(`super admin ${email} already exists (role ensured)`);
    return;
  }
  await db.user.create({
    data: { email, name: "Super Admin", passwordHash: await bcrypt.hash(password, 12), roleId: role.id, emailVerifiedAt: new Date() },
  });
  log(`super admin ${email} created`);
}

const CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$", decimals: 2, rateToBase: 1, isBase: true, isEnabled: true },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2, rateToBase: 0.92, isBase: false, isEnabled: true },
  { code: "GBP", name: "British Pound", symbol: "£", decimals: 2, rateToBase: 0.79, isBase: false, isEnabled: true },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$", decimals: 2, rateToBase: 1.36, isBase: false, isEnabled: true },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2, rateToBase: 1.52, isBase: false, isEnabled: true },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0, rateToBase: 149, isBase: false, isEnabled: true },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimals: 2, rateToBase: 0.88, isBase: false, isEnabled: true },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", decimals: 2, rateToBase: 17.2, isBase: false, isEnabled: false },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2, rateToBase: 5.1, isBase: false, isEnabled: false },
];

async function seedCurrencies() {
  for (const c of CURRENCIES) {
    await db.currency.upsert({ where: { code: c.code }, create: { ...c, rateSource: "seed" }, update: { name: c.name, symbol: c.symbol, decimals: c.decimals, isBase: c.isBase } });
  }
  log(`${CURRENCIES.length} currencies`);
}

const ZONES: { name: string; position: number; countries: [string, string, string, string?][] }[] = [
  { name: "United States", position: 0, countries: [["US", "United States", "USD"]] },
  { name: "Canada", position: 1, countries: [["CA", "Canada", "CAD"]] },
  {
    name: "United Kingdom & Europe",
    position: 2,
    countries: [
      ["GB", "United Kingdom", "GBP"], ["IE", "Ireland", "EUR"], ["DE", "Germany", "EUR"], ["FR", "France", "EUR"], ["ES", "Spain", "EUR"],
      ["IT", "Italy", "EUR"], ["NL", "Netherlands", "EUR"], ["BE", "Belgium", "EUR"], ["AT", "Austria", "EUR"], ["CH", "Switzerland", "CHF"],
      ["SE", "Sweden", "EUR"], ["NO", "Norway", "EUR"], ["DK", "Denmark", "EUR"], ["FI", "Finland", "EUR"], ["PT", "Portugal", "EUR"],
      ["PL", "Poland", "EUR"], ["CZ", "Czechia", "EUR"], ["GR", "Greece", "EUR"], ["HU", "Hungary", "EUR"], ["RO", "Romania", "EUR"], ["LU", "Luxembourg", "EUR"],
    ],
  },
  {
    name: "Asia-Pacific",
    position: 3,
    countries: [
      ["AU", "Australia", "AUD"], ["NZ", "New Zealand", "AUD"], ["JP", "Japan", "JPY"], ["SG", "Singapore", "USD"], ["HK", "Hong Kong", "USD"],
      ["KR", "South Korea", "USD"], ["TW", "Taiwan", "USD"], ["MY", "Malaysia", "USD"], ["TH", "Thailand", "USD"], ["PH", "Philippines", "USD"],
      ["ID", "Indonesia", "USD"], ["IN", "India", "USD"], ["VN", "Vietnam", "USD"],
    ],
  },
  {
    name: "Rest of world",
    position: 4,
    countries: [
      ["MX", "Mexico", "MXN"], ["BR", "Brazil", "BRL"], ["AR", "Argentina", "USD"], ["CL", "Chile", "USD"], ["CO", "Colombia", "USD"], ["PE", "Peru", "USD"],
      ["ZA", "South Africa", "USD"], ["AE", "United Arab Emirates", "USD"], ["SA", "Saudi Arabia", "USD"], ["IL", "Israel", "USD"], ["TR", "Türkiye", "USD"],
      ["EG", "Egypt", "USD"], ["NG", "Nigeria", "USD"], ["KE", "Kenya", "USD"], ["MA", "Morocco", "USD"], ["QA", "Qatar", "USD"], ["KW", "Kuwait", "USD"],
    ],
  },
];

const REGION_OF: Record<string, string> = {
  "United States": "North America", Canada: "North America", "United Kingdom & Europe": "Europe", "Asia-Pacific": "Asia-Pacific", "Rest of world": "Other",
};
const NO_POSTAL = new Set(["IE", "HK", "AE", "QA", "SA", "KW"]);
const REGION_REQUIRED = new Set(["US", "CA", "AU", "MX", "BR", "IN"]);

const METHODS: Record<string, { name: string; description: string; price: number; freeOver?: number; min: number; max: number; carrier?: string }[]> = {
  "United States": [
    { name: "Insured standard", description: "Double-boxed, signature required, insured to full value.", price: 1495, freeOver: 25000, min: 2, max: 5, carrier: "usps" },
    { name: "Insured express", description: "Priority handling, same insurance and packaging.", price: 3995, min: 1, max: 2, carrier: "fedex" },
    { name: "Vault pickup — Austin, TX", description: "Collect in person at the vault. ID required.", price: 0, min: 0, max: 1 },
  ],
  Canada: [
    { name: "Insured international standard", description: "Tracked and insured, duties payable on delivery.", price: 2995, freeOver: 50000, min: 5, max: 10, carrier: "ups" },
    { name: "Insured international express", description: "Priority customs handling.", price: 5995, min: 2, max: 4, carrier: "dhl" },
  ],
  "United Kingdom & Europe": [
    { name: "Insured international standard", description: "Tracked and insured, duties/VAT payable on delivery.", price: 4995, freeOver: 100000, min: 6, max: 12, carrier: "ups" },
    { name: "Insured international express", description: "Priority customs handling.", price: 8995, min: 2, max: 5, carrier: "dhl" },
  ],
  "Asia-Pacific": [
    { name: "Insured international standard", description: "Tracked and insured, duties payable on delivery.", price: 5995, freeOver: 100000, min: 7, max: 14, carrier: "dhl" },
    { name: "Insured international express", description: "Priority customs handling.", price: 9995, min: 3, max: 6, carrier: "dhl" },
  ],
  "Rest of world": [
    { name: "Insured international standard", description: "Tracked and insured, duties payable on delivery.", price: 6995, min: 8, max: 18, carrier: "dhl" },
    { name: "Insured international express", description: "Priority customs handling.", price: 11995, min: 3, max: 7, carrier: "dhl" },
  ],
};

const CARRIERS = [
  { code: "usps", name: "USPS", trackingUrlTemplate: "https://tools.usps.com/go/TrackConfirmAction?tLabels={tracking}" },
  { code: "ups", name: "UPS", trackingUrlTemplate: "https://www.ups.com/track?tracknum={tracking}" },
  { code: "fedex", name: "FedEx", trackingUrlTemplate: "https://www.fedex.com/fedextrack/?trknbr={tracking}" },
  { code: "dhl", name: "DHL Express", trackingUrlTemplate: "https://www.dhl.com/en/express/tracking.html?AWB={tracking}" },
  { code: "other", name: "Other / hand delivered", trackingUrlTemplate: null },
];

async function seedShippingAndCountries() {
  for (const c of CARRIERS) {
    await db.carrier.upsert({ where: { code: c.code }, create: c, update: { name: c.name, trackingUrlTemplate: c.trackingUrlTemplate } });
  }
  const carriers = Object.fromEntries((await db.carrier.findMany()).map((c) => [c.code, c.id]));
  for (const z of ZONES) {
    let zone = await db.shippingZone.findFirst({ where: { name: z.name } });
    if (!zone) zone = await db.shippingZone.create({ data: { name: z.name, position: z.position } });
    for (const [code, name, currency] of z.countries) {
      await db.country.upsert({
        where: { code },
        create: {
          code,
          name,
          region: REGION_OF[z.name],
          currencyCode: currency,
          shippingZoneId: zone.id,
          postalCodeRequired: !NO_POSTAL.has(code),
          regionRequired: REGION_REQUIRED.has(code),
        },
        update: { name, region: REGION_OF[z.name] },
      });
    }
    const existing = await db.shippingMethod.count({ where: { zoneId: zone.id } });
    if (existing === 0) {
      let position = 0;
      for (const m of METHODS[z.name] ?? []) {
        await db.shippingMethod.create({
          data: {
            zoneId: zone.id,
            name: m.name,
            description: m.description,
            price: m.price,
            freeOverSubtotal: m.freeOver ?? null,
            estimatedDaysMin: m.min,
            estimatedDaysMax: m.max,
            carrierId: m.carrier ? carriers[m.carrier] : null,
            requiresSignature: m.price > 0,
            isInsured: m.price > 0,
            position: position++,
          },
        });
      }
    }
  }
  // Countries where the marketplace does not trade.
  for (const [code, name] of [["RU", "Russia"], ["BY", "Belarus"], ["KP", "North Korea"], ["IR", "Iran"]]) {
    await db.country.upsert({
      where: { code },
      create: { code, name, region: "Other", isEnabled: false, buyersAllowed: false, sellersAllowed: false, restrictionNote: "Trade restrictions — orders and seller accounts are not accepted." },
      update: {},
    });
  }
  log(`${ZONES.length} shipping zones, ${ZONES.reduce((n, z) => n + z.countries.length, 0) + 4} countries, ${CARRIERS.length} carriers`);
}

const TAX_RULES = [
  { countryCode: "US", region: "TX", label: "TX sales tax", rateBps: 825 },
  { countryCode: "US", region: "CA", label: "CA sales tax", rateBps: 725 },
  { countryCode: "US", region: "NY", label: "NY sales tax", rateBps: 800 },
  { countryCode: "US", region: "FL", label: "FL sales tax", rateBps: 600 },
  { countryCode: "US", region: "IL", label: "IL sales tax", rateBps: 625 },
  { countryCode: "US", region: "WA", label: "WA sales tax", rateBps: 650 },
  { countryCode: "GB", region: null, label: "VAT", rateBps: 2000 },
  { countryCode: "DE", region: null, label: "MwSt", rateBps: 1900 },
  { countryCode: "FR", region: null, label: "TVA", rateBps: 2000 },
  { countryCode: "CA", region: null, label: "GST", rateBps: 500 },
  { countryCode: "AU", region: null, label: "GST", rateBps: 1000 },
];

async function seedTax() {
  const count = await db.taxRule.count();
  if (count > 0) return;
  for (const r of TAX_RULES) await db.taxRule.create({ data: r });
  log(`${TAX_RULES.length} tax rules`);
}

async function seedLocales() {
  for (const [code, name, isDefault] of [["en", "English", true], ["es", "Español", false], ["fr", "Français", false], ["de", "Deutsch", false]] as const) {
    await db.locale.upsert({ where: { code }, create: { code, name, isDefault, isEnabled: code === "en" }, update: { name } });
  }
  log("4 locales");
}

const TEMPLATES: { key: string; name: string; subject: string; body: string; vars: string[] }[] = [
  { key: "welcome", name: "Welcome", subject: "Welcome to {{siteName}}", body: "Hi {{name}},\n\nYour {{siteName}} account is ready. Track orders, follow grading submissions and manage your collection at {{siteUrl}}/account.\n\n— {{siteName}}", vars: ["name"] },
  { key: "password_reset", name: "Password reset", subject: "Reset your {{siteName}} password", body: "Hi {{name}},\n\nUse this link to choose a new password. It expires in 30 minutes:\n{{resetUrl}}\n\nIf you didn't request this, you can ignore this email.", vars: ["name", "resetUrl"] },
  { key: "login_new_device", name: "New device sign-in", subject: "New sign-in to your {{siteName}} account", body: "Hi {{name}},\n\nWe noticed a new sign-in from {{device}} ({{ip}}). If this wasn't you, reset your password immediately at {{siteUrl}}/account/reset.", vars: ["name", "device", "ip"] },
  { key: "order_confirmation", name: "Order confirmation", subject: "Order {{orderNumber}} confirmed", body: "Hi {{name}},\n\nThanks for your order {{orderNumber}} — total {{total}}.\n\n{{itemsList}}\n\nTrack it any time: {{siteUrl}}/track-order?ref={{orderNumber}}\n\n— {{siteName}}", vars: ["name", "orderNumber", "total", "itemsList"] },
  { key: "order_awaiting_payment", name: "Awaiting payment", subject: "Order {{orderNumber}}: payment instructions", body: "Hi {{name}},\n\nYour order {{orderNumber}} ({{total}}) is reserved and awaiting payment.\n\n{{instructions}}\n\nThe reservation is held for {{hours}} hours.", vars: ["name", "orderNumber", "total", "instructions", "hours"] },
  { key: "order_shipped", name: "Order shipped", subject: "Order {{orderNumber}} has shipped", body: "Hi {{name}},\n\nGood news — your order {{orderNumber}} is on its way via {{carrier}}.\nTracking: {{trackingNumber}}\n{{trackingUrl}}\n\nSignature is required on delivery.", vars: ["name", "orderNumber", "carrier", "trackingNumber", "trackingUrl"] },
  { key: "order_delivered", name: "Order delivered", subject: "Order {{orderNumber}} delivered", body: "Hi {{name}},\n\nOrder {{orderNumber}} shows as delivered. Your 14-day inspection window starts today. Questions? {{siteUrl}}/support", vars: ["name", "orderNumber"] },
  { key: "order_cancelled", name: "Order cancelled", subject: "Order {{orderNumber}} cancelled", body: "Hi {{name}},\n\nOrder {{orderNumber}} has been cancelled. Reason: {{reason}}\nAny payment taken will be refunded to the original method.", vars: ["name", "orderNumber", "reason"] },
  { key: "refund_issued", name: "Refund issued", subject: "Refund of {{amount}} for order {{orderNumber}}", body: "Hi {{name}},\n\nWe've issued a refund of {{amount}} for order {{orderNumber}}. It usually appears within 5–10 business days depending on your bank.", vars: ["name", "orderNumber", "amount"] },
  { key: "return_update", name: "Return request update", subject: "Return request for order {{orderNumber}}: {{status}}", body: "Hi {{name}},\n\nYour return request for order {{orderNumber}} is now: {{status}}.\n{{note}}", vars: ["name", "orderNumber", "status", "note"] },
  { key: "dispute_update", name: "Dispute update", subject: "Dispute on order {{orderNumber}}: {{status}}", body: "Hi {{name}},\n\nThe dispute on order {{orderNumber}} is now: {{status}}.\n{{note}}\n\nView it: {{siteUrl}}/account/orders/{{orderNumber}}", vars: ["name", "orderNumber", "status", "note"] },
  { key: "seller_application_received", name: "Seller application received", subject: "We received your seller application", body: "Hi {{name}},\n\nThanks for applying to sell on {{siteName}}. We review applications within two business days and will email you as soon as there's a decision.", vars: ["name"] },
  { key: "seller_approved", name: "Seller approved", subject: "You're approved to sell on {{siteName}}", body: "Hi {{name}},\n\nYour seller account is live. Start listing at {{siteUrl}}/dashboard/listings/new.\n\nCommission on sales: {{commission}}.", vars: ["name", "commission"] },
  { key: "seller_rejected", name: "Seller rejected", subject: "Update on your seller application", body: "Hi {{name}},\n\nWe can't approve your seller application right now.\n{{reason}}\n\nYou can reply to this email if you have questions.", vars: ["name", "reason"] },
  { key: "seller_new_order", name: "New order for seller", subject: "New sale: {{itemTitle}} ({{orderNumber}})", body: "Hi {{name}},\n\nYou sold {{itemTitle}} in order {{orderNumber}}. Ship within {{handlingDays}} business days and add the tracking number in your dashboard: {{siteUrl}}/dashboard/orders", vars: ["name", "itemTitle", "orderNumber", "handlingDays"] },
  { key: "payout_paid", name: "Payout sent", subject: "Payout of {{amount}} sent", body: "Hi {{name}},\n\nA payout of {{amount}} was sent to {{destination}} (reference {{reference}}).", vars: ["name", "amount", "destination", "reference"] },
  { key: "ticket_created", name: "Support ticket created", subject: "[{{ticketNumber}}] We received your request", body: "Hi {{name}},\n\nWe've opened ticket {{ticketNumber}}: {{subject}}. Our team replies within one business day.", vars: ["name", "ticketNumber", "subject"] },
  { key: "ticket_reply", name: "Support reply", subject: "[{{ticketNumber}}] {{subject}}", body: "Hi {{name}},\n\n{{message}}\n\nReply at {{siteUrl}}/account/support/{{ticketNumber}}", vars: ["name", "ticketNumber", "subject", "message"] },
  { key: "account_status", name: "Account status change", subject: "Your {{siteName}} account: {{status}}", body: "Hi {{name}},\n\nYour account status is now: {{status}}.\n{{reason}}\n\nIf you believe this is a mistake, contact {{supportEmail}}.", vars: ["name", "status", "reason"] },
  {key: "admin_invite",name: "Admin invitation",subject: "You have been given admin access to {{siteName}}",body: "Hi {{name}},\n\n{{invitedBy}} gave you the \"{{roleName}}\" role on {{siteName}}.\n\nSet your password here (valid 24 hours):\n{{resetUrl}}\n\nThen sign in at {{adminUrl}} and enrol two-factor authentication.",vars: ["name", "roleName", "invitedBy", "resetUrl", "adminUrl"]},
  { key: "broadcast", name: "Announcement broadcast", subject: "{{subject}}", body: "{{message}}\n\n— {{siteName}}", vars: ["subject", "message"] },
  { key: "review_reply", name: "Seller replied to your review", subject: "{{sellerName}} replied to your review", body: "Hi {{name}},\n\n{{sellerName}} replied to your review of {{productTitle}}:\n\n{{reply}}", vars: ["name", "sellerName", "productTitle", "reply"] },
];

async function seedTemplates() {
  for (const t of TEMPLATES) {
    await db.emailTemplate.upsert({
      where: { key: t.key },
      create: { key: t.key, name: t.name, subject: t.subject, bodyText: t.body, variablesJson: JSON.stringify(t.vars) },
      update: { name: t.name, variablesJson: JSON.stringify(t.vars) },
    });
  }
  log(`${TEMPLATES.length} email templates`);
}

const CATEGORIES = [
  { slug: "golden-age", name: "Golden Age (1938–1956)", position: 0 },
  { slug: "silver-age", name: "Silver Age (1956–1970)", position: 1 },
  { slug: "bronze-age", name: "Bronze Age (1970–1985)", position: 2 },
  { slug: "copper-age", name: "Copper Age (1985–1991)", position: 3 },
  { slug: "modern-age", name: "Modern Age (1992–present)", position: 4 },
  { slug: "raw-books", name: "Raw (ungraded) books", position: 5 },
  { slug: "sets-and-lots", name: "Sets & lots", position: 6 },
];
const ERA_CATEGORY: Record<string, string> = { "Golden Age": "golden-age", "Silver Age": "silver-age", "Bronze Age": "bronze-age", "Copper Age": "copper-age", "Modern Age": "modern-age" };

async function seedCatalog() {
  for (const c of CATEGORIES) await db.category.upsert({ where: { slug: c.slug }, create: c, update: { name: c.name, position: c.position } });
  const publishers = [...new Set(products.map((p) => p.publisher))];
  for (const name of publishers) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    await db.brand.upsert({ where: { slug }, create: { slug, name }, update: { name } });
  }
  const cats = Object.fromEntries((await db.category.findMany()).map((c) => [c.slug, c.id]));
  const brands = Object.fromEntries((await db.brand.findMany()).map((b) => [b.name, b.id]));
  const covers = coverMap as Record<string, string>;
  let created = 0;
  for (const p of products) {
    const data = {
      title: p.title,
      issue: p.issue,
      publisher: p.publisher,
      brandId: brands[p.publisher] ?? null,
      categoryId: cats[ERA_CATEGORY[p.era]] ?? null,
      year: p.year,
      era: p.era,
      grader: p.grader,
      grade: p.grade,
      label: p.label,
      certNumber: p.certNumber ?? null,
      sku: p.sku,
      price: p.price,
      compareAt: p.compareAt ?? null,
      stock: p.stock,
      keyIssue: p.keyIssue ?? null,
      writer: p.creators.writer,
      artist: p.creators.artist,
      coverArtist: p.creators.cover,
      summary: p.summary,
      description: p.description.join("\n\n"),
      highlightsJson: JSON.stringify(p.highlights),
      paletteFrom: p.palette[0],
      paletteTo: p.palette[1],
      featured: Boolean(p.featured),
      bestseller: Boolean(p.bestseller),
      ratingAvg: p.rating,
      ratingCount: p.reviewCount,
    };
    const existing = await db.product.findUnique({ where: { slug: p.slug }, select: { id: true } });
    if (existing) {
      await db.product.update({ where: { id: existing.id }, data: { ...data } });
      continue;
    }
    const url = covers[p.slug] ?? p.image ?? `/covers/${p.slug}.svg`;
    await db.product.create({
      data: { ...data, slug: p.slug, status: "published", publishedAt: new Date(), images: { create: [{ url, alt: `${p.title} ${p.issue} cover`, position: 0 }] } },
    });
    created += 1;
  }
  log(`${CATEGORIES.length} categories, ${publishers.length} brands, ${products.length} products (${created} new)`);
}

async function seedDemo() {
  if (process.env.SEED_DEMO !== "true" && process.env.NODE_ENV === "production") return;
  if (process.env.SEED_DEMO !== "true") {
    log("SEED_DEMO not set — skipping demo accounts");
    return;
  }
  const pw = await bcrypt.hash("DemoPass2026!", 12);
  const support = await db.role.findUniqueOrThrow({ where: { slug: "support" } });
  const finance = await db.role.findUniqueOrThrow({ where: { slug: "finance" } });
  const users = [
    { email: "buyer@demo.com", name: "Dana Buyer", roleId: null as string | null, countryCode: "US" },
    { email: "goldenageguru@demo.com", name: "Golden Age Guru", roleId: null, countryCode: "US" },
    { email: "silverstacker42@demo.com", name: "Silver Stacker", roleId: null, countryCode: "GB" },
    { email: "support@demo.com", name: "Sam Support", roleId: support.id, countryCode: "US" },
    { email: "finance@demo.com", name: "Fran Finance", roleId: finance.id, countryCode: "US" },
  ];
  for (const u of users) {
    await db.user.upsert({
      where: { email: u.email },
      create: { email: u.email, name: u.name, passwordHash: pw, roleId: u.roleId, countryCode: u.countryCode, emailVerifiedAt: new Date() },
      update: { roleId: u.roleId },
    });
  }
  const guru = await db.user.findUniqueOrThrow({ where: { email: "goldenageguru@demo.com" } });
  await db.user.update({ where: { id: guru.id }, data: { isSeller: true } });
  await db.sellerProfile.upsert({
    where: { userId: guru.id },
    create: { userId: guru.id, slug: "golden-age-guru", displayName: "Golden Age Guru", bio: "Golden Age specialist since 2016. Every book photographed in the holder.", status: "approved", verificationStatus: "verified", verifiedAt: new Date(), approvedAt: new Date(), countryCode: "US", shipsFromCountry: "US", payoutMethod: "manual", payoutDetailsMasked: "Bank ••••1234" },
    update: {},
  });
  const stacker = await db.user.findUniqueOrThrow({ where: { email: "silverstacker42@demo.com" } });
  await db.user.update({ where: { id: stacker.id }, data: { isSeller: true } });
  await db.sellerProfile.upsert({
    where: { userId: stacker.id },
    create: { userId: stacker.id, slug: "silver-stacker", displayName: "Silver Stacker", status: "pending", countryCode: "GB", shipsFromCountry: "GB", applicationNote: "Selling a curated Silver Age Marvel run, all CGC 8.0+." },
    update: {},
  });
  log("demo accounts: buyer@demo.com, goldenageguru@demo.com (seller), silverstacker42@demo.com (pending seller), support@demo.com, finance@demo.com — password DemoPass2026!");
}

async function main() {
  console.log("Seeding…");
  await seedRoles();
  await seedAdmin();
  await seedCurrencies();
  await seedShippingAndCountries();
  await seedTax();
  await seedLocales();
  await seedTemplates();
  await seedCatalog();
  await seedDemo();
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
