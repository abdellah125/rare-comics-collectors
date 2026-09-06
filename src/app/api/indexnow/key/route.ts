import { indexNowKey } from "@/lib/indexnow";

export const dynamic = "force-dynamic";

/**
 * Serves the IndexNow key file. next.config.ts rewrites `/<key>.txt` here, which is
 * where the protocol requires it (the key is public by design: search engines fetch
 * it to prove the submitter controls the host). Any other key name is a 404.
 *
 * Route handlers see the original URL after a rewrite, so the key is read from the
 * path first and from `?key=` only for direct calls.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromPath = url.pathname.match(/^\/([a-zA-Z0-9-]{8,128})\.txt$/)?.[1] ?? "";
  const requested = fromPath || (url.searchParams.get("key") ?? "");
  const key = indexNowKey();
  if (!requested || requested !== key) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(key, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
