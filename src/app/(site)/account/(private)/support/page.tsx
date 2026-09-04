import type { Metadata } from "next";
import Link from "next/link";
import { TicketForm } from "@/components/support/ticket-form";
import { EmptyState, PageHeader, Panel } from "@/components/account/ui";
import { Badge } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { statusLabel, statusTone } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Support tickets", description: "Your conversations with our support team.", path: "/account/support", noIndex: true });

export default async function SupportTicketsPage({ searchParams }: PageProps<"/account/support">) {
  const user = await requireUser({ next: "/account/support" });
  const sp = await searchParams;
  const tickets = await db.ticket.findMany({ where: { userId: user.id }, orderBy: { lastMessageAt: "desc" }, take: 50, select: { id: true, number: true, subject: true, status: true, category: true, lastMessageAt: true } });
  const tone = (s: string) => (statusTone(s) === "success" ? "brand" : statusTone(s) === "warning" ? "gold" : "neutral");
  return (
    <div className="grid gap-8">
      <PageHeader title="Support" lead="Open a ticket for anything about an order, a listing or your account. We reply within one business day." />
      <Panel title="New ticket">
        <TicketForm signedIn defaultOrder={typeof sp.order === "string" ? sp.order : undefined} compact />
      </Panel>
      <Panel title="Your tickets">
        {tickets.length === 0 ? (
          <EmptyState title="No tickets yet" />
        ) : (
          <ul className="divide-y divide-ink-100 text-sm">
            {tickets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link href={`/account/support/${t.number}`} className="font-semibold text-ink-950 hover:text-brand-700">
                    {t.subject}
                  </Link>
                  <p className="text-[13px] text-ink-600">
                    <span className="font-mono">{t.number}</span> · {statusLabel(t.category)} · updated {formatDateTime(t.lastMessageAt, { timeZone: user.timezone })}
                  </p>
                </div>
                <Badge tone={tone(t.status)}>{statusLabel(t.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
