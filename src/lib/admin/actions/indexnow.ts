"use server";

import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { describeIndexNowStatus, submitIndexNow } from "@/lib/indexnow";
import { site } from "@/lib/site";
import { failState, okState, type ActionState } from "@/lib/validation";

export type IndexNowSubmission = { status: number; meaning: string; submitted: number; keyLocation: string; urls: string[]; skipped?: string };

const MAX_URLS = 100;

/**
 * Manual IndexNow submission from the admin: one URL or path per line, on the canonical
 * origin only. Runs the same code path as the automatic pings, but synchronously, so the
 * endpoint's answer is shown instead of disappearing into the job log.
 */
export async function submitIndexNowAction(_prev: ActionState<IndexNowSubmission> | undefined, formData: FormData): Promise<ActionState<IndexNowSubmission>> {
  return runAdmin<IndexNowSubmission>("content.manage", async (admin) => {
    const raw = String(formData.get("urls") ?? "");
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return failState("Enter at least one URL or path, one per line.", { urls: "Required" });
    if (lines.length > MAX_URLS) return failState(`At most ${MAX_URLS} URLs per submission.`, { urls: `${lines.length} given` });
    const origin = site.url.replace(/\/+$/, "");
    const foreign = lines.filter((l) => /^https?:\/\//i.test(l) && !(l === origin || l.startsWith(`${origin}/`)));
    if (foreign.length) return failState(`Only URLs on ${origin} can be submitted with this key.`, { urls: foreign.slice(0, 3).join(", ") });
    const bad = lines.filter((l) => !/^https?:\/\//i.test(l) && !l.startsWith("/"));
    if (bad.length) return failState("Paths must start with / (or paste the full URL).", { urls: bad.slice(0, 3).join(", ") });

    const result = await submitIndexNow(lines);
    const data: IndexNowSubmission = { status: result.status, meaning: result.skipped ? `Not sent: ${result.skipped}.` : describeIndexNowStatus(result.status), submitted: result.submitted, keyLocation: result.keyLocation, urls: result.urls, skipped: result.skipped };
    await audit({ actor: actorOf(admin), action: "indexnow.submit", targetType: "indexnow", targetId: result.keyLocation, summary: `IndexNow: ${result.urls.length} url(s) → ${result.skipped ?? result.status}` });
    if (!result.ok) return { ok: false, message: `IndexNow answered ${result.status}. ${data.meaning}`, errors: { urls: `${result.urls.length} URL(s) sent, keyLocation ${result.keyLocation}` } };
    return okState(data, result.skipped ? `Nothing was sent (${result.skipped}).` : `IndexNow answered ${result.status} for ${result.submitted} URL(s).`);
  });
}
