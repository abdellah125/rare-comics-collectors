/**
 * Status vocabularies shared by the database layer, server actions and UI.
 * The schema stores these as plain strings; zod schemas in the actions accept
 * only the values listed here.
 */
export const USER_STATUSES = ["active", "restricted", "suspended", "banned"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const USER_RESTRICTIONS = ["no_purchase", "no_sell", "no_review", "no_support"] as const;
export type UserRestriction = (typeof USER_RESTRICTIONS)[number];

export const SELLER_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;
export const VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected"] as const;
export const PAYOUT_METHODS = ["bank", "paypal", "stripe_connect", "manual"] as const;

export const PRODUCT_STATUSES = ["draft", "pending", "published", "hidden", "suspended", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const ERAS = ["Golden Age", "Silver Age", "Bronze Age", "Copper Age", "Modern Age"] as const;
export const GRADERS = ["CGC", "CBCS", "Raw"] as const;
export const GRADES = ["0.5", "1.0", "1.5", "1.8", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5", "5.0", "5.5", "6.0", "6.5", "7.0", "7.5", "8.0", "8.5", "9.0", "9.2", "9.4", "9.6", "9.8", "9.9", "10.0"] as const;
export const LABELS = ["Universal Blue", "Signature Series (Yellow)", "Restored (Purple)", "Qualified (Green)", "Ungraded"] as const;

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "processing",
  "partially_shipped",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
  "refunded",
  "partially_refunded",
  "failed",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const PAYMENT_STATUSES = ["unpaid", "authorized", "paid", "partially_refunded", "refunded", "failed"] as const;
export const FULFILLMENT_STATUSES = ["unfulfilled", "partial", "fulfilled", "delivered"] as const;
export const ORDER_ITEM_STATUSES = ["pending", "paid", "processing", "shipped", "delivered", "cancelled", "returned", "refunded"] as const;
export const PAYMENT_RECORD_STATUSES = ["pending", "requires_action", "authorized", "succeeded", "failed", "cancelled", "refunded", "partially_refunded"] as const;
export const REFUND_REASONS = ["requested_by_customer", "duplicate", "fraudulent", "return", "dispute", "goodwill", "other"] as const;
export const SHIPMENT_STATUSES = ["pending", "shipped", "in_transit", "out_for_delivery", "delivered", "exception", "returned"] as const;

export const RETURN_STATUSES = ["requested", "approved", "rejected", "shipped_back", "received", "refunded", "closed"] as const;
export const RETURN_REASONS = ["not_as_described", "damaged_in_transit", "changed_mind", "wrong_item", "counterfeit_concern", "other"] as const;
export const DISPUTE_STATUSES = ["open", "awaiting_seller", "awaiting_buyer", "under_review", "escalated", "resolved", "closed"] as const;
export const DISPUTE_REASONS = ["item_not_received", "not_as_described", "damaged", "counterfeit", "unpaid", "other"] as const;
export const DISPUTE_OUTCOMES = ["buyer", "seller", "split", "none"] as const;
export const CHARGEBACK_STATUSES = ["needs_response", "under_review", "won", "lost", "closed"] as const;

export const REVIEW_STATUSES = ["pending", "published", "hidden", "removed"] as const;
export const REPORT_TYPES = ["listing", "user", "review", "seller"] as const;
export const REPORT_STATUSES = ["open", "reviewing", "resolved", "dismissed"] as const;
export const VIOLATION_TYPES = ["counterfeit", "misrepresentation", "late_shipping", "policy", "abuse", "fraud", "other"] as const;
export const VIOLATION_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const VIOLATION_ACTIONS = ["none", "warning", "restriction", "suspension", "ban"] as const;

export const COUPON_TYPES = ["percent", "fixed", "free_shipping"] as const;
export const COUPON_SCOPES = ["order", "category", "product", "seller"] as const;

export const TICKET_STATUSES = ["open", "pending", "on_hold", "resolved", "closed"] as const;
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const TICKET_CATEGORIES = ["order", "payment", "shipping", "returns", "seller", "account", "listing", "other"] as const;

export const PAYOUT_STATUSES = ["pending", "scheduled", "processing", "paid", "failed", "cancelled"] as const;
export const PAYOUT_SCHEDULES = ["manual", "weekly", "biweekly", "monthly"] as const;
export const LEDGER_TYPES = ["sale", "commission", "refund", "commission_reversal", "payout", "adjustment", "fee"] as const;

export const ANNOUNCEMENT_AUDIENCES = ["all", "buyers", "sellers", "admins"] as const;

/** Human labels for status strings (falls back to a de-snaked version). */
export function statusLabel(value: string): string {
  const overrides: Record<string, string> = {
    pending_payment: "Awaiting payment",
    requires_action: "Needs action",
    item_not_received: "Item not received",
    not_as_described: "Not as described",
    shipped_back: "Shipped back",
    needs_response: "Needs response",
  };
  if (overrides[value]) return overrides[value];
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Tone used by the Badge component for a given status string. */
export function statusTone(value: string): "neutral" | "brand" | "gold" | "dark" | "sale" | "success" | "warning" | "danger" {
  switch (value) {
    case "active":
    case "approved":
    case "verified":
    case "published":
    case "paid":
    case "succeeded":
    case "delivered":
    case "completed":
    case "resolved":
    case "fulfilled":
    case "done":
    case "won":
    case "accepted":
      return "success";
    case "pending":
    case "pending_payment":
    case "requested":
    case "processing":
    case "under_review":
    case "awaiting_seller":
    case "awaiting_buyer":
    case "in_transit":
    case "out_for_delivery":
    case "shipped":
    case "partially_shipped":
    case "partial":
    case "scheduled":
    case "requires_action":
    case "authorized":
    case "on_hold":
    case "reviewing":
    case "needs_response":
    case "running":
      return "warning";
    case "suspended":
    case "banned":
    case "rejected":
    case "failed":
    case "cancelled":
    case "refunded":
    case "partially_refunded":
    case "removed":
    case "escalated":
    case "exception":
    case "lost":
    case "critical":
    case "urgent":
    case "high":
      return "danger";
    case "draft":
    case "hidden":
    case "unfulfilled":
    case "unpaid":
    case "closed":
    case "dismissed":
    case "archived":
    case "unverified":
    case "restricted":
      return "neutral";
    default:
      return "neutral";
  }
}
