export const VIVA_YELLOW_HEADERS = {
  transactionDate: "Transaction Date",
  valueDate: "Value Date",
  description: "Description",
  origAmount: "Orig Amount",
  balance: "Balance",
  fxRate: "Ισοτιμία ",
} as const;

export interface VivaSheetTransaction {
  id: string;
  transactionDate: string;
  valueDate: string;
  description: string;
  origAmount: string;
  balance?: string;
  fxRate?: number;
}

export function vivaRowValues(tx: VivaSheetTransaction): Record<keyof typeof VIVA_YELLOW_HEADERS, string | number> {
  return {
    transactionDate: tx.transactionDate,
    valueDate: tx.valueDate,
    description: tx.description,
    origAmount: tx.origAmount,
    balance: tx.balance ?? "",
    fxRate: tx.fxRate ?? "",
  };
}
