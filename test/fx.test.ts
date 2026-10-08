import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { after, test } from "node:test";

const cacheDir = mkdtempSync(join(tmpdir(), "fx-cache-"));
process.env.DATA_DIR = cacheDir;
const { mergeFxRates, readStoredFxRates, storeFxRates } = await import("../src/fx.ts");

test("mergeFxRates fills missing currencies from fallback", () => {
  const base = { date: "2026-10-06", toUsd: { USD: 1, EUR: 1.12 } };
  const fill = { date: "2026-10-05", toUsd: { USD: 1, EUR: 1.11, GBP: 1.27 } };
  mergeFxRates(base, fill, ["EUR", "GBP"]);
  assert.equal(base.toUsd.EUR, 1.12);
  assert.equal(base.toUsd.GBP, 1.27);
});

test("storeFxRates and readStoredFxRates round-trip", () => {
  storeFxRates({ date: "2026-10-05", toUsd: { USD: 1, EUR: 1.1204, GBP: 1.34 } });
  const loaded = readStoredFxRates();
  assert.ok(loaded);
  assert.equal(loaded!.date, "2026-10-05");
  assert.equal(loaded!.toUsd.EUR, 1.1204);
});

after(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});
