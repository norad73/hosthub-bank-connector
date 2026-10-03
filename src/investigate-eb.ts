import { readFileSync, existsSync } from "node:fs";
import { accountDisplayName, sessionName } from "./data.ts";
import { eb, EnableBankingError, type Session, type SessionStatus, type Transaction } from "./enablebanking.ts";
import { ebLog, ebLogPath } from "./eb-log.ts";
import { store } from "./store.ts";

export interface EbSessionProbe {
  sessionId: string;
  label: string;
  bank: string;
  country: string;
  psuType: string;
  validUntil: string;
  storedAccountCount: number;
  storedAccounts: Array<{ uid: string; displayName: string; currency: string }>;
  createSessionAccounts?: number;
  getSession?: SessionStatus | { error: string };
  liveAccountDetails: Array<{ uid: string; ok: boolean; name?: string; currency?: string; error?: string }>;
  balanceProbes: Array<{ uid: string; ok: boolean; available?: number; error?: string }>;
}

export async function probeEnableBankingSessions(filterLabel?: string): Promise<EbSessionProbe[]> {
  const s = store();
  const sessions = s.sessions().filter((session) => {
    if (!filterLabel) return true;
    return sessionName(session).toLowerCase() === filterLabel.trim().toLowerCase();
  });

  const probes: EbSessionProbe[] = [];

  for (const session of sessions) {
    const label = sessionName(session);
    const storedAccounts = s.accounts()
      .filter((a) => a.session_id === session.id)
      .map((a) => ({ uid: a.uid, displayName: accountDisplayName(a), currency: a.currency }));

    const probe: EbSessionProbe = {
      sessionId: session.id,
      label,
      bank: session.bank.name,
      country: session.bank.country,
      psuType: session.psu_type,
      validUntil: session.valid_until,
      storedAccountCount: storedAccounts.length,
      storedAccounts,
      liveAccountDetails: [],
      balanceProbes: [],
    };

    ebLog("probe.session.start", { sessionId: session.id, label, storedAccountCount: storedAccounts.length });

    try {
      const status = await eb.getSession(session.id);
      probe.getSession = status;
      ebLog("probe.getSession", { sessionId: session.id, label, accountUids: status.accounts ?? [], status: status.status });

      const uids = [...new Set([...(status.accounts ?? []), ...storedAccounts.map((a) => a.uid)])];
      for (const uid of uids) {
        try {
          const account = await eb.getAccount(uid);
          probe.liveAccountDetails.push({ uid, ok: true, name: account.name, currency: account.currency });
          ebLog("probe.getAccount.ok", { sessionId: session.id, label, uid, name: account.name, currency: account.currency });
        } catch (err) {
          const error = err instanceof EnableBankingError ? `${err.status}: ${err.body.slice(0, 300)}` : (err as Error).message;
          probe.liveAccountDetails.push({ uid, ok: false, error });
          ebLog("probe.getAccount.fail", { sessionId: session.id, label, uid, error });
        }

        try {
          const balances = await eb.getBalances(uid);
          const available = balances.find((b) => b.balance_type === "XPCD") ?? balances[0];
          probe.balanceProbes.push({
            uid,
            ok: true,
            available: available ? Number(available.balance_amount.amount) : undefined,
          });
          ebLog("probe.getBalances.ok", { sessionId: session.id, label, uid, balanceCount: balances.length });
        } catch (err) {
          const error = err instanceof EnableBankingError ? `${err.status}: ${err.body.slice(0, 300)}` : (err as Error).message;
          probe.balanceProbes.push({ uid, ok: false, error });
          ebLog("probe.getBalances.fail", { sessionId: session.id, label, uid, error });
        }
      }
    } catch (err) {
      const error = err instanceof EnableBankingError ? `${err.status}: ${err.body.slice(0, 300)}` : (err as Error).message;
      probe.getSession = { error };
      ebLog("probe.getSession.fail", { sessionId: session.id, label, error });
    }

    probes.push(probe);
    ebLog("probe.session.done", { sessionId: session.id, label, storedAccountCount: storedAccounts.length, liveAccounts: probe.liveAccountDetails.length });
  }

  return probes;
}

