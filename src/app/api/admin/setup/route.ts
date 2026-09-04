import { NextResponse } from "next/server";
import { createInitialAdmin, needsInitialAdmin, SetupError, SetupSchema } from "@/lib/admin/setup";
import { RateLimitError } from "@/lib/rate-limit";
import { ipFromHeaders, isSameOrigin } from "@/lib/request-meta";
import { ensureInstanceSecrets } from "@/lib/secrets";

export const dynamic = "force-dynamic";

/**
 * Creates the first super administrator. Accepts the HTML form from /admin/setup
 * (redirects back with ?error= or on to the sign-in page) and JSON bodies
 * (`{"name","email","password","confirm"}`) for scripted bootstraps. Answers 404
 * as soon as an administrator exists.
 */
export async function POST(req: Request) {
  if (!(await needsInitialAdmin())) return new Response("Not found", { status: 404 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Cross-origin request refused" }, { status: 403 });

  const wantsJson = (req.headers.get("content-type") ?? "").includes("application/json");
  const body = wantsJson ? await req.json().catch(() => null) : Object.fromEntries((await req.formData()).entries());
  const parsed = SetupSchema.safeParse(body);
  const back = (code: string, status: number, message: string) => (wantsJson ? NextResponse.json({ error: message, code }, { status }) : NextResponse.redirect(new URL(`/admin/setup?error=${code}`, req.url), 303));

  if (!parsed.success) {
    const paths = parsed.error.issues.map((i) => String(i.path[0]));
    const code = paths.includes("confirm") ? "mismatch" : paths.includes("password") ? "weak" : "invalid";
    return back(code, 400, parsed.error.issues.map((i) => i.message).join("; "));
  }

  try {
    await ensureInstanceSecrets();
    const user = await createInitialAdmin(parsed.data, { ip: ipFromHeaders(req.headers) });
    return wantsJson ? NextResponse.json({ ok: true, email: user.email }) : NextResponse.redirect(new URL("/admin/login?setup=done", req.url), 303);
  } catch (err) {
    if (err instanceof RateLimitError) return back("rate", 429, err.message);
    if (err instanceof SetupError) return back(err.status === 404 ? "exists" : err.status === 403 ? "key" : "failed", err.status, err.message);
    console.error("[admin setup] failed", err);
    return back("failed", 500, "Could not create the administrator");
  }
}
