import { postSheetsWebhook } from "./sheets-webhook.ts";

export async function postTransactionsToSheet<T>(
  action: string,
  transactions: T[],
  sinceMs: number,
): Promise<{ transactions: T[]; sheet: Record<string, unknown> }> {
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: "No new transactions", added: 0 } };
  }

  const sheet = await postSheetsWebhook({ action, sinceMs, transactions });
  return { transactions, sheet };
}

export function filterNewByKnownIds<T extends { id: string }>(
  rows: T[],
  knownIds: Set<string>,
  sinceMs = 0,
  instantMs: (row: T) => number,
  extraKeys?: (row: T) => string[],
): T[] {
  return rows
    .filter((row) => {
      const keys = [row.id, ...(extraKeys?.(row) ?? [])].filter(Boolean);
      if (keys.some((key) => knownIds.has(key))) return false;
      return sinceMs <= 0 || instantMs(row) > sinceMs;
    })
    .sort((a, b) => instantMs(a) - instantMs(b));
}
