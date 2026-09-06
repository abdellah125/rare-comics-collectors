import { verifySignedValue } from "@/lib/crypto";
import { db } from "@/lib/db";
import { escapeHtml } from "@/lib/mail-html";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe target for marketing broadcasts (RFC 8058). The link
 * carries a signed user id, so it works without a session and cannot be forged.
 * Order, security and support emails are transactional and are not affected.
 */
async function unsubscribe(token: string | null): Promise<boolean> {
  const userId = token ? verifySignedValue(token) : null;
  if (!userId) return false;
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return false;
  await db.user.update({ where: { id: userId }, data: { marketingOptIn: false } });
  await db.notificationPreference.upsert({ where: { userId }, create: { userId, marketing: false }, update: { marketing: false } });
  return true;
}

export async function POST(req: Request) {
  const ok = await unsubscribe(new URL(req.url).searchParams.get("u"));
  return new Response(ok ? "Unsubscribed" : "Invalid or expired link", { status: ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}

export async function GET(req: Request) {
  const ok = await unsubscribe(new URL(req.url).searchParams.get("u"));
  const settings = await getSettings();
  const name = escapeHtml(settings["marketplace.name"]);
  const body = ok
    ? `<h1>You're unsubscribed</h1><p>${name} will no longer send you marketing updates. Order, account and support emails are unaffected.</p>`
    : `<h1>This link is invalid or has expired</h1><p>Sign in and open Account › Notifications to change your email preferences.</p>`;
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>${name}</title></head><body style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f4f6;color:#1c2130"><main style="max-width:520px;margin:64px auto;padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;line-height:1.55">${body}</main></body></html>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
