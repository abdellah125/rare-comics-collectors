import "server-only";
import type { CurrentUser } from "@/lib/auth/session";

/**
 * Admin tiers. An account whose role carries "*" or "admins.manage" can hand
 * out admin access, so only a super admin may edit, reset, suspend or re-role
 * such an account — otherwise an "Admin" could take over a "Super Admin" via a
 * password reset or an email change.
 */
export const isSuperAdmin = (user: CurrentUser) => user.permissions.includes("*");

export function rolePermissions(json: string | null | undefined): string[] {
  try {
    const value: unknown = JSON.parse(json ?? "[]");
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

export const isElevated = (permissions: string[]) => permissions.includes("*") || permissions.includes("admins.manage");

/** May this admin act on an account holding the given role permissions? */
export function mayActOnAdmin(actor: CurrentUser, targetRolePermissionsJson: string | null | undefined): boolean {
  if (isSuperAdmin(actor)) return true;
  return !isElevated(rolePermissions(targetRolePermissionsJson));
}
