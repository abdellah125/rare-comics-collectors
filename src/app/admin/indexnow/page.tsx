import type { Metadata } from "next";
import { IndexNowForm } from "@/components/admin/indexnow-form";
import { AdminPageHeader, Card, Kv, Table, Td, Th, Tone } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { checkIndexNowKeyFile, indexNowKey, indexNowKeyLocationUrl } from "@/lib/indexnow";
import { INDEXNOW_KEY_FOLDER } from "@/lib/indexnow-payload";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "IndexNow" };
export const dynamic = "force-dynamic";

const STATUS_ROWS: [string, string][] = [
  ["200", "Accepted and key verified. The blank page a browser shows for this is the success response: IndexNow sends no body."],
  ["202", "Received, key not validated yet. Bing also answers 202 for a wrong key or a placeholder URL and then drops the request, so 202 is not a confirmation."],
  ["400", "Malformed request."],
  ["403", "Key file not reachable or its contents differ from the key."],
  ["422", "URLs outside the folder the key file verifies, or not on this host. A key file under /indexnow/ only verifies /indexnow/* URLs; the root file verifies the whole site."],
  ["429", "Rate-limited. Try again later."],
];

export default async function AdminIndexNowPage() {
  await requireAdmin("content.manage");
  const key = indexNowKey();
  const keyLocation = indexNowKeyLocationUrl();
  const origin = site.url.replace(/\/+$/, "");
  const [rootFile, folderFile, jobs] = await Promise.all([
    checkIndexNowKeyFile(keyLocation),
    checkIndexNowKeyFile(`${origin}${INDEXNOW_KEY_FOLDER}/${key}.txt`),
    db.job.findMany({ where: { type: { startsWith: "indexnow" } }, orderBy: { createdAt: "desc" }, take: 15, select: { id: true, type: true, status: true, attempts: true, maxAttempts: true, lastError: true, payloadJson: true, createdAt: true, completedAt: true } }),
  ]);
  const manualUrl = `https://www.bing.com/indexnow?url=${encodeURIComponent(`${origin}/guides`)}&key=${key}`;
  const example = `/guides/what-is-a-cgc-graded-comic\n${origin}/store\n/collections/bronze-age`;

  return (
    <>
      <AdminPageHeader
        title="IndexNow"
        lead="Tell Bing, Yandex, Seznam and Naver about changed pages right away. Listings and guides are submitted automatically when they are saved; use this page to push a URL by hand and to see the endpoint's actual answer."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "IndexNow" }]}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="grid gap-5 lg:col-span-2">
          <Card title="Submit URLs" description={env.indexNow.enabled ? "Sent immediately with the JSON batch form and the keyLocation below." : "Submissions are only sent from the production deployment; here the tool reports what it would send."}>
            <IndexNowForm example={example} />
          </Card>
          <Card title="Recent automatic submissions" description="Queued by listing and guide saves (indexnow_ping) and the weekly sitemap sync (indexnow_sync).">
            {jobs.length === 0 ? (
              <p className="text-sm text-ink-600">No IndexNow jobs yet.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Job</Th>
                    <Th>Status</Th>
                    <Th>URLs</Th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => {
                    const paths = (() => { try { const p = JSON.parse(j.payloadJson) as { paths?: string[] }; return p.paths ?? []; } catch { return []; } })();
                    return (
                      <tr key={j.id}>
                        <Td className="whitespace-nowrap text-[12px] text-ink-600">{j.createdAt.toISOString().slice(0, 16).replace("T", " ")}</Td>
                        <Td className="font-mono text-[12px]">{j.type}</Td>
                        <Td>
                          <Tone tone={j.status === "completed" ? "success" : j.status === "failed" ? "danger" : "neutral"}>{j.status}</Tone>
                          {j.lastError && <span className="block max-w-xs truncate text-[11px] text-rose-700" title={j.lastError}>{j.lastError}</span>}
                        </Td>
                        <Td className="text-[12px] text-ink-700">{paths.length === 0 ? (j.type === "indexnow_sync" ? "everything in the sitemaps" : "—") : paths.slice(0, 3).join(", ") + (paths.length > 3 ? ` +${paths.length - 3}` : "")}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
        <div className="grid gap-5">
          <Card title="Key file" description="Search engines fetch this to prove the submissions come from the site owner.">
            <Kv
              items={[
                { label: "Key", value: <code className="break-all text-[12px]">{key}</code> },
                { label: "keyLocation sent", value: <code className="break-all text-[12px]">{keyLocation}</code> },
                { label: "Root file", value: rootFile.ok ? <Tone tone="success">200, contents match</Tone> : <Tone tone="danger">{rootFile.status || "unreachable"} — {rootFile.body.slice(0, 60)}</Tone> },
                { label: `${INDEXNOW_KEY_FOLDER}/ copy`, value: folderFile.ok ? <Tone tone="success">200, contents match</Tone> : <Tone tone="neutral">{folderFile.status || "unreachable"}</Tone> },
              ]}
            />
          </Card>
          <Card title="Submitting from a browser" description="The single-URL form works too, but its only feedback is the HTTP status: a blank page is a 200.">
            <p className="break-all rounded-lg bg-ink-50 p-3 font-mono text-[11px] text-ink-800">{manualUrl}</p>
            <p className="mt-2 text-[12px] text-ink-600">Replace the url= value with the page that changed (percent-encode it if it contains &amp;). Check the status in the browser&apos;s Network tab, or use the form on this page instead.</p>
          </Card>
          <Card title="What the status codes mean">
            <dl className="grid gap-2 text-[12px] text-ink-700">
              {STATUS_ROWS.map(([code, text]) => (
                <div key={code} className="flex gap-3">
                  <dt className="w-8 shrink-0 font-mono font-semibold text-ink-950">{code}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
