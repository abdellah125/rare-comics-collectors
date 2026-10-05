"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Field, adminButton } from "@/components/admin/ui";
import { uploadImportAction } from "@/lib/admin/actions/imports";
import type { ActionState } from "@/lib/validation";

/** Upload of source data files. Everything uploaded goes to the review queue; nothing is published from here. */
export function ImportUploadForm() {
  const [state, action, pending] = useActionState<ActionState | undefined, FormData>(uploadImportAction, undefined);
  const router = useRouter();
  useEffect(() => {
    if (state) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={action} className="grid gap-4" aria-busy={pending}>
      <Field label="Data files (CSV or JSON)" hint="The search-result export, or a file with the columns id, url, title, price, image and, when you have them, publisher, year, issue, grade, grader, cert, availability. Up to 4 MB per upload.">
        <input type="file" name="files" accept=".csv,.json,text/csv,application/json" multiple required className="block text-[13px]" />
      </Field>
      <label className="flex items-start gap-2 text-[13px] text-ink-800">
        <input type="checkbox" name="snapshot" className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
        <span>
          This single file is the complete current catalogue
          <span className="block text-[12px] text-ink-500">Products missing from it are marked unavailable: queued ones leave the release flow and released ones are set to sold out. Leave this off for partial exports such as search-result pages. It is ignored when the file would mark more than a fifth of the catalogue unavailable.</span>
        </span>
      </label>
      {state?.message && (
        <p role={state.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-[13px] ${state.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-700"}`}>
          {state.message}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className={adminButton.primary}>
          {pending ? "Importing…" : "Import to review queue"}
        </button>
      </div>
    </form>
  );
}
