import Link from "next/link";
import { site } from "@/lib/site";

export function Logo({ tone = "light", className = "" }: { tone?: "light" | "dark"; className?: string }) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center ${className}`}
      aria-label={`${site.name} — home`}
    >
      <span
        className={`font-logo text-[18px] font-black uppercase tracking-[-0.03em] transition-opacity duration-150 group-hover:opacity-75 ${
          tone === "dark" ? "text-white" : "text-brand-600"
        }`}
      >
        rarecomiccollectors
      </span>
    </Link>
  );
}
