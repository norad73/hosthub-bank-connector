import { fetchBalanceActivityReportCsv, isAirwallexConfigured } from "./airwallex.ts";
import { postSheetsWebhook } from "./sheets-webhook.ts";
import {
  loadAirwallexTransactionIds,
  rememberAirwallexTransactionIds,
  type AirwallexCurrency,
} from "./airwallex-sync-store.ts";
import { parseCsv } from "./parse-csv.ts";
import type { AirwallexSheetRow } from "./sheet-airwallex.ts";

export type { AirwallexCurrency };

export type { AirwallexSheetRow };

/** Available-balance holds/releases — do not post to Account balance (BAR v1.2). */
const AIRWALLEX_RESERVATION_TYPES = new Set([
  "CARD_AUTHORISATION",
  "CARD_AUTHORISATION_RELEASE",
  "PAYIN_REFUND_HOLD",
  "PAYIN_REFUND_RELEASE",
  "PAYMENT_RESERVE_HOLD",
  "PAYMENT_RESERVE_RELEASE",
]);

const SYNC_CONFIG: Record<
  AirwallexCurrency,
  { webhookAction: string; skipReason: string; label: string }
> = {
  USD: {
    webhookAction: "fill-airwallex-usd",
    skipReason: "No new Airwallex USD transactions",
    label: "Airwallex USD",
  },
  EUR: {
    webhookAction: "fill-airwallex-eur",
    skipReason: "No new Airwallex EUR transactions",
    label: "Airwallex EUR",
  },
};

const BAR_HEADERS = [
  "Time",
  "Type",
  "Financial Transaction Type",
  "Transaction Id",
  "Description",
  "Wallet Currency",
  "Target Currency",
  "Target Amount",
  "Conversion Rate",
  "Mature Date",
  "Amount",
  "Fee",
  "Debit Net Amount",
  "Credit Net Amount",
  "Account Balance",
  "Available Balance",
  "Created At",
  "Request Id",
  "Reference",
  "Note to Self",
] as const;

function isoDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function sinceToFromDate(sinceMs: number): string {
  if (sinceMs <= 0) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 7);
    return isoDate(d);
  }
  return isoDate(new Date(sinceMs));
}

function rowTimeMs(row: AirwallexSheetRow): number {
  const ms = Date.parse(row.time);
  return Number.isFinite(ms) ? ms : 0;
}

export function affectsAirwallexAccountBalance(row: Pick<AirwallexSheetRow, "financialTransactionType">): boolean {
  const type = row.financialTransactionType.trim().toUpperCase();
  if (!type) return true;
  return !AIRWALLEX_RESERVATION_TYPES.has(type);
}

export function airwallexBalanceDelta(row: AirwallexSheetRow): number {
  const credit = Number(row.creditNetAmount) || 0;
  const debit = Number(row.debitNetAmount) || 0;
  return credit - debit;
}

export function validatesAirwallexBalanceChain(rows: AirwallexSheetRow[], startBalance?: number): boolean {
  let prev = startBalance;
  for (const row of rows) {
    const curr = Number(row.accountBalance);
    if (!Number.isFinite(curr)) return false;
    if (prev !== undefined && Math.abs(prev + airwallexBalanceDelta(row) - curr) > 0.015) return false;
    prev = curr;
  }
  return true;
}

function parseNumeric(value: string): string | number {
  const text = value.trim().replace(/,/g, "");
  if (!text) return "";
  const n = Number(text);
  return Number.isFinite(n) ? n : value.trim();
}

function mapBarRow(cols: Record<string, string>): AirwallexSheetRow | null {
  const transactionId = cols["Transaction Id"]?.trim();
  if (!transactionId) return null;
  return {
    transactionId,
    time: cols.Time?.trim() ?? "",
    type: cols.Type?.trim() ?? "",
    financialTransactionType: cols["Financial Transaction Type"]?.trim() ?? "",
    description: cols.Description?.trim() ?? "",
    walletCurrency: cols["Wallet Currency"]?.trim() ?? "",
    targetCurrency: cols["Target Currency"]?.trim() ?? "",
    targetAmount: parseNumeric(cols["Target Amount"] ?? ""),
    conversionRate: parseNumeric(cols["Conversion Rate"] ?? ""),
    matureDate: cols["Mature Date"]?.trim() ?? "",
    amount: parseNumeric(cols.Amount ?? ""),
    fee: parseNumeric(cols.Fee ?? ""),
    debitNetAmount: parseNumeric(cols["Debit Net Amount"] ?? ""),
    creditNetAmount: parseNumeric(cols["Credit Net Amount"] ?? ""),
    availableBalance: parseNumeric(cols["Available Balance"] ?? ""),
    accountBalance: parseNumeric(cols["Account Balance"] ?? ""),
    createdAt: cols["Created At"]?.trim() ?? "",
    requestId: cols["Request Id"]?.trim() ?? "",
    reference: cols.Reference?.trim() ?? "",
    noteToSelf: cols["Note to Self"]?.trim() ?? "",
  };
}

