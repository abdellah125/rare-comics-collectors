"use client";
import Image from "next/image";
import { useState } from "react";
import type { ProductSummary } from "@/lib/products";
import coverMap from "@/lib/gocovers-map.json";

/**
 * Comic cover plate.
 * Source order: a real scan from `gocovers-map.json` (JPEG/WebP under
 * /public/covers), then the product's explicit `image`, then the generated
 * per-product SVG. If the chosen file fails to load we drop to the SVG, and the
 * gradient palette sits underneath everything so the plate never renders empty.
 * Local scans come in 640 px and 384 px WebP variants chosen through `sizes`; anything
 * else (uploads, remote URLs) is served as-is.
 */
/** Local cover scans ship in two widths; anything up to 384 CSS px × DPR gets the small file. */
const coverLoader = ({ src, width }: { src: string; width: number }) => {
  // 192/256/384 px siblings come from scripts/optimize-covers.mjs; larger requests get the full file.
  const variant = [192, 256, 384].find((w) => width <= w);
  return variant ? src.replace(/\.webp$/, `-${variant}.webp`) : src;
};
const hasVariants = (src: string) => /^\/covers\/[^/]+\.webp$/.test(src);

export function CoverArt({
  product,
  className = "",
  priority = false,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px",
}: {
  product: ProductSummary;
  className?: string;
  priority?: boolean;
  /** The slot's rendered width, so the browser picks the smallest sufficient file. */
  sizes?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [from, to] = product.palette;
  const slabbed = product.grader !== "Raw";
  const localBest = (coverMap as Record<string, string>)[product.slug] ?? null;
  // Only the seed catalogue ships a per-product SVG plate; for everything else a failed
  // load simply reveals the gradient instead of requesting a file that does not exist.
  const fallbackSvg = localBest ? `/covers/${product.slug}.svg` : null;
  const src = imgFailed ? fallbackSvg : (localBest ?? product.image ?? null);

  return (
    <div
      className={`relative isolate overflow-hidden rounded-md ${className}`}
      style={{ background: `linear-gradient(150deg, ${from} 0%, ${to} 100%)` }}
      role="img"
      aria-label={`${product.title} ${product.issue} — ${product.publisher}, ${product.year}, ${
        slabbed ? `${product.grader} ${product.grade}` : `raw, graded ${product.grade}`
      }`}
    >
      {/* The wrapper carries the accessible name, so the scan itself is decorative. */}
      {src && (
        <Image
          src={src}
          alt=""
          fill
          sizes={sizes}
          className="object-cover"
          priority={priority}
          loader={hasVariants(src) ? coverLoader : undefined}
          unoptimized={!hasVariants(src)}
          onError={() => setImgFailed(true)}
        />
      )}

      {/* halftone / print texture */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-25 mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,.7) 1px, transparent 0)",
          backgroundSize: "7px 7px",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(200deg, rgba(255,255,255,.22), transparent 42%, rgba(0,0,0,.42))" }}
      />

      {/* slab shell */}
      {slabbed && (
        <div aria-hidden className="absolute inset-[5%] rounded-[3px] ring-1 ring-white/35 shadow-[inset_0_0_0_3px_rgba(255,255,255,.12)]" />
      )}

      <div className="relative flex h-full flex-col p-[7%]">
        {/* grader strip */}
        <div className="flex items-start justify-between gap-2">
          <span className="rounded-[3px] bg-white/92 px-1.5 py-[3px] text-[9px] font-bold uppercase leading-none tracking-[0.14em] text-ink-950">
            {product.publisher.split(" ")[0]}
          </span>
          <span
            className={`rounded-[3px] px-1.5 py-[3px] text-[9px] font-bold uppercase leading-none tracking-[0.12em] ${
              /signature/i.test(product.label)
                ? "bg-gold-400 text-ink-950"
                : slabbed
                  ? "bg-ink-950/85 text-white"
                  : "bg-white/25 text-white ring-1 ring-white/40"
            }`}
          >
            {product.grader}
          </span>
        </div>

        <div className="mt-auto">
          <p className="font-display text-[clamp(0.95rem,2.4vw,1.6rem)] font-semibold leading-[1.08] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,.45)]">
            {product.title}
          </p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85">
            {product.issue} · {product.year}
          </p>
        </div>
      </div>

      {/* grade chip */}
      <div className="absolute bottom-[6%] right-[6%] flex h-[19%] w-[19%] min-h-9 min-w-9 items-center justify-center rounded-full bg-white text-center shadow-lift ring-2 ring-ink-950/10">
        <span className="font-display text-[clamp(0.6rem,1.5vw,0.95rem)] font-bold leading-none text-ink-950">
          {product.grade.replace(/[^\d.]/g, "") || product.grade}
        </span>
      </div>
    </div>
  );
}
