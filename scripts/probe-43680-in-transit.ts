/** Did the ~$43,680 Stripe payout land on Wise USD? */
import "./load-env.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { google } from "googleapis";
import { colByHeader } from "./sheet-columns.ts";
import { parseAmount, parseDate } from "./bank-tab-balance.ts";
import { config } from "../src/config.ts";
import { isStripeConfigured } from "../src/stripe.ts";

const ID = "1fpNA3NDMp11MtJXRE3hJ3VE4jCklWDDladULmlZerEc";
const TARGET = 43680;
const root = join(import.meta.dirname, "..");
const clientRaw = JSON.parse(readFileSync(join(root, "secrets/sheets-oauth-client.json"), "utf8"));
const auth = new google.auth.OAuth2(clientRaw.installed.client_id, clientRaw.installed.client_secret, "http://localhost:8765/");
auth.setCredentials(JSON.parse(readFileSync(join(root, "secrets/sheets-oauth-token.json"), "utf8")));
const sheets = google.sheets({ version: "v4", auth });

const wise = (
  await sheets.spreadsheets.values.get({
    spreadsheetId: ID,
    range: "'Wise USD'!A1:AZ",
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  })
).data.values ?? [];
const hdr = wise[0] ?? [];
const dateCol = colByHeader(hdr, "Wise Date", { aliases: ["Date"] });
const amtCol = colByHeader(hdr, "Wise Amount", { aliases: ["Amount"] });
const descCol = colByHeader(hdr, "Description", { aliases: ["Wise Description"], required: false });
const balCol = colByHeader(hdr, "BALANCE", { aliases: ["Balance"], required: false });
if (dateCol < 0 || amtCol < 0) throw new Error(`Wise USD missing date/amount headers: ${hdr.join(" | ")}`);

console.log("Wise USD headers", { date: hdr[dateCol], amt: hdr[amtCol], desc: hdr[descCol], bal: hdr[balCol] });
console.log(`Wise USD rows: ${wise.length - 1}`);
let lastIso = "";
for (let i = wise.length - 1; i >= 1; i--) {
  const d = parseDate(wise[i][dateCol]);
  if (!d) continue;
  lastIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  console.log(`last Wise USD date r${i + 1} ${lastIso} amt=${parseAmount(wise[i][amtCol])} ${String(wise[i][descCol] ?? "").slice(0, 70)}`);
  break;
}
console.log("");

const near: { row: number; iso: string; amt: number; desc: string; bal: string }[] = [];
for (let i = 1; i < wise.length; i++) {
  const d = parseDate(wise[i][dateCol]);
  if (!d) continue;
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (iso < "2026-09-10" || iso > "2026-09-16") continue;
  const amt = parseAmount(wise[i][amtCol]);
  near.push({
    row: i + 1,
    iso,
    amt: amt ?? NaN,
    desc: String(wise[i][descCol] ?? "").slice(0, 80),
    bal: String(wise[i][balCol] ?? ""),
  });
}
console.log("Wise USD last 20 raw:");
for (let i = Math.max(1, wise.length - 20); i < wise.length; i++) {
  console.log(`  r${i + 1} date=${JSON.stringify(wise[i][dateCol])} amt=${JSON.stringify(wise[i][amtCol])} ${String(wise[i][descCol] ?? "").slice(0, 70)}`);
}

console.log("\nWise USD 2026-09-10..16 (parsed):");
for (const r of near) console.log(`  r${r.row} ${r.iso}  amt=${r.amt}  bal=${r.bal}  ${r.desc}`);

const stripeHits = wise.slice(1).filter((row) => /stripe/i.test(String(row[descCol] ?? "")));
console.log(`\nWise USD desc contains Stripe: ${stripeHits.length}`);
for (const row of stripeHits.slice(-8)) {
  console.log(`  date=${JSON.stringify(row[dateCol])} amt=${JSON.stringify(row[amtCol])} ${String(row[descCol] ?? "").slice(0, 80)}`);
}

const hits = near.filter((r) => Number.isFinite(r.amt) && Math.abs(r.amt - TARGET) < 5);
console.log(`\nAmount near ${TARGET}: ${hits.length}`);

if (isStripeConfigured()) {
  const since = Math.floor(Date.parse("2026-09-01T00:00:00Z") / 1000);
  const res = await fetch(`${config.stripeApiBase}/v1/payouts?limit=20&created[gte]=${since}`, {
    headers: { Authorization: `Bearer ${config.stripeSecretKey}` },
  });
  const data = (await res.json()) as {
    data?: { id: string; amount: number; currency: string; status: string; arrival_date: number; created: number }[];
  };
  console.log("\nStripe payouts since 2026-09-01:");
  for (const p of data.data ?? []) {
    if (p.currency !== "usd") continue;
    const arrival = new Date(p.arrival_date * 1000).toISOString().slice(0, 10);
    const created = new Date(p.created * 1000).toISOString().slice(0, 10);
    console.log(`  ${p.id}  ${(p.amount / 100).toFixed(2)}  ${p.status}  created ${created}  arrival ${arrival}`);
  }
}
