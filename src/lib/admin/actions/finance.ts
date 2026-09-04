"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { refreshExchangeRates } from "@/lib/currency";
import { cancelPayout } from "@/lib/finance/ledger";
import { markPayoutPaid, scheduleDuePayouts } from "@/lib/finance/payouts";
import { formatMoney } from "@/lib/money";
import { PROVIDER_IDS } from "@/lib/payments/registry";
import { getSettings, saveSettings, type Settings } from "@/lib/settings";
import { failState, fieldErrors, formToObject, okState, zBool, zId, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

/* ----------------------------------------------------------- payouts */

export async function payoutActionRun(id: string, action: "paid" | "processing" | "failed" | "cancel", reference?: string): Promise<ActionState> {
  return runAdmin("payouts.manage", async (admin) => {
    const payout = await db.payout.findUnique({ where: { id }, include: { seller: { select: { displayName: true } } } });
    if (!payout) return failState("Payout not found.");
    if (payout.status === "paid") return failState("Already paid.");
    if (action === "paid") {
      if (!reference?.trim()) return failState("Enter the bank/PayPal reference.");
      await markPayoutPaid(id, reference.trim(), { id: admin.id, email: admin.email });
    } else if (action === "processing") {
      await db.payout.update({ where: { id }, data: { status: "processing" } });
      await audit({ actor: actorOf(admin), action: "payout.processing", targetType: "payout", targetId: id, summary: `Payout to ${payout.seller.displayName} marked processing` });
    } else if (action === "failed") {
      await db.payout.update({ where: { id }, data: { status: "failed", failureReason: reference?.trim() || "Transfer failed" } });
      await audit({ actor: actorOf(admin), action: "payout.failed", targetType: "payout", targetId: id, summary: `Payout to ${payout.seller.displayName} failed: ${reference ?? ""}` });
    } else {
      await cancelPayout(id, reference?.trim() || "Cancelled by admin");
      await audit({ actor: actorOf(admin), action: "payout.cancel", targetType: "payout", targetId: id, summary: `Payout ${formatMoney(payout.amount)} to ${payout.seller.displayName} cancelled` });
    }
    revalidatePath(`/admin/finance/payouts/${id}`);
    revalidatePath("/admin/finance/payouts");
    return okState(undefined, `Payout ${action === "cancel" ? "cancelled" : action}.`);
  });
}

export async function runPayoutSchedulerAction(): Promise<ActionState> {
  return runAdmin("payouts.manage", async (admin) => {
    const r = await scheduleDuePayouts();
    await audit({ actor: actorOf(admin), action: "payout.schedule_run", summary: `Payout scheduler run: ${r.created} created, ${r.skipped} skipped` });
    revalidatePath("/admin/finance/payouts");
    return okState(undefined, `${r.created} payout${r.created === 1 ? "" : "s"} created, ${r.skipped} sellers skipped (below minimum, manual schedule or no method).`);
  });
}

/* --------------------------------------------------------- providers */

const ProviderSchema = z.object({ provider: z.enum(PROVIDER_IDS), enabled: zBool.optional(), currencies: zOptionalTrimmed(200), minAmount: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().int().min(0).optional()), instructions: zOptionalTrimmed(2000) });

export async function updateProviderAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("finance.manage", async (admin) => {
    const parsed = ProviderSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    const patch: Partial<Settings> = {};
    (patch as Record<string, unknown>)[`payments.${d.provider}.enabled`] = d.enabled ?? false;
    if (d.provider !== "test") {
      const codes = (d.currencies ?? "").split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{3}$/.test(s));
      if (codes.length > 0) (patch as Record<string, unknown>)[`payments.${d.provider}.currencies`] = codes;
    }
    if (d.provider === "bank_transfer") {
      if (d.minAmount !== undefined) patch["payments.bank_transfer.minAmount"] = d.minAmount;
      if (d.instructions) patch["payments.bank_transfer.instructions"] = d.instructions;
    }
    await saveSettings(patch, admin.id);
    await audit({ actor: actorOf(admin), action: "payments.provider", targetType: "setting", targetId: d.provider, summary: `${d.provider} ${d.enabled ? "enabled" : "disabled"}`, after: patch });
    revalidatePath("/admin/finance/payments");
    return okState(undefined, "Provider settings saved.");
  });
}

/* -------------------------------------------------------- currencies */

const CurrencySchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/), name: zTrimmed(60).min(2), symbol: zTrimmed(8).min(1), decimals: z.coerce.number().int().min(0).max(4).default(2), rateToBase: z.coerce.number().positive(), isEnabled: zBool.optional() });

export async function saveCurrencyAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("finance.manage", async (admin) => {
    const parsed = CurrencySchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    const existing = await db.currency.findUnique({ where: { code: d.code } });
    if (existing?.isBase && d.rateToBase !== 1) return failState("The base currency always has a rate of 1.");
    await db.currency.upsert({ where: { code: d.code }, create: { ...d, isEnabled: d.isEnabled ?? true, rateSource: "manual" }, update: { name: d.name, symbol: d.symbol, decimals: d.decimals, rateToBase: existing?.isBase ? 1 : d.rateToBase, isEnabled: existing?.isBase ? true : (d.isEnabled ?? false), rateSource: existing && existing.rateToBase !== d.rateToBase ? "manual" : existing?.rateSource } });
    await audit({ actor: actorOf(admin), action: "currency.save", targetType: "currency", targetId: d.code, summary: `Currency ${d.code} saved (rate ${d.rateToBase})` });
    revalidatePath("/admin/finance/currencies");
    return okState(undefined, `${d.code} saved.`);
  });
}

