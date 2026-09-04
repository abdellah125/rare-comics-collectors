import "server-only";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request-meta";

export type AuditActor = { id: string; email: string; type: "admin" | "user" | "seller" } | "system" | "webhook" | "job";

export type AuditInput = {
  actor: AuditActor;
  action: string;
  targetType?: string;
  targetId?: string;
  summary: string;
  before?: unknown;
  after?: unknown;
};

/**
 * Append-only audit trail. Never throws — a logging failure must not roll back
 * the action it describes (the action itself is already committed).
 */
export async function audit(input: AuditInput): Promise<void> {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const meta = await requestMeta();
    ip = meta.ip;
    userAgent = meta.userAgent;
  } catch {
    // outside a request (job / webhook processing)
  }
  const actor = input.actor;
  try {
    await db.auditLog.create({
      data: {
        actorId: typeof actor === "string" ? null : actor.id,
        actorType: typeof actor === "string" ? actor : actor.type,
        actorEmail: typeof actor === "string" ? null : actor.email,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        summary: input.summary.slice(0, 500),
        beforeJson: input.before === undefined ? null : JSON.stringify(input.before).slice(0, 20_000),
        afterJson: input.after === undefined ? null : JSON.stringify(input.after).slice(0, 20_000),
        ip,
        userAgent,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit entry", err);
  }
}

export async function securityEvent(type: string, userId: string | null, meta?: Record<string, unknown>) {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const m = await requestMeta();
    ip = m.ip;
    userAgent = m.userAgent;
  } catch {
    // no request context
  }
  try {
    await db.securityEvent.create({
      data: { type, userId, ip, userAgent, metaJson: meta ? JSON.stringify(meta) : null },
    });
  } catch (err) {
    console.error("[security-event] failed", err);
  }
}
