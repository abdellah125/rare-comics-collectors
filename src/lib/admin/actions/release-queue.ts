"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { releaseDueListings } from "@/lib/catalog/release-queue";
import { saveSettings } from "@/lib/settings";
import { okState, type ActionState } from "@/lib/validation";

/** Pause or resume the daily release of queued catalogue imports. */
export async function setReleasePausedAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    const paused = formData.get("paused") === "true";
    await saveSettings({ "catalog.releasePaused": paused }, admin.id);
    await audit({ actor: actorOf(admin), action: "catalog.release_queue.pause", targetType: "setting", targetId: "catalog.releasePaused", summary: paused ? "Release queue paused" : "Release queue resumed" });
    revalidatePath("/admin/release-queue");
    return okState(undefined, paused ? "Releases are paused. Nothing goes live until you resume." : "Releases resumed. Due listings go live on the next run.");
  });
}

/** Runs the release check now instead of waiting for the nightly job (only what is already due). */
export async function releaseDueNowAction(): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    const result = await releaseDueListings();
    await audit({ actor: actorOf(admin), action: "catalog.release_queue.run", targetType: "release_queue", summary: `Release queue run by hand: ${result.released} published, ${result.blocked} blocked${result.paused ? " (paused)" : ""}` });
    revalidatePath("/admin/release-queue");
    if (result.paused) return okState(undefined, "The queue is paused; nothing was published.");
    return okState(undefined, `${result.released} listing(s) published, ${result.blocked} held back by the release check.`);
  });
}
