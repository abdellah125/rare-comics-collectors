import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pagination } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, Field, FilterBar, Table, Td, Th, Tone, adminButton, adminInput, adminSelect, DownloadLink } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { revokeOneSessionAction } from "@/lib/admin/actions/admins";
import { listParams, pageCount, parseDate } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Audit & security" };
export const dynamic = "force-dynamic";

function Tabs({ tab }: { tab: string }) {
  return (
    <div className="flex gap-1 rounded-lg border border-ink-200 bg-white p-1">
      {[
        ["audit", "Audit log"],
        ["security", "Security events"],
        ["sessions", "Admin sessions"],
      ].map(([k, l]) => (
        <Link key={k} href={`/admin/audit?tab=${k}`} className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${tab === k ? "bg-ink-950 text-white" : "text-ink-700 hover:bg-ink-100"}`}>
          {l}
        </Link>
      ))}
    </div>
  );
}

function pretty(json: string | null) {
  if (!json) return null;
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const admin = await requireAdmin("audit.view");
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && ["security", "sessions"].includes(sp.tab) ? sp.tab : "audit";
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt"] });
  const base = "/admin/audit";
  const from = p.get("from") ? parseDate(p.get("from"), new Date(0)) : null;
  const to = p.get("to") ? parseDate(p.get("to"), new Date()) : null;
  if (to) to.setUTCHours(23, 59, 59, 999);
  const dateWhere = from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

  if (tab === "sessions") {
    const sessions = await db.session.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() }, OR: [{ user: { roleId: { not: null } } }, { impersonatorId: { not: null } }] }, orderBy: { lastSeenAt: "desc" }, take: 200, include: { user: { select: { id: true, name: true, email: true, role: { select: { name: true } } } }, impersonator: { select: { name: true, email: true } } } });
    return (
      <>
        <AdminPageHeader title="Active admin sessions" lead="Every live session belonging to an admin account, plus any impersonation sessions in progress." actions={<Tabs tab={tab} />} />
        {sessions.length === 0 ? (
          <EmptyState title="No active sessions" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Account</Th>
                <Th>Device</Th>
                <Th>IP</Th>
                <Th>Started</Th>
                <Th>Last seen</Th>
                <Th>Expires</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className={s.impersonatorId ? "bg-gold-400/10" : ""}>
                  <Td>
                    <Link href={`/admin/users/${s.user.id}`} className="font-semibold text-ink-950 hover:text-brand-700">
                      {s.user.name}
                    </Link>
                    <span className="block text-[11px] text-ink-500">
                      {s.user.email} · {s.user.role?.name ?? "user"}
                      {s.id === admin.session.id && " · this session"}
                    </span>
                    {s.impersonator && <Tone tone="warning">impersonated by {s.impersonator.email}</Tone>}
                  </Td>
                  <Td className="max-w-[220px] truncate text-ink-700">{s.deviceLabel ?? s.userAgent ?? "—"}</Td>
                  <Td className="font-mono text-[12px]">{s.ip ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-ink-600">{formatDateTime(s.createdAt)}</Td>
                  <Td className="whitespace-nowrap text-ink-600">{formatDateTime(s.lastSeenAt)}</Td>
                  <Td className="whitespace-nowrap text-ink-600">{formatDateTime(s.expiresAt)}</Td>
                  <Td>{s.id !== admin.session.id && <ConfirmButton label="Revoke" message="Sign this session out immediately." action={revokeOneSessionAction.bind(null, s.id, s.user.id)} size="sm" variant="danger" />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </>
    );
  }

  if (tab === "security") {
    const type = p.get("type") || "";
    const where: Prisma.SecurityEventWhereInput = { ...(type ? { type } : {}), ...dateWhere, ...(p.q ? { OR: [{ user: { email: { contains: p.q, mode: "insensitive" as const } } }, { ip: { contains: p.q, mode: "insensitive" as const } }, { type: { contains: p.q, mode: "insensitive" as const } }] } : {}) };
    const [rows, total, types] = await Promise.all([db.securityEvent.findMany({ where, orderBy: { createdAt: p.dir }, skip: p.skip, take: p.per, include: { user: { select: { id: true, email: true } } } }), db.securityEvent.count({ where }), db.securityEvent.groupBy({ by: ["type"], _count: { _all: true }, orderBy: { type: "asc" } })]);
    return (
      <>
        <AdminPageHeader title="Security events" lead="Sign-ins, failures, lockouts, 2FA changes, password resets and impersonation." actions={<Tabs tab={tab} />} />
        <FilterBar action={base} reset>
          <input type="hidden" name="tab" value="security" />
          <Field label="Search" className="min-w-[200px] flex-1">
            <input name="q" defaultValue={p.q} placeholder="Email, IP or type" className={adminInput} />
          </Field>
          <Field label="Type">
            <select name="type" defaultValue={type} className={adminSelect}>
              <option value="">Any</option>
              {types.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.type} ({t._count._all})
                </option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <input name="from" type="date" defaultValue={p.get("from")} className={adminInput} />
          </Field>
          <Field label="To">
            <input name="to" type="date" defaultValue={p.get("to")} className={adminInput} />
          </Field>
        </FilterBar>
        {rows.length === 0 ? (
          <EmptyState title="No events" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Type</Th>
                <Th>User</Th>
                <Th>IP</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap text-ink-600">{formatDateTime(e.createdAt)}</Td>
                  <Td>
                    <Tone tone={/fail|lock|revoke|impersonat/.test(e.type) ? "danger" : /2fa|password|reset/.test(e.type) ? "warning" : "neutral"}>{e.type}</Tone>
                  </Td>
                  <Td>
                    {e.user ? (
                      <Link href={`/admin/users/${e.user.id}`} className="text-brand-700">
                        {e.user.email}
                      </Link>
                    ) : (
                      <span className="text-ink-500">—</span>
                    )}
                  </Td>
                  <Td className="font-mono text-[12px]">{e.ip ?? "—"}</Td>
                  <Td className="max-w-[360px]">
                    {e.metaJson ? (
                      <details>
                        <summary className="cursor-pointer truncate text-[12px] text-ink-600">{e.metaJson.slice(0, 80)}</summary>
                        <pre className="mt-1 whitespace-pre-wrap rounded bg-ink-50 p-2 text-[11px] text-ink-700">{pretty(e.metaJson)}</pre>
                      </details>
                    ) : (
                      <span className="truncate text-[12px] text-ink-500">{e.userAgent ?? ""}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
      </>
    );
  }

  const action = p.get("action") || "";
  const targetType = p.get("targetType") || "";
  const actor = p.get("actor") || "";
  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action: { startsWith: action } } : {}),
    ...(targetType ? { targetType } : {}),
    ...(actor ? { actorEmail: { contains: actor, mode: "insensitive" as const } } : {}),
    ...dateWhere,
    ...(p.q ? { OR: [{ summary: { contains: p.q, mode: "insensitive" as const } }, { targetId: p.q }, { actorEmail: { contains: p.q, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, total, targetTypes] = await Promise.all([db.auditLog.findMany({ where, orderBy: { createdAt: p.dir }, skip: p.skip, take: p.per, include: { actor: { select: { id: true } } } }), db.auditLog.count({ where }), db.auditLog.groupBy({ by: ["targetType"], orderBy: { targetType: "asc" } })]);
  return (
    <>
      <AdminPageHeader title="Audit log" lead="Append-only record of every privileged action: who, what, when, from where, and the before/after state." actions={<span className="flex gap-2"><Tabs tab={tab} />{admin.permissions.includes("*") || admin.permissions.includes("reports.export") ? <DownloadLink href="/api/admin/export/audit" className={adminButton.outline}>Export CSV</DownloadLink> : null}</span>} />
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[200px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Summary, target id, actor" className={adminInput} />
        </Field>
        <Field label="Actor email">
          <input name="actor" defaultValue={actor} className={adminInput} />
        </Field>
        <Field label="Action prefix">
          <input name="action" defaultValue={action} placeholder="order." className={adminInput} />
        </Field>
        <Field label="Target">
          <select name="targetType" defaultValue={targetType} className={adminSelect}>
            <option value="">Any</option>
            {targetTypes.filter((t) => t.targetType).map((t) => (
              <option key={t.targetType} value={t.targetType ?? ""}>
                {t.targetType}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input name="from" type="date" defaultValue={p.get("from")} className={adminInput} />
        </Field>
        <Field label="To">
          <input name="to" type="date" defaultValue={p.get("to")} className={adminInput} />
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No audit entries match" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Summary</Th>
              <Th>Target</Th>
              <Th>IP</Th>
              <Th>Changes</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap text-ink-600">{formatDateTime(a.createdAt)}</Td>
                <Td>
                  {a.actor ? (
                    <Link href={`/admin/users/${a.actor.id}`} className="text-brand-700">
                      {a.actorEmail}
                    </Link>
                  ) : (
                    <Tone tone="neutral">{a.actorType}</Tone>
                  )}
                </Td>
                <Td className="font-mono text-[12px]">{a.action}</Td>
                <Td className="max-w-[360px] text-ink-800">{a.summary}</Td>
                <Td className="text-[12px] text-ink-600">
                  {a.targetType}
                  {a.targetId && <span className="block truncate font-mono text-[11px] text-ink-500">{a.targetId}</span>}
                </Td>
                <Td className="font-mono text-[11px] text-ink-500">{a.ip ?? "—"}</Td>
                <Td className="max-w-[260px]">
                  {(a.beforeJson || a.afterJson) && (
                    <details>
                      <summary className="cursor-pointer text-[12px] text-ink-600">diff</summary>
                      {a.beforeJson && <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-rose-50 p-2 text-[11px] text-ink-700">{pretty(a.beforeJson)}</pre>}
                      {a.afterJson && <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-emerald-50 p-2 text-[11px] text-ink-700">{pretty(a.afterJson)}</pre>}
                    </details>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}
