import Link from "next/link";
import type { ReactNode } from "react";
import { statusLabel, statusTone } from "@/lib/domain";

export function AdminPageHeader({ title, lead, actions, crumbs }: { title: string; lead?: ReactNode; actions?: ReactNode; crumbs?: { label: string; href?: string }[] }) {
  return (
    <div className="mb-6">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 text-[12px] text-ink-500">
          <ol className="flex flex-wrap items-center gap-1.5">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                {c.href ? (
                  <Link href={c.href} className="hover:text-brand-700 hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-ink-800">{c.label}</span>
                )}
                {i < crumbs.length - 1 && <span aria-hidden>/</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">{title}</h1>
          {lead && <p className="mt-1 max-w-3xl text-sm text-ink-600">{lead}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, description, children, className = "", actions, id }: { title?: string; description?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode; id?: string }) {
  return (
    <section id={id} className={`rounded-xl border border-ink-200 bg-white ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink-950">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-ink-600">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const TONES = {
  success: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  danger: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
  neutral: "bg-ink-100 text-ink-700",
  brand: "bg-brand-50 text-brand-800 ring-1 ring-brand-200",
  gold: "bg-gold-400/15 text-gold-800 ring-1 ring-gold-400/40",
  dark: "bg-ink-950 text-white",
  sale: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
} as const;

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = statusTone(status);
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TONES[tone]}`}>{label ?? statusLabel(status)}</span>;
}

export function Tone({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TONES[tone]}`}>{children}</span>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-ink-950">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Kv({ items, className = "" }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={`grid gap-2.5 text-sm ${className}`}>
      {items.map((i) => (
        <div key={i.label} className="grid grid-cols-[130px_1fr] gap-3">
          <dt className="text-ink-500">{i.label}</dt>
          <dd className="min-w-0 break-words text-ink-900">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const adminButton = {
  primary: "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-[13px] font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50",
  dark: "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ink-950 px-3.5 text-[13px] font-semibold text-white hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50",
  outline: "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-ink-300 bg-white px-3.5 text-[13px] font-semibold text-ink-800 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50",
  danger: "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3.5 text-[13px] font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50",
  quiet: "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-ink-700 hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-50",
  sm: "!h-8 !px-2.5 !text-[12px]",
} as const;

export const adminInput = "h-9 w-full rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 disabled:bg-ink-100";
export const adminSelect = "h-9 w-full rounded-lg border border-ink-300 bg-white px-2.5 text-sm text-ink-900 focus:border-brand-500 disabled:bg-ink-100";
export const adminTextarea = "w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 disabled:bg-ink-100";

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={`block text-[13px] ${className}`}>
      <span className="mb-1 block font-medium text-ink-800">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ink-500">{hint}</span>}
    </label>
  );
}

/** Horizontal filter row: a GET form that keeps the list URL shareable. */
export function FilterBar({ action, children, reset }: { action: string; children: ReactNode; reset?: boolean }) {
  return (
    <form action={action} method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-ink-200 bg-white p-3">
      {children}
      <button type="submit" className={adminButton.dark}>
        Apply
      </button>
      {reset && (
        <Link href={action} className={adminButton.quiet}>
          Reset
        </Link>
      )}
    </form>
  );
}

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-ink-200 bg-white ${className}`}>
      <table className="w-full min-w-[640px] text-[13px]">{children}</table>
    </div>
  );
}

export function Th({ children, className = "", align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" }) {
  return <th scope="col" className={`whitespace-nowrap border-b border-ink-200 bg-ink-50 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500 ${align === "right" ? "text-right" : "text-left"} ${className}`}>{children}</th>;
}

export function Td({ children, className = "", align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" }) {
  return <td className={`border-b border-ink-100 px-3 py-2.5 align-middle ${align === "right" ? "text-right tabular-nums" : ""} ${className}`}>{children}</td>;
}

/** Plain anchor for CSV/file downloads — route handlers can't be client-navigated with <Link>. */
export function DownloadLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return <a href={href} className={className}>{children}</a>;
}
