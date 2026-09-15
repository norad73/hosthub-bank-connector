# Hosthub P&L Sheet — Knowledge Base

> **Advisor doc for AI + team.** Update after every P&L change or audit.  
> **Last analyzed:** 2026-09-15 · **KB version:** 1.60 · **Sheet tab:** `P&L - Running`  
> **Formula reference:** [`docs/PnL-FORMULAS.md`](PnL-FORMULAS.md) · raw JSON: `docs/pnl-formula-analysis.json`

---

## 1. Workbook identity

| Item | Value |
|------|-------|
| **Title** | Hosthub P&L, Metrics & Projections - Founders only |
| **Spreadsheet ID** | `1gY5IgIKq0D83ema3M55CuFa6D2mlJFnv8bMNLI8_odM` |
| **Primary tab** | `P&L - Running` (not `2 P&L - Running`) |
| **URL** | https://docs.google.com/spreadsheets/d/1gY5IgIKq0D83ema3M55CuFa6D2mlJFnv8bMNLI8_odM |
| **Editor account** | alex@hosthub.com (GCP project: studied-stock-508410-g3) |

### Related workbooks

| Workbook | ID | Use |
|----------|-----|-----|
| **Bank balances + transactions** | `1fpNA3NDMp11MtJXRE3hJ3VE4jCklWDDladULmlZerEc` | `Balances` tab → row 393 actuals; per-bank tabs → EOM reconciliation (§13); `* match` tabs → bank flow audit |
| **QuickBooks exports** | same P&L workbook | tabs `quickbooks-data-us`, `quickbooks-data-ike`, `QB` |
| **Consolidated QB (API)** | `1K3bPCxsKouyf_z4KpjpPcxnr21L9YkHv-ZzpLdU-W1M` | Bound Apps Script **QB consolidation script** writes `US P&L` / `GR P&L` / BS / txns. P&L workbook `CQB-autorefresh` IMPORTRANGEs `Con P&L`. **Months are not inserted by hand** — see below. |

**How `US P&L` gets a new month:** `QuickBooks` menu → **Refresh US P&L** (or nightly `refreshAll`). `Pull data from QB.gs` calls QBO `ProfitAndLoss` with `summarize_column_by=Month`, `start_date=2025-01-01`, **`end_date` = last day of the previous calendar month**. The script then rewrites the whole tab as values (0 formulas) and injects `YYYY Total` / `YTD YYYY`. So **Sep 2026 appears on the first October refresh**, not during September. Triggers: `refreshAll` (~06:27 EEST), plus `updateCcMonthlyTab` / `updateCcDailyTab`.

**QB chart of accounts** (Consolidated `Con P&L` line labels): full hierarchy in [`docs/qb-chart-of-accounts.md`](qb-chart-of-accounts.md). Top buckets: **4010 Services Income**, **7000 Other Income**, **6000 Payroll**, **6280 Financing Cost**, **6300 Operations**, **6350 IT**, **6500 Marketing**, **6800 G&A**, **6970 Tax**, plus interco (8000/8100) and below-the-line (6980 Depreciation, 7201 FX, etc.).

### Other P&L tabs (same workbook)

`Charts` (MRR vs rentals combo — see below), `P&L Summary`, `P&L - Running + 400K`, `P&L - Running + steady`, `Runway`, `Costs`, `Payroll`, `Revenue recognition`, projection/scenario tabs. **Do not edit these unless asked** — operational truth is `P&L - Running`.

### `Charts` tab (gid `250313970`)

Combo chart **Revenue vs Active rentals**. **2022-01** through **2026-08**. Data is a formula table on Charts (`TRANSPOSE` of P&L rows) so legend names stay **Standard MRR / Pro MRR / Non-recurring / Active rentals** — do not chart the wide P&L rows with a large `headerCount` (that uses late-2021 numbers as series names).

| Series | Source | Type | Axis |
|--------|--------|------|------|
| Standard MRR (`#08CB9E` logo) | P&L **107** | stacked column (bottom) | left ($) |
| Pro MRR (`#07A682` darker logo) | P&L **108** | stacked column | left ($) |
| Non-recurring (purple) | P&L **109+110** | stacked column (top) | left ($) |
| Active rentals (`#E67E22` orange, thick) | P&L **76** | line | right |

Use **month-end** rentals, never a SUM of daily snapshots (that ~10× inflates the bar series). Rebuild: `npx tsx scripts/create-mrr-rentals-chart.ts`.

---

## 2. Column layout

| Concept | Location |
|---------|----------|
| Row labels | Column **A** |
| Month columns | **D** = Jan 2017, advancing one column per month |
| **2026** | **DH** = Jan · **DI** = Feb · **DJ** = Mar · **DK** = Apr · **DL** = May · **DM** = Jun · **DN** = Jul · **DO** = Aug · **DP** = Sep |
| Values | USD, full dollars (not thousands) |
| FX | Row **7** `EUR/USD` |

---

## 3. Sheet architecture (row map)

396 labeled rows. Major sections on **`P&L - Running`**:

| Rows | Section | Notes |
|------|---------|-------|
| 8–147 | **REVENUE** | Paying users, churn, MRR, recognised revenue |
| 150–154 | Revenue by source (Stripe) | monthlies, annuals, single invoices |
| **155–156** | **Other sources / Loans** | Non-bank revenue sources; **loans tracked here** |
| **157–171** | **BANK INFLOWS** | Per-bank operating inflows → **171 = TOTAL** |
| 172–179 | Pro MRR projection | |
| 181–192 | Revenue by type (actual) | Mirrors txn categories incl. **188 Income - Loans** |
| 193–201 | Revenue by product (accrual) | |
| 206–232 | Accrual costs from QB | |
| 236–247 | Actual costs | Payroll, travel, marketing, etc. |
| **249–263** | **BANK OUTFLOWS** | Per-bank outflows → **263 = TOTAL** |
| 265–384 | Segment metrics, unit economics | |
| **388–394** | **Cash reconciliation** | See §4 — critical for balance checks |
| 397–403 | Accrual P&L / balance | Separate from cash reconciliation |
| 417–432 | QB COGS/S&M/G&A/R&D totals | |
| 433+ | Normalized salaries, projections | |

Machine-readable row list: `docs/pnl-analysis.json` (regenerate via §8).

---

## 4. Formula overview (what updates what)

**453 rows** with data: **342 formula-driven**, **53 manual input**, **3 mixed**.

### Two independent balance models

| Model | Rows | Revenue source | Cost source | Balance formula |
|-------|------|----------------|-------------|-----------------|
| **Cash (bank)** | 388–394 | R389 = R171 bank inflows | R390 = R263 bank outflows | R392 = **prior R392** + inflows − outflows |
| **Accrual (QB)** | 397–403 | R399 = R201 accrual revenue | R400 = R232 QB costs | R402 accrual balance; R403 = **prior R393 actual** + R401 accrual diff |

These do **not** cross-feed except R403 reads prior month's **R393 actual cash**.

### Input → output chains (summary)

```
db query metrics ──► R10–50 (users, trials, churn)
Manual/Stripe    ──► R107–110 (MRR) ──► R106, R111 ──► R147 recognised
Manual           ──► R151–156 (Stripe + Loans)
Bank txns        ──► R158–170 ──► R171 ──► R389 ──► R391–392
Bank txns        ──► R250–262 ──► R263 ──► R390 ──► R391–392
Balances sheet   ──► R393 (actual cash)
Manual/QB        ──► R182–191 ──► R192; R237–246 ──► R247
QB accrual       ──► R228–231 ──► R232 ──► R400 ──► R401–402
```

Full row-by-row map: **`docs/PnL-FORMULAS.md`**.

---

## 5. Cash reconciliation (rows 388–394)

Section label row **388**: `Actual Bank Tx`

| Row | Label | Type | Formula pattern (each month col X) |
|-----|-------|------|-------------------------------------|
| **389** | Inflows | Formula | `=X171` (`=SUM(X158:X170)` incl. **Viva** row 170) |
| **390** | Outflows | Formula | `=X263` (`=SUM(X250:X262)` incl. **Viva** row 262) |
| **391** | Diff | Formula | `=X389 − X390` |
| **392** | Expected Balance | Formula | `=prior_X392 + X389 − X390` (chains from **prior expected**, not prior actual) |
| **393** | Actual balance at EoM | **Hardcoded** | From **Balances** sheet col R TOTAL, last snapshot in month |
| **394** | actual − expected | Formula | `=X393 − X392` |

### Key implications

1. **Row 392 is a cash-flow model**, not a bank snapshot. Gaps vs 393 are expected when flows are wrong, anchor month differs, or accounts in Balances aren't in P&L bank rows.
2. **Row 156 Loans is NOT in row 389 inflows** — row 171 sums **158–170** (Viva included since 2026-09-14). Loan proceeds may still appear inside per-bank inflow rows via `Income - Loans`; row 156 is a duplicate view — see §10b.
3. **Row 393 is manually synced** from the Balances workbook (Bank Connector can write via Sheets API).

---

## 6. Bank inflow / outflow rows

### P&L row ↔ bank account

| P&L row | Account | Txn tab (`1fpNA3…`) |
|---------|---------|---------------------|
| 158 / 250 | SVB | (legacy; often zero) |
| 159 / 251 | Mercury | `Mercury match` |
| 160 / 252 | Airwallex USD | `Airwallex USD match` |
| 161 / 253 | Airwallex EUR | `Airwallex EUR match` |
| 162 / 254 | Eurobank | `Eurobank match` |
| 163 / 255 | EurobankIKE | `EurobankIKE match` |
| **164 / 256** | **Wise - EUR** | `Wise EUR match` |
| **165 / 257** | **Wise - USD** | `Wise USD match` |
| 166 / 258 | Paypal | `Paypal match` |
| 167 / 259 | Revolut EUR | (may be legacy) |
| 168 / 260 | Revolut USD | (may be legacy) |
| 169 / 261 | Cledara | `Cledara match` |
| 170 / 262 | Viva | `Viva match` |

**Not in P&L bank rows but in Balances TOTAL:** Stripe, In transit, and others → contributes to 393 vs 392 gap.

### Maintenance type

| Rows | 2026 behavior |
|------|---------------|
| 158–170, 250–262 | **Hardcoded** — manually updated from bank txn data |
| 171, 263 | **Formula** — `=sum(X158:X169)` / `=sum(X250:X262)` |
| 389–392, 394 | **Formula** |
| 393 | **Hardcoded** from Balances |

---

## 7. Loans — where they go (past practice)

**There is no separate “loan” row inside BANK INFLOWS (157–171).** Loans use a dedicated row above that section:

| Row | Label | Role |
|-----|-------|------|
| **156** | Loans | Funding/loan proceeds by month (revenue-by-source area) |
| **188** | Income - Loans | Same category in “Revenue by type (actual)” |

### Historical consistency (txn `Income - Loans` vs P&L)

| Month | Loan txns | Bank | P&L row 156 |
|-------|-----------|------|-------------|
| 2023-02 | $50,000 | Mercury | (tracked on 156 historically) |
| 2023-08 | $50,799 | Mercury | |
| 2024-01 | $70,000 | Mercury | $70,000 |
| 2024-04 | $107,005 | Wise EUR | |
| 2026-08 | $233,738 | Wise EUR | $233,738 (fixed 2026-09-12) |

**Rule:** Loan proceeds (`Income - Loans`) → **row 156**, never bank inflow rows 158–170. Bank inflow rows = **operating** inflows only.

**2026-03 / 2026-04:** Row 156 shows $50,000 each with **no matching loan txn** — likely planned/manual entries; verify with finance before changing.

---

## 8. Transaction → P&L mapping rules

Source: `* match` tabs in bank workbook. Columns: Date, Amount, Direction, Category, Bank.

### Include in bank inflow rows (158–170)

- `Income - Subscription`, `Income - Affiliate`, `Income - Interest`, etc.
- Any `Direction = in` **except** exclusions below

### Exclude from bank inflow rows

| Category | Goes instead to |
|----------|-----------------|
| `Internal Transfer - IN` | Nowhere in P&L flows (inter-account) |
| `Income - Loans` | **Row 156** (and row 188 for revenue view) |

### Include in bank outflow rows (250–262)

- All expense categories with `Direction = out`

### Exclude from bank outflow rows

| Category | Notes |
|----------|-------|
| `Internal Transfer - OUT` | Inter-account; not P&L spend |

### Audit tolerance

`|P&L − txn sum| > $500` → investigate. Script: `scripts/audit-pnl-flow-fixes.ts`.

---

## 9. Refreshing this knowledge base

```bash
# Re-analyze sheet structure (writes docs/pnl-analysis.json)
npx tsx scripts/analyze-pnl-sheet.ts

# Full formula + dependency analysis
npx tsx scripts/analyze-pnl-formulas.ts
npx tsx scripts/generate-pnl-formula-doc.ts

# Audit bank flows vs txns
npx tsx scripts/audit-pnl-flow-fixes.ts
```

After running, update **§10 Changelog** and bump **KB version** at top.

OAuth: `secrets/sheets-oauth-token.json` (gitignored). Re-auth: `npx tsx scripts/sheets-oauth.ts auth`.

