import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";

async function unique(make: () => string, exists: (v: string) => Promise<boolean>): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const v = make();
    if (!(await exists(v))) return v;
  }
  throw new Error("Could not allocate a unique reference number");
}

/** RCC-2026-482910 — readable, unguessable enough combined with the email check on tracking. */
export function newOrderNumber() {
  return unique(
    () => `RCC-${new Date().getFullYear()}-${randomInt(100_000, 999_999)}`,
    async (n) => Boolean(await db.order.findUnique({ where: { number: n }, select: { id: true } })),
  );
}

export function newTicketNumber() {
  return unique(
    () => `TCK-${randomInt(100_000, 999_999)}`,
    async (n) => Boolean(await db.ticket.findUnique({ where: { number: n }, select: { id: true } })),
  );
}
