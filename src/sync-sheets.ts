// Fetches booked balances for every linked account and POSTs them to a Google
// Apps Script web app. Invoked by POST /cron/sync-balances or `npm run sync-sheets`.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config, isConfigured } from "./config.ts";
import { getCachedBalance, setCachedBalance } from "./balance-cache.ts";
import type { CachedBalance } from "./balance-cache.ts";
import { accountDisplayName, athensDate, daysLeft, sessionName, simplifyBalances } from "./data.ts";
import type { StoredAccount } from "./store.ts";
import { eb, EnableBankingError } from "./enablebanking.ts";
import { store } from "./store.ts";
import { isAirwallexConfigured, listAirwallexBalances, AirwallexError } from "./airwallex.ts";
import { isPayPalConfigured, listPayPalBalances, PayPalError } from "./paypal.ts";
import { isStripeConfigured, listStripeBalances, StripeError } from "./stripe.ts";
import { isVivaConfigured, listVivaWallets, VivaError } from "./viva.ts";
import { isWiseConfigured, listWiseBalances, WiseError } from "./wise.ts";
import { isMercuryConfigured, listMercuryAccounts, MercuryError } from "./mercury.ts";
import { ebLog } from "./eb-log.ts";
import { buildSheetBalancePayload } from "./sheet-balances.ts";
import { resolveStripeInTransit } from "./stripe-in-transit.ts";
import { postSheetsWebhook } from "./sheets-webhook.ts";
import { fetchRatesToUsd } from "./fx.ts";

export interface BalanceRow {
  date: string;
  source: "enablebanking" | "viva" | "airwallex" | "stripe" | "paypal" | "wise" | "mercury";
  bank?: string;
  account: string;
  uid: string;
  iban?: string;
  currency: string;
  booked?: number;
  available?: number;
  error?: string;
  cached?: boolean;
  fetchedAt?: string;
}

export interface FetchBalanceOpts {
  force?: boolean;
  refreshUid?: string;
}

const SOURCE_TIMEOUT_MS = 20_000;

type RowBase = Omit<BalanceRow, "date" | "uid" | "booked" | "available" | "error" | "cached" | "fetchedAt">;

function shouldFetch(uid: string, date: string, opts: FetchBalanceOpts): boolean {
  if (opts.force) return true;
  if (opts.refreshUid === uid) return true;
  return !getCachedBalance(uid, date);
}

function rowFromCache(date: string, uid: string, base: RowBase, cached: CachedBalance): BalanceRow {
  return {
    date,
    ...base,
    uid,
    booked: cached.booked,
    available: cached.available,
    currency: cached.currency ?? base.currency,
    cached: true,
    fetchedAt: cached.fetchedAt,
  };
}

function storeRow(uid: string, row: BalanceRow, date: string): BalanceRow {
  if (row.error) return row;
  setCachedBalance(uid, { date, booked: row.booked, available: row.available, currency: row.currency });
  return { ...row, cached: false, fetchedAt: new Date().toISOString() };
}

function cachedRowsForPrefix(prefix: string, date: string, labelForUid: (uid: string, cached: CachedBalance) => RowBase): BalanceRow[] {
  const file = join(config.dataDir, "balance-cache.json");
  if (!existsSync(file)) return [];
  const data = JSON.parse(readFileSync(file, "utf8")) as { accounts?: Record<string, CachedBalance> };
  const rows: BalanceRow[] = [];
  for (const [uid, cached] of Object.entries(data.accounts ?? {})) {
    if (!uid.startsWith(prefix) || cached.date !== date) continue;
    rows.push(rowFromCache(date, uid, labelForUid(uid, cached), cached));
  }
  return rows;
}

function sourceUsesCacheOnly(prefix: string, opts: FetchBalanceOpts): boolean {
  return !opts.force && (!opts.refreshUid || !opts.refreshUid.startsWith(prefix));
}

