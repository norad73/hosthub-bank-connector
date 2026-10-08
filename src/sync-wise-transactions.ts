import { listWiseStatementTransactions } from "./wise.ts";
import type { WiseEurSheetTransaction } from "./sheet-wise-eur.ts";
import type { WiseGbpSheetTransaction } from "./sheet-wise-gbp.ts";
import type { WiseUsdSheetTransaction } from "./sheet-wise-usd.ts";
import {
  formatWiseDateDash,
  formatWiseDateSlash,
  formatWiseDatetimeDash,
  formatWiseDatetimeSlash,
  wiseInstantMs,
} from "./wise-dates.ts";
import { filterNewByKnownIds, postTransactionsToSheet } from "./sync-to-sheet.ts";

function mapWiseUsd(raw: Awaited<ReturnType<typeof listWiseStatementTransactions>>[number]): WiseUsdSheetTransaction {
  return {
    id: raw.referenceNumber,
    transferWiseId: raw.referenceNumber,
    wiseDate: formatWiseDateDash(raw.date),
    wiseDatetime: formatWiseDatetimeDash(raw.date),
    wiseAmount: raw.amount,
    currency: raw.currency,
    description: raw.description,
    paymentReference: raw.paymentReference,
    runningBalance: raw.runningBalance,
    exchangeFrom: raw.exchangeFrom,
    exchangeTo: raw.exchangeTo,
    exchangeRate: raw.exchangeRate,
    payerName: raw.payerName,
    payeeName: raw.payeeName,
    payeeAccountNumber: raw.payeeAccountNumber,
    merchant: raw.merchant,
    totalFees: raw.totalFees,
    exchangeToAmount: raw.exchangeToAmount,
    transactionType: raw.type,
    transactionDetailsType: raw.detailsType,
  };
}

function mapWiseEur(raw: Awaited<ReturnType<typeof listWiseStatementTransactions>>[number]): WiseEurSheetTransaction {
  return {
    id: raw.referenceNumber,
    transferWiseId: raw.referenceNumber,
    originalDate: formatWiseDateSlash(raw.date),
    dateTime: formatWiseDatetimeSlash(raw.date),
    originalAmount: raw.amount,
    currency: raw.currency,
    description: raw.description,
    paymentReference: raw.paymentReference,
    runningBalance: raw.runningBalance,
    exchangeFrom: raw.exchangeFrom,
    exchangeTo: raw.exchangeTo,
    exchangeRate: raw.exchangeRate,
    payerName: raw.payerName,
    payeeName: raw.payeeName,
    payeeAccountNumber: raw.payeeAccountNumber,
    merchant: raw.merchant,
    totalFees: raw.totalFees,
    exchangeToAmount: raw.exchangeToAmount,
    transactionType: raw.type,
    transactionDetailsType: raw.detailsType,
    sheetExchangeRate: raw.exchangeRate,
  };
}

export async function syncWiseUsdTransactionsToSheet(sinceMs: number, knownIds: string[]) {
  const known = new Set(knownIds);
  const raw = (await listWiseStatementTransactions("USD", sinceMs)).map(mapWiseUsd);
  const transactions = filterNewByKnownIds(raw, known, sinceMs, (tx) => wiseInstantMs(tx.wiseDatetime || tx.wiseDate));
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: "No new Wise USD transactions", added: 0 } };
  }
  return postTransactionsToSheet("fill-wise-usd", transactions, sinceMs);
}

function mapWiseGbp(raw: Awaited<ReturnType<typeof listWiseStatementTransactions>>[number]): WiseGbpSheetTransaction {
  return mapWiseUsd(raw);
}

export async function syncWiseGbpTransactionsToSheet(sinceMs: number, knownIds: string[]) {
  const known = new Set(knownIds);
  const raw = (await listWiseStatementTransactions("GBP", sinceMs)).map(mapWiseGbp);
  const transactions = filterNewByKnownIds(raw, known, sinceMs, (tx) => wiseInstantMs(tx.wiseDatetime || tx.wiseDate));
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: "No new Wise GBP transactions", added: 0 } };
  }
  return postTransactionsToSheet("fill-wise-gbp", transactions, sinceMs);
}

export async function syncWiseEurTransactionsToSheet(sinceMs: number, knownIds: string[]) {
  const known = new Set(knownIds);
  const raw = (await listWiseStatementTransactions("EUR", sinceMs)).map(mapWiseEur);
  const transactions = filterNewByKnownIds(raw, known, sinceMs, (tx) => wiseInstantMs(tx.dateTime || tx.originalDate));
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: "No new Wise EUR transactions", added: 0 } };
  }
  return postTransactionsToSheet("fill-wise-eur", transactions, sinceMs);
}
