import { config } from "./config.ts";

export type CledaraTransactionType =
  | "cardSend"
  | "cardReceive"
  | "transferSend"
  | "transferReceive"
  | "applicationTopUp"
  | "applicationFlush"
  | "other";

export interface CledaraTransaction {
  id: string;
  amount: number;
  currency: string;
  description: string;
  settledAt?: string;
  createdAt?: string;
  /** API `type` field — e.g. transferReceive for repayments. */
  status?: string;
  isRepayment?: boolean;
  isReward?: boolean;
}

export class CledaraError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Cledara API ${status}: ${body.slice(0, 300)}`);
    this.name = "CledaraError";
    this.status = status;
    this.body = body;
  }
}

const CLEDARA_FETCH_MS = 20_000;

/** Repayment / top-up types from Cledara API (not card merchant charges). */
export const CLEDARA_REPAYMENT_TYPES = new Set<CledaraTransactionType>([
  "transferReceive",
  "applicationTopUp",
  "other",
]);

export function isCledaraRewardText(text: string): boolean {
  return /cledara\s*rewards?/i.test(text);
}

/** Live API cashback: same shape as repayments, description `Cledara Rewards`. */
export function isCledaraApiRewardRaw(raw: Record<string, unknown>): boolean {
  const blob = `${raw.description ?? ""} ${raw.comment ?? ""}`;
  return Number(raw.amount) > 0 && isCledaraRewardText(blob);
}

/** Live API: weekly repayments are `other` + `saasMain`, no card, positive amount. Not Rewards. */
export function isCledaraApiRepaymentRaw(raw: Record<string, unknown>): boolean {
  if (isCledaraApiRewardRaw(raw)) return false;
  return (
    raw.type === "other" &&
    raw.accountType === "saasMain" &&
    (raw.card == null || raw.card === undefined) &&
    Number(raw.amount) > 0
  );
}

export function isRepaymentText(text: string): boolean {
  return /^repayment\b/i.test(text.trim());
}

export function isCledaraConfigured(): boolean {
  return Boolean(config.cledaraApiToken);
}

async function cledaraGet(path: string): Promise<unknown> {
  const res = await fetch(`${config.cledaraApiBase}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.cledaraApiToken}`,
    },
    signal: AbortSignal.timeout(CLEDARA_FETCH_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new CledaraError(res.status, text);
  return text ? JSON.parse(text) : {};
}

export async function listCledaraTransactions(opts: {
  from?: string;
  to?: string;
  maxResults?: number;
} = {}): Promise<CledaraTransaction[]> {
  if (!isCledaraConfigured()) return [];
  const maxResults = opts.maxResults ?? 300;
  const out: CledaraTransaction[] = [];
  let offset = 0;

  while (out.length < maxResults) {
    const params = new URLSearchParams();
    if (opts.from) params.set("from", opts.from);
    if (opts.to) params.set("to", opts.to);
    if (offset > 0) params.set("offset", String(offset));
    const suffix = params.toString() ? `?${params}` : "";
    const data = (await cledaraGet(`/v0/transactions${suffix}`)) as {
      transactions?: Array<Record<string, unknown>>;
      nextOffset?: number | null;
      hasMore?: boolean;
    };
    const page = (data.transactions ?? [])
      .map(normalizeCledaraTransaction)
      .filter((t): t is CledaraTransaction => Boolean(t));
    if (!page.length) break;
    out.push(...page);
    if (!data.hasMore || data.nextOffset == null) break;
    offset = data.nextOffset;
  }

  return out.slice(0, maxResults);
}

function signedUsdAmount(raw: Record<string, unknown>): number | null {
  const localCurrency = String(raw.localCurrency ?? "").toUpperCase();
  const localAmount = Number(raw.localAmount);
  const amount = Number(raw.amount);
  if (localCurrency === "USD" && Number.isFinite(localAmount)) return localAmount;
  if (Number.isFinite(amount)) return amount;
  if (Number.isFinite(localAmount)) return localAmount;
  return null;
}

function cardChargeDescription(raw: Record<string, unknown>): string {
  const application = raw.application as { name?: string } | undefined;
  const card = raw.card as { number?: string; name?: string } | undefined;
  const appName = application?.name?.trim() || card?.name?.trim() || "";
  const merchant = String(raw.description ?? "").trim();
  const cardRef = card?.number ? `#${card.number}` : "";
  return [appName, merchant, cardRef].filter(Boolean).join(", ") || merchant;
}

/** Map raw Cledara API transaction → normalized row (card charges + repayments). */
export function normalizeCledaraTransaction(raw: Record<string, unknown>): CledaraTransaction | null {
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  const amount = signedUsdAmount(raw);
  if (amount == null || !Number.isFinite(amount)) return null;

  const type = String(raw.type ?? "") as CledaraTransactionType;
  const rawDesc = String(raw.description ?? "").trim();
  const rawComment = String(raw.comment ?? "").trim();
  const apiReward = isCledaraApiRewardRaw(raw);
  const apiRepayment = isCledaraApiRepaymentRaw(raw);
  const isRepayment =
    !apiReward &&
    (apiRepayment ||
      CLEDARA_REPAYMENT_TYPES.has(type) ||
      isRepaymentText(rawDesc) ||
      isRepaymentText(rawComment));

  const settled = typeof raw.settledAt === "string" ? raw.settledAt : typeof raw.authorizedAt === "string" ? raw.authorizedAt : "";
  const settledDay = settled ? settled.slice(0, 10) : "";

  let description: string;
  if (apiReward) description = rawDesc || rawComment || `Cledara rewards - #${id.slice(0, 8)}`;
  else if (isRepaymentText(rawDesc)) description = rawDesc;
  else if (isRepaymentText(rawComment)) description = rawComment;
  else if (apiRepayment) description = `Repayment : ${settledDay} - ${settledDay} - #${id.slice(0, 8)}`;
  else if (isRepayment) description = rawDesc || rawComment || `Repayment (${type || "other"})`;
  else description = cardChargeDescription(raw);

  if (!description.trim()) return null;

  const localCurrency = String(raw.localCurrency ?? "").toUpperCase();
  return {
    id,
    amount,
    currency: localCurrency === "USD" ? "USD" : String(raw.currency ?? raw.localCurrency ?? "USD").toUpperCase(),
    description,
    settledAt: typeof raw.settledAt === "string" ? raw.settledAt : undefined,
    createdAt:
      typeof raw.authorizedAt === "string"
        ? raw.authorizedAt
        : typeof raw.createdAt === "string"
          ? raw.createdAt
          : undefined,
    status: type || undefined,
    isRepayment,
    isReward: apiReward,
  };
}
