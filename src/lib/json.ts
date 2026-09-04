/**
 * The schema stores JSON as text (portable across SQLite/Postgres/MySQL).
 * These helpers make reading it back safe: bad data never throws at render time.
 */
export function parseJsonArray<T = string>(raw: string | null | undefined, guard?: (v: unknown) => v is T): T[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return guard ? v.filter(guard) : (v as T[]);
  } catch {
    return [];
  }
}

export function parseJsonObject<T extends object = Record<string, unknown>>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as T) : null;
  } catch {
    return null;
  }
}

export function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export const isString = (v: unknown): v is string => typeof v === "string";

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}
