// Stripe payouts that left Stripe but may not yet be in a destination bank API balance.
import { config } from "./config.ts";
import { isMercuryConfigured, listMercuryTransactions } from "./mercury.ts";
import { isStripeConfigured, StripeError } from "./stripe.ts";
import { isWiseConfigured, listWiseStatementTransactions } from "./wise.ts";

export interface StripeInTransitPayout {
  id: string;
  amountUsd: number;
  status: string;
  created: string;
  arrival: string;
}

function fromStripeAmount(amount: number): number {
  return Math.round(amount) / 100;
}

function isoDay(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

function dayNum(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
}

async function stripeGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.stripeApiBase}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${config.stripeSecretKey}` },
  });
  const text = await res.text();
  if (!res.ok) throw new StripeError(res.status, text);
  return JSON.parse(text) as Record<string, unknown>;
}

/** Credits from destination bank APIs (Wise / Mercury) — never from sheet tabs. */
export async function listDestinationApiCredits(asOfDate: string): Promise<{ day: string; amountUsd: number }[]> {
  const sinceMs = Date.parse(`${asOfDate}T00:00:00Z`) - 21 * 86_400_000;
  const postedStart = new Date(sinceMs).toISOString().slice(0, 10);
  const credits: { day: string; amountUsd: number }[] = [];

  if (isWiseConfigured()) {
    const txs = await listWiseStatementTransactions("USD", sinceMs);
    for (const t of txs) {
      if (t.amount <= 0) continue;
      const day = t.date.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      credits.push({ day, amountUsd: t.amount });
    }
  }

  if (isMercuryConfigured()) {
    const txs = await listMercuryTransactions({ postedStart, order: "asc" });
    for (const t of txs) {
      if (t.amount <= 0) continue;
      const raw = t.postedAt || t.createdAt;
      const day = String(raw).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      credits.push({ day, amountUsd: t.amount });
    }
  }

  return credits;
}

export async function resolveStripeInTransit(asOfDate: string): Promise<{
  amountUsd: number;
  note: string;
  items: StripeInTransitPayout[];
}> {
  const [payouts, credits] = await Promise.all([
    listStripeInTransitPayouts(asOfDate),
    listDestinationApiCredits(asOfDate),
  ]);
  const { amountUsd, items } = sumStripeInTransitPayouts(payouts, asOfDate, credits);
  return { amountUsd, note: formatStripeInTransitNote(items), items };
}

/** Payouts still at Stripe. `paid` is already in the destination bank API balance. */
export async function listStripeInTransitPayouts(asOfDate: string): Promise<StripeInTransitPayout[]> {
  if (!isStripeConfigured()) return [];
  const since = Math.floor(Date.parse(`${asOfDate}T00:00:00Z`) / 1000) - 21 * 86_400;
  const data = (await stripeGet(`/v1/payouts?limit=100&created[gte]=${since}`)) as {
    data?: { id: string; amount: number; currency: string; status: string; created: number; arrival_date: number }[];
  };
  const cut = dayNum(asOfDate);
  const out: StripeInTransitPayout[] = [];
  for (const p of data.data ?? []) {
    if (p.currency?.toLowerCase() !== "usd") continue;
    if (p.status === "failed" || p.status === "canceled") continue;
    const arrival = isoDay(p.arrival_date);
    if (dayNum(arrival) > cut) continue;
    if (p.status === "in_transit" || p.status === "pending") {
      // still at Stripe — not in a bank API balance yet
    } else continue;
    out.push({
      id: p.id,
      amountUsd: fromStripeAmount(p.amount),
      status: p.status,
      created: isoDay(p.created),
      arrival,
    });
  }
  return out.sort((a, b) => a.arrival.localeCompare(b.arrival) || a.id.localeCompare(b.id));
}

/** True when a bank credit matches this payout amount near its arrival date. */
export function stripePayoutCredited(
  payout: Pick<StripeInTransitPayout, "amountUsd" | "arrival">,
  credits: { day: string; amountUsd: number }[],
  windowDays = 10,
): boolean {
  const target = payout.amountUsd.toFixed(2);
  const arrivalN = dayNum(payout.arrival);
  return credits.some((c) => {
    if (c.amountUsd.toFixed(2) !== target || c.amountUsd <= 0) return false;
    const gap = Math.abs(dayNum(c.day) - arrivalN);
    return gap <= windowDays;
  });
}

export function sumStripeInTransitPayouts(
  payouts: StripeInTransitPayout[],
  asOfDate: string,
  credits: { day: string; amountUsd: number }[],
): { amountUsd: number; items: StripeInTransitPayout[] } {
  const cut = dayNum(asOfDate);
  const items = payouts.filter((p) => {
    if (dayNum(p.arrival) > cut) return false;
    if (stripePayoutCredited(p, credits)) return false;
    return p.status === "in_transit" || p.status === "pending";
  });
  const amountUsd = Math.round(items.reduce((s, p) => s + p.amountUsd, 0));
  return { amountUsd, items };
}

export function formatStripeInTransitNote(items: StripeInTransitPayout[]): string {
  if (!items.length) return "";
  const lines = items.map(
    (p) => `• ${p.id}  ${p.status}  arrival ${p.arrival}  $${p.amountUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  );
  return `Stripe payout(s) in transit — left Stripe, not yet matched to a bank credit:\n${lines.join("\n")}\n\nAuto-filled by BankConnector.`;
}
