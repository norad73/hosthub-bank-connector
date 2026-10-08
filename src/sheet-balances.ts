import { athensDate } from "./data.ts";
import { amountInUsd, type FxRates } from "./fx.ts";
import type { BalanceRow } from "./sync-sheets.ts";

/** Column keys match the Balances tab headers (USD equivalents). */
export interface SheetBalanceColumns {
  stripe?: number;
  mercury?: number;
  airwallexUsd?: number;
  airwallexEur?: number;
  wiseUsd?: number;
  wiseEur?: number;
  paypal?: number;
  eurobank?: number;
  viva?: number;
  eurobankIke?: number;
}

export interface SheetBalancePayload {
  date: string;
  columns: SheetBalanceColumns;
  /** ECB rate date used for conversion (YYYY-MM-DD). */
  fxDate?: string;
  /** EUR/USD close — USD per 1 EUR (CC tab column B). */
  eurUsdClose?: number;
}

function roundRate(n: number): number {
  return Math.round(n * 100000) / 100000;
}

function rowAmount(r: BalanceRow): number | undefined {
  return r.available ?? r.booked;
}

/** Mercury availableBalance can go negative on pending card holds; use ledger balance. */
function mercuryAmount(r: BalanceRow): number | undefined {
  return r.booked ?? r.available;
}

function toUsd(amount: number | undefined, currency: string, fx: FxRates | undefined): number | undefined {
  if (amount === undefined) return undefined;
  const converted = amountInUsd(amount, currency, fx);
  if (converted !== undefined) return converted;
  return currency.toUpperCase() === "USD" ? amount : undefined;
}

function sumUsd(
  rows: BalanceRow[],
  fx: FxRates | undefined,
  match: (r: BalanceRow) => boolean,
  amountOf: (r: BalanceRow) => number | undefined = rowAmount,
): number | undefined {
  let total = 0;
  let any = false;
  for (const r of rows) {
    if (r.error || !match(r)) continue;
    const usd = toUsd(amountOf(r), r.currency, fx);
    if (usd === undefined) continue;
    total += usd;
    any = true;
  }
  return any ? Math.round(total) : undefined;
}

function ebBank(r: BalanceRow): string {
  return (r.bank ?? r.account).toLowerCase();
}

export function buildSheetBalanceColumns(rows: BalanceRow[], fx: FxRates | undefined): SheetBalanceColumns {
  return {
    stripe: sumUsd(rows, fx, (r) => r.source === "stripe"),
    mercury: sumUsd(rows, fx, (r) => r.source === "mercury", mercuryAmount),
    airwallexUsd: sumUsd(rows, fx, (r) => r.source === "airwallex" && r.currency.toUpperCase() === "USD"),
    airwallexEur: sumUsd(rows, fx, (r) => r.source === "airwallex" && r.currency.toUpperCase() === "EUR"),
    wiseUsd: sumUsd(rows, fx, (r) => r.source === "wise" && r.currency.toUpperCase() === "USD"),
    wiseEur: sumUsd(rows, fx, (r) => r.source === "wise" && r.currency.toUpperCase() === "EUR"),
    paypal: sumUsd(rows, fx, (r) => r.source === "paypal"),
    eurobank: sumUsd(rows, fx, (r) => r.source === "enablebanking" && ebBank(r).includes("usa branch")),
    viva: sumUsd(rows, fx, (r) => r.source === "viva"),
    eurobankIke: sumUsd(rows, fx, (r) => r.source === "enablebanking" && ebBank(r).includes("ike")),
  };
}

export function buildSheetBalancePayload(rows: BalanceRow[], fx: FxRates | undefined, date = athensDate()): SheetBalancePayload {
  const eurUsd = fx?.toUsd.EUR;
  return {
    date,
    columns: buildSheetBalanceColumns(rows, fx),
    fxDate: fx?.date,
    eurUsdClose: eurUsd !== undefined ? roundRate(eurUsd) : undefined,
  };
}
