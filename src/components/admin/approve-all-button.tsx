import { ConfirmButton } from "@/components/admin/confirm-button";
import { approveAllPendingAction } from "@/lib/admin/actions/imports";
import { db } from "@/lib/db";
import { approveAllWhere } from "@/lib/imports/pipeline";
import { IMPORT_SOURCE } from "@/lib/imports/status";
import { getSettings } from "@/lib/settings";

/**
 * "Approve all N pending": shows how many qualify, how many stay for a person, and what happens
 * next (approval publishes nothing; the daily release rule or Release does).
 */
export async function ApproveAllButton({ variant }: { variant?: "primary" }) {
  const now = new Date();
  const [eligible, pending, settings] = await Promise.all([
    db.importItem.count({ where: approveAllWhere(IMPORT_SOURCE, now) }),
    db.importItem.count({ where: { source: IMPORT_SOURCE, status: "pending_review" } }),
    getSettings(),
  ]);
  if (eligible === 0) return null;
  const held = pending - eligible;
  const perDay = settings["imports.autoReleasePerDay"];
  const next =
    perDay > 0
      ? `Approving does not publish anything by itself, but the daily release rule is on: it publishes up to ${perDay.toLocaleString("en-US")} approved products per day, so they start going live the next time that rule runs (every 15 minutes while the site has visitors). To release by hand instead, first set the daily release rule to 0 in the settings on the HipComic import page.`
      : "Approving does not publish anything: products go live only when you press Release.";
  return (
    <ConfirmButton
      label={`Approve all ${eligible.toLocaleString("en-US")} pending`}
      title="Approve all pending"
      message={`Approves ${eligible.toLocaleString("en-US")} product(s) in Pending Review at their current price and details: the photo is stored and the release check runs, as when you approve them one by one.${held > 0 ? ` ${held.toLocaleString("en-US")} stay in Pending Review for you to check: possible duplicates of a book already listed, and listings the source no longer offers.` : ""} ${next}`}
      action={approveAllPendingAction}
      confirmLabel="Approve all"
      variant={variant}
    />
  );
}
