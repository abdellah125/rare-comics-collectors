import type { Metadata } from "next";
import { ProfileForm } from "@/components/account/profile-form";
import { PageHeader, Panel } from "@/components/account/ui";
import { requireUser } from "@/lib/auth/session";
import { getBuyerCountries } from "@/lib/commerce/countries";
import { db } from "@/lib/db";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Profile", description: "Your name, contact details and regional preferences.", path: "/account/profile", noIndex: true });

export default async function ProfilePage() {
  const user = await requireUser({ next: "/account/profile" });
  const [profile, countries] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, email: true, phone: true, countryCode: true, timezone: true, marketingOptIn: true } }),
    getBuyerCountries(),
  ]);
  const timezones = Intl.supportedValuesOf("timeZone");
  return (
    <div className="grid gap-8">
      <PageHeader title="Profile" lead="Your contact details and regional preferences. Your email is used to sign in and for order updates." />
      <Panel>
        <ProfileForm profile={profile} countries={countries.map((c) => ({ code: c.code, name: c.name }))} timezones={timezones} />
      </Panel>
    </div>
  );
}
