// Read-only client for Wise balance accounts via personal API token.
// https://docs.wise.com/api-reference/balance
import { config } from "./config.ts";

export interface WiseBalance {
  id: number;
  currency: string;
  available: number;
  name?: string;
}

export class WiseError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Wise API ${status}: ${body.slice(0, 300)}`);
    this.name = "WiseError";
    this.status = status;
    this.body = body;
  }
}

interface WiseProfile {
  id: number;
  type: string;
  details?: { name?: string; firstName?: string; lastName?: string };
}

interface WiseBalanceResponse {
  id: number;
  currency: string;
  amount?: { value?: number | string };
  cashAmount?: { value?: number | string };
  name?: string | null;
}

export function isWiseConfigured(): boolean {
  return Boolean(config.wiseApiToken);
}

async function wiseGet<T>(path: string): Promise<T> {
  const res = await fetch(`${config.wiseApiBase}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.wiseApiToken}`,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new WiseError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

async function resolveProfileId(): Promise<{ id: number; label: string }> {
  if (config.wiseProfileId) {
    return { id: Number(config.wiseProfileId), label: config.wiseAccountLabel || "Wise" };
  }
  const profiles = await wiseGet<WiseProfile[]>("/v1/profiles");
  const business = profiles.find((p) => p.type === "business");
  const profile = business ?? profiles[0];
  if (!profile) throw new WiseError(404, "No Wise profile found");
  const label = profile.details?.name
    ?? ([profile.details?.firstName, profile.details?.lastName].filter(Boolean).join(" ") || "Wise");
  return { id: profile.id, label };
}

export async function listWiseBalances(): Promise<{ profileId: number; profileLabel: string; balances: WiseBalance[] }> {
  if (!isWiseConfigured()) return { profileId: 0, profileLabel: "Wise", balances: [] };
  const { id, label } = await resolveProfileId();
  const data = await wiseGet<WiseBalanceResponse[]>(`/v4/profiles/${id}/balances?types=STANDARD`);
  const balances = data.map((b) => ({
    id: b.id,
    currency: b.currency.toUpperCase(),
    available: Number(b.amount?.value ?? b.cashAmount?.value ?? 0),
    name: b.name?.trim() || undefined,
  }));
  return { profileId: id, profileLabel: label, balances };
}

export interface WiseStatementTransaction {
  referenceNumber: string;
  type: string;
  date: string;
  amount: number;
  currency: string;
  totalFees: number;
  description: string;
  paymentReference: string;
  runningBalance?: number;
  exchangeFrom: string;
  exchangeTo: string;
  exchangeRate: string;
  payerName: string;
  payeeName: string;
  payeeAccountNumber: string;
  merchant: string;
  exchangeToAmount: string;
  detailsType: string;
}

function wiseMoney(raw: { value?: number | string; currency?: string } | undefined): number {
  const n = Number(raw?.value);
  return Number.isFinite(n) ? n : 0;
}

export type WiseCurrency = "USD" | "EUR" | "GBP";

export async function listWiseStatementTransactions(
  currency: WiseCurrency,
  sinceMs = 0,
): Promise<WiseStatementTransaction[]> {
  if (!isWiseConfigured()) return [];
  const { profileId, balances } = await listWiseBalances();
  const balance = balances.find((b) => b.currency === currency);
  if (!balance) return [];

  const end = new Date();
  const start = sinceMs > 0 ? new Date(sinceMs) : new Date(end.getTime() - 120 * 86_400_000);
  const params = new URLSearchParams({
    currency,
    intervalStart: start.toISOString(),
    intervalEnd: end.toISOString(),
    type: "COMPACT",
  });
  const data = await wiseGet<{ transactions?: Array<Record<string, unknown>> }>(
    `/v1/profiles/${profileId}/balance-statements/${balance.id}/statement.json?${params}`,
  );
  return (data.transactions ?? []).map((raw) => mapWiseStatementTransaction(raw, currency)).filter((t): t is WiseStatementTransaction => Boolean(t));
}

function mapWiseStatementTransaction(raw: Record<string, unknown>, currency: string): WiseStatementTransaction | null {
  const details = (raw.details as Record<string, unknown> | undefined) ?? {};
  const exchange = (raw.exchangeDetails as Record<string, unknown> | undefined) ?? {};
  const referenceNumber = String(details.referenceNumber ?? raw.referenceNumber ?? "").trim();
  if (!referenceNumber) return null;
  const date = String(raw.date ?? "");
  return {
    referenceNumber,
    type: String(raw.type ?? ""),
    date,
    amount: wiseMoney(raw.amount as { value?: number | string }),
    currency: String((raw.amount as { currency?: string } | undefined)?.currency ?? currency).toUpperCase(),
    totalFees: wiseMoney(raw.totalFees as { value?: number | string }),
    description: String(details.description ?? "").trim(),
    paymentReference: String(details.paymentReference ?? "").trim(),
    runningBalance: raw.runningBalance ? wiseMoney(raw.runningBalance as { value?: number | string }) : undefined,
    exchangeFrom: String(exchange.fromCurrency ?? exchange.from ?? "").trim(),
    exchangeTo: String(exchange.toCurrency ?? exchange.to ?? "").trim(),
    exchangeRate: String(exchange.rate ?? "").trim(),
    payerName: String(details.senderName ?? details.payerName ?? "").trim(),
    payeeName: String(details.recipientName ?? details.payeeName ?? "").trim(),
    payeeAccountNumber: String(details.recipientAccountNumber ?? details.payeeAccountNumber ?? "").trim(),
    merchant: String(details.merchant ?? "").trim(),
    exchangeToAmount: exchange.toAmount ? String(wiseMoney(exchange.toAmount as { value?: number | string })) : "",
    detailsType: String(details.type ?? "").trim(),
  };
}
