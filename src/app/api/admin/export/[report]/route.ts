import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { csvResponse, toCsv } from "@/lib/admin/csv";
import { actorOf } from "@/lib/admin/guard";
import { resolveRange, type DateRange } from "@/lib/admin/query";
import { buildReport } from "@/lib/admin/reports";
import { assertAdmin, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { Permission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const money = (v: number | null | undefined) => ((v ?? 0) / 100).toFixed(2);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : "");
const MAX = 50_000;

type Builder = (range: DateRange) => Promise<{ header: string[]; rows: unknown[][] }>;

/** Every export: required permission + row builder. Sensitive columns (hashes, secrets, full addresses) are never included. */
const EXPORTS: Record<string, { perm: Permission; build: Builder }> = {
  orders: {
    perm: "orders.view",
    build: async (r) => {
      const rows = await db.order.findMany({ where: { createdAt: { gte: r.from, lte: r.to } }, orderBy: { createdAt: "desc" }, take: MAX, select: { number: true, createdAt: true, paidAt: true, email: true, status: true, paymentStatus: true, fulfillmentStatus: true, currency: true, subtotal: true, discountTotal: true, shippingTotal: true, taxTotal: true, total: true, countryCode: true, couponCode: true, riskScore: true } });
      return { header: ["number", "created", "paid", "email", "status", "payment", "fulfilment", "currency", "subtotal", "discount", "shipping", "tax", "total", "country", "coupon", "risk"], rows: rows.map((o) => [o.number, iso(o.createdAt), iso(o.paidAt), o.email, o.status, o.paymentStatus, o.fulfillmentStatus, o.currency, money(o.subtotal), money(o.discountTotal), money(o.shippingTotal), money(o.taxTotal), money(o.total), o.countryCode ?? "", o.couponCode ?? "", o.riskScore]) };
    },
  },
  order_items: {
    perm: "orders.view",
    build: async (r) => {
      const rows = await db.orderItem.findMany({ where: { order: { createdAt: { gte: r.from, lte: r.to } } }, orderBy: { createdAt: "desc" }, take: MAX, select: { order: { select: { number: true } }, sku: true, title: true, qty: true, unitPrice: true, subtotal: true, discountAmount: true, taxAmount: true, commissionAmount: true, sellerNet: true, status: true, seller: { select: { displayName: true } } } });
      return { header: ["order", "sku", "title", "qty", "unit_price", "subtotal", "discount", "tax", "commission", "seller_net", "status", "seller"], rows: rows.map((i) => [i.order.number, i.sku ?? "", i.title, i.qty, money(i.unitPrice), money(i.subtotal), money(i.discountAmount), money(i.taxAmount), money(i.commissionAmount), money(i.sellerNet), i.status, i.seller?.displayName ?? "Marketplace"]) };
    },
  },
  payments: {
    perm: "finance.view",
    build: async (r) => {
      const rows = await db.payment.findMany({ where: { createdAt: { gte: r.from, lte: r.to } }, orderBy: { createdAt: "desc" }, take: MAX, select: { createdAt: true, order: { select: { number: true } }, provider: true, providerRef: true, method: true, status: true, amount: true, currency: true, presentmentAmount: true, refundedAmount: true, feeAmount: true, cardBrand: true, cardLast4: true, failureCode: true } });
      return { header: ["created", "order", "provider", "provider_ref", "method", "status", "amount", "currency", "presentment_amount", "refunded", "fee", "card", "failure"], rows: rows.map((p) => [iso(p.createdAt), p.order.number, p.provider, p.providerRef ?? "", p.method ?? "", p.status, money(p.amount), p.currency, p.presentmentAmount, money(p.refundedAmount), money(p.feeAmount), p.cardBrand ? `${p.cardBrand} ****${p.cardLast4 ?? ""}` : "", p.failureCode ?? ""]) };
    },
  },
  refunds: {
    perm: "finance.view",
    build: async (r) => {
      const rows = await db.refund.findMany({ where: { createdAt: { gte: r.from, lte: r.to } }, orderBy: { createdAt: "desc" }, take: MAX, select: { createdAt: true, order: { select: { number: true } }, amount: true, reason: true, status: true, providerRef: true, note: true } });
      return { header: ["created", "order", "amount", "reason", "status", "provider_ref", "note"], rows: rows.map((x) => [iso(x.createdAt), x.order.number, money(x.amount), x.reason, x.status, x.providerRef ?? "", x.note ?? ""]) };
    },
  },
  payouts: {
    perm: "finance.view",
    build: async (r) => {
      const rows = await db.payout.findMany({ where: { createdAt: { gte: r.from, lte: r.to } }, orderBy: { createdAt: "desc" }, take: MAX, select: { createdAt: true, paidAt: true, seller: { select: { displayName: true } }, amount: true, status: true, method: true, destinationMasked: true, reference: true } });
      return { header: ["created", "paid", "seller", "amount", "status", "method", "destination", "reference"], rows: rows.map((p) => [iso(p.createdAt), iso(p.paidAt), p.seller.displayName, money(p.amount), p.status, p.method ?? "", p.destinationMasked ?? "", p.reference ?? ""]) };
    },
  },
  ledger: {
    perm: "finance.view",
    build: async (r) => {
      const rows = await db.ledgerEntry.findMany({ where: { createdAt: { gte: r.from, lte: r.to } }, orderBy: { createdAt: "desc" }, take: MAX, select: { createdAt: true, seller: { select: { displayName: true } }, type: true, amount: true, description: true, order: { select: { number: true } }, availableAt: true, payoutId: true } });
      return { header: ["created", "seller", "type", "amount", "description", "order", "available", "payout"], rows: rows.map((e) => [iso(e.createdAt), e.seller.displayName, e.type, money(e.amount), e.description, e.order?.number ?? "", iso(e.availableAt), e.payoutId ?? ""]) };
    },
  },
  products: {
    perm: "products.view",
    build: async () => {
      const rows = await db.product.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: MAX, select: { sku: true, title: true, issue: true, publisher: true, year: true, grader: true, grade: true, price: true, stock: true, status: true, featured: true, viewCount: true, soldCount: true, seller: { select: { displayName: true } }, category: { select: { name: true } } } });
      return { header: ["sku", "title", "issue", "publisher", "year", "grader", "grade", "price", "stock", "status", "featured", "views", "sold", "seller", "category"], rows: rows.map((p) => [p.sku, p.title, p.issue, p.publisher, p.year, p.grader, p.grade, money(p.price), p.stock, p.status, p.featured ? "yes" : "no", p.viewCount, p.soldCount, p.seller?.displayName ?? "Marketplace", p.category?.name ?? ""]) };
    },
  },
  users: {
    perm: "users.view",
    build: async () => {
      const rows = await db.user.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: MAX, select: { email: true, name: true, status: true, isSeller: true, role: { select: { name: true } }, countryCode: true, createdAt: true, lastLoginAt: true, marketingOptIn: true, _count: { select: { orders: true } } } });
      return { header: ["email", "name", "status", "seller", "role", "country", "created", "last_login", "marketing_opt_in", "orders"], rows: rows.map((u) => [u.email, u.name, u.status, u.isSeller ? "yes" : "no", u.role?.name ?? "", u.countryCode ?? "", iso(u.createdAt), iso(u.lastLoginAt), u.marketingOptIn ? "yes" : "no", u._count.orders]) };
    },
  },
  sellers: {
    perm: "sellers.view",
    build: async () => {
      const rows = await db.sellerProfile.findMany({ orderBy: { createdAt: "desc" }, take: MAX, select: { displayName: true, slug: true, status: true, verificationStatus: true, countryCode: true, commissionBps: true, ratingAvg: true, ratingCount: true, salesCount: true, createdAt: true, user: { select: { email: true } }, _count: { select: { products: true } } } });
      return { header: ["seller", "slug", "email", "status", "verification", "country", "commission_bps", "rating", "ratings", "sales", "listings", "created"], rows: rows.map((s) => [s.displayName, s.slug, s.user.email, s.status, s.verificationStatus, s.countryCode, s.commissionBps ?? "", s.ratingAvg.toFixed(2), s.ratingCount, s.salesCount, s._count.products, iso(s.createdAt)]) };
    },
  },
  tickets: {
    perm: "support.view",
    build: async (r) => {
      const rows = await db.ticket.findMany({ where: { createdAt: { gte: r.from, lte: r.to } }, orderBy: { createdAt: "desc" }, take: MAX, select: { number: true, createdAt: true, email: true, subject: true, status: true, priority: true, category: true, assignedTo: { select: { name: true } }, firstResponseAt: true, resolvedAt: true, order: { select: { number: true } } } });
      return { header: ["number", "created", "email", "subject", "status", "priority", "category", "assignee", "first_response", "resolved", "order"], rows: rows.map((t) => [t.number, iso(t.createdAt), t.email, t.subject, t.status, t.priority, t.category, t.assignedTo?.name ?? "", iso(t.firstResponseAt), iso(t.resolvedAt), t.order?.number ?? ""]) };
    },
  },
  audit: {
    perm: "audit.view",
    build: async (r) => {
      const rows = await db.auditLog.findMany({ where: { createdAt: { gte: r.from, lte: r.to } }, orderBy: { createdAt: "desc" }, take: MAX, select: { createdAt: true, actorType: true, actorEmail: true, action: true, targetType: true, targetId: true, summary: true, ip: true } });
      return { header: ["when", "actor_type", "actor", "action", "target_type", "target_id", "summary", "ip"], rows: rows.map((a) => [iso(a.createdAt), a.actorType, a.actorEmail ?? "", a.action, a.targetType ?? "", a.targetId ?? "", a.summary, a.ip ?? ""]) };
    },
  },
  sales_by_day: { perm: "reports.view", build: async (r) => { const rep = await buildReport(r); return { header: ["period", "gmv", "orders", "refunds"], rows: rep.series.labels.map((l, i) => [l, money(rep.series.gmv[i]), rep.series.orders[i], money(rep.series.refunds[i])]) }; } },
  top_products: { perm: "reports.view", build: async (r) => { const rep = await buildReport(r); return { header: ["product", "qty", "revenue", "commission", "order_lines"], rows: rep.topProducts.map((x) => [x.label, x.qty, money(x.revenue), money(x.commission), x.orders]) }; } },
  top_sellers: { perm: "reports.view", build: async (r) => { const rep = await buildReport(r); return { header: ["seller", "qty", "revenue", "commission", "order_lines"], rows: rep.topSellers.map((x) => [x.label, x.qty, money(x.revenue), money(x.commission), x.orders]) }; } },
  top_categories: { perm: "reports.view", build: async (r) => { const rep = await buildReport(r); return { header: ["category", "qty", "revenue", "commission", "order_lines"], rows: rep.topCategories.map((x) => [x.label, x.qty, money(x.revenue), money(x.commission), x.orders]) }; } },
  geography: { perm: "reports.view", build: async (r) => { const rep = await buildReport(r); return { header: ["country", "orders", "gmv"], rows: rep.geography.map((g) => [g.country, g.orders, money(g.gmv)]) }; } },
  payment_methods: { perm: "reports.view", build: async (r) => { const rep = await buildReport(r); return { header: ["provider", "payments", "amount", "fees"], rows: rep.paymentMethods.map((p) => [p.provider, p.count, money(p.amount), money(p.fees)]) }; } },
  coupons: { perm: "reports.view", build: async (r) => { const rep = await buildReport(r); return { header: ["code", "uses", "discount"], rows: rep.coupons.map((c) => [c.code, c.uses, money(c.amount)]) }; } },
};

export async function GET(req: Request, ctx: RouteContext<"/api/admin/export/[report]">) {
  const { report } = await ctx.params;
  const spec = EXPORTS[report];
  if (!spec) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  try {
    const admin = await assertAdmin("reports.export");
    await assertAdmin(spec.perm);
    const url = new URL(req.url);
    const range = resolveRange(url.searchParams.get("range") ?? undefined, { from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
    const { header, rows } = await spec.build(range);
    await audit({ actor: actorOf(admin), action: "report.export", targetType: "report", targetId: report, summary: `Exported ${report}.csv (${rows.length} rows, ${range.label})` });
    return csvResponse(`${report}-${range.from.toISOString().slice(0, 10)}-${range.to.toISOString().slice(0, 10)}.csv`, toCsv(header, rows));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status ?? 403 });
    console.error("[export]", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
