import type { Metadata } from "next";

import { TrackOrderForm } from "@/components/track-order-form";
import { Breadcrumbs, Container, type Crumb } from "@/components/ui";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/seo";
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

export default function TrackOrderPage() {
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
        <TrackOrderForm />
      </Container>
    </>
  );
}
