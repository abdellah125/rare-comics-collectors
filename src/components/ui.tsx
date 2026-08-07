import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { StarIcon } from "@/components/icons";

/* ---------------------------------------------------------------- buttons */

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55";

export const buttonStyles = {
  primary: `${buttonBase} bg-brand-600 text-white shadow-plate hover:bg-brand-700 active:bg-brand-800`,
  dark: `${buttonBase} bg-ink-950 text-white shadow-plate hover:bg-ink-800 active:bg-ink-900`,
  gold: `${buttonBase} bg-gold-400 text-ink-950 shadow-plate hover:bg-gold-300 active:bg-gold-500`,
  outline: `${buttonBase} border border-ink-300 bg-white text-ink-900 hover:border-ink-400 hover:bg-ink-50`,
  ghostLight: `${buttonBase} border border-white/25 bg-white/5 text-white hover:bg-white/15`,
  quiet: `${buttonBase} text-ink-600 hover:bg-ink-100 hover:text-ink-950`,
} as const;

export const buttonSizes = {
  sm: "h-9 px-3.5 text-[13px]",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-[15px]",
} as const;

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & {
  variant?: keyof typeof buttonStyles;
  size?: keyof typeof buttonSizes;
}) {
  return <Link className={`${buttonStyles[variant]} ${buttonSizes[size]} ${className}`} {...props} />;
}

/* --------------------------------------------------------------- sections */

export function Section({
  children,
  className = "",
  id,
  tone = "white",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: "white" | "muted" | "dark";
}) {
  const tones = {
    white: "bg-white",
    muted: "bg-ink-50",
    dark: "bg-ink-950 text-white",
  } as const;
  return (
    <section id={id} className={`${tones[tone]} ${className}`}>
      <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 lg:py-24">{children}</div>
    </section>
  );
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

export function Eyebrow({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "dark" }) {
  return (
    <p
      className={`text-[11px] font-bold uppercase tracking-[0.2em] ${
        tone === "dark" ? "text-brand-300" : "text-brand-700"
      }`}
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  tone = "light",
  align = "left",
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  tone?: "light" | "dark";
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={`${align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"} ${className}`}>
      {eyebrow && <Eyebrow tone={tone}>{eyebrow}</Eyebrow>}
      <h2
        className={`mt-3 font-display text-3xl font-semibold leading-[1.15] sm:text-4xl ${
          tone === "dark" ? "text-white" : "text-ink-950"
        }`}
      >
        {title}
      </h2>
      {lead && (
        <p className={`mt-4 text-[15px] leading-relaxed sm:text-base ${tone === "dark" ? "text-ink-300" : "text-ink-600"}`}>
          {lead}
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- badges */

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "gold" | "dark" | "sale";
  className?: string;
}) {
  const tones = {
    neutral: "bg-ink-100 text-ink-700",
    brand: "bg-brand-50 text-brand-800 ring-1 ring-brand-200",
    gold: "bg-gold-400/15 text-gold-600 ring-1 ring-gold-400/40",
    dark: "bg-ink-950 text-white",
    sale: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Stars({ rating, count }: { rating: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`Rated ${rating} out of 5`}>
      <span className="flex text-gold-400">
        {[1, 2, 3, 4, 5].map((i) => (
          <StarIcon key={i} className={`h-3.5 w-3.5 ${i <= Math.round(rating) ? "" : "text-ink-200"}`} />
        ))}
      </span>
      {count !== undefined && <span className="text-xs text-ink-500">({count})</span>}
    </span>
  );
}

/* ------------------------------------------------------------ breadcrumbs */

export type Crumb = { name: string; href: string };

export function Breadcrumbs({ items, tone = "light" }: { items: Crumb[]; tone?: "light" | "dark" }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className={`flex flex-wrap items-center gap-1.5 text-[13px] ${tone === "dark" ? "text-ink-400" : "text-ink-500"}`}>
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.href}-${c.name}`} className="flex items-center gap-1.5">
              {last ? (
                <span aria-current="page" className={tone === "dark" ? "text-ink-200" : "text-ink-800"}>
                  {c.name}
                </span>
              ) : (
                <Link href={c.href} className="hover:text-brand-700 hover:underline">
                  {c.name}
                </Link>
              )}
              {!last && <span aria-hidden>/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
