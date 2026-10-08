import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSheetBalanceColumns, buildSheetBalancePayload } from "../src/sheet-balances.ts";
import type { BalanceRow } from "../src/sync-sheets.ts";

const fx = { date: "2026-09-08", toUsd: { EUR: 1.1, USD: 1 } };

const rows: BalanceRow[] = [
  { date: "2026-09-09", source: "stripe", account: "Stripe available", uid: "s1", currency: "USD", available: 100 },
  { date: "2026-09-09", source: "mercury", account: "Mercury Ops", uid: "m1", currency: "USD", available: 500 },
  { date: "2026-09-09", source: "viva", account: "Viva A", uid: "v1", currency: "EUR", available: 100 },
  { date: "2026-09-09", source: "enablebanking", bank: "Eurobank USA Branch", account: "Eurobank USA Branch", uid: "e1", currency: "EUR", available: 1494.3 },
  { date: "2026-09-09", source: "enablebanking", bank: "Eurobank IKE", account: "02", uid: "e2", currency: "EUR", available: 9844.24 },
];

test("buildSheetBalanceColumns maps sources to sheet columns in USD", () => {
  const cols = buildSheetBalanceColumns(rows, fx);
  assert.equal(cols.stripe, 100);
  assert.equal(cols.mercury, 500);
  assert.equal(cols.viva, 110);
  assert.equal(cols.eurobank, 1644);
  assert.equal(cols.eurobankIke, 10829);
});

test("Mercury column uses currentBalance not negative available", () => {
  const mercuryRows: BalanceRow[] = [
    { date: "2026-08-31", source: "mercury", account: "Checking", uid: "m1", currency: "USD", available: 467, booked: 467 },
    { date: "2026-08-31", source: "mercury", account: "Treasury", uid: "m2", currency: "USD", available: -3006, booked: 0 },
  ];
  const cols = buildSheetBalanceColumns(mercuryRows, fx);
  assert.equal(cols.mercury, 467);
});

test("buildSheetBalancePayload includes EUR/USD close for CC tab", () => {
  const payload = buildSheetBalancePayload(rows, fx, "2026-09-09");
  assert.equal(payload.fxDate, "2026-09-08");
  assert.equal(payload.eurUsdClose, 1.1);
});
