import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatStripeInTransitNote,
  stripePayoutCredited,
  sumStripeInTransitPayouts,
  type StripeInTransitPayout,
} from "../src/stripe-in-transit.ts";

const payout = (id: string, amountUsd: number, arrival: string, status = "paid"): StripeInTransitPayout => ({
  id,
  amountUsd,
  status,
  created: arrival,
  arrival,
});

test("stripePayoutCredited matches bank credit near arrival", () => {
  assert.equal(stripePayoutCredited(payout("po_1", 1000, "2026-09-14"), [{ day: "2026-09-14", amountUsd: 1000 }]), true);
  assert.equal(stripePayoutCredited(payout("po_1", 1000, "2026-09-14"), [{ day: "2026-09-16", amountUsd: 1000 }]), true);
  assert.equal(stripePayoutCredited(payout("po_1", 1000, "2026-09-14"), []), false);
});

test("sumStripeInTransitPayouts only keeps in_transit/pending", () => {
  const payouts = [
    payout("po_a", 43679.89, "2026-09-14", "paid"),
    payout("po_b", 500, "2026-09-14", "in_transit"),
  ];
  const { amountUsd, items } = sumStripeInTransitPayouts(payouts, "2026-09-15", []);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "po_b");
  assert.equal(amountUsd, 500);
});

test("sumStripeInTransitPayouts excludes in_transit once the bank API has the credit", () => {
  const payouts = [payout("po_b", 500, "2026-09-14", "in_transit")];
  const { items } = sumStripeInTransitPayouts(payouts, "2026-09-15", [{ day: "2026-09-14", amountUsd: 500 }]);
  assert.equal(items.length, 0);
});

test("formatStripeInTransitNote lists payout ids", () => {
  const note = formatStripeInTransitNote([payout("po_x", 100, "2026-09-14")]);
  assert.match(note, /po_x/);
  assert.match(note, /in transit/i);
});
