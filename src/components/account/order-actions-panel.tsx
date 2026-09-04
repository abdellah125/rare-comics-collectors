"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { Panel } from "@/components/account/ui";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { cancelOwnOrderAction, openDisputeAction, requestReturnAction, submitReviewAction } from "@/lib/account/order-actions";
import { DISPUTE_REASONS, RETURN_REASONS, statusLabel } from "@/lib/domain";

type Item = { id: string; title: string; qty: number; refundedQty: number; status: string; productId: string | null; reviewed: boolean; returnOpen: boolean };

export function OrderActionsPanel({ order, items, returnWindowOpen, returnWindowDays, disputeOpen, disputesEnabled, reviewsEnabled }: { order: { id: string; number: string; status: string; paymentStatus: string }; items: Item[]; returnWindowOpen: boolean; returnWindowDays: number; disputeOpen: boolean; disputesEnabled: boolean; reviewsEnabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"none" | "return" | "dispute" | "review">("none");
  const [message, setMessage] = useState<string | null>(null);
  const delivered = ["delivered", "completed"].includes(order.status);
  const paid = order.paymentStatus !== "unpaid" && !["cancelled", "failed"].includes(order.status);
  const returnable = items.filter((i) => i.qty - i.refundedQty > 0 && !i.returnOpen && (delivered || i.status === "delivered"));
  const reviewable = items.filter((i) => i.productId && !i.reviewed && (delivered || i.status === "delivered"));

  return (
    <Panel title="Need something?" description="Cancel an unpaid order, start a return, open a dispute or leave a review.">
      <div className="flex flex-wrap gap-2">
        {order.status === "pending_payment" && (
          <button
            type="button"
            disabled={pending}
            className={`${buttonStyles.outline} ${buttonSizes.sm}`}
            onClick={() => {
              if (!window.confirm("Cancel this order? Reserved items go back on sale.")) return;
              start(async () => {
                const res = await cancelOwnOrderAction(order.id);
                setMessage(res.message ?? null);
                router.refresh();
              });
            }}
          >
            {pending ? "Cancelling…" : "Cancel order"}
          </button>
        )}
        {returnable.length > 0 && returnWindowOpen && (
          <button type="button" className={`${buttonStyles.outline} ${buttonSizes.sm}`} onClick={() => setMode(mode === "return" ? "none" : "return")}>
            Request a return
          </button>
        )}
        {paid && disputesEnabled && !disputeOpen && (
          <button type="button" className={`${buttonStyles.outline} ${buttonSizes.sm}`} onClick={() => setMode(mode === "dispute" ? "none" : "dispute")}>
            Open a dispute
          </button>
        )}
        {reviewsEnabled && reviewable.length > 0 && (
          <button type="button" className={`${buttonStyles.outline} ${buttonSizes.sm}`} onClick={() => setMode(mode === "review" ? "none" : "review")}>
            Write a review
          </button>
        )}
        <Link href={`/account/support?order=${order.number}`} className={`${buttonStyles.quiet} ${buttonSizes.sm}`}>
          Contact support about this order
        </Link>
      </div>
      {delivered && !returnWindowOpen && <p className="mt-3 text-[13px] text-ink-500">The {returnWindowDays}-day return window has closed. Support can still help with problems.</p>}
      {message && (
        <p role="status" className="mt-3 text-sm text-brand-800">
          {message}
        </p>
      )}
      {mode === "return" && <ReturnForm orderId={order.id} items={returnable} onDone={() => setMode("none")} />}
      {mode === "dispute" && <DisputeForm orderId={order.id} items={items} onDone={() => setMode("none")} />}
      {mode === "review" && <ReviewForm items={reviewable} onDone={() => setMode("none")} />}
    </Panel>
  );
}

function ReturnForm({ orderId, items, onDone }: { orderId: string; items: Item[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(requestReturnAction, undefined);
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const item = items.find((i) => i.id === itemId);
  return (
    <form action={action} className="mt-5 grid gap-4 rounded-lg border border-ink-200 bg-ink-50 p-4">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Item" name="orderItemId" value={itemId} onChange={(e) => setItemId(e.target.value)} required>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title}
            </option>
          ))}
        </SelectField>
        <TextField label="Quantity" name="qty" type="number" min={1} max={item ? item.qty - item.refundedQty : 1} defaultValue={1} required />
        <SelectField label="Reason" name="reason" required className="sm:col-span-2">
          {RETURN_REASONS.map((r) => (
            <option key={r} value={r}>
              {statusLabel(r)}
            </option>
          ))}
        </SelectField>
        <TextAreaField label="Details (optional)" name="details" rows={3} className="sm:col-span-2" placeholder="What's wrong with the book?" />
      </div>
      <FormError state={state} />
      <FormSuccess state={state} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending || state?.ok} className={`${buttonStyles.primary} ${buttonSizes.md}`}>
          {pending ? "Sending…" : "Send return request"}
        </button>
        <button type="button" onClick={onDone} className={`${buttonStyles.quiet} ${buttonSizes.md}`}>
          {state?.ok ? "Done" : "Cancel"}
        </button>
      </div>
    </form>
  );
}

function DisputeForm({ orderId, items, onDone }: { orderId: string; items: Item[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(openDisputeAction, undefined);
  return (
    <form action={action} className="mt-5 grid gap-4 rounded-lg border border-ink-200 bg-ink-50 p-4">
      <input type="hidden" name="orderId" value={orderId} />
      <p className="text-[13px] text-ink-600">Try messaging the seller or support first — most problems are solved in a day. A dispute pauses the seller&apos;s payout until it&apos;s resolved.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Item" name="orderItemId">
          <option value="">Whole order</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title}
            </option>
          ))}
        </SelectField>
        <SelectField label="Reason" name="reason" required>
          {DISPUTE_REASONS.map((r) => (
            <option key={r} value={r}>
              {statusLabel(r)}
            </option>
          ))}
        </SelectField>
        <TextAreaField label="What happened?" name="details" required rows={4} className="sm:col-span-2" placeholder="Describe the problem and what outcome you're looking for." />
      </div>
      <FormError state={state} />
      <FormSuccess state={state} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending || state?.ok} className={`${buttonStyles.primary} ${buttonSizes.md}`}>
          {pending ? "Opening…" : "Open dispute"}
        </button>
        <button type="button" onClick={onDone} className={`${buttonStyles.quiet} ${buttonSizes.md}`}>
          {state?.ok ? "Done" : "Cancel"}
        </button>
      </div>
    </form>
  );
}

function ReviewForm({ items, onDone }: { items: Item[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(submitReviewAction, undefined);
  return (
    <form action={action} className="mt-5 grid gap-4 rounded-lg border border-ink-200 bg-ink-50 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Item" name="orderItemId" required>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title}
            </option>
          ))}
        </SelectField>
        <SelectField label="Rating" name="rating" required defaultValue="5">
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {r} star{r === 1 ? "" : "s"}
            </option>
          ))}
        </SelectField>
        <TextField label="Title (optional)" name="title" className="sm:col-span-2" placeholder="Exactly as described" />
        <TextAreaField label="Your review" name="body" required rows={4} className="sm:col-span-2" placeholder="Condition, packaging, communication…" />
      </div>
      <FormError state={state} />
      <FormSuccess state={state} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending || state?.ok} className={`${buttonStyles.primary} ${buttonSizes.md}`}>
          {pending ? "Posting…" : "Post review"}
        </button>
        <button type="button" onClick={onDone} className={`${buttonStyles.quiet} ${buttonSizes.md}`}>
          {state?.ok ? "Done" : "Cancel"}
        </button>
      </div>
    </form>
  );
}
