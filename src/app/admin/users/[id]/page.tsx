import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { ImpersonateButton } from "@/components/admin/impersonate-button";
import { RoleSelect } from "@/components/admin/role-select";
import { AdminPageHeader, Card, EmptyState, Field, Kv, StatusBadge, Tone, adminInput, adminSelect, adminTextarea } from "@/components/admin/ui";
import { requireAdmin, can } from "@/lib/auth/session";
import { addUserNoteAction, anonymizeUserAction, disableUserTwoFactorAction, revokeUserSessionsAction, sendPasswordResetAction, setUserRestrictionsAction, setUserStatusAction, updateUserAction } from "@/lib/admin/actions/users";
import { db } from "@/lib/db";
import { USER_RESTRICTIONS, statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { parseJsonArray, isString } from "@/lib/json";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "User" };
export const dynamic = "force-dynamic";

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const admin = await requireAdmin("users.view");
  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    include: {
      role: true,
      sellerProfile: { select: { id: true, displayName: true, status: true, verificationStatus: true } },
      addresses: true,
      sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, take: 10 },
      orders: { orderBy: { placedAt: "desc" }, take: 10, select: { id: true, number: true, status: true, total: true, placedAt: true } },
      tickets: { orderBy: { lastMessageAt: "desc" }, take: 5, select: { id: true, number: true, subject: true, status: true } },
      reviews: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, rating: true, status: true, body: true } },
      securityEvents: { orderBy: { createdAt: "desc" }, take: 15 },
      violations: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, type: true, severity: true, status: true, createdAt: true } },
      _count: { select: { orders: true, disputesOpened: true, returnRequests: true } },
    },
  });
  if (!user) notFound();
  const [spend, roles, countries, lastAudit] = await Promise.all([
    db.order.aggregate({ _sum: { total: true }, where: { userId: id, paymentStatus: { in: ["paid", "partially_refunded"] } } }),
    can(admin, "admins.manage") ? db.role.findMany({ orderBy: { name: "asc" } }) : [],
    db.country.findMany({ where: { isEnabled: true }, orderBy: { name: "asc" }, select: { code: true, name: true } }),
    db.auditLog.findMany({ where: { OR: [{ targetType: "user", targetId: id }, { actorId: id }] }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const restrictions = parseJsonArray(user.restrictionsJson, isString);
  const manage = can(admin, "users.manage");
  const isSelf = user.id === admin.id;
  const timezones = Intl.supportedValuesOf("timeZone");

  return (
    <>
      <AdminPageHeader
        crumbs={[{ label: "Users", href: "/admin/users" }, { label: user.name }]}
        title={user.name}
        lead={
          <>
            {user.email} · joined {formatDateTime(user.createdAt, { dateOnly: true })} · {user._count.orders} orders · lifetime spend {formatMoney(spend._sum.total ?? 0)}
          </>
        }
        actions={
          <>
            <StatusBadge status={user.deletedAt ? "deleted" : user.status} />
            {user.role && <Tone tone="dark">{user.role.name}</Tone>}
            {user.sellerProfile && (
              <Link href={`/admin/sellers/${user.sellerProfile.id}`} className="text-[13px] font-semibold text-brand-700 underline-offset-2 hover:underline">
                Seller: {user.sellerProfile.displayName} ({user.sellerProfile.status})
              </Link>
            )}
            {can(admin, "users.impersonate") && !user.role && !user.deletedAt && user.status !== "banned" && <ImpersonateButton userId={user.id} userName={user.name} />}
          </>
        }
      />

      {user.statusReason && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900 ring-1 ring-amber-200">Status reason: {user.statusReason}</p>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid gap-6 xl:col-span-2">
          <Card title="Profile" description="Changes are audited.">
            {manage && !user.deletedAt ? (
              <ActionForm action={updateUserAction} hidden={{ id: user.id }} submitLabel="Save profile">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name">
                    <input name="name" defaultValue={user.name} required className={adminInput} />
                  </Field>
                  <Field label="Email">
                    <input name="email" type="email" defaultValue={user.email} required className={adminInput} />
                  </Field>
                  <Field label="Phone">
                    <input name="phone" defaultValue={user.phone ?? ""} className={adminInput} />
                  </Field>
                  <Field label="Country">
                    <select name="countryCode" defaultValue={user.countryCode ?? ""} className={adminSelect}>
                      <option value="">—</option>
                      {countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Timezone">
                    <select name="timezone" defaultValue={user.timezone} className={adminSelect}>
                      {timezones.map((tz) => (
                        <option key={tz}>{tz}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Display currency">
                    <input name="currency" defaultValue={user.currency} maxLength={3} className={adminInput} />
                  </Field>
                  <label className="flex items-center gap-2 text-[13px] text-ink-800 sm:col-span-2">
                    <input type="checkbox" name="emailVerified" defaultChecked={Boolean(user.emailVerifiedAt)} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Email verified
                  </label>
                  <Field label="Internal notes (never shown to the user)" className="sm:col-span-2">
                    <textarea name="adminNotes" rows={4} defaultValue={user.adminNotes ?? ""} className={adminTextarea} />
                  </Field>
                </div>
              </ActionForm>
            ) : (
              <Kv items={[{ label: "Email", value: user.email }, { label: "Phone", value: user.phone ?? "—" }, { label: "Country", value: user.countryCode ?? "—" }, { label: "Timezone", value: user.timezone }, { label: "Notes", value: user.adminNotes ?? "—" }]} />
            )}
          </Card>

          <Card title="Recent orders" actions={<Link href={`/admin/orders?q=${encodeURIComponent(user.email)}`} className="text-[13px] font-semibold text-brand-700">All orders →</Link>}>
            {user.orders.length === 0 ? (
              <EmptyState title="No orders" />
            ) : (
              <ul className="divide-y divide-ink-100 text-[13px]">
                {user.orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold text-ink-950 hover:text-brand-700">
                      {o.number}
                    </Link>
                    <span className="text-ink-500">{formatDateTime(o.placedAt, { dateOnly: true })}</span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={o.status} />
                      <span className="tabular-nums">{formatMoney(o.total)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title="Support tickets">
              {user.tickets.length === 0 ? (
                <p className="text-[13px] text-ink-500">None</p>
              ) : (
                <ul className="divide-y divide-ink-100 text-[13px]">
                  {user.tickets.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                      <Link href={`/admin/support/${t.id}`} className="truncate font-medium text-ink-900 hover:text-brand-700">
                        <span className="font-mono text-ink-500">{t.number}</span> {t.subject}
                      </Link>
                      <StatusBadge status={t.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Reviews & trust">
              <p className="text-[13px] text-ink-700">
                {user.reviews.length} recent review{user.reviews.length === 1 ? "" : "s"} · {user._count.disputesOpened} disputes opened · {user._count.returnRequests} returns · risk score {user.riskScore}
              </p>
              {user.violations.length > 0 && (
                <ul className="mt-2 grid gap-1 text-[13px]">
                  {user.violations.map((v) => (
                    <li key={v.id} className="flex justify-between">
                      <span>
                        {statusLabel(v.type)} · {v.severity}
                      </span>
                      <StatusBadge status={v.status} />
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/admin/moderation/violations?user=${user.id}`} className="mt-2 inline-block text-[13px] font-semibold text-brand-700">
                Violations & appeals →
              </Link>
            </Card>
          </div>

          <Card title="Addresses">
            {user.addresses.length === 0 ? (
              <p className="text-[13px] text-ink-500">No saved addresses</p>
            ) : (
              <ul className="grid gap-2 text-[13px] sm:grid-cols-2">
                {user.addresses.map((a) => (
                  <li key={a.id} className="rounded-lg border border-ink-200 p-3 text-ink-800">
                    {[a.label, `${a.firstName} ${a.lastName}`, a.line1, a.line2, [a.city, a.region, a.postalCode].filter(Boolean).join(", "), a.countryCode].filter(Boolean).join(" · ")}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Activity log" description="Audit entries about or by this user.">
            <ul className="divide-y divide-ink-100 text-[13px]">
              {lastAudit.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="text-ink-800">{a.summary}</span>
                  <span className="text-ink-500">
                    {a.actorEmail ?? a.actorType} · {formatDateTime(a.createdAt)}
                  </span>
                </li>
              ))}
              {lastAudit.length === 0 && <li className="py-2 text-ink-500">Nothing yet.</li>}
            </ul>
          </Card>
        </div>

        <div className="grid gap-6">
          {manage && !user.deletedAt && (
            <Card title="Account controls">
              <div className="flex flex-wrap gap-2">
                {user.status !== "active" && !isSelf && <ConfirmButton label="Reactivate" message="Restore full access to this account?" action={setUserStatusAction.bind(null, user.id, "active")} variant="primary" />}
                {user.status !== "suspended" && !isSelf && <ConfirmButton label="Suspend" message="Suspend the account and sign the user out everywhere. They will be emailed." action={setUserStatusAction.bind(null, user.id, "suspended")} withReason variant="danger" />}
                {user.status !== "banned" && !isSelf && <ConfirmButton label="Ban" message="Permanently close this account. The user cannot sign in or register with this email again." action={setUserStatusAction.bind(null, user.id, "banned")} withReason variant="danger" confirmLabel="Ban account" />}
              </div>
              <div className="mt-4 border-t border-ink-100 pt-4">
                <ActionForm action={setUserRestrictionsAction} hidden={{ id: user.id }} submitLabel="Save restrictions" variant="outline">
                  <p className="text-[13px] font-medium text-ink-800">Restrictions</p>
                  {USER_RESTRICTIONS.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-[13px] text-ink-700">
                      <input type="checkbox" name="restrictions" value={r} defaultChecked={restrictions.includes(r)} className="h-4 w-4 rounded border-ink-300 accent-brand-600" />
                      {statusLabel(r)}
                    </label>
                  ))}
                </ActionForm>
              </div>
            </Card>
          )}

          <Card title="Security">
            <Kv items={[{ label: "2FA", value: user.twoFactorEnabled ? <Tone tone="success">Enabled</Tone> : <Tone tone="neutral">Off</Tone> }, { label: "Last login", value: user.lastLoginAt ? `${formatDateTime(user.lastLoginAt)} from ${user.lastLoginIp ?? "?"}` : "Never" }, { label: "Failed logins", value: user.failedLoginCount }, { label: "Locked until", value: user.lockedUntil ? formatDateTime(user.lockedUntil) : "—" }]} />
            <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">Active sessions ({user.sessions.length})</p>
            <ul className="mt-1 grid gap-1 text-[12px] text-ink-700">
              {user.sessions.map((s) => (
                <li key={s.id}>
                  {s.deviceLabel ?? "Unknown"} · {s.ip ?? "?"} · last seen {formatDateTime(s.lastSeenAt)}
                  {s.impersonatorId && <Tone tone="warning">support session</Tone>}
                </li>
              ))}
              {user.sessions.length === 0 && <li className="text-ink-500">None</li>}
            </ul>
            {manage && !user.deletedAt && (
              <div className="mt-3 flex flex-wrap gap-2">
                <ConfirmButton label="Sign out everywhere" message="Revoke every active session for this user?" action={revokeUserSessionsAction.bind(null, user.id)} size="sm" />
                <ConfirmButton label="Send password reset" message="Email a password reset link to this user?" action={sendPasswordResetAction.bind(null, user.id)} size="sm" />
                {user.twoFactorEnabled && <ConfirmButton label="Reset 2FA" message="Disable two-factor authentication for this user (for example after they lost their phone). They'll be signed out and must enrol again." action={disableUserTwoFactorAction.bind(null, user.id)} withReason size="sm" variant="danger" />}
              </div>
            )}
            <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">Recent security events</p>
            <ul className="mt-1 grid gap-1 text-[12px] text-ink-700">
              {user.securityEvents.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span>{e.type.replace(/_/g, " ")}</span>
                  <span className="text-ink-500">
                    {e.ip ?? ""} · {formatDateTime(e.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {can(admin, "admins.manage") && !user.deletedAt && (
            <Card title="Admin role" description={isSelf ? "You can't change your own role." : "Assigning a role grants /admin access (2FA required)."}>
              <RoleSelect userId={user.id} currentRoleId={user.roleId} roles={roles.map((r) => ({ id: r.id, name: r.name }))} disabled={isSelf} />
            </Card>
          )}

          {manage && !user.deletedAt && (
            <Card title="Add note">
              <ActionForm action={addUserNoteAction} hidden={{ id: user.id }} submitLabel="Add note" variant="outline" resetOnSuccess>
                <textarea name="note" rows={3} required className={adminTextarea} placeholder="Internal note — visible to admins only" />
              </ActionForm>
            </Card>
          )}

          {manage && !user.deletedAt && !user.role && (
            <Card title="Danger zone">
              <p className="text-[13px] text-ink-600">Anonymise personal data (GDPR erasure). Orders and financial records are kept without identifying details.</p>
              <div className="mt-3">
                <ConfirmButton label="Delete & anonymise" message="This cannot be undone. Personal data is erased and the account is closed." action={anonymizeUserAction.bind(null, user.id)} withReason variant="danger" confirmLabel="Delete account" />
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
