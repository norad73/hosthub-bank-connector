// Read-only client for Airwallex balances.
// https://www.airwallex.com/docs/api/authentication/api_access_token/login
import { config } from "./config.ts";

export interface AirwallexBalance {
  accountType: string;
  currency: string;
  available: number;
  pending?: number;
  reserved?: number;
  total?: number;
}

export class AirwallexError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Airwallex API ${status}: ${body.slice(0, 300)}`);
    this.name = "AirwallexError";
    this.status = status;
    this.body = body;
  }
}

let cachedToken: { token: string; expiresAt: number } | undefined;

export function isAirwallexConfigured(): boolean {
  return Boolean(config.airwallexClientId && config.airwallexApiKey);
}

function pickNumber(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined && v !== null && v !== "") return Number(v);
  }
  return undefined;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

function normalizeBalance(raw: Record<string, unknown>): AirwallexBalance | undefined {
  const currency = pickString(raw, "currency");
  const available = pickNumber(raw, "available_amount", "availableAmount");
  if (!currency || available === undefined) return undefined;
  return {
    accountType: pickString(raw, "account_type", "accountType") ?? "cash",
    currency,
    available,
    pending: pickNumber(raw, "pending_amount", "pendingAmount"),
    reserved: pickNumber(raw, "reserved_amount", "reservedAmount"),
    total: pickNumber(raw, "total_amount", "totalAmount"),
  };
}

async function loginForToken(useLoginAs: boolean): Promise<{ token: string; expiresAt: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": "0",
    "x-client-id": config.airwallexClientId,
    "x-api-key": config.airwallexApiKey,
  };
  if (useLoginAs && config.airwallexAccountId) headers["x-login-as"] = config.airwallexAccountId;

  const res = await fetch(`${config.airwallexApiBase}/api/v1/authentication/login`, {
    method: "POST",
    headers,
    body: "",
  });
  const text = await res.text();
  if (!res.ok) throw new AirwallexError(res.status, text);

  const data = JSON.parse(text) as { token?: string; expires_at?: string };
  if (!data.token) throw new AirwallexError(res.status, text);
  const expiresAt = data.expires_at ? Date.parse(data.expires_at) : Date.now() + 30 * 60_000;
  return { token: data.token, expiresAt };
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const accountId = config.airwallexAccountId;
  const attempts: boolean[] = accountId ? [true, false] : [false];
  let lastErr: AirwallexError | undefined;

  for (const useLoginAs of attempts) {
    try {
      const { token, expiresAt } = await loginForToken(useLoginAs);
      cachedToken = { token, expiresAt };
      if (accountId && !useLoginAs) {
        console.log("[bank] airwallex: login OK without x-login-as (check AIRWALLEX_ACCOUNT_ID on Render)");
      }
      return token;
    } catch (err) {
      if (err instanceof AirwallexError && err.status === 403 && useLoginAs && attempts.length > 1) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new AirwallexError(403, "login failed");
}

async function authHeaders(opts?: { contentType?: string; accept?: string }): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Accept: opts?.accept ?? "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (opts?.contentType) headers["Content-Type"] = opts.contentType;
  return headers;
}

async function airwallexGet(path: string): Promise<unknown> {
  const res = await fetch(`${config.airwallexApiBase}${path}`, { headers: await authHeaders() });
  const text = await res.text();
  if (!res.ok) throw new AirwallexError(res.status, text);
  return text ? JSON.parse(text) : {};
}

async function airwallexGetText(path: string, accept = "*/*"): Promise<string> {
  const res = await fetch(`${config.airwallexApiBase}${path}`, { headers: await authHeaders({ accept }) });
  const text = await res.text();
  if (!res.ok) throw new AirwallexError(res.status, text);
  return text;
}

async function airwallexPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${config.airwallexApiBase}${path}`, {
    method: "POST",
    headers: await authHeaders({ contentType: "application/json" }),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new AirwallexError(res.status, text);
  return text ? JSON.parse(text) : {};
}

