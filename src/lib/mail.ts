import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings, type Settings } from "@/lib/settings";
import { enqueueJob } from "@/lib/jobs/queue";
import { randomToken, signValue } from "@/lib/crypto";
import { textToHtml } from "@/lib/mail-html";
import { fullAddress } from "@/lib/site";

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

/**
 * Sender identity. The address must be the mailbox SMTP authenticates as (Namecheap,
 * Google and most providers reject anything else), so MAIL_FROM's address wins and
 * SMTP_USER is the fallback; the display name comes from MAIL_FROM or the marketplace name.
 */
function fromIdentity(settings: Settings): { name: string; address: string } {
  const raw = env.smtp.from.trim();
  const m = raw.match(/^(.*?)\s*<([^>]+)>$/);
  const address = ((m ? m[2] : raw).trim() || env.smtp.user).trim();
  const name = (m ? m[1].replace(/^"|"$/g, "").trim() : "") || settings["marketplace.name"];
  return { name, address };
}

let alignmentWarned = false;
function warnIfMisaligned(address: string) {
  if (alignmentWarned || !env.smtp.user.includes("@")) return;
  alignmentWarned = true;
  const fromDomain = address.split("@")[1]?.toLowerCase();
  const userDomain = env.smtp.user.split("@")[1]?.toLowerCase();
  if (fromDomain && userDomain && fromDomain !== userDomain) {
    console.warn(`[mail] MAIL_FROM domain (${fromDomain}) differs from the SMTP mailbox domain (${userDomain}); SPF/DKIM alignment will fail and mail lands in spam.`);
  }
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
    const settings = await getSettings();
    const meta = (log.metaJson ? (JSON.parse(log.metaJson) as Record<string, unknown>) : {}) as Record<string, unknown>;
    const { name, address } = fromIdentity(settings);
    warnIfMisaligned(address);
    const support = settings["marketplace.supportEmail"].trim();
    const siteName = settings["marketplace.name"];
    const footer = [`${siteName} · ${fullAddress}`, `Questions? Reply to this email or write to ${support}.`];
    const headers: Record<string, string> = {};
    let text = log.bodyText;
    // Marketing broadcasts carry RFC 8058 one-click unsubscribe headers and a visible link;
    // transactional mail (orders, security, support) intentionally does not.
    if (meta.broadcast === true && log.userId) {
      const unsubscribe = `${env.siteUrl}/api/email/unsubscribe?u=${encodeURIComponent(signValue(log.userId, 365 * 86_400))}`;
      headers["List-Unsubscribe"] = `<${unsubscribe}>, <mailto:${support}?subject=unsubscribe>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      headers["Precedence"] = "bulk";
      text += `\n\nYou receive marketplace updates because your account opted in. Unsubscribe: ${unsubscribe}`;
    }
    const info = await smtp().sendMail({
      from: { name, address },
      to: log.toEmail,
      replyTo: support && support.toLowerCase() !== address.toLowerCase() ? support : undefined,
      subject: log.subject,
      text,
      html: textToHtml(text, { siteName, siteUrl: env.siteUrl, footer }),
      envelope: { from: address, to: log.toEmail },
      messageId: `<${randomToken(18)}@${address.split("@")[1] ?? "localhost"}>`,
      headers,
    });
    await db.emailLog.update({ where: { id: log.id }, data: { status: "sent", provider: "smtp", messageId: info.messageId ?? null, sentAt: new Date(), error: null } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.emailLog.update({ where: { id: log.id }, data: { status: "failed", error: message.slice(0, 500) } });
    throw err;
  }
}
