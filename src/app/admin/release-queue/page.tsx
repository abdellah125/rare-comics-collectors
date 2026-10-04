import { redirect } from "next/navigation";

/** The scheduled release queue was replaced by the import review queue. */
export default function AdminReleaseQueueRedirect() {
  redirect("/admin/imports");
}
