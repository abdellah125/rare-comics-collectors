"use client";

import { useEffect } from "react";
import { useCart } from "@/components/cart-provider";

/** Empties the local cart once an order has been placed (used on the confirmation page). */
export function ClearCart({ when }: { when: boolean }) {
  const { clear, hydrated } = useCart();
  useEffect(() => {
    if (when && hydrated) clear();
  }, [when, hydrated, clear]);
  return null;
}