---

## 10. Editing the live sheet

| Method | Works? |
|--------|--------|
| Sheets API (OAuth) | ✅ read + write |
| Gemini panel in browser | ✅ bulk writes |
| Cursor browser formula bar | ❌ does not save reliably |

Verify edits: **Last edit** timestamp + select-range sum, not formula bar.

> **Build the OAuth client with its id and secret**, not `new google.auth.OAuth2()`:
>
> ```ts
> const c = JSON.parse(readFileSync(join(root, "secrets/sheets-oauth-client.json"), "utf8"));
> const auth = new google.auth.OAuth2(c.installed.client_id, c.installed.client_secret, "http://localhost:8765/");
> auth.setCredentials(JSON.parse(readFileSync(join(root, "secrets/sheets-oauth-token.json"), "utf8")));
> ```
>
> Without the id/secret the stored token works only until it expires, then refresh fails with
> `invalid_request — Could not determine client ID from request`. This looks like a permissions
> problem but is not; the API path is fine.

> **Piping a script to `Select-Object -First N` in PowerShell can kill it mid-write** — the
> pipeline closes early and the process is terminated. Let write runs finish, then filter, or
> redirect to a file.

---

## 10b. Why row 393 differs from row 392

Row 392 chains from the **prior 392**, so an error is never corrected — it is inherited by
every later month. The *level* of the gap is therefore mostly history and says little. The
diagnostic quantity is the **change** in the gap:

```
introduced[m] = gap[m] − gap[m−1] = (393[m] − 393[m−1]) − (389[m] − 390[m])
```

i.e. how far the actual cash movement diverged from the modelled one, in that month alone.
`scripts/analyze-393-vs-392.ts` computes it.

**The headline number is misleading.** After the 2026-09-14 Totals→P&L paste (IN **and** OUT
match source, 0 cell drift), Aug 2026 gap is **−$117,379** (392 = $384,138, 393 = $266,759).
Sum of |introduced| is **$1,820,466** across 115 months — large errors both ways that mostly
cancel. Worst 20 months = 62% of error. Paste did not close the gap; it is not copy-paste drift.

**Post-paste (2026-09-14) — what still drives 392 vs 393**

| # | Finding | Aug 2026 scale |
|---|---------|----------------|
| 1 | **393 ≠ current Balances TOTAL** on 103/116 months. TOTAL is `=SUM(B:P)` and **excludes Stripe** (col S). 393 sits between TOTAL and TOTAL+Stripe (Aug: 393 $266,759 vs TOTAL $252,423 vs Stripe $17,342). 393 was not re-synced after Stripe left TOTAL. |
| 2 | ~~Row 171 / 263 omit Viva~~ **Fixed 2026-09-14** — now `SUM(158:170)` / `SUM(250:262)` on all 144 month cols (`fix-pnl-viva-totals.ts --write`). |
| 3 | **Cledara is in 171/263, not in TOTAL** — card spend pulls 392 down; funding was IT (excluded). Lifetime Cledara P&L net **−$523k**. |
| 4 | **Stripe payouts** are `Income - Subscription` in bank inflows. Held Stripe Δ is not in TOTAL. If 393 still embeds Stripe, payout months push 392 up while 393 falls with the held balance (2026-06 Stripe **−$41k**). |
| 5 | **Revolut USD** May $53,256 → Jun $0 with **zero** `all banks` rows — cash left the TOTAL, model unchanged. |
| 6 | Per-bank residuals are huge but opposite-signed (Wise USD/Mercury/SVB **−$6.7M** vs Eurobank/Wise EUR/IKE **+$5.4M**): operating IN + IT OUT at USD banks, IT IN + operating OUT at EUR banks. Company-level they mostly cancel; leftover is FX, timing, and holes 1–5. |

June 2026 introduced **−$98k** ≈ Revolut USD missing **−$53k** + Stripe held **−$41k** (if 393 includes Stripe).

Scripts: `analyze-393-vs-392.ts`, `attribute-393-392-gap.ts`, `inspect-393-gaps.ts`.

### Structural holes in the model (confirmed by reading the formulas)

| # | Hole | Effect |
|---|------|--------|
| 1 | ~~Stripe was in Balances TOTAL~~ **Removed 2026-09-12.** Stripe revenue still enters via bank payout inflows (`Income - Subscription` on `Totals for P&L` row 40) | was **25.3%** of error when Stripe balance was in 393 |
| 2 | ~~Viva outside row 171/263~~ **Fixed** — see §5. Balances col L (Viva) now in Cash based P&L totals. |
| 3 | **Loans** (row 156) sit above row 171 and never enter the waterfall | see caveat below |
| 4 | **TW GBP** (col I) and **In transit** (col P) have no P&L row | ~0% — these barely move |
| 5 | **Cledara** has P&L rows 169 / 261 but **no Balances column** | possible double count when funded from another bank — unverified |

> Earlier KB text said row 263 sums `250:262`. It does **not** — it stops at 261.

> **Do not naively subtract Loans.** Removing it makes the error *worse* (−3.5%), and the signs
> disagree: 2023-02 has loans of $50,000 against an introduced error of −$11,855. So loan cash is
> either already captured inside a bank inflow row or is not a bank inflow in that month.
> Establish what row 156 actually represents before adjusting for it.

Attribution run (`scripts/attribute-393-392-gap.ts`): Stripe alone 25.3%, all five factors
together only 20.9% (loans drag it down). **The remaining ~75% is per-bank flow accuracy** —
rows 158–169 / 250–261 not matching real bank movement — which is the same class of problem
already solved for the Balances tab in §13, and is localisable the same way: compare each
bank's modelled monthly flow against the month-over-month change in its Balances column.

### 10d. Where the P&L bank rows actually come from

P&L rows 158–170 / 250–262 are **copy-pasted** from tab **`Totals for P&L`** (gid `486540441`)
in the *banks* workbook — not typed by hand and not linked by formula.

| | |
|---|---|
| Months | row **1**, from col **C**, stored as real **dates** (not `YYYY-MM` text — read with `dateTimeRenderOption: FORMATTED_STRING`) |
| Inflows by bank | rows **4–16** |
| Outflows by bank | rows **19–31** |
| Totals | row 17 inflows (no IT), row 32 outflows (no IT, **omits Viva r31**), rows 33–39 summary (see below) |
| Bank order | identical to the P&L: SVB, Mercury, Airwallex USD, Airwallex EUR, Eurobank, EurobankIKE, Wise EUR, Wise USD, Paypal, Revolut EUR, Revolut USD, Cledara, Viva |

Every cell is the same `FILTER` over `all banks`:

```
=IFERROR(SUM(FILTER('all banks'!$F:$F,
   'all banks'!$B:$B = $A4,                      // bank name from col A
   'all banks'!$D:$D = "IN",                     // or "OUT"
   ARRAYFORMULA(DATE(YEAR('all banks'!$E:$E), MONTH('all banks'!$E:$E), 1))
       = DATE(YEAR(C$1), MONTH(C$1), 1),
   NOT(REGEXMATCH(LOWER('all banks'!$G:$G), LOWER("internal transfer")))
)), 0)
```

**Summary rows (2026-09-14):**

| Row | Label | Formula |
|-----|-------|---------|
| 33 | INFLOWS - OUTFLOWS (All) | all `all banks` IN − all OUT (no category filter) |
| 34 / 35 | Internal Transfer - IN / OUT | category match |
| 36 | INFLOWS - OUTFLOWS (No Int trans) | `=33 − 34 + 35` |
| 37 | Investments | `=51` (`Income - Investments`) |
| 38 | Loans and loan repayments | `=50 − 120` (+`Income - Loans`, −`Other - Loan Repayments`; no Stripe withheld) |
| 39 | Cashflow P&L Inflows | `=17 − 50 − 51` (no IT, loans, investments) |
| 40 | Cashflow P&L Outflows | `=−(32 + 31 − 120)` (negative; no IT, loan repayments; includes Viva) |
| 41 | Cashflow Profit / Loss | `=39 + 40` |

Per-bank rows 4–16 / 19–31 still exclude only `internal transfer` (loans and investments stay in those bank lines). `fix-totals-pnl-summary-rows.ts`.

> **Loans are NOT excluded from per-bank rows.** The only category filter there is `internal transfer`. So
> `Income - Loans` **is** inside the bank inflow rows — which contradicts
> `.cursor/rules/pnl-sheet-advisor.mdc` ("never in bank inflow rows") and explains why
> subtracting row 156 from the error made it *worse* (§10b). Row 156 is a **duplicate view**
> of money already counted, not an additional source.

> Banks with fewer formula-filled months (Airwallex 31, EurobankIKE 14 in / 9 out,
> Revolut USD 31 out) are simply **newer accounts**, not gaps.

#### The paste is stale: 128 cells, $996,633 apart

`scripts/compare-totals-tab-to-pnl.ts` compares the two sheets cell by cell. Three distinct
causes, which must not be fixed the same way:

| Cause | Example | Right action |
|-------|---------|--------------|
| **Deliberate manual correction** | 2026-08 Wise EUR IN: source $233,794, P&L $56 — the $233,738 loan was intentionally moved to row 156 | Keep the P&L value; the *source* is what needs fixing |
| **Off-by-one paste** | 2025-11: source has Wise USD $168,965 / Wise EUR $3,702; the P&L has $0 / $168,965 — the column landed one row high | Re-paste that month |
| **Never re-pasted** | 2024-04 Wise EUR IN: source $120,727, P&L $0 | Re-paste |

Worst offenders by total difference: Wise EUR IN $519,757 (5 cells), Wise USD IN $168,965
(1 cell), Wise EUR OUT $123,493 (15 cells), Eurobank IN/OUT ~$77k, Mercury ~$45k.

> **The source tab is not itself authoritative.** It is built entirely from `all banks`. As of
> 2026-09-12, `all banks` matches every `* match` tab on all bank/month/direction cells (0 diffs).
> Run `validate-all-banks-vs-match.ts` to re-check.

### 10e. Add Stripe upstream, or drop it from row 393?

**Stripe is far too large to exclude.** Across 104 month-ends with a balance:

| | |
|---|---|
| Mean Stripe balance | **$18,157** (max $65,158) |
| Mean share of total cash | **14.0%** |
| Recent months | 2026-04 **33.6%**, 2026-07 **31.5%**, 2025-12 **29.4%**, 2026-05 29.7% |
| Mean absolute month-on-month swing | $7,851 (largest $41,051) |

Removing Stripe from row 393 would understate the cash position by up to a third in recent
months, and the **`Runway` tab reads these rows** — so it would corrupt runway too. Stripe
money is real company cash that happens to be in transit. **Model it; do not hide it.**

#### The double-count trap

Adding a Stripe bank naively **double-counts revenue**. Payouts are already booked at the
destination bank as `Income - Subscription` (495 rows, $8,944,115 — §10d). Adding Stripe
charges as income on top counts the same money twice.

The correct treatment is to make the payout an internal transfer between two of our own
accounts, so only the Stripe-side charge is income:

| Leg | Where | Category |
|-----|-------|----------|
| Customer charge | Stripe **IN** | `Income - Subscription` — revenue now recognised at **charge date** |
| Payout leaves Stripe | Stripe **OUT** | `Internal Transfer - OUT` |
| Payout lands in bank | Wise USD / Mercury / SVB **IN** | **re-tag** from `Income - Subscription` → `Internal Transfer - IN` |

Both transfer legs are then excluded by the `Totals for P&L` filter, revenue is counted once,
and the Stripe balance is tracked. Stripe **fees** should become an outflow
(`Banking - Fees`) rather than being netted away, or they vanish as an expense.

**Volume is not a problem.** Stripe need not be transaction-level: `data/stripe-payouts.json`
already holds 497 payouts, and monthly charge/fee aggregates from `balance.summary` add ~100
rows each. Compare with existing `all banks` volumes — SVB 3,885, Wise EUR 3,760, Eurobank
3,586, Revolut USD 19.

### 10c. Is it safe to insert rows into `P&L - Running`?

Checked before adding Stripe rows (`scripts/probe-pnl-insert-safety.ts`,
`scripts/probe-pnl-indirect-rows.ts`). **Yes, within the workbook.**

| Risk | Finding |
|------|---------|
| Named ranges | **0** in the workbook |
| `INDIRECT`/`OFFSET`/`ADDRESS` formulas | 10,344 cells but only **7 distinct shapes**, and **none references a literal row ≥ 150** |
| Cross-tab references to `P&L - Running` | ~1,850 across CQB, QB, Runway, Costs, pnl, Payroll, `year comparison net` — all ordinary A1, which Sheets rewrites automatically |

The dynamic references resolve to `INDIRECT(ADDRESS(5, COLUMN()))` (the month header on row 5)
or `INDIRECT("A" & ROW())` (self-relative). Neither is disturbed by an insert below row 150.
The `Costs` tab looks up by label via `MATCH("…", 'P&L - Running'!$A:$A)`, which is also
insert-proof.

**The real cost is outside the workbook:** ~10 scripts plus this KB and
`.cursor/rules/pnl-sheet-advisor.mdc` hardcode P&L row numbers (158–171, 250–263, 388–394)
and must be updated in the same change.

