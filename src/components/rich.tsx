import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Renders a translated sentence that carries light markup: <b>bold</b> and one or more
 * <a>links</a> (hrefs given in order). Keeping the markers inside the sentence lets each
 * language put the emphasis and the link where its own word order needs them.
 */
export function Rich({ text, hrefs = [], linkClassName }: { text: string; hrefs?: string[]; linkClassName?: string }): ReactNode {
  const parts = text.split(/(<b>.*?<\/b>|<a>.*?<\/a>)/g);
  let link = 0;
  return parts.map((part, i) => {
    if (part.startsWith("<b>")) return <strong key={i}>{part.slice(3, -4)}</strong>;
    if (part.startsWith("<a>")) {
      const href = hrefs[link++] ?? "#";
      return (
        <Link key={i} href={href} className={linkClassName}>
          {part.slice(3, -4)}
        </Link>
      );
    }
    return part;
  });
}
