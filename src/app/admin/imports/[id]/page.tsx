import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, Field, Kv, Tone, adminButton, adminInput, adminTextarea } from "@/components/admin/ui";
import { can, requireAdmin } from "@/lib/auth/session";
import { bulkImportAction, saveImportItemAction } from "@/lib/admin/actions/imports";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { describeAdjustment, marginOf, retailPrice } from "@/lib/imports/pricing";
import { h1Of } from "@/lib/imports/seo-rules";
import { DUPLICATE_LABEL, SEO_LABEL, itemStatusLabel, itemStatusTone } from "@/lib/imports/status";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Import item" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const parse = <T,>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export default async function AdminImportItemPage({ params }: PageProps<"/admin/imports/[id]">) {
  const admin = await requireAdmin("products.view");
  const manage = can(admin, "products.manage");
  const { id } = await params;
  const item = await db.importItem.findUnique({ where: { id }, include: { product: { select: { id: true, slug: true, status: true, price: true, stock: true } }, run: { select: { fileName: true, startedAt: true, kind: true } } } });
  if (!item) notFound();

  const name = item.title ? `${item.title} ${item.issue}`.trim() : item.sourceTitle;
  const problems = parse<string[]>(item.problemsJson, []);
  const seoNotes = parse<string[]>(item.seoNotesJson, []);
  const secondary = parse<string[]>(item.secondaryKeywordsJson, []);
  const links = parse<{ href: string; label: string; why: string }[]>(item.internalLinksJson, []);
  const edited = parse<string[]>(item.editedJson, []);
  const margin = marginOf(item.sourcePrice, item.retailPrice);
  const formula = item.sourcePrice !== null ? retailPrice(item.sourcePrice, item.markupBps) : null;
  const released = item.status === "released";
  const image = item.imageUrl ?? item.sourceImage;
  const act = (action: string) => bulkImportAction.bind(null, action, [item.id]);

  return (
    <>
      <AdminPageHeader
        crumbs={[{ label: "HipComic import", href: "/admin/imports" }, { label: "Review queue", href: "/admin/imports/queue" }, { label: name }]}
        title={name}
        lead={`Imported ${formatDateTime(item.createdAt)}${item.importFile ? ` from ${item.importFile}` : ""} · last seen at the source ${formatDateTime(item.lastSeenAt)}`}
        actions={
          <>
            <Tone tone={itemStatusTone(item.status)}>{itemStatusLabel(item.status)}</Tone>
            <Tone tone={item.duplicateStatus === "unique" ? "success" : "warning"}>{DUPLICATE_LABEL[item.duplicateStatus] ?? item.duplicateStatus}</Tone>
            <Tone tone={item.seoStatus === "ok" ? "success" : item.seoStatus === "review" ? "warning" : "neutral"}>SEO: {SEO_LABEL[item.seoStatus] ?? item.seoStatus}</Tone>
          </>
        }
      />

      {(problems.length > 0 || item.duplicateOf || item.priceChangeNote || !item.available) && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900" role="status">
          {problems.length > 0 && (
            <>
              <p className="font-semibold">Before this product can be released:</p>
              <ul className="mt-1 list-disc pl-5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <p className="mt-1 text-[12px]">Missing facts are never guessed. Fill them in below from the listing itself (the slab label, the source page), then save.</p>
            </>
          )}
          {item.duplicateOf && <p className={problems.length ? "mt-2" : ""}>{item.duplicateOf}.</p>}
          {item.priceChangeNote && <p className="mt-2">{item.priceChangeNote}</p>}
          {!item.available && <p className="mt-2">The source no longer lists this product as available.</p>}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid gap-6 xl:col-span-2">
          {released ? (
            <Card title="Released" description="This product is public. Its listing is edited under Listings; a price you change there is treated as a manual price by the next sync.">
              <Kv
                items={[
                  { label: "Listing", value: item.product ? <Link href={`/admin/products/${item.product.id}`} className="text-brand-700 hover:underline">Edit listing</Link> : "Listing was deleted" },
                  { label: "Store page", value: item.product ? <Link href={`/store/${item.product.slug}`} className="text-brand-700 hover:underline">/store/{item.product.slug}</Link> : "—" },
                  { label: "Selling price", value: item.product ? formatMoney(item.product.price) : "—" },
                  { label: "Stock", value: item.product ? String(item.product.stock) : "—" },
                  { label: "Released", value: formatDateTime(item.releasedAt) },
                ]}
              />
            </Card>
          ) : manage ? (
            <Card title="Product information" description="Shown on the store exactly as saved. Issue number, grade, grading company and identifiers must match the book: change them only to correct them.">
              <ActionForm action={saveImportItemAction} hidden={{ id: item.id }} submitLabel="Save changes">
                <>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Comic title" className="sm:col-span-2">
                        <input name="title" defaultValue={item.title} required maxLength={160} className={adminInput} />
                      </Field>
                      <Field label="Issue number" hint={"e.g. #300"}>
                        <input name="issue" defaultValue={item.issue} required maxLength={20} className={adminInput} />
                      </Field>
                      <Field label="Publisher">
                        <input name="publisher" defaultValue={item.publisher} required maxLength={120} className={adminInput} />
                      </Field>
                      <Field label="Year" hint={(item.era ? item.era : "sets the era")}>
                        <input name="year" type="number" min={1900} max={2100} defaultValue={item.year ?? ""} className={adminInput} />
                      </Field>
                      <Field label="Variant (optional)">
                        <input name="variant" defaultValue={item.variant ?? ""} maxLength={120} className={adminInput} />
                      </Field>
                      <Field label="Grading company" hint={"CGC, CBCS, PGX or Raw"}>
                        <input name="grader" defaultValue={item.grader} required maxLength={20} className={adminInput} />
                      </Field>
                      <Field label="Grade">
                        <input name="grade" defaultValue={item.grade} required maxLength={10} className={adminInput} />
                      </Field>
                      <Field label="Label">
                        <input name="label" defaultValue={item.label} required maxLength={60} className={adminInput} />
                      </Field>
                      <Field label="Certification number (optional)">
                        <input name="certNumber" defaultValue={item.certNumber ?? ""} maxLength={40} className={adminInput} />
                      </Field>
                      <Field label="Key issue note (optional)" className="sm:col-span-2" hint="Only a claim the listing itself makes, e.g. a first appearance.">
                        <input name="keyIssue" defaultValue={item.keyIssue ?? ""} maxLength={300} className={adminInput} />
                      </Field>
                    </div>
                    <Field label="Summary">
                      <textarea name="summary" defaultValue={item.summary} rows={2} maxLength={600} className={adminTextarea} />
                    </Field>
                    <Field label="Description" hint="Paragraphs separated by a blank line.">
                      <textarea name="description" defaultValue={item.description} rows={6} maxLength={6000} className={adminTextarea} />
                    </Field>

                    <h3 className="mt-2 border-t border-ink-100 pt-4 text-sm font-semibold text-ink-950">Price</h3>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Selling price (US$)" hint={(item.priceManual ? "Set by hand: the sync keeps it unless automatic price synchronisation is on." : "Follows the source price less the discount until you change it.")}>
                        <input name="price" inputMode="decimal" defaultValue={item.retailPrice !== null ? (item.retailPrice / 100).toFixed(2) : ""} required className={adminInput} />
                      </Field>
                      <div className="text-[13px] text-ink-700 sm:col-span-2">
                        <p>
                          Source price <strong>{item.sourcePrice !== null ? formatMoney(item.sourcePrice) : "—"}</strong> × {(1 + item.markupBps / 10_000).toFixed(2)} = <strong>{formula !== null ? formatMoney(formula) : "—"}</strong>
                        </p>
                        <label className="mt-2 flex items-center gap-2">
                          <input type="checkbox" name="resetPrice" className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Reset to the formula price
                        </label>
                      </div>
                    </div>

                    <h3 className="mt-2 border-t border-ink-100 pt-4 text-sm font-semibold text-ink-950">SEO</h3>
                    <Field label="SEO title" hint={`${item.seoTitle.length} characters; the site name is added after it.`}>
                      <input name="seoTitle" defaultValue={item.seoTitle} maxLength={200} className={adminInput} />
                    </Field>
                    <Field label="Meta description" hint={`${item.seoDescription.length} characters.`}>
                      <textarea name="seoDescription" defaultValue={item.seoDescription} rows={2} maxLength={400} className={adminTextarea} />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="URL slug" hint={`/store/${item.slug}`}>
                        <input name="slug" defaultValue={item.slug} required maxLength={110} className={adminInput} />
                      </Field>
                      <Field label="Primary keyword">
                        <input name="primaryKeyword" defaultValue={item.primaryKeyword} maxLength={120} className={adminInput} />
                      </Field>
                    </div>
                </>
              </ActionForm>
            </Card>
          ) : (
            <Card title="Product information">
              <Kv items={[{ label: "Title", value: name }, { label: "Publisher", value: item.publisher || "—" }, { label: "Year", value: item.year ?? "—" }, { label: "Grade", value: `${item.grader} ${item.grade}` }, { label: "Price", value: item.retailPrice !== null ? formatMoney(item.retailPrice) : "—" }]} />
            </Card>
          )}

          <Card title="SEO recommendation" description="Built from the product's own facts and the keyword data the SEO system already holds. No keyword is added that the listing does not match.">
            <Kv
              items={[
                { label: "Primary keyword", value: item.primaryKeyword || "—" },
                { label: "Secondary keywords", value: secondary.length ? secondary.join(" · ") : "—" },
                { label: "Search intent", value: item.searchIntent ? item.searchIntent[0].toUpperCase() + item.searchIntent.slice(1) : "—" },
                { label: "SEO title", value: item.seoTitle || "—" },
                { label: "Meta description", value: item.seoDescription || "—" },
                { label: "URL slug", value: item.slug ? `/store/${item.slug}` : "—" },
                { label: "H1", value: item.title ? h1Of(item) : "—" },
                {
                  label: "Internal links",
                  value: links.length ? (
                    <ul className="grid gap-0.5">
                      {links.map((l) => (
                        <li key={l.href}>
                          <Link href={l.href} className="text-brand-700 hover:underline">
                            {l.label}
                          </Link>{" "}
                          <span className="text-ink-500">— {l.why}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "No matching collection, publisher, character or guide page yet"
                  ),
                },
              ]}
            />
            {seoNotes.length > 0 && (
              <ul className="mt-3 list-disc rounded-lg bg-ink-50 px-3 py-2 pl-7 text-[12px] text-ink-700">
                {seoNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid content-start gap-6">
          {manage && !released && (
            <Card title="Decision">
              <div className="flex flex-wrap gap-2">
                {item.status === "pending_review" && <ConfirmButton label="Approve" message="Approve this product? It is checked and becomes Ready to Release; it is not public until you release it." action={act("approve")} variant="primary" />}
                {item.status === "ready" && <ConfirmButton label="Release" message={`Release this product at ${item.retailPrice !== null ? formatMoney(item.retailPrice) : "—"}? It becomes public on the store.`} action={act("release")} variant="primary" confirmLabel="Release" />}
                {["rejected", "duplicate", "approved", "ready"].includes(item.status) && <ConfirmButton label="Back to review" message="Move this product back to Pending Review?" action={act("restore")} />}
                {item.status !== "rejected" && <ConfirmButton label="Reject" message="Reject this product? It stays in the queue as Rejected and is not imported again." action={act("reject")} />}
                <ConfirmButton label="Remove from queue" message="Delete this queue record? If the source data is imported again it will come back as new; use Reject to keep it out." action={act("remove")} variant="danger" />
              </div>
              {item.status === "approved" && <p className="mt-3 text-[12px] text-ink-600">Approved. The photo is being stored and the facts checked; it becomes Ready to Release in a moment.</p>}
              {item.status === "error" && <p className="mt-3 text-[12px] text-ink-600">Fix what is listed at the top and save; the product then returns to Pending Review.</p>}
            </Card>
          )}

          <Card title="Photo">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={`${name} photo`} referrerPolicy="no-referrer" className="mx-auto max-h-96 rounded-lg border border-ink-200" />
            ) : (
              <p className="text-[13px] text-ink-500">The source data has no photo for this product.</p>
            )}
            <p className="mt-2 text-[12px] text-ink-500">{item.imageUrl ? "Stored on this site." : "Shown from the source; our own copy is stored when the product is approved."}</p>
          </Card>

          <Card title="Pricing (admin only)" description="Never shown to customers.">
            <Kv
              items={[
                { label: "Source price", value: item.sourcePrice !== null ? formatMoney(item.sourcePrice) : "—" },
                ...(item.priceNote ? [{ label: "Note", value: item.priceNote }] : []),
                { label: "Price rule", value: describeAdjustment(item.markupBps) },
                { label: "Selling price", value: item.retailPrice !== null ? `${formatMoney(item.retailPrice)}${item.priceManual ? " (set by hand)" : ""}` : "—" },
                { label: "Against the source price", value: margin ? `${margin.amount < 0 ? "−" : "+"}${formatMoney(Math.abs(margin.amount))} (${(margin.bps / 100).toFixed(1)}%)` : "—" },
              ]}
            />
          </Card>

          <Card title="Source">
            <Kv
              items={[
                { label: "Source", value: "HipComic" },
                { label: "Identifier", value: item.sourceId },
                { label: "Reference", value: item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand-700 hover:underline">{item.sourceUrl}</a> : "—" },
                { label: "Source title", value: item.sourceTitle },
                { label: "Source seller", value: item.sourceSeller ?? "—" },
                { label: "Availability", value: item.available ? "Available" : "Unavailable" },
                { label: "Our SKU", value: `IMP-${item.sourceId}` },
                ...(edited.length ? [{ label: "Edited by hand", value: edited.join(", ") }] : []),
              ]}
            />
            <p className="mt-3 text-[12px] text-ink-500">Source details are for the admin only. On the store the product is sold as Rare Comics Collectors inventory.</p>
          </Card>
          <Link href="/admin/imports/queue" className={adminButton.outline}>
            Back to the queue
          </Link>
        </div>
      </div>
    </>
  );
}
