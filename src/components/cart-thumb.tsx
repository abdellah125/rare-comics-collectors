"use client";

import Image from "next/image";
import { useState } from "react";
import type { CartLine } from "@/components/cart-provider";
import coverMap from "@/lib/gocovers-map.json";

/**
 * Small cover thumbnail for cart lines. Comics show their cover (real scan when
 * we have one, generated SVG otherwise) over the palette gradient; services keep
 * the plain gradient tile. Decorative — the line's name sits right beside it.
 */
export function CartThumb({
  line,
  className = "",
}: {
  line: Pick<CartLine, "kind" | "slug" | "palette">;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const background = line.palette
    ? `linear-gradient(150deg, ${line.palette[0]}, ${line.palette[1]})`
    : "linear-gradient(150deg,#1c2130,#4e5a72)";
  const fallback = `/covers/${line.slug}.svg`;
  const src =
    line.kind === "comic" ? (failed ? fallback : ((coverMap as Record<string, string>)[line.slug] ?? fallback)) : null;

  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-md ring-1 ring-ink-950/10 ${className}`}
      style={{ background }}
      aria-hidden
    >
      {src && (
        <Image src={src} alt="" fill sizes="96px" className="object-cover" unoptimized onError={() => setFailed(true)} />
      )}
    </span>
  );
}
