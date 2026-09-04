import "server-only";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { createPayoutForSeller, sellerBalance } from "@/lib/finance/ledger";
import { notifyUser } from "@/lib/notifications";
import { formatMoney } from "@/lib/money";
import { audit } from "@/lib/audit";

function nextRunFor(schedule: string, from = new Date()): Date {
  const d = new Date(from);
  d.setUTCHours(9, 0, 0, 0);
  if (schedule === "weekly") d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7)); // next Monday
  else if (schedule === "biweekly") d.setUTCDate(d.getUTCDate() + 14);
  else if (schedule === "monthly") {
    d.setUTCMonth(d.getUTCMonth() + 1, 1);
  } else d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/**
 * Job: for every approved seller with a cleared balance above the minimum,
 * create a scheduled payout. Sellers on a "manual" schedule are skipped and
 * handled from the admin.
 */
export async function scheduleDuePayouts(): Promise<{ created: number; skipped: number }> {
  const settings = await getSettings();
  const globalSchedule = settings["payouts.schedule"];
  const sellers = await db.sellerProfile.findMany({ where: { status: "approved" }, select: { id: true, minPayout: true, payoutSchedule: true, payoutMethod: true } });
  let created = 0;
  let skipped = 0;
  for (const s of sellers) {
    const schedule = s.payoutSchedule ?? globalSchedule;
    if (schedule === "manual" || !s.payoutMethod) {
      skipped += 1;
      continue;
    }
    const open = await db.payout.count({ where: { sellerId: s.id, status: { in: ["pending", "scheduled", "processing"] } } });
    if (open > 0) {
      skipped += 1;
      continue;
    }
    const bal = await sellerBalance(s.id);
    const min = Math.max(s.minPayout ?? 0, settings["payouts.minAmount"]);
    if (bal.available < min) {
      skipped += 1;
      continue;
    }
    const payout = await createPayoutForSeller(s.id, { status: "scheduled", scheduledFor: nextRunFor(schedule), note: `Automatic ${schedule} payout` });
    if (payout) created += 1;
  }
  return { created, skipped };
}

export async function markPayoutPaid(payoutId: string, reference: string, actor: { id: string; email: string }) {
  const payout = await db.payout.update({
    where: { id: payoutId },
    data: { status: "paid", paidAt: new Date(), reference },
    include: { seller: { select: { userId: true, displayName: true } } },
  });
  await audit({ actor: { ...actor, type: "admin" }, action: "payout.paid", targetType: "payout", targetId: payoutId, summary: `Payout ${formatMoney(payout.amount)} to ${payout.seller.displayName} marked paid (${reference})` });
  await notifyUser(payout.seller.userId, {
    type: "payout.paid",
    title: `Payout of ${formatMoney(payout.amount)} sent`,
    body: `Reference ${reference}`,
    href: "/dashboard/balance",
    category: "sellerAlerts",
    email: { templateKey: "payout_paid", vars: { amount: formatMoney(payout.amount), destination: payout.destinationMasked ?? payout.method ?? "your payout method", reference } },
  });
  return payout;
}