> **Viva rows carry real money that the model throws away.** Row 170 has 5 months totalling
> **$15,908** of inflow and row 262 has 9 months totalling **$236,853** of outflow — all
> outside rows 171 and 263. Widening the subtotals fixes this at the same time as Stripe.
> (Curiously, removing Viva does *not* reduce the measured error, so some of it is likely
> double-counted elsewhere — verify rather than assume.)

> Row **260** (Revolut USD outflow) is empty in all 115 months, and row 168 has a single
> $246 month — the only genuinely spare rows in the blocks.

---

## 11. Changelog (P&L)

| Date | Change |
|------|--------|
| 2026-09-14 | **Consolidated QB `US P&L` months** — new columns come from bound script `Pull data from QB.gs` (menu **Refresh US P&L** / nightly `refreshAll`). Date range is Jan 2025 → **end of last month**; current month is never written. Probe: `probe-us-pnl-months.ts`. |
| 2026-09-14 | **`Charts` tab** — Pro MRR restored to darker logo teal `#07A682` (rebuild for the orange line had crushed it to `#047960`). |
| 2026-09-14 | **Viva in Cash based P&L totals** — row **171** `SUM(158:170)` and row **263** `SUM(250:262)` on all **144** month columns (`fix-pnl-viva-totals.ts --write`). Rows 389–391 now include Viva inflows/outflows. |
| 2026-09-12 | **Stripe removed from Balances grid** — no col D; TOTAL moved to **Q** (`=SUM(B:P)`). `Totals for P&L` audited: **0 diffs** vs `all banks` over 116 months; subtotals intact; no Stripe row (never had one). |
| 2026-09-12 | Added `scripts/sheet-columns.ts` — all core scripts now resolve columns by **header text** (`balancesColMap`, `txnColMap`, `monthCols`). Removed hardcoded Balances indices that broke when Stripe was dropped. |
| 2026-09-12 | KB §10e — Stripe materiality: mean **14.0%** of total cash, up to **33.6%** recently (max balance $65,158). Too large to exclude from row 393, and the `Runway` tab depends on these rows. Decision: model Stripe upstream. Naive addition double-counts revenue, so the payout legs must be re-tagged to `Internal Transfer`. |
| 2026-09-12 | KB §10d — located the real source of the P&L bank rows: tab **`Totals for P&L`** (gid `486540441`) in the banks workbook, copy-pasted. Its `FILTER` excludes only `internal transfer`, so **`Income - Loans` IS inside the bank inflow rows** — contradicting the advisor rule and explaining the §10b Loans anomaly. The paste is stale: **128 cells / $996,633** apart, from three different causes. The source itself is built from `all banks` and inherits its drift. |
| 2026-09-12 | KB §10c — insert-safety scan of the P&L workbook: 0 named ranges, 0 dynamic references to rows ≥ 150, all ~1,850 cross-tab refs are ordinary A1. Inserting rows is safe in-workbook; the cost is ~10 scripts + KB + rules that hardcode row numbers. Also found Viva rows 170/262 hold $15,908 in / $236,853 out that no subtotal includes. |
| 2026-09-12 | Confirmed Stripe payouts **are** already bank inflows (495 rows, $8,944,115, `Income - Subscription`, into Wise USD / Mercury / SVB). So the model books revenue on payout date while row 393 counts it from charge date — the Stripe held balance is exactly that timing gap. |
| 2026-09-12 | KB §10b — diagnosed the 393-vs-392 gap. The gap *level* ($59,190) is misleading; the sum of monthly absolute errors is **$2,050,967** and largely self-cancelling. Confirmed structural holes: Stripe has no P&L bank row (25.3% of all error), Viva sits outside both subtotals (row 263 is `=sum(X250:X261)`, **not** `250:262` as previously documented), Loans excluded from the waterfall. Scripts: `analyze-393-vs-392.ts`, `attribute-393-392-gap.ts`, `probe-pnl-cash-coverage.ts`. |
| 2026-09-12 | **Row 393 fully refreshed from the reconciled Balances TOTALs — 109 cells (2017-01 → 2026-09), now matching within $1.** 38 were off by more than $10k, the largest −$67,779 (2018-08). Row 393 had not been resynced since the ten-bank reconciliation. |
| 2026-09-12 | `fill-pnl-393-from-balances.ts` hardened: dry-run by default (`--write` to apply), `--tol=` (was a fixed $500), row-392 fallback now opt-in via `--allow-392` since row 393 is the *actual* balance, and output shows old → new with deltas. Also fixed its OAuth client construction (see §10). |
| 2026-09-12 | Row 393: filled O393 (2017-12) and DP393 (2026-09) from Balances month-end. Script: `scripts/fill-pnl-393-from-balances.ts`. |
| 2026-09-12 | KB v1.1 — full formula analysis: 342 formula rows, 53 manual inputs. Added `docs/PnL-FORMULAS.md`. |
| 2026-09-12 | KB v1.0 created. Full sheet analyzed (396 rows). |
| 2026-09-12 | Fixed 8 flow cells: Aug Wise EUR loan misclassified in row 164 → row 156; Jan Wise EUR + Viva outflows. Re-audit: 0 mismatches Dec25–Aug26. |
| 2026-09-12 | Row 393 DH:DO updated from Balances month-end snapshots (Jan–Aug 2026). |

---

## 12. Open questions

- [ ] Should row 392 chain from **prior actual** (393) instead of prior expected?
- [ ] Mar/Apr 2026 row 156 $50k loans — manual forecast or missing txns?
- [ ] Add Stripe / In transit to P&L bank rows or document as known 393−392 gap?
- [ ] Dec 2025 anchor: expected DG392 vs actual DG393 (−$70k) — root cause?
- [x] ~~Fix Balances EOM formula row refs~~ — fixed 357 EOM rows (2026-09-12); ~2,750 daily rows may still have stale refs — run without `--eom-only` if needed.

---

## 13. Balances workbook (bank reconciliation)

**Spreadsheet:** `1fpNA3NDMp11MtJXRE3hJ3VE4jCklWDDladULmlZerEc` · tab **`Balances`**

**Daily fill:** Render cron POSTs `/cron/refresh-balances` then `/cron/sync-balances` (webhook write). **Sheet menu** must **not** call `/cron/sync-balances` — that deadlocks (menu holds the spreadsheet lock while Render POSTs back to `doPost` → echo **404**). Menu uses `/cron/prepare-balance-fill` and writes locally via `fillSheetsImpl_`.

| Item | Value |
|------|--------|
| **Workspace** | Hosthub Explorer (`tea-d8fgrv4p3tds73elao80`) · logged-in user `alex@hosthub.com` |
| **Web** | `bankconnector` · `srv-dagi9915efls73anctm0` · https://bankconnector.onrender.com |
| **Cron** | `bankconnector-sync-balances` · `crn-dafvgf8u01pc73c75070` |
| **Schedule** | **UTC.** Target **19:00 Europe/Athens** → **`0 16 * * *`** while EEST (UTC+3). Live dashboard had drifted to `0 6 * * *` (09:00 Athens); reset 2026-09-15. After late-October DST, `16:00` UTC becomes **18:00** Athens unless moved to `0 17 * * *`. `render.yaml` already has `0 16 * * *` — do not sync the dashboard back to 06:00. |
| **Webhook** | `GOOGLE_SHEETS_WEBHOOK_URL` = `https://script.google.com/macros/s/AKfycbzN80dtSLdENv2DdEGOkR-cJDKqPCBjVJzjkKKUlgacBfTryWNpDml0ShxpgTNHzVtsGg/exec` (same in `render.yaml` / `src/sheets-config.ts`). Clasp **@29** — `v0.6.90 in-transit from bank APIs`. Other deployments (@24 v0.5.7, @25 v0.6.44, @HEAD) are stale; do not point Render at them. GET returns `doGet` help JSON — that is **not** a fill. |

**Render CLI (this machine):** winget package `Render.CLI` **v2.28.0** (`render.exe`). Auth: `render whoami` → `alex@hosthub.com`. New terminals need a PATH refresh after install.

```text
render services --output text
render services update crn-dafvgf8u01pc73c75070 --cron-schedule "0 16 * * *" --confirm
render logs --resources crn-dafvgf8u01pc73c75070 --limit 80 --output text
render logs --resources srv-dagi9915efls73anctm0 --text sync-balances --limit 40 --output text
```

`render deploys list` on the cron is **code deploys**, not daily fill runs. Fill history is in **cron logs**.

**Recent fill runs (Athens):** 13 Sep **appended row 885**. 12 + 15 Sep **failed** — refresh OK (67 accounts), then `Google Sheets webhook 404` (Google HTML `ppConfig` page). 14 Sep marked success but response was **`doGet` help text** (no fill).

**Why / fix (v0.6.89):** Apps Script `ContentService` always 302s to a one-time `script.googleusercontent.com/macros/echo` URL. Node `fetch` `redirect: "follow"` sometimes GETs `/exec` (`doGet` false success) or hits a dead echo URL (404). **`src/sheets-webhook.ts`** now POSTs with `redirect: "manual"`, **GETs** the echo `Location`, retries 404/doGet (balance fill is idempotent — already-filled day → `skip`), and throws if the body is the `doGet` help payload. Used by balance fill + txn webhooks.

### 13.1 Layout

| Col | Header | Notes |
|-----|--------|-------|
| **A** | Date | Mix of **daily snapshots** + **month-end (EOM)** rows |
| **B** | SVB | USD, direct value |
| **C** | Mercury | USD |
| **D** | Airwallex USD | USD |
| **E** | Airwallex EUR | EUR native → `=EUR*VLOOKUP(A{row},CC!A:B,2,FALSE)` |
| **F** | Wise (USD) | USD |
| **G** | Wise (EUR) | EUR → VLOOKUP formula |
| **H** | TW (GBP) | Legacy? |
| **I** | Paypal | USD |
| **J** | Eurobank | EUR → VLOOKUP |
| **K** | Viva | EUR → VLOOKUP |
| **L–M** | Revolut EUR/USD | EUR uses VLOOKUP |
| **N** | Eurobank IKE | EUR → VLOOKUP |
| **O** | In transit | In TOTAL; not in P&L bank rows |
| **P** | *(empty)* | |
| **Q** | **TOTAL** | `=SUM(B{row}:P{row})` — **Stripe is not included** (removed 2026-09-12) |

> **Stripe was removed from the Balances grid** (previously col D). Stripe held balance is no
> longer part of row 393 actual cash. Revenue still enters the cash model via bank inflows when
> Stripe pays out (`Income - Subscription` / `STRIPE TRANSFER` on `Totals for P&L` row 40).

**FX tab:** `CC` — col A = date, col B = EUR/USD rate for VLOOKUP.

**EOM rows:** Last calendar day of month; colored light gray (`#EDEDED`) via `scripts/color-balances-eom-rows.ts`.

**P&L link:** Row **393** actual cash = col **Q TOTAL** from last Balances snapshot in that month (typically the EOM row).

### 13.2 Source of truth (reconciliation rule)

When Balances disagrees with bank data, **bank tab wins** — not `all banks` txn sums.

| Bank | Balances col | Bank tab | Balance source on tab |
|------|--------------|----------|------------------------|
| **SVB** | B | `SVB` | **`BALANCE`** col — use exact header `DATE` (not Posting Date); **last row on month-end date** |
| **Mercury** | C | `Mercury` | **Balances EOM:** last **daily** snapshot in month (API **`currentBalance`** sum). Txn tab has no BALANCE col — running sum of **`Amount`** drifts vs API (~$11k+) and must **not** overwrite EOM |
| **Airwallex USD** | E | `Airwallex USD` | **`Account Balance`** — **not** Available Balance (they differ often) |
| **Airwallex EUR** | F | `Airwallex EUR` | **`Account Balance`** |
| **Wise USD** | G | `Wise USD` | **`BALANCE`** col (col 27; `DATE` col 24) |
| **Wise EUR** | H | `Wise EUR` | **`BALANCE`** col (pending full reconcile) |
| **Paypal** | J | `Paypal` | **`Balance`**, restricted to `Currency = "USD"` rows and rolled forward from `Net` where missing (§13.15) |
| **Eurobank** | K | `Eurobank` | **`BALANCE`** — systematic drift from txn fill |
| **Viva** | L | `Viva` | **`BALANCE`** |
| **Eurobank IKE** | O | `EurobankIKE` | **`BALANCE`** |
| **Stripe** | D | *(no tab)* | **Stripe Reporting API** — see §13.6 |

**Verify logic** (`scripts/bank-tab-balance.ts`): prefer exact `DATE` header; month-end = latest date in month, **last sheet row on that date** (same-day txns matter).

### 13.3 Reconciliation status (2026-09-12)

