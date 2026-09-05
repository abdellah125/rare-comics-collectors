import type { ReactNode } from "react";
import Link from "next/link";

import { policyPages, type PolicySlug } from "@/lib/nav";
import { fullAddress, site } from "@/lib/site";
import { ShippingRatesTable } from "@/components/shipping-rates-table";

export type PolicySection = { id: string; heading: string; body: ReactNode };

export type Policy = {
  slug: PolicySlug;
  title: string;
  nav: string;
  /** Meta description + on-page lead. */
  summary: string;
  /** ISO date; also used for the sitemap and the "last updated" line. */
  updated: string;
  keywords: string[];
  sections: PolicySection[];
};

const EFFECTIVE = "2026-06-01";

const contactBlock = (
  <address className="not-italic">
    {site.legalName}
    <br />
    {fullAddress}
    <br />
    <a href={`mailto:${site.email}`}>{site.email}</a>
    <br />
    <a href={`tel:${site.phone}`}>{site.phoneDisplay}</a>
  </address>
);

const policyBodies: Record<PolicySlug, { summary: string; keywords: string[]; sections: PolicySection[] }> = {
  /* ------------------------------------------------------------- shipping */
  shipping: {
    summary:
      "How we pack, insure and ship graded and raw comics domestically and internationally, including dispatch times, carriers, signature requirements and what happens if a parcel is damaged or lost.",
    keywords: ["comic shipping policy", "insured comic shipping", "graded comic packing"],
    sections: [
      {
        id: "dispatch",
        heading: "Dispatch times",
        body: (
          <>
            <p>
              Orders for in-stock books placed before 2:00 PM Central on a business day are dispatched the same day.
              Orders placed after that, or at a weekend or public holiday, are dispatched the next business day.
            </p>
            <p>
              Books that are in the middle of a grading, pressing or storage workflow are marked as such on the listing
              and ship once that workflow completes. We will always give you a date in writing before taking payment.
            </p>
          </>
        ),
      },
      {
        id: "packing",
        heading: "How we pack",
        body: (
          <>
            <p>Every order is packed by hand by a member of the vault team. Without exception:</p>
            <ul>
              <li>Slabs are sleeved, then wrapped in closed-cell foam, then bagged against moisture.</li>
              <li>Raw books are bagged and boarded, then sandwiched between rigid backing boards.</li>
              <li>Everything is double-boxed with a minimum two inches of void fill on all six faces.</li>
              <li>Multi-slab orders are separated so no two holders can contact one another in transit.</li>
            </ul>
            <p>
              Every book is photographed from six angles immediately before it goes into the box. Those photographs are
              retained for twelve months and are what we compare against if you report a problem.
            </p>
          </>
        ),
      },
      {
        id: "domestic",
        heading: "Domestic shipping (United States)",
        body: (
          <>
            <ShippingRatesTable countryCode="US" />
            <p>
              All domestic shipments are insured to full purchase value and require an adult signature on delivery. We
              cannot mark a parcel &ldquo;no signature required&rdquo; — this is an insurance condition, not a
              preference.
            </p>
          </>
        ),
      },
      {
        id: "international",
        heading: "International shipping",
        body: (
          <>
            <p>
              We ship to most countries using fully tracked and insured air services. Transit is typically 5 – 14
              business days depending on destination and customs.
            </p>
            <p>
              <strong>Duties and import taxes are the buyer&apos;s responsibility</strong> and are not collected at
              checkout. We declare the full purchase value on every customs form. We will not under-declare a parcel or
              describe a sale as a gift, and requests to do so will be declined.
            </p>
            <p>
              If a parcel is refused or abandoned at customs, the order is refunded less outbound shipping, return
              shipping and any charges levied by the carrier.
            </p>
          </>
        ),
      },
      {
        id: "damage",
        heading: "Loss and damage in transit",
        body: (
          <>
            <p>
              Risk passes to you on delivery, not on dispatch — until a parcel is signed for, it is our problem. If a
              parcel arrives damaged:
            </p>
            <ol>
              <li>Photograph the outer box before opening it, then photograph the contents in place.</li>
              <li>
                Contact us within 48 hours of delivery at <a href={`mailto:${site.email}`}>{site.email}</a> with those
                photographs and your order number.
              </li>
              <li>Keep all packaging until the claim is resolved — carriers routinely ask to inspect it.</li>
            </ol>
            <p>
              We file and manage the insurance claim ourselves. You are refunded or made whole by us; you are never
              asked to wait on a carrier.
            </p>
            <p>
              A parcel showing no tracking movement for ten consecutive business days is treated as lost and refunded or
              replaced at your choice.
            </p>
          </>
        ),
      },
      {
        id: "collection",
        heading: "Local collection",
        body: (
          <p>
            You are welcome to collect in person from {fullAddress} during opening hours at no charge. Bring photo
            identification matching the order. See the{" "}
            <Link href="/contact#visit">contact page</Link> for a map, directions and parking information.
          </p>
        ),
      },
    ],
  },

  /* --------------------------------------------------- returns-and-refunds */
  "returns-and-refunds": {
    summary:
      "Our 14-day inspection window, what qualifies for a return, how refunds are issued, and the conditions that apply to graded slabs, raw books and service fees.",
    keywords: ["comic return policy", "graded comic refund", "14 day inspection"],
    sections: [
      {
        id: "window",
        heading: "The 14-day inspection window",
        body: (
          <>
            <p>
              Every purchase carries a <strong>14-day inspection window</strong> beginning on the date of delivery. If
              within that window you decide the book is not for you, for any reason at all, you may return it for a full
              refund of the purchase price.
            </p>
            <p>
              You do not have to justify a return inside the window. We would rather you were happy than that we kept a
              sale.
            </p>
          </>
        ),
      },
      {
        id: "condition",
        heading: "Condition on return",
        body: (
          <>
            <p>To qualify for a refund the book must come back exactly as it left us:</p>
            <ul>
              <li>
                <strong>Graded slabs</strong> must be in the same holder, with the certification label intact and the
                case unopened, uncracked and free of new scratches or scuffs.
              </li>
              <li>
                <strong>Raw books</strong> must be in the same bag and board, with no new handling wear, and must match
                the listing scans.
              </li>
              <li>All original packing materials and any accompanying documentation must be included.</li>
            </ul>
            <p>
              A cracked or swapped holder voids the return entirely. This is not negotiable — it is the only way we can
              stand behind the books we sell.
            </p>
          </>
        ),
      },
      {
        id: "how",
        heading: "How to start a return",
        body: (
          <>
            <ol>
              <li>
                Email <a href={`mailto:${site.email}`}>{site.email}</a> or use the{" "}
                <Link href="/support">help centre</Link> with your order number.
              </li>
              <li>We issue a return authorisation and a prepaid, insured label within one business day.</li>
              <li>Re-pack the book to the same standard it arrived in and drop it with the carrier.</li>
              <li>We inspect on arrival and refund within three business days of inspection.</li>
            </ol>
            <p>Do not send anything back without a return authorisation — unannounced parcels are not insured by us.</p>
          </>
        ),
      },
      {
        id: "cost",
        heading: "Who pays return shipping",
        body: (
          <>
            <ul>
              <li>
                <strong>Not as described, damaged, or our error</strong> — we pay return shipping and refund your
                original shipping charge in full.
              </li>
              <li>
                <strong>Change of mind</strong> — return shipping is deducted from the refund at our actual cost.
                Original outbound shipping is not refunded.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "refunds",
        heading: "Refunds",
        body: (
          <>
            <p>
              Refunds are issued to the original payment method. Card refunds typically appear within 5 – 10 business
              days depending on your issuer; wire refunds are sent within three business days of inspection.
            </p>
            <p>We do not charge restocking fees on any book, at any price point.</p>
          </>
        ),
      },
      {
        id: "exclusions",
        heading: "What cannot be returned",
        body: (
          <>
            <ul>
              <li>
                <strong>Completed services.</strong> Once a grading submission has been shipped to the grader, or a
                press cycle has begun, those fees are non-refundable. See the{" "}
                <Link href="/policies/grading-terms">grading service terms</Link>.
              </li>
              <li>
                <strong>Custom or commissioned work</strong>, including bespoke display framing.
              </li>
              <li>
                <strong>Books bought at a publicly announced final-sale price</strong>, which are marked as such on the
                listing before you buy.
              </li>
            </ul>
            <p>
              Nothing in this policy limits your statutory rights, and it does not affect our{" "}
              <Link href="/policies/authenticity-guarantee">authenticity guarantee</Link>, which never expires.
            </p>
          </>
        ),
      },
    ],
  },

  /* ------------------------------------------------ authenticity-guarantee */
  "authenticity-guarantee": {
    summary:
      "Our lifetime, transferable guarantee that every book we sell is genuine, correctly attributed and accurately described — and exactly what we do if it ever turns out otherwise.",
    keywords: ["comic authenticity guarantee", "counterfeit comic protection", "cgc verification"],
    sections: [
      {
        id: "promise",
        heading: "The promise",
        body: (
          <>
            <p>
              If any book you buy from {site.name} is ever demonstrated to be counterfeit, materially restored without
              disclosure, altered from its stated certification, or otherwise materially different from how we
              described it, we will refund the full purchase price.
            </p>
            <p>
              <strong>This guarantee has no expiry date.</strong> It applies whether you discover the issue next week or
              in fifteen years.
            </p>
          </>
        ),
      },
      {
        id: "covers",
        heading: "What it covers",
        body: (
          <ul>
            <li>Counterfeit or reproduction copies sold as originals.</li>
            <li>A certification number that does not match the grader&apos;s census record for that book.</li>
            <li>Undisclosed restoration, colour touch, trimming, tear seals or married pages on a raw book.</li>
            <li>A materially incorrect printing, edition, variant or signature attribution.</li>
            <li>A tampered, swapped or re-sealed holder that was not disclosed at the point of sale.</li>
          </ul>
        ),
      },
      {
        id: "excludes",
        heading: "What it does not cover",
        body: (
          <>
            <ul>
              <li>
                <strong>Disagreement with a grade.</strong> The numeric grade is the opinion of CGC or CBCS, not ours.
                Grading is a judgement, and a resubmission returning a different number is not a defect.
              </li>
              <li>
                <strong>Changes in market value.</strong> We guarantee what a book is, not what it will be worth.
              </li>
              <li>Damage that occurred after delivery, including cracking a slab.</li>
              <li>Defects that were explicitly disclosed in the listing at the time of purchase.</li>
            </ul>
          </>
        ),
      },
      {
        id: "verify",
        heading: "Verify before you buy",
        body: (
          <>
            <p>
              Every graded listing on this site publishes its certification number. Enter it on the grader&apos;s own
              verification page and confirm the book, the grade and the label type independently of us — before you
              spend a cent.
            </p>
            <p>
              We consider that step a feature, not an insult. If a dealer discourages you from verifying, walk away.
            </p>
          </>
        ),
      },
      {
        id: "claim",
        heading: "Making a claim",
        body: (
          <>
            <ol>
              <li>
                Contact us at <a href={`mailto:${site.email}`}>{site.email}</a> with the order number, certification
                number and the evidence you hold.
              </li>
              <li>
                We acknowledge within one business day and, where required, arrange for the book to be examined by an
                independent third party at our expense.
              </li>
              <li>
                Where a claim is upheld we refund the full purchase price, including original shipping and any grading
                fees you paid us on that book.
              </li>
            </ol>
          </>
        ),
      },
      {
        id: "transfer",
        heading: "Transferability",
        body: (
          <p>
            The guarantee transfers to a subsequent owner where the chain of ownership can be documented — a copy of the
            original invoice and a bill of sale is sufficient. Keep your invoice; it is part of the book&apos;s
            provenance.
          </p>
        ),
      },
    ],
  },

  /* -------------------------------------------------------- grading-terms */
  "grading-terms": {
    summary:
      "The terms governing grading submissions, pressing, restoration detection, appraisal, consignment and vault storage — including declared value, insurance, turnaround, fees and liability.",
    keywords: ["comic grading terms", "cgc submission terms", "comic pressing agreement"],
    sections: [
      {
        id: "scope",
        heading: "Scope",
        body: (
          <p>
            These terms apply to every service listed under <Link href="/services">services</Link>: grading submission,
            pressing and cleaning, restoration detection, appraisal and valuation, consignment and brokerage, and vault
            storage. Submitting books to us means you accept them.
          </p>
        ),
      },
      {
        id: "ownership",
        heading: "Ownership and authority",
        body: (
          <p>
            By submitting a book you confirm that you own it outright or are authorised to act for the owner, that it is
            not stolen, and that it is not subject to any lien, dispute or insurance claim. We report suspected stolen
            material to law enforcement and to the relevant collector registries.
          </p>
        ),
      },
      {
        id: "declared-value",
        heading: "Declared value and insurance",
        body: (
          <>
            <p>
              You set a declared value for each book before it leaves your hands. That figure determines the grading
              tier, the service fee and the limit of our liability.
            </p>
            <p>
              Books in our custody are covered under our vault policy up to the declared value.{" "}
              <strong>
                Under-declaring to save on fees caps what you can recover if something goes wrong.
              </strong>{" "}
              We would rather you declare honestly and pay the correct tier.
            </p>
            <p>
              Our maximum liability for any book, in any circumstance, is its declared value. We are not liable for
              consequential loss, lost profit or lost market opportunity.
            </p>
          </>
        ),
      },
      {
        id: "prescreen",
        heading: "Pre-screening and approval",
        body: (
          <>
            <p>
              Every submission is pre-screened before it goes anywhere. You receive a per-book grade estimate, a press
              recommendation and a fee breakdown, and nothing proceeds until you approve it in writing.
            </p>
            <p>
              A grade estimate is exactly that — an experienced opinion, not a promise. The final grade is set by the
              grading company alone. If a book returns below estimate we will explain why, but we cannot and do not
              guarantee a grade.
            </p>
          </>
        ),
      },
      {
        id: "turnaround",
        heading: "Turnaround",
        body: (
          <>
            <p>
              Published turnaround times are estimates based on the grading company&apos;s current queue and are outside
              our control. Queue times move, sometimes considerably, around major conventions and census events.
            </p>
            <p>
              Every stage of your submission is timestamped and visible on the{" "}
              <Link href="/track-order">submission tracker</Link>. We do not charge for delays we cause; we cannot
              refund delays the grading company causes.
            </p>
          </>
        ),
      },
      {
        id: "pressing",
        heading: "Pressing and cleaning",
        body: (
          <>
            <p>
              Pressing uses controlled heat, humidity and pressure to relax non-colour-breaking defects. Both CGC and
              CBCS treat it as conservation rather than restoration, and a pressed book carries no restoration label as
              a result.
            </p>
            <p>
              Pressing cannot repair colour-breaking creases, tears, missing pieces or brittleness, and it carries
              inherent risk on brittle Golden Age paper. We assess every book for press candidacy first and will decline
              work we think is unwise. Where you instruct us to proceed against that advice, you accept the risk.
            </p>
          </>
        ),
      },
      {
        id: "fees",
        heading: "Fees and payment",
        body: (
          <>
            <ul>
              <li>Service fees are quoted per book and confirmed before any work begins.</li>
              <li>
                Grading company fees, shipping and insurance are passed through at cost and itemised on your invoice.
              </li>
              <li>Fees are payable on return of the books, or deducted from proceeds on a consignment sale.</li>
              <li>
                Once a submission has shipped to the grader, or a press cycle has begun, those fees are{" "}
                <strong>non-refundable</strong> regardless of outcome.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "consignment",
        heading: "Consignment",
        body: (
          <p>
            Consigned books are listed at a reserve agreed with you in writing and remain your property until sold.
            Commission is deducted from the sale proceeds and the balance is remitted by wire within seven business days
            of the buyer&apos;s inspection window closing. You may withdraw an unsold consignment at any time with
            fourteen days&apos; notice.
          </p>
        ),
      },
      {
        id: "abandoned",
        heading: "Uncollected property",
        body: (
          <p>
            Books left with us for more than 180 days after we notify you that they are ready, and after three written
            attempts to reach you, may be sold to recover outstanding fees and storage costs. Any surplus is held for
            you. This is a last resort and has never yet been necessary.
          </p>
        ),
      },
    ],
  },

  /* --------------------------------------------------------------- privacy */
  privacy: {
    summary:
      "What personal data we collect, why we collect it, who we share it with, how long we keep it, and the rights you have over it — including CCPA and GDPR requests.",
    keywords: ["privacy policy", "comic store data protection", "ccpa gdpr"],
    sections: [
      {
        id: "who",
        heading: "Who we are",
        body: (
          <>
            <p>
              {site.legalName} is the data controller for personal information collected through this website and in our
              store.
            </p>
            {contactBlock}
          </>
        ),
      },
      {
        id: "collect",
        heading: "What we collect",
        body: (
          <>
            <ul>
              <li>
                <strong>Order information</strong> — name, billing and shipping address, email, phone number and order
                history.
              </li>
              <li>
                <strong>Service information</strong> — the books you submit, declared values, grade estimates and
                appraisal records.
              </li>
              <li>
                <strong>Account information</strong> — email address and a hashed password, if you create an account.
              </li>
              <li>
                <strong>Technical information</strong> — IP address, browser type and pages viewed, in aggregate.
              </li>
              <li>
                <strong>Correspondence</strong> — messages you send us and our replies.
              </li>
            </ul>
            <p>
              <strong>We never see or store your full card number.</strong> Card details are captured directly by our
              payment processor; we receive only the last four digits and an authorisation token.
            </p>
          </>
        ),
      },
      {
        id: "why",
        heading: "Why we use it",
        body: (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Purposes and legal bases for processing">
            <table>
              <thead>
                <tr>
                  <th>Purpose</th>
                  <th>Legal basis</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Fulfilling orders and providing services</td>
                  <td>Performance of a contract</td>
                </tr>
                <tr>
                  <td>Fraud prevention and security</td>
                  <td>Legitimate interest</td>
                </tr>
                <tr>
                  <td>Tax, accounting and insurance records</td>
                  <td>Legal obligation</td>
                </tr>
                <tr>
                  <td>Marketing email and new-arrival alerts</td>
                  <td>Consent — withdrawable at any time</td>
                </tr>
                <tr>
                  <td>Improving the site</td>
                  <td>Legitimate interest</td>
                </tr>
              </tbody>
            </table>
          </div>
        ),
      },
      {
        id: "sharing",
        heading: "Who we share it with",
        body: (
          <>
            <p>We share the minimum necessary with:</p>
            <ul>
              <li>Payment processors, to take payment.</li>
              <li>Carriers, to deliver your order.</li>
              <li>Grading companies, where you have asked us to submit your books.</li>
              <li>Our accountants and insurers, where legally required.</li>
            </ul>
            <p>
              <strong>We do not sell personal information, and we never have.</strong> We do not share your data with
              advertising networks or data brokers.
            </p>
          </>
        ),
      },
      {
        id: "retention",
        heading: "How long we keep it",
        body: (
          <ul>
            <li>Order and service records: seven years, for tax and insurance purposes.</li>
            <li>Account data: until you delete the account, then 30 days.</li>
            <li>Marketing consent records: until withdrawn, plus three years as proof of consent.</li>
            <li>Packing photographs: twelve months.</li>
          </ul>
        ),
      },
      {
        id: "rights",
        heading: "Your rights",
        body: (
          <>
            <p>Wherever you live, you may ask us to:</p>
            <ul>
              <li>Give you a copy of the personal data we hold about you.</li>
              <li>Correct anything inaccurate.</li>
              <li>Delete your data, subject to our legal retention obligations.</li>
              <li>Stop using it for marketing.</li>
              <li>Export it in a portable format.</li>
            </ul>
            <p>
              Email <a href={`mailto:${site.email}`}>{site.email}</a> with &ldquo;Data request&rdquo; in the subject
              line. We respond within 30 days and we do not charge for it. We will never penalise you for exercising
              these rights.
            </p>
          </>
        ),
      },
      {
        id: "children",
        heading: "Children",
        body: (
          <p>
            This site is not directed at children under 13 and we do not knowingly collect their personal information.
            If you believe a child has provided us data, contact us and we will delete it.
          </p>
        ),
      },
      {
        id: "changes",
        heading: "Changes to this policy",
        body: (
          <p>
            We will post any change here and update the date at the top. Material changes are also emailed to account
            holders at least 14 days before they take effect.
          </p>
        ),
      },
    ],
  },

  /* ------------------------------------------------------ terms-of-service */
  "terms-of-service": {
    summary:
      `The agreement between you and ${site.name} covering site use, pricing and listing accuracy, order acceptance, payment, intellectual property, liability and dispute resolution.`,
    keywords: ["terms of service", "comic store terms", "conditions of sale"],
    sections: [
      {
        id: "agreement",
        heading: "Agreement",
        body: (
          <p>
            By using this website or buying from {site.name} you agree to these terms. If you do not agree with them,
            please do not use the site. These terms are governed by the laws of the State of {site.address.regionName}.
          </p>
        ),
      },
      {
        id: "eligibility",
        heading: "Eligibility",
        body: (
          <p>
            You must be at least 18 years old, or have the consent of a parent or guardian, to place an order or open an
            account.
          </p>
        ),
      },
      {
        id: "listings",
        heading: "Listings, pricing and availability",
        body: (
          <>
            <p>
              We describe every book as accurately as we can, and we publish the certification number so you can verify
              it independently. Screen rendering of colour and gloss varies; scans are indicative.
            </p>
            <p>
              Most books in our inventory are a single copy. Adding a book to your cart does not reserve it — stock is
              committed only when payment completes. Where two orders race, the completed one wins and the other is
              refunded in full.
            </p>
            <p>
              In the rare event of an obvious pricing error, we reserve the right to cancel and refund the order rather
              than honour it. We will tell you why, promptly.
            </p>
          </>
        ),
      },
      {
        id: "orders",
        heading: "Order acceptance",
        body: (
          <p>
            Your order is an offer to buy. A contract forms when we send a dispatch confirmation, not when you receive
            an order acknowledgement. We may decline an order — for suspected fraud, a failed address check, an export
            restriction, or a pricing error — and will refund it in full.
          </p>
        ),
      },
      {
        id: "payment",
        heading: "Payment",
        body: (
          <p>
            Prices are in {site.currency} and exclude taxes and duties unless stated. Sales tax is applied where legally
            required. Wire transfer is available on orders over $5,000; goods ship on cleared funds. Layaway terms, where
            offered, are confirmed in writing before the first payment.
          </p>
        ),
      },
      {
        id: "services",
        heading: "Services",
        body: (
          <p>
            Grading, pressing, appraisal, consignment and storage are additionally governed by the{" "}
            <Link href="/policies/grading-terms">grading service terms</Link>, which prevail over these terms in the
            event of a conflict.
          </p>
        ),
      },
      {
        id: "accounts",
        heading: "Accounts",
        body: (
          <p>
            You are responsible for keeping your account credentials confidential and for activity under your account.
            Tell us immediately if you suspect unauthorised access. We may suspend an account we reasonably believe is
            compromised or being used fraudulently.
          </p>
        ),
      },
      {
        id: "ip",
        heading: "Intellectual property",
        body: (
          <p>
            The site design, text, photography and the {site.name} name and marks are ours and may not be reproduced
            commercially without written permission. Comic cover artwork and characters remain the property of their
            respective publishers and rights holders; they appear here for the purpose of identifying the goods offered
            for sale.
          </p>
        ),
      },
      {
        id: "conduct",
        heading: "Acceptable use",
        body: (
          <p>
            Do not scrape, resell or systematically copy our listings, attempt to interfere with the site, or use it to
            transact in stolen or counterfeit material. We may refuse service to anyone who does.
          </p>
        ),
      },
      {
        id: "liability",
        heading: "Limitation of liability",
        body: (
          <p>
            To the fullest extent permitted by law, our total liability arising out of any order or service is limited
            to the amount you paid for that order or service, or the declared value of the book in question, whichever
            applies. We are not liable for indirect or consequential loss, including lost profit or lost market
            opportunity. Nothing here limits liability for fraud, death or personal injury caused by our negligence, or
            anything else that cannot lawfully be limited.
          </p>
        ),
      },
      {
        id: "disputes",
        heading: "Disputes",
        body: (
          <p>
            Talk to us first — almost everything is resolved that way. If it cannot be, disputes are subject to the
            exclusive jurisdiction of the state and federal courts sitting in {site.address.city},{" "}
            {site.address.regionName}.
          </p>
        ),
      },
      {
        id: "contact",
        heading: "Contact",
        body: contactBlock,
      },
    ],
  },

  /* --------------------------------------------------------------- cookies */
  cookies: {
    summary:
      "The cookies and local storage this site uses, what each one does, how long it lasts, and how to control or clear them.",
    keywords: ["cookie policy", "website cookies", "local storage"],
    sections: [
      {
        id: "what",
        heading: "What we use",
        body: (
          <>
            <p>
              We keep this deliberately minimal. This site sets no advertising cookies, no analytics cookies and no
              cross-site tracking cookies of any kind. The only data kept in your browser is listed below.
            </p>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Browser storage we use">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Purpose</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>rarecomicscollectors.cart.v1</td>
                    <td>Local storage</td>
                    <td>Remembers your cart between visits</td>
                    <td>Until cleared</td>
                  </tr>
                  <tr>
                    <td>rcc_session</td>
                    <td>Local storage</td>
                    <td>Keeps you signed in to your account</td>
                    <td>Until you sign out</td>
                  </tr>
                  <tr>
                    <td>rcc_users, rcc_listings</td>
                    <td>Local storage</td>
                    <td>Your account profile and the listings you create in the seller dashboard</td>
                    <td>Until cleared</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ),
      },
      {
        id: "essential",
        heading: "Essential versus optional",
        body: (
          <p>
            Everything listed above is essential — the cart, sign-in and the seller dashboard cannot work without it.
            We set nothing optional. Because we run no advertising or profiling cookies, there is nothing here to sell
            or share.
          </p>
        ),
      },
      {
        id: "control",
        heading: "Controlling cookies",
        body: (
          <>
            <p>
              Every major browser lets you view, block and delete cookies and local storage from its privacy settings.
              Clearing local storage will empty your saved cart and sign you out.
            </p>
            <p>
              Blocking local storage will prevent the cart, sign-in and checkout from working. Everything else on the
              site, including the whole store and every policy page, will still work fine.
            </p>
          </>
        ),
      },
      {
        id: "third-party",
        heading: "Third-party content",
        body: (
          <p>
            The maps on our <Link href="/#visit">home page</Link> and <Link href="/contact#visit">contact page</Link>{" "}
            are embedded from Google Maps and are subject to Google&apos;s own privacy and cookie practices. They load
            lazily, so nothing is set until a map scrolls into view.
          </p>
        ),
      },
    ],
  },

  /* --------------------------------------------------------- accessibility */
  accessibility: {
    summary:
      "Our commitment to WCAG 2.2 Level AA, the specific measures built into this site, known limitations, and how to tell us when something does not work for you.",
    keywords: ["accessibility statement", "wcag 2.2 aa", "accessible comic store"],
    sections: [
      {
        id: "commitment",
        heading: "Our commitment",
        body: (
          <p>
            {site.name} aims to meet <strong>WCAG 2.2 Level AA</strong> across this website and to make our physical
            store equally usable. Accessibility is treated as a requirement of every change we ship, not a retrofit.
          </p>
        ),
      },
      {
        id: "measures",
        heading: "What we have built in",
        body: (
          <ul>
            <li>Semantic HTML landmarks, a logical heading order and a skip-to-content link on every page.</li>
            <li>Full keyboard operability, with a clearly visible focus ring on every interactive element.</li>
            <li>Text contrast meeting or exceeding 4.5:1, and interface contrast meeting 3:1.</li>
            <li>Labelled form controls with error messages tied programmatically to their field.</li>
            <li>Live region announcements when items are added to or removed from the cart.</li>
            <li>Descriptive alternative text on cover imagery, and decorative art hidden from assistive technology.</li>
            <li>Full respect for the reduced-motion system preference — animation is removed, not merely shortened.</li>
            <li>Layout that reflows without horizontal scrolling down to 320 pixels and up to 400% zoom.</li>
          </ul>
        ),
      },
      {
        id: "store",
        heading: "In the store",
        body: (
          <p>
            Our premises at {fullAddress} have step-free access from the lobby and a lift to the second floor. The
            ground-floor inspection room is used for all vault viewings so that no appointment requires stairs. Tell us
            what you need when you book and we will have it ready.
          </p>
        ),
      },
      {
        id: "limitations",
        heading: "Known limitations",
        body: (
          <>
            <p>We would rather name these than pretend they do not exist:</p>
            <ul>
              <li>
                The embedded Google map is third-party content and we cannot control its keyboard behaviour. Every page
                that shows a map also gives the full address as text and a plain link to directions.
              </li>
              <li>
                A small number of older listing scans lack detailed alternative descriptions. We are rewriting these as
                books are re-photographed.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "feedback",
        heading: "Tell us when we get it wrong",
        body: (
          <>
            <p>
              If any part of this site or our store is difficult to use, we want to hear about it — a report is more
              useful to us than a compliment.
            </p>
            {contactBlock}
            <p>
              We acknowledge accessibility reports within two business days and aim to resolve them within ten. If
              something blocks you from completing a purchase, call us and we will complete the order for you over the
              phone.
            </p>
          </>
        ),
      },
    ],
  },
};

export const policies: Policy[] = policyPages.map((p) => ({
  slug: p.slug,
  title: p.title,
  nav: p.nav,
  updated: EFFECTIVE,
  ...policyBodies[p.slug],
}));

export function getPolicy(slug: string): Policy | undefined {
  return policies.find((p) => p.slug === slug);
}

export const policyUpdated = EFFECTIVE;

export const formattedPolicyDate = new Date(`${EFFECTIVE}T00:00:00Z`).toLocaleDateString("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});
