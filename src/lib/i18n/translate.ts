/**
 * Translation by source text. Copy is written in English in the components and wrapped in
 * `tr("…")`; a dictionary maps the English sentence to its translation, and a sentence with no
 * entry is shown in English. Placeholders are written {name} and filled after the lookup.
 */
export type Dict = Record<string, string>;
export type Vars = Record<string, string | number>;
export type Translator = (text: string, vars?: Vars) => string;

export function translate(dict: Dict | null | undefined, text: string, vars?: Vars): string {
  const found = dict?.[text] ?? text;
  if (!vars) return found;
  return found.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

export const makeTranslator = (dict: Dict | null | undefined): Translator => (text, vars) => translate(dict, text, vars);

/** Marks a string in a data file as translatable; the page translates it when it renders. */
export const msg = <T extends string>(text: T): T => text;
