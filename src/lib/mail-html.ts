/**
 * Plain-text → HTML for transactional email. Every message is authored as text
 * (templates in the admin are text); this wraps it in a minimal, tracker-free
 * layout so mail clients render a proper multipart/alternative message. The
 * text part stays the source of truth, which keeps the two parts identical —
 * a mismatch between them is a common spam signal.
 */
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Escapes a line and turns bare http(s) URLs into links (trailing punctuation stays outside the link). */
export function linkify(line: string): string {
  let out = "";
  let last = 0;
  for (const m of line.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    let url = m[0];
    let trail = "";
    while (/[.,;:!?]$/.test(url)) {
      trail = url.slice(-1) + trail;
      url = url.slice(0, -1);
    }
    out += escapeHtml(line.slice(last, start));
    out += `<a href="${escapeHtml(url)}" style="color:#be123c;text-decoration:underline">${escapeHtml(url)}</a>${escapeHtml(trail)}`;
    last = start + m[0].length;
  }
  return out + escapeHtml(line.slice(last));
}

export function textToHtml(text: string, opts: { siteName: string; siteUrl: string; footer?: string[] }): string {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px">${p.split("\n").map(linkify).join("<br>")}</p>`)
    .join("");
  const footer = (opts.footer ?? []).map((line) => `<p style="margin:0 0 6px">${linkify(line)}</p>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(opts.siteName)}</title></head><body style="margin:0;padding:0;background:#f4f4f6"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;border:1px solid #e5e7eb"><tr><td style="padding:28px 32px 8px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"><a href="${escapeHtml(opts.siteUrl)}" style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#e11d48;text-decoration:none">${escapeHtml(opts.siteName)}</a></td></tr><tr><td style="padding:12px 32px 24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1c2130">${paragraphs}</td></tr><tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#6b7280">${footer}</td></tr></table></td></tr></table></body></html>`;
}
