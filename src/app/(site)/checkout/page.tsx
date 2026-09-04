import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout-form";
import { Breadcrumbs, Container, type Crumb } from "@/components/ui";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { AU_STATES, CA_PROVINCES, US_STATES, getBuyerCountries } from "@/lib/commerce/countries";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Secure Checkout",
  description: `Complete your ${site.name} order securely.`,
  path: "/checkout",
  noIndex: true,
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Cart", href: "/cart" },
  { name: "Checkout", href: "/checkout" },
];

export default async function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  const sp = await searchParams;
  const [settings, countries, user] = await Promise.all([getSettings(), getBuyerCountries(), getCurrentUser()]);
  const profile = user
    ? await db.user.findUnique({
        where: { id: user.id },
        select: { email: true, name: true, phone: true, addresses: { orderBy: [{ isDefaultShipping: "desc" }, { createdAt: "desc" }] } },
      })
    : null;
  const cancelled = typeof sp.cancelled === "string" ? sp.cancelled : null;

  return (
    <Container className="py-10 lg:py-14">
      <Breadcrumbs items={crumbs} />
      <h1 className="mt-6 font-display text-3xl font-semibold text-ink-950 sm:text-4xl">Secure checkout</h1>
      {cancelled && (
        <p role="status" className="mt-4 rounded-lg bg-gold-400/15 px-4 py-3 text-sm text-gold-800 ring-1 ring-gold-400/40">
          Payment for order {cancelled} was cancelled. Your items are still in the cart — you can try again.
        </p>
      )}
      <div className="mt-10">
        <CheckoutForm
          countries={countries}
          regionOptions={{ US: US_STATES, CA: CA_PROVINCES, AU: AU_STATES }}
          defaultCountry={user?.countryCode ?? settings["marketplace.defaultCountry"]}
          user={
            profile
              ? {
                  email: profile.email,
                  name: profile.name,
                  phone: profile.phone,
                  addresses: profile.addresses.map((a) => ({
                    id: a.id,
                    label: a.label,
                    firstName: a.firstName,
                    lastName: a.lastName,
                    company: a.company ?? undefined,
                    line1: a.line1,
                    line2: a.line2 ?? undefined,
                    city: a.city,
                    region: a.region ?? undefined,
                    postalCode: a.postalCode ?? undefined,
                    countryCode: a.countryCode,
                    phone: a.phone ?? undefined,
                  })),
                }
              : null
          }
          guestCheckout={settings["commerce.guestCheckout"]}
          couponsEnabled={settings["features.coupons"]}
        />
      </div>
    </Container>
  );
}
