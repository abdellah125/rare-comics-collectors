import "server-only";
import type { Settings } from "@/lib/settings";

export type BankTransferLine = { label: string; value: string };
export type BankTransferDetails = {
  /** Only the fields finance has filled in, in display order. */
  lines: BankTransferLine[];
  /** Free-text instructions shown under the details. */
  note: string;
  /** Plain-text block for emails and the provider's instructions. */
  text: string;
  /** How long the reservation holds while the wire arrives. */
  reserveHours: number;
};

/** Bank wire details as configured under Finance › Payment providers, optionally with the order reference. */
export function bankTransferDetails(settings: Settings, reference?: string): BankTransferDetails {
  const fields: [string, string][] = [
    ["Beneficiary", settings["payments.bank_transfer.beneficiary"]],
    ["Bank", settings["payments.bank_transfer.bankName"]],
    ["Account type", settings["payments.bank_transfer.accountType"]],
    ["Account number", settings["payments.bank_transfer.accountNumber"]],
    ["Routing number (ABA)", settings["payments.bank_transfer.routingNumber"]],
    ["SWIFT / BIC", settings["payments.bank_transfer.swift"]],
    ["IBAN", settings["payments.bank_transfer.iban"]],
  ];
  const lines = fields.filter(([, v]) => typeof v === "string" && v.trim()).map(([label, value]) => ({ label, value: value.trim() }));
  if (reference) lines.push({ label: "Payment reference", value: reference });
  const note = (settings["payments.bank_transfer.instructions"] ?? "").trim();
  const text = [...lines.map((l) => `${l.label}: ${l.value}`), note ? `\n${note}` : ""].filter(Boolean).join("\n");
  return { lines, note, text, reserveHours: settings["commerce.autoCancelUnpaidHours"] };
}
