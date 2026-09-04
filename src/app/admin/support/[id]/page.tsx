import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { ImpersonateButton } from "@/components/admin/impersonate-button";
import { AdminPageHeader, Card, Field, Kv, StatusBadge, Tone, adminInput, adminSelect, adminTextarea } from "@/components/admin/ui";
import { requireAdmin, can } from "@/lib/auth/session";
import { agentReplyAction, updateTicketAction } from "@/lib/admin/actions/support";
import { db } from "@/lib/db";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Ticket" };
export const dynamic = "force-dynamic";

export default async function AdminTicketPage({ params }: PageProps<"/admin/support/[id]">) {
  const admin = await requireAdmin("support.view");
  const { id } = await params;
  const t = await db.ticket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, status: true, createdAt: true, _count: { select: { orders: true, tickets: true } } } },
      order: { select: { id: true, number: true, status: true, paymentStatus: true, total: true } },
      seller: { select: { id: true, displayName: true } },
      assignedTo: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
    },
  });
  if (!t) notFound();
  const manage = can(admin, "support.manage");
  const [agents, related, recentOrders] = await Promise.all([
    db.user.findMany({ where: { roleId: { not: null }, status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.ticket.findMany({ where: { email: t.email, NOT: { id: t.id } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, number: true, subject: true, status: true } }),
    t.userId ? db.order.findMany({ where: { userId: t.userId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, number: true, status: true, total: true, createdAt: true } }) : Promise.resolve([]),
  ]);
  const tags = JSON.parse(t.tagsJson) as string[];
  return (
    <>
      <AdminPageHeader
        crumbs={[{ label: "Support", href: "/admin/support" }, { label: t.number }]}
        title={t.subject}
        lead={`${t.number} · opened ${formatDateTime(t.createdAt)} via ${t.source} · ${t.messages.length} messages${t.firstResponseAt ? ` · first reply ${formatDateTime(t.firstResponseAt)}` : " · no reply yet"}`}
        actions={
          <span className="flex items-center gap-1">
            {t.isEscalated && <Tone tone="danger">escalated</Tone>}
            <Tone tone={t.priority === "urgent" ? "danger" : t.priority === "high" ? "warning" : "neutral"}>{t.priority}</Tone>
            <StatusBadge status={t.status} />
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Card title="Conversation">
            <ol className="grid gap-3">
              {t.messages.map((m) => (
                <li key={m.id} className={`rounded-lg px-4 py-3 text-sm ${m.isInternal ? "bg-amber-50 ring-1 ring-amber-200" : m.authorType === "agent" ? "bg-brand-50" : m.authorType === "system" ? "bg-ink-100" : "bg-ink-50"}`}>
                  <p className="flex flex-wrap justify-between gap-2 text-[12px] text-ink-500">
                    <span>
                      <span className="font-semibold text-ink-800">{m.author?.name ?? (m.authorType === "customer" ? (t.name ?? t.email) : m.authorType)}</span> · {m.authorType}
                      {m.isInternal && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">Internal</span>}
                    </span>
                    <span>{formatDateTime(m.createdAt)}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-line text-ink-800">{m.body}</p>
                  {(JSON.parse(m.attachmentsJson) as string[]).length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {(JSON.parse(m.attachmentsJson) as string[]).map((a) => (
                        <li key={a}>
                          <a href={`/api/media/${a}`} target="_blank" rel="noreferrer" className="text-[12px] font-medium text-brand-700 underline">
                            Attachment
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </Card>
          {manage && (
            <Card title="Reply" description="Replies are emailed to the customer and appear in their account. Internal notes stay private.">
              <ActionForm action={agentReplyAction} hidden={{ ticketId: t.id }} submitLabel="Send" resetOnSuccess>
                <textarea name="body" rows={6} required className={adminTextarea} placeholder="Hi …" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-[13px] text-ink-700">
                    Attachments
                    <input type="file" name="attachments" multiple accept="image/*,application/pdf" className="mt-1 block text-[12px]" />
                  </label>
                  <Field label="Then set status">
                    <select name="nextStatus" defaultValue="pending" className={adminSelect}>
                      <option value="">Keep current</option>
                      {TICKET_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink-800">
                    <input type="checkbox" name="internal" className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Internal note
                  </label>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
        <div className="grid gap-6 self-start">
          <Card title="Customer">
            <Kv items={[{ label: "Name", value: t.user ? <Link href={`/admin/users/${t.user.id}`} className="text-brand-700">{t.user.name}</Link> : (t.name ?? "Guest") }, { label: "Email", value: t.email }, ...(t.user ? [{ label: "Account", value: `${statusLabel(t.user.status)} · since ${formatDateTime(t.user.createdAt, { dateOnly: true })} · ${t.user._count.orders} orders · ${t.user._count.tickets} tickets` }] : []), ...(t.order ? [{ label: "Order", value: <Link href={`/admin/orders/${t.order.id}`} className="font-mono text-brand-700">{t.order.number}</Link> }, { label: "Order state", value: `${statusLabel(t.order.status)} · ${statusLabel(t.order.paymentStatus)} · ${formatMoney(t.order.total)}` }] : []), ...(t.seller ? [{ label: "Seller", value: <Link href={`/admin/sellers/${t.seller.id}`} className="text-brand-700">{t.seller.displayName}</Link> }] : [])]} />
            {t.user && can(admin, "users.impersonate") && t.user.status === "active" && (
              <div className="mt-3">
                <ImpersonateButton userId={t.user.id} userName={t.user.name} />
              </div>
            )}
          </Card>
          {manage && (
            <Card title="Triage">
              <ActionForm action={updateTicketAction} hidden={{ ticketId: t.id }} submitLabel="Update" variant="outline">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Status">
                    <select name="status" defaultValue={t.status} className={adminSelect}>
                      {TICKET_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Priority">
                    <select name="priority" defaultValue={t.priority} className={adminSelect}>
                      {TICKET_PRIORITIES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Category">
                    <select name="category" defaultValue={t.category} className={adminSelect}>
                      {TICKET_CATEGORIES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Assignee">
                    <select name="assignedToId" defaultValue={t.assignedToId ?? ""} className={adminSelect}>
                      <option value="">Unassigned</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.id === admin.id ? " (me)" : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Tags (comma separated)">
                  <input name="tags" defaultValue={tags.join(", ")} className={adminInput} />
                </Field>
                <label className="flex items-center gap-2 text-[13px] text-ink-800">
                  <input type="checkbox" name="isEscalated" defaultChecked={t.isEscalated} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Escalated
                </label>
              </ActionForm>
            </Card>
          )}
          {recentOrders.length > 0 && (
            <Card title="Recent orders">
              <ul className="divide-y divide-ink-100 text-[13px]">
                {recentOrders.map((o) => (
                  <li key={o.id} className="flex justify-between gap-2 py-1.5">
                    <Link href={`/admin/orders/${o.id}`} className="font-mono text-brand-700">
                      {o.number}
                    </Link>
                    <span className="text-ink-600">
                      {statusLabel(o.status)} · {formatMoney(o.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {related.length > 0 && (
            <Card title="Other tickets from this email">
              <ul className="divide-y divide-ink-100 text-[13px]">
                {related.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2 py-1.5">
                    <Link href={`/admin/support/${r.id}`} className="line-clamp-1 text-ink-900 hover:text-brand-700">
                      {r.subject}
                    </Link>
                    <StatusBadge status={r.status} />
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
