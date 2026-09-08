import "server-only";
import type { SessionUser } from "@/components/auth-provider";
import { getCurrentUser } from "@/lib/auth/session";
import { unreadCount } from "@/lib/notifications";

/**
 * Safe, minimal view of the signed-in user for client components. Shared by the
 * /api/auth/session route and the storefront shell (which passes it as the
 * provider's initial state, so public pages hydrate without a session fetch).
 * Never includes roles, permissions or tokens.
 */
export async function sessionDto(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isSeller: Boolean(user.seller),
    sellerStatus: user.seller?.status ?? null,
    isAdmin: user.isAdmin && !user.impersonator,
    impersonatedBy: user.impersonator?.name ?? null,
    unreadNotifications: await unreadCount(user.id),
  };
}
