import { syncEurobankTransactionsToSheet } from "./sync-enablebanking-transactions.ts";

export async function syncEurobankIkeTransactionsToSheet(sinceMs: number, knownIds: string[]) {
  return syncEurobankTransactionsToSheet(
    {
      sessionLabel: "Eurobank IKE",
      webhookAction: "fill-eurobank-ike",
      skipReason: "No new Eurobank IKE transactions",
      accountName: "02",
    },
    sinceMs,
    knownIds,
  );
}
