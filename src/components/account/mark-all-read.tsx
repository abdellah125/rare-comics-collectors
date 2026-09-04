"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { markNotificationsReadAction } from "@/lib/account/actions";

export function MarkAllRead() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={`${buttonStyles.outline} ${buttonSizes.sm}`}
      onClick={() =>
        start(async () => {
          await markNotificationsReadAction();
          router.refresh();
        })
      }
    >
      {pending ? "Marking…" : "Mark all as read"}
    </button>
  );
}
