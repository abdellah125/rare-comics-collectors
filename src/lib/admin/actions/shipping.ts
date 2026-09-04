"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { failState, fieldErrors, formToObject, okState, zBool, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

const ZoneSchema = z.object({ id: zOptionalTrimmed(64), name: zTrimmed(80).min(2), position: z.coerce.number().int().min(0).default(0), isActive: zBool.optional() });

export async function saveZoneAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("shipping.manage", async (admin) => {
    const parsed = ZoneSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    const data = { name: d.name, position: d.position, isActive: d.isActive ?? true };
    const zone = d.id ? await db.shippingZone.update({ where: { id: d.id }, data }) : await db.shippingZone.create({ data });
    await audit({ actor: actorOf(admin), action: d.id ? "shipping.zone.update" : "shipping.zone.create", targetType: "shipping_zone", targetId: zone.id, summary: `Zone ${d.name}` });
    revalidatePath("/admin/shipping");
    return okState(undefined, "Zone saved.");
  });
}

export async function deleteZoneAction(id: string): Promise<ActionState> {
  return runAdmin("shipping.manage", async (admin) => {
    const zone = await db.shippingZone.findUnique({ where: { id }, include: { _count: { select: { countries: true } } } });
    if (!zone) return failState("Zone not found.");
    if (zone._count.countries > 0) return failState("Reassign its countries first.");
    await db.shippingZone.delete({ where: { id } });
    await audit({ actor: actorOf(admin), action: "shipping.zone.delete", targetType: "shipping_zone", targetId: id, summary: `Zone ${zone.name} deleted` });
    revalidatePath("/admin/shipping");
    return okState(undefined, "Zone deleted.");
  });
}

const MethodSchema = z.object({
  id: zOptionalTrimmed(64),
  zoneId: zTrimmed(64).min(1),
  name: zTrimmed(80).min(2),
  description: zOptionalTrimmed(300),
  carrierId: zOptionalTrimmed(64),
  price: z.coerce.number().min(0),
  freeOverSubtotal: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().min(0).optional()),
  minSubtotal: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().min(0).optional()),
  maxSubtotal: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().min(0).optional()),
  estimatedDaysMin: z.coerce.number().int().min(0).max(60),
  estimatedDaysMax: z.coerce.number().int().min(0).max(90),
  requiresSignature: zBool.optional(),
  isInsured: zBool.optional(),
  isActive: zBool.optional(),
  position: z.coerce.number().int().min(0).default(0),
});

export async function saveMethodAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("shipping.manage", async (admin) => {
    const parsed = MethodSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    if (d.estimatedDaysMax < d.estimatedDaysMin) return failState("Max days must be ≥ min days.", { estimatedDaysMax: "Too small" });
    const data = {
      zoneId: d.zoneId,
      name: d.name,
      description: d.description ?? null,
      carrierId: d.carrierId || null,
      price: Math.round(d.price * 100),
      freeOverSubtotal: d.freeOverSubtotal !== undefined ? Math.round(d.freeOverSubtotal * 100) : null,
      minSubtotal: d.minSubtotal !== undefined ? Math.round(d.minSubtotal * 100) : null,
      maxSubtotal: d.maxSubtotal !== undefined ? Math.round(d.maxSubtotal * 100) : null,
      estimatedDaysMin: d.estimatedDaysMin,
      estimatedDaysMax: d.estimatedDaysMax,
      requiresSignature: d.requiresSignature ?? false,
      isInsured: d.isInsured ?? false,
      isActive: d.isActive ?? true,
      position: d.position,
    };
    const m = d.id ? await db.shippingMethod.update({ where: { id: d.id }, data }) : await db.shippingMethod.create({ data });
    await audit({ actor: actorOf(admin), action: d.id ? "shipping.method.update" : "shipping.method.create", targetType: "shipping_method", targetId: m.id, summary: `Shipping method ${d.name} (${d.price})` });
    revalidatePath("/admin/shipping");
    return okState(undefined, "Shipping method saved.");
  });
}

export async function deleteMethodAction(id: string): Promise<ActionState> {
  return runAdmin("shipping.manage", async (admin) => {
    const m = await db.shippingMethod.findUnique({ where: { id } });
    if (!m) return failState("Method not found.");
    await db.shippingMethod.delete({ where: { id } });
    await audit({ actor: actorOf(admin), action: "shipping.method.delete", targetType: "shipping_method", targetId: id, summary: `Shipping method ${m.name} deleted` });
    revalidatePath("/admin/shipping");
    return okState(undefined, "Method deleted.");
  });
}

