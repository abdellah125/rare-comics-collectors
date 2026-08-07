import Link from "next/link";
import type { Metadata } from "next";

import { ContactForm } from "@/components/contact-form";
import { Breadcrumbs, Container, Section, SectionHeading, type Crumb } from "@/components/ui";
import { ClockIcon, MailIcon, PhoneIcon, PinIcon } from "@/components/icons";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/seo";
import { fullAddress, mapDirectionsLink, mapEmbedLink, mapLink, site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: `Contact ${site.name} — ${site.address.city}, ${site.address.region}`,
  description: `Visit our vault at ${fullAddress}, call ${site.phoneDisplay}, or send a message. Free counter appraisals during business hours and vault viewings by appointment.`,
  path: "/contact",
  keywords: [
    `comic store ${site.address.city}`,
    `comic grading ${site.address.regionName}`,
    "contact comic dealer",
    "comic appraisal near me",
  ],
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Contact", href: "/contact" },
];

const topics = [
  "Buying a book from the store",
  "Grading submission",
  "Pressing & cleaning",
  "Restoration detection",
  "Appraisal / valuation",
  "Consignment or selling to you",
  "Vault storage",
  "Order or shipping question",
  "Something else",
];

const channels = [
  {
    icon: PhoneIcon,
    label: "Call us",
    value: site.phoneDisplay,
    href: `tel:${site.phone}`,
    note: "Fastest route to a grader during business hours.",
  },
  {
    icon: MailIcon,
    label: "Sales & buying",
    value: site.salesEmail,
    href: `mailto:${site.salesEmail}`,
    note: "Want lists, offers, consignment enquiries.",
  },
  {
    icon: MailIcon,
    label: "Grading & services",
    value: site.gradingEmail,
    href: `mailto:${site.gradingEmail}`,
    note: "Submissions, pressing, appraisal, storage.",
  },
];

export default function ContactPage() {
  const contactJsonLd = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: `Contact ${site.name}`,
    url: `${site.url}/contact`,
    isPartOf: { "@id": `${site.url}/#website` },
    mainEntity: {
      "@id": `${site.url}/#store`,
      contactPoint: [
        {
          "@type": "ContactPoint",
          telephone: site.phone,
          email: site.salesEmail,
          contactType: "sales",
          areaServed: "US",
          availableLanguage: ["English", "Spanish"],
        },
        {
          "@type": "ContactPoint",
          telephone: site.phone,
          email: site.gradingEmail,
          contactType: "customer service",
          areaServed: "US",
          availableLanguage: ["English", "Spanish"],
        },
      ],
    },
  };

  return (
    <>
      <JsonLd id="contact-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="contact-schema" data={contactJsonLd} />

      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-12 lg:py-16">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6 max-w-3xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">Get in touch</p>
            <h1 className="mt-3 font-display text-[clamp(2.1rem,4.6vw,3.4rem)] font-semibold leading-[1.08] text-ink-950">
              Talk to a grader, not a call centre
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-ink-700">
              Every message is read by someone who handles books for a living. Send photos, cert numbers or a want
              list and we&apos;ll come back with a straight answer — usually within one business day.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {channels.map((c) => (
              <a
                key={c.label}
                href={c.href}
                className="group rounded-xl border border-ink-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-plate"
              >
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                  <c.icon className="h-5 w-5" />
                </span>
                <p className="mt-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{c.label}</p>
                <p className="mt-1 font-display text-lg font-semibold text-ink-950 group-hover:text-brand-700">
                  {c.value}
                </p>
                <p className="mt-1 text-[13px] text-ink-500">{c.note}</p>
              </a>
            ))}
          </div>
        </Container>
      </section>

      <Container className="py-14 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <h2 className="font-display text-2xl font-semibold text-ink-950">Send us a message</h2>
            <p className="mt-2 text-[15px] text-ink-600">
              Chasing an order?{" "}
              <Link href="/track-order" className="font-medium text-brand-700 underline-offset-2 hover:underline">
                Track it here
              </Link>{" "}
              or{" "}
              <Link href="/support" className="font-medium text-brand-700 underline-offset-2 hover:underline">
                open a support ticket
              </Link>
              .
            </p>
            <ContactForm topics={topics} className="mt-7" />
          </div>

          <aside className="lg:col-span-5" id="visit">
            <h2 className="font-display text-2xl font-semibold text-ink-950">Visit the vault</h2>

            <div className="mt-5 overflow-hidden rounded-xl border border-ink-200 shadow-plate">
              <iframe
                title={`Google Map showing ${site.name} at ${fullAddress}`}
                src={mapEmbedLink}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-[300px] w-full border-0"
              />
              <div className="border-t border-ink-200 bg-ink-50 px-5 py-4">
                <p className="text-sm font-semibold text-ink-950">{site.legalName}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{fullAddress}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-[13px] font-semibold">
                  <a
                    href={mapDirectionsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-700 underline-offset-4 hover:underline"
                  >
                    Get directions →
                  </a>
                  <a
                    href={mapLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink-600 underline-offset-4 hover:underline"
                  >
                    View on Google Maps →
                  </a>
                </div>
              </div>
            </div>

            <dl className="mt-7 grid gap-5">
              <div className="flex gap-3">
                <PinIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Address</dt>
                  <dd className="mt-1 text-[15px] leading-relaxed text-ink-800">
                    {site.address.street}
                    <br />
                    {site.address.city}, {site.address.region} {site.address.postalCode}
                    <br />
                    {site.address.countryName}
                  </dd>
                </div>
              </div>

              <div className="flex gap-3">
                <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Opening hours</dt>
                  <dd className="mt-1 grid gap-1 text-[15px] text-ink-800">
                    {site.hours.map((h) => (
                      <span key={h.days} className="flex justify-between gap-6">
                        <span className="text-ink-600">{h.days}</span>
                        <span className="font-medium">{h.time}</span>
                      </span>
                    ))}
                  </dd>
                </div>
              </div>
            </dl>

            <div className="mt-7 rounded-xl border border-ink-200 bg-ink-50 p-5">
              <h3 className="font-display text-lg font-semibold text-ink-950">Parking &amp; access</h3>
              <ul className="mt-3 grid gap-2 text-[14px] leading-relaxed text-ink-600">
                <li>Metered street parking on Congress Avenue; covered garage entrance on 5th Street.</li>
                <li>Step-free access from the lobby, with a lift to the second floor.</li>
                <li>Vault viewings are by appointment and take place in the ground-floor inspection room.</li>
                <li>Dropping off a submission? Call ahead and we&apos;ll have paperwork ready.</li>
              </ul>
            </div>
          </aside>
        </div>
      </Container>

      <Section tone="muted">
        <SectionHeading
          eyebrow="Selling to us"
          title="We buy collections of any size, anywhere in the US"
          lead="Single keys, run collections, dealer stock or full estates. We pay by wire within 48 hours of agreement, and we'll travel for collections over $25,000."
          align="center"
        />
      </Section>
    </>
  );
}
