"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { settingGroup } from "@/lib/admin/settings-spec";
import { saveUpload } from "@/lib/media";
import { getSettings, saveSettings, type Settings } from "@/lib/settings";
import { failState, fieldErrors, formToObject, okState, zBool, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

/** Validates and saves one settings group from the declarative spec. */
export async function saveSettingsGroupAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("settings.manage", async (admin) => {
    const group = settingGroup(String(formData.get("group") ?? ""));
    if (!group) return failState("Unknown settings group.");
    const before = await getSettings();
    const patch: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    for (const f of group.fields) {
      const raw = formData.get(f.key);
      const s = typeof raw === "string" ? raw.trim() : "";
      switch (f.kind) {
        case "bool":
          patch[f.key] = raw === "on";
          break;
        case "number": {
          const n = Number(s);
          if (!Number.isFinite(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) errors[f.key] = `Enter a number${f.min !== undefined ? ` ≥ ${f.min}` : ""}${f.max !== undefined ? ` ≤ ${f.max}` : ""}`;
          else patch[f.key] = Math.round(n);
          break;
        }
        case "money": {
          const n = Number(s);
          if (!Number.isFinite(n) || n < 0) errors[f.key] = "Enter an amount";
          else patch[f.key] = Math.round(n * 100);
          break;
        }
        case "color":
          if (!/^#[0-9a-fA-F]{6}$/.test(s)) errors[f.key] = "Use #rrggbb";
          else patch[f.key] = s.toLowerCase();
          break;
        case "select":
          if (!f.options?.some((o) => o.value === s)) errors[f.key] = "Pick an option";
          else patch[f.key] = s;
          break;
        default:
          if (s.length > 4000) errors[f.key] = "Too long";
          else if (f.key === "marketplace.supportEmail" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) errors[f.key] = "Enter a valid email";
          else if (f.key === "marketplace.defaultCountry" && !/^[A-Z]{2}$/i.test(s)) errors[f.key] = "Two-letter ISO code";
          else if (f.key === "marketplace.timezone" && !isValidTimeZone(s)) errors[f.key] = "Unknown IANA time zone";
          else patch[f.key] = f.key === "marketplace.defaultCountry" ? s.toUpperCase() : s;
      }
    }
    if (Object.keys(errors).length > 0) return failState("Fix the highlighted fields.", errors);
    if (group.slug === "security" && patch["security.adminRequire2fa"] === false && before["security.adminRequire2fa"] === true && !admin.permissions.includes("*")) return failState("Only a super admin can turn off the 2FA requirement.");
    await saveSettings(patch as Partial<Settings>, admin.id);
    const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => JSON.stringify(before[k as keyof Settings]) !== JSON.stringify(v)));
    if (Object.keys(changed).length > 0) {
      await audit({ actor: actorOf(admin), action: `settings.${group.slug}`, targetType: "setting", summary: `${group.title}: ${Object.keys(changed).join(", ")}`, before: Object.fromEntries(Object.keys(changed).map((k) => [k, before[k as keyof Settings]])), after: changed });
      if ("system.maintenanceMode" in changed) await audit({ actor: actorOf(admin), action: changed["system.maintenanceMode"] ? "maintenance.on" : "maintenance.off", summary: `Maintenance mode ${changed["system.maintenanceMode"] ? "enabled" : "disabled"}` });
    }
    revalidatePath("/", "layout");
    revalidatePath(`/admin/settings/${group.slug}`);
    return okState(undefined, Object.keys(changed).length > 0 ? "Settings saved." : "No changes.");
  });
}

function isValidTimeZone(tz: string) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function uploadBrandingAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("settings.manage", async (admin) => {
    const kind = String(formData.get("kind")) === "favicon" ? "favicon" : "logo";
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return failState("Choose an image file.");
    const saved = await saveUpload(file, { purpose: "branding", ownerId: admin.id, visibility: "public" });
    await saveSettings({ [kind === "logo" ? "marketplace.logoMediaId" : "marketplace.faviconMediaId"]: saved.id } as Partial<Settings>, admin.id);
    await audit({ actor: actorOf(admin), action: `branding.${kind}`, targetType: "media", targetId: saved.id, summary: `${kind} updated` });
    revalidatePath("/", "layout");
    revalidatePath("/admin/settings");
    return okState(undefined, `${kind === "logo" ? "Logo" : "Favicon"} updated.`);
  });
}

export async function clearBrandingAction(kind: "logo" | "favicon"): Promise<ActionState> {
  return runAdmin("settings.manage", async (admin) => {
    await saveSettings({ [kind === "logo" ? "marketplace.logoMediaId" : "marketplace.faviconMediaId"]: "" } as Partial<Settings>, admin.id);
    await audit({ actor: actorOf(admin), action: `branding.${kind}.clear`, summary: `${kind} removed` });
    revalidatePath("/", "layout");
    revalidatePath("/admin/settings");
    return okState(undefined, "Removed.");
  });
}