| Bank | Status | Notes |
|------|--------|-------|
| SVB | ✅ Reconciled | 70 EOM months; account inactive ~Nov 2022 |
| Mercury | ✅ Reconciled | Aug 2022+; **48 EOM cells** fixed 2026-09-14 (txn running-sum drift + availableBalance bug on Jul/Aug 2026 EOM) |
| Airwallex USD | ✅ Reconciled | Jan 2024+; Account Balance; −$10k / −$25k patterns fixed |
| Airwallex EUR | ✅ Reconciled | Small account; 13 cells |
| Wise USD | ✅ Reconciled | 54 cells; many had systematic **−$25,000** error from `all banks` fill |
| Wise EUR | ✅ Reconciled | 88 cells (63 + 25 strict). Sheet had drifted both ways: too high pre-2024, too low after, incl. impossible negatives for 2026-02/2026-05 |
| Eurobank | ✅ Reconciled | 93 cells (70 + 23 strict). Required the §13.10 parse fix **and** re-sorting the tab chronologically (§13.11). Pre-2020 the EUR column held **USD** amounts |
| Viva | ✅ Reconciled | 10 cells (4 + 6 strict). Recent account, only 10 months of data; tab already strictly chronological (0 ledger breaks) |
| Eurobank IKE | ✅ Reconciled | 6 cells (5 + 1 strict). 8 months of data. Leave row order alone: re-sorting makes it *worse* (1 → 3 breaks) and changes no month-end |
| Paypal | ✅ Reconciled | 93 cells (65 + 28 strict). Tab holds four currency ledgers and stops recording a balance after 2022-11 — see §13.15 |

**Wise USD progressive balance (breaks 2023-08-04):** `calculated progressive balance` is `AD2` seed `$11,629.30` then `=AD_prev+Z` (signed `AMOUNT`). `balance diff` is `=AD−AB`. `BALANCE` (`AB`) is `=value(I)` — Wise **Running Balance**, the wallet truth.

The chain was exact until **2023-08-04**. Two Mercury → Wise ACH credits were in the wallet but missing as IN rows (only fee lines existed):

| Mercury OUT | Wise wallet effect | Wise USD IN row |
|-------------|--------------------|-----------------|
| 2023-08-01 $25k → ••8184 | 2023-08-02 +$25k | r579 `MercuryACH` (already there) |
| 2023-08-03 $25k → ••8184 | 2023-08-04 +$25k | **added** r582 `eb41ee1c7914` / `BALANCE-1225663781` |
| 2023-08-07 $25k → ••8184 | 2023-08-08 +$25k | **added** r587 `551420409813` / `BALANCE-1236145612` |

**Fixed 2026-09-14:** inserted the two missing INs (`backfill-wise-usd-aug2023-25k.ts --write`) before each fee row, plus `Wise USD match` (`Internal Transfer - IN`) and `all banks`. TransferWise IDs = the fee’s `BALANCE-…` refs (API token not available locally). Then rewrote `AD3:AD1805` to `=AD_prev+Z` (`fix-wise-usd-progressive-formulas.ts`) — mid-sheet insert left later AD formulas pointing past the new Z. Aug 2023 `balance diff` is ~0. Residual first break is r874 (−$1.13, pre-existing Z=0 vs Wise Amount −$1.13).

**Wise EUR balance columns:** the tab carries three interchangeable running balances —
`Running Balance` (col 8), `BALANCE EUR` (col 29) and `calculated progressive balance` (col 30) —
plus a `balance diff` column (col 31) that is `0.00` on all 3,793 rows, i.e. the tab's own
self-check that they agree. `pickBalCol` selects col 8; that is safe. Note there is **no plain
`BALANCE` header** here, unlike Wise USD (col 27).

**Do not use** `scripts/fill-balances-eom-from-all-banks.ts` for reconciliation — it builds running totals from **`all banks`** and drifts vs bank tabs. Use **`scripts/fix-balances-from-bank-tab.ts`** per bank instead.

### 13.4 Scripts

> **Column lookup:** use `scripts/sheet-columns.ts` — resolve Balances / P&L / `all banks` /
> `* match` columns by **header text**, never hardcoded index or letter. Key exports:
> `balancesColMap()`, `txnColMap()`, `colByHeader()`, `monthCols()`. Re-exported from
> `bank-tab-balance.ts`.

| Script | Purpose |
|--------|---------|
| `sheet-columns.ts` | Shared header-based column maps for Balances, txn tabs, P&L months |
| `validate-all-banks-vs-match.ts` | Compare `all banks` monthly IN/OUT per bank vs each `* match` tab |
| `probe-all-banks-match-diff.ts --bank X --month YYYY-MM` | Row-level diff + duplicate detection for one bank/month |
| `fix-all-banks-duplicates.ts [--write]` | Remove the three known duplicate rows (Cledara + Wise USD) |
| `audit-wise-usd-duplicate-uids.ts` | List duplicate UniqueIDs on Wise USD vs `all banks` VLOOKUP hits |
| `probe-wise-usd-progressive-break.ts` | First `balance diff` ≠ 0 on Wise USD; BALANCE-fee rows whose wallet step ≠ AMOUNT |
| `backfill-wise-usd-aug2023-25k.ts [--write]` | Insert the two missing Aug 2023 Mercury→Wise $25k INs + match + all banks |
| `fix-wise-usd-progressive-formulas.ts [--write]` | Rewrite Wise USD AD column to `=AD_prev+Z` after mid-sheet inserts |
| `fix-wise-usd-duplicate-uids.ts [--write]` | Re-hash duplicate Wise USD UIDs, add missing `all banks` rows, delete identical copies |
| `internal-transfer-pairing.ts` | Shared OUT↔IN pairing rules (−3 to +10 days, USD amount tolerance) |
| `pair-amount-usd.ts` | Normalize txn amounts to USD for pairing (match-tab currency rules + desc parse) |
| `audit-match-amount-currency.ts` | Compare match vs raw Amount columns per bank (currency audit) |
| `list-unpaired-internal-out-chrono.ts` | Chronological orphan Internal Transfer OUT list for manual review |
| `list-internal-transfer-orphans.ts` | Lifetime IN/OUT totals + unpaired OUT and unpaired IN lists |
| `retag-svb-paypal-446.ts` | Retag SVB 2018-02-05 PayPal $446.52 ACH from Internal Transfer → Income - Subscription |
| `retag-eurobank-syncbnb-25k.ts` | Retag Eurobank 2018-05-31 opening €25k to Income - Investments |
| `retag-small-orphan-ins-cashback.ts [--write]` | Orphan IT INs < $500 with no counterpart bank OUT → Income - Cashbacks; delete same-uid Cledara dups |
| `check-cledara-cashbacks-api.ts` | Compare cashback-tagged Cledara match rows to live API type/description |
| `classify-cledara-ins.ts [--write]` | Cledara INs: API/desc Rewards → Income - Cashbacks; all other INs → Internal Transfer - IN; drop false repayment copies of existing rewards |
| `analyze-orphan-buckets.ts` | Group orphan OUT rows by resolution type (FX, Cledara, Viva W2W, etc.) |
| `fix-orphan-categories.ts [--write]` | Re-tag miscategorized match-tab rows driving false orphans |
| `probe-cledara-funding-pairs.ts` | Audit bank→Cledara OUT vs Cledara IN amount match rate |
| `probe-cledara-funding-orphans.ts` | List bank→Cledara fundings still missing ±10% Cledara IN |
| `backfill-cledara-repayments.ts [--write]` | Backfill missing Cledara repayments from API into `Cledara`, `Cledara match`, `all banks` in chronological order |
| `fix-cledara-repayment-formulas.ts [--write]` | Copy VLOOKUP formulas to new Cledara match / all banks rows after manual insert |
| `audit-cledara-api-vs-sheet.ts` | Compare Cledara API repayments vs sheet repayment rows (±3d, ±$0.02) |
| `audit-internal-transfers.ts` | Compare Internal Transfer IN/OUT on Totals tab vs `all banks` |
| `attribute-internal-transfer-gap.ts` | Trace orphan legs driving rows 35/36 lifetime gap |
| `audit-totals-for-pnl.ts` | Verify `Totals for P&L` vs recomputed `all banks` (same FILTER rules) |
| `compare-totals-tab-to-pnl.ts` | Compare `Totals for P&L` vs copy-pasted P&L bank rows |
| `inspect-393-gaps.ts` | After paste: 171/263 formulas, 393 vs TOTAL, per-bank Balances Δ vs P&L net |
| `fix-totals-pnl-summary-rows.ts [--write]` | Totals for P&L rows 33/36–39: all net, no-IT net, investments, loans−repayments, cashflow P/L |
| `compare-totals-to-match-tabs.ts` | Compare `Totals for P&L` vs `* match` tabs |
| `fix-balances-from-bank-tab.ts --bank X [--strict] [--no-carry] [--write]` | Fix EOM cells from bank tab balance; carries the balance across transaction-free months (§13.14) |
| `probe-paypal-currencies.ts` | Paypal currency mix and per-currency ledger chain test |
| `probe-paypal-coverage.ts` | Paypal month-by-month row counts, to tell a quiet month from an import gap |
| `check-paypal-reconstruct.ts` | Checks rebuilding Paypal balances from `Net` against the recorded ones |
| `reconcile-mercury.ts [--write]` | Fix/audit Balances EOM Mercury vs last daily snapshot in month |
| `audit-mercury-eom-vs-daily.ts` | List EOM Mercury cells that differ from last daily in month |
| `fix-mercury-eom-from-daily.ts [--write]` | One-shot bulk fix (same logic as `reconcile-mercury.ts`) |
| `reconcile-bank.ts --bank X` | Compare Balances vs bank tab vs txn sum |
| `verify-eom-vs-bank-sheets.ts` | Full audit all banks |
| `audit-balances-formula-rows.ts` | Find TOTAL/VLOOKUP pointing at wrong row |
| `fix-balances-formula-rows.ts [--eom-only] --write` | Repoint TOTAL/VLOOKUP formulas at their own row |
| `audit-balances-eom-gaps.ts` | Count empty EOM cells per bank column |
| `fill-balances-eom-gaps.ts [--only <col>] [--write]` | Fill **empty** EOM cells only (never overwrites) |
| `stripe-eom.ts --from YYYY-MM --to YYYY-MM` | Print month-end Stripe USD balances |
| `probe-stripe-api.ts` | Check which Stripe endpoints the current key allows |
| `probe-stripe-loan.ts` | Stripe `financing_paydown` (flex loan withheld at source) vs bank loan-repayment rows |
| `validate-stripe-eom-existing.ts [n]` | Compare API month-ends against existing sheet EOM values |
| `verify-stripe-eom-vs-snapshots.ts` | Compare API month-ends against last daily snapshot |
| `probe-stripe-eom-convention.ts YYYY-MM` | Test timezone / interval variants for one month |
| `fill-balances-eom-from-all-banks.ts` | **Legacy insert** — caused drift; avoid for fixes |
| `sort-balances-by-date.ts --write` | Re-sort after bulk insert |
| `color-balances-eom-rows.ts --write` | Gray EOM rows |
| `fill-pnl-393-from-balances.ts [--tol=N] [--allow-392] [--write]` | Push Balances TOTAL → P&L row 393; dry-run unless `--write` |
| `fix-pnl-viva-totals.ts [--write]` | Fix rows 171/263 to include Viva (170/262) on every month column |
| `probe-us-pnl-months.ts` | Inspect Consolidated QB `US P&L` headers/formulas/refresh stamp |
| `probe-external-sheet.ts [id] [gid] [--list]` | List/sample any workbook we have OAuth access to |
| `probe-pnl-qb-links.ts` | How `P&L - Running` / `CQB` link to the Consolidated QB workbook |

### 13.5 Known bug: stale formula row references

**Symptom:** EOM row **values** look plausible per bank, but **TOTAL** is far too low (e.g. **2025-01-30 → $423,560** vs **2025-01-31 → $40,784**).

**Cause:** Inserted EOM rows were written with `=SUM(B{n}:Q{n})` and `=…*VLOOKUP(A{n},…)` using row numbers at insert time. After **`sort-balances-by-date.ts`**, physical row numbers changed but **formulas still point at old rows** (e.g. row 602 uses `A56` / `SUM(B56:Q56)`).

**Audit (2026-09-12):** ~3,100 bad refs sheet-wide; **359 on EOM rows**.

**Fix:** `scripts/fix-balances-formula-rows.ts [--eom-only] --write` — rewrites TOTAL + EUR VLOOKUP to each row's own index. Applied 2026-09-12: **357 EOM rows** fixed. Example: 2025-01-31 TOTAL **$40,784 → $416,647** (was summing row 56).

**Example — 2025-01-31 (row 602):**

| Col | Jan 30 snapshot | Jan 31 EOM (values OK) | Issue |
|-----|-----------------|------------------------|-------|
| Stripe | $32,332 | empty | EOM row incomplete vs snapshot |
| Wise USD | $334,367 | $283,820 | Value updated; TOTAL broken |
| TOTAL | $423,560 | **$40,784** | `=SUM(B56:Q56)` not row 602 |

---

### 13.6 Stripe month-end balances (Reporting API)

The Stripe tab does **not** exist in the Balances workbook — col D was filled manually or by
Bank Connector's daily sync. Historical month-ends now come from the **Reporting API**.

