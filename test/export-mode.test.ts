import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "bc-export-"));

const { runInExportMode, isExportMode } = await import("../src/export-mode.ts");
const { postSheetsWebhook } = await import("../src/sheets-webhook.ts");
const { loadMercuryTransactionIds, rememberMercuryTransactionIds } = await import("../src/mercury-sync-store.ts");
const { loadAirwallexTransactionIds, rememberAirwallexTransactionIds } = await import("../src/airwallex-sync-store.ts");
const { loadCledaraTransactionIds, rememberCledaraTransactionIds } = await import("../src/cledara-sync-store.ts");

test("export mode is off by default and scoped to the callback", async () => {
  assert.equal(isExportMode(), false);
  await runInExportMode(async () => {
    await Promise.resolve();
    assert.equal(isExportMode(), true);
  });
  assert.equal(isExportMode(), false);
});

test("export mode never calls the sheet webhook", async () => {
  let called = false;
  const fetch = async () => { called = true; return new Response("{}"); };
  const result = await runInExportMode(() => postSheetsWebhook({ action: "fill-x" }, { url: "https://example.invalid", fetch }));
  assert.equal(called, false);
  assert.equal(result.action, "export");
});

test("export mode neither reads nor writes the synced-id stores", async () => {
  rememberMercuryTransactionIds(["m1"]);
  rememberAirwallexTransactionIds("USD", ["a1"]);
  rememberCledaraTransactionIds(["c1"]);
  await runInExportMode(async () => {
    assert.equal(loadMercuryTransactionIds().size, 0);
    assert.equal(loadAirwallexTransactionIds("USD").size, 0);
    assert.equal(loadCledaraTransactionIds().size, 0);
    rememberMercuryTransactionIds(["m2"]);
    rememberAirwallexTransactionIds("USD", ["a2"]);
    rememberCledaraTransactionIds(["c2"]);
  });
  assert.deepEqual([...loadMercuryTransactionIds()], ["m1"]);
  assert.deepEqual([...loadAirwallexTransactionIds("USD")], ["a1"]);
  assert.deepEqual([...loadCledaraTransactionIds()], ["c1"]);
});
