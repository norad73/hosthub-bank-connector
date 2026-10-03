/** Yellow import columns on Eurobank / EurobankIKE tabs. */
export const EUROBANK_YELLOW_HEADERS = {
  bookingDate: "ΗΜ/ΝΙΑ ΚINΗΣΗΣ",
  valueDate: "ΗΜ/ΝΙΑ ΑΞΙΑΣ",
  description: "Description",
  amount: "ΠΟΣΟ",
  balance: "ΥΠΟΛΟΙΠΟ",
  fxRate: "Ισοτιμία ",
} as const;

export interface EurobankSheetTransaction {
  id: string;
  bookingDate: string;
  valueDate: string;
  description: string;
  amount: string;
  balance?: string;
  fxRate?: number;
}

export function eurobankRowValues(tx: EurobankSheetTransaction): Record<keyof typeof EUROBANK_YELLOW_HEADERS, string | number> {
  return {
    bookingDate: tx.bookingDate,
    valueDate: tx.valueDate,
    description: tx.description,
    amount: tx.amount,
    balance: tx.balance ?? "",
    fxRate: tx.fxRate ?? "",
  };
}
