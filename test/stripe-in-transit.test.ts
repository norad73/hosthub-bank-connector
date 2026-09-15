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

test("sumStripeInTransitPayouts excludes credited payouts", () => {
  const payouts = [payout("po_a", 43679.89, "2026-09-14"), payout("po_b", 500, "2026-09-10")];
  const credits = [{ day: "2026-09-10", amountUsd: 500 }];
  const { amountUsd, items } = sumStripeInTransitPayouts(payouts, "2026-09-14", credits);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "po_a");
  assert.equal(amountUsd, 43680);
});

test("formatStripeInTransitNote lists payout ids", () => {
  const note = formatStripeInTransitNote([payout("po_x", 100, "2026-09-14")]);
  assert.match(note, /po_x/);
  assert.match(note, /in transit/i);
});