export async function setBaseCurrencyAction(code: string): Promise<ActionState> {
  return runAdmin("finance.manage", async (admin) => {
    const c = await db.currency.findUnique({ where: { code } });
    if (!c) return failState("Currency not found.");
    const orders = await db.order.count();
    if (orders > 0) return failState("The base currency can't change once orders exist — amounts are stored in base minor units.");
    await db.$transaction([db.currency.updateMany({ data: { isBase: false } }), db.currency.update({ where: { code }, data: { isBase: true, isEnabled: true, rateToBase: 1 } })]);
    await saveSettings({ "marketplace.baseCurrency": code }, admin.id);
    await audit({ actor: actorOf(admin), action: "currency.base", targetType: "currency", targetId: code, summary: `Base currency set to ${code}` });
    revalidatePath("/admin/finance/currencies");
    return okState(undefined, `${code} is now the base currency.`);
  });
}

export async function deleteCurrencyAction(code: string): Promise<ActionState> {
  return runAdmin("finance.manage", async (admin) => {
    const c = await db.currency.findUnique({ where: { code } });
    if (!c) return failState("Currency not found.");
    if (c.isBase) return failState("Can't delete the base currency.");
    const used = await db.order.count({ where: { currency: code } });
    if (used > 0) return failState("Orders were placed in this currency — disable it instead.");
    await db.currency.delete({ where: { code } });
    await audit({ actor: actorOf(admin), action: "currency.delete", targetType: "currency", targetId: code, summary: `Currency ${code} deleted` });
    revalidatePath("/admin/finance/currencies");
    return okState(undefined, "Currency deleted.");
  });
}

export async function refreshRatesAction(): Promise<ActionState> {
  return runAdmin("finance.manage", async (admin) => {
    try {
      const r = await refreshExchangeRates();
      await audit({ actor: actorOf(admin), action: "currency.refresh", summary: `Exchange rates refreshed (${r.updated} updated, base ${r.base})` });
      revalidatePath("/admin/finance/currencies");
      return okState(undefined, `${r.updated} rate${r.updated === 1 ? "" : "s"} updated.`);
    } catch (err) {
      return failState(`Rate provider error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}

/* --------------------------------------------------------------- tax */

const TaxSchema = z.object({ id: zOptionalTrimmed(64), countryCode: z.string().trim().toUpperCase().length(2), region: zOptionalTrimmed(80), label: zTrimmed(60).min(1), rateBps: z.coerce.number().int().min(0).max(10_000), appliesToShipping: zBool.optional(), isInclusive: zBool.optional(), priority: z.coerce.number().int().min(0).max(100).default(0), isActive: zBool.optional() });

export async function saveTaxRuleAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("finance.manage", async (admin) => {
    const parsed = TaxSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    const country = await db.country.findUnique({ where: { code: d.countryCode } });
    if (!country) return failState("Unknown country code.", { countryCode: "Unknown" });
    const data = { countryCode: d.countryCode, region: d.region?.toUpperCase() || null, label: d.label, rateBps: d.rateBps, appliesToShipping: d.appliesToShipping ?? false, isInclusive: d.isInclusive ?? false, priority: d.priority, isActive: d.isActive ?? true };
    const rule = d.id ? await db.taxRule.update({ where: { id: d.id }, data }) : await db.taxRule.create({ data });
    await audit({ actor: actorOf(admin), action: d.id ? "tax.update" : "tax.create", targetType: "tax", targetId: rule.id, summary: `Tax rule ${d.label} ${d.countryCode}${d.region ? `-${d.region}` : ""} ${d.rateBps / 100}%` });
    revalidatePath("/admin/finance/taxes");
    return okState(undefined, "Tax rule saved.");
  });
}

export async function deleteTaxRuleAction(id: string): Promise<ActionState> {
  return runAdmin("finance.manage", async (admin) => {
    await db.taxRule.delete({ where: { id } });
    await audit({ actor: actorOf(admin), action: "tax.delete", targetType: "tax", targetId: id, summary: "Tax rule deleted" });
    revalidatePath("/admin/finance/taxes");
    return okState(undefined, "Tax rule deleted.");
  });
}

/* -------------------------------------------------------- fee settings */

const FeesSchema = z.object({ commissionBps: z.coerce.number().int().min(0).max(10_000), buyerFeeBps: z.coerce.number().int().min(0).max(10_000), payoutSchedule: z.enum(["manual", "weekly", "biweekly", "monthly"]), minAmount: z.coerce.number().int().min(0), holdDays: z.coerce.number().int().min(0).max(90), taxMode: z.enum(["exclusive", "inclusive"]) });

export async function saveFeesAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("finance.manage", async (admin) => {
    const parsed = FeesSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    const before = await getSettings();
    await saveSettings({ "commerce.commissionBps": d.commissionBps, "commerce.buyerFeeBps": d.buyerFeeBps, "payouts.schedule": d.payoutSchedule, "payouts.minAmount": d.minAmount, "payouts.holdDays": d.holdDays, "commerce.taxMode": d.taxMode }, admin.id);
    await audit({ actor: actorOf(admin), action: "settings.fees", summary: "Commission / payout settings updated", before: { commission: before["commerce.commissionBps"], schedule: before["payouts.schedule"], min: before["payouts.minAmount"], hold: before["payouts.holdDays"] }, after: d });
    revalidatePath("/admin/finance");
    return okState(undefined, "Fees and payout rules saved.");
  });
}

export async function assertPayoutId(id: string) {
  z.string().parse(id);
  return zId.parse(id);
}
