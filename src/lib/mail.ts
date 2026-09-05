import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { enqueueJob } from "@/lib/jobs/queue";

/**
 * Transactional email. Templates live in the database (editable in the admin),
 * every message is recorded in EmailLog, and delivery happens in a background
 * job so a slow SMTP server never blocks a checkout.
 *
 * Without SMTP configured, messages are still rendered and logged (status
 * "logged") so the communication history is complete during development.
 */
export type MailVars = Record<string, string | number | null | undefined>;

export function renderTemplate(text: string, vars: MailVars): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

async function baseVars(): Promise<MailVars> {
  const settings = await getSettings();
  return { siteName: settings["marketplace.name"], siteUrl: env.siteUrl, supportEmail: settings["marketplace.supportEmail"] };
}

export async function queueTemplateEmail(
  templateKey: string,
  to: string,
  vars: MailVars,
  opts: { userId?: string | null; meta?: Record<string, unknown> } = {},
): Promise<string | null> {
  const template = await db.emailTemplate.findUnique({ where: { key: templateKey } });
  if (!template) {
    console.warn(`[mail] template "${templateKey}" missing`);
    return null;
  }
  if (!template.isEnabled) return null;
  const merged = { ...(await baseVars()), ...vars };
  const subject = renderTemplate(template.subject, merged);
  const body = renderTemplate(template.bodyText, merged);
  return queueRawEmail({ to, subject, body, templateKey, userId: opts.userId ?? null, meta: opts.meta });
}

export async function queueRawEmail(input: {
  to: string;
  subject: string;
  body: string;
  templateKey?: string | null;
  userId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<string> {
  const log = await db.emailLog.create({
    data: {
      toEmail: input.to,
      userId: input.userId ?? null,
      templateKey: input.templateKey ?? null,
      subject: input.subject,
      bodyText: input.body,
      status: "queued",
      provider: env.smtp.configured ? "smtp" : "log",
      metaJson: input.meta ? JSON.stringify(input.meta) : null,
    },
  });
  await enqueueJob("send_email", { emailLogId: log.id });
  return log.id;
}

let transporter: Transporter | null = null;
function smtp() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

/** Job handler: actually deliver a queued EmailLog row. */
export async function deliverEmail(emailLogId: string): Promise<void> {
  const log = await db.emailLog.findUnique({ where: { id: emailLogId } });
  if (!log || log.status === "sent") return;
  if (!env.smtp.configured) {
    await db.emailLog.update({ where: { id: log.id }, data: { status: "logged", provider: "log", sentAt: new Date() } });
    if (!env.isProd) console.log(`[mail:logged] to=${log.toEmail} subject="${log.subject}"`);
    return;
  }
  try {
    const info = await smtp().sendMail({ from: env.smtp.from, to: log.toEmail, subject: log.subject, text: log.bodyText });
    await db.emailLog.update({ where: { id: log.id }, data: { status: "sent", provider: "smtp", messageId: info.messageId ?? null, sentAt: new Date(), error: null } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.emailLog.update({ where: { id: log.id }, data: { status: "failed", error: message.slice(0, 500) } });
    throw err;
  }
}
