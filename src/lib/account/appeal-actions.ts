"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertUser, AuthError } from "@/lib/auth/session";
import { notifyAdmins } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";
import { failState, fieldErrors, formToObject, okState, zEmail, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

const AppealSchema = z.object({ violationId: zOptionalTrimmed(64), message: zTrimmed(3000).min(20) });

/** Signed-in appeal against a violation or restriction. One pending appeal at a time. */
export async function submitAppealAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertUser();
    const parsed = AppealSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Tell us why the decision should be reviewed (at least 20 characters).", fieldErrors(parsed.error));
    const pending = await db.appeal.count({ where: { userId: user.id, status: "pending" } });
    if (pending > 0) return failState("You already have an appeal under review. We'll email you when it's decided.");
    let violationId: string | null = null;
    if (parsed.data.violationId) {
      const v = await db.violation.findFirst({ where: { id: parsed.data.violationId, userId: user.id }, select: { id: true } });
      if (!v) return failState("That violation isn't on your account.");
      violationId = v.id;
    }
    await db.appeal.create({ data: { userId: user.id, violationId, message: parsed.data.message } });
    await notifyAdmins("moderation.manage", { type: "appeal.new", title: `New appeal from ${user.email}`, body: parsed.data.message.slice(0, 120), href: "/admin/moderation/appeals" });
    revalidatePath("/account/security");
    return okState(undefined, "Appeal submitted. We'll reply by email.");
  } catch (err) {
    if (err instanceof AuthError) return failState(err.message);
    throw err;
  }
}

const PublicAppealSchema = z.object({ email: zEmail, message: zTrimmed(3000).min(20), website: z.string().optional() });

/**
 * Appeal from a user who can't sign in (suspended / banned). Never reveals
 * whether the email exists; rate limited per network.
 */
export async function submitPublicAppealAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const parsed = PublicAppealSchema.safeParse(formToObject(formData));
  if (!parsed.success) return failState("Enter your account email and at least 20 characters.", fieldErrors(parsed.error));
  const generic = okState(undefined, "Thanks — if that email belongs to an account with an active restriction, our Trust & Safety team will review the appeal and reply by email.");
  if (parsed.data.website) return generic; // honeypot
  const meta = await requestMeta();
  if (!rateLimit(`appeal:${meta.ip ?? "unknown"}`, 3, 60 * 60_000).ok) return failState("Too many requests from this network. Try again later.");
  const user = await db.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, status: true } });
  if (!user || user.status === "active") return generic;
  const pending = await db.appeal.count({ where: { userId: user.id, status: "pending" } });
  if (pending > 0) return generic;
  const latest = await db.violation.findFirst({ where: { userId: user.id, status: "active" }, orderBy: { createdAt: "desc" }, select: { id: true } });
  await db.appeal.create({ data: { userId: user.id, violationId: latest?.id ?? null, message: parsed.data.message } });
  await notifyAdmins("moderation.manage", { type: "appeal.new", title: `New appeal from ${parsed.data.email}`, body: parsed.data.message.slice(0, 120), href: "/admin/moderation/appeals" });
  return generic;
}
