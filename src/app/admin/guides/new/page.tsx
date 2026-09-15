import type { Metadata } from "next";
import { AdminGuideForm } from "@/components/admin/guide-form";
import { AdminPageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New guide" };

export default async function NewGuidePage() {
  await requireAdmin("content.manage");
  return (
    <>
      <AdminPageHeader title="New guide" lead="A question, a direct answer, then the detail. Tag the characters, titles and publishers it covers so the store links to it." />
      <AdminGuideForm initial={null} />
    </>
  );
}
