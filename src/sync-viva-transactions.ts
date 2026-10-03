import { dayMonthYearToMs, formatGreekAmount } from "./data.ts";
import { isVivaDataServicesConfigured, listVivaAccountTransactions } from "./viva.ts";
import type { VivaSheetTransaction } from "./sheet-viva.ts";
import { filterNewByKnownIds, postTransactionsToSheet } from "./sync-to-sheet.ts";

function toVivaDate(iso: string): string {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${Number(m[3])}/${Number(m[2])}/${m[1]}`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

function txInstant(tx: VivaSheetTransaction): number {
  return dayMonthYearToMs(tx.transactionDate || tx.valueDate);
}

export async function syncVivaTransactionsToSheet(sinceMs: number, knownIds: string[]) {
  if (!isVivaDataServicesConfigured()) {
    throw new Error(
      "VIVA_DATA_SERVICES_CLIENT_ID and VIVA_DATA_SERVICES_CLIENT_SECRET are not set on Render. These are issued by Viva (CAS-05120514), not Settings → API Access.",
    );
  }
  const known = new Set(knownIds);
  const fetched = await listVivaAccountTransactions(sinceMs);
  fetched.sort((a, b) => (Date.parse(a.created) || 0) - (Date.parse(b.created) || 0));
  const raw = fetched.map((t): VivaSheetTransaction => ({
    id: t.id,
    transactionDate: toVivaDate(t.created),
    valueDate: t.valueDate ? toVivaDate(t.valueDate) : toVivaDate(t.created),
    description: t.description,
    origAmount: formatGreekAmount(t.amount),
    balance: t.balance !== undefined ? formatGreekAmount(t.balance) : undefined,
  }));
  const transactions = filterNewByKnownIds(raw, known, sinceMs, txInstant, (row) => [
    `${row.transactionDate}|${row.description}|${row.origAmount}`,
  ]);
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: "No new Viva transactions", added: 0 } };
  }
  return postTransactionsToSheet("fill-viva", transactions, sinceMs);
}
