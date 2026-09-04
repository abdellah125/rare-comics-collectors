"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, assertUser, AuthError } from "@/lib/auth/session";
import { newTicketNumber } from "@/lib/ids";
import { saveUpload, UploadError } from "@/lib/media";
import { queueTemplateEmail } from "@/lib/mail";
import { notifyAdmins, notifyUser } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";
import { getSettings } from "@/lib/settings";
import { TICKET_CATEGORIES } from "@/lib/domain";
import { failState, fieldErrors, formToObject, okState, zEmail, zId, zTrimmed, type ActionState } from "@/lib/validation";

const CreateSchema = z.object({
  name: zTrimmed(120).optional(),
  email: zEmail.optional(),
  subject: zTrimmed(160).min(3, { error: "Add a short subject" }),
  category: z.enum(TICKET_CATEGORIES).default("other"),
  orderNumber: zTrimmed(40).optional(),
  body: zTrimmed(6000).min(10, { error: "Tell us a little more (at least 10 characters)" }),
  website: z.string().max(0).optional(), // honeypot
});

/** Creates a ticket for a signed-in user or a guest (contact / support forms). */
export async function createTicketAction(_prev: ActionState<{ number: string }> | undefined, formData: FormData): Promise<ActionState<{ number: string }>> {
  try {
    const parsed = CreateSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    if (parsed.data.website) return okState({ number: "TCK-000000" }, "Thanks — we've received your message."); // bot
    const meta = await requestMeta();
    const limiter = rateLimit(`ticket:${meta.ip ?? "unknown"}`, 6, 60 * 60_000);
    if (!limiter.ok) return failState("Too many messages from this network. Please try again later.");
    const user = await getCurrentUser();
    if (user?.restrictions.includes("no_support")) return failState("Support access is restricted on this account.");
    const email = user?.email ?? parsed.data.email;
    if (!email) return failState("Enter your email so we can reply.", { email: "Required" });
    const name = user?.name ?? parsed.data.name ?? null;

    let orderId: string | null = null;
    if (parsed.data.orderNumber) {
      const order = await db.order.findFirst({ where: { number: parsed.data.orderNumber.toUpperCase(), ...(user ? { userId: user.id } : { email }) }, select: { id: true } });
      orderId = order?.id ?? null;
    }
    const attachments: string[] = [];
    for (const f of formData.getAll("attachments")) {
      if (f instanceof File && f.size > 0 && attachments.length < 5) {
        const saved = await saveUpload(f, { purpose: "attachment", ownerId: user?.id ?? null, visibility: "private" });
        attachments.push(saved.id);
      }
    }
    const number = await newTicketNumber();
    const ticket = await db.ticket.create({
      data: {
        number,
        userId: user?.id ?? null,
        email,
        name,
        subject: parsed.data.subject,
        category: parsed.data.category,
        orderId,
        sellerId: user?.seller?.id ?? null,
        source: user ? "web" : "contact_form",
        messages: { create: { authorId: user?.id ?? null, authorType: "customer", body: parsed.data.body, attachmentsJson: JSON.stringify(attachments) } },
      },
    });
    const settings = await getSettings();
    if (settings["notifications.adminNewTicket"]) await notifyAdmins("support.view", { type: "ticket.created", title: `New ticket ${number}: ${parsed.data.subject}`, body: email, href: `/admin/support/${ticket.id}` });
    await queueTemplateEmail("ticket_created", email, { name: name ?? "there", ticketNumber: number, subject: parsed.data.subject }, { userId: user?.id ?? null });
    revalidatePath("/account/support");
    return okState({ number }, `Ticket ${number} opened. We reply within one business day.`);
  } catch (err) {
    if (err instanceof UploadError) return failState(err.message);
    throw err;
  }
}

const ReplySchema = z.object({ ticketId: zId, body: zTrimmed(6000).min(1, { error: "Write a reply" }) });

/** Customer reply on their own ticket. */
export async function replyTicketAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertUser();
    const parsed = ReplySchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Write a reply before sending.", fieldErrors(parsed.error));
    const ticket = await db.ticket.findFirst({ where: { id: parsed.data.ticketId, userId: user.id } });
    if (!ticket) throw new AuthError("Ticket not found", 403);
    const attachments: string[] = [];
    for (const f of formData.getAll("attachments")) {
      if (f instanceof File && f.size > 0 && attachments.length < 5) {
        const saved = await saveUpload(f, { purpose: "attachment", ownerId: user.id, visibility: "private" });
        attachments.push(saved.id);
      }
    }
    await db.$transaction([
      db.ticketMessage.create({ data: { ticketId: ticket.id, authorId: user.id, authorType: "customer", body: parsed.data.body, attachmentsJson: JSON.stringify(attachments) } }),
      db.ticket.update({ where: { id: ticket.id }, data: { status: ticket.status === "resolved" || ticket.status === "closed" ? "open" : "open", lastMessageAt: new Date() } }),
    ]);
    if (ticket.assignedToId) await notifyUser(ticket.assignedToId, { type: "ticket.reply", title: `Reply on ${ticket.number}`, body: parsed.data.body.slice(0, 120), href: `/admin/support/${ticket.id}`, category: "supportReplies" });
    else await notifyAdmins("support.view", { type: "ticket.reply", title: `Reply on ${ticket.number}`, body: parsed.data.body.slice(0, 120), href: `/admin/support/${ticket.id}` });
    revalidatePath(`/account/support/${ticket.number}`);
    return okState(undefined, "Reply sent.");
  } catch (err) {
    if (err instanceof AuthError || err instanceof UploadError) return failState(err.message);
    throw err;
  }
}

export async function closeOwnTicketAction(ticketId: string): Promise<ActionState> {
  try {
    const user = await assertUser();
    const ticket = await db.ticket.findFirst({ where: { id: ticketId, userId: user.id } });
    if (!ticket) throw new AuthError("Ticket not found", 403);
    await db.ticket.update({ where: { id: ticket.id }, data: { status: "closed", resolvedAt: ticket.resolvedAt ?? new Date() } });
    revalidatePath(`/account/support/${ticket.number}`);
    return okState(undefined, "Ticket closed.");
  } catch (err) {
    if (err instanceof AuthError) return failState(err.message);
    throw err;
  }
}
