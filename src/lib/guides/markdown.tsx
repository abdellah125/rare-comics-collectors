import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A deliberately small Markdown renderer for knowledge-base articles. It emits
 * React elements (never raw HTML), so article text can only ever be text: no
 * scripts, no inline event handlers, no injected markup. Supported: `##`/`###`
 * headings (with anchor ids), paragraphs, bullet and numbered lists, block quotes,
 * simple pipe tables, horizontal rules, **bold**, *italic*, `code` and
 * [links](/path). Internal links become Next links; external links open in a
 * new tab with rel="noopener noreferrer"; other URL schemes render as plain text.
 */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_[\]()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const token = m[0];
    const key = `${keyPrefix}-${n++}`;
    if (token.startsWith("**")) out.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    else if (token.startsWith("`")) out.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("[")) {
      const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      if (!label || !href) out.push(token);
      else if (href.startsWith("/") && !href.startsWith("//"))
        out.push(
          <Link key={key} href={href}>
            {renderInline(label, key)}
          </Link>,
        );
      else if (/^https?:\/\//i.test(href))
        out.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {renderInline(label, key)}
          </a>,
        );
      else out.push(label);
    } else out.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "hr" }
  | { kind: "table"; header: string[]; rows: string[][] };

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { i++; continue; }
    if (/^#{2,3}\s+/.test(t)) { blocks.push({ kind: t.startsWith("###") ? "h3" : "h2", text: t.replace(/^#{2,3}\s+/, "") }); i++; continue; }
    if (/^#\s+/.test(t)) { blocks.push({ kind: "h2", text: t.replace(/^#\s+/, "") }); i++; continue; }
    if (/^(-{3,}|\*{3,})$/.test(t)) { blocks.push({ kind: "hr" }); i++; continue; }
    if (t.startsWith("|") && lines[i + 1] && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      const header = cells(t);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    if (/^[-*]\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^[-*]\s+/, ""));
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\d+[.)]\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^\d+[.)]\s+/, ""));
      blocks.push({ kind: "ol", items });
      continue;
    }
    if (t.startsWith(">")) {
      const parts: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) parts.push(lines[i++].trim().replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", text: parts.join(" ") });
      continue;
    }
    const parts: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|[-*]\s|\d+[.)]\s|>|\|)/.test(lines[i].trim()) && !/^(-{3,}|\*{3,})$/.test(lines[i].trim())) parts.push(lines[i++].trim());
    blocks.push({ kind: "p", text: parts.join(" ") });
  }
  return blocks;
}

/** Headings (for a table of contents). */
export function outline(markdown: string): { id: string; text: string; level: 2 | 3 }[] {
  return parseBlocks(markdown)
    .filter((b): b is { kind: "h2" | "h3"; text: string } => b.kind === "h2" || b.kind === "h3")
    .map((b) => ({ id: headingId(b.text), text: b.text, level: b.kind === "h2" ? 2 : 3 }));
}

export function Markdown({ source }: { source: string }) {
  return (
    <>
      {parseBlocks(source).map((b, i) => {
        const key = `b${i}`;
        switch (b.kind) {
          case "h2":
            return <h2 key={key} id={headingId(b.text)}>{renderInline(b.text, key)}</h2>;
          case "h3":
            return <h3 key={key} id={headingId(b.text)}>{renderInline(b.text, key)}</h3>;
          case "p":
            return <p key={key}>{renderInline(b.text, key)}</p>;
          case "ul":
            return <ul key={key}>{b.items.map((it, j) => <li key={j}>{renderInline(it, `${key}-${j}`)}</li>)}</ul>;
          case "ol":
            return <ol key={key}>{b.items.map((it, j) => <li key={j}>{renderInline(it, `${key}-${j}`)}</li>)}</ol>;
          case "quote":
            return <blockquote key={key}>{renderInline(b.text, key)}</blockquote>;
          case "hr":
            return <hr key={key} />;
          case "table":
            return (
              <div key={key} className="table-wrap" tabIndex={0} role="region" aria-label="Table">
                <table>
                  <thead>
                    <tr>{b.header.map((h, j) => <th key={j}>{renderInline(h, `${key}-h${j}`)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>{r.map((c, k) => <td key={k}>{renderInline(c, `${key}-${j}-${k}`)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}

/** Plain text of the article body for search indexing and word counts. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
