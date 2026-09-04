import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, DEFAULT_ROLES, PERMISSION_GROUPS, hasPermission, isAdminPermissionSet } from "@/lib/permissions";
import { SETTING_GROUPS } from "@/lib/admin/settings-spec";
import { settingDefaults } from "@/lib/settings";

describe("permissions", () => {
  it("grants everything to the wildcard and nothing to empty sets", () => {
    expect(hasPermission(["*"], "admins.manage")).toBe(true);
    expect(hasPermission([], "dashboard.view")).toBe(false);
    expect(hasPermission(null, "dashboard.view")).toBe(false);
    expect(hasPermission(["orders.view"], "orders.manage")).toBe(false);
    expect(hasPermission(["orders.view"], "orders.view")).toBe(true);
  });

  it("only treats non-empty permission sets as admin", () => {
    expect(isAdminPermissionSet([])).toBe(false);
    expect(isAdminPermissionSet(["support.view"])).toBe(true);
  });

  it("ships default roles that reference real permissions", () => {
    for (const role of DEFAULT_ROLES) {
      for (const p of role.permissions) expect(p === "*" || ALL_PERMISSIONS.includes(p)).toBe(true);
    }
    expect(DEFAULT_ROLES.find((r) => r.slug === "super_admin")?.permissions).toEqual(["*"]);
    const support = DEFAULT_ROLES.find((r) => r.slug === "support");
    expect(support && hasPermission(support.permissions, "settings.manage")).toBe(false);
    expect(support && hasPermission(support.permissions, "support.view")).toBe(true);
  });

  it("lists every permission in exactly one UI group", () => {
    const seen = PERMISSION_GROUPS.flatMap((g) => g.keys);
    expect([...seen].sort()).toEqual([...ALL_PERMISSIONS].sort());
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe("settings spec", () => {
  it("only references keys that have typed defaults", () => {
    for (const g of SETTING_GROUPS) for (const f of g.fields) expect(f.key in settingDefaults).toBe(true);
  });

  it("uses a bool field for every boolean default it exposes", () => {
    for (const g of SETTING_GROUPS) for (const f of g.fields) if (typeof settingDefaults[f.key] === "boolean") expect(f.kind).toBe("bool");
  });
});
