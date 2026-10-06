"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { CheckIcon, ClockIcon } from "@/components/icons";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { NETWORK_WARNING } from "@/lib/crypto-payments/assets";
import { cryptoStatusAction, requoteCryptoAction, submitCryptoTxAction, type CryptoState } from "@/lib/crypto-payments/actions";
import type { CryptoView } from "@/lib/crypto-payments/service";

const STEPS = ["Waiting for payment", "Payment detected", "Confirming", "Paid"] as const;
const stepOf = (status: string) => (status === "paid" ? 3 : status === "confirming" ? 2 : status === "detected" ? 1 : 0);
/** How often the page asks the server where the payment stands. The server decides how often the chain is read. */
const POLL_MS = 15_000;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Payment instructions and live status for a crypto order. Everything shown comes from the
 * server (address, amount, status); the browser only displays it, counts the quote down and
 * asks again. There is deliberately no "I have paid" button: the order is marked paid when the
 * server has seen the transfer confirmed on the blockchain.
 */
export function CryptoPayPanel({ orderNumber, initial }: { orderNumber: string; initial: CryptoView }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [left, setLeft] = useState(initial.secondsLeft);
  const [copied, setCopied] = useState<"address" | "amount" | null>(null);
  const [hash, setHash] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startBusy] = useTransition();
  const done = useRef(false);

  const take = (res: CryptoState) => {
    if (!res.ok) return;
    setView(res.view);
    setLeft(res.view.secondsLeft);
    // Paid, or the order changed under us: let the server render the page for the new state.
    if ((res.view.status === "paid" || res.orderStatus !== "pending_payment") && !done.current) {
      done.current = true;
      router.refresh();
    }
  };

  const active = ["waiting", "detected", "confirming", "expired"].includes(view.status);
  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => {
      if (stop || document.visibilityState === "hidden") return;
      try {
        const res = await cryptoStatusAction(orderNumber);
        if (!stop) take(res);
      } catch {
        // offline or the server is busy: the next tick tries again
      }
    };
    // An expired quote is still watched for a late transfer, just less often.
    const t = window.setInterval(tick, view.status === "expired" ? POLL_MS * 4 : POLL_MS);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber, active, view.status]);

  useEffect(() => {
    if (view.status !== "waiting") return;
    const t = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [view.status, view.expiresAt]);

  const onCopy = async (what: "address" | "amount") => {
    if (await copy(what === "address" ? view.address : view.amount)) {
      setCopied(what);
      window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 2500);
    }
  };

  const onSubmitHash = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!hash.trim() || busy) return;
    setMessage(null);
    startBusy(async () => {
      try {
        const res = await submitCryptoTxAction(orderNumber, hash);
        setMessage({ ok: res.ok, text: res.message ?? (res.ok ? "Transaction found." : "That transaction could not be verified.") });
        if (res.ok) setHash("");
        take(res);
      } catch {
        setMessage({ ok: false, text: "We could not check that transaction. Check your connection and try again." });
      }
    });
  };

  const onRequote = () => {
    setMessage(null);
    startBusy(async () => {
      try {
        const res = await requoteCryptoAction(orderNumber);
        if (!res.ok) setMessage({ ok: false, text: res.message });
        take(res);
      } catch {
        setMessage({ ok: false, text: "We could not get a new amount. Check your connection and try again." });
      }
    });
  };

  const step = stepOf(view.status);
  const lapsed = view.status === "expired" || (view.status === "waiting" && left === 0);
  const sending = view.status === "waiting" && !lapsed;
  const held = view.status === "underpaid" || view.status === "review";
  const seen = view.status === "detected" || view.status === "confirming" || view.status === "paid" || held;

  return (
    <div className="mx-auto mt-6 max-w-md text-left" data-testid="crypto-pay" data-status={view.status} data-coin={view.coin} data-network={view.network}>
      {/* Status */}
      <ol className="grid grid-cols-4 gap-1.5" aria-label="Payment status">
        {STEPS.map((label, i) => {
          const state = held ? (i <= 1 ? "done" : "todo") : i < step || view.status === "paid" ? "done" : i === step ? "now" : "todo";
          return (
            <li key={label} aria-current={state === "now" ? "step" : undefined} className="text-center">
              <span className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold ${state === "done" ? "bg-brand-600 text-white" : state === "now" ? "bg-gold-500 text-white" : "bg-ink-100 text-ink-500"}`}>
                {state === "done" ? <CheckIcon className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`mt-1.5 block text-[11px] leading-tight ${state === "todo" ? "text-ink-500" : "font-semibold text-ink-900"}`}>
                {label}
                {label === "Confirming" && view.status === "confirming" ? ` ${view.confirmations}/${view.requiredConfirmations}` : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-center text-sm text-ink-700" role="status" aria-live="polite" data-testid="crypto-status-text">
        {view.status === "paid" && "Payment confirmed on the blockchain. Thank you."}
        {view.status === "confirming" && `Payment found. Waiting for the network to confirm it: ${view.confirmations} of ${view.requiredConfirmations} confirmations.`}
        {view.status === "detected" && "Payment detected. Waiting for the network to include it in a block."}
        {sending && (view.automatic ? "Waiting for your payment. This page updates by itself once the network shows it." : "Waiting for your payment. After sending, enter the transaction hash below so we can verify it.")}
        {lapsed && "The time to pay this amount has run out."}
        {view.status === "underpaid" && `We received ${view.receivedLabel ?? "a payment"}, which is less than the amount due. We will email you about the difference.`}
        {view.status === "review" && `We received ${view.receivedLabel ?? "a payment"} and a member of our team is checking it. We will email you shortly.`}
      </p>

      {/* What to send */}
      <dl className="mt-5 grid gap-2.5 rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-600">Order total</dt>
          <dd className="font-semibold tabular-nums text-ink-950" data-testid="crypto-usd">{view.usdLabel}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-ink-600">You pay</dt>
          <dd className="text-right font-display text-lg font-semibold tabular-nums text-ink-950" data-testid="crypto-amount">{view.amountLabel}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-600">Network</dt>
          <dd className="font-semibold text-ink-950" data-testid="crypto-network">{view.networkLabel}</dd>
        </div>
        <div className="flex justify-between gap-4 text-[13px]">
          <dt className="text-ink-500">Rate</dt>
          <dd className="text-ink-600">{view.rateLabel}</dd>
        </div>
        {sending && (
          <div className="flex items-center justify-between gap-4 border-t border-ink-200 pt-2.5 text-[13px]">
            <dt className="flex items-center gap-1.5 text-ink-600">
              <ClockIcon className="h-4 w-4" /> Amount held for
            </dt>
            <dd className="font-mono font-semibold tabular-nums text-ink-950" data-testid="crypto-countdown">{clock(left)}</dd>
          </div>
        )}
      </dl>

      {sending && (
        <>
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-medium leading-relaxed text-rose-800" role="note" data-testid="crypto-warning">
            {NETWORK_WARNING}
          </p>
          {view.note && <p className="mt-2 rounded-lg border border-gold-400/50 bg-gold-400/10 px-4 py-3 text-[13px] leading-relaxed text-gold-800">{view.note}</p>}

          <div className="mt-4 rounded-xl border border-ink-200 bg-white p-4">
            <div className="mx-auto w-44 max-w-full rounded-lg bg-white p-1 ring-1 ring-ink-200 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full" role="img" aria-label={`QR code of the ${view.coin} address on ${view.networkLabel}`} data-testid="crypto-qr" dangerouslySetInnerHTML={{ __html: view.qrSvg }} />
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">
              {view.coin} address · {view.networkShort}
            </p>
            <p className="mt-1.5 break-all rounded-lg bg-ink-50 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-ink-950" data-testid="crypto-address">
              {view.address}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => onCopy("address")} className={`${buttonStyles.primary} ${buttonSizes.md} w-full justify-center`} data-testid="crypto-copy-address">
                {copied === "address" ? "Address copied" : "Copy Address"}
              </button>
              <button type="button" onClick={() => onCopy("amount")} className={`${buttonStyles.outline} ${buttonSizes.md} w-full justify-center`}>
                {copied === "amount" ? "Amount copied" : "Copy amount"}
              </button>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-600">
              Send <strong className="font-semibold text-ink-900">exactly {view.amountLabel}</strong>. The last digits identify your order, so please do not round the amount. If your wallet or exchange deducts its fee from the amount, add the fee on top.
            </p>
          </div>
        </>
      )}

      {lapsed && (
        <div className="mt-4 rounded-xl border border-ink-200 bg-white p-4 text-center">
          <p className="text-sm text-ink-700">Rates move, so an amount is only held for a limited time. If you have not sent anything yet, get a new amount and pay that. If you already sent the payment, do not send it again: enter its transaction hash below.</p>
          <button type="button" onClick={onRequote} disabled={busy} className={`${buttonStyles.primary} ${buttonSizes.md} mt-3`} data-testid="crypto-requote">
            {busy ? "Getting a new amount…" : "Get a new amount"}
          </button>
        </div>
      )}

      {seen && view.txHash && (
        <div className="mt-4 rounded-xl border border-ink-200 bg-white p-4 text-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Transaction</p>
          <p className="mt-1.5 break-all font-mono text-[12px] text-ink-900">{view.txHash}</p>
          {view.receivedLabel && <p className="mt-2 text-ink-700">Received: {view.receivedLabel}</p>}
          {view.explorerUrl && (
            <a href={view.explorerUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-medium text-brand-700 underline-offset-2 hover:underline">
              View on the block explorer
            </a>
          )}
        </div>
      )}

      {(sending || lapsed) && !view.txHash && (
        <details className="mt-4 rounded-xl border border-ink-200 bg-white p-4" open={!view.automatic || lapsed} data-testid="crypto-hash-box">
          <summary className="cursor-pointer text-sm font-semibold text-ink-950">{view.automatic ? "Already sent it and it is not showing?" : "After sending: enter your transaction hash"}</summary>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
            {view.automatic ? "Payments usually appear here within a minute or two. If yours does not, paste" : "Incoming " + view.coin + " on this network is verified from its transaction. Paste"} the transaction hash (also called TxID) from your wallet or exchange. We look it up on the blockchain; the order is confirmed only when the network shows the payment.
          </p>
          <form onSubmit={onSubmitHash} className="mt-3 grid gap-2">
            <input value={hash} onChange={(e) => setHash(e.target.value)} name="txhash" aria-label="Transaction hash" placeholder="Transaction hash (TxID)" autoComplete="off" spellCheck={false} maxLength={200} className="h-11 w-full rounded-lg border border-ink-300 bg-white px-3 font-mono text-[13px] text-ink-900 focus:border-brand-500" />
            <button type="submit" disabled={busy || !hash.trim()} className={`${buttonStyles.outline} ${buttonSizes.md} justify-center`}>
              {busy ? "Checking the blockchain…" : "Verify transaction"}
            </button>
          </form>
        </details>
      )}

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`mt-3 rounded-lg px-4 py-3 text-[13px] ${message.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-700"}`} data-testid="crypto-message">
          {message.text}
        </p>
      )}
    </div>
  );
}
