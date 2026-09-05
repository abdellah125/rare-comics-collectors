"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { notifyAdmins } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";
import { REPORT_TYPES } from "@/lib/domain";
import { failState, fieldErrors, formToObject, okState, zEmail, zId, zTrimmed, type ActionState } from "@/lib/validation";

const ReportSchema = z.object({
  targetType: z.enum(REPORT_TYPES),
  targetId: zId,
  reason: zTrimmed(120).min(3, { error: "Choose a reason" }),
  details: zTrimmed(3000).optional(),
  email: zEmail.optional(),
  website: z.string().max(0).optional(),
});

/** Anyone can report a listing, seller, user or review; reports feed the moderation queue. */
export async function createReportAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const parsed = ReportSchema.safeParse(formToObject(formData));
  if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
  if (parsed.data.website) return okState(undefined, "Thanks for the report.");
  const meta = await requestMeta();
  const limiter = rateLimit(`report:${meta.ip ?? "unknown"}`, 5, 60 * 60_000);
  if (!limiter.ok) return failState("Too many reports from this network. Try again later.");
  const user = await getCurrentUser();
  const { targetType, targetId } = parsed.data;
  const exists =
    targetType === "listing"
      ? await db.product.findUnique({ where: { id: targetId }, select: { id: true } })
      : targetType === "seller"
        ? await db.sellerProfile.findUnique({ where: { id: targetId }, select: { id: true } })
        : targetType === "review"
          ? await db.review.findUnique({ where: { id: targetId }, select: { id: true } })
          : await db.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!exists) return failState("That item no longer exists.");
  const duplicate = user ? await db.report.findFirst({ where: { targetType, targetId, reporterId: user.id, status: { in: ["open", "reviewing"] } } }) : null;
  if (duplicate) return okState(undefined, "You've already reported this — it's in the queue.");
  const report = await db.report.create({
    data: { targetType, targetId, reporterId: user?.id ?? null, reporterEmail: user?.email ?? parsed.data.email ?? null, reason: parsed.data.reason, details: parsed.data.details ?? null },
  });
  if (targetType === "review") await db.review.update({ where: { id: targetId }, data: { reportCount: { increment: 1 } } });
  await notifyAdmins("moderation.manage", { type: "report.created", title: `New ${targetType} report: ${parsed.data.reason}`, body: parsed.data.details?.slice(0, 120), href: `/admin/moderation/${report.id}` });
  return okState(undefined, "Thanks — our moderation team will review this shortly.");
}
