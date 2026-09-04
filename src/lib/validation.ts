import { z } from "zod";

export type FieldErrors = Record<string, string>;

/** Flattens zod issues into { fieldPath: firstMessage }. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String).join(".") || "_form";
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

/** Common shape returned by server actions used with useActionState. */
export type ActionState<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; message?: string; errors?: FieldErrors };

export const okState = <T>(data?: T, message?: string): ActionState<T> => ({ ok: true, data, message });
export const failState = (message: string, errors?: FieldErrors): ActionState<never> => ({ ok: false, message, errors });

/** Turns FormData into a plain object; repeated keys become arrays. */
export function formToObject(fd: FormData): Record<string, string | string[]> {
  const obj: Record<string, string | string[]> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const val = typeof v === "string" ? v : v.name;
    if (k in obj) {
      const cur = obj[k];
      obj[k] = Array.isArray(cur) ? [...cur, val] : [cur, val];
    } else obj[k] = val;
  }
  return obj;
}

export const zTrimmed = (max = 200) => z.string().trim().max(max);
export const zOptionalTrimmed = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
export const zEmail = z.email({ error: "Enter a valid email address" }).trim().toLowerCase().max(200);
export const zPassword = z
  .string()
  .min(10, { error: "Use at least 10 characters" })
  .max(200)
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), { error: "Include at least one letter and one number" });
export const zMoney = z.coerce
  .number()
  .finite()
  .nonnegative()
  .transform((v) => Math.round(v * 100));
export const zInt = z.coerce.number().int();
export const zBool = z.preprocess((v) => v === "on" || v === "true" || v === true || v === "1", z.boolean());
export const zId = z.string().min(1).max(64);
export const zCountry = z.string().length(2).toUpperCase();
export const zSlug = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: "Use lowercase letters, numbers and dashes" });
export const zDateOptional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.coerce.date().optional(),
);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}
