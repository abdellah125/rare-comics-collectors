import { describe, expect, it } from "vitest";
import { bankTransferDetails } from "@/lib/payments/bank-details";
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
});
