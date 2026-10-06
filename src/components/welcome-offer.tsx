"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useCart } from "@/components/cart-provider";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { useT } from "@/components/i18n-provider";
import { buttonSizes, buttonStyles } from "@/components/ui";

/** The existing coupon; this component only advertises it and never touches how it is applied. */
const CODE = "NEWRCC";
const DISMISSED_KEY = "rcc_welcome_offer_dismissed";
const CLAIMED_KEY = "rcc_welcome_offer_claimed";
const CLAIMED_DAYS = 30;
const DELAY_MS = 3500;
/** Never over the cart, the checkout or signed-in areas: nothing may sit between a buyer and paying. */
const QUIET_PATHS = /^\/(cart|checkout|account|dashboard|track-order|appeal|report)(\/|$)/;
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const read = (storage: "sessionStorage" | "localStorage", key: string): string | null => {
  try {
    return window[storage].getItem(key);
  } catch {
    return null; // private mode / storage blocked: treat as a first visit
  }
};
const write = (storage: "sessionStorage" | "localStorage", key: string, value: string) => {
  try {
    window[storage].setItem(key, value);
  } catch {
    // nothing to remember it in; the popup simply closes
  }
};

/**
 * Welcome offer for first-time buyers. Opens once per browsing session a few seconds after
 * the page has settled, as a centred card on desktop and a bottom sheet on phones (it never
 * covers the whole screen). `returningCustomer` comes from the server: a signed-in buyer who
 * already has a paid order is not eligible for the code, so is never shown it.
 */
export function WelcomeOffer({ returningCustomer }: { returningCustomer: boolean }) {
  const tr = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const quiet = QUIET_PATHS.test(pathname ?? "");
  const { isOpen: cartOpen } = useCart();
  const cartOpenRef = useRef(cartOpen);
  useEffect(() => {
    cartOpenRef.current = cartOpen;
  }, [cartOpen]);

  useEffect(() => {
    if (returningCustomer || quiet) return;
    if (read("sessionStorage", DISMISSED_KEY)) return;
    const claimedAt = Number(read("localStorage", CLAIMED_KEY) ?? 0);
    if (claimedAt && Date.now() - claimedAt < CLAIMED_DAYS * 86_400_000) return;
    const t = window.setTimeout(() => {
      // The visitor is already in the cart drawer: do not stack a second dialog on top of it.
      if (cartOpenRef.current) return;
      restoreFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(true);
    }, DELAY_MS);
    return () => window.clearTimeout(t);
  }, [returningCustomer, quiet]);

  const close = useCallback((claimed = false) => {
    write("sessionStorage", DISMISSED_KEY, "1");
    if (claimed) write("localStorage", CLAIMED_KEY, String(Date.now()));
    setOpen(false);
    restoreFocusTo.current?.focus?.();
    restoreFocusTo.current = null;
  }, []);

  // Reaching the cart or checkout by any route hides it (see the render guard) for the rest of the session.
  useEffect(() => {
    if (open && quiet) write("sessionStorage", DISMISSED_KEY, "1");
  }, [open, quiet]);

  useEffect(() => {
    if (!open || quiet) return;
    // Focus the card itself, not a control: keyboard and screen-reader users land in the dialog
    // without a focus ring flashing on the close button for everyone who arrived by mouse or touch.
    const t = window.setTimeout(() => panelRef.current?.focus({ preventScroll: true }), 60);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, quiet, close]);

  const trapFocus = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CODE);
    } catch {
      // Clipboard blocked (permissions, insecure context): the code stays selectable on screen.
      const range = document.createRange();
      const node = panelRef.current?.querySelector("[data-code]");
      if (node) {
        range.selectNodeContents(node);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
    setCopied(true);
    write("localStorage", CLAIMED_KEY, String(Date.now()));
    window.setTimeout(() => setCopied(false), 2400);
  };

  if (!open || quiet) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <div onClick={() => close()} aria-hidden className="welcome-offer-backdrop absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-offer-title"
        aria-describedby="welcome-offer-terms"
        tabIndex={-1}
        onKeyDown={trapFocus}
        className="welcome-offer-panel relative outline-none isolate w-full max-w-[26rem] overflow-hidden rounded-t-2xl bg-ink-950 text-white shadow-lift ring-1 ring-white/10 sm:rounded-2xl"
        style={{ background: "linear-gradient(155deg, #1c2130 0%, #0d1017 58%, #160a10 100%)" }}
      >
        {/* halftone print texture and a soft key light, as on the cover plates */}
        <div aria-hidden className="absolute inset-0 -z-10 opacity-[0.16]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,.75) 1px, transparent 0)", backgroundSize: "7px 7px" }} />
        <div aria-hidden className="absolute -right-24 -top-28 -z-10 h-64 w-64 rounded-full bg-brand-600/30 blur-3xl" />
        <div aria-hidden className="absolute -bottom-28 -left-20 -z-10 h-56 w-56 rounded-full bg-gold-400/15 blur-3xl" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-400/70 to-transparent" />

        <button
          type="button"
          onClick={() => close()}
          aria-label={tr("Close welcome offer")}
          className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        <div className="px-6 pb-6 pt-8 text-center sm:px-9 sm:pb-8 sm:pt-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-gold-400">{tr("Welcome offer")}</p>
          <h2 id="welcome-offer-title" className="mt-3 font-display text-[3.25rem] font-semibold leading-none tracking-tight text-white sm:text-6xl">
            {tr("10% Off")}
          </h2>
          <div aria-hidden className="mx-auto mt-4 h-px w-12 bg-gold-400/60" />
          <ul className="mt-4 grid gap-0.5 text-[15px] font-medium text-white/90">
            <li>{tr("New Customers")}</li>
            <li>{tr("Your First Comic")}</li>
            <li>{tr("Up to $1,000 Off")}</li>
          </ul>

          <div className="mt-6 rounded-xl border border-dashed border-gold-400/50 bg-white/[0.04] p-1.5">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-ink-950/60 py-2 pl-4 pr-2">
              <span className="text-left">
                <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">{tr("Use code")}</span>
                <span data-code className="block select-all font-logo text-xl font-black tracking-[0.16em] text-gold-300">
                  {CODE}
                </span>
              </span>
              <button
                type="button"
                onClick={copy}
                className="inline-flex h-10 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 text-[13px] font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
              >
                {copied ? (
                  <>
                    <CheckIcon className="h-4 w-4 text-gold-300" /> {tr("Copied")}
                  </>
                ) : (
                  tr("Copy code")
                )}
              </button>
            </div>
          </div>
          <span role="status" className="sr-only">
            {copied ? tr("Code {code} copied", { code: CODE }) : ""}
          </span>

          <Link href="/store" onClick={() => close(true)} className={`${buttonStyles.gold} ${buttonSizes.lg} mt-5 w-full uppercase tracking-[0.12em]`}>
            {tr("Shop comics")}
          </Link>

          <p id="welcome-offer-terms" className="mt-4 text-[11px] leading-relaxed text-white/50">
            {tr("New customers only. Valid on your first comic purchase. 10% off, maximum discount $1,000. Use code {code}. Other exclusions may apply.", { code: CODE })}
          </p>
        </div>
      </div>
    </div>
  );
}
