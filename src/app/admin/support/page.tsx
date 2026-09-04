import type { Metadata } from "next";
import Link from "next/link";
import { BulkActionsBar, BulkProvider, RowCheckbox, SelectAllCheckbox } from "@/components/admin/bulk";
import { Pagination, SortLink } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, FilterBar, Field, StatusBadge, Table, Td, Th, Tone, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin, can } from "@/lib/auth/session";
import { bulkTicketsAction } from "@/lib/admin/actions/support";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Support" };
export const dynamic = "force-dynamic";

export default async function AdminSupportPage({ searchParams }: PageProps<"/admin/support">) {
  const admin = await requireAdmin("support.view");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "lastMessageAt", sorts: ["lastMessageAt", "createdAt", "priority", "status"] });
  const status = sp.status === undefined ? "open" : p.get("status") || "";
  const priority = p.get("priority") || "";
  const category = p.get("category") || "";
  const assignee = p.get("assignee") || "";
  const where: Prisma.TicketWhereInput = {
    ...(status === "open" ? { status: { in: ["open", "pending", "on_hold"] } } : status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(category ? { category } : {}),
    ...(assignee === "me" ? { assignedToId: admin.id } : assignee === "none" ? { assignedToId: null } : assignee ? { assignedToId: assignee } : {}),
    ...(p.q ? { OR: [{ number: { contains: p.q.toUpperCase(), mode: "insensitive" as const } }, { subject: { contains: p.q, mode: "insensitive" as const } }, { email: { contains: p.q, mode: "insensitive" as const } }, { name: { contains: p.q, mode: "insensitive" as const } }, { order: { number: { contains: p.q.toUpperCase(), mode: "insensitive" as const } } }] } : {}),
  };
  const [rows, total, agents, unassigned, urgent] = await Promise.all([
    db.ticket.findMany({ where, orderBy: [{ isEscalated: "desc" }, { [p.sort]: p.dir }], skip: p.skip, take: p.per, include: { user: { select: { id: true, name: true } }, order: { select: { id: true, number: true } }, assignedTo: { select: { name: true } }, _count: { select: { messages: true } } } }),
    db.ticket.count({ where }),
    db.user.findMany({ where: { roleId: { not: null }, status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.ticket.count({ where: { status: { in: ["open", "pending", "on_hold"] }, assignedToId: null } }),
    db.ticket.count({ where: { status: { in: ["open", "pending", "on_hold"] }, priority: "urgent" } }),
  ]);
  const base = "/admin/support";
  return (
    <>
      <AdminPageHeader title="Support tickets" lead={`${unassigned} unassigned · ${urgent} urgent. Tickets come from the contact form, order pages and seller dashboards.`} />
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[200px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Ticket #, subject, email, order #" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            <option value="open">Open (all active)</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select name="priority" defaultValue={priority} className={adminSelect}>
            <option value="">Any</option>
            {TICKET_PRIORITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select name="category" defaultValue={category} className={adminSelect}>
            <option value="">Any</option>
            {TICKET_CATEGORIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assignee">
          <select name="assignee" defaultValue={assignee} className={adminSelect}>
            <option value="">Anyone</option>
            <option value="me">Me</option>
            <option value="none">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="Inbox zero" body="No tickets match these filters." />
      ) : (
        <BulkProvider>
          {can(admin, "support.manage") && <BulkActionsBar run={bulkTicketsAction} actions={[{ id: "assign_me", label: "Assign to me" }, { id: "unassign", label: "Unassign" }, { id: "priority_high", label: "Priority: high" }, { id: "escalate", label: "Escalate" }, { id: "resolve", label: "Resolve" }, { id: "close", label: "Close", danger: true, confirm: "Close {n} tickets?" }]} />}
          <Table>
            <thead>
              <tr>
                <Th className="w-8">
                  <SelectAllCheckbox ids={rows.map((r) => r.id)} />
                </Th>
                <Th>Ticket</Th>
                <Th>Customer</Th>
                <Th>Category</Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="priority" label="Priority" current={p.sort} dir={p.dir} />
                </Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="status" label="Status" current={p.sort} dir={p.dir} />
                </Th>
                <Th>Assignee</Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="lastMessageAt" label="Last activity" current={p.sort} dir={p.dir} />
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className={t.isEscalated ? "bg-rose-50/40" : ""}>
                  <Td>
                    <RowCheckbox id={t.id} label={t.number} />
                  </Td>
                  <Td className="max-w-[340px]">
                    <Link href={`/admin/support/${t.id}`} className="line-clamp-1 font-semibold text-ink-950 hover:text-brand-700">
                      {t.subject}
                    </Link>
                    <span className="flex flex-wrap items-center gap-1 text-[11px] text-ink-500">
                      <span className="font-mono">{t.number}</span> · {t._count.messages} msg
                      {t.order && (
                        <Link href={`/admin/orders/${t.order.id}`} className="font-mono text-brand-700">
                          · {t.order.number}
                        </Link>
                      )}
                      {t.isEscalated && <Tone tone="danger">escalated</Tone>}
                      {!t.firstResponseAt && t.status !== "closed" && <Tone tone="warning">awaiting first reply</Tone>}
                    </span>
                  </Td>
                  <Td>
                    {t.user ? (
                      <Link href={`/admin/users/${t.user.id}`} className="text-ink-950 hover:text-brand-700">
                        {t.user.name}
                      </Link>
                    ) : (
                      <span>{t.name ?? "Guest"}</span>
                    )}
                    <span className="block text-[11px] text-ink-500">{t.email}</span>
                  </Td>
                  <Td className="text-ink-700">{t.category}</Td>
                  <Td>{t.priority === "urgent" ? <Tone tone="danger">urgent</Tone> : t.priority === "high" ? <Tone tone="warning">high</Tone> : <span className="text-ink-600">{t.priority}</span>}</Td>
                  <Td>
                    <StatusBadge status={t.status} />
                  </Td>
                  <Td className="text-ink-700">{t.assignedTo?.name ?? <span className="text-ink-400">—</span>}</Td>
                  <Td className="whitespace-nowrap text-ink-600">{formatDateTime(t.lastMessageAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </BulkProvider>
      )}
      <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}
