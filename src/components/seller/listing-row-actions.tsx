"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { deleteListingAction, setListingStatusAction } from "@/lib/seller/listing-actions";

export function ListingRowActions({ id, slug, status }: { id: string; slug: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const res = await fn();
      setMsg(res.message ?? null);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {msg && <span className="text-[12px] text-ink-600">{msg}</span>}
      <Link href={`/dashboard/listings/${id}`} className={`${buttonStyles.outline} ${buttonSizes.sm}`}>
        Edit
      </Link>
      {status === "published" && (
        <>
          <Link href={`/store/${slug}`} className={`${buttonStyles.quiet} ${buttonSizes.sm}`}>
            View
          </Link>
          <button type="button" disabled={pending} className={`${buttonStyles.quiet} ${buttonSizes.sm}`} onClick={() => run(() => setListingStatusAction(id, "hidden"))}>
            Hide
          </button>
        </>
      )}
      {(status === "hidden" || status === "draft") && (
        <button type="button" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.sm}`} onClick={() => run(() => setListingStatusAction(id, "published"))}>
          Publish
        </button>
      )}
      {status !== "archived" && (
        <button
          type="button"
          disabled={pending}
          className={`${buttonStyles.quiet} ${buttonSizes.sm} text-rose-700`}
          onClick={() => {
            if (!window.confirm("Remove this listing? Sold copies keep their order history.")) return;
            run(() => deleteListingAction(id));
          }}
        >
          Remove
        </button>
      )}
    </div>
  );
}
