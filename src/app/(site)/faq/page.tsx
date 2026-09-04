import Link from "next/link";
import type { Metadata } from "next";

import { Breadcrumbs, ButtonLink, Container, Section, SectionHeading, type Crumb } from "@/components/ui";
import { JsonLd, breadcrumbJsonLd, faqJsonLd } from "@/components/json-ld";
import { inventoryCount } from "@/lib/products";
import { pageMetadata } from "@/lib/seo";
import { fullAddress, site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Frequently Asked Questions",
  description: `Answers on buying graded comics, grading turnaround and pricing, pressing, shipping, returns and authenticity from ${site.name} in ${site.address.city}, ${site.address.region}.`,
  path: "/faq",
  keywords: [
    "comic grading faq",
    "cgc submission questions",
    "buying graded comics",
    "comic pressing questions",
  ],
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "FAQ", href: "/faq" },
];

type Group = { id: string; heading: string; faqs: { q: string; a: string }[] };

const groups: Group[] = [
  {
    id: "buying",
    heading: "Buying from the store",
    faqs: [
      {
        q: "Are all the comics you sell graded?",
        a: "Most are. The majority of our inventory is encapsulated by CGC or CBCS, and every slab is listed with its certification number so you can verify it against the grader's own census before you buy. We also list carefully described raw books, which always carry full scans of front, back and interior spot-checks.",
      },
      {
        q: "What is the difference between Buy Now and Add to Cart?",
        a: "Add to Cart holds the book in your basket so you can keep browsing and check out with several items at once. Buy Now takes you straight to checkout, skipping the basket — the fastest route for keys where stock is a single copy. Either way, the book is only committed to you once payment completes.",
      },
      {
        q: "Is a book reserved once it is in my cart?",
        a: "No. Because most books are one-of-one, stock is only committed at checkout. If two collectors add the same slab, it goes to whoever completes payment first. Buy Now is the fastest route.",
      },
      {
        q: "Do you accept offers?",
        a: "On books above $500 we will consider sensible offers. Send the listing link and your number through the contact form and a buyer will respond the same business day.",
      },
      {
        q: "Which payment methods do you accept?",
        a: "All major cards and PayPal at checkout, plus bank wire or ACH on orders above $5,000. Payment plans are available on books over $2,500 across three monthly payments with a 25% deposit — ask us before you order.",
      },
    ],
  },
  {
    id: "grading",
    heading: "Grading & submissions",
    faqs: [
      {
        q: "How does a grading submission work?",
        a: "You send us the books or drop them at the vault. We pre-screen each one, give you a grade estimate and a press recommendation, and you approve the tier and declared value per book. We then press where agreed, submit in a consolidated dealer batch, and return the encapsulated books to you fully insured.",
      },
      {
        q: "How long does grading take?",
        a: "Turnaround depends on the tier you choose and the grader's current queue. End to end, most submissions take 18 to 45 business days, with express tiers at the low end of that range. We publish the current queue on the grading service page and update it weekly, and every stage is visible on your submission tracker.",
      },
      {
        q: "Why submit through you rather than direct?",
        a: "Three reasons: dealer submission rates are lower than individual rates, pre-screening stops you paying to grade a book that will not return a grade worth the fee, and pressing before submission frequently lifts a book by half a grade or more. We also carry the insurance and handle the paperwork.",
      },
      {
        q: "Does pressing damage a comic?",
        a: "Not when it is done properly. Pressing uses controlled heat, humidity and pressure to relax non-colour-breaking defects such as spine ticks, bends and dents. It cannot fix colour-breaking creases, tears or missing pieces, and we will tell you plainly when a book is not a press candidate.",
      },
      {
        q: "Is pressing considered restoration?",
        a: "No. Both CGC and CBCS treat pressing as conservation, not restoration, and a pressed book carries no purple label as a result. Anything that adds material — colour touch, tear seals, trimming — is restoration and is always disclosed.",
      },
      {
        q: "What if I disagree with the grade my book receives?",
        a: "The grade is the grader's, not ours, so we cannot overturn it. What we can do is advise whether a re-holder or a resubmission is likely to help, and we do not charge our service fee twice on a resubmission we recommended.",
      },
    ],
  },
  {
    id: "shipping",
    heading: "Shipping, returns & authenticity",
    faqs: [
      {
        q: "How do you pack and ship?",
        a: "Every book is bagged, boarded where raw, wrapped, and double-boxed with rigid corner protection. All shipments are insured to full declared value with signature required on delivery. In-stock orders ship within one business day.",
      },
      {
        q: "Do you ship internationally?",
        a: "Yes, to most countries, fully insured and tracked. Duties and import taxes are the buyer's responsibility and are not collected at checkout. We declare full value on every parcel — we will not under-declare.",
      },
      {
        q: "Can I return a book?",
        a: "Yes. Every purchase carries a 14-day inspection window from delivery. Slabs must come back in the same holder, unopened and undamaged. Return shipping on a book that is not as described is on us.",
      },
      {
        q: "What does your authenticity guarantee cover?",
        a: "If any book we sell is ever shown to be counterfeit, altered, or materially different from its stated certification, we refund the full purchase price. The guarantee has no expiry date and transfers with a documented resale.",
      },
      {
        q: "Can I see the books in person?",
        a: `Yes. Our vault and counter are at ${fullAddress}. Walk in during opening hours for counter appraisals, or book an appointment for a vault viewing of specific books.`,
      },
    ],
  },
];

