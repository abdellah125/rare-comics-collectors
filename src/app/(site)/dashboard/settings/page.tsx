import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/account/ui";
import { PayoutForm } from "@/components/seller/payout-form";
import { SellerDocsForm } from "@/components/seller/seller-docs-form";
import { StoreProfileForm } from "@/components/seller/store-profile-form";
import { Badge } from "@/components/ui";
import { requireSeller } from "@/lib/auth/session";
import { getBuyerCountries, getSellerCountries } from "@/lib/commerce/countries";
import { isString, parseJsonArray } from "@/lib/json";
import { db } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { bpsToPercent, formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = pageMetadata({ title: "Store settings", description: "Store profile, payouts and verification.", path: "/dashboard/settings", noIndex: true });

export default async function SellerSettingsPage() {
  const user = await requireSeller({ next: "/dashboard/settings" });
  const [profile, countries, buyerCountries, settings] = await Promise.all([
    db.sellerProfile.findUniqueOrThrow({ where: { id: user.seller.id }, include: { documents: { orderBy: { createdAt: "desc" } } } }),
    getSellerCountries(),
    getBuyerCountries(),
    getSettings(),
  ]);
  const commission = profile.commissionBps ?? settings["commerce.commissionBps"];
  return (
    <div className="grid gap-8">
      <PageHeader title="Store settings" lead={`Commission on your sales: ${bpsToPercent(commission)}. Payout hold ${settings["payouts.holdDays"]} days, minimum ${formatMoney(Math.max(profile.minPayout ?? 0, settings["payouts.minAmount"]))}.`} />
      <Panel title="Store profile" description="Shown on your storefront and listings.">
        <StoreProfileForm profile={{ displayName: profile.displayName, bio: profile.bio, shippingPolicy: profile.shippingPolicy, returnPolicy: profile.returnPolicy, handlingDays: profile.handlingDays, shipsFromCountry: profile.shipsFromCountry ?? profile.countryCode, shipsTo: parseJsonArray(profile.shipsToJson, isString), customsNote: profile.customsNote }} countries={countries} buyerCountries={buyerCountries.map((c) => ({ code: c.code, name: c.name }))} />
      </Panel>
      <div id="payouts">
        <Panel title="Payout method" description="Details are encrypted at rest. Only the last digits are ever displayed again.">
          <PayoutForm current={{ payoutMethod: profile.payoutMethod, payoutDetailsMasked: profile.payoutDetailsMasked, minPayout: profile.minPayout, payoutSchedule: profile.payoutSchedule }} globalSchedule={settings["payouts.schedule"]} disabled={Boolean(user.impersonator)} />
        </Panel>
      </div>
      <div id="verification">
        <Panel title="Identity verification" description={<>Status: <Badge tone={profile.verificationStatus === "verified" ? "brand" : profile.verificationStatus === "rejected" ? "sale" : "gold"}>{statusLabel(profile.verificationStatus)}</Badge>{profile.verificationNote ? ` — ${profile.verificationNote}` : ""}</>}>
          <ul className="mb-4 divide-y divide-ink-100 text-sm">
            {profile.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="text-ink-800">{statusLabel(d.type)}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={d.status === "accepted" ? "brand" : d.status === "rejected" ? "sale" : "neutral"}>{statusLabel(d.status)}</Badge>
                  <span className="text-ink-500">{d.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
                </span>
              </li>
            ))}
            {profile.documents.length === 0 && <li className="py-2 text-ink-500">No documents uploaded yet.</li>}
          </ul>
          <SellerDocsForm disabled={Boolean(user.impersonator)} />
        </Panel>
      </div>
    </div>
  );
}
