"use client";

import { buttonSizes, buttonStyles } from "@/components/ui";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={`${buttonStyles.outline} ${buttonSizes.sm}`}>
      Print / save as PDF
    </button>
  );
}
