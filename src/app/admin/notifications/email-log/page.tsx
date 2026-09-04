import type { Metadata } from "next";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pagination } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, Field, FilterBar, StatusBadge, Table, Td, Th, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { retryEmailAction } from "@/lib/admin/actions/comms";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Email log" };
export const dynamic = "force-dynamic";

export default async function AdminEmailLogPage({ searchParams }: PageProps<"/admin/notifications/email-log">) {
  await requireAdmin("notifications.manage");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt"] });
  const status = p.get("status") || "";
  const template = p.get("template") || "";
  const where: Prisma.EmailLogWhereInput = { ...(status ? { status } : {}), ...(template ? { templateKey: template } : {}), ...(p.q ? { OR: [{ toEmail: { contains: p.q } }, { subject: { contains: p.q } }] } : {}) };
  const [rows, total, templates] = await Promise.all([db.emailLog.findMany({ where, orderBy: { createdAt: p.dir }, skip: p.skip, take: p.per }), db.emailLog.count({ where }), db.emailTemplate.findMany({ select: { key: true, name: true }, orderBy: { name: "asc" } })]);
  const base = "/admin/notifications/email-log";
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Notifications", href: "/admin/notifications" }, { label: "Email log" }]} title="Email log" lead="Every email the platform produced. Bodies are shown for support; never forward secrets from here." />
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[200px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Recipient or subject" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            {["queued", "sent", "logged", "failed"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Template">
          <select name="template" defaultValue={template} className={adminSelect}>
            <option value="">Any</option>
            {templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No emails match" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>To</Th>
              <Th>Subject</Th>
              <Th>Template</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap text-ink-600">
                  {formatDateTime(e.createdAt)}
                  {e.sentAt && <span className="block text-[11px] text-ink-500">sent {formatDateTime(e.sentAt)}</span>}
                </Td>
                <Td className="text-ink-800">{e.toEmail}</Td>
                <Td className="max-w-[360px]">
                  <details>
                    <summary className="cursor-pointer text-ink-900">{e.subject}</summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-ink-50 p-2 text-[11px] text-ink-700">{e.bodyText}</pre>
                  </details>
                </Td>
                <Td className="font-mono text-[11px] text-ink-500">{e.templateKey ?? "—"}</Td>
                <Td>
                  <StatusBadge status={e.status} />
                  {e.error && <span className="block max-w-[200px] truncate text-[11px] text-rose-700">{e.error}</span>}
                  <span className="block text-[11px] text-ink-500">{e.provider}</span>
                </Td>
                <Td>{(e.status === "failed" || e.status === "logged") && <ConfirmButton label="Resend" message={`Re-send this email to ${e.toEmail}?`} action={retryEmailAction.bind(null, e.id)} size="sm" />}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}
