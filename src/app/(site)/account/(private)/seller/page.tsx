import type { Metadata } from "next";
import { SellerApplyForm } from "@/components/account/seller-apply-form";
import { PageHeader, Panel } from "@/components/account/ui";
import { Badge, ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { getSellerCountries } from "@/lib/commerce/countries";
import { db } from "@/lib/db";
import { bpsToPercent } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = pageMetadata({ title: "Become a seller", description: "Apply to sell graded comics on the marketplace.", path: "/account/seller", noIndex: true });

export default async function SellerApplyPage() {
  const user = await requireUser({ next: "/account/seller" });
  const [profile, settings, countries] = await Promise.all([db.sellerProfile.findUnique({ where: { userId: user.id } }), getSettings(), getSellerCountries()]);

  if (profile && profile.status !== "rejected") {
    return (
      <div className="grid gap-8">
        <PageHeader title="Seller account" actions={<Badge tone={profile.status === "approved" ? "brand" : profile.status === "suspended" ? "sale" : "gold"}>{profile.status}</Badge>} />
        <Panel>
          {profile.status === "pending" && <p className="text-sm text-ink-700">Thanks for applying as <strong>{profile.displayName}</strong>. We review applications within two business days and will email you with the decision.</p>}
          {profile.status === "approved" && (
            <div className="grid gap-4">
              <p className="text-sm text-ink-700">Your store <strong>{profile.displayName}</strong> is live. Manage listings, orders and payouts from the seller dashboard.</p>
              <div>
                <ButtonLink href="/dashboard" size="md">
                  Open seller dashboard
                </ButtonLink>
              </div>
            </div>
          )}
          {profile.status === "suspended" && <p className="text-sm text-rose-700">Your seller account is suspended{profile.statusReason ? `: ${profile.statusReason}` : ""}. You can appeal from Account › Security.</p>}
        </Panel>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <PageHeader title="Become a seller" lead={`List graded and raw books to thousands of collectors. Marketplace commission is ${bpsToPercent(settings["commerce.commissionBps"])} of each sale; payouts run ${settings["payouts.schedule"]} after a ${settings["payouts.holdDays"]}-day clearing period.`} />
      {profile?.status === "rejected" && (
        <Panel tone="danger" title="Previous application not approved">
          <p className="text-sm text-ink-700">{profile.statusReason ?? "We couldn't approve the earlier application."} You can apply again below.</p>
        </Panel>
      )}
      {!settings["sellers.enabled"] ? (
        <Panel>
          <p className="text-sm text-ink-700">Seller applications are closed at the moment. Check back soon.</p>
        </Panel>
      ) : (
        <Panel title="Application" description="Identity documents are stored encrypted and only visible to the verification team.">
          <SellerApplyForm countries={countries} defaultCountry={user.countryCode ?? settings["marketplace.defaultCountry"]} requireVerification={settings["sellers.requireVerification"]} />
        </Panel>
      )}
    </div>
  );
}
