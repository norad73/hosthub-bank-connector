// Apps Script ContentService always 302s to a one-time
// script.googleusercontent.com/macros/echo URL. Node fetch `redirect: "follow"`
// can turn that into GET /exec (doGet help, false success) or a 404 HTML page.
import { config } from "./config.ts";

export type SheetsFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

const RETRYABLE = /webhook 404|echo\/redirect HTML|hit doGet help/i;

export function isSheetsDoGetHelp(data: Record<string, unknown>): boolean {
  return data.service === "BankConnector" && /^Use POST/i.test(String(data.action ?? ""));
}

export function parseSheetsWebhookBody(status: number, text: string): Record<string, unknown> {
  const preview = text.slice(0, 300);
  if (status === 404 || /ppConfig/.test(text) || /<!DOCTYPE html/i.test(text)) {
    throw new Error(`Google Sheets webhook ${status}: echo/redirect HTML (not JSON)`);
  }
  if (status < 200 || status >= 300) {
    throw new Error(`Google Sheets webhook ${status}: ${preview}`);
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Google Sheets webhook returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (isSheetsDoGetHelp(data)) {
    throw new Error("Google Sheets webhook hit doGet help (POST was followed as GET /exec)");
  }
  if (data.ok === false) {
    throw new Error(`Google Sheets webhook error: ${String(data.error ?? preview)}`);
  }
  return data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postOnce(url: string, payload: string, fetchImpl: SheetsFetch): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "manual",
    body: payload,
  });

  if (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308) {
    const loc = res.headers.get("location");
    if (!loc) throw new Error("Google Sheets webhook redirect missing Location");
    const echoed = await fetchImpl(loc, { method: "GET", redirect: "follow" });
    return parseSheetsWebhookBody(echoed.status, await echoed.text());
  }

  return parseSheetsWebhookBody(res.status, await res.text());
}

export async function postSheetsWebhook(
  body: Record<string, unknown>,
  opts?: { url?: string; fetch?: SheetsFetch; retries?: number; sleepMs?: number },
): Promise<Record<string, unknown>> {
  const url = opts?.url ?? config.googleSheetsWebhookUrl;
  if (!url) throw new Error("Set GOOGLE_SHEETS_WEBHOOK_URL to your Google Apps Script web app URL.");

  const payload = JSON.stringify({
    source: "bankconnector",
    synced_at: new Date().toISOString(),
    ...body,
  });
  const fetchImpl = opts?.fetch ?? fetch;
  const retries = opts?.retries ?? 3;
  const sleepMs = opts?.sleepMs ?? 400;

  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await postOnce(url, payload, fetchImpl);
    } catch (err) {
      lastErr = err as Error;
      if (!RETRYABLE.test(lastErr.message) || attempt === retries) throw lastErr;
      await sleep(sleepMs * attempt);
    }
  }
  throw lastErr ?? new Error("Google Sheets webhook failed");
}
