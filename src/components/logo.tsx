import Link from "next/link";
import { site } from "@/lib/site";

export function Logo({ tone = "light", className = "" }: { tone?: "light" | "dark"; className?: string }) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-2.5 ${className}`}
      aria-label={`${site.name} — home`}
    >
      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 shadow-plate transition-transform duration-200 group-hover:-translate-y-0.5">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 3l7.5 3v5.2c0 4.6-3.1 8.4-7.5 9.8-4.4-1.4-7.5-5.2-7.5-9.8V6L12 3z" />
          <path d="M9.2 12.1l2 2 3.6-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-[17px] font-bold tracking-tight text-brand-600">
          Rarecomic<span className="text-brand-800">collectors</span>
        </span>
        <span
          className={`mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] ${
            tone === "dark" ? "text-ink-400" : "text-ink-500"
          }`}
        >
          Comics · Grading · Services
        </span>
      </span>
    </Link>
  );
}
