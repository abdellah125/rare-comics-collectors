import Link from "next/link";
import type { Metadata } from "next";

import { Breadcrumbs, ButtonLink, Container, Section, SectionHeading, type Crumb } from "@/components/ui";
import { CameraIcon, ClockIcon, MailIcon, PhoneIcon, ScaleIcon, ShieldIcon, TruckIcon } from "@/components/icons";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/seo";
import { policyPages } from "@/lib/nav";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Customer Support & Help Centre",
  description: `Get help with an order, a grading submission, a return or an authenticity question. Reach ${site.name} by phone, email or the help centre — answered by graders, not a call centre.`,
  path: "/support",
  keywords: ["comic store support", "grading submission help", "comic return help"],
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Support", href: "/support" },
];

const channels = [
  {
    icon: PhoneIcon,
    label: "Phone",
    value: site.phoneDisplay,
    href: `tel:${site.phone}`,
    note: "Business hours, straight to the counter.",
    response: "Immediate",
  },
  {
    icon: MailIcon,
    label: "Sales & orders",
    value: site.salesEmail,
    href: `mailto:${site.salesEmail}`,
    note: "Order changes, want lists, offers.",
    response: "Within 1 business day",
  },
  {
    icon: MailIcon,
    label: "Grading & services",
    value: site.gradingEmail,
    href: `mailto:${site.gradingEmail}`,
    note: "Submissions, pressing, appraisals, storage.",
    response: "Within 1 business day",
  },
];

const topics = [
  {
    icon: TruckIcon,
    title: "Where is my order?",
    body: "In-stock books ship within one business day. Once the label is scanned you'll get a tracking email; you can also look the order up at any time.",
    href: "/track-order",
    cta: "Track your order",
  },
  {
    icon: ScaleIcon,
    title: "How is my grading submission progressing?",
    body: "Submissions move through receipt, pre-screen, your approval, pressing, grading and return. Each stage is logged against your submission number.",
    href: "/track-order",
    cta: "Check submission status",
  },
  {
    icon: ShieldIcon,
    title: "I want to return a book",
    body: "Every purchase carries a 14-day inspection window from delivery. Slabs must be returned in the same holder, unopened and undamaged.",
    href: "/policies/returns-and-refunds",
    cta: "Read the returns policy",
  },
  {
    icon: CameraIcon,
    title: "The book doesn't match the photos",
    body: "Tell us immediately and send photos. Every book is photographed from six angles before packing, so we can compare against our own record and make it right.",
    href: "/contact",
    cta: "Report a problem",
  },
  {
    icon: ShieldIcon,
    title: "Is this book authentic?",
    body: "Every slab we sell is verifiable against the grader's own census by certification number, and our guarantee has no expiry date.",
    href: "/policies/authenticity-guarantee",
    cta: "See the guarantee",
  },
  {
    icon: ClockIcon,
    title: "Something else entirely",
    body: "Consignment, estate valuations, vault storage, dealer accounts, press enquiries — send us a message and it will reach the right person.",
    href: "/contact",
    cta: "Contact us",
  },
];

const escalation = [
  {
    step: "1",
    title: "Start with the channel that fits",
    body: "Phone for anything urgent, email for anything with photos or documents attached. Include your order or submission number in the first message and you'll skip a round trip.",
  },
  {
    step: "2",
    title: "We acknowledge within one business day",
    body: "You'll get a named person, not a ticket robot. If your issue needs a grader to physically look at a book, we'll tell you when that will happen.",
  },
  {
    step: "3",
    title: "Resolution or escalation within five business days",
    body: "If we can't resolve it in that window we escalate to a director and give you a written position, including what we'll do and by when.",
  },
];

export default function SupportPage() {
  const supportJsonLd = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: `${site.name} Support`,
    url: `${site.url}/support`,
    isPartOf: { "@id": `${site.url}/#website` },
    mainEntity: {
      "@id": `${site.url}/#store`,
      contactPoint: [
        {
          "@type": "ContactPoint",
          telephone: site.phone,
          email: site.salesEmail,
          contactType: "customer support",
          areaServed: "US",
          availableLanguage: ["English", "Spanish"],
        },
      ],
    },
  };

  return (
    <>
      <JsonLd id="support-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="support-schema" data={supportJsonLd} />

      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-12 lg:py-16">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6 max-w-3xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">Help centre</p>
            <h1 className="mt-3 font-display text-[clamp(2.1rem,4.6vw,3.4rem)] font-semibold leading-[1.08] text-ink-950">
              Support, answered by people who handle the books
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-ink-700">
              No queue system, no offshore script. Start with the topic that matches, or reach us directly — we answer
              every message within one business day.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/track-order" variant="primary" size="lg">
                Track an order
              </ButtonLink>
              <ButtonLink href="/faq" variant="outline" size="lg">
                Read the FAQ
              </ButtonLink>
            </div>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
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
                <p className="mt-3 text-[12px] font-semibold text-brand-700">{c.response}</p>
              </a>
            ))}
          </div>
        </Container>
      </section>

      <Container className="py-14 lg:py-20">
        <SectionHeading eyebrow="Common topics" title="What can we help with?" />
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {topics.map((t) => (
            <article key={t.title} className="flex flex-col rounded-xl border border-ink-200 bg-white p-6">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-ink-100 text-ink-700">
                <t.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-ink-950">{t.title}</h3>
              <p className="mt-2 flex-1 text-[14px] leading-relaxed text-ink-600">{t.body}</p>
              <Link
                href={t.href}
                className="mt-4 text-[14px] font-semibold text-brand-700 underline-offset-4 hover:underline"
              >
                {t.cta} →
              </Link>
            </article>
          ))}
        </div>
      </Container>

      <Section tone="muted">
        <SectionHeading
          eyebrow="Our commitment"
          title="How we handle a problem"
          lead="Published so you know exactly what to expect, and can hold us to it."
        />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {escalation.map((e) => (
            <div key={e.step} className="rounded-xl border border-ink-200 bg-white p-6">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 font-display text-sm font-bold text-white">
                {e.step}
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-ink-950">{e.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-600">{e.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Container className="py-14 lg:py-20">
        <div className="rounded-2xl border border-ink-200 bg-white p-7 sm:p-10">
          <h2 className="font-display text-2xl font-semibold text-ink-950">The policies behind every answer</h2>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-600">
            Our support team works from these documents. They&apos;re public, dated and written in plain English.
          </p>
          <ul className="mt-7 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {policyPages.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/policies/${p.slug}`}
                  className="text-[15px] font-medium text-ink-800 underline-offset-4 hover:text-brand-700 hover:underline"
                >
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </>
  );
}