interface EbTransactionQuery {
  dateFrom?: string;
  dateTo?: string;
}

async function probeTransactionQuery(uid: string, query: EbTransactionQuery) {
  const rows: Transaction[] = [];
  let continuation: string | undefined;
  let pages = 0;
  try {
    do {
      const page = await eb.getTransactionPage(uid, { ...query, continuationKey: continuation });
      rows.push(...(page.transactions ?? []));
      continuation = page.continuation_key;
      pages++;
    } while (continuation && pages < 30);
  } catch (err) {
    const error = err instanceof EnableBankingError ? `${err.status}: ${err.body.slice(0, 500)}` : (err as Error).message;
    return { query, ok: false, pages, count: rows.length, error };
  }
  const dated = rows
    .map((t) => ({
      booking_date: t.booking_date,
      value_date: t.value_date,
      transaction_date: t.transaction_date,
      status: t.status,
      amount: `${t.credit_debit_indicator === "DBIT" ? "-" : ""}${t.transaction_amount.amount} ${t.transaction_amount.currency}`,
      text: (t.remittance_information ?? []).join(" ").slice(0, 60),
    }))
    .sort((a, b) => String(a.booking_date ?? a.value_date ?? "").localeCompare(String(b.booking_date ?? b.value_date ?? "")));
  const statuses: Record<string, number> = {};
  for (const t of rows) statuses[t.status] = (statuses[t.status] ?? 0) + 1;
  return {
    query,
    ok: true,
    pages,
    count: rows.length,
    statuses,
    missingBookingDate: rows.filter((t) => !t.booking_date).length,
    firstDate: dated[0]?.booking_date ?? dated[0]?.value_date,
    lastDate: dated.at(-1)?.booking_date ?? dated.at(-1)?.value_date,
    last5: dated.slice(-5),
  };
}

/** Read-only: what Enable Banking returns per account for the transaction sync's date window. */
export async function probeEnableBankingTransactions(label: string, dateFrom: string) {
  const s = store();
  const session = s.sessions().find((item) => sessionName(item).toLowerCase() === label.trim().toLowerCase());
  if (!session) throw new Error(`No Enable Banking session labeled "${label}"`);
  const stored = s.accounts().filter((a) => a.session_id === session.id);
  const status = await eb.getSession(session.id);
  const uids = [...new Set([...stored.map((a) => a.uid), ...(status.accounts ?? [])])];
  const today = new Date().toISOString().slice(0, 10);
  const accounts = [];
  for (const uid of uids) {
    const account = stored.find((a) => a.uid === uid);
    accounts.push({
      uid,
      storedIndex: stored.findIndex((a) => a.uid === uid),
      name: account ? accountDisplayName(account) : undefined,
      currency: account?.currency,
      queries: [
        await probeTransactionQuery(uid, { dateFrom }),
        await probeTransactionQuery(uid, { dateFrom, dateTo: today }),
        await probeTransactionQuery(uid, {}),
      ],
    });
  }
  return { label, sessionId: session.id, sessionStatus: status.status, validUntil: status.access?.valid_until, dateFrom, accounts };
}

export function readEbDebugLogTail(maxLines = 200): string[] {
  const path = ebLogPath();
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").trim().split("\n").slice(-maxLines);
}

export function summarizeSessionCreation(session: Session, label?: string): void {
  ebLog("callback.createSession", {
    label: label ?? session.aspsp.name,
    sessionId: session.session_id,
    bank: session.aspsp.name,
    country: session.aspsp.country,
    psuType: session.psu_type,
    accountCount: session.accounts.length,
    accountUids: session.accounts.map((a) => a.uid),
    accounts: session.accounts.map((a) => ({ uid: a.uid, name: a.name, currency: a.currency, hash: a.identification_hash })),
  });
}
