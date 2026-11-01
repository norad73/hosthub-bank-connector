/** One-off: test Airwallex login paths (no secrets printed). Run: node src/diagnose-airwallex-auth.ts */
import { config } from "./config.ts";
import { fetchBalanceActivityReportCsv, isAirwallexConfigured, listAirwallexBalances } from "./airwallex.ts";

console.log(
  JSON.stringify(
    {
      configured: isAirwallexConfigured(),
      apiBase: config.airwallexApiBase,
      clientIdLen: config.airwallexClientId.length,
      apiKeyLen: config.airwallexApiKey.length,
      accountIdLen: config.airwallexAccountId.length,
    },
    null,
    2,
  ),
);

try {
  const balances = await listAirwallexBalances();
  console.log("balances_ok", balances.length);
} catch (err) {
  console.log("balances_err", (err as Error).message);
  process.exit(1);
}

try {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const { report } = await fetchBalanceActivityReportCsv({ currency: "USD", fromDate: from, toDate: to, timeoutMs: 120_000 });
  console.log("bar_ok", report.id, report.status);
} catch (err) {
  console.log("bar_err", (err as Error).message);
  process.exit(1);
}
