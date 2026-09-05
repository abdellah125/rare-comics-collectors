import { describe, expect, it } from "vitest";
import { safeLocalPath } from "@/lib/auth/safe-next";
import { isElevated, mayActOnAdmin, rolePermissions } from "@/lib/admin/elevation";
import type { CurrentUser } from "@/lib/auth/session";

const admin = (permissions: string[]): CurrentUser =>
  ({ id: "a", email: "a@example.com", name: "A", status: "active", isSeller: false, locale: "en", currency: "USD", timezone: "UTC", countryCode: "US", twoFactorEnabled: true, restrictions: [], role: { id: "r", slug: "x", name: "X" }, permissions, isAdmin: true, seller: null, session: { id: "s", createdAt: new Date(), impersonatorId: null }, impersonator: null }) as unknown as CurrentUser;

describe("safeLocalPath", () => {
  it("keeps ordinary local paths", () => {
    expect(safeLocalPath("/account/orders?x=1", "/")).toBe("/account/orders?x=1");
  });
  it("rejects protocol-relative and scheme-carrying targets", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "/x\nLocation: evil", "javascript:alert(1)", "", undefined, 42]) {
      expect(safeLocalPath(bad, "/fallback")).toBe("/fallback");
    }
  });
});

describe("admin tiers", () => {
  it("parses role permissions defensively", () => {
    expect(rolePermissions('["users.view"]')).toEqual(["users.view"]);
    expect(rolePermissions("not json")).toEqual([]);
    expect(rolePermissions(null)).toEqual([]);
  });
  it("treats * and admins.manage as elevated", () => {
    expect(isElevated(["*"])).toBe(true);
    expect(isElevated(["admins.manage"])).toBe(true);
    expect(isElevated(["users.manage"])).toBe(false);
  });
  it("lets only super admins act on elevated accounts", () => {
    const superAdmin = admin(["*"]);
    const manager = admin(["users.manage", "admins.manage"]);
    expect(mayActOnAdmin(superAdmin, '["*"]')).toBe(true);
    expect(mayActOnAdmin(manager, '["*"]')).toBe(false);
    expect(mayActOnAdmin(manager, '["admins.manage"]')).toBe(false);
    expect(mayActOnAdmin(manager, '["users.view"]')).toBe(true);
    expect(mayActOnAdmin(manager, null)).toBe(true);
  });
});