**Key:** `STRIPE_SECRET_KEY` in `.env` (gitignored). A **restricted** key (`rk_live_…`) is enough —
it can read `/v1/balance`, `/v1/balance_transactions`, **and create report runs**.

| Approach | Verdict |
|----------|---------|
| `/v1/balance` | ✅ but **current balance only** — no history |
| Replay all `/v1/balance_transactions` | ❌ **too slow** — thousands of pages, ran >10 min without finishing |
| **Reporting API `balance.summary.2`** | ✅ **use this** — official ending balance per period |

**Why it's fast:** one report run returns **both** `ending_balance` *and* `starting_balance`,
and `starting_balance(M)` = `ending_balance(M−1)`. So requesting only alternating months
covers every month-end and **halves** the number of report runs.

**Mechanics** (`src/stripe-reports.ts`):

1. `POST /v1/reporting/report_runs` with `report_type=balance.summary.2`, `parameters[interval_start]`
   (month start), `parameters[interval_end]` (**next** month start), `parameters[timezone]=Etc/UTC`
2. Poll `GET /v1/reporting/report_runs/{id}` until `status=succeeded` — takes **~10s**
3. Fetch `result.url` with the same bearer token → CSV
4. Read the `ending_balance` row where `currency=usd`

Run 6 in parallel; results cached in **`data/stripe-eom-usd.json`** so reruns are instant
(`--refresh` to re-fetch). Measured: **4 months in 11.6s using 2 report runs**.

**Limits:** `data_available_start` = **2017-01-25**, `data_available_end` ≈ yesterday, so the
current (unclosed) month returns nothing and pre-2017-01-25 intervals are clamped. When the
interval is clamped, `starting_balance` is *not* a month-end and must be ignored.

**Balance definition:** `ending_balance` = available + pending + reserved — matches the
Balances tab convention.

**Accuracy vs last daily snapshot:** far better. Across 50 months the API differs from the
month's last daily snapshot by a **median $7,110** (max $20,451) — Stripe balances swing hard
around payouts, so "nearest snapshot" is not a usable substitute. For 2025-07 the API gives
**$40,250.50**; the last snapshot (2025-07-30) was **$30,705.21**.

### 13.7 Stripe column has an intraday bias (open decision)

Validating the API against **8 months that already had a Stripe EOM value** shows the API is
**consistently higher**, never lower:

| Month | Sheet EOM | API EOM | Δ |
|-------|-----------|---------|---|
| 2025-04 | 36,583.02 | 39,751.05 | +3,168 |
| 2025-09 | 23,407.34 | 26,995.63 | +3,588 |
| 2025-10 | 34,366.21 | 38,284.58 | +3,918 |
| 2025-12 | 32,572.46 | 36,039.25 | +3,467 |
| 2026-01 | 45,825.28 | 50,005.39 | +4,180 |
| 2026-06 | 24,107.41 | 30,395.13 | +6,288 |
| 2026-07 | 40,619.46 | 45,999.35 | +5,380 |
| 2026-08 | 17,342.40 | 22,404.58 | +5,062 |

**Ruled out:** timezone (`Etc/UTC` and `America/Los_Angeles` return identical figures for
explicit unix bounds) and an off-by-one-day interval (shifting `interval_end` back a day gives
a wildly different 59,831.62 for 2026-08).

**Likely cause — intraday snapshot.** The existing column comes from the daily sync calling
`/v1/balance` at a fixed time of day, whereas `ending_balance` is the balance at **23:59:59**.
Stripe's balance grows through the day as charges land, so the sync value is systematically low,
and the gap scales with daily volume (≈$3k in 2025 → ≈$6k in 2026). Corroborating: the
2026-09-12 sheet snapshot was **53,355** while `/v1/balance` at the time of writing showed
available 37,910 + pending 18,822 = **56,732** (+3,377).

**Resolution (2026-09-12): keep existing values, fill only empties.** Every bank column on a
given row was captured at the same moment by the same sync run, so an intraday Stripe→bank
transfer is reflected consistently across that row. Replacing Stripe with a 23:59 figure while
the other columns stay at the sync-time snapshot would double-count or lose in-flight transfers
and distort col R TOTAL. **Row-internal consistency beats per-cell precision** — this is the
governing rule for the Balances tab.

Result: **73 empty Stripe EOM cells filled** from the API. The **12** still empty are genuine
**$0.00** months (Stripe idle Feb–Dec 2017) plus the current unclosed month; the fill script
skips zeros rather than writing `0.00`.

### 13.8 Stripe payouts are never in transit at month end

Checked whether a Stripe→bank payout can straddle a month-end snapshot, leaving the money in
neither the Stripe cell nor the bank cell and understating col R TOTAL. **It cannot.** Nothing
should be written to the **In transit** column (col P) on account of Stripe payouts.

**Payout population** (`data/stripe-payouts.json`, 497 payouts, 2017-02-01 → 2026-09-08, all
USD, all `paid`). Destinations, in sequence:

| Destination | Payouts | Period | Lands in |
|-------------|---------|--------|----------|
| `ba_19i7qR…` | 283 | 2017-02 → 2022-08 | **SVB** (280 matched, 3 negative) |
| `ba_1LcwQZ…` | 53 | 2022-09 → 2023-09 | **Mercury** (53/53) |
| `ba_1NnggW…` | 43 | 2023-09 → 2024-06 | **Mercury** (43/43) |
| `ba_1PYnhH…` | 116 | 2024-07 → 2026-09 | **Wise USD** (116/116) |
| `card_1MegNd…` | 2 | instant card payouts | **Mercury** (2/2) |

Mapping established by same-day, same-amount credit matching (`probe-payout-destination-tabs.ts`);
every destination resolves to exactly one tab with no ambiguity. Note that **current Stripe
payouts land in Wise USD, not Mercury** — Mercury only received them 2022-09 → 2024-06.

`arrival_date − created` is **1 day** for 435 payouts, 0 for 59, 3 for 3 — so a naive
created-date test flags 14 month-ends as understated by a total of $152,850. **That test is
wrong**, for two independently verified reasons:

1. **`balance.summary` attributes payouts by `arrival_date`, not `created`.** The reported
   `payouts` total matches the arrival-date sum **to the cent** in every month tested
   (2021-05, 2021-06, 2024-03, 2024-04); the created-date sum misses by tens of thousands.
   So the funds stay inside `ending_balance` until the arrival date.
   Confirmed independently: 2024-03-31 had a 32,627.56 payout created 3/31 arriving 4/1, and
   the pre-existing sheet cell (written by the daily `/v1/balance` sync) reads 43,219.00 against
   an API end-of-day of 44,471.99 — not the ≈11,844 you would see if Stripe had already removed
   the funds.
2. **Banks record the credit on exactly `arrival_date`.** Matching payouts to bank credits by
   amount across `SVB`, `Mercury` and `Wise USD` gives `bank day − arrival_date = 0` for **all
   494** matched payouts.

Money therefore leaves the Stripe balance and appears in the bank on the same calendar day, so
the correct test (`arrival_date ≤ EOM < bank day`) yields **0 rows**.

The 3 unmatched payouts are all **negative** (`-14.26`, `-151.18`, `-150.20`, early 2018) — a
bank→Stripe pull covering a negative Stripe balance, i.e. a bank *debit*, so the credit matcher
skips them. Total −$315.64, opposite direction, not an in-transit gap.

**Incidental finding:** on the Balances tab, Stripe cells ending in `.00` are manual/sync
readings while cells with cents came from the Reporting API. `2021-05-31` holds a manual
`3,202.00` against an API end-of-day of `10,439.99`; the ≈7,238 gap coincidentally resembles
that day's payout but is really just a mid-day manual reading (neighbouring daily rows swing
3,202→9,999 within days). Left as-is under the §13.7 rule.

**Scripts:** `audit-stripe-inflight-eom.ts` (the check, read-only),
`probe-stripe-payout-destinations.ts` (fetch + cache payouts),
`probe-payout-attribution.ts` (created vs arrival basis),
`probe-payout-landing-lag.ts` (bank day vs arrival), `probe-balance-summary-rows.ts` (raw CSV),
`probe-unmatched-payouts.ts`, `probe-stripe-cell-neighbours.ts`.

> **Method note:** an earlier version of this check compared each flagged Stripe cell against the
> API value and declared 11 of 13 "safe". That was circular — those cells had just been written
> *from* the API, so agreement was guaranteed. Only cells with an independent origin can test the
> API's convention.

### 13.9 "In transit" (col P) records Stripe payouts at snapshot time

**Balances daily fill is API-only.** Bank columns (Mercury, Wise, …) come from live provider
APIs. **In transit** is Stripe payouts still `in_transit`/`pending` (not yet in a bank API
balance). **`paid` payouts are not written to col P** — they are already in the destination
API figure. Never scan bank tabs. Sep 15 $43,680 was `po_1UFO1G…` (paid, arrival 2026-09-14)
already inside Wise USD API $194,501; the Wise USD tab was stale (last Stripe credit 08-09-2026)
so the old tab matcher double-counted TOTAL. Apps Script only writes `body.inTransit` (v0.6.90).

Col P is **not** a standing float or a bank account. It is a snapshot-time bridge for a
Stripe payout that had already left Stripe but was not yet visible in the destination bank's
**API** balance at the moment the row was captured.

Of the 29 rows that carry an In transit value, **21 match a Stripe payout amount to the cent**,
and the row's date equals that payout's `arrival_date`. The remaining 8 are round manual figures
(75,000.00 · 10,000.00 × 3 · 8,000.00 · 7,001.13 · 8,001.13 · 45,792.76) — inter-bank transfers,
not Stripe payouts.

**Consequence: In transit must stay empty on EOM rows.** Bank tabs record the payout credit on
exactly `arrival_date` (§13.8), and EOM bank cells are taken from the bank tab BALANCE, so the
payout is already inside the bank column. Anything in col P on an EOM row is double counted.

**Never fill col P by carrying the last mid-month snapshot forward.** That value belongs to one
specific mid-month moment; by month end the payout has long since landed. Doing so for the 16
empty EOM rows would have invented ≈$592,000 of non-existent cash (≈$37k per row).

**Only two EOM rows ever carried a col P value, and both were double counts:**

| Row | Date | Value | What it was | Evidence |
|-----|------|-------|-------------|----------|
| 877 | 2026-08-31 | 42,695.94 | Stripe payout `po_1UAIle…`, arrival 2026-08-31 | Wise USD EOM cells match the bank tab exactly (0 fixes at $0.005), so the credit is already in col G |
| 611 | 2025-02-28 | 10,000.00 | Internal transfer Wise USD → Airwallex USD | `all banks` holds **both legs dated 2025-02-28** (`Internal Transfer - OUT` from Wise USD "Sent money to HostHub Airwallex USD"; `Internal Transfer - IN` to Airwallex USD from WISE US INC). Both tabs match their EOM cells exactly, so the money is counted once already |

Row 877 was cleared 2026-09-12: TOTAL `309,861.52` → `267,165.58`.

The row 611 lesson generalises: **an internal transfer is only genuinely in transit if the two
legs carry different dates.** Here both legs land on the month-end date, so the outgoing leg is
already out of Wise USD and the incoming leg already in Airwallex USD. Use `all banks`
(`Internal Transfer - IN` / `- OUT`, matched on amount and date) to settle these, never
amount-only matching — a round figure like `10,000.00` matches unrelated credits across many
years and produces false positives.

**Guard:** `fill-balances-eom-gaps.ts` marks col P `source: "never-fill"` and refuses to write it
(exit 1 with `--only "In transit"`). Added after a dry-run proposed `52,707` for row 877 — the
*previous* week's payout — immediately after row 877 was cleared.

**Scripts:** `probe-43680-in-transit.ts` (Sep 2026 $43,680 vs Wise API), `probe-in-transit-column.ts` (is it a float or transient?),
`probe-in-transit-vs-payouts.ts` (values vs payout amounts),
`probe-eom-in-transit-double-count.ts`, `probe-payout-destination-tabs.ts`,
`probe-transfer-10k-feb2025.ts` (row 611 transfer pair), `clear-eom-in-transit.ts` (`--row N --write`).

### 13.10 `parseAmount` mangled European-format numbers (fixed)

The Greek tabs store money as **text in European format** (`.` thousands, `,` decimal). The old
`parseAmount` only recognised it via `/^\d{1,3}(\.\d{3})+,\d+$/`, which rejects a leading minus
sign and requires a thousands group, so most values fell through to the US branch and were
silently corrupted **by a factor of 100**:

| Raw cell | Old | Correct |
|----------|-----|---------|
| `"6,82"` | 682 | 6.82 |
| `"52,68"` | 5268 | 52.68 |
| `"-1.890,84"` | -1.89 | -1890.84 |
| `"10.823,75"` | 10823.75 ✓ | 10823.75 |

Rewritten to: numbers pass through untouched; when both separators appear the **rightmost is the
decimal point**; with one separator kind, a single occurrence followed by exactly three digits is
thousands grouping (`"1,234"` → 1234), otherwise a decimal point (`"52,68"` → 52.68). Non-numeric
text returns `null`.

**Blast radius** (`check-parse-amount-regression.ts`, old vs new over every cell):