export function parseBalanceActivityCsv(csv: string): AirwallexSheetRow[] {
  const table = parseCsv(csv.trim());
  if (!table.length) return [];
  const header = table[0].map((h) => h.trim());
  const idx = Object.fromEntries(header.map((name, i) => [name, i]));
  for (const required of BAR_HEADERS) {
    if (!(required in idx)) throw new Error(`Balance Activity CSV missing column: ${required}`);
  }
  const out: AirwallexSheetRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cols: Record<string, string> = {};
    for (const name of BAR_HEADERS) {
      cols[name] = table[r][idx[name]!] ?? "";
    }
    const row = mapBarRow(cols);
    if (row) out.push(row);
  }
  return out;
}

export function filterNewAirwallexRows(
  currency: AirwallexCurrency,
  rows: AirwallexSheetRow[],
  known: Set<string>,
  sinceMs = 0,
  opts?: { skipSinceFilter?: boolean },
): AirwallexSheetRow[] {
  const skipped = rows.filter((row) => !affectsAirwallexAccountBalance(row)).map((row) => row.transactionId);
  if (skipped.length) rememberAirwallexTransactionIds(currency, skipped);
  const out: AirwallexSheetRow[] = [];
  for (const row of rows) {
    if (!affectsAirwallexAccountBalance(row)) continue;
    if (known.has(row.transactionId)) continue;
    if (!opts?.skipSinceFilter && sinceMs > 0 && rowTimeMs(row) <= sinceMs) continue;
    out.push(row);
  }
  return out;
}

function assertAirwallexBalanceOrder(rows: AirwallexSheetRow[], anchorAccountBalance?: number): void {
  if (!rows.length) return;
  if (anchorAccountBalance !== undefined && Number.isFinite(anchorAccountBalance)) {
    const first = rows[0]!;
    const expected = anchorAccountBalance + airwallexBalanceDelta(first);
    const actual = Number(first.accountBalance);
    if (Math.abs(expected - actual) > 0.015) {
      throw new Error(
        "First new row does not continue from the sheet Account Balance. "
        + "The manual rows above may include different transactions than the Airwallex report (e.g. auth holds). "
        + "Delete the mismatched block and sync again.",
      );
    }
  }
  if (!validatesAirwallexBalanceChain(rows)) {
    throw new Error(
      "New Airwallex rows are not in balance order. "
      + "Delete any partial synced block and run sync again without leaving gaps.",
    );
  }
}

function airwallexKnownIds(currency: AirwallexCurrency, sheetTransactionIds?: string[]): Set<string> {
  if (sheetTransactionIds !== undefined) return new Set(sheetTransactionIds.filter(Boolean));
  return loadAirwallexTransactionIds(currency);
}

export async function fetchNewAirwallexTransactions(
  currency: AirwallexCurrency,
  sinceMs = 0,
  sheetTransactionIds?: string[],
  anchorAccountBalance?: number,
): Promise<AirwallexSheetRow[]> {
  if (!isAirwallexConfigured()) return [];
  const fromDate = sinceToFromDate(sinceMs);
  const toDate = isoDate();
  const { csv } = await fetchBalanceActivityReportCsv({
    currency,
    fromDate,
    toDate,
    timeoutMs: 180_000,
  });
  const known = airwallexKnownIds(currency, sheetTransactionIds);
  const parsed = parseBalanceActivityCsv(csv).filter((row) => row.walletCurrency.toUpperCase() === currency);
  const rows = filterNewAirwallexRows(currency, parsed, known, sinceMs, {
    skipSinceFilter: sheetTransactionIds !== undefined,
  });
  assertAirwallexBalanceOrder(rows, anchorAccountBalance);
  return rows;
}

export async function syncAirwallexTransactionsToSheet(
  currency: AirwallexCurrency,
  sinceMs = 0,
  sheetTransactionIds?: string[],
  anchorAccountBalance?: number,
): Promise<{ transactions: AirwallexSheetRow[]; sheet: Record<string, unknown> }> {
  const cfg = SYNC_CONFIG[currency];
  const transactions = await fetchNewAirwallexTransactions(currency, sinceMs, sheetTransactionIds, anchorAccountBalance);
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: cfg.skipReason, added: 0 } };
  }

  const sheet = await postSheetsWebhook({
    action: cfg.webhookAction,
    sinceMs,
    transactions,
  });
  rememberAirwallexTransactionIds(currency, transactions.map((t) => t.transactionId));
  return { transactions, sheet };
}
