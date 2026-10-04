import type { AppLocale } from "@/lib/i18n/config";
import type { Dict } from "@/lib/i18n/translate";
import { de } from "./de";
import { es } from "./es";
import { fr } from "./fr";

/** Translations shipped with the site, keyed by the English source text. English has no dictionary. */
export const MESSAGES: Partial<Record<AppLocale, Dict>> = { es, fr, de };
