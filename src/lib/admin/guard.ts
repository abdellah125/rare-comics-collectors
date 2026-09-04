import "server-only";
import { assertAdmin, AuthError, type CurrentUser } from "@/lib/auth/session";
import { FulfillmentError } from "@/lib/orders/fulfillment";
import { RefundError } from "@/lib/payments/payment-service";
import { UploadError } from "@/lib/media";
import { failState, type ActionState } from "@/lib/validation";
import type { Permission } from "@/lib/permissions";

export type AdminActor = { id: string; email: string; type: "admin" };

export const actorOf = (admin: CurrentUser): AdminActor => ({ id: admin.id, email: admin.email, type: "admin" });

/**
 * Wraps an admin server action: enforces the permission server-side, converts
 * known domain errors into form-friendly results and never leaks stack traces.
 */
export async function runAdmin<T = undefined>(permission: Permission, fn: (admin: CurrentUser) => Promise<ActionState<T>>): Promise<ActionState<T>> {
  try {
    const admin = await assertAdmin(permission);
    return await fn(admin);
  } catch (err) {
    if (err instanceof AuthError || err instanceof RefundError || err instanceof FulfillmentError || err instanceof UploadError) return failState(err.message);
    if (err instanceof Error && err.message.startsWith("Domain:")) return failState(err.message.slice(7).trim());
    console.error("[admin action]", err);
    return failState("Something went wrong. The error has been logged.");
  }
}

/** Throw inside runAdmin to surface a user-facing message. */
export function domainError(message: string): never {
  throw new Error(`Domain: ${message}`);
}