| Tab | Cells changed |
|-----|---------------|
| Eurobank | 3,541 |
| Viva | 783 |
| EurobankIKE | 102 |
| SVB, Mercury, Airwallex USD/EUR, Wise USD/EUR, Paypal, Balances | **0 money cells** |

The only change on the USD tabs was UniqueID strings like `"03670e97"` and `"9.18669E+15"`, which
`Number()` had been reading as scientific notation (`3.67e+100`); they now correctly return `null`.
**The completed SVB / Mercury / Airwallex / Wise reconciliations are unaffected.**

> Any Greek-tab figure produced before 2026-09-12 is suspect. Regression-test with
> `scripts/test-parse-amount.ts` (25 cases) before touching this function.

### 13.11 Eurobank tab changes row-order convention mid-2023

`ΥΠΟΛΟΙΠΟ` is a true running balance, but the order of **same-day** rows is not constant. Testing
`balance[n] = balance[n-1] + ΠΟΣΟ[n]` across 3,588 steps (`check-eurobank-ledger.ts`):

| Years | Sheet order | Reversed within day |
|-------|-------------|---------------------|
| 2018–2022 | 89–98% breaks | **0 breaks** |
| 2023 | 58% breaks | 36% breaks (transition year, mixed) |
| 2024–2026 | **0–9% breaks** | 70–96% breaks |

So the tab lists same-day transactions **newest-first up to ~2022** and **oldest-first from 2024**.
The `Sort` column (col 10) simply follows sheet order and does **not** fix this — month-end
selection is identical under both (0 months differ).

**Consequence:** `monthEndBalances`' "last sheet row on the last day" rule returns the *earliest*
transaction of that day for 2018–2022, so those month-ends are wrong. Visible as
2018-05 → `0.00`, which is the `ΑΝΟΙΓΜΑ ΛΟΓΑΡΙΑΣΜΟΥ` (account-opening) row sitting last.

**Resolved 2026-09-12** by physically re-sorting the tab — see §13.12.

### 13.12 Re-sorting a Greek tab into true chronological order

`scripts/fix-greek-tab-order.ts --tab X [--write]` recovers the real sequence from the ledger:
within a day, the row that follows running balance `B` is the one where `B + ΠΟΣΟ = ΥΠΟΛΟΙΠΟ`.
It writes the resulting position into the `Sort` column (col K) and sorts the tab by it.

**Only two candidate orders per day — as listed, or reversed.** This matters. An earlier version
searched arbitrary permutations with backtracking and made things *worse* (80 → 147 breaks):
it would find a technically valid chain whose closing balance then broke the following day. The
tabs were imported in blocks with a consistent within-day direction, so choosing between just
two candidates (tie-broken by the previous day's direction) is both truer and far more stable.
A day that will not chain from the previous close is re-judged on its own, so one gap in the
data cannot corrupt everything after it.

| Tab | Ledger breaks before → after | Rows moved | Action |
|-----|------------------------------|-----------|--------|
| Eurobank | 2,265 / 3,588 → **4** | 1,847 | **sorted** |
| Viva | 0 → 0 | 0 | none needed, already chronological |
| Eurobank IKE | 1 → 3 | 19 | **skipped** — the guard aborts when the result is worse |

The 4 residual Eurobank breaks are genuine data gaps (2 unresolved days in April 2026), not
ordering. Re-running the script afterwards moves 0 rows, so the result is stable.

**Safety checks done before sorting** (repeat these for any future tab sort):

- Cross-tab references are `VLOOKUP($A2, Eurobank!$A:$T, …, FALSE)` — keyed on UniqueID with
  **exact match**, so order-independent. No whole-column positional refs (`='Eurobank'!A:A`)
  to any Greek tab exist anywhere in the workbook.
- In-tab formulas in cols G–J reference their own row (e.g. `=value(SUBSTITUTE(SUBSTITUTE(E2,".",""),",","."))*G2`).
  Google's `sortRange` rewrites these correctly; verified on 7 sampled rows spanning the tab.
- The script writes a full backup (values **and** formulas) to `data/backups/<tab>-<ts>.json`
  before any change.

Note col H's own formula `=value(SUBSTITUTE(SUBSTITUTE(E2,".",""),",","."))` is the sheet's
European-format parser — independent confirmation that §13.10's reading of these columns is right.

### 13.13 The native slot of cols K and O held USD, double-converted

**By design every Balances column *displays* USD**, so col R `=SUM(B{row}:Q{row})` adds up
correctly. The EUR-denominated columns get there via

```
=<native EUR>*VLOOKUP(A{row},CC!A:B,2,FALSE)      → displays USD
```

The bug was **not** in the display or the design; it was in the hidden **native multiplicand**,
which must be EUR. Confirmed on 488 untouched daily rows of col K: native matches the Eurobank
tab's `ΥΠΟΛΟΙΠΟ` on 488, and the USD running sum on **0** (`check-daily-eur-native.ts`; the 265
"neither" are ordinary mid-day snapshot drift and rounded manual entries).

**Root cause of the Eurobank / Eurobank IKE drift.** On the EOM rows, col **K** (Eurobank) and
col **O** (Eurobank IKE) had their native slot filled from a **running sum of the bank tab's
`Amount` column (col I)**, which is USD — each row being `ΠΟΣΟ × Ισοτιμία` at that row's own date.
The correct native is `ΥΠΟΛΟΙΠΟ` (col F). Verified to the cent (`check-eur-col-source.ts`):

| Column | Date | Old sheet value | Σ USD `Amount` | Tab EUR `ΥΠΟΛΟΙΠΟ` |
|--------|------|-----------------|----------------|--------------------|
| K | 2018-05-31 | 29,231.75 | 29,231.75 | 25,000.00 |
| K | 2018-08-31 | 242,222.21 | 242,222.22 | 210,615.41 |
| K | 2018-09-30 | 217,032.57 | 217,032.58 | 188,962.48 |
| K | 2019-07-31 | 147,289.55 | 147,289.61 | 129,779.76 |
| O | 2026-02-28 | 72,476.50 | 72,476.50 | 60,835.06 |
| O | 2026-03-31 | 75,057.32 | 75,057.32 | 63,666.94 |
| O | 2026-05-31 | 63,401.55 | 2,404.40 ✗ | 53,312.78 |

(The last row does not fit, so not every cell came from this route — but 6 of 7 do.)

**Effect: double conversion.** A USD figure in the native slot was multiplied by the EUR→USD rate
*again*, making the row's TOTAL contribution ≈ `EUR × rate²` instead of `EUR × rate` — overstated
by ~15–19%. Example, row 21 (2018-08-31): native was `242,222.21` (USD) displaying `≈281,462`;
it is now `=210615.41*VLOOKUP(A21,CC!A:B,2,FALSE)` → `244,735.11` USD.

> **Method note:** a single-rate test (`old = tabEUR × CC rate`) matched only 2018-05, the one
> month with a single transaction. Because each transaction converts at its own day's rate, the
> blended ratio sits *near* the month-end rate but never on it. Ratio-to-FX-rate similarity is
> suggestive, never proof — reconstruct the actual arithmetic.
>
> That first test was also invalid for a second reason: it read the CC rates through
> `parseAmount`, which rounds to 2dp and turned `1.16927` into `1.17`. **Never use `parseAmount`
> for FX rates** — it is a money parser.

---

### 13.14 A month with no transactions is not a zero balance

`fix-balances-from-bank-tab.ts` used to propose **0** for any month the bank tab had no rows
for. That is only right for a closed account; normally the previous month's closing balance
still stands. The script now walks month by month from the tab's first month of data and
**carries the last known balance forward** (`--no-carry` disables it). Months *before* the
first transaction stay untouched — the account had no balance yet.

Re-running every bank after the fix turned up real month-ends that were blank or wrong:

| Bank | Cells | What they were |
|------|-------|----------------|
| Wise USD | 5 | empty; true balances up to **$11,284.51** (2018-11, 2019-01/02/04/09) |
| Eurobank | 1 | 2026-06 empty; true **€1,373.84** |
| Airwallex USD | 1 | 2024-03 empty; true **$1,001** |
| Airwallex EUR | 13 | sub-euro drift, 2025-02 → 2026-08 |
| SVB | 27 | the long-standing `-0.02`, now `0` |

All ten banks are now at **0 strict diffs** (`$0.005`).

### 13.15 Paypal: one tab, four currency ledgers, half a balance column

The `Paypal` tab needed three separate corrections before it would reconcile.

**1. `Balance` is per-currency.** The tab interleaves **USD 245 / EUR 54 / GBP 6 / PHP 6** rows
and each currency has its own running balance. Read as one ledger it breaks 89 times in 269;
split by currency, only 2. A foreign-currency charge is immediately covered by a conversion
from USD, so the non-USD sub-balance bounces to negative and straight back to 0 — and when such
a row happened to be the last of a month, the month-end read **0**. Verified that **no non-USD
currency ever ends a month with a balance**, so the fixer filters to `Currency = "USD"`
(`only` in the bank spec). Nine month-ends were wrong this way.

**2. `Balance` stops being populated after 2022-11** while transactions continue — 27 of 245 USD
rows have an amount but no balance, including almost everything in 2023–2025. A running sum of
`Net` reproduces **216 of 218** recorded balances exactly, so the fixer rebuilds the missing ones
(`rebuildFrom: "Net"`, `fillMissingBalances()` in `bank-tab-balance.ts`). A recorded balance
always wins and re-anchors the walk, so an upstream gap cannot cascade.

The 2 rows that disagree are **missing transactions** in the tab, not a parsing problem:

| Date | Recorded | Rebuilt | Missing |
|------|----------|---------|---------|
| 2022-05-11 | 1,048.69 | 1,063.69 | −15.00 |
| 2025-08-26 | 1,680.52 | 1,580.50 | +100.02 |

**3. Genuine zeros and genuine negatives.** From 2021-11 the account mostly pays from a linked
funding source: each charge drives the balance negative and an offsetting credit returns it to 0,
so `2021-11` and `2021-12` really do close at **0**. Where those offsetting credits were not
imported the rebuilt balance goes slightly negative (**−97.48** across 2023-09 → 2024-08). Left
as is — under $100 against corrections of ~$1,300/month — but it marks that stretch as
incompletely imported.

Before the fix the sheet held stale repeats (`1,266.16` ten times, `2,953.28` seven times).
Result: **93 cells** (65 + 28 strict), now 0 at $0.005.

### 13.16 Viva transaction sync needs Data Services credentials

Viva credential sets are **not interchangeable**:

| Use | Credentials | Endpoint | Status |
|-----|-------------|----------|--------|
| **Balances** | Merchant ID + API Key (Basic Auth) | `GET /api/wallets` | Works |
| **Wallet list** | Account Transactions OAuth | `GET /merchants/v1/wallets` | Works (200) — wallets + **balances only** |
| **Ledger movements (wrong API)** | Account Transactions OAuth + `walletaccounts` | `GET /walletaccounts/v1/transactions` | 404 / 403 — token has no `walletaccounts` |
| **Ledger movements (correct)** | **Data Services API credentials** (issued by Viva, not in Settings → API Access) | `POST /dataservices/v2/accounttransactions/Search` | **401** with Account Transactions token |

Fill Viva needs ledger rows (Money out to IBAN, Wallet2Wallet, fees). Support first pointed at `/merchants/v1/wallets` (CAS-05120514); live probe: **4 wallets**, no txn fields. They then named the Search endpoint and said Data Services creds are required (Viva provisions them).

