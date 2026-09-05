import type { Metadata } from "next";
import { ProfileForm } from "@/components/account/profile-form";
import { PageHeader, Panel } from "@/components/account/ui";
import { requireUser } from "@/lib/auth/session";
import { getBuyerCountries } from "@/lib/commerce/countries";
import { getEnabledCurrencies } from "@/lib/currency";
import { getEnabledLocales } from "@/lib/i18n";
import { db } from "@/lib/db";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Profile", description: "Your name, contact details and regional preferences.", path: "/account/profile", noIndex: true });

export default async function ProfilePage() {
  const user = await requireUser({ next: "/account/profile" });
  const [profile, countries, currencies, locales] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, email: true, phone: true, countryCode: true, timezone: true, marketingOptIn: true, currency: true, locale: true } }),
    getBuyerCountries(),
    getEnabledCurrencies(),
    getEnabledLocales(),
  ]);
  const timezones = Intl.supportedValuesOf("timeZone");
  return (
    <div className="grid gap-8">
      <PageHeader title="Profile" lead="Contact details, country, currency, language and time zone. Your email is used to sign in and for order updates." />
      <Panel>
        <ProfileForm profile={profile} countries={countries.map((c) => ({ code: c.code, name: c.name }))} timezones={timezones} currencies={currencies.map((c) => ({ code: c.code, name: c.name, symbol: c.symbol }))} locales={locales.map((l) => ({ code: l.code, name: l.name }))} />
      </Panel>
    </div>
  );
}
