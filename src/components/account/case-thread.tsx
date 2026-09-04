"use client";

import { useActionState } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { TextAreaField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { addCaseMessageAction } from "@/lib/account/order-actions";

export type ThreadMessage = { id: string; authorRole: string; authorName: string; body: string; createdAt: string; attachments: string[]; isInternal?: boolean };

/** Message thread for a return or dispute, shared by buyers, sellers and admins. */
export function CaseThread({ caseType, caseId, messages, closed, action = addCaseMessageAction, allowInternal = false }: { caseType: "return" | "dispute"; caseId: string; messages: ThreadMessage[]; closed: boolean; action?: typeof addCaseMessageAction; allowInternal?: boolean }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <div className="grid gap-4">
      <ol className="grid gap-3">
        {messages.length === 0 && <li className="text-sm text-ink-500">No messages yet.</li>}
        {messages.map((m) => (
          <li key={m.id} className={`rounded-lg px-4 py-3 text-sm ${m.isInternal ? "bg-amber-50 ring-1 ring-amber-200" : m.authorRole === "admin" ? "bg-brand-50" : m.authorRole === "seller" ? "bg-gold-400/10" : "bg-ink-50"}`}>
            <p className="flex flex-wrap justify-between gap-2 text-[12px] text-ink-500">
              <span>
                <span className="font-semibold text-ink-800">{m.authorName}</span> · {m.authorRole}{m.isInternal && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">Internal</span>}
              </span>
              <span>{new Date(m.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
            </p>
            <p className="mt-1 whitespace-pre-line text-ink-800">{m.body}</p>
            {m.attachments.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {m.attachments.map((id) => (
                  <li key={id}>
                    <a href={`/api/media/${id}`} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-brand-700 underline">
                      Attachment
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {!closed && (
        <form action={formAction} className="grid gap-3">
          <input type="hidden" name="caseType" value={caseType} />
          <input type="hidden" name="caseId" value={caseId} />
          <TextAreaField label="Reply" name="body" rows={3} required placeholder="Add details, photos or a proposed resolution." />
          <label className="text-[13px] text-ink-600">
            Attachments (up to 5 images/PDFs)
            <input type="file" name="attachments" multiple accept="image/*,application/pdf" className="mt-1 block text-[13px]" />
          </label>
          {allowInternal && (
            <label className="flex items-center gap-2 text-[13px] text-ink-700">
              <input type="checkbox" name="internal" className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Internal note (hidden from buyer and seller)
            </label>
          )}
          <FormError state={state} />
          <FormSuccess state={state} />
          <div>
            <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.sm}`}>
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
