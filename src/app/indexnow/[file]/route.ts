import { indexNowKey } from "@/lib/indexnow";

export const dynamic = "force-dynamic";

/**
 * IndexNow key file ("Option 2": the key hosted at a location of our choosing). Search
 * engines fetch `/indexnow/<key>.txt` — the `keyLocation` every submission names — to
 * prove the submitter controls the host, so the body must be exactly the key: plain
 * UTF-8, one line, nothing else. Any other file name is a 404, so the key is not
 * discoverable from this route without already knowing it.
 */
export async function GET(_req: Request, ctx: RouteContext<"/indexnow/[file]">) {
  const { file } = await ctx.params;
  const key = indexNowKey();
  if (file !== `${key}.txt`) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(key, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
