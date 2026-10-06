"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { useT } from "@/components/i18n-provider";
import { ChatIcon, CheckIcon, CloseIcon, MailIcon, WhatsAppIcon } from "@/components/icons";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { businessStatus, type BusinessStatus } from "@/lib/business-hours";
import { site } from "@/lib/site";
import { createTicketAction } from "@/lib/support/actions";
import { whatsappMessage, whatsappUrl } from "@/lib/whatsapp";

/**
 * Floating contact corner: a WhatsApp button that opens a chat with the store, and a chat
 * button that opens a small panel (WhatsApp, email, or a message sent to the support queue)
 * with the store's opening status. There is no third-party chat script.
 */
export function ChatWidget() {
  const tr = useT();
  const pathname = usePathname();
  const { isOpen: cartOpen } = useCart();
  const [open, setOpen] = useState(false);
  const [writing, setWriting] = useState(false);
  const [status, setStatus] = useState<BusinessStatus | null>(null);
  const [state, action, pending] = useActionState(createTicketAction, undefined);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  // The status depends on the clock, so it is worked out in the browser when the panel opens.
  const toggle = () => {
    if (!open) setStatus(businessStatus());
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !launcherRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  // Never over the cart drawer, and the checkout has its own WhatsApp link next to the payment choice.
  if (cartOpen || (pathname ?? "").startsWith("/checkout")) return null;

  const wa = whatsappUrl(whatsappMessage(pathname));
  const statusLine = !status
    ? ""
    : status.open
      ? tr("We're open now, until {time} (Central Time)", { time: status.closes })
      : status.day
        ? tr("We're closed right now. Back {day} at {time} (Central Time)", { day: tr(status.day), time: status.opens })
        : tr("We're closed right now. Back today at {time} (Central Time)", { time: status.opens });

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-3 print:hidden sm:bottom-6 sm:right-6">
      {open && (
        <div ref={panelRef} id="chat-panel" role="dialog" aria-label={tr("Chat with us")} className="pointer-events-auto w-[min(calc(100vw-2rem),360px)] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-ink-950 px-5 py-4 text-white">
            <div>
              <p className="font-display text-lg font-semibold">{tr("Chat with us")}</p>
              <p className="mt-1 flex items-start gap-2 text-[13px] leading-snug text-ink-300" data-testid="chat-status">
                <span aria-hidden className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${status?.open ? "bg-emerald-400" : "bg-gold-400"}`} />
                {statusLine}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={tr("Close chat")} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-white">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[min(70vh,520px)] overflow-y-auto p-4">
            {state?.ok ? (
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-5 text-center" role="status">
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-brand-600 text-white">
                  <CheckIcon className="h-5 w-5" />
                </span>
                <p className="mt-3 font-display text-lg font-semibold text-ink-950">{tr("Message received")}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
                  {tr("Your reference is {number}. We reply by email within one business day.", { number: state.data?.number ?? "" })}
                </p>
              </div>
            ) : writing ? (
              <form
                action={(fd) => {
                  fd.set("category", "other");
                  fd.set("subject", "Chat message from the website");
                  fd.set("body", `${String(fd.get("body") ?? "")}\n\nSent from: ${site.url}${pathname ?? ""}`);
                  return action(fd);
                }}
                className="grid gap-3"
              >
                <label className="grid gap-1 text-[13px] font-medium text-ink-800">
                  {tr("Name")}
                  <input name="name" required autoComplete="name" maxLength={120} className="h-10 rounded-lg border border-ink-300 px-3 text-[15px] font-normal text-ink-900 focus:border-brand-500" />
                </label>
                <label className="grid gap-1 text-[13px] font-medium text-ink-800">
                  {tr("Email")}
                  <input name="email" type="email" required autoComplete="email" maxLength={254} className="h-10 rounded-lg border border-ink-300 px-3 text-[15px] font-normal text-ink-900 focus:border-brand-500" />
                </label>
                <label className="grid gap-1 text-[13px] font-medium text-ink-800">
                  {tr("Message")}
                  <textarea name="body" required rows={4} minLength={10} maxLength={4000} className="rounded-lg border border-ink-300 px-3 py-2 text-[15px] font-normal text-ink-900 focus:border-brand-500" placeholder={tr("How can we help?")} />
                </label>
                <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
                {state && !state.ok && (
                  <p role="alert" className="text-[13px] text-rose-700">
                    {state.message}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.sm} flex-1`}>
                    {pending ? tr("Sending…") : tr("Send message")}
                  </button>
                  <button type="button" onClick={() => setWriting(false)} className={`${buttonStyles.outline} ${buttonSizes.sm}`}>
                    {tr("Back")}
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-ink-500">{tr("We reply by email within one business day.")}</p>
              </form>
            ) : (
              <ul className="grid gap-2.5">
                <li>
                  <a href={wa} target="_blank" rel="noopener noreferrer" data-testid="chat-whatsapp" className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 hover:border-emerald-300 hover:bg-emerald-100">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#25D366] text-white">
                      <WhatsAppIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink-950">{tr("Chat on WhatsApp")}</span>
                      <span className="block text-[13px] text-ink-600">
                        {site.whatsapp.display} · {tr("fastest reply")}
                      </span>
                    </span>
                  </a>
                </li>
                <li>
                  <a href={`mailto:${site.email}`} className="flex items-center gap-3 rounded-xl border border-ink-200 p-3.5 hover:border-brand-300 hover:bg-ink-50">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                      <MailIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink-950">{tr("Email us")}</span>
                      <span className="block truncate text-[13px] text-ink-600">{site.email}</span>
                    </span>
                  </a>
                </li>
                <li>
                  <button type="button" onClick={() => setWriting(true)} data-testid="chat-write" className="flex w-full items-center gap-3 rounded-xl border border-ink-200 p-3.5 text-left hover:border-brand-300 hover:bg-ink-50">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                      <ChatIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink-950">{tr("Leave a message")}</span>
                      <span className="block text-[13px] text-ink-600">{tr("We reply by email within one business day.")}</span>
                    </span>
                  </button>
                </li>
              </ul>
            )}
            <p className="mt-3 text-center text-xs text-ink-500">
              <Link href="/contact" onClick={() => setOpen(false)} className="font-medium text-brand-700 underline-offset-2 hover:underline">
                {tr("All contact details and opening hours")}
              </Link>
            </p>
          </div>
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="chat-panel"
        aria-label={open ? tr("Close chat") : tr("Chat with us")}
        data-testid="chat-launcher"
        className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full bg-ink-950 text-white shadow-lg ring-1 ring-white/20 transition-transform hover:scale-105"
      >
        {open ? <CloseIcon className="h-5 w-5" /> : <ChatIcon className="h-[22px] w-[22px]" />}
      </button>
      <a
        href={wa}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={tr("Message us on WhatsApp")}
        title={tr("Message us on WhatsApp")}
        data-testid="whatsapp-float"
        className="pointer-events-auto grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105"
      >
        <WhatsAppIcon className="h-7 w-7" />
      </a>
    </div>
  );
}
