import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { ImportUploadForm } from "@/components/admin/import-upload-form";
import { AdminPageHeader, Card, EmptyState, Field, Table, Td, Th, Tone, adminButton, adminInput } from "@/components/admin/ui";
import { can, requireAdmin } from "@/lib/auth/session";
import { fixErrorsAction, releaseAllReadyAction, saveImportSettingsAction, syncNowAction } from "@/lib/admin/actions/imports";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { importStats } from "@/lib/imports/pipeline";
import { IMPORT_SOURCE } from "@/lib/imports/status";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "HipComic import" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type LogEntry = { level: string; text: string };
const parseLog = (s: string): LogEntry[] => {
  try {
    const v = JSON.parse(s) as unknown;
    return Array.isArray(v) ? (v as LogEntry[]).filter((e) => e && typeof e.text === "string") : [];
  } catch {
    return [];
  }
};

export default async function AdminImportsPage() {
  const admin = await requireAdmin("products.view");
  const manage = can(admin, "products.manage");
  const canSettings = can(admin, "settings.manage");
  const [stats, runs, settings] = await Promise.all([importStats(IMPORT_SOURCE), db.importRun.findMany({ where: { source: IMPORT_SOURCE }, orderBy: { startedAt: "desc" }, take: 15 }), getSettings()]);
  const queue = (status?: string) => `/admin/imports/queue${status ? `?status=${status}` : ""}`;
  const tiles: { label: string; value: number; href: string; tone?: "warning" | "gold" | "success" | "danger" | "brand" | "neutral" }[] = [
    { label: "Products discovered", value: stats.discovered, href: queue("all") },
    { label: "Pending review", value: stats.pending, href: queue("pending_review"), tone: "warning" },
    { label: "Approved", value: stats.approved, href: queue("approved"), tone: "brand" },
    { label: "Waiting for release", value: stats.ready, href: queue("ready"), tone: "gold" },
    { label: "Released", value: stats.released, href: queue("released"), tone: "success" },
    { label: "Duplicates", value: stats.duplicates, href: queue("duplicate"), tone: "neutral" },
    { label: "Errors", value: stats.errors, href: queue("error"), tone: "danger" },
    { label: "Rejected", value: stats.rejected, href: queue("rejected"), tone: "neutral" },
  ];
  const feedUrl = settings["imports.feedUrl"];

  return (
    <>
      <AdminPageHeader
        title="HipComic import"
        lead={settings["imports.autoReleasePerDay"] > 0 ? `Products from the authorised source enter the queue here. The daily release rule publishes up to ${settings["imports.autoReleasePerDay"].toLocaleString("en-US")} of them per day${settings["imports.autoReleaseIncludePending"] ? "" : " (only those you approved)"}; you can also approve and release by hand.` : "Products from the authorised source wait here for review. The daily release rule is off: a product becomes public only after you approve it and press Release."}
        actions={
          <>
            <Link href="/admin/imports/queue" className={adminButton.primary}>
              Review queue
            </Link>
            {manage && stats.errors > 0 && <ConfirmButton label={`Fix ${stats.errors} errors`} title="Fix errors automatically" message="Re-checks every product in Error. Auctions get a suggested Buy It Now price, raw books are accepted with the condition their listing states, and details Merchant Center does not require (publisher, year, grade, label, issue number) are set to Unknown, then looked up from reference knowledge where that is certain. Fixed products move to Pending Review; nothing is published. Products you edited are left alone." action={fixErrorsAction} confirmLabel="Fix errors" />}
            {manage && stats.ready + stats.approved > 0 && <ConfirmButton label={`Release all ${stats.ready + stats.approved} approved`} title="Release all approved" message={`Publishes every approved product (${stats.ready} ready, ${stats.approved} still having their photo stored), whatever the daily limit. They become visible on the store, in the sitemap and in the Merchant Center feed.`} action={releaseAllReadyAction} confirmLabel="Release" />}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="rounded-xl border border-ink-200 bg-white p-4 hover:border-brand-300" data-testid={`stat-${t.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">{t.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-ink-950">{t.value.toLocaleString("en-US")}</p>
          </Link>
        ))}
      </div>
      {settings["imports.autoReleasePerDay"] > 0 && (
        <p className="mt-3 text-[13px] text-ink-700" data-testid="daily-release">
          Daily release rule: <strong className="text-ink-950">{stats.releasedToday.toLocaleString("en-US")} / {settings["imports.autoReleasePerDay"].toLocaleString("en-US")}</strong> released today (UTC) · {stats.ready + stats.approved} being prepared or ready · {stats.pending.toLocaleString("en-US")} in Pending Review
        </p>
      )}
      <p className="mt-3 text-[13px] text-ink-600">
        Last synchronisation: <strong className="text-ink-900">{stats.lastSyncAt ? `${formatDateTime(stats.lastSyncAt)} (${stats.lastSyncKind === "feed" ? "feed" : stats.lastSyncKind === "crawl" ? "catalogue page" : "file upload"})` : "none yet"}</strong>
        {stats.possibleDuplicates > 0 && (
          <>
            {" · "}
            <Link href="/admin/imports/queue?duplicate=possible" className="font-medium text-brand-700 hover:underline">
              {stats.possibleDuplicates} possible duplicate(s) to check
            </Link>
          </>
        )}
        {stats.priceNotes > 0 && (
          <>
            {" · "}
            <Link href="/admin/imports/queue?price=changed" className="font-medium text-brand-700 hover:underline">
              {stats.priceNotes} manual price(s) whose source price changed
            </Link>
          </>
        )}
      </p>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {manage && (
          <Card title="Import from a file" description="Use the data the agreement with the source covers. A product already in the queue is updated (price, availability), never added twice.">
            <ImportUploadForm />
          </Card>
        )}

        <Card
          title="Pricing and synchronisation"
          description="Selling price = source price × (1 − discount). The source price and the discount are stored for the admin only; customers see the selling price and nothing else."
          actions={manage && feedUrl ? <ConfirmButton label="Sync now" message="Fetches the configured feed now. New products go to the review queue; prices and availability of known products are updated." action={syncNowAction} size="sm" /> : undefined}
        >
          {canSettings ? (
            <ActionForm action={saveImportSettingsAction} submitLabel="Save settings">
              <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
                <Field label="Daily release rule: products released per day" hint="0 switches the rule off. Counted per day in UTC; a product released by hand counts too.">
                  <input name="autoReleasePerDay" type="number" min={0} max={20000} step={1} defaultValue={settings["imports.autoReleasePerDay"]} className={`${adminInput} sm:w-40`} />
                </Field>
                <div className="mt-3 grid gap-2">
                  <label className="flex items-start gap-2 text-[13px] text-ink-800">
                    <input type="checkbox" name="autoReleaseIncludePending" defaultChecked={settings["imports.autoReleaseIncludePending"]} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
                    <span>
                      Also release products still in Pending Review
                      <span className="block text-[12px] text-ink-500">Off: the rule only releases products you approved. On: it approves the oldest pending products itself, after the same checks as a manual release.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-[13px] text-ink-800">
                    <input type="checkbox" name="autoReleaseHoldDuplicates" defaultChecked={settings["imports.autoReleaseHoldDuplicates"]} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
                    <span>Keep possible duplicates for me to check</span>
                  </label>
                  <label className="flex items-start gap-2 text-[13px] text-ink-800">
                    <input type="checkbox" name="autoReleaseHoldFallbackPrices" defaultChecked={settings["imports.autoReleaseHoldFallbackPrices"]} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
                    <span>Keep auction products whose price comes from the fallback rule (bid × multiplier) for me to check</span>
                  </label>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Discount off the source price (%)" hint="25 means $100 at the source sells for $75.">
                  <input name="discountPercent" type="number" min={0} max={99} step="0.01" defaultValue={settings["imports.discountBps"] / 100} className={adminInput} />
                </Field>
                <Field label="Check the feed every (hours)">
                  <input name="syncHours" type="number" min={1} max={720} defaultValue={settings["imports.syncHours"]} className={adminInput} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Auction without comparables: current bid ×" hint="Used only when no other listing of the same book exists to base a Buy It Now price on.">
                  <input name="auctionMultiplier" type="number" min={1} max={20} step="0.1" defaultValue={settings["imports.auctionBidMultiplierPct"] / 100} className={adminInput} />
                </Field>
                <Field label="…and never below (US$)">
                  <input name="auctionMinPrice" type="number" min={1} step="0.01" defaultValue={(settings["imports.auctionMinPrice"] / 100).toFixed(2)} className={adminInput} />
                </Field>
              </div>
              <Field label="Authorised feed address (optional)" hint="An https address the source gave you for its data (CSV or JSON). If it needs an access token, set HIPCOMIC_FEED_TOKEN in the hosting environment. Leave empty to sync by file upload only. If the source refuses the request, the sync stops and reports it.">
                <input name="feedUrl" type="url" defaultValue={feedUrl} placeholder="https://…" className={adminInput} />
              </Field>
              <label className="flex items-start gap-2 text-[13px] text-ink-800">
                <input type="checkbox" name="feedIsComplete" defaultChecked={settings["imports.feedIsComplete"]} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
                <span>The feed lists everything currently for sale (a product missing from it is marked unavailable)</span>
              </label>
              <label className="flex items-start gap-2 text-[13px] text-ink-800">
                <input type="checkbox" name="autoPriceSync" defaultChecked={settings["imports.autoPriceSync"]} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
                <span>
                  Automatic price synchronisation
                  <span className="block text-[12px] text-ink-500">Off: when the source price changes, a selling price you set by hand is kept and flagged. On: it is replaced by the new source price less the discount. Prices nobody edited always follow the source.</span>
                </span>
              </label>
            </ActionForm>
          ) : (
            <p className="text-[13px] text-ink-600">
              Discount {settings["imports.discountBps"] / 100}% · automatic price synchronisation {settings["imports.autoPriceSync"] ? "on" : "off"} · feed {feedUrl ? "configured" : "not configured"}.
            </p>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Import log" description="The last 15 runs: file uploads, feed syncs and the one-time migration of the old schedule.">
          {runs.length === 0 ? (
            <EmptyState title="No imports yet" body="Upload a file above to start." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Source</Th>
                  <Th>Result</Th>
                  <Th align="right">Rows</Th>
                  <Th align="right">New</Th>
                  <Th align="right">Updated</Th>
                  <Th align="right">Duplicates</Th>
                  <Th align="right">Errors</Th>
                  <Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const log = parseLog(r.logJson);
                  return (
                    <tr key={r.id}>
                      <Td className="whitespace-nowrap">{formatDateTime(r.startedAt)}</Td>
                      <Td className="max-w-[220px] truncate">
                        {r.kind === "feed" ? "Feed" : r.kind === "seed" ? "Migration" : r.kind === "crawl" ? "Catalogue page" : "Upload"}
                        <span className="block truncate text-[11px] text-ink-500">{r.fileName ?? "—"}</span>
                      </Td>
                      <Td>
                        <Tone tone={r.status === "completed" ? "success" : r.status === "failed" ? "danger" : "warning"}>{r.status}</Tone>
                      </Td>
                      <Td align="right">{r.rows}</Td>
                      <Td align="right">{r.created}</Td>
                      <Td align="right">{r.updated}</Td>
                      <Td align="right">{r.duplicates}</Td>
                      <Td align="right">{r.errors}</Td>
                      <Td className="max-w-[420px] text-[12px] text-ink-600">
                        {r.message}
                        {log.length > 0 && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-brand-700">{log.length} log line(s)</summary>
                            <ul className="mt-1 grid max-h-56 gap-0.5 overflow-y-auto">
                              {log.map((e, i) => (
                                <li key={i} className={e.level === "error" ? "text-rose-700" : e.level === "warn" ? "text-amber-700" : ""}>
                                  {e.text}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
