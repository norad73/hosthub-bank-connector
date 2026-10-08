# BankConnector

Daily bank balance sync to Google Sheets.

Pulls balances from Enable Banking (PSD2), Viva, Airwallex, Stripe, and PayPal, then pushes rows to a Google Apps Script webhook on a schedule.

## Deploy (Render)

1. Push to GitHub and connect the repo on [Render](https://render.com).
2. Apply `render.yaml` (web service `bankconnector` + daily cron).
3. Set env vars for each payment provider you use.
4. Apps Script is linked via [clasp](https://github.com/google/clasp): `npm run clasp:push` uploads `apps-script/` to the bound project. Set script properties `BANKCONNECTOR_URL` and `CRON_SECRET`, deploy as web app, paste the URL into `GOOGLE_SHEETS_WEBHOOK_URL`. Use **Custom Menu** for balances and transaction fills.
5. Connect banks via `/connect?bank=Eurobank` (or Wise, etc.).

## Local

```bash
npm install
cp .env.example .env   # fill in credentials
npm run dev
```

- Status: http://localhost:8080
- Balances: http://localhost:8080/balances
- Manual sync: `npm run sync-sheets`

## Apps Script (clasp)

Other Hosthub clasp projects live in [`C:\Projects\Google Apps Scripts`](../Google%20Apps%20Scripts) — one folder per sheet (`Quickbooks updater`, `Bank transactions`, etc.). Do not add new clasp projects here.

This repo’s `apps-script/` is the Bank transactions webhook/menu code. Linked to spreadsheet `1fpNA3NDMp11MtJXRE3hJ3VE4jCklWDDladULmlZerEc`.

```bash
clasp login          # once per machine (already done here)
npm run clasp:push   # push apps-script/ to Google
npm run clasp:pull   # pull remote edits into apps-script/
npm run clasp:open   # open the script editor
```

After `clasp:push`, redeploy the web app if `doGet`/`doPost` changed.

## Enable Banking

Register an application at https://enablebanking.com/cp/applications with redirect URL:

```
https://bankconnector.onrender.com/callback
```

(or your local/ngrok URL for dev)

## CLI

```bash
npm run check           # verify config + Enable Banking app
npm run hash-password   # generate ADMIN_PASSWORD_HASH
```
