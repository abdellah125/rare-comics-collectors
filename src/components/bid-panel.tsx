"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { usePrice } from "@/components/currency-provider";
import { useT } from "@/components/i18n-provider";
import { CheckIcon } from "@/components/icons";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { placeBidAction } from "@/lib/commerce/bid-actions";
import { minimumBid } from "@/lib/commerce/bids";

/**
 * Bid form for a product sold by bidding. It replaces the Buy now / Add to cart buttons: the
 * product cannot be bought outright. Bids are in US dollars; nothing is charged when one is placed.
 */
export function BidPanel({ slug, currentBid, closed }: { slug: string; currentBid: number; closed: boolean }) {
  const tr = useT();
  const router = useRouter();
  const { user } = useAuth();
  const { formatExact } = usePrice();
  const [state, action, pending] = useActionState(placeBidAction, undefined);
  // Controlled: a form is reset after its action runs, and a refused bid must not wipe what was typed.
  const [amount, setAmount] = useState("");
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const min = minimumBid(currentBid);
  const err = (k: string) => (state && !state.ok ? state.errors?.[k] : undefined);

  useEffect(() => {
    if (state?.ok) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (closed) return <p className="text-sm font-medium text-rose-700">{tr("Bidding on this product has closed.")}</p>;
  if (state?.ok) {
    return (
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-5" role="status" data-testid="bid-received">
        <p className="flex items-center gap-2 font-display text-lg font-semibold text-ink-950">
          <CheckIcon className="h-5 w-5 text-brand-700" /> {tr("Bid received")}
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-700">{tr("Your bid of {amount} has been received. You are the highest bidder for now. Nothing has been charged: we will contact you if your bid wins.", { amount: state.data?.amount ?? "" })}</p>
      </div>
    );
  }
  const field = "h-11 w-full rounded-lg border border-ink-300 bg-white px-3 text-[15px] text-ink-900 focus:border-brand-500";
  return (
    <form action={action} className="grid gap-3" data-testid="bid-form">
      <input type="hidden" name="slug" value={slug} />
      <label className="grid gap-1 text-[13px] font-medium text-ink-800">
        {tr("Your bid (US$)")}
        <input name="amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={(min / 100).toFixed(2)} className={field} aria-describedby="bid-min" />
        <span id="bid-min" className="font-normal text-ink-500">
          {tr("Minimum bid: {amount}", { amount: formatExact(min) })}
        </span>
        {err("amount") && <span className="font-normal text-rose-700">{err("amount")}</span>}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[13px] font-medium text-ink-800">
          {tr("Name")}
          <input name="name" required autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={field} />
          {err("name") && <span className="font-normal text-rose-700">{err("name")}</span>}
        </label>
        <label className="grid gap-1 text-[13px] font-medium text-ink-800">
          {tr("Email")}
          <input name="email" type="email" required autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          {err("email") && <span className="font-normal text-rose-700">{err("email")}</span>}
        </label>
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {state && !state.ok && state.message && (
        <p role="alert" className="text-[13px] text-rose-700">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.lg} w-full`}>
        {pending ? tr("Placing bid…") : tr("Place bid")}
      </button>
      <p className="text-xs leading-relaxed text-ink-500">{tr("A bid is an offer to buy at that price, not a payment. Nothing is charged now; we contact the winning bidder to arrange payment and shipping.")}</p>
    </form>
  );
}
