import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic, cookie-only checks. Real authentication and authorization happen
 * in the data access layer (src/lib/auth/session.ts) inside every page,
 * server action and route handler — this only short-circuits obvious cases
 * and enforces the optional admin IP allowlist.
 */
const SESSION_COOKIE = "rcc_session";
const ADMIN_PUBLIC = ["/admin/login", "/admin/login/verify", "/admin/denied", "/admin/setup"];

function ipAllowed(ip: string | null, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  if (!ip) return false;
  return allowlist.some((entry) => (entry.endsWith("*") || entry.endsWith(".") ? ip.startsWith(entry.replace(/\*$/, "")) : ip === entry));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    const allowlist = (process.env.ADMIN_IP_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? request.headers.get("x-real-ip");
    if (!ipAllowed(ip, allowlist)) {
      return new NextResponse("Not found", { status: 404 });
    }
    const isPublic = ADMIN_PUBLIC.some((p) => pathname === p);
    if (!isPublic && !request.cookies.has(SESSION_COOKIE)) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  if ((pathname.startsWith("/account") || pathname.startsWith("/dashboard")) && !request.cookies.has(SESSION_COOKIE)) {
    const publicAccount = ["/account/login", "/account/register", "/account/reset"];
    if (!publicAccount.some((p) => pathname.startsWith(p))) {
      const url = request.nextUrl.clone();
      url.pathname = "/account/login";
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*", "/dashboard/:path*"],
};
