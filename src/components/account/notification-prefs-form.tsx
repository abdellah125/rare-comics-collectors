"use client";

import { useActionState } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { updateNotificationPrefsAction } from "@/lib/account/actions";

const OPTIONS: { key: "orderUpdates" | "sellerAlerts" | "supportReplies" | "productAlerts" | "marketing"; label: string; hint: string }[] = [
  { key: "orderUpdates", label: "Order updates", hint: "Confirmations, shipping, delivery and refunds." },
  { key: "sellerAlerts", label: "Seller alerts", hint: "New sales, payouts, disputes and listing reviews (sellers only)." },
  { key: "supportReplies", label: "Support replies", hint: "When our team answers a ticket." },
  { key: "productAlerts", label: "Wishlist & price alerts", hint: "Books you follow drop in price or come back in stock." },
  { key: "marketing", label: "New arrivals & offers", hint: "Occasional emails about new inventory and sales." },
];

export function NotificationPrefsForm({ prefs }: { prefs: Record<(typeof OPTIONS)[number]["key"], boolean> }) {
  const [state, action, pending] = useActionState(updateNotificationPrefsAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      {OPTIONS.map((o) => (
        <label key={o.key} className="flex items-start gap-3 text-sm">
          <input type="checkbox" name={o.key} defaultChecked={prefs[o.key]} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
          <span>
            <span className="block font-medium text-ink-950">{o.label}</span>
            <span className="block text-[13px] text-ink-600">{o.hint}</span>
          </span>
        </label>
      ))}
      <FormError state={state} />
      <FormSuccess state={state} />
      <div>
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.md}`}>
          {pending ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </form>
  );
}
