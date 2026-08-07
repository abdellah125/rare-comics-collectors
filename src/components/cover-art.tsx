import type { Product } from "@/lib/products";

/**
 * Renders a comic cover plate in pure CSS/SVG. Placeholder art stands in for the
 * real scan — swap the inner block for <Image src={product.image} …> once a CMS
 * or DAM is wired up. Kept deterministic so pages remain fully static.
 */
export function CoverArt({
  product,
  className = "",
  priority = false,
}: {
  product: Product;
  className?: string;
  priority?: boolean;
}) {
  const [from, to] = product.palette;
  const slabbed = product.grader !== "Raw";

  return (
    <div
      className={`relative isolate overflow-hidden rounded-md ${className}`}
      style={{ background: `linear-gradient(150deg, ${from} 0%, ${to} 100%)` }}
      role="img"
      aria-label={`${product.title} ${product.issue} — ${product.publisher}, ${product.year}, ${product.grader} ${product.grade}`}
    >
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
              product.label.startsWith("Signature")
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

      {priority ? null : null}
    </div>
  );
}
