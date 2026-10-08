// Read-only client for Stripe account balance.
// https://docs.stripe.com/api/balance/balance_retrieve
import { config } from "./config.ts";

export interface StripeBalance {
  currency: string;
  available: number;
  pending: number;
}

export class StripeError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Stripe API ${status}: ${body.slice(0, 300)}`);
    this.name = "StripeError";
    this.status = status;
    this.body = body;
  }
}

/** Stripe amounts are in the currency's smallest unit (cents for USD). */
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);
const THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

function fromStripeAmount(amount: number, currency: string): number {
  const c = currency.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return amount;
  if (THREE_DECIMAL.has(c)) return amount / 1000;
  return amount / 100;
}

export function isStripeConfigured(): boolean {
  return Boolean(config.stripeSecretKey);
}

async function stripeGet(path: string): Promise<unknown> {
  const res = await fetch(`${config.stripeApiBase}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.stripeSecretKey}`,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new StripeError(res.status, text);
  return text ? JSON.parse(text) : {};
}

export async function listStripeBalances(): Promise<StripeBalance[]> {
  if (!isStripeConfigured()) return [];
  const data = (await stripeGet("/v1/balance")) as {
    available?: { amount: number; currency: string }[];
    pending?: { amount: number; currency: string }[];
  };
  const byCurrency = new Map<string, StripeBalance>();
  for (const entry of data.available ?? []) {
    const currency = entry.currency.toUpperCase();
    const row = byCurrency.get(currency) ?? { currency, available: 0, pending: 0 };
    row.available += fromStripeAmount(entry.amount, currency);
    byCurrency.set(currency, row);
  }
  for (const entry of data.pending ?? []) {
    const currency = entry.currency.toUpperCase();
    const row = byCurrency.get(currency) ?? { currency, available: 0, pending: 0 };
    row.pending += fromStripeAmount(entry.amount, currency);
    byCurrency.set(currency, row);
  }
  return [...byCurrency.values()].filter((b) => b.available !== 0 || b.pending !== 0);
}

/** USD available + pending (matches Balances Stripe col convention). */
export async function stripeUsdTotalNow(): Promise<number> {
  const rows = await listStripeBalances();
  const usd = rows.find((b) => b.currency === "USD");
  if (!usd) return 0;
  return Math.round((usd.available + usd.pending) * 100) / 100;
}

/** Month-end history comes from the Reporting API — see `stripe-reports.ts`. */
