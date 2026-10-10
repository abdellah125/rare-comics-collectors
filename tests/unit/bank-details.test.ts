import { describe, expect, it } from "vitest";
import { bankDetailsComplete, bankTransferDetails } from "@/lib/payments/bank-details";
import { settingDefaults } from "@/lib/settings";

describe("bank transfer details", () => {
  it("lists only the fields that are filled in and appends the reference", () => {
    const d = bankTransferDetails({ ...settingDefaults, "payments.bank_transfer.bankName": "JPMorgan Chase Bank, N.A.", "payments.bank_transfer.accountNumber": "30000002742046", "payments.bank_transfer.routingNumber": "021000021" }, "RCC-2026-123456");
    expect(d.lines.map((l) => l.label)).toEqual(["Bank", "Account number", "Routing number (ABA)", "Payment reference"]);
    expect(d.text).toContain("Routing number (ABA): 021000021");
    expect(d.text).toContain("Payment reference: RCC-2026-123456");
    expect(d.text).toContain(d.note);
    expect(d.reserveHours).toBe(settingDefaults["commerce.autoCancelUnpaidHours"]);
  });
  it("has no bank lines when nothing is configured", () => {
    expect(bankTransferDetails(settingDefaults).lines).toEqual([]);
  });
  it("is offered only once an account name and an account number or IBAN are entered", () => {
    const base = { ...settingDefaults, "payments.bank_transfer.beneficiary": "", "payments.bank_transfer.accountNumber": "", "payments.bank_transfer.iban": "" };
    expect(bankDetailsComplete(base)).toBe(false);
    expect(bankDetailsComplete({ ...base, "payments.bank_transfer.beneficiary": "Rare Comics Collectors, LLC" })).toBe(false);
    expect(bankDetailsComplete({ ...base, "payments.bank_transfer.accountNumber": "30000002742046" })).toBe(false);
    expect(bankDetailsComplete({ ...base, "payments.bank_transfer.beneficiary": "RCC", "payments.bank_transfer.accountNumber": "30000002742046" })).toBe(true);
    expect(bankDetailsComplete({ ...base, "payments.bank_transfer.beneficiary": "RCC", "payments.bank_transfer.iban": "GB33BUKB20201555555555" })).toBe(true);
    expect(bankDetailsComplete({ ...base, "payments.bank_transfer.beneficiary": "   ", "payments.bank_transfer.iban": "GB33" })).toBe(false);
  });
});
