import type { BankTransferLine } from "@/lib/payments/bank-details";

/** Wire details block used at checkout, on the confirmation page and on the order page. */
export function BankDetails({ lines, note, compact = false }: { lines: BankTransferLine[]; note: string; compact?: boolean }) {
  return (
    <div className={compact ? "text-sm" : "text-[15px]"}>
      {lines.length === 0 ? (
        <p className="text-ink-600">Bank details are sent by email as soon as the order is placed.</p>
      ) : (
        <dl className="grid gap-1.5">
          {lines.map((l) => (
            <div key={l.label} className="flex flex-wrap items-baseline justify-between gap-x-4">
              <dt className="text-ink-600">{l.label}</dt>
              <dd className="font-mono font-medium text-ink-950">{l.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {note && <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-ink-600">{note}</p>}
    </div>
  );
}
