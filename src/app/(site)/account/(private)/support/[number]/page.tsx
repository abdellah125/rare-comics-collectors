import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TicketThread } from "@/components/support/ticket-thread";
import { PageHeader, Panel } from "@/components/account/ui";
import { Badge } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Support ticket", description: "Ticket conversation.", path: "/account/support", noIndex: true });

export default async function TicketPage({ params }: PageProps<"/account/support/[number]">) {
  const { number } = await params;
  const user = await requireUser({ next: `/account/support/${number}` });
  const ticket = await db.ticket.findFirst({
    where: { number, userId: user.id },
    include: { messages: { where: { isInternal: false }, orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } }, order: { select: { number: true } } },
  });
  if (!ticket) notFound();
  return (
    <div className="grid gap-8">
      <PageHeader
        title={ticket.subject}
        lead={
          <>
            <span className="font-mono">{ticket.number}</span> · {statusLabel(ticket.category)}
            {ticket.order && (
              <>
                {" "}
                · Order{" "}
                <Link href={`/account/orders/${ticket.order.number}`} className="text-brand-700 hover:underline">
                  {ticket.order.number}
                </Link>
              </>
            )}
          </>
        }
        actions={<Badge tone={ticket.status === "resolved" || ticket.status === "closed" ? "neutral" : "brand"}>{statusLabel(ticket.status)}</Badge>}
      />
      <Panel>
        <TicketThread
          ticketId={ticket.id}
          status={ticket.status}
          messages={ticket.messages.map((m) => ({ id: m.id, authorType: m.authorType, authorName: m.author?.name ?? (m.authorType === "agent" ? "Support" : m.authorType === "system" ? "System" : "You"), body: m.body, createdAt: m.createdAt.toISOString(), attachments: JSON.parse(m.attachmentsJson) as string[] }))}
        />
      </Panel>
    </div>
  );
}
