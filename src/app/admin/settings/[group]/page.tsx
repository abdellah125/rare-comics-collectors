import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, Field, Kv, adminInput, adminSelect, adminTextarea } from "@/components/admin/ui";
import { requireAdmin, can } from "@/lib/auth/session";
import { clearBrandingAction, saveSettingsGroupAction, uploadBrandingAction } from "@/lib/admin/actions/settings";
import { SETTING_GROUPS, settingGroup } from "@/lib/admin/settings-spec";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { getSettings, type Settings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export function SettingsNav({ active }: { active: string }) {
  return (
    <nav className="flex flex-wrap gap-1 rounded-lg border border-ink-200 bg-white p-1" aria-label="Settings sections">
      {[...SETTING_GROUPS.map((g) => ({ slug: g.slug, title: g.title })), { slug: "localization", title: "Localization" }].map((g) => (
        <Link key={g.slug} href={`/admin/settings/${g.slug}`} className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${active === g.slug ? "bg-ink-950 text-white" : "text-ink-700 hover:bg-ink-100"}`}>
          {g.title}
        </Link>
      ))}
    </nav>
  );
}

export default async function AdminSettingsGroupPage({ params }: PageProps<"/admin/settings/[group]">) {
  const admin = await requireAdmin("settings.view");
  const { group: slug } = await params;
  const group = settingGroup(slug);
  if (!group) notFound();
  const [settings, updated] = await Promise.all([getSettings(), db.setting.findMany({ where: { key: { in: group.fields.map((f) => f.key) } }, orderBy: { updatedAt: "desc" }, take: 1, include: { updatedBy: { select: { name: true } } } })]);
  const manage = can(admin, "settings.manage");
  const last = updated[0];
  return (
    <>
      <AdminPageHeader title="Marketplace settings" lead={last ? `${group.title} last changed ${formatDateTime(last.updatedAt)}${last.updatedBy ? ` by ${last.updatedBy.name}` : ""}.` : group.description} actions={<SettingsNav active={slug} />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={group.title} description={group.description} className="lg:col-span-2">
          {manage ? (
            <ActionForm action={saveSettingsGroupAction} hidden={{ group: group.slug }} submitLabel="Save settings">
              <div className="grid gap-4 sm:grid-cols-2">
                {group.fields.map((f) => {
                  const v = settings[f.key];
                  if (f.kind === "bool")
                    return (
                      <label key={f.key} className="flex items-start gap-2 text-[13px] text-ink-800 sm:col-span-2">
                        <input type="checkbox" name={f.key} defaultChecked={Boolean(v)} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
                        <span>
                          {f.label}
                          {f.hint && <span className="block text-[12px] text-ink-500">{f.hint}</span>}
                        </span>
                      </label>
                    );
                  return (
                    <Field key={f.key} label={f.label} hint={f.hint} className={f.kind === "textarea" ? "sm:col-span-2" : ""}>
                      {f.kind === "textarea" ? (
                        <textarea name={f.key} rows={3} defaultValue={String(v ?? "")} className={adminTextarea} />
                      ) : f.kind === "select" ? (
                        <select name={f.key} defaultValue={String(v)} className={adminSelect}>
                          {f.options?.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : f.kind === "color" ? (
                        <input name={f.key} type="color" defaultValue={String(v)} className="h-9 w-16 rounded border border-ink-300" />
                      ) : f.kind === "money" ? (
                        <input name={f.key} type="number" step="0.01" min={0} defaultValue={(Number(v) / 100).toFixed(2)} className={adminInput} />
                      ) : (
                        <input name={f.key} type={f.kind === "number" ? "number" : "text"} min={f.min} max={f.max} defaultValue={String(v ?? "")} className={adminInput} />
                      )}
                    </Field>
                  );
                })}
              </div>
            </ActionForm>
          ) : (
            <Kv items={group.fields.map((f) => ({ label: f.label, value: f.kind === "bool" ? (settings[f.key] ? "on" : "off") : f.kind === "money" ? formatMoney(Number(settings[f.key])) : String(settings[f.key] ?? "—") }))} />
          )}
        </Card>
        {slug === "general" && (
          <div className="grid gap-6 self-start">
            {(["logo", "favicon"] as const).map((kind) => {
              const id = settings[kind === "logo" ? "marketplace.logoMediaId" : "marketplace.faviconMediaId"] as Settings["marketplace.logoMediaId"];
              return (
                <Card key={kind} title={kind === "logo" ? "Logo" : "Favicon"} description={kind === "logo" ? "PNG/SVG, shown in the header and emails." : "Square PNG/ICO, 32–512px."}>
                  {id ? (
                    <div className="mb-3 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/media/${id}`} alt="" className="h-12 max-w-[160px] rounded bg-ink-50 object-contain p-1" />
                      {manage && <ConfirmButton label="Remove" message={`Remove the ${kind}?`} action={clearBrandingAction.bind(null, kind)} size="sm" />}
                    </div>
                  ) : (
                    <p className="mb-3 text-[13px] text-ink-500">Using the default wordmark.</p>
                  )}
                  {manage && (
                    <ActionForm action={uploadBrandingAction} hidden={{ kind }} submitLabel="Upload" variant="outline">
                      <input type="file" name="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon" required className="block text-[12px]" />
                    </ActionForm>
                  )}
                </Card>
              );
            })}
          </div>
        )}
        {slug === "system" && (
          <Card title="Maintenance status" className="self-start">
            <p className={`text-sm ${settings["system.maintenanceMode"] ? "font-semibold text-rose-700" : "text-ink-700"}`}>{settings["system.maintenanceMode"] ? "Maintenance mode is ON — shoppers see the holding page." : "Marketplace is live."}</p>
            <p className="mt-2 text-[12px] text-ink-500">Admins keep full access during maintenance; webhooks and the job worker keep running.</p>
          </Card>
        )}
      </div>
    </>
  );
}
