import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, Field, Table, Td, Th, Tone, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin, can } from "@/lib/auth/session";
import { deleteLocaleAction, deleteTranslationAction, saveLocaleAction, saveTranslationAction, saveTranslationsBulkAction } from "@/lib/admin/actions/settings";
import { db } from "@/lib/db";
import { SettingsNav } from "../[group]/page";

export const metadata: Metadata = { title: "Localization" };
export const dynamic = "force-dynamic";

export default async function AdminLocalizationPage({ searchParams }: PageProps<"/admin/settings/localization">) {
  const admin = await requireAdmin("settings.view");
  const manage = can(admin, "settings.manage");
  const sp = await searchParams;
  const locales = await db.locale.findMany({ orderBy: [{ isDefault: "desc" }, { code: "asc" }], include: { _count: { select: { strings: true } } } });
  const defaultLocale = locales.find((l) => l.isDefault)?.code ?? "en";
  const locale = typeof sp.locale === "string" && locales.some((l) => l.code === sp.locale) ? sp.locale : locales.find((l) => !l.isDefault)?.code ?? defaultLocale;
  const namespaces = await db.translation.findMany({ distinct: ["namespace"], select: { namespace: true }, orderBy: { namespace: "asc" } });
  const namespace = typeof sp.ns === "string" && sp.ns ? sp.ns : "common";
  const [base, current] = await Promise.all([db.translation.findMany({ where: { locale: defaultLocale, namespace }, orderBy: { key: "asc" } }), db.translation.findMany({ where: { locale, namespace }, orderBy: { key: "asc" } })]);
  const currentByKey = new Map(current.map((t) => [t.key, t]));
  const keys = [...new Set([...base.map((t) => t.key), ...current.map((t) => t.key)])].sort();
  const missing = keys.filter((k) => !currentByKey.has(k)).length;
  return (
    <>
      <AdminPageHeader title="Localization" lead="Enabled locales appear in the language switcher. Strings fall back to the default locale, then to the built-in English copy." actions={<SettingsNav active="localization" />} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid gap-6 xl:col-span-2">
          <Card title={`Translations — ${locale} / ${namespace}`} description={`${keys.length} keys · ${missing} untranslated. Blank a value to fall back to the default locale.`} actions={<form className="flex gap-2" action="/admin/settings/localization"><select name="locale" defaultValue={locale} className={`${adminSelect} h-8 w-auto text-[12px]`}>{locales.map((l) => (<option key={l.code} value={l.code}>{l.code} — {l.name}</option>))}</select><select name="ns" defaultValue={namespace} className={`${adminSelect} h-8 w-auto text-[12px]`}>{[...new Set(["common", ...namespaces.map((n) => n.namespace)])].map((n) => (<option key={n} value={n}>{n}</option>))}</select><button type="submit" className="rounded-md border border-ink-300 px-2 text-[12px]">Go</button></form>}>
            {keys.length === 0 ? (
              <p className="text-sm text-ink-500">No keys yet in this namespace — add one on the right. Code reads strings with t(&quot;key&quot;, &quot;fallback&quot;).</p>
            ) : manage ? (
              <ActionForm action={saveTranslationsBulkAction} hidden={{ locale, namespace }} submitLabel="Save all">
                <Table>
                  <thead>
                    <tr>
                      <Th>Key</Th>
                      <Th>{defaultLocale} (default)</Th>
                      <Th>{locale}</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => {
                      const b = base.find((t) => t.key === k);
                      const c = currentByKey.get(k);
                      return (
                        <tr key={k}>
                          <Td className="font-mono text-[11px] text-ink-600">{k}</Td>
                          <Td className="max-w-[240px] text-[12px] text-ink-700">{b?.value ?? <span className="text-ink-400">—</span>}</Td>
                          <Td>
                            <input name={`t:${k}`} defaultValue={c?.value ?? ""} className={`${adminInput} h-8 text-[12px]`} placeholder={b?.value ?? ""} />
                          </Td>
                          <Td>{c && locale !== defaultLocale && <ConfirmButton label="×" message={`Delete the ${locale} translation for ${k}?`} action={deleteTranslationAction.bind(null, c.id)} size="sm" variant="quiet" />}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </ActionForm>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Key</Th>
                    <Th>{defaultLocale}</Th>
                    <Th>{locale}</Th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k}>
                      <Td className="font-mono text-[11px]">{k}</Td>
                      <Td className="text-[12px]">{base.find((t) => t.key === k)?.value ?? "—"}</Td>
                      <Td className="text-[12px]">{currentByKey.get(k)?.value ?? <span className="text-ink-400">fallback</span>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
        <div className="grid gap-6 self-start">
          <Card title="Locales">
            <Table>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Name</Th>
                  <Th align="right">Strings</Th>
                  <Th>State</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {locales.map((l) => (
                  <tr key={l.code}>
                    <Td className="font-mono">{l.code}</Td>
                    <Td>{l.name}</Td>
                    <Td align="right">{l._count.strings}</Td>
                    <Td>
                      <span className="flex gap-1">
                        {l.isDefault && <Tone tone="dark">default</Tone>}
                        {l.isEnabled ? <Tone tone="success">on</Tone> : <Tone tone="neutral">off</Tone>}
                      </span>
                    </Td>
                    <Td>
                      <span className="flex gap-1">
                        <Link href={`/admin/settings/localization?locale=${l.code}&ns=${namespace}`} className="text-[12px] text-brand-700">
                          strings
                        </Link>
                        {manage && !l.isDefault && <ConfirmButton label="delete" message={`Delete ${l.code} and its ${l._count.strings} strings?`} action={deleteLocaleAction.bind(null, l.code)} size="sm" variant="quiet" />}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          {manage && (
            <>
              <Card title="Add or update a locale">
                <ActionForm action={saveLocaleAction} submitLabel="Save locale" variant="outline" resetOnSuccess>
                  <div className="grid grid-cols-[90px_1fr] gap-3">
                    <Field label="Code">
                      <input name="code" required placeholder="fr" className={adminInput} />
                    </Field>
                    <Field label="Name">
                      <input name="name" required placeholder="Français" className={adminInput} />
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-[13px] text-ink-800">
                    <input type="checkbox" name="isEnabled" defaultChecked className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Enabled
                  </label>
                  <label className="flex items-center gap-2 text-[13px] text-ink-800">
                    <input type="checkbox" name="isDefault" className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Make default
                  </label>
                </ActionForm>
              </Card>
              <Card title="Add a string" description="Adds the key to the selected locale and namespace.">
                <ActionForm action={saveTranslationAction} hidden={{ locale, namespace }} submitLabel="Add" variant="outline" resetOnSuccess>
                  <Field label="Key">
                    <input name="key" required placeholder="header.cta" className={adminInput} />
                  </Field>
                  <Field label="Value">
                    <input name="value" required className={adminInput} />
                  </Field>
                </ActionForm>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