export async function listAirwallexBalances(): Promise<AirwallexBalance[]> {
  if (!isAirwallexConfigured()) return [];
  const data = await airwallexGet("/api/v1/balances/current");
  const list = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  return list.map(normalizeBalance).filter((b): b is AirwallexBalance => Boolean(b));
}

export interface AirwallexFinancialTransaction {
  id: string;
  amount: number;
  batch_id?: string;
  client_rate?: number;
  created_at: string;
  currency: string;
  currency_pair?: string;
  description?: string;
  estimated_settled_at?: string;
  fee?: number;
  funding_source_id?: string;
  net: number;
  settled_at?: string;
  source_id?: string;
  source_type?: string;
  status: string;
  transaction_type: string;
}

export async function listAirwallexFinancialTransactions(opts: {
  currency?: string;
  fromCreatedAt?: string;
  toCreatedAt?: string;
  pageSize?: number;
  pageNum?: number;
} = {}): Promise<{ items: AirwallexFinancialTransaction[]; hasMore: boolean }> {
  if (!isAirwallexConfigured()) return { items: [], hasMore: false };
  const params = new URLSearchParams();
  if (opts.currency) params.set("currency", opts.currency);
  if (opts.fromCreatedAt) params.set("from_created_at", opts.fromCreatedAt);
  if (opts.toCreatedAt) params.set("to_created_at", opts.toCreatedAt);
  params.set("page_size", String(opts.pageSize ?? 10));
  params.set("page_num", String(opts.pageNum ?? 0));
  const data = (await airwallexGet(`/api/v1/financial_transactions?${params}`)) as {
    items?: AirwallexFinancialTransaction[];
    has_more?: boolean;
  };
  return { items: data.items ?? [], hasMore: Boolean(data.has_more) };
}

export interface AirwallexFinancialReport {
  id: string;
  status: string;
  type: string;
  file_format?: string;
  file_name?: string;
}

export async function createBalanceActivityReport(opts: {
  currency: string;
  fromDate: string;
  toDate: string;
  timeZone?: string;
}): Promise<AirwallexFinancialReport> {
  if (!isAirwallexConfigured()) throw new AirwallexError(503, "Airwallex not configured");
  const data = (await airwallexPost("/api/v1/finance/financial_reports/create", {
    type: "BALANCE_ACTIVITY_REPORT",
    file_format: "CSV",
    file_name: `BALANCE_ACTIVITY_REPORT_${opts.currency}_${opts.toDate}.csv`,
    currencies: [opts.currency],
    from_created_at: opts.fromDate,
    to_created_at: opts.toDate,
    time_zone: opts.timeZone ?? "UTC",
    report_version: "1.2.0",
    report_options: { include_reservations: false },
  })) as AirwallexFinancialReport;
  if (!data.id) throw new AirwallexError(500, "Report create returned no id");
  return data;
}

export async function getFinancialReport(id: string): Promise<AirwallexFinancialReport> {
  return (await airwallexGet(`/api/v1/finance/financial_reports/${encodeURIComponent(id)}`)) as AirwallexFinancialReport;
}

export async function downloadFinancialReportContent(id: string): Promise<string> {
  // CSV reports return text/plain; Accept: application/json yields 406.
  return airwallexGetText(`/api/v1/finance/financial_reports/${encodeURIComponent(id)}/content`, "text/plain, */*");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchBalanceActivityReportCsv(opts: {
  currency: string;
  fromDate: string;
  toDate: string;
  timeZone?: string;
  pollMs?: number;
  timeoutMs?: number;
}): Promise<{ report: AirwallexFinancialReport; csv: string }> {
  const report = await createBalanceActivityReport(opts);
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  let latest = report;
  while (Date.now() < deadline) {
    latest = await getFinancialReport(report.id);
    if (latest.status === "COMPLETED") {
      const csv = await downloadFinancialReportContent(report.id);
      return { report: latest, csv };
    }
    if (latest.status === "FAILED") throw new AirwallexError(500, `Report ${report.id} failed`);
    await sleep(opts.pollMs ?? 2000);
  }
  throw new AirwallexError(504, `Report ${report.id} timed out (status ${latest.status})`);
}
