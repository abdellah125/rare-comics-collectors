import "server-only";
import { db } from "@/lib/db";

export type ReportTarget = { type: string; id: string; label: string; href: string; publicHref?: string; status: string; extra?: string; ownerEmail?: string; ownerUserId?: string };

/** Resolves the entity a report points at, for listing rows and the report page. Missing targets return null (deleted). */
export async function loadReportTargets(refs: { targetType: string; targetId: string }[]): Promise<Map<string, ReportTarget | null>> {
  const out = new Map<string, ReportTarget | null>();
  const by = (t: string) => [...new Set(refs.filter((r) => r.targetType === t).map((r) => r.targetId))];
  const key = (t: string, id: string) => `${t}:${id}`;
  for (const r of refs) out.set(key(r.targetType, r.targetId), null);
  const [products, users, reviews, sellers] = await Promise.all([
    by("listing").length ? db.product.findMany({ where: { id: { in: by("listing") } }, select: { id: true, title: true, slug: true, status: true, seller: { select: { displayName: true, user: { select: { id: true, email: true } } } } } }) : [],
    by("user").length ? db.user.findMany({ where: { id: { in: by("user") } }, select: { id: true, name: true, email: true, status: true } }) : [],
    by("review").length ? db.review.findMany({ where: { id: { in: by("review") } }, select: { id: true, body: true, status: true, rating: true, user: { select: { id: true, email: true, name: true } }, product: { select: { slug: true, title: true } } } }) : [],
    by("seller").length ? db.sellerProfile.findMany({ where: { id: { in: by("seller") } }, select: { id: true, displayName: true, slug: true, status: true, user: { select: { id: true, email: true } } } }) : [],
  ]);
  for (const p of products) out.set(key("listing", p.id), { type: "listing", id: p.id, label: p.title, href: `/admin/products/${p.id}`, publicHref: `/store/${p.slug}`, status: p.status, extra: p.seller ? `sold by ${p.seller.displayName}` : "marketplace listing", ownerEmail: p.seller?.user.email, ownerUserId: p.seller?.user.id });
  for (const u of users) out.set(key("user", u.id), { type: "user", id: u.id, label: u.name, href: `/admin/users/${u.id}`, status: u.status, extra: u.email, ownerEmail: u.email, ownerUserId: u.id });
  for (const r of reviews) out.set(key("review", r.id), { type: "review", id: r.id, label: `${r.rating}★ “${r.body.slice(0, 90)}${r.body.length > 90 ? "…" : ""}”`, href: `/admin/reviews?q=${encodeURIComponent(r.body.slice(0, 40))}`, publicHref: r.product ? `/store/${r.product.slug}#reviews` : undefined, status: r.status, extra: `by ${r.user.name}${r.product ? ` on ${r.product.title}` : ""}`, ownerEmail: r.user.email, ownerUserId: r.user.id });
  for (const s of sellers) out.set(key("seller", s.id), { type: "seller", id: s.id, label: s.displayName, href: `/admin/sellers/${s.id}`, publicHref: `/sellers/${s.slug}`, status: s.status, extra: s.user.email, ownerEmail: s.user.email, ownerUserId: s.user.id });
  return out;
}