/* ------------------------------------------------------- localization */

const LocaleSchema = z.object({ code: z.string().trim().toLowerCase().regex(/^[a-z]{2}(-[a-z]{2})?$/, "e.g. en or pt-br"), name: zTrimmed(60).min(2), isEnabled: zBool.optional(), isDefault: zBool.optional() });

export async function saveLocaleAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("settings.manage", async (admin) => {
    const parsed = LocaleSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    const makeDefault = d.isDefault ?? false;
    await db.$transaction(async (tx) => {
      if (makeDefault) await tx.locale.updateMany({ data: { isDefault: false } });
      await tx.locale.upsert({ where: { code: d.code }, create: { code: d.code, name: d.name, isEnabled: makeDefault ? true : (d.isEnabled ?? true), isDefault: makeDefault }, update: { name: d.name, isEnabled: makeDefault ? true : (d.isEnabled ?? false), isDefault: makeDefault } });
    });
    if (makeDefault) await saveSettings({ "marketplace.defaultLocale": d.code }, admin.id);
    await audit({ actor: actorOf(admin), action: "locale.save", targetType: "locale", targetId: d.code, summary: `Locale ${d.code} ${d.name}${makeDefault ? " (default)" : ""}` });
    revalidatePath("/admin/settings/localization");
    revalidatePath("/", "layout");
    return okState(undefined, `Locale ${d.code} saved.`);
  });
}

export async function deleteLocaleAction(code: string): Promise<ActionState> {
  return runAdmin("settings.manage", async (admin) => {
    const l = await db.locale.findUnique({ where: { code } });
    if (!l) return failState("Locale not found.");
    if (l.isDefault) return failState("Can't delete the default locale.");
    await db.locale.delete({ where: { code } });
    await audit({ actor: actorOf(admin), action: "locale.delete", targetType: "locale", targetId: code, summary: `Locale ${code} deleted with its translations` });
    revalidatePath("/admin/settings/localization");
    return okState(undefined, "Locale deleted.");
  });
}

const TranslationSchema = z.object({ locale: zTrimmed(10).min(2), namespace: zTrimmed(40).min(1).default("common"), key: zTrimmed(120).min(1), value: zTrimmed(4000) });

export async function saveTranslationAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("settings.manage", async (admin) => {
    const parsed = TranslationSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    const loc = await db.locale.findUnique({ where: { code: d.locale } });
    if (!loc) return failState("Unknown locale.");
    const existing = await db.translation.findFirst({ where: { locale: d.locale, namespace: d.namespace, key: d.key } });
    if (existing) await db.translation.update({ where: { id: existing.id }, data: { value: d.value } });
    else await db.translation.create({ data: { locale: d.locale, namespace: d.namespace, key: d.key, value: d.value } });
    await audit({ actor: actorOf(admin), action: "translation.save", targetType: "translation", targetId: `${d.locale}:${d.namespace}:${d.key}`, summary: `Translation ${d.locale} ${d.namespace}.${d.key}` });
    revalidatePath("/admin/settings/localization");
    revalidatePath("/", "layout");
    return okState(undefined, "Saved.");
  });
}

/** Saves every `t:<key>` field in the editor for one locale + namespace. */
export async function saveTranslationsBulkAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("settings.manage", async (admin) => {
    const locale = String(formData.get("locale") ?? "").trim();
    const namespace = String(formData.get("namespace") ?? "common").trim() || "common";
    const loc = await db.locale.findUnique({ where: { code: locale } });
    if (!loc) return failState("Unknown locale.");
    let n = 0;
    for (const [name, raw] of formData.entries()) {
      if (!name.startsWith("t:") || typeof raw !== "string") continue;
      const key = name.slice(2);
      const value = raw.trim();
      const existing = await db.translation.findFirst({ where: { locale, namespace, key } });
      if (existing) {
        if (value === "") await db.translation.delete({ where: { id: existing.id } });
        else if (existing.value !== value) await db.translation.update({ where: { id: existing.id }, data: { value } });
        else continue;
      } else if (value !== "") await db.translation.create({ data: { locale, namespace, key, value } });
      else continue;
      n++;
    }
    await audit({ actor: actorOf(admin), action: "translation.bulk", targetType: "locale", targetId: locale, summary: `${n} translations updated (${namespace})` });
    revalidatePath("/admin/settings/localization");
    revalidatePath("/", "layout");
    return okState(undefined, `${n} translation${n === 1 ? "" : "s"} updated.`);
  });
}

export async function deleteTranslationAction(id: string): Promise<ActionState> {
  return runAdmin("settings.manage", async (admin) => {
    await db.translation.delete({ where: { id } });
    await audit({ actor: actorOf(admin), action: "translation.delete", targetType: "translation", targetId: id, summary: "Translation deleted" });
    revalidatePath("/admin/settings/localization");
    return okState(undefined, "Deleted.");
  });
}

export async function settingsKeyGuard(v: string) {
  return zOptionalTrimmed(10).parse(v);
}
