import type { Metadata } from "next";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, Field, Table, Td, Th, Tone, adminInput } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { deleteCurrencyAction, refreshRatesAction, saveCurrencyAction, setBaseCurrencyAction } from "@/lib/admin/actions/finance";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Currencies" };
export const dynamic = "force-dynamic";

export default async function AdminCurrenciesPage() {
  await requireAdmin("finance.manage");
  const [currencies, settings] = await Promise.all([db.currency.findMany({ orderBy: [{ isBase: "desc" }, { code: "asc" }] }), getSettings()]);
  return (
    <>
      <AdminPageHeader
        crumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Currencies" }]}
        title="Currencies"
        lead={`Prices are stored in the base currency and converted for display and charging. Rates refresh automatically every 6 hours from ${new URL(env.exchangeRateApiUrl).host}${settings["system.exchangeRatesAuto"] ? "" : " (auto-refresh is off)"}.`}
        actions={<ConfirmButton label="Refresh rates now" message="Fetch the latest exchange rates for every non-base currency." action={refreshRatesAction} variant="dark" />}
      />
      <Table className="mb-6">
        <thead>
          <tr>
            <Th>Code</Th>
            <Th>Name</Th>
            <Th>Symbol</Th>
            <Th align="right">Decimals</Th>
            <Th align="right">1 base =</Th>
            <Th>Source</Th>
            <Th>Updated</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {currencies.map((c) => (
            <tr key={c.code}>
              <Td className="font-mono font-semibold">{c.code}</Td>
              <Td>{c.name}</Td>
              <Td>{c.symbol}</Td>
              <Td align="right">{c.decimals}</Td>
              <Td align="right">{c.rateToBase}</Td>
              <Td className="text-ink-600">{c.rateSource ?? "—"}</Td>
              <Td className="text-ink-600">{formatDateTime(c.updatedAt)}</Td>
              <Td>
                <span className="flex gap-1">
                  {c.isBase && <Tone tone="dark">Base</Tone>}
                  {c.isEnabled ? <Tone tone="success">Enabled</Tone> : <Tone tone="neutral">Off</Tone>}
                </span>
              </Td>
              <Td>
                <span className="flex gap-1">
                  {!c.isBase && <ConfirmButton label="Make base" message="Only possible before any orders exist." action={setBaseCurrencyAction.bind(null, c.code)} size="sm" />}
                  {!c.isBase && <ConfirmButton label="Delete" message={`Delete ${c.code}?`} action={deleteCurrencyAction.bind(null, c.code)} size="sm" variant="danger" />}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="grid gap-6 lg:grid-cols-2">
        {currencies.map((c) => (
          <Card key={c.code} title={`Edit ${c.code}`}>
            <ActionForm action={saveCurrencyAction} hidden={{ code: c.code }} submitLabel="Save" variant="outline">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Name">
                  <input name="name" defaultValue={c.name} className={adminInput} />
                </Field>
                <Field label="Symbol">
                  <input name="symbol" defaultValue={c.symbol} className={adminInput} />
                </Field>
                <Field label="Decimals">
                  <input name="decimals" type="number" min={0} max={4} defaultValue={c.decimals} className={adminInput} />
                </Field>
                <Field label="Rate to base">
                  <input name="rateToBase" type="number" step="0.000001" min="0.000001" defaultValue={c.rateToBase} disabled={c.isBase} className={adminInput} />
                </Field>
              </div>
              {!c.isBase && (
                <label className="flex items-center gap-2 text-[13px] text-ink-800">
                  <input type="checkbox" name="isEnabled" defaultChecked={c.isEnabled} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Available to shoppers
                </label>
              )}
            </ActionForm>
          </Card>
        ))}
        <Card title="Add currency">
          <ActionForm action={saveCurrencyAction} submitLabel="Add currency" resetOnSuccess>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Field label="Code">
                <input name="code" required maxLength={3} placeholder="SEK" className={adminInput} />
              </Field>
              <Field label="Name">
                <input name="name" required className={adminInput} />
              </Field>
              <Field label="Symbol">
                <input name="symbol" required className={adminInput} />
              </Field>
              <Field label="Decimals">
                <input name="decimals" type="number" min={0} max={4} defaultValue={2} className={adminInput} />
              </Field>
              <Field label="Rate to base">
                <input name="rateToBase" type="number" step="0.000001" required className={adminInput} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-ink-800">
              <input type="checkbox" name="isEnabled" defaultChecked className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Enabled
            </label>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
