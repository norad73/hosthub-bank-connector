// Read-only client for the Viva Wallet legacy API (Basic Auth).
// https://developer.viva.com/apis-for-payments/wallet-api/
import { config } from "./config.ts";

export interface VivaWallet {
  walletId: number;
  friendlyName?: string;
  currency: string;
  available: number;
  pending?: number;
  reserved?: number;
  iban?: string;
}

export class VivaError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Viva API ${status}: ${body.slice(0, 300)}`);
    this.name = "VivaError";
    this.status = status;
    this.body = body;
  }
}

function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
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
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

const ISO_NUMERIC_CURRENCY: Record<string, string> = {
  "978": "EUR",
  "840": "USD",
  "826": "GBP",
};

function currencyCode(raw: Record<string, unknown>): string | undefined {
  const code = pickString(raw, "CurrencyCode", "currencyCode", "currency");
  if (!code) return undefined;
  return ISO_NUMERIC_CURRENCY[code] ?? code;
}

function normalizeWallet(raw: Record<string, unknown>): VivaWallet | undefined {
  const walletId = pickNumber(raw, "WalletId", "walletId", "Id", "id");
  const currency = currencyCode(raw);
  const available = pickNumber(raw, "Available", "available", "Amount", "amount");
  if (walletId === undefined || !currency || available === undefined) return undefined;
  return {
    walletId,
    friendlyName: pickString(raw, "FriendlyName", "friendlyName", "Name", "name"),
    currency,
    available,
    pending: pickNumber(raw, "Pending", "pending"),
    reserved: pickNumber(raw, "Reserved", "reserved"),
    iban: pickString(raw, "Iban", "iban"),
  };
}

export function isVivaConfigured(): boolean {
  return Boolean(config.vivaBasicUser && config.vivaBasicPassword);
}

export function isVivaAccountTransactionsConfigured(): boolean {
  return Boolean(config.vivaAccountClientId && config.vivaAccountClientSecret);
}

export function isVivaDataServicesConfigured(): boolean {
  return Boolean(config.vivaDataServicesClientId && config.vivaDataServicesClientSecret);
}

async function vivaGet(path: string): Promise<unknown> {
  const res = await fetch(`${config.vivaApiBase}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: basicAuth(config.vivaBasicUser, config.vivaBasicPassword),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new VivaError(res.status, text);
  return text ? JSON.parse(text) : {};
}

export async function listVivaWallets(): Promise<VivaWallet[]> {
  if (!isVivaConfigured()) return [];
  const data = await vivaGet("/api/wallets");
  const list = (Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown>).Wallets)
      ? (data as Record<string, unknown>).Wallets
      : Array.isArray((data as Record<string, unknown>).wallets)
        ? (data as Record<string, unknown>).wallets
        : [data]) as Record<string, unknown>[];
  return list.map(normalizeWallet).filter((w): w is VivaWallet => Boolean(w));
}

export interface VivaAccountTransaction {
  id: string;
  created: string;
  valueDate?: string;
  description: string;
  amount: number;
  balance?: number;
}

/** Labels for Search rows that omit description (CAS-05120514). */
const VIVA_SUBTYPE_LABEL: Record<number, string> = {
  4: "Fee - Money out to IBAN",
  5: "Fee - Sales commission",
  25: "Money in from IBAN",
  30: "Money out to IBAN",
  83: "Clearance - Cards",
  100: "Card purchase",
  140: "Wallet2Wallet Transfer",
  164: "Money out to IBAN",
  165: "Fee - Money out to IBAN",
};

/** Holds / releases — not cash ledger rows. Pair with CardPurchase etc. */
const VIVA_SKIP_SUBTYPES = new Set([
  101, 102, 103, 105, 106, 107, 109, 110, 111, 113, 114, 115, 143, 144, 147, 148, 157, 158, 162, 163, 198, 199,
]);

let cachedDataServicesToken: { token: string; expiresAt: number } | undefined;

async function vivaDataServicesAccessToken(): Promise<string> {
  if (!isVivaDataServicesConfigured()) {
    throw new VivaError(
      401,
      "Data Services credentials missing. Set VIVA_DATA_SERVICES_CLIENT_ID and VIVA_DATA_SERVICES_CLIENT_SECRET (issued by Viva, CAS-05120514).",
    );
  }
  if (cachedDataServicesToken && cachedDataServicesToken.expiresAt > Date.now() + 60_000) {
    return cachedDataServicesToken.token;
  }
  const res = await fetch(`${config.vivaAccountsBase}/connect/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(config.vivaDataServicesClientId, config.vivaDataServicesClientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const text = await res.text();
  if (!res.ok) throw new VivaError(res.status, text);
  const data = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new VivaError(res.status, text);
  cachedDataServicesToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

async function vivaDataServicesPost(path: string, body: Record<string, unknown>, retried = false): Promise<unknown> {
  const token = await vivaDataServicesAccessToken();
  const res = await fetch(`${config.vivaAccountApiBase}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 && !retried) {
      cachedDataServicesToken = undefined;
      return vivaDataServicesPost(path, body, true);
    }
    throw new VivaError(res.status, text);
  }
  return text ? JSON.parse(text) : {};
}

