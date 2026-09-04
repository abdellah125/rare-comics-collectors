"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { sellerShipmentStatusAction } from "@/lib/seller/order-actions";
import type { ActionState } from "@/lib/validation";

type Status = "in_transit" | "out_for_delivery" | "delivered" | "exception";

export function ShipmentStatusButtons({ shipmentId, status, action = sellerShipmentStatusAction }: { shipmentId: string; status: string; action?: (id: string, status: Status) => Promise<ActionState> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (["delivered", "returned"].includes(status)) return null;
  const set = (s: Status) =>
    start(async () => {
      const res = await action(shipmentId, s);
      setMsg(res.message ?? null);
      router.refresh();
    });
  return (
    <span className="flex flex-wrap items-center gap-2">
      {msg && <span className="text-[12px] text-ink-600">{msg}</span>}
      {status === "shipped" && (
        <button type="button" disabled={pending} className={`${buttonStyles.quiet} ${buttonSizes.sm}`} onClick={() => set("in_transit")}>
          In transit
        </button>
      )}
      <button type="button" disabled={pending} className={`${buttonStyles.outline} ${buttonSizes.sm}`} onClick={() => set("delivered")}>
        Mark delivered
      </button>
      <button type="button" disabled={pending} className={`${buttonStyles.quiet} ${buttonSizes.sm} text-rose-700`} onClick={() => set("exception")}>
        Report problem
      </button>
    </span>
  );
}
