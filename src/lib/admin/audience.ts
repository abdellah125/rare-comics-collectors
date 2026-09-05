import "server-only";
import { db } from "@/lib/db";

/** Recipient count for a broadcast audience (admin pages only; not an action). */
export async function audienceCount(audience: string): Promise<number> {
  return db.user.count({
    where: {
      status: "active",
      deletedAt: null,
      ...(audience === "sellers" ? { isSeller: true } : audience === "buyers" ? { isSeller: false, roleId: null } : audience === "admins" ? { roleId: { not: null } } : audience === "marketing" ? { marketingOptIn: true } : {}),
    },
  });
}
