"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { notifyUser } from "@/lib/notifications";
import { recomputeSellerStats } from "@/lib/orders/lifecycle";
import { failState, okState, type ActionState } from "@/lib/validation";

type ReviewStatus = "published" | "hidden" | "removed" | "pending";

async function applyReviewStatus(ids: string[], status: ReviewStatus, adminId: string, note?: string) {
  const reviews = await db.review.findMany({ where: { id: { in: ids } }, select: { id: true, sellerId: true, userId: true, productId: true, product: { select: { slug: true, title: true } } } });
  await db.review.updateMany({ where: { id: { in: ids } }, data: { status, moderatedById: adminId, moderationNote: note?.trim() || null } });
  const sellerIds = new Set(reviews.map((r) => r.sellerId).filter((s): s is string => Boolean(s)));
  for (const sid of sellerIds) await recomputeSellerStats(sid);
  for (const r of reviews) {
    revalidatePath(r.product ? `/store/${r.product.slug}` : "/");
    if (status === "removed" || status === "hidden") {
      await notifyUser(r.userId, { type: "review.moderated", title: `Your review${r.product ? ` of ${r.product.title}` : ""} was ${status}`, body: note || "It didn't meet the review guidelines.", href: "/account/reviews", category: "security" });
    }
  }
  return reviews.length;
}

export async function moderateReviewAction(id: string, status: ReviewStatus, note?: string): Promise<ActionState> {
  return runAdmin("reviews.manage", async (admin) => {
    const n = await applyReviewStatus([id], status, admin.id, note);
    if (n === 0) return failState("Review not found.");
    await audit({ actor: actorOf(admin), action: `review.${status}`, targetType: "review", targetId: id, summary: `Review ${status}${note ? `: ${note}` : ""}` });
    revalidatePath("/admin/reviews");
    return okState(undefined, `Review ${status}.`);
  });
}

export async function bulkReviewsAction(actionId: string, ids: string[]): Promise<ActionState> {
  return runAdmin("reviews.manage", async (admin) => {
    const status = ({ publish: "published", hide: "hidden", remove: "removed" } as Record<string, ReviewStatus>)[actionId];
    if (!status) return failState("Unknown action.");
    const n = await applyReviewStatus(ids.slice(0, 200), status, admin.id);
    await audit({ actor: actorOf(admin), action: `review.bulk.${status}`, targetType: "review", summary: `${n} reviews ${status}`, after: ids });
    revalidatePath("/admin/reviews");
    return okState(undefined, `${n} review${n === 1 ? "" : "s"} ${status}.`);
  });
}

export async function clearReviewReportsAction(id: string): Promise<ActionState> {
  return runAdmin("reviews.manage", async (admin) => {
    await db.review.update({ where: { id }, data: { reportCount: 0, spamScore: 0 } });
    await db.report.updateMany({ where: { targetType: "review", targetId: id, status: { in: ["open", "reviewing"] } }, data: { status: "dismissed", handledById: admin.id, resolution: "Review kept after moderation" } });
    await audit({ actor: actorOf(admin), action: "review.clear_reports", targetType: "review", targetId: id, summary: "Review reports cleared" });
    revalidatePath("/admin/reviews");
    return okState(undefined, "Reports cleared.");
  });
}

export async function removeSellerReplyAction(id: string): Promise<ActionState> {
  return runAdmin("reviews.manage", async (admin) => {
    await db.review.update({ where: { id }, data: { sellerReply: null, sellerRepliedAt: null } });
    await audit({ actor: actorOf(admin), action: "review.remove_reply", targetType: "review", targetId: id, summary: "Seller reply removed" });
    revalidatePath("/admin/reviews");
    return okState(undefined, "Seller reply removed.");
  });
}