**Do not switch the sync to `/merchants/v1/wallets`.** Do not implement Search until Viva issues Data Services credentials — current OAuth token returns **401**. Official note: [Data Services API](https://developer.viva.com/apis-for-payments/data-services/) access is requested from Viva, not self-generated.

### 13.17 Cledara — card funding, repayments, sync

Cledara has **no Balances column** (see §6 open item #5). Cash flow is tracked on the **`Cledara`**
tab + **`Cledara match`** (1:1 row-aligned) + **`all banks`**.

| Flow | Direction | Category | Notes |
|------|-----------|----------|-------|
| **Card funding** | Bank OUT → Cledara balance up | Bank: `Internal Transfer - OUT` | Mercury / SVB / Wise USD desc matches Cledara |
| **Card spend** | Cledara OUT | Operating expense (merchant) | SaaS charges on virtual cards |
| **Repayment / other IN** | Cledara IN (cash return, NA, top-up) | `Internal Transfer - IN` | Weekly sweep + any non-reward credit |
| **Rewards** | Cledara IN | `Income - Cashbacks` | API `description: "Cledara Rewards"` |

**API repayment shape** (live, 2026-09-14 — *not* `"Repayment : …"` in raw description):

| Field | Value |
|-------|-------|
| `type` | `other` |
| `accountType` | `saasMain` |
| `card` | `null` |
| `amount` | positive USD |
| `description` | `" \| N/A"` |
| date | **`authorizedAt`** only — no `settledAt` on repayments |

**Cledara Rewards (cashback)** uses the *same* `type/accountType/card/amount` shape. Distinguish by
`/cledara rewards/i` on description (`isCledaraApiRewardRaw`). 18 API rows. Classifier excludes
those from `isCledaraApiRepaymentRaw()`; normalize sets `isReward` and keeps the Rewards
description (does **not** rewrite as `Repayment : …`). Sheet INs: Rewards → `Income - Cashbacks`;
every other Cledara IN → `Internal Transfer - IN` (`classify-cledara-ins.ts`). Same-day
same-amount `Cledara rewards - #{legacyId}` rows often already exist — delete only the false
`Repayment : … #{uuid}` copy, not a second legacy rewards row (e.g. 2024-07-04 $902.86 ×2).

Detection: `isCledaraApiRepaymentRaw()` + `normalizeCledaraTransaction()` in `src/cledara.ts`
builds `Repayment : {date} - {date} - #{id.slice(0,8)}` for true repayments only. Apps Script
dedup keys: `rep:YYYY-MM-DD - YYYY-MM-DD` (period from description).

**Orphan pairing:** bank→Cledara fundings pair to Cledara IN at ±10% USD within the standard
Internal Transfer window (`hasCledaraFundingPair` in `internal-transfer-pairing.ts`) — excluded
from manual orphan lists. Missing **repayment IN rows** leave fundings falsely orphaned.

**Multiple repayments same day** are normal (e.g. 2023-02-20: $206.97 + $7,782.19). Match audit
uses **date + amount** (±3 days, ±$0.02), not description alone.

**Backfill / insert rules** (`backfill-cledara-repayments.ts --write`):

1. Insert into **`Cledara`**, **`Cledara match`** (same row index), **`all banks`** (global date order)
2. Insert **bottom-up** (newest date first) so row indices stay stable
3. Copy match formulas cols B–F from a repayment template row; set col G = `Internal Transfer - IN`
4. Copy `all banks` formulas cols C–J from a Cledara template row; set A = UniqueID, B = `Cledara`
5. Read ranges to **`100000` rows** — `10000` truncates Wise USD / Cledara rows ~11k+

**Status (2026-09-14):** API **313** repayments ↔ sheet **313 matched**. Cross-bank orphan **OUT: 0 / 971**. Orphan **IN: 43** ($147k) — mostly Cledara repayments with no same-amount bank OUT; largest Eurobank POI/Syncbnb. `list-internal-transfer-orphans.ts`.

**Orphan pairing exclusions** (not manual-review orphans):

| Pattern | Rule |
|---------|------|
| Wise USD↔EUR convert | Same-wallet FX — no cross-bank IN leg |
| Viva Wallet2Wallet | Intra-Viva card loads |
| Wise → Airwallex USD | IN from `WISE US INC` within −30…+45 days, ±40% amount |
| Bank → Cledara funding | Cledara IN at ±10% (must be `Internal Transfer - IN`, not `Other - …`) |

**Requires:** `CLEDARA_API_TOKEN` in `.env` (and Render env for live sync).

---

## 14. Changelog (Balances / banks)

| Date | Change |
|------|--------|
| 2026-09-15 | **Menu fill deadlock (v0.6.91)** — sheet menu now `/cron/prepare-balance-fill` + local write. Calling `/cron/sync-balances` from the menu 404s the webhook (lock). |
| 2026-09-15 | **In transit from bank APIs (v0.6.90)** — match Stripe payouts to Wise/Mercury API credits, not bank tabs. Sep 15 $43,680 was `po_1UFO1G…` already in Wise USD API. |
| 2026-09-15 | **Webhook 404 / false success fix (v0.6.89)** — `src/sheets-webhook.ts`: POST `redirect: "manual"`, GET echo URL, retry 404/doGet, reject `doGet` help JSON. Live on Render `17ca813` (2026-09-15 10:21 Athens). |
| 2026-09-15 | BankConnector ops: Render CLI v2.28.0 (`Render.CLI`), workspace/service IDs, log commands, webhook URL (clasp **@28**), and why some fills fail (Apps Script ContentService 302/404 / `doGet` false success). |
| 2026-09-15 | Daily Balances fill cron reset to **19:00 Athens** (`0 16 * * *` UTC). Live schedule had been `0 6 * * *` (09:00 Athens). |
| 2026-09-15 | Saved full QuickBooks chart of accounts (Consolidated `Con P&L` labels) → [`docs/qb-chart-of-accounts.md`](qb-chart-of-accounts.md). |
| 2026-09-14 | **Bank/match row alignment** — Empty rows on `Cledara match` (and drift on many `* match` tabs) came from bank fills appending to the bank tab only while match stayed stale. **`fix-bank-match-alignment.ts --write`** realigned all 14 bank/match pairs 1:1 by UID (Cledara: 29 empty → 0 in data range). **`audit-bank-match-gaps.ts`** to scan. Apps Script **`bankConnectorSyncMatchAppend_`** now writes new UIDs + formulas to the match tab on every fill. |
| 2026-09-14 | Totals row **40** outflows are **negative** (`=−(32+31−120)`); row **41** is `=39+40`. |
| 2026-09-14 | Totals **39** Cashflow P&L Inflows `=17−50−51`, **40** Outflows `=32+31−120`, **41** net `=39−40`. Aug 2026: in $255,654 / out $348,012 / net −$92,358. |
| 2026-09-14 | Totals row **38** = categorized only: `+Income - Loans − Other - Loan Repayments`. Stripe `financing_paydown` not included. |
| 2026-09-14 | **Stripe Flex loans** repay at source: `balance_transactions` type `financing_paydown` (“Withheld funds from ch_… to pay down flex loan”). Never a bank OUT — so Totals row 38/`Other - Loan Repayments` misses them. Bank repayments stop **2025-09**. Two loans (`flxln_1TM9…`, `flxln_1TGB…`). Aug 2026 withheld **~$12k**, Sep MTD **~$6k**. `probe-stripe-loan.ts`. |
| 2026-09-14 | Totals row **38** now `loans + repayments` (`=48+118`); row **39** `=36−37−48+118` so P/L still excludes both. Last repayment month is 2025-09. |
| 2026-09-14 | **Totals for P&L** summary rows rewritten: **33** = all IN−OUT; **36** = no IT (`33−34+35`); **37** = investments (`=49`); **38** = loans − repayments (`=48−118`); **39** = cashflow P/L (`36−37−38`). Verified Aug 2026 vs `all banks`. `fix-totals-pnl-summary-rows.ts --write`. |
| 2026-09-14 | Row **393** re-synced from Balances **TOTAL** (col Q, last snapshot in month, Stripe excluded): **104 cells** (2018-02 → 2026-09). Aug 393 **$252,423**; Sep filled **$250,911**. `fill-pnl-393-from-balances.ts --write`. |
| 2026-09-14 | After Totals→P&L paste (0 cell drift IN+OUT): Aug **392 $384k vs 393 $267k** (gap −$117k). Paste is not the cause. 393 still ≠ Balances TOTAL (103/116 months; Aug TOTAL $252k, Stripe $17k not in TOTAL). Viva omitted from 171/263; Cledara in model with no bal col; Revolut USD −$53k Jun 2026 with no txns. See §10b. |
| 2026-09-14 | Cledara INs classified: Rewards → **Income - Cashbacks**; all other INs → **Internal Transfer - IN**. Dropped false `Repayment : … #{uuid}` copies of existing `Cledara rewards` rows (keep both same-day $902.86 legacy rewards). `isCledaraApiRepaymentRaw` no longer treats Rewards as repayments. `classify-cledara-ins.ts`. See §13.17. |
| 2026-09-14 | Cledara API: **Rewards** (`description: "Cledara Rewards"`) share repayment shape (`other`/`saasMain`/no card/+amt). 14 hashed “repayment” orphans we retagged are all Rewards, 0 true repayments. True repayments are `" \| N/A"` (295). See §13.17. |
| 2026-09-14 | Retagged **19** orphan Internal Transfer INs < $500 (no Cledara/PayPal/Revolut counterpart OUT) to **Income - Cashbacks**. Deleted 4 more same-uid Cledara repayment duplicate pairs (12 rows). |
| 2026-09-14 | Deleted duplicate Cledara repayment **2022-08-03 $205.92** `#1909d3f1` (`96e1dd1a3c7c`) — later copy on Cledara/match r184 + all banks r8573. One row remains (r183 / r8572). |
| 2026-09-14 | Retagged SVB **2022-06-02 $7,541.05** `CLEDARA LIMITED` (`1d7fc946`, all banks r8116) Other - Uncategorized → **Internal Transfer - OUT** — pairs Cledara repayment IN r8098. |
| 2026-09-14 | Retagged Eurobank **2018-11-12 $7.46** `PAYPAL * 35314 LU` (`0a35de0a`) Internal Transfer → **Income - Purchase Refunds**. |
| 2026-09-14 | Retagged Eurobank **2018-05-31 €25,000 / $29,231.75** `Transfer to Syncbnb` (`e80a140b`) Internal Transfer → **Income - Investments** — account-opening capital, no matching bank OUT. |
| 2026-09-14 | Retagged SVB **2018-02-05 $446.52** `PAYPAL TRANSFER` (`28eca37f`) Internal Transfer → **Income - Subscription** — no PayPal OUT on sheet (tab empty that early). |
| 2026-09-14 | **Internal Transfer orphans** — OUT **0 / 971**. Orphan IN **43 / 972** ($147k USD). `all banks` IT sums: IN $15.59M / OUT $15.60M (Δ −$16k). Screenshot IN>OUT is a different total (not USD-normalized pairing). See `list-internal-transfer-orphans.ts`. |
| 2026-09-14 | **Wise USD Aug 2023 $25k INs added** — inserted missing MercuryACH INs 2023-08-04 / 2023-08-08 (`eb41ee1c7914`, `551420409813`) on Wise USD + match + all banks. Rewrote progressive AD chain. Aug 2023 `balance diff` ~0. See §13.3. |
| 2026-09-14 | **Wise USD progressive break (Aug 2023)** — `calculated progressive balance` (`=AD_prev+Z`) matches Wise `BALANCE` until 2023-08-04. Two Mercury ACH $25k credits (OUT 2023-08-03 and 2023-08-07 to Wise ••8184) hit the wallet but have **no IN rows** — only fee lines `BALANCE-1225663781` / `BALANCE-1236145612`. `balance diff` stays **−$25k** then **−$50k**. Aug 2 $25k and Aug 23 $50k MercuryACH INs are present. See §13.3. |
| 2026-09-14 | **Internal Transfer orphans cleared** — **0 / 971** (was 36). Extended `internal-transfer-pairing.ts`: Wise same-wallet FX, Viva Wallet2Wallet, Wise→Airwallex sweep pairing. Fixed 6 miscategorized match rows (`fix-orphan-categories.ts --write`): 2 Cledara funding INs, 2 UNCAPPED→`Other - Loan Repayments`, Wise EUR→Viva GR subsidiary pair. |
| 2026-09-14 | KB §13.16 — Viva support (CAS-05120514) named the real ledger call: `POST /dataservices/v2/accounttransactions/Search`, which needs **Data Services API credentials** (Viva-issued). Current Account Transactions token returns **401**. `/merchants/v1/wallets` remains wallets+balances only. |
| 2026-09-14 | KB §13.16 — Viva Fill transactions blocked: `/merchants/v1/wallets` is wallets+balances only (confirmed live, 4 wallets, no txn fields). Support CAS-05120514 pointed at that endpoint; it cannot replace `/walletaccounts/v1/transactions`. Token still lacks `walletaccounts` scope. |
| 2026-09-14 | KB §13.17 — Cledara structural reference: API repayment format, funding/repayment flow, insert rules, current status. |
| 2026-09-14 | **Cledara API repayment backfill** — Live API repayments are `type: other`, `accountType: saasMain`, `card: null`, positive amount (description `" | N/A"`). Rewrote `backfill-cledara-repayments.ts` to fetch API, diff vs sheet, insert **29 rows** bottom-up into `Cledara` + `Cledara match` (row-aligned) + `all banks` (global date order) with formula copy + `Internal Transfer - IN`. Audit: **313 API = 313 matched on sheet** (321 repayment rows incl. 8 legacy extras). Unpaired bank→Cledara fundings: **2** (Wise USD Aug/Dec 2024). Internal Transfer orphans: **36 / 973**. |
| 2026-09-14 | **Mercury EOM fix** — 48 month-end cells on `Balances` had txn running-sum drift (and Jul/Aug 2026 showed **−$2,539** from summing `availableBalance`). Fixed to last daily snapshot in month (API **`currentBalance`**). `reconcile-mercury.ts` + `fill-balances-eom-gaps.ts` now use daily snapshot, not txn sum. Backend `sheet-balances.ts` uses `booked ?? available` (v0.6.50+). |
| 2026-09-14 | **Cledara sync — repayments** — `normalizeCledaraTransaction` now handles `transferReceive` / `applicationTopUp` and `Repayment` text in **description or comment**; prefers **USD `localAmount`**. Apps Script sends `rep:YYYY-MM-DD - YYYY-MM-DD` keys to skip duplicate repayment periods. Backfilled missing repayments **Aug 20–26 $2,749.17** + **Oct 22–28 $6,586.47** (`backfill-cledara-repayments.ts --write`). |
| 2026-09-14 | **Cledara card funding pairing** — Mercury/SVB/Wise USD OUT to Cledara (desc matches) pairs to **Cledara IN** within the standard window at ±10% USD (`hasCledaraFundingPair`). **298/300** fundings match after repayment backfill; **2** remain (Wise USD Aug/Dec 2024). See §13.17. |
| 2026-09-14 | **Wise USD duplicate UniqueIDs** — 3 uids reused across 11 rows (`eaa2bdbd`, `3eed634c`, `faa1f733`); VLOOKUP on `all banks` always hit the first row (e.g. Aug 23 **$50k MercuryACH IN** invisible). Fixed via `fix-wise-usd-duplicate-uids.ts --write`: re-hashed to `uniqueId(wiseDatetime, description, wiseAmount)`, deleted 2 identical $25k copies, added 6 `all banks` rows with formula copy. Mercury **$50k OUT 2023-08-21** (r11634) now pairs Wise USD IN **da90145a** ($50k, +2d). Orphans: **46 / 973**. |
| 2026-09-14 | **Internal Transfer pairing window** — IN leg may land up to **3 days before** OUT (Mercury→Wise pre-fund / EUR convert), not only 0–10 days after. Shared helper: `scripts/internal-transfer-pairing.ts`. Re-run at ±10% amount: **98 / 975** unpaired (was ~290 forward-only). At exact ±$0.02: **392** unpaired; `--fx` ±3%: **147** unpaired (**828 paired**). Residual: Wise USD→EUR same-wallet conversions (IN on Wise EUR same day, not a different bank), Revolut FX (~7% USD gap), missing Airwallex IN rows, true off-sheet wires. |
| 2026-09-14 | **Internal Transfer pairing — amount currency rules** (`pair-amount-usd.ts`, tests in `test/pair-amount-usd.test.ts`, audit via `audit-match-amount-currency.ts`). `all banks` col F is **already USD** for: all USD banks, **Wise EUR**, **Revolut EUR**, **Airwallex EUR** (match Amount = USD equivalent, not native EUR), **Eurobank internal** (POO/POI/Syncbnb). **Only Wise GBP** uses native GBP — parse USD from description or FX convert. Never EUR-convert Wise EUR / Revolut EUR match amounts (caused false orphans). Orphans after fix: **45 / 974** (was 138). |
| 2026-09-14 | Orphan lists **skip same-bank pairs** (e.g. SVB wire OUT + RTN WIRE IN same day) via `isCrossBankOrphan()` — not manual-review orphans when both legs are Internal Transfer on one bank. |
| 2026-09-14 | **Paypal CSV backfill** — 41 missing **USD** rows from uploaded `Paypal_2018–2023.CSV` added (`backfill-paypal-from-csv.ts --write`); descriptions copied from same-day EUR/GBP legs when USD row empty. **0 USD gaps** remain vs CSV. **`fix-paypal-tab.ts`** — normalize OrigDate/Time (backfill wrote date serials), sort via temp col AD key, realign `Paypal match`. Feb 2018 **$446.52 withdrawal** now row 5. User fills `all banks` separately. **`enrich-paypal-descriptions-from-csv.ts`** — fixed MM/DD date parse bug (blocked foreign-leg match); filled 12 empty descriptions from foreign **Name** or USD **Note/Subject/Invoice** (e.g. Facebook Ads, Sonetel). 5 rows still blank in CSV (General Withdrawal / anonymous Bank Deposit). |
| 2026-09-14 | **Paypal non-USD cleanup** — deleted 63 EUR/GBP/PHP rows (each had a USD leg same day); copied description/note/from/to onto USD rows first (`cleanup-paypal-non-usd.ts`). Tab is USD-only now; col AB = `Amount (USD)` = `VALUE(Net)`. Match col O header stays **`Amount`** (for `all banks` VLOOKUP) but formula pulls **`Amount (USD)`** from Paypal (`fix-paypal-match-amount-header.ts`). |
| 2026-09-14 | **Wise GBP** backfilled from statement CSV (`setup-wise-gbp-full.ts --write`, 10 txs) — no API needed. Categorized on `Wise GBP match` via `categorize-wise-gbp-match.ts`: conversions → Internal Transfer IN/OUT, Wise charges → Bank Fees, outbound transfers → Expense - Other. |
| 2026-09-13 | Added **Wise GBP** txn pipeline (mirrors Wise USD): tabs `Wise GBP` + `Wise GBP match` (`create-wise-gbp-tabs.ts`), sync `fill-wise-gbp` / `syncWiseGbpTransactionsToSheet`, Apps Script `bankconnector-wise-gbp.js`. Balances col **TW (GBP)** maps to bank name `Wise GBP`. Backfill: menu **Fill Wise GBP transactions** or `backfill-wise-gbp.ts --write` (needs `WISE_API_TOKEN`). |
| 2026-09-13 | Removed **35 orphaned Paypal rows** from `all banks` after pending txs deleted from `Paypal` + `Paypal match` (`delete-orphan-all-banks-rows.ts Paypal --write`). `all banks` does not auto-sync deletions — VLOOKUP rows must be removed manually. |
| 2026-09-13 | `list-unpaired-internal-out-10d.ts` — Internal Transfer OUT with no matching IN within **+10 days** (different bank): exact ±$0.02 → **625** unpaired ($8.79M); **--fx** ±3% → **373** unpaired ($2.56M), **618 paired**. Residual orphans: Mercury→Wise sweeps, Revolut USD→EUR (IN ~6–7% lower in USD), miscategorized IN (e.g. Wise EUR OUT $55,622 has exact Eurobank IN same day but not Internal Transfer). Lists: `tmp-unpaired-internal-out-10d.json`, `tmp-unpaired-internal-out-10d-fx.json`. |
| 2026-09-13 | Internal Transfer mismatch audit (`identify-internal-transfer-mismatches.ts`): Totals rows 35/36 lifetime **IN $15.52M / OUT $15.65M** (Δ **−$127k**); **91/116 months** imbalanced. Net orphan legs in `all banks`: 152 OUT ($1.99M) vs 102 IN ($1.86M) → **−$129k** (matches lifetime Δ). Main drivers: FX conversions (Revolut/Wise USD→EUR), Mercury→Wise sweeps, cross-month timing — not Totals tab formula error. |
| 2026-09-13 | **`all banks` ↔ `* match`: 0 diffs** (13 banks, 116 months). Removed **22 duplicate rows** per tab on Airwallex USD + match + all banks (`fix-airwallex-usd-duplicates.ts --write`). Fixed Revolut EUR rows **20902–20903** — had UniqueID + bank but **no VLOOKUP formulas** in C–G (`fix-revolut-ab-missing-formulas.ts --write`); restored Aug 2024 OUT $25 + Oct 2024 OUT $761. |
| 2026-09-12 | **All 10 banks reconciled**, every one at 0 strict diffs ($0.005). |
| 2026-09-12 | **Internal Transfer rows 35/36** — lifetime OUT exceeds IN by **$79k–$82k** (91/116 months imbalanced). Main drivers: FX conversions (Wise/Revolut USD→EUR OUT amount ≠ EUR-leg IN in USD), Mercury→Wise sweeps, timing. Stripe payouts ($8.9M) tagged `Income - Subscription` are *excluded* from row 35 — re-tagging them Internal Transfer IN would **widen** the gap, not fix it. Script: `attribute-internal-transfer-gap.ts`. |
| 2026-09-12 | **`all banks` ↔ `* match` tabs: 0 diffs** after removing 3 duplicate rows (`fix-all-banks-duplicates.ts --write`): `all banks` rows 7739 + 7748 (Github $320, Google Cloud $5,312); `Wise USD match` row 1679 (Cledara $2,466.33). |
| 2026-09-12 | KB §13.14 — `fix-balances-from-bank-tab.ts` treated a transaction-free month as a zero balance; now carries the last balance forward (`--no-carry` opts out). Re-audit found 47 more wrong cells: Wise USD 5 (one worth $11,284.51), Eurobank 1, Airwallex USD 1, Airwallex EUR 13, SVB 27. |
| 2026-09-12 | KB §13.15 — Reconciled **Paypal**: 93 EOM cells (65 + 28 strict). Three causes: `Balance` is per-currency across USD/EUR/GBP/PHP (now filtered to USD), it stops being recorded after 2022-11 (now rebuilt by rolling `Net` forward, 216/218 exact), and 2021-11 onward the account genuinely closes at 0. |
| 2026-09-12 | KB §13.13 — proved Balances cols **K** and **O** held USD: a running sum of the bank tab's USD `Amount` col (matches to the cent in 6/7 samples), then double-converted by the cell's own `*VLOOKUP(CC)`. Corrects the earlier single-rate explanation. |
| 2026-09-12 | Reconciled **Eurobank IKE**: 6 EOM cells (5 + 1 strict), now 0 at $0.005. Same USD-in-EUR-column pattern as Eurobank for 2026-02→05; 2026-06 sheet value was a 06-25 mid-month snapshot. |
| 2026-09-12 | Reconciled **Viva**: 10 EOM cells (4 + 6 strict), now 0 at $0.005. Only 10 months of data. |
| 2026-09-12 | Reconciled **Eurobank**: 93 EOM cells (70 + 23 strict), now 0 at $0.005. Root cause: pre-2020 the EUR column held USD amounts (ratio ≈ the EUR→USD rate). |
| 2026-09-12 | KB §13.12 — **re-sorted the Eurobank tab chronologically** (`fix-greek-tab-order.ts`), ledger breaks 2,265 → 4, 1,847 rows moved. Backup in `data/backups/`. Viva already correct; Eurobank IKE skipped (would get worse). |
| 2026-09-12 | KB §13.11 — Eurobank tab lists same-day rows **newest-first up to 2022, oldest-first from 2024** (2023 mixed). Current month-end rule picks the wrong row pre-2023. Eurobank **not** reconciled; no cells written. |
| 2026-09-12 | KB §13.10 — **fixed `parseAmount`**: European-format text was corrupted 100× (`"52,68"` → 5268). Affected Eurobank (3,541 cells), Viva (783), EurobankIKE (102); zero money cells changed on the already-reconciled tabs. Added `test-parse-amount.ts`. |
| 2026-09-12 | Reconciled **Wise EUR**: 88 EOM cells (63 + 25 strict), now 0 at $0.005. No EOM row on the Balances tab now carries an In transit value. |
| 2026-09-12 | Cleared double-counted In transit on row 611 (2025-02-28): TOTAL 405,707.62 → 395,707.62. |
| 2026-09-12 | Row 611 (2025-02-28) In transit 10,000 traced to a Wise USD → Airwallex USD internal transfer with **both legs dated 2025-02-28** — also a double count. |
| 2026-09-12 | EOM gap fill complete: TW GBP 18 cells + Revolut EUR 1 cell written; `fill-balances-eom-gaps.ts` now reports **0** fillable gaps. Col P guarded as `never-fill`. |
| 2026-09-12 | Cleared double-counted In transit on row 877 (2026-08-31): TOTAL 309,861.52 → 267,165.58. |
| 2026-09-12 | KB §13.9 — col P "In transit" identified as a snapshot-time Stripe-payout bridge (21/29 values match a payout to the cent). Must stay empty on EOM rows; carrying mid-month values forward would invent ≈$592k. Found live double count on row 877 (2026-08-31, $42,695.94). |
| 2026-09-12 | KB §13.8 — corrected payout destinations: current payouts land in **Wise USD** (2024-07+), not Mercury; Mercury only 2022-09 → 2024-06. Mapping proven by same-day same-amount matching. |
| 2026-09-12 | KB §13.8 — Stripe payouts are never in transit at month end: `balance.summary` attributes payouts by `arrival_date` (verified to the cent) and banks credit on exactly that date (494/494). Corrected in-flight test returns 0 rows; **no In transit values written**. |
| 2026-09-12 | Filled 73 empty Stripe EOM cells from the Reporting API (`fill-balances-eom-gaps.ts --only Stripe --write`). 12 left empty = true $0.00 months + unclosed month. |
| 2026-09-12 | KB §13.7 — Stripe API EOM runs +$3–6k above existing sheet values; traced to intraday `/v1/balance` snapshots vs true 23:59 balance. Timezone and off-by-one-day ruled out. Decided: keep existing values, row-internal consistency wins. |
| 2026-09-12 | KB §13.6 — Stripe month-end balances via Reporting API (`src/stripe-reports.ts`), cached in `data/stripe-eom-usd.json`. Balance-transaction replay rejected as too slow. |
| 2026-09-12 | Fixed 357 EOM formula row refs (`fix-balances-formula-rows.ts --eom-only --write`). |
| 2026-09-12 | KB §13 — Balances reconciliation: source-of-truth per bank, scripts, formula-row bug, Jan 2025 TOTAL anomaly documented. |
| 2026-09-12 | Reconciled Balances EOM: SVB, Mercury, Airwallex USD/EUR, Wise USD (see §13.3). |
| 2026-09-12 | Fixed verify script: use `DATE` col + last same-day row (`bank-tab-balance.ts`). |
