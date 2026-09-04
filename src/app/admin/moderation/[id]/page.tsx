import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, Kv, StatusBadge, Tone, adminButton } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { setReportStatusAction } from "@/lib/admin/actions/moderation";
import { moderateListingAction } from "@/lib/admin/actions/products";
import { moderateReviewAction } from "@/lib/admin/actions/reviews";
import { reviewSellerAction } from "@/lib/admin/actions/sellers";
import { setUserStatusAction } from "@/lib/admin/actions/users";
import { loadReportTargets } from "@/lib/admin/moderation-targets";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Report" };
export const dynamic = "force-dynamic";

export default async function AdminReportPage({ params }: PageProps<"/admin/moderation/[id]">) {
  await requireAdmin("moderation.manage");
  const { id } = await params;
  const report = await db.report.findUnique({ where: { id }, include: { reporter: { select: { id: true, name: true, email: true } }, handledBy: { select: { name: true } } } });
  if (!report) notFound();
  const target = (await loadReportTargets([report])).get(`${report.targetType}:${report.targetId}`) ?? null;
  const [others, priorViolations] = await Promise.all([
    db.report.findMany({ where: { targetType: report.targetType, targetId: report.targetId, NOT: { id } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, reason: true, status: true, createdAt: true } }),
    target?.ownerUserId ? db.violation.findMany({ where: { userId: target.ownerUserId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, type: true, severity: true, actionTaken: true, status: true, createdAt: true } }) : Promise.resolve([]),
  ]);
  const open = report.status === "open" || report.status === "reviewing";
  const violationHref = `/admin/moderation/violations?email=${encodeURIComponent(target?.ownerEmail ?? "")}&reportId=${report.id}`;
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Moderation", href: "/admin/moderation" }, { label: `${report.targetType} report` }]} title={report.reason} lead={`Reported ${formatDateTime(report.createdAt)} by ${report.reporter?.email ?? report.reporterEmail ?? "anonymous"}${report.handledBy ? ` · handled by ${report.handledBy.name}` : ""}`} actions={<StatusBadge status={report.status} />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Card title="Report details">
            <p className="whitespace-pre-line text-sm text-ink-800">{report.details || "No further details."}</p>
            {report.resolution && <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[13px] text-ink-800"><strong>Resolution:</strong> {report.resolution}</p>}
          </Card>
          <Card title="Reported content" description={target ? `${report.targetType} · current status ${target.status}` : "The target no longer exists."}>
            {target ? (
              <>
                <Kv items={[{ label: "Item", value: <Link href={target.href} className="font-semibold text-brand-700">{target.label}</Link> }, { label: "Context", value: target.extra ?? "—" }, { label: "Owner", value: target.ownerUserId ? <Link href={`/admin/users/${target.ownerUserId}`} className="text-brand-700">{target.ownerEmail}</Link> : "—" }, { label: "Public page", value: target.publicHref ? <a href={target.publicHref} target="_blank" rel="noreferrer" className="text-brand-700 underline">open ↗</a> : "—" }]} />
                {open && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {target.type === "listing" && (
                      <>
                        <ConfirmButton label="Hide listing" message="Removes the listing from the storefront; the seller can fix and resubmit." action={moderateListingAction.bind(null, target.id, "hide")} withReason reasonLabel="Note to seller" size="sm" />
                        <ConfirmButton label="Suspend listing" message="Suspends the listing for a policy breach. Seller must contact support." action={moderateListingAction.bind(null, target.id, "suspend")} withReason reasonLabel="Reason" size="sm" variant="danger" />
                      </>
                    )}
                    {target.type === "review" && (
                      <>
                        <ConfirmButton label="Hide review" message="Hides the review; the reviewer is notified." action={moderateReviewAction.bind(null, target.id, "hidden")} withReason size="sm" />
                        <ConfirmButton label="Remove review" message="Removes the review permanently." action={moderateReviewAction.bind(null, target.id, "removed")} withReason size="sm" variant="danger" />
                      </>
                    )}
                    {target.type === "user" && (
                      <>
                        <ConfirmButton label="Suspend user" message="Suspends the account and signs it out everywhere." action={setUserStatusAction.bind(null, target.id, "suspended")} withReason size="sm" variant="danger" />
                      </>
                    )}
                    {target.type === "seller" && <ConfirmButton label="Suspend seller" message="Suspends the seller and hides all listings." action={reviewSellerAction.bind(null, target.id, "suspend")} withReason size="sm" variant="danger" />}
                    {target.ownerEmail && (
                      <Link href={violationHref} className={`${adminButton.outline} ${adminButton.sm}`}>
                        Issue violation…
                      </Link>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-600">Nothing to moderate — dismiss or resolve this report.</p>
            )}
          </Card>
        </div>
        <div className="grid gap-6 self-start">
          {open && (
            <Card title="Close the report">
              <div className="flex flex-wrap gap-2">
                {report.status === "open" && <ConfirmButton label="Mark reviewing" message="Claims this report." action={setReportStatusAction.bind(null, report.id, "reviewing")} size="sm" />}
                <ConfirmButton label="Resolve (action taken)" message="Records the action you took; the reporter is thanked." action={setReportStatusAction.bind(null, report.id, "resolved")} withReason reasonLabel="What was done" size="sm" variant="primary" />
                <ConfirmButton label="Dismiss (no breach)" message="No policy breach found." action={setReportStatusAction.bind(null, report.id, "dismissed")} withReason reasonLabel="Reason (internal)" size="sm" />
              </div>
            </Card>
          )}
          <Card title="Other reports on this target" description={others.length === 0 ? "None" : undefined}>
            <ul className="divide-y divide-ink-100 text-[13px]">
              {others.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-1.5">
                  <Link href={`/admin/moderation/${o.id}`} className="text-ink-900 hover:text-brand-700">
                    {o.reason}
                  </Link>
                  <span className="flex items-center gap-2 text-[11px] text-ink-500">
                    {formatDateTime(o.createdAt, { dateOnly: true })} <StatusBadge status={o.status} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          {target?.ownerUserId && (
            <Card title="Owner's violation history" description={priorViolations.length === 0 ? "Clean record" : undefined}>
              <ul className="divide-y divide-ink-100 text-[13px]">
                {priorViolations.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span>
                      <Tone tone={v.severity === "critical" || v.severity === "high" ? "danger" : "warning"}>{v.severity}</Tone> {v.type} → {v.actionTaken}
                    </span>
                    <span className="text-[11px] text-ink-500">
                      {formatDateTime(v.createdAt, { dateOnly: true })} · {v.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
