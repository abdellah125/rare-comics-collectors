"use client";

import { useActionState } from "react";
import { adminButton } from "@/components/admin/ui";
import { releaseDueNowAction, setReleasePausedAction } from "@/lib/admin/actions/release-queue";
import type { ActionState } from "@/lib/validation";

/** Pause / resume the daily releases and run the due batch by hand. */
export function ReleaseQueueControls({ paused, canManage }: { paused: boolean; canManage: boolean }) {
  const [pauseState, pauseAction, pausing] = useActionState<ActionState | undefined, FormData>(setReleasePausedAction, undefined);
  const [runState, runAction, running] = useActionState<ActionState | undefined, FormData>(releaseDueNowAction, undefined);
  const state = runState ?? pauseState;
  if (!canManage) return null;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={pauseAction}>
          <input type="hidden" name="paused" value={paused ? "false" : "true"} />
          <button type="submit" disabled={pausing} className={paused ? adminButton.primary : adminButton.outline}>
            {pausing ? "Saving…" : paused ? "Resume daily releases" : "Pause daily releases"}
          </button>
        </form>
        <form action={runAction}>
          <button type="submit" disabled={running || paused} className={adminButton.outline}>
            {running ? "Publishing…" : "Publish what is due now"}
          </button>
        </form>
      </div>
      {state?.message && (
        <p role={state.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-[13px] ${state.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-700"}`}>
          {state.message}
        </p>
      )}
    </div>
  );
}
