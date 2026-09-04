import { getCurrentUser } from "@/lib/auth/session";
import { unreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Safe, minimal session DTO for client components. Never returns roles, permissions or tokens. */
export async function GET() {
  const user = await getCurrentUser();
  const body = user
    ? {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          isSeller: Boolean(user.seller),
          sellerStatus: user.seller?.status ?? null,
          isAdmin: user.isAdmin && !user.impersonator,
          impersonatedBy: user.impersonator?.name ?? null,
          unreadNotifications: await unreadCount(user.id),
        },
      }
    : { user: null };
  return Response.json(body, { headers: { "cache-control": "no-store, private" } });
}
