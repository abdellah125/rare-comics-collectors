import type { Metadata } from "next";
import { ImportForm } from "@/components/admin/import-form";
import { AdminPageHeader, Card } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Import listings" };

export default async function ImportProductsPage() {
  await requireAdmin("products.manage");
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Listings", href: "/admin/products" }, { label: "Import" }]} title="Import listings from CSV" lead="Bulk-create house inventory. Rows with errors are skipped and reported." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Upload">
          <ImportForm />
        </Card>
        <Card title="CSV format" description="Header row required. Column names are case-insensitive.">
          <pre className="overflow-x-auto rounded-lg bg-ink-950 p-4 text-[12px] leading-relaxed text-ink-100">{`title,issue,publisher,year,era,grader,grade,label,cert_number,price,stock,key_issue,summary,description,image_url,sku
Amazing Spider-Man,129,Marvel Comics,1974,Bronze Age,CGC,9.4,Universal Blue,1234567890,4200.00,1,First Punisher,"Sharp copy, white pages","Long description here",/covers/asm-129.jpg,ASM129-94`}</pre>
          <ul className="mt-3 grid gap-1 text-[13px] text-ink-700">
            <li>
              <strong>Required:</strong> title, issue, year, price (decimal, USD).
            </li>
            <li>
              <strong>era:</strong> Golden Age · Silver Age · Bronze Age · Copper Age · Modern Age. <strong>grader:</strong> CGC · CBCS · Raw.
            </li>
            <li>
              <strong>sku</strong> is optional (generated when blank) but must be unique. <strong>image_url</strong> can be a path under /public or an https URL.
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
