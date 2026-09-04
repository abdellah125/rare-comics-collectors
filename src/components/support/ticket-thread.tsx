"use client";

import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { TextAreaField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { closeOwnTicketAction, replyTicketAction } from "@/lib/support/actions";

export type TicketMsg = { id: string; authorType: string; authorName: string; body: string; createdAt: string; attachments: string[] };

export function TicketThread({ ticketId, status, messages }: { ticketId: string; status: string; messages: TicketMsg[] }) {
  const [state, action, pending] = useActionState(replyTicketAction, undefined);
  const router = useRouter();
  const [closing, startClose] = useTransition();
  const closed = status === "closed";
  return (
    <div className="grid gap-5">
      <ol className="grid gap-3">
        {messages.map((m) => (
          <li key={m.id} className={`rounded-lg px-4 py-3 text-sm ${m.authorType === "agent" ? "bg-brand-50" : m.authorType === "system" ? "bg-ink-100" : "bg-ink-50"}`}>
            <p className="flex flex-wrap justify-between gap-2 text-[12px] text-ink-500">
              <span className="font-semibold text-ink-800">{m.authorName}</span>
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
      {closed ? (
        <p className="text-sm text-ink-600">This ticket is closed. Open a new one if you need anything else.</p>
      ) : (
        <form action={action} className="grid gap-3">
          <input type="hidden" name="ticketId" value={ticketId} />
          <TextAreaField label="Reply" name="body" rows={4} required />
          <label className="text-[13px] text-ink-600">
            Attachments
            <input type="file" name="attachments" multiple accept="image/*,application/pdf" className="mt-1 block text-[13px]" />
          </label>
          <FormError state={state} />
          <FormSuccess state={state} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.md}`}>
              {pending ? "Sending…" : "Send reply"}
            </button>
            <button
              type="button"
              disabled={closing}
              className={`${buttonStyles.quiet} ${buttonSizes.md}`}
              onClick={() =>
                startClose(async () => {
                  await closeOwnTicketAction(ticketId);
                  router.refresh();
                })
              }
            >
              {closing ? "Closing…" : "Mark as resolved"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
