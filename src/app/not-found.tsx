import Link from "next/link";

import { ButtonLink, Container } from "@/components/ui";
import { inventoryCount } from "@/lib/catalog";
import { primaryNav } from "@/lib/nav";

export default function NotFound() {
  const roundedCount = (Math.floor(inventoryCount / 100) * 100).toLocaleString("en-US");
  return (
    <Container className="flex min-h-[65vh] flex-col items-center justify-center py-20 text-center">
      <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.2em] text-brand-700">Error 404</p>
      <h1 className="mt-5 font-display text-[clamp(2.2rem,5vw,3.5rem)] font-semibold leading-[1.08] text-ink-950">
        This one&apos;s not in the vault
      </h1>
      <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-ink-600">
        The page you were after has been moved, sold, or never existed. Try the store — there are over {roundedCount}{" "}
        books in there that definitely do.
      </p>

      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/store" variant="primary" size="lg">
          Browse the store
        </ButtonLink>
        <ButtonLink href="/" variant="outline" size="lg">
          Back to home
        </ButtonLink>
      </div>

      <div className="mt-14 w-full max-w-2xl border-t border-ink-200 pt-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Popular destinations</p>
        <ul className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2.5 text-[15px]">
          {[...primaryNav, { label: "FAQ", href: "/faq" }, { label: "Support", href: "/support" }].map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="font-medium text-ink-700 underline-offset-4 hover:text-brand-700 hover:underline">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}
