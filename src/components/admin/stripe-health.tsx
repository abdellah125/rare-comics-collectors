import { Tone } from "@/components/admin/ui";
import { stripeHealth } from "@/lib/payments/stripe-health";

/** The Stripe setup as the server sees it: key kinds and modes, and whether each permission the site uses works. */
export async function StripeHealth() {
  const h = await stripeHealth();
  return (
    <div data-testid="stripe-health">
      <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink-950">
        Connection check <Tone tone={h.ok ? "success" : "danger"}>{h.ok ? `ready · ${h.mode} mode` : "needs attention"}</Tone>
      </p>
      <ul className="grid gap-1 text-[13px]">
        {h.checks.map((c) => (
          <li key={c.name} className="flex flex-wrap gap-x-2">
            <span className={c.ok ? "text-emerald-700" : "text-rose-700"}>{c.ok ? "✓" : "✗"}</span>
            <span className="font-medium text-ink-900">{c.name}:</span>
            <span className="text-ink-600">{c.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
