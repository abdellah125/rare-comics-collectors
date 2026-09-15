import { z } from "zod";
import { GUIDE_TOPIC_SLUGS } from "@/lib/guides/topics";

/**
 * Shape of a knowledge-base article as authored (admin form, JSON import, seed
 * files). Arrays may arrive as arrays or as comma/newline-separated strings.
 */
const list = z.preprocess(
  (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\n,]/) : []),
  z.array(z.string().trim().min(1).max(120)).max(40).transform((a) => [...new Set(a.map((s) => s.trim()).filter(Boolean))]),
);
const faqList = z.preprocess(
  (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v !== "string" || !v.trim()) return [];
    try {
      return JSON.parse(v);
    } catch {
      return "invalid";
    }
  },
  z.array(z.object({ q: z.string().trim().min(5).max(200), a: z.string().trim().min(10).max(2000) })).max(20),
);
const sourceList = z.preprocess(
  (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v !== "string" || !v.trim()) return [];
    return v
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, url] = line.split("|").map((s) => s.trim());
        return url ? { label, url } : { label };
      });
  },
  z.array(z.object({ label: z.string().trim().min(2).max(160), url: z.string().url().max(500).optional() })).max(20),
);
const optionalDate = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.coerce.date().optional());

export const ArticleInput = z.object({
  slug: z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: "Use lowercase letters, numbers and dashes" })
    .optional()
    .or(z.literal("")),
  title: z.string().trim().min(8, { error: "Write the question or headline in full" }).max(160),
  answer: z.string().trim().min(40, { error: "Give a direct answer of at least a sentence or two" }).max(700),
  body: z.string().trim().min(120, { error: "The article needs a proper body" }).max(60_000),
  topic: z.string().refine((t) => GUIDE_TOPIC_SLUGS.includes(t), { error: "Pick a topic" }),
  tags: list.default([]),
  characters: list.default([]),
  titles: list.default([]),
  publishers: list.default([]),
  faq: faqList.default([]),
  related: list.default([]),
  sources: sourceList.default([]),
  status: z.enum(["draft", "published"]).default("draft"),
  eventDate: optionalDate,
  authorName: z.string().trim().max(80).optional().or(z.literal("")),
  publishedAt: optionalDate,
});

export type ArticleInputValues = z.infer<typeof ArticleInput>;
