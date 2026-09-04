"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/domain";
import { queueTemplateEmail } from "@/lib/mail";
import { saveUpload } from "@/lib/media";
import { notifyUser } from "@/lib/notifications";
import { failState, fieldErrors, formToObject, okState, zId, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

const ReplySchema = z.object({ ticketId: zId, body: zTrimmed(10_000).min(1), internal: z.string().optional(), nextStatus: z.enum(["", ...TICKET_STATUSES]).optional() });

/** Agent reply (emailed to the customer) or internal note. */
export async function agentReplyAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("support.manage", async (admin) => {
    const parsed = ReplySchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Write a message.", fieldErrors(parsed.error));
    const d = parsed.data;
    const internal = d.internal === "on";
    const ticket = await db.ticket.findUnique({ where: { id: d.ticketId }, select: { id: true, number: true, subject: true, email: true, name: true, userId: true, status: true, firstResponseAt: true, assignedToId: true } });
    if (!ticket) return failState("Ticket not found.");
    const attachments: string[] = [];
    for (const f of formData.getAll("attachments")) {
      if (f instanceof File && f.size > 0 && attachments.length < 5) attachments.push((await saveUpload(f, { purpose: "attachment", ownerId: admin.id, visibility: "private" })).id);
    }
    const nextStatus = internal ? ticket.status : d.nextStatus || "pending";
    await db.$transaction([
      db.ticketMessage.create({ data: { ticketId: ticket.id, authorId: admin.id, authorType: "agent", body: d.body, isInternal: internal, attachmentsJson: JSON.stringify(attachments) } }),
      db.ticket.update({ where: { id: ticket.id }, data: { lastMessageAt: new Date(), status: nextStatus, firstResponseAt: ticket.firstResponseAt ?? (internal ? undefined : new Date()), assignedToId: ticket.assignedToId ?? admin.id, resolvedAt: nextStatus === "resolved" || nextStatus === "closed" ? new Date() : undefined } }),
    ]);
    if (!internal) {
      const vars = { ticketNumber: ticket.number, subject: ticket.subject, message: d.body };
      if (ticket.userId) await notifyUser(ticket.userId, { type: "ticket.reply", title: `Support replied on ${ticket.number}`, body: d.body.slice(0, 140), href: `/account/support/${ticket.number}`, category: "supportReplies", email: { templateKey: "ticket_reply", vars } });
      else await queueTemplateEmail("ticket_reply", ticket.email, { name: ticket.name ?? "there", ...vars });
    }
    await audit({ actor: actorOf(admin), action: internal ? "ticket.note" : "ticket.reply", targetType: "ticket", targetId: ticket.id, summary: `${internal ? "Internal note" : "Reply"} on ${ticket.number}${nextStatus !== ticket.status ? ` → ${nextStatus}` : ""}` });
    revalidatePath(`/admin/support/${ticket.id}`);
    revalidatePath("/admin/support");
    return okState(undefined, internal ? "Note added." : "Reply sent.");
  });
}

const UpdateSchema = z.object({ ticketId: zId, status: z.enum(TICKET_STATUSES), priority: z.enum(TICKET_PRIORITIES), category: z.enum(TICKET_CATEGORIES), assignedToId: zOptionalTrimmed(64), tags: zOptionalTrimmed(300), isEscalated: z.string().optional() });

export async function updateTicketAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("support.manage", async (admin) => {
    const parsed = UpdateSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    const ticket = await db.ticket.findUnique({ where: { id: d.ticketId }, select: { id: true, number: true, status: true, priority: true, assignedToId: true, resolvedAt: true, userId: true } });
    if (!ticket) return failState("Ticket not found.");
    if (d.assignedToId) {
      const agent = await db.user.findFirst({ where: { id: d.assignedToId, roleId: { not: null }, status: "active" }, select: { id: true } });
      if (!agent) return failState("Assignee must be an active admin.", { assignedToId: "Invalid" });
    }
    const tags = (d.tags ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10);
    const closing = d.status === "resolved" || d.status === "closed";
    await db.ticket.update({ where: { id: ticket.id }, data: { status: d.status, priority: d.priority, category: d.category, assignedToId: d.assignedToId || null, tagsJson: JSON.stringify(tags), isEscalated: d.isEscalated === "on", resolvedAt: closing ? (ticket.resolvedAt ?? new Date()) : null } });
    if (closing && ticket.status !== d.status) {
      await db.ticketMessage.create({ data: { ticketId: ticket.id, authorId: admin.id, authorType: "system", body: `Ticket marked ${d.status} by ${admin.name}.` } });
      if (ticket.userId) await notifyUser(ticket.userId, { type: "ticket.status", title: `${ticket.number} ${d.status}`, href: `/account/support/${ticket.number}`, category: "supportReplies" });
    }
    if (d.assignedToId && d.assignedToId !== ticket.assignedToId && d.assignedToId !== admin.id) await notifyUser(d.assignedToId, { type: "ticket.assigned", title: `${ticket.number} assigned to you`, href: `/admin/support/${ticket.id}`, category: "supportReplies" });
    await audit({ actor: actorOf(admin), action: "ticket.update", targetType: "ticket", targetId: ticket.id, summary: `${ticket.number}: ${d.status}, ${d.priority}${d.assignedToId ? ", assigned" : ""}${d.isEscalated === "on" ? ", escalated" : ""}`, before: { status: ticket.status, priority: ticket.priority, assignedToId: ticket.assignedToId }, after: d });
    revalidatePath(`/admin/support/${ticket.id}`);
    revalidatePath("/admin/support");
    return okState(undefined, "Ticket updated.");
  });
}

export async function bulkTicketsAction(actionId: string, ids: string[]): Promise<ActionState> {
  return runAdmin("support.manage", async (admin) => {
    const where = { id: { in: ids.slice(0, 200) } };
    let n = 0;
    if (actionId === "resolve" || actionId === "close") n = (await db.ticket.updateMany({ where, data: { status: actionId === "close" ? "closed" : "resolved", resolvedAt: new Date() } })).count;
    else if (actionId === "assign_me") n = (await db.ticket.updateMany({ where, data: { assignedToId: admin.id } })).count;
    else if (actionId === "unassign") n = (await db.ticket.updateMany({ where, data: { assignedToId: null } })).count;
    else if (actionId === "priority_high") n = (await db.ticket.updateMany({ where, data: { priority: "high" } })).count;
    else if (actionId === "escalate") n = (await db.ticket.updateMany({ where, data: { isEscalated: true, priority: "urgent" } })).count;
    else return failState("Unknown action.");
    await audit({ actor: actorOf(admin), action: `ticket.bulk.${actionId}`, targetType: "ticket", summary: `${actionId} on ${n} tickets`, after: ids });
    revalidatePath("/admin/support");
    return okState(undefined, `${n} ticket${n === 1 ? "" : "s"} updated.`);
  });
}
