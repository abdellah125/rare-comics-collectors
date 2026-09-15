import { indexNowKey } from "@/lib/indexnow";

export const dynamic = "force-dynamic";

/**
 * IndexNow key file. Served here at `/indexnow/<key>.txt` and, through the rewrite in
 * next.config.ts, at `/<key>.txt` — the keyLocation submissions name, because IndexNow
 * only verifies URLs under the key file's folder. Search engines fetch it to prove the
 * submitter controls the host, so the body must be exactly the key: plain UTF-8, one
 * line, nothing else. Any other file name is a 404, so the key is not discoverable from
 * this route without already knowing it.
 */
export async function GET(_req: Request, ctx: RouteContext<"/indexnow/[file]">) {
  const { file } = await ctx.params;
  const key = indexNowKey();
  if (file !== `${key}.txt`) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(key, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
