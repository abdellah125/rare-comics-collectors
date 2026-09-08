import { preload } from "react-dom";
import type { ProductSummary } from "@/lib/products";
import coverMap from "@/lib/gocovers-map.json";

/**
 * Comic cover plate. Hook-free so it renders on the server inside product cards
 * and only the cart buttons hydrate.
 *
 * Source order: a local scan from `gocovers-map.json` (WebP under /public/covers
 * with 192/256/384/640 px WebP and AVIF siblings from scripts/optimize-covers.mjs),
 * then the product's own image (uploads, remote URLs) served as-is. The gradient
 * palette sits underneath, so a missing or failed image still leaves a finished
 * plate with the title, issue and grade.
 */
const WIDTHS = [192, 256, 384, 640] as const;
const isLocalScan = (src: string) => /^\/covers\/[^/]+\.webp$/.test(src);
const variantUrl = (src: string, width: number, ext: "webp" | "avif") => (width === 640 ? src.replace(/\.webp$/, `.${ext}`) : src.replace(/\.webp$/, `-${width}.${ext}`));
const srcSetFor = (src: string, ext: "webp" | "avif") => WIDTHS.map((w) => `${variantUrl(src, w, ext)} ${w}w`).join(", ");

export const DEFAULT_COVER_SIZES = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px";

export function CoverArt({
  product,
  className = "",
  priority = false,
  sizes = DEFAULT_COVER_SIZES,
}: {
  product: ProductSummary;
  className?: string;
  /** Above the fold: eager, high fetch priority and a preload hint (the product page's LCP image). */
  priority?: boolean;
  /** The slot's rendered width, so the browser picks the smallest sufficient file. */
  sizes?: string;
}) {
  const [from, to] = product.palette;
  const slabbed = product.grader !== "Raw";
  const src = (coverMap as Record<string, string>)[product.slug] ?? product.image ?? null;
  const responsive = src !== null && isLocalScan(src);
  if (priority && src) {
    preload(responsive ? variantUrl(src, 640, "avif") : src, {
      as: "image",
      fetchPriority: "high",
      ...(responsive ? { imageSrcSet: srcSetFor(src, "avif"), imageSizes: sizes, type: "image/avif" } : {}),
    });
  }
  const imgProps = {
    decoding: "async" as const,
    loading: priority ? ("eager" as const) : ("lazy" as const),
    fetchPriority: priority ? ("high" as const) : undefined,
    className: "absolute inset-0 h-full w-full object-cover",
  };

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
      {src &&
        (responsive ? (
          <picture>
            <source type="image/avif" srcSet={srcSetFor(src, "avif")} sizes={sizes} />
            <img src={src} srcSet={srcSetFor(src, "webp")} sizes={sizes} alt="" {...imgProps} />
          </picture>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" {...imgProps} />
        ))}

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
