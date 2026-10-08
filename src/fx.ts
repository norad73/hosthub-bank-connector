// Live FX rates for balance USD equivalents (Frankfurter / ECB, no API key).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { athensDate } from "./data.ts";
import { config } from "./config.ts";

export interface FxRates {
  date: string;
  /** Multiply an amount in `currency` by this to get USD. */
  toUsd: Record<string, number>;
  /** Set when rates were carried from an older ECB date or disk cache. */
  fallback?: "historical" | "stored";
}

const HISTORICAL_LOOKBACK_DAYS = 10;

function fxDataDir(): string {
  return process.env.DATA_DIR ?? config.dataDir;
}

function fxCachePath(): string {
  return join(fxDataDir(), "fx-rates.json");
}

interface StoredFxRates {
  date: string;
  savedAt: string;
  toUsd: Record<string, number>;
}

function foreignCurrencies(currencies: string[]): string[] {
  return [...new Set(currencies.map((c) => c.toUpperCase()).filter((c) => c !== "USD"))];
}

function hasRatesFor(fx: FxRates, foreign: string[]): boolean {
  return foreign.every((c) => {
    const r = fx.toUsd[c];
    return r !== undefined && r > 0;
  });
}

function parseFrankfurterResponse(data: { date?: string; rates?: Record<string, number> }): FxRates {
  const toUsd: Record<string, number> = { USD: 1 };
  for (const [cur, perUsd] of Object.entries(data.rates ?? {})) {
    if (perUsd > 0) toUsd[cur.toUpperCase()] = 1 / perUsd;
  }
  return { date: data.date ?? "", toUsd };
}

async function fetchFrankfurter(path: string, foreign: string[]): Promise<FxRates | undefined> {
  try {
    const res = await fetch(`https://api.frankfurter.app/${path}?from=USD&to=${foreign.join(",")}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { date?: string; rates?: Record<string, number> };
    const fx = parseFrankfurterResponse(data);
    return hasRatesFor(fx, foreign) ? fx : undefined;
  } catch {
    return undefined;
  }
}

function prevIsoDay(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function readStoredFxRates(): FxRates | undefined {
  try {
    const path = fxCachePath();
    if (!existsSync(path)) return undefined;
    const stored = JSON.parse(readFileSync(path, "utf8")) as StoredFxRates;
    if (!stored.date || !stored.toUsd) return undefined;
    return { date: stored.date, toUsd: { USD: 1, ...stored.toUsd } };
  } catch {
    return undefined;
  }
}

export function storeFxRates(fx: FxRates): void {
  const dir = fxDataDir();
  mkdirSync(dir, { recursive: true });
  const payload: StoredFxRates = {
    date: fx.date,
    savedAt: new Date().toISOString(),
    toUsd: { ...fx.toUsd },
  };
  writeFileSync(fxCachePath(), JSON.stringify(payload, null, 2), { mode: 0o600 });
}

/** Merge missing currencies from `fill` into `base` (mutates base.toUsd). */
export function mergeFxRates(base: FxRates, fill: FxRates | undefined, foreign: string[]): FxRates {
  if (!fill) return base;
  for (const c of foreign) {
    if (base.toUsd[c] === undefined && fill.toUsd[c] !== undefined) base.toUsd[c] = fill.toUsd[c];
  }
  if (!base.date && fill.date) base.date = fill.date;
  return base;
}

async function fetchHistoricalRates(foreign: string[], startDate: string): Promise<FxRates | undefined> {
  let day = startDate;
  for (let i = 0; i < HISTORICAL_LOOKBACK_DAYS; i++) {
    const fx = await fetchFrankfurter(day, foreign);
    if (fx) return { ...fx, fallback: "historical" };
    day = prevIsoDay(day);
  }
  return undefined;
}

export async function fetchRatesToUsd(currencies: string[]): Promise<FxRates | undefined> {
  const foreign = foreignCurrencies(currencies);
  if (!foreign.length) return { date: new Date().toISOString().slice(0, 10), toUsd: { USD: 1 } };

  let fx = await fetchFrankfurter("latest", foreign);
  if (fx && !hasRatesFor(fx, foreign)) fx = undefined;

  if (!fx) {
    const historical = await fetchHistoricalRates(foreign, athensDate());
    if (historical) {
      console.log(`[bank] fx: live rate unavailable, using Frankfurter ${historical.date}`);
      fx = historical;
    }
  }

  if (fx && !hasRatesFor(fx, foreign)) {
    mergeFxRates(fx, readStoredFxRates(), foreign);
  }

  if (!fx || !hasRatesFor(fx, foreign)) {
    const stored = readStoredFxRates();
    if (stored && hasRatesFor(stored, foreign)) {
      console.log(`[bank] fx: using stored rates from ${stored.date}`);
      fx = { date: stored.date, toUsd: { ...stored.toUsd }, fallback: "stored" };
    }
  }

  if (fx && hasRatesFor(fx, foreign)) {
    storeFxRates(fx);
    return fx;
  }

  return undefined;
}

export function amountInUsd(amount: number | undefined, currency: string, fx: FxRates | undefined): number | undefined {
  if (amount === undefined || !fx) return undefined;
  const rate = fx.toUsd[currency.toUpperCase()];
  if (rate === undefined) return undefined;
  return amount * rate;
}
