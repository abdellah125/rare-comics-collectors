import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportForm } from "@/components/report-form";
import { Container } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { REPORT_TYPES } from "@/lib/domain";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Report a problem", description: "Report a listing, seller or review to the moderation team.", path: "/report", noIndex: true });

export default async function ReportPage({ searchParams }: PageProps<"/report">) {
  const sp = await searchParams;
  const type = typeof sp.type === "string" && (REPORT_TYPES as readonly string[]).includes(sp.type) ? (sp.type as (typeof REPORT_TYPES)[number]) : null;
  const id = typeof sp.id === "string" ? sp.id : null;
  if (!type || !id) notFound();
  let label = "";
  if (type === "listing") {
    const p = await db.product.findUnique({ where: { id }, select: { title: true, issue: true } });
    if (!p) notFound();
    label = `${p.title} ${p.issue}`;
  } else if (type === "seller") {
    const s = await db.sellerProfile.findUnique({ where: { id }, select: { displayName: true } });
    if (!s) notFound();
    label = s.displayName;
  } else if (type === "review") {
    const r = await db.review.findUnique({ where: { id }, select: { title: true, body: true } });
    if (!r) notFound();
    label = r.title ?? r.body.slice(0, 60);
  } else {
    const u = await db.user.findUnique({ where: { id }, select: { name: true } });
    if (!u) notFound();
    label = u.name;
  }
  const user = await getCurrentUser();
  return (
    <Container className="py-12 lg:py-16">
      <div className="mx-auto max-w-xl">
        <h1 className="font-display text-3xl font-semibold text-ink-950">Report {type}</h1>
        <p className="mt-2 text-[15px] text-ink-600">
          You&apos;re reporting <strong className="text-ink-900">{label}</strong>. Reports go straight to our moderation team and are never shown to the other party.
        </p>
        <div className="mt-8 rounded-xl border border-ink-200 bg-white p-6">
          <ReportForm targetType={type} targetId={id} signedIn={Boolean(user)} />
        </div>
      </div>
    </Container>
  );
}