const allFaqs = groups.flatMap((g) => g.faqs);

export default function FaqPage() {
  return (
    <>
      <JsonLd id="faq-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="faq-schema" data={faqJsonLd(allFaqs)} />

      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-12 lg:py-16">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6 max-w-3xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">Answers</p>
            <h1 className="mt-3 font-display text-[clamp(2.1rem,4.6vw,3.4rem)] font-semibold leading-[1.08] text-ink-950">
              Frequently asked questions
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-ink-700">
              Everything collectors ask us most about buying graded books, submitting for grading, pressing, shipping
              and our guarantee. If your question is not here, ask us directly — we answer within one business day.
            </p>
          </div>

          <nav aria-label="FAQ sections" className="mt-9 flex flex-wrap gap-2.5">
            {groups.map((g) => (
              <a
                key={g.id}
                href={`#${g.id}`}
                className="rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-800 transition-colors hover:border-brand-400 hover:text-brand-700"
              >
                {g.heading}
              </a>
            ))}
          </nav>
        </Container>
      </section>

      <Container className="py-14 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-8">
            {groups.map((g) => (
              <section key={g.id} id={g.id} className="mb-14 scroll-mt-28 last:mb-0">
                <h2 className="font-display text-2xl font-semibold text-ink-950">{g.heading}</h2>
                <div className="mt-6 divide-y divide-ink-200 border-y border-ink-200">
                  {g.faqs.map((f) => (
                    <details key={f.q} className="group py-5">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-[16px] font-semibold text-ink-950 marker:hidden hover:text-brand-700">
                        {f.q}
                        <span
                          aria-hidden
                          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-ink-300 text-ink-600 transition-transform group-open:rotate-45"
                        >
                          +
                        </span>
                      </summary>
                      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-600">{f.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="lg:col-span-4">
            <div className="sticky top-28 rounded-xl border border-ink-200 bg-ink-50 p-6">
              <h2 className="font-display text-xl font-semibold text-ink-950">Still stuck?</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-600">
                Call the counter and speak to a grader, or send photos and we&apos;ll take a look.
              </p>
              <div className="mt-5 grid gap-3">
                <ButtonLink href="/contact" variant="primary" size="md">
                  Contact us
                </ButtonLink>
                <ButtonLink href="/support" variant="outline" size="md">
                  Visit the help centre
                </ButtonLink>
                <a
                  href={`tel:${site.phone}`}
                  className="text-center text-[14px] font-semibold text-brand-700 underline-offset-4 hover:underline"
                >
                  {site.phoneDisplay}
                </a>
              </div>
              <p className="mt-6 border-t border-ink-200 pt-5 text-[13px] leading-relaxed text-ink-600">
                Looking for the fine print? Read the{" "}
                <Link href="/policies" className="font-medium text-brand-700 underline-offset-2 hover:underline">
                  full policy library
                </Link>
                .
              </p>
            </div>
          </aside>
        </div>
      </Container>

      <Section tone="muted">
        <SectionHeading
          eyebrow="Ready when you are"
          title="Browse the vault or start a submission"
          lead={`${inventoryCount} graded key issues in stock, and a grading desk that pre-screens every submission before a cent is spent.`}
          align="center"
        />
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/store" variant="primary" size="lg">
            Shop graded comics
          </ButtonLink>
          <ButtonLink href="/services/grading-submission" variant="outline" size="lg">
            Start a grading submission
          </ButtonLink>
        </div>
      </Section>
    </>
  );
}