const CarrierSchema = z.object({ id: zOptionalTrimmed(64), code: zTrimmed(30).min(2).toLowerCase(), name: zTrimmed(80).min(2), trackingUrlTemplate: zOptionalTrimmed(300), isActive: zBool.optional() });

export async function saveCarrierAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("shipping.manage", async (admin) => {
    const parsed = CarrierSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    if (d.trackingUrlTemplate && !/^https:\/\/.*\{tracking\}/.test(d.trackingUrlTemplate)) return failState("Tracking template must be an https URL containing {tracking}.", { trackingUrlTemplate: "Needs {tracking}" });
    const clash = await db.carrier.findFirst({ where: { code: d.code, ...(d.id ? { NOT: { id: d.id } } : {}) } });
    if (clash) return failState("Code already used.", { code: "In use" });
    const data = { code: d.code, name: d.name, trackingUrlTemplate: d.trackingUrlTemplate ?? null, isActive: d.isActive ?? true };
    const c = d.id ? await db.carrier.update({ where: { id: d.id }, data }) : await db.carrier.create({ data });
    await audit({ actor: actorOf(admin), action: d.id ? "shipping.carrier.update" : "shipping.carrier.create", targetType: "carrier", targetId: c.id, summary: `Carrier ${d.name}` });
    revalidatePath("/admin/shipping/carriers");
    return okState(undefined, "Carrier saved.");
  });
}

export async function deleteCarrierAction(id: string): Promise<ActionState> {
  return runAdmin("shipping.manage", async (admin) => {
    await db.carrier.delete({ where: { id } });
    await audit({ actor: actorOf(admin), action: "shipping.carrier.delete", targetType: "carrier", targetId: id, summary: "Carrier deleted" });
    revalidatePath("/admin/shipping/carriers");
    return okState(undefined, "Carrier deleted.");
  });
}

const CountrySchema = z.object({
  code: z.string().trim().toUpperCase().length(2),
  name: zTrimmed(80).min(2),
  region: zOptionalTrimmed(40),
  currencyCode: zOptionalTrimmed(3),
  shippingZoneId: zOptionalTrimmed(64),
  isEnabled: zBool.optional(),
  buyersAllowed: zBool.optional(),
  sellersAllowed: zBool.optional(),
  postalCodeRequired: zBool.optional(),
  regionRequired: zBool.optional(),
  restrictionNote: zOptionalTrimmed(300),
});

export async function saveCountryAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("shipping.manage", async (admin) => {
    const parsed = CountrySchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    const data = { name: d.name, region: d.region ?? null, currencyCode: d.currencyCode?.toUpperCase() || null, shippingZoneId: d.shippingZoneId || null, isEnabled: d.isEnabled ?? false, buyersAllowed: d.buyersAllowed ?? false, sellersAllowed: d.sellersAllowed ?? false, postalCodeRequired: d.postalCodeRequired ?? false, regionRequired: d.regionRequired ?? false, restrictionNote: d.restrictionNote ?? null };
    await db.country.upsert({ where: { code: d.code }, create: { code: d.code, ...data }, update: data });
    await audit({ actor: actorOf(admin), action: "shipping.country", targetType: "country", targetId: d.code, summary: `Country ${d.code} updated (${d.isEnabled ? "enabled" : "disabled"}, buyers ${d.buyersAllowed ? "yes" : "no"}, sellers ${d.sellersAllowed ? "yes" : "no"})` });
    revalidatePath("/admin/shipping/countries");
    return okState(undefined, `${d.code} saved.`);
  });
}

export async function bulkCountriesAction(actionId: string, codes: string[]): Promise<ActionState> {
  return runAdmin("shipping.manage", async (admin) => {
    const where = { code: { in: codes.slice(0, 300) } };
    if (actionId === "enable") await db.country.updateMany({ where, data: { isEnabled: true, buyersAllowed: true } });
    else if (actionId === "disable") await db.country.updateMany({ where, data: { isEnabled: false, buyersAllowed: false, sellersAllowed: false } });
    else if (actionId === "allow_sellers") await db.country.updateMany({ where, data: { sellersAllowed: true } });
    else if (actionId === "block_sellers") await db.country.updateMany({ where, data: { sellersAllowed: false } });
    else if (actionId.startsWith("zone:")) await db.country.updateMany({ where, data: { shippingZoneId: actionId.slice(5) || null } });
    else return failState("Unknown action.");
    await audit({ actor: actorOf(admin), action: `shipping.country.bulk.${actionId}`, targetType: "country", summary: `${actionId} on ${codes.length} countries`, after: codes });
    revalidatePath("/admin/shipping/countries");
    return okState(undefined, `${codes.length} countries updated.`);
  });
}
