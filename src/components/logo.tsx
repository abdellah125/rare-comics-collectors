import Link from "next/link";
import { site } from "@/lib/site";

export type Brand = { name: string; logoUrl: string | null };

export function Logo({ tone = "light", className = "", brand }: { tone?: "light" | "dark"; className?: string; brand?: Brand }) {
  const name = brand?.name || site.name;
  if (brand?.logoUrl) {
    return (
      <Link href="/" className={`group inline-flex items-center ${className}`} aria-label={`${name} — home`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoUrl} alt={name} className="h-8 w-auto max-w-[180px] object-contain transition-opacity duration-150 group-hover:opacity-75 sm:h-9" />
      </Link>
    );
  }
  return (
    <Link
      href="/"
      className={`group inline-flex items-center ${className}`}
      aria-label={`${name} — home`}
    >
      {/* Orbitron is wide: scale the wordmark with the viewport so it never pushes the header past 320px. */}
      <span
        className={`whitespace-nowrap font-logo text-[clamp(11px,3.9vw,18px)] font-black uppercase tracking-[-0.03em] transition-opacity duration-150 group-hover:opacity-75 ${
          tone === "dark" ? "text-white" : "text-brand-600"
        }`}
      >
        rarecomicscollectors
      </span>
    </Link>
  );
}