async function withTimeout<T>(label: string, work: Promise<T>, ms = SOURCE_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

function ebErrorMessage(err: unknown): string {
  if (err instanceof EnableBankingError) {
    const detail = err.body.slice(0, 120).replace(/\s+/g, " ").trim();
    return `${err.status}${err.consentGone ? " (consent expired)" : ""}${detail ? `: ${detail}` : ""}`;
  }
  return (err as Error).message;
}

async function ensureStoredAccount(accountUid: string, sessionId: string, skipApi = false): Promise<StoredAccount | undefined> {
  const s = store();
  let stored = s.account(accountUid);
  if (stored && accountDisplayName(stored) !== accountUid) return stored;
  if (skipApi) return stored;

  try {
    const details = await eb.getAccount(accountUid);
    s.update((d) => {
      const existing = d.accounts[accountUid];
      d.accounts[accountUid] = {
        uid: accountUid,
        session_id: sessionId,
        name: details.name ?? existing?.name,
        product: details.product ?? existing?.product,
        iban: details.account_id?.iban ?? existing?.iban,
        other_id: details.account_id?.other?.identification ?? existing?.other_id,
        currency: details.currency ?? existing?.currency ?? "EUR",
        cash_account_type: details.cash_account_type ?? existing?.cash_account_type,
        identification_hash: details.identification_hash ?? existing?.identification_hash ?? accountUid,
        label: existing?.label,
        last_polled: existing?.last_polled,
      };
    });
    stored = s.account(accountUid);
  } catch {
    return stored;
  }
  return stored;
}

async function fetchEnableBankingAccountRow(date: string, accountUid: string, bank: string, sessionId: string, opts: FetchBalanceOpts): Promise<BalanceRow> {
  const s = store();
  const useCache = !shouldFetch(accountUid, date, opts);
  const stored = await ensureStoredAccount(accountUid, sessionId, useCache);
  const session = s.data.sessions[sessionId];
  const account = stored ? accountDisplayName(stored) : accountUid;
  const base: RowBase = {
    source: "enablebanking",
    bank,
    account,
    iban: stored?.iban,
    currency: stored?.currency ?? "EUR",
  };

  if (session && daysLeft(session.valid_until) < 0) {
    return { date, ...base, uid: accountUid, error: "Consent expired — reconnect via /connect" };
  }

  const cached = getCachedBalance(accountUid, date);
  if (useCache && cached) return rowFromCache(date, accountUid, base, cached);

  try {
    const balances = simplifyBalances(await withTimeout(`Enable Banking ${bank} ${account}`, eb.getBalances(accountUid), 15_000));
    return storeRow(accountUid, {
      date,
      ...base,
      uid: accountUid,
      currency: stored?.currency ?? balances.currency ?? "EUR",
      booked: balances.booked,
      available: balances.available,
    }, date);
  } catch (err) {
    const error = ebErrorMessage(err);
    ebLog("fetch.getBalances.fail", { sessionId: sessionId, label: bank, accountUid, account, error });
    if (cached) return rowFromCache(date, accountUid, base, cached);
    return { date, ...base, uid: accountUid, error };
  }
}

function isEbWiseSession(session: { bank: { name: string } }): boolean {
  return session.bank.name.toLowerCase() === "wise";
}

async function fetchEnableBankingBalances(date: string, opts: FetchBalanceOpts): Promise<BalanceRow[]> {
  const s = store();
  const sessions = s.sessions().filter((session) => !(isWiseConfigured() && isEbWiseSession(session)));
  if (!sessions.length) return [];

  const rows: BalanceRow[] = [];
  const seenUids = new Set<string>();

  for (const session of sessions) {
    const bank = sessionName(session);

    if (daysLeft(session.valid_until) < 0) {
      rows.push({ date, source: "enablebanking", bank, account: bank, uid: `session:${session.id}`, currency: "EUR", error: "Consent expired — reconnect via /connect" });
      continue;
    }

    let accountUids = s.accounts().filter((a) => a.session_id === session.id).map((a) => a.uid);
    const needsSession = opts.force || !accountUids.length || (!!opts.refreshUid && accountUids.includes(opts.refreshUid));
    if (needsSession) {
      try {
        const status = await withTimeout(`Enable Banking ${bank} session`, eb.getSession(session.id), 15_000);
        accountUids = status.accounts ?? accountUids;
        ebLog("fetch.getSession", { sessionId: session.id, label: bank, accountUids, status: status.status });
      } catch (err) {
        const error = ebErrorMessage(err);
        ebLog("fetch.getSession.fail", { sessionId: session.id, label: bank, error });
        if (!accountUids.length) {
          rows.push({ date, source: "enablebanking", bank, account: bank, uid: `session:${session.id}`, currency: "EUR", error });
          continue;
        }
      }
    }

    if (!accountUids.length) {
      ebLog("fetch.noAccounts", { sessionId: session.id, label: bank });
      rows.push({ date, source: "enablebanking", bank, account: bank, uid: `session:${session.id}:empty`, currency: "EUR", error: "No accounts returned by bank" });
      continue;
    }

    for (const uid of accountUids) {
      seenUids.add(uid);
      rows.push(await fetchEnableBankingAccountRow(date, uid, bank, session.id, opts));
    }
  }

  for (const account of s.accounts()) {
    if (seenUids.has(account.uid)) continue;
    const session = s.data.sessions[account.session_id];
    if (session && isWiseConfigured() && isEbWiseSession(session)) continue;
    rows.push(await fetchEnableBankingAccountRow(date, account.uid, session ? sessionName(session) : "Enable Banking", account.session_id, opts));
  }

  return rows;
}

async function fetchVivaBalances(date: string, opts: FetchBalanceOpts): Promise<BalanceRow[]> {
  if (!isVivaConfigured()) return [];
  if (sourceUsesCacheOnly("viva:", opts)) {
    const cached = cachedRowsForPrefix("viva:", date, (uid, c) => ({
      source: "viva",
      account: uid.replace(/^viva:/, "Viva "),
      currency: c.currency ?? "EUR",
    }));
    if (cached.length) return cached;
  }
  try {
    const wallets = await listVivaWallets();
    return wallets.map((wallet) => {
      const uid = `viva:${wallet.walletId}`;
      const base: RowBase = {
        source: "viva",
        account: wallet.friendlyName ?? `Viva wallet ${wallet.walletId}`,
        iban: wallet.iban,
        currency: wallet.currency,
      };
      const cached = getCachedBalance(uid, date);
      if (!shouldFetch(uid, date, opts) && cached) return rowFromCache(date, uid, base, cached);
      return storeRow(uid, { date, ...base, uid, booked: wallet.available, available: wallet.available }, date);
    });
  } catch (err) {
    const msg = err instanceof VivaError ? `${err.status}` : (err as Error).message;
    return [{ date, source: "viva", account: "Viva", uid: "viva:error", currency: "EUR", error: msg }];
  }
}

async function fetchAirwallexBalances(date: string, opts: FetchBalanceOpts): Promise<BalanceRow[]> {
  if (!isAirwallexConfigured()) return [];
  if (sourceUsesCacheOnly("airwallex:", opts)) {
    const cached = cachedRowsForPrefix("airwallex:", date, (uid, c) => {
      const [, accountType, currency] = uid.split(":");
      return { source: "airwallex", account: `Airwallex ${accountType}`, currency: currency ?? c.currency ?? "USD" };
    });
    if (cached.length) return cached;
  }
  try {
    const balances = await listAirwallexBalances();
    return balances.map((b) => {
      const uid = `airwallex:${b.accountType}:${b.currency}`;
      const base: RowBase = { source: "airwallex", account: `Airwallex ${b.accountType}`, currency: b.currency };
      const cached = getCachedBalance(uid, date);
      if (!shouldFetch(uid, date, opts) && cached) return rowFromCache(date, uid, base, cached);
      return storeRow(uid, { date, ...base, uid, booked: b.available, available: b.available }, date);
    });
  } catch (err) {
    const msg = err instanceof AirwallexError ? `${err.status}: ${(() => { try { return JSON.parse(err.body).code ?? err.body.slice(0, 120); } catch { return err.body.slice(0, 120); } })()}` : (err as Error).message;
    return [{ date, source: "airwallex", account: "Airwallex", uid: "airwallex:error", currency: "USD", error: msg }];
  }
}

async function fetchStripeBalances(date: string, opts: FetchBalanceOpts): Promise<BalanceRow[]> {
  if (!isStripeConfigured()) return [];
  if (sourceUsesCacheOnly("stripe:", opts)) {
    const cached = cachedRowsForPrefix("stripe:", date, (uid, c) => ({
      source: "stripe",
      account: uid.includes(":pending:") ? "Stripe pending" : "Stripe available",
      currency: c.currency ?? uid.split(":").pop() ?? "USD",
    }));
    if (cached.length) return cached;
  }
  try {
    const balances = await listStripeBalances();
    return balances.flatMap((b) => {
      const out: BalanceRow[] = [];
      const availableUid = `stripe:available:${b.currency}`;
      const availableBase: RowBase = { source: "stripe", account: "Stripe available", currency: b.currency };
      const availableCached = getCachedBalance(availableUid, date);
      if (!shouldFetch(availableUid, date, opts) && availableCached) {
        out.push(rowFromCache(date, availableUid, availableBase, availableCached));
      } else {
        out.push(storeRow(availableUid, { date, ...availableBase, uid: availableUid, booked: b.available, available: b.available }, date));
      }
      if (b.pending !== 0) {
        const pendingUid = `stripe:pending:${b.currency}`;
        const pendingBase: RowBase = { source: "stripe", account: "Stripe pending", currency: b.currency };
        const pendingCached = getCachedBalance(pendingUid, date);
        if (!shouldFetch(pendingUid, date, opts) && pendingCached) {
          out.push(rowFromCache(date, pendingUid, pendingBase, pendingCached));
        } else {
          out.push(storeRow(pendingUid, { date, ...pendingBase, uid: pendingUid, booked: b.pending, available: b.pending }, date));
        }
      }
      return out;
    });
  } catch (err) {
    const msg = err instanceof StripeError ? `${err.status}: ${(() => { try { return JSON.parse(err.body).error?.message ?? err.body.slice(0, 120); } catch { return err.body.slice(0, 120); } })()}` : (err as Error).message;
    return [{ date, source: "stripe", account: "Stripe", uid: "stripe:error", currency: "USD", error: msg }];
  }
}

async function fetchWiseBalances(date: string, opts: FetchBalanceOpts): Promise<BalanceRow[]> {
  if (!isWiseConfigured()) return [];
  if (sourceUsesCacheOnly("wise:", opts)) {
    const cached = cachedRowsForPrefix("wise:", date, (uid, c) => {
      const currency = uid.split(":").pop() ?? c.currency ?? "USD";
      return { source: "wise", account: `Wise · ${currency}`, currency };
    });
    if (cached.length) return cached;
  }
  try {
    const { profileId, profileLabel, balances } = await listWiseBalances();
    return balances.map((b) => {
      const uid = `wise:${profileId}:${b.currency}`;
      const base: RowBase = {
        source: "wise",
        account: b.name ? `${profileLabel} · ${b.name}` : `${profileLabel} · ${b.currency}`,
        currency: b.currency,
      };
      const cached = getCachedBalance(uid, date);
      if (!shouldFetch(uid, date, opts) && cached) return rowFromCache(date, uid, base, cached);
      return storeRow(uid, { date, ...base, uid, booked: b.available, available: b.available }, date);
    });
  } catch (err) {
    const msg = err instanceof WiseError ? `${err.status}: ${err.body.slice(0, 120)}` : (err as Error).message;
    return [{ date, source: "wise", account: "Wise", uid: "wise:error", currency: "USD", error: msg }];
  }
}

async function fetchMercuryBalances(date: string, opts: FetchBalanceOpts): Promise<BalanceRow[]> {
  if (!isMercuryConfigured()) return [];
  if (sourceUsesCacheOnly("mercury:", opts)) {
    const cached = cachedRowsForPrefix("mercury:", date, (uid, c) => {
      const id = uid.slice("mercury:".length);
      return { source: "mercury", account: `Mercury · ${id.slice(0, 8)}`, currency: c.currency ?? "USD" };
    });
    if (cached.length) return cached;
  }
  try {
    const accounts = await listMercuryAccounts();
    return accounts.map((a) => {
      const uid = `mercury:${a.id}`;
      const label = a.nickname?.trim() || a.name?.trim() || "Mercury";
      const base: RowBase = { source: "mercury", account: label, currency: "USD" };
      const cached = getCachedBalance(uid, date);
      if (!shouldFetch(uid, date, opts) && cached) return rowFromCache(date, uid, base, cached);
      return storeRow(uid, { date, ...base, uid, booked: a.currentBalance, available: a.availableBalance }, date);
    });
  } catch (err) {
    const msg = err instanceof MercuryError ? `${err.status}: ${err.body.slice(0, 120)}` : (err as Error).message;
    return [{ date, source: "mercury", account: "Mercury", uid: "mercury:error", currency: "USD", error: msg }];
  }
}

async function fetchPayPalBalances(date: string, opts: FetchBalanceOpts): Promise<BalanceRow[]> {
  if (!isPayPalConfigured()) return [];
  if (sourceUsesCacheOnly("paypal:", opts)) {
    const cached = cachedRowsForPrefix("paypal:", date, (uid, c) => ({
      source: "paypal",
      account: "PayPal available",
      currency: c.currency ?? uid.split(":").pop() ?? "USD",
    }));
    if (cached.length) return cached;
  }
  try {
    const balances = await listPayPalBalances();
    return balances.map((b) => {
      const uid = `paypal:available:${b.currency}`;
      const base: RowBase = { source: "paypal", account: "PayPal available", currency: b.currency };
      const cached = getCachedBalance(uid, date);
      if (!shouldFetch(uid, date, opts) && cached) return rowFromCache(date, uid, base, cached);
      return storeRow(uid, { date, ...base, uid, booked: b.available, available: b.available }, date);
    });
  } catch (err) {
    const msg = err instanceof PayPalError ? `${err.status}: ${(() => { try { return JSON.parse(err.body).message ?? err.body.slice(0, 120); } catch { return err.body.slice(0, 120); } })()}` : (err as Error).message;
    return [{ date, source: "paypal", account: "PayPal", uid: "paypal:error", currency: "USD", error: msg }];
  }
}

async function fetchSource(label: string, source: BalanceRow["source"], currency: string, work: Promise<BalanceRow[]>): Promise<BalanceRow[]> {
  try {
    return await withTimeout(label, work);
  } catch (err) {
    return [{ date: athensDate(), source, account: label, uid: `${source}:timeout`, currency, error: (err as Error).message }];
  }
}

export async function fetchAllBalances(opts: FetchBalanceOpts = {}): Promise<{ rows: BalanceRow[] }> {
  if (!isConfigured()) throw new Error("BankConnector is not configured yet.");

  const date = athensDate();
  const [ebRows, vivaRows, airwallexRows, stripeRows, paypalRows, wiseRows, mercuryRows] = await Promise.all([
    fetchSource("Enable Banking", "enablebanking", "EUR", fetchEnableBankingBalances(date, opts)),
    fetchSource("Viva", "viva", "EUR", fetchVivaBalances(date, opts)),
    fetchSource("Airwallex", "airwallex", "USD", fetchAirwallexBalances(date, opts)),
    fetchSource("Stripe", "stripe", "USD", fetchStripeBalances(date, opts)),
    fetchSource("PayPal", "paypal", "USD", fetchPayPalBalances(date, opts)),
    fetchSource("Wise", "wise", "USD", fetchWiseBalances(date, opts)),
    fetchSource("Mercury", "mercury", "USD", fetchMercuryBalances(date, opts)),
  ]);
  const rows = [...ebRows, ...vivaRows, ...airwallexRows, ...stripeRows, ...paypalRows, ...wiseRows, ...mercuryRows];

  if (!rows.length) {
    throw new Error("No accounts linked yet. Connect a bank or configure Viva/Airwallex/Stripe/PayPal/Wise/Mercury API credentials.");
  }

  return { rows };
}

export async function refreshBalanceByUid(uid: string): Promise<void> {
  await fetchAllBalances({ refreshUid: uid });
}

export async function prepareBalanceFill(): Promise<{
  rows: BalanceRow[];
  date: string;
  columns: ReturnType<typeof buildSheetBalancePayload>["columns"];
  fxDate?: string;
  eurUsdClose?: number;
  inTransit: Awaited<ReturnType<typeof resolveStripeInTransit>>;
}> {
  const [balanceResult, fx] = await Promise.all([
    fetchAllBalances({ force: true }),
    fetchRatesToUsd(["EUR", "USD", "GBP"]),
  ]);
  const { rows } = balanceResult;
  const payload = buildSheetBalancePayload(rows, fx);
  const inTransit = await resolveStripeInTransit(payload.date);
  return {
    rows,
    date: payload.date,
    columns: payload.columns,
    fxDate: payload.fxDate,
    eurUsdClose: payload.eurUsdClose,
    inTransit,
  };
}

export async function syncBalancesToSheet(): Promise<{ rows: BalanceRow[]; sheet: Record<string, unknown> }> {
  const prepared = await prepareBalanceFill();
  const sheet = await postSheetsWebhook({
    action: "fill",
    date: prepared.date,
    columns: prepared.columns,
    fxDate: prepared.fxDate,
    eurUsdClose: prepared.eurUsdClose,
    inTransit: prepared.inTransit,
  });
  return { rows: prepared.rows, sheet };
}
