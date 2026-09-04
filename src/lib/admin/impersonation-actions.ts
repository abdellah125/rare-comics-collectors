"use server";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertAdmin, getCurrentUser, startImpersonation, stopImpersonation, AuthError } from "@/lib/auth/session";
import type { ActionState } from "@/lib/validation";

export async function startImpersonationAction(userId: string): Promise<ActionState> {
  try {
    const admin = await assertAdmin("users.impersonate");
    const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
    if (!target) return { ok: false, message: "User not found" };
    await startImpersonation(admin, target.id);
    await audit({
      actor: { id: admin.id, email: admin.email, type: "admin" },
      action: "user.impersonate.start",
      targetType: "user",
      targetId: target.id,
      summary: `${admin.email} started a support session as ${target.email}`,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function stopImpersonationAction(): Promise<ActionState> {
  const current = await getCurrentUser();
  const restored = await stopImpersonation();
  if (current?.impersonator) {
    await audit({
      actor: { id: current.impersonator.id, email: current.impersonator.email, type: "admin" },
      action: "user.impersonate.stop",
      targetType: "user",
      targetId: current.id,
      summary: `${current.impersonator.email} ended the support session as ${current.email}`,
    });
  }
  return { ok: restored };
}
