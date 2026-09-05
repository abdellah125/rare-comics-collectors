import "server-only";
import { db } from "@/lib/db";
import { parseJsonObject } from "@/lib/json";
import type { Address } from "@/lib/commerce/pricing";

export const orderDetailInclude = {
  items: { include: { seller: { select: { id: true, slug: true, displayName: true, handlingDays: true, shipsFromCountry: true, countryCode: true, customsNote: true } } } },
  payments: { orderBy: { createdAt: "desc" as const } },
  refunds: { orderBy: { createdAt: "desc" as const } },
  shipments: { include: { carrier: true, events: { orderBy: { occurredAt: "desc" as const } }, items: { select: { id: true, title: true, qty: true } } }, orderBy: { createdAt: "asc" as const } },
  events: { orderBy: { createdAt: "asc" as const }, include: { actor: { select: { name: true } } } },
  notes: { orderBy: { createdAt: "desc" as const }, include: { author: { select: { name: true } } } },
  returns: { orderBy: { createdAt: "desc" as const } },
  disputes: { orderBy: { createdAt: "desc" as const } },
  reviews: { select: { orderItemId: true, rating: true } },
  user: { select: { id: true, name: true, email: true, status: true } },
  coupon: { select: { code: true } },
};

export async function getOrderForUser(number: string, userId: string) {
  return db.order.findFirst({ where: { number, userId }, include: orderDetailInclude });
}

export async function getOrderByNumber(number: string) {
  return db.order.findUnique({ where: { number }, include: orderDetailInclude });
}

export async function getOrderById(id: string) {
  return db.order.findUnique({ where: { id }, include: orderDetailInclude });
}

export function orderAddress(json: string | null): Address | null {
  return parseJsonObject<Address>(json);
}

export async function caseMessages(caseType: "return" | "dispute", caseId: string, opts: { includeInternal: boolean }) {
  return db.caseMessage.findMany({
    where: { caseType, caseId, ...(opts.includeInternal ? {} : { isInternal: false }) },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { name: true } } },
  });
}

export type ThreadMessageRow = { id: string; authorRole: string; body: string; createdAt: Date; isInternal?: boolean; attachmentsJson?: string | null; author: { name: string } | null };

/** Shape CaseMessage rows for the shared CaseThread component. */
export function toThreadMessages(rows: ThreadMessageRow[]) {
  return rows.map((m) => {
    let attachments: string[] = [];
    try {
      attachments = m.attachmentsJson ? (JSON.parse(m.attachmentsJson) as string[]) : [];
    } catch {
      attachments = [];
    }
    return { id: m.id, authorRole: m.authorRole, authorName: m.author?.name ?? (m.authorRole === "admin" ? "Marketplace" : m.authorRole), body: m.body, createdAt: m.createdAt.toISOString(), attachments, isInternal: m.isInternal ?? false };
  });
}
