import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth/session";
import { readMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * Serves uploaded files. Public media (product images, branding) is cacheable;
 * private media (seller documents, case attachments) requires the owner, the
 * related seller, or an admin with the matching permission.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/media/[id]">) {
  const { id } = await ctx.params;
  const media = await db.mediaFile.findUnique({ where: { id } });
  if (!media) return new Response("Not found", { status: 404 });

  if (media.visibility !== "public") {
    const user = await getCurrentUser();
    if (!user) return new Response("Unauthorized", { status: 401 });
    const isOwner = media.ownerId === user.id;
    const adminOk =
      media.purpose === "seller_document" ? can(user, "sellers.view") : can(user, "support.view") || can(user, "disputes.manage") || can(user, "orders.view");
    if (!isOwner && !adminOk) return new Response("Forbidden", { status: 403 });
  }

  const buf = await readMedia(media.key);
  if (!buf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": media.mime,
      "content-length": String(buf.length),
      "content-disposition": `inline; filename="${media.originalName.replace(/[^\w.\-]+/g, "_")}"`,
      "x-content-type-options": "nosniff",
      "cache-control": media.visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
    },
  });
}
