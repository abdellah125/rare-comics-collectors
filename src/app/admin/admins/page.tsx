import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, Field, StatusBadge, Table, Td, Th, Tone, adminButton, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { deleteRoleAction, inviteAdminAction, revokeAdminSessionsAction, saveRoleAction, setAdminRoleAction } from "@/lib/admin/actions/admins";
import { disableUserTwoFactorAction } from "@/lib/admin/actions/users";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { PERMISSIONS, PERMISSION_GROUPS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Admins & roles" };
export const dynamic = "force-dynamic";

export default async function AdminAdminsPage({ searchParams }: PageProps<"/admin/admins">) {
  const admin = await requireAdmin("admins.manage");
  const sp = await searchParams;
  const [admins, roles, settings] = await Promise.all([
    db.user.findMany({ where: { roleId: { not: null }, deletedAt: null }, orderBy: [{ role: { name: "asc" } }, { name: "asc" }], include: { role: { select: { id: true, name: true, permissionsJson: true } }, _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } } } }),
    db.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }], include: { _count: { select: { users: true } } } }),
    getSettings(),
  ]);
  const superAdmin = admin.permissions.includes("*");
  const editRole = typeof sp.role === "string" ? roles.find((r) => r.id === sp.role) : undefined;
  const editPerms = editRole ? (JSON.parse(editRole.permissionsJson) as string[]) : [];
  return (
    <>
      <AdminPageHeader title="Admins & roles" lead={`${admins.length} admin account${admins.length === 1 ? "" : "s"}. ${settings["security.adminRequire2fa"] ? "Two-factor is required for the admin panel." : "Two-factor is NOT enforced — enable it in Settings › Security."}`} actions={<Link href="/admin/audit?tab=sessions" className={adminButton.outline}>Active sessions</Link>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid gap-6 xl:col-span-2">
          <Table>
            <thead>
              <tr>
                <Th>Admin</Th>
                <Th>Role</Th>
                <Th>2FA</Th>
                <Th>Last sign-in</Th>
                <Th align="right">Sessions</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {admins.map((u) => {
                const perms = u.role ? (JSON.parse(u.role.permissionsJson) as string[]) : [];
                const targetElevated = perms.includes("*") || perms.includes("admins.manage");
                const canEdit = u.id !== admin.id && (superAdmin || !targetElevated);
                return (
                  <tr key={u.id}>
                    <Td>
                      <Link href={`/admin/users/${u.id}`} className="font-semibold text-ink-950 hover:text-brand-700">
                        {u.name}
                      </Link>
                      <span className="block text-[11px] text-ink-500">
                        {u.email} · <StatusBadge status={u.status} />
                      </span>
                    </Td>
                    <Td>
                      {canEdit ? (
                        <form action={async (fd: FormData) => { "use server"; await setAdminRoleAction(u.id, String(fd.get("roleId") || "") || null); }} className="flex items-center gap-1">
                          <select name="roleId" defaultValue={u.role?.id ?? ""} className={`${adminSelect} h-8 w-auto text-[12px]`}>
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                            <option value="">— revoke access —</option>
                          </select>
                          <button type="submit" className={`${adminButton.outline} ${adminButton.sm}`}>
                            Apply
                          </button>
                        </form>
                      ) : (
                        <span>
                          <Tone tone={perms.includes("*") ? "dark" : "brand"}>{u.role?.name}</Tone> {u.id === admin.id && <span className="text-[11px] text-ink-500">(you)</span>}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {u.twoFactorEnabled ? <Tone tone="success">enabled</Tone> : <Tone tone="danger">missing</Tone>}
                      {u.twoFactorEnabled && canEdit && <ConfirmButton label="reset" message="Disables 2FA so they can re-enrol. Only do this after verifying identity out of band." action={disableUserTwoFactorAction.bind(null, u.id)} withReason variant="quiet" size="sm" />}
                    </Td>
                    <Td className="text-ink-600">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "never"}
                      {u.lastLoginIp && <span className="block font-mono text-[11px] text-ink-500">{u.lastLoginIp}</span>}
                    </Td>
                    <Td align="right">{u._count.sessions}</Td>
                    <Td>{u._count.sessions > 0 && <ConfirmButton label="Sign out everywhere" message={`Revoke all of ${u.name}'s sessions?`} action={revokeAdminSessionsAction.bind(null, u.id)} size="sm" />}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Card title="Roles" description="Permissions are enforced server-side on every action and page. Wildcard (*) grants everything.">
            <Table>
              <thead>
                <tr>
                  <Th>Role</Th>
                  <Th>Permissions</Th>
                  <Th align="right">Members</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => {
                  const perms = JSON.parse(r.permissionsJson) as string[];
                  return (
                    <tr key={r.id}>
                      <Td>
                        <span className="font-semibold text-ink-950">{r.name}</span> {r.isSystem && <Tone tone="neutral">built-in</Tone>}
                        <span className="block text-[11px] text-ink-500">{r.description}</span>
                      </Td>
                      <Td className="max-w-[360px] text-[11px] text-ink-600">{perms.includes("*") ? "All permissions" : perms.join(", ")}</Td>
                      <Td align="right">{r._count.users}</Td>
                      <Td>
                        <span className="flex gap-1">
                          <Link href={`/admin/admins?role=${r.id}`} className={`${adminButton.quiet} ${adminButton.sm}`}>
                            Edit
                          </Link>
                          {!r.isSystem && r._count.users === 0 && <ConfirmButton label="Delete" message={`Delete role ${r.name}?`} action={deleteRoleAction.bind(null, r.id)} size="sm" variant="danger" />}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </div>
        <div className="grid gap-6 self-start">
          <Card title="Invite an admin" description="Existing accounts get the role immediately; new ones receive a set-password link (24h).">
            <ActionForm action={inviteAdminAction} submitLabel="Send invite" resetOnSuccess>
              <Field label="Email">
                <input name="email" type="email" required className={adminInput} />
              </Field>
              <Field label="Name">
                <input name="name" required className={adminInput} />
              </Field>
              <Field label="Role">
                <select name="roleId" className={adminSelect} defaultValue={roles.find((r) => r.slug === "support")?.id ?? roles[0]?.id}>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
            </ActionForm>
          </Card>
          <Card title={editRole ? `Edit role: ${editRole.name}` : "New role"} actions={editRole ? <Link href="/admin/admins" className="text-[13px] text-ink-600">Cancel</Link> : undefined}>
            <ActionForm key={editRole?.id ?? "new"} action={saveRoleAction} hidden={editRole ? { id: editRole.id } : {}} submitLabel={editRole ? "Save role" : "Create role"} resetOnSuccess={!editRole}>
              <Field label="Name">
                <input name="name" required defaultValue={editRole?.name ?? ""} className={adminInput} />
              </Field>
              <Field label="Description">
                <input name="description" defaultValue={editRole?.description ?? ""} className={adminInput} />
              </Field>
              {superAdmin && (
                <label className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">
                  <input type="checkbox" name="all" defaultChecked={editPerms.includes("*")} disabled={editRole?.slug === "super_admin"} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> All permissions (*)
                </label>
              )}
              <div className="grid gap-3">
                {PERMISSION_GROUPS.map((g) => (
                  <fieldset key={g.label} className="rounded-lg border border-ink-200 p-3">
                    <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">{g.label}</legend>
                    <div className="grid gap-1.5">
                      {g.keys.map((k) => (
                        <label key={k} className="flex items-start gap-2 text-[12px] text-ink-800">
                          <input type="checkbox" name="permissions" value={k} defaultChecked={editPerms.includes("*") || editPerms.includes(k)} disabled={(k === "admins.manage" && !superAdmin) || editRole?.slug === "super_admin"} className="mt-0.5 h-3.5 w-3.5 rounded border-ink-300 accent-brand-600" />
                          <span>
                            <span className="font-mono">{k}</span> <span className="text-ink-500">— {PERMISSIONS[k]}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
