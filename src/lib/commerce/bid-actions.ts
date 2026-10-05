"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { getCurrentUser } from "@/lib/auth/session";
import { auctionEnded, parseBid } from "@/lib/commerce/bids";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { queueRawEmail, queueTemplateEmail } from "@/lib/mail";
import { formatMoney } from "@/lib/money";
import { notifyAdmins } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";
import { getSettings } from "@/lib/settings";
import { failState, fieldErrors, formToObject, okState, type ActionState } from "@/lib/validation";

const BidSchema = z.object({
  slug: z.string().min(1).max(160),
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.email("Enter a valid email").trim().toLowerCase(),
  phone: z.string().trim().max(40).optional(),
  amount: z.string().trim().min(1, "Enter your bid").max(20),
  website: z.string().max(0).optional(),
});

/**
 * Places a bid on a product sold by bidding. Nothing is charged: the bid is recorded, the
 * product's current bid moves up, earlier lower bids are marked outbid and the store is told.
 */
export async function placeBidAction(_prev: ActionState<{ amount: string }> | undefined, formData: FormData): Promise<ActionState<{ amount: string }>> {
  const parsed = BidSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    // The hidden field is filled only by bots.
    if (String(formData.get("website") ?? "") !== "") return okState({ amount: "" }, "Bid received.");
    return failState("Check the highlighted fields.", fieldErrors(parsed.error));
  }
  const d = parsed.data;
  const meta = await requestMeta();
  const limiter = await rateLimit(`bid:${meta.ip ?? "unknown"}`, 20, 60 * 60_000);
  if (!limiter.ok) return failState("Too many bids from this network. Please try again later.");
  const user = await getCurrentUser();

  const product = await db.product.findFirst({ where: { slug: d.slug, status: "published", deletedAt: null }, select: { id: true, slug: true, title: true, issue: true, price: true, stock: true, saleType: true, auctionEndsAt: true } });
  if (!product || product.saleType !== "auction") return failState("This product is not open for bids.");
  if (product.stock <= 0) return failState("Bidding on this product has closed.");
  if (auctionEnded(product.auctionEndsAt)) return failState("Bidding on this product has ended.");
  const bid = parseBid(d.amount, product.price);
  if (!bid.ok) return failState(bid.message, { amount: bid.message });

  // The claim: only a bid above the current one moves the price, so two bids at once cannot both win.
  const claimed = await db.product.updateMany({ where: { id: product.id, price: { lt: bid.amount }, stock: { gt: 0 }, saleType: "auction" }, data: { price: bid.amount, bidCount: { increment: 1 } } });
  if (claimed.count === 0) return failState("Someone has just placed a higher bid. Refresh the page to see the current bid.");
  await db.$transaction([
    db.bid.updateMany({ where: { productId: product.id, status: "active" }, data: { status: "outbid" } }),
    db.bid.create({ data: { productId: product.id, userId: user?.id ?? null, name: d.name, email: d.email, phone: d.phone || null, amount: bid.amount, ipAddress: meta.ip } }),
  ]);

  const name = `${product.title} ${product.issue}`.trim();
  const amount = formatMoney(bid.amount);
  const settings = await getSettings();
  await queueTemplateEmail("bid_received", d.email, { name: d.name, product: name, amount, productUrl: `${env.siteUrl}/store/${product.slug}` }, { userId: user?.id ?? null });
  await notifyAdmins("orders.manage", { type: "bid.placed", title: `New bid: ${amount} on ${name}`, body: `${d.name} · ${d.email}`, href: "/admin/bids" });
  await queueRawEmail({
    to: settings["marketplace.supportEmail"],
    subject: `New bid: ${amount} on ${name}`,
    body: [`${d.name} (${d.email}${d.phone ? `, ${d.phone}` : ""}) bid ${amount} on ${name}.`, "", `Previous bid: ${formatMoney(product.price)}`, `Listing: ${env.siteUrl}/store/${product.slug}`, `All bids: ${env.siteUrl}/admin/bids`, "", "Nothing has been charged. Accept or decline the bid in the admin."].join("\n"),
    meta: { kind: "bid", productId: product.id },
  });
  revalidatePath(`/store/${product.slug}`);
  return okState({ amount }, `Your bid of ${amount} has been received. You are the highest bidder for now. Nothing has been charged: we will contact you at ${d.email} if your bid wins.`);
}

/** Admin: accept or decline a bid. Accepting closes the bidding on that product and tells the bidder. */
export async function decideBidAction(bidId: string, decision: "accepted" | "rejected"): Promise<ActionState> {
  return runAdmin("orders.manage", async (admin) => {
    const bid = await db.bid.findUnique({ where: { id: bidId }, include: { product: { select: { id: true, slug: true, title: true, issue: true } } } });
    if (!bid) return failState("Bid not found.");
    if (["accepted", "rejected"].includes(bid.status)) return failState(`This bid is already ${bid.status}.`);
    const name = `${bid.product.title} ${bid.product.issue}`.trim();
    if (decision === "accepted") {
      await db.$transaction([
        db.bid.update({ where: { id: bid.id }, data: { status: "accepted" } }),
        db.bid.updateMany({ where: { productId: bid.productId, id: { not: bid.id }, status: { in: ["active", "outbid"] } }, data: { status: "outbid" } }),
        // Bidding is over: the product stops taking bids. It is not marked paid; that happens through an order or invoice.
        db.product.update({ where: { id: bid.productId }, data: { stock: 0 } }),
      ]);
      await queueTemplateEmail("bid_accepted", bid.email, { name: bid.name, product: name, amount: formatMoney(bid.amount) }, { userId: bid.userId });
    } else {
      await db.bid.update({ where: { id: bid.id }, data: { status: "rejected" } });
    }
    await audit({ actor: actorOf(admin), action: `bid.${decision}`, targetType: "bid", targetId: bid.id, summary: `Bid of ${formatMoney(bid.amount)} on ${name} by ${bid.email} ${decision}` });
    revalidatePath("/admin/bids");
    revalidatePath(`/store/${bid.product.slug}`);
    return okState(undefined, decision === "accepted" ? "Bid accepted. Bidding on the product is closed and the bidder has been emailed; arrange payment with them." : "Bid declined.");
  });
}
