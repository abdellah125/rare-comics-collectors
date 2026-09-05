import type { Metadata } from "next";

import { TrackOrderForm } from "@/components/track-order-form";
import { Breadcrumbs, Container, type Crumb } from "@/components/ui";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/seo";
import { getCurrentUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Track Your Order or Grading Submission",
  description: `Follow a ${site.name} order from the vault to your door, or watch a grading submission move through pre-screen, pressing and encapsulation. Enter your reference number to see live status.`,
  path: "/track-order",
  keywords: ["track comic order", "grading submission status", "comic shipping tracking"],
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Track an order", href: "/track-order" },
];

export default async function TrackOrderPage({ searchParams }: PageProps<"/track-order">) {
  const sp = await searchParams;
  const initialRef = typeof sp.ref === "string" ? sp.ref : "";
  const [settings, user] = await Promise.all([getSettings(), getCurrentUser()]);
  const guestTracking = settings["features.guestTracking"] || Boolean(user);
  return (
    <>
      <JsonLd id="track-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />

      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-12 lg:py-14">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6 max-w-3xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">Order status</p>
            <h1 className="mt-3 font-display text-[clamp(2.1rem,4.6vw,3.2rem)] font-semibold leading-[1.08] text-ink-950">
              Track an order or submission
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-ink-700">
              Purchases and grading submissions both live here. Every stage is timestamped, and every shipment is
              insured to full declared value with signature required on delivery.
            </p>
          </div>
        </Container>
      </section>

      <Container className="py-14 lg:py-16">
        {guestTracking ? (
          <TrackOrderForm initialRef={initialRef} />
        ) : (
          <div className="rounded-xl border border-ink-200 bg-white p-6 sm:p-7">
            <h2 className="font-display text-xl font-semibold text-ink-950">Sign in to track your orders</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-600">Order tracking is available from your account. Sign in and open Orders to see every shipment and its status.</p>
            <Link href={`/account/login?next=${encodeURIComponent("/account/orders")}`} className="mt-5 inline-block text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
              Sign in to your account
            </Link>
          </div>
        )}
      </Container>
    </>
  );
}