function extractVivaTransactionPage(data: unknown): { items: Record<string, unknown>[]; hasNext: boolean } {
  if (Array.isArray(data)) return { items: data, hasNext: false };
  const obj = data as Record<string, unknown>;
  const items = (Array.isArray(obj.data)
    ? obj.data
    : Array.isArray(obj.transactions)
      ? obj.transactions
      : []) as Record<string, unknown>[];
  const links = obj.links as { next?: string | null } | undefined;
  return { items, hasNext: Boolean(links?.next) };
}

async function listVivaDataServicesPage(
  start: Date,
  end: Date,
  walletId: number | undefined,
  page: number,
): Promise<{ items: Record<string, unknown>[]; hasNext: boolean }> {
  const params = new URLSearchParams({
    Page: String(page),
    PageSize: "200",
    OrderBy: "Descending",
  });
  const body: Record<string, unknown> = {
    DateFrom: start.toISOString(),
    DateTo: end.toISOString(),
  };
  if (walletId) body.WalletId = walletId;
  const data = await vivaDataServicesPost(`/dataservices/v2/accounttransactions/Search?${params}`, body);
  return extractVivaTransactionPage(data);
}

export async function listVivaAccountTransactions(sinceMs = 0, walletId?: number): Promise<VivaAccountTransaction[]> {
  if (!isVivaDataServicesConfigured()) return [];
  const end = new Date();
  const start = sinceMs > 0 ? new Date(sinceMs) : new Date(end.getTime() - 120 * 86_400_000);
  const seen = new Set<string>();
  const rows: VivaAccountTransaction[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext && page <= 50) {
    const batch = await listVivaDataServicesPage(start, end, walletId, page);
    hasNext = batch.hasNext;
    for (const raw of batch.items) {
      if (raw.isAuthorization === true) continue;
      if (VIVA_SKIP_SUBTYPES.has(Number(raw.subTypeId ?? raw.SubTypeId))) continue;
      const currency = Number(raw.currencyCode);
      if (Number.isFinite(currency) && currency !== 978) continue;
      const tx = normalizeVivaTransaction(raw);
      if (!tx || seen.has(tx.id)) continue;
      seen.add(tx.id);
      rows.push(tx);
    }
    page += 1;
    if (!batch.items.length) break;
  }
  return rows;
}

function vivaDescription(raw: Record<string, unknown>): string {
  const explicit = pickString(raw, "userDescription", "description", "internalDescription");
  if (explicit) return explicit.trim();
  const counterpart = pickString(raw, "counterPart", "name");
  const subTypeId = Number(raw.subTypeId ?? raw.SubTypeId);
  const labeled = Number.isFinite(subTypeId) ? VIVA_SUBTYPE_LABEL[subTypeId] : undefined;
  if (labeled && counterpart && (subTypeId === 4 || subTypeId === 30 || subTypeId === 140 || subTypeId === 164 || subTypeId === 165)) {
    return `${labeled} - ${counterpart}`;
  }
  return (counterpart || labeled || "").trim();
}

export function normalizeVivaTransaction(raw: Record<string, unknown>): VivaAccountTransaction | null {
  const id = String(raw.accountTransactionId ?? raw.walletTransactionId ?? raw.transactionId ?? raw.id ?? "").trim();
  if (!id) return null;
  const amount = Number(raw.amount ?? raw.signedAmount);
  if (!Number.isFinite(amount)) return null;
  const description = vivaDescription(raw);
  const balanceRaw = raw.targetAvailable ?? raw.targetAmount;
  const balance = balanceRaw !== undefined && balanceRaw !== null && balanceRaw !== "" ? Number(balanceRaw) : undefined;
  return {
    id,
    created: String(raw.created ?? raw.createdDate ?? raw.transactionDate ?? ""),
    valueDate: typeof raw.valueDate === "string" ? raw.valueDate : undefined,
    description,
    amount,
    balance: balance !== undefined && Number.isFinite(balance) ? balance : undefined,
  };
}
