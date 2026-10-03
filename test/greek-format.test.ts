import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dayMonthYearToMs, formatGreekAmount } from "../src/data.ts";

describe("formatGreekAmount", () => {
  it("uses dot thousands and comma decimals", () => {
    assert.equal(formatGreekAmount(-1904.93), "-1.904,93");
    assert.equal(formatGreekAmount(100000), "100.000,00");
    assert.equal(formatGreekAmount(-0.5), "-0,50");
    assert.equal(formatGreekAmount(5482.48), "5.482,48");
    assert.equal(formatGreekAmount(-1234567.891), "-1.234.567,89");
    assert.equal(formatGreekAmount(0), "0,00");
  });
});

describe("dayMonthYearToMs", () => {
  it("reads day first, not US month first", () => {
    assert.equal(dayMonthYearToMs("13/9/2026"), Date.UTC(2026, 8, 13));
    assert.equal(dayMonthYearToMs("1/9/2026"), Date.UTC(2026, 8, 1));
    assert.equal(dayMonthYearToMs("31/08/2026"), Date.UTC(2026, 7, 31));
    assert.equal(dayMonthYearToMs("2026-09-01"), 0);
  });
});
