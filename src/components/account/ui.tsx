import type { ReactNode } from "react";

export function PageHeader({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-950 sm:text-3xl">{title}</h1>
        {lead && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-600">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, description, children, className = "", tone = "white" }: { title?: string; description?: ReactNode; children: ReactNode; className?: string; tone?: "white" | "muted" | "danger" }) {
  const tones = { white: "border-ink-200 bg-white", muted: "border-ink-200 bg-ink-50", danger: "border-rose-200 bg-rose-50/40" } as const;
  return (
    <section className={`rounded-xl border p-6 ${tones[tone]} ${className}`}>
      {title && <h2 className="font-display text-lg font-semibold text-ink-950">{title}</h2>}
      {description && <p className="mt-1 text-sm leading-relaxed text-ink-600">{description}</p>}
      <div className={title || description ? "mt-5" : ""}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50 px-6 py-14 text-center">
      <p className="font-display text-lg font-semibold text-ink-950">{title}</p>
      {body && <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-3 text-sm">
      {items.map((i) => (
        <div key={i.label} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
          <dt className="text-ink-600">{i.label}</dt>
          <dd className="font-medium text-ink-950">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
