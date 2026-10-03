// HTTP server: balance sync, bank connections, and status pages.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config, isConfigured, setupProblems } from "./config.ts";
import { completeSession, eb, EnableBankingError } from "./enablebanking.ts";
import { store } from "./store.ts";
import { verifyPassword } from "./auth.ts";
import { balancesPage, connectedPage, failedPage, privacyPage, setupPage, siteLoginPage, statusPage, termsPage } from "./pages.ts";
import { applySetup, setupAvailable } from "./setup.ts";
import { fetchRatesToUsd } from "./fx.ts";
import { fetchAllBalances, prepareBalanceFill, refreshBalanceByUid, syncBalancesToSheet } from "./sync-sheets.ts";
import { athensDate, isoDate } from "./data.ts";
import { isWiseConfigured } from "./wise.ts";
import { loadAspspLogos, resolveLogo } from "./logos.ts";
import { VERSION } from "./version.ts";
import { seedBalanceCacheForLabel } from "./seed-cache.ts";
import { ebLog } from "./eb-log.ts";
import { probeEnableBankingSessions, probeEnableBankingTransactions, readEbDebugLogTail, summarizeSessionCreation } from "./investigate-eb.ts";
import { buildSheetBalancePayload } from "./sheet-balances.ts";
import { fetchBalanceActivityReportCsv, listAirwallexFinancialTransactions } from "./airwallex.ts";
import { syncAirwallexEurTransactionsToSheet } from "./sync-airwallex-eur.ts";
import { syncAirwallexUsdTransactionsToSheet } from "./sync-airwallex-usd.ts";
import { syncMercuryTransactionsToSheet } from "./sync-mercury.ts";
import { syncCledaraTransactionsToSheet } from "./sync-cledara-transactions.ts";
import { syncEurobankBranchTransactionsToSheet } from "./sync-eurobank.ts";
import { syncEurobankIkeTransactionsToSheet } from "./sync-eurobank-ike.ts";
import { syncPaypalTransactionsToSheet } from "./sync-paypal-transactions.ts";
import { syncVivaTransactionsToSheet } from "./sync-viva-transactions.ts";
import { syncWiseEurTransactionsToSheet, syncWiseUsdTransactionsToSheet } from "./sync-wise-transactions.ts";

export function createApp() {
  const log = (msg: string, extra?: unknown) => console.log(`[bank ${new Date().toISOString()}] ${msg}`, extra ?? "");

  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use("/assets", express.static(join(dirname(fileURLToPath(import.meta.url)), "..", "public")));
  app.use((_req, res, next) => {
    res.set({
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' https: data:; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    });
    next();
  });

  const SESSION_COOKIE = "bankconnector_session";
  const SESSION_TTL = 24 * 60 * 60;
  const sessionSecret = () => config.adminPasswordHash || config.adminPassword || config.cronSecret || "";

  const signSessionCookie = () => {
    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
    const sig = createHmac("sha256", sessionSecret()).update(String(exp)).digest("base64url");
    return `${exp}.${sig}`;
  };

  const verifySessionCookie = (value: string | undefined) => {
    if (!value || !sessionSecret()) return false;
    const [expStr, sig] = value.split(".");
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = createHmac("sha256", sessionSecret()).update(String(exp)).digest("base64url");
    const a = Buffer.from(sig ?? "");
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  const readCookie = (req: express.Request, name: string) => {
    const header = req.headers.cookie;
    if (!header) return undefined;
    for (const part of header.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      if (part.slice(0, eq).trim() !== name) continue;
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
    return undefined;
  };

  const sessionAuthed = (req: express.Request) => verifySessionCookie(readCookie(req, SESSION_COOKIE));

  const isPublicRoute = (req: express.Request) => {
    const { path, method } = req;
    if (path === "/healthz") return true;
    if (path === "/callback") return true;
    if (path.startsWith("/cron/")) return true;
    if (path === "/login") return true;
    if (setupAvailable() && (path === "/" || path === "/setup")) return true;
    return false;
  };

  app.use((req, res, next) => {
    if (isPublicRoute(req)) return next();
    if (!sessionAuthed(req)) {
      const returnTo = req.originalUrl.startsWith("/") ? req.originalUrl : "/";
      if (methodIsSafe(req.method)) return void res.type("html").send(siteLoginPage({ returnTo }));
      return void res.status(401).type("html").send(siteLoginPage({ returnTo, error: "Sign in required." }));
    }
    next();
  });

  function methodIsSafe(method: string) {
    return method === "GET" || method === "HEAD";
  }

  const callbackUrl = new URL("/callback", config.baseUrl).href;
  const setupCsp = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

  app.get("/", (_req, res) => {
    if (setupAvailable()) return void res.set("Content-Security-Policy", setupCsp).type("html").send(setupPage({ baseUrl: config.baseUrl }));
    res.type("html").send(statusPage({ problems: setupProblems(), callbackUrl }));
  });

  app.post("/setup", express.urlencoded({ extended: false, limit: "64kb" }), (req, res) => {
    if (!setupAvailable()) return void res.status(404).type("html").send(failedPage("Setup is already complete."));
    const body = req.body as Record<string, string | undefined>;
    const error = applySetup(body);
    if (error) return void res.status(400).set("Content-Security-Policy", setupCsp).type("html").send(setupPage({ error, values: { app_id: body.app_id, country: body.country }, baseUrl: config.baseUrl }));
    log("setup completed via the setup page");
    res.redirect(303, "/");
  });

  app.get("/healthz", (_req, res) => void res.json({ ok: true, version: VERSION, configured: isConfigured() }));

  app.post("/login", express.urlencoded({ extended: false }), (req, res) => {
    const body = req.body as Record<string, string | undefined>;
    const password = String(body.password ?? "");
    const next = String(body.next ?? "/");
    const returnTo = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    if (!verifyPassword(password)) return void res.status(401).type("html").send(siteLoginPage({ returnTo, error: "Wrong password." }));
    res.cookie(SESSION_COOKIE, signSessionCookie(), { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: SESSION_TTL * 1000, path: "/" });
    res.redirect(303, returnTo);
  });

  const toDisplayRows = (result: Awaited<ReturnType<typeof fetchAllBalances>>, aspspLogos: Awaited<ReturnType<typeof loadAspspLogos>>) =>
    result.rows
      .filter((r) => r.source !== "airwallex" || ["USD", "EUR"].includes(r.currency.toUpperCase()))
      .map((r) => {
        const source =
          r.source === "wise" ? "Wise" : r.source === "mercury" ? "Mercury" : (r.bank ?? r.source);
        return {
          uid: r.uid,
          source,
          logo: resolveLogo(source, r.source, aspspLogos),
          account: r.account,
          currency: r.currency,
          booked: r.booked,
          available: r.available,
          error: r.error,
          cached: r.cached,
          fetchedAt: r.fetchedAt,
        };
      });

  app.get("/balances", async (req, res) => {
    const sheetMessage = decodeURIComponent(readCookie(req, "sheet_msg") ?? "");
    if (sheetMessage) res.clearCookie("sheet_msg", { path: "/" });
    if (!isConfigured()) return void res.type("html").send(balancesPage({ asOf: athensDate(), fetchedAt: new Date().toISOString(), rows: [], error: "BankConnector is not configured yet." }));
    try {
      const [result, fx, aspspLogos] = await Promise.all([
        fetchAllBalances(),
        fetchRatesToUsd(["EUR", "USD", "GBP"]),
        loadAspspLogos(),
      ]);
      res.type("html").send(balancesPage({
        asOf: athensDate(),
        fetchedAt: new Date().toISOString(),
        rows: toDisplayRows(result, aspspLogos),
        fx,
        sheetMessage: sheetMessage || undefined,
      }));
    } catch (err) {
      log("balances page failed", (err as Error).message);
      res.type("html").send(balancesPage({ asOf: athensDate(), fetchedAt: new Date().toISOString(), rows: [], error: (err as Error).message, sheetMessage: sheetMessage || undefined }));
    }
  });

  app.get("/debug/eb-investigation", async (req, res) => {
    const label = String(req.query.label ?? "Eurobank USA Branch");
    try {
      const probes = await probeEnableBankingSessions(label);
      res.json({ ok: true, label, probes, logPath: "logs/eb-debug.jsonl", logTail: readEbDebugLogTail() });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message, logTail: readEbDebugLogTail() });
    }
  });

  app.get("/debug/eb-transactions", async (req, res) => {
    const label = String(req.query.label ?? "Eurobank IKE");
    const from = String(req.query.from ?? "2026-08-31");
    try {
      res.json({ ok: true, ...(await probeEnableBankingTransactions(label, from)) });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  app.post("/balances/refresh", express.urlencoded({ extended: false }), async (req, res) => {
    const uid = String((req.body as Record<string, string | undefined>).uid ?? "").trim();
    if (!uid) return void res.redirect(303, "/balances");
    try {
      await refreshBalanceByUid(uid);
    } catch (err) {
      log(`balance refresh failed for ${uid}`, (err as Error).message);
    }
    res.redirect(303, "/balances");
  });

  app.post("/balances/refresh-all", express.urlencoded({ extended: false }), async (_req, res) => {
    try {
      const result = await fetchAllBalances({ force: true });
      log(`refresh-all: ${result.rows.length} row(s) refreshed for ${athensDate()}`);
    } catch (err) {
      log("refresh-all failed", (err as Error).message);
    }
    res.redirect(303, "/balances");
  });

  app.post("/balances/fill-sheet", express.urlencoded({ extended: false }), async (req, res) => {
    const msg = (text: string) => {
      res.cookie("sheet_msg", text, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: 60_000, path: "/" });
      res.redirect(303, "/balances");
    };
    try {
      const result = await syncBalancesToSheet();
      const sheet = result.sheet as { action?: string; reason?: string; row?: number } | undefined;
      if (sheet?.action === "skip") msg(`Google Sheet: skipped (${sheet.reason ?? "already filled"}).`);
      else if (sheet?.action) msg(`Google Sheet: ${sheet.action} row ${sheet.row ?? "?"}.`);
      else msg("Google Sheet fill completed.");
    } catch (err) {
      log("fill-sheet failed", (err as Error).message);
      msg(`Google Sheet fill failed: ${(err as Error).message}`);
    }
  });

  if (config.cronSecret) {
    const cronAuth = (req: express.Request, res: express.Response) => {
      if (req.headers.authorization !== `Bearer ${config.cronSecret}`) {
        res.status(401).json({ error: "unauthorized" });
        return false;
      }
      return true;
    };

    app.get("/cron/balances", async (req, res) => {
      if (!cronAuth(req, res)) return;
      try {
        const result = await fetchAllBalances();
        res.json({ ok: true, as_of: isoDate(), accounts: result.rows });
      } catch (err) {
        log("balances failed", (err as Error).message);
        res.status(500).json({ error: (err as Error).message });
      }
    });

    app.post("/cron/refresh-balances", async (req, res) => {
      if (!cronAuth(req, res)) return;
      try {
        const result = await fetchAllBalances({ force: true });
        log(`refresh-balances: ${result.rows.length} row(s) cached for ${athensDate()}`);
        res.json({ ok: true, as_of: athensDate(), count: result.rows.length });
      } catch (err) {
        log("refresh-balances failed", (err as Error).message);
        res.status(500).json({ error: (err as Error).message });
      }
    });

    app.get("/cron/sheet-balances", async (req, res) => {
      if (!cronAuth(req, res)) return;
      try {
        const [result, fx] = await Promise.all([fetchAllBalances(), fetchRatesToUsd(["EUR", "USD", "GBP"])]);
        res.json({ ok: true, ...buildSheetBalancePayload(result.rows, fx) });
      } catch (err) {
        log("sheet-balances failed", (err as Error).message);
        res.status(500).json({ error: (err as Error).message });
      }
    });

    app.post("/cron/prepare-balance-fill", async (req, res) => {
      if (!cronAuth(req, res)) return;
      try {
        const prepared = await prepareBalanceFill();
        log(`prepare-balance-fill: ${prepared.rows.length} row(s) for ${prepared.date}`);
        res.json({
          ok: true,
          date: prepared.date,
          columns: prepared.columns,
          fxDate: prepared.fxDate,
          eurUsdClose: prepared.eurUsdClose,
          inTransit: prepared.inTransit,
        });
      } catch (err) {
        log("prepare-balance-fill failed", (err as Error).message);
        res.status(500).json({ error: (err as Error).message });
      }
    });

    app.post("/cron/sync-balances", async (req, res) => {
      if (!cronAuth(req, res)) return;
      try {
        const result = await syncBalancesToSheet();
        log(`sync-balances: ${result.rows.length} row(s) sent to Google Sheets`);
        res.json({ ok: true, count: result.rows.length, ...result.sheet });
      } catch (err) {
        log("sync-balances failed", (err as Error).message);
        res.status(500).json({ error: (err as Error).message });
      }
    });

    app.get("/cron/debug/airwallex-balance-activity", async (req, res) => {
      if (!cronAuth(req, res)) return;
      try {
        const currency = String(req.query.currency ?? "USD");
        const fromDate = String(req.query.from ?? "2026-08-25");
        const toDate = String(req.query.to ?? "2026-08-31");
        const { report, csv } = await fetchBalanceActivityReportCsv({ currency, fromDate, toDate });
        const lines = csv.trim().split(/\r?\n/);
        res.json({
          ok: true,
          report,
          lineCount: lines.length,
          header: lines[0] ?? "",
          previewRows: lines.slice(1, 6),
        });
      } catch (err) {
        res.status(500).json({ ok: false, error: (err as Error).message });
      }
    });

    app.get("/cron/debug/airwallex-transactions", async (req, res) => {
      if (!cronAuth(req, res)) return;
      try {
        const { items, hasMore } = await listAirwallexFinancialTransactions({
          currency: String(req.query.currency ?? "USD"),
          pageSize: Number(req.query.limit ?? 5) || 5,
          fromCreatedAt: String(req.query.from ?? "2026-08-01T00:00:00Z"),
        });
        res.json({ ok: true, hasMore, items });
      } catch (err) {
        res.status(500).json({ ok: false, error: (err as Error).message });
      }
    });

    app.post("/cron/sync-airwallex-usd-transactions", express.json({ limit: "512kb" }), async (req, res) => {
      if (!cronAuth(req, res)) return;
      try {
        const body = req.body as { sinceMs?: number; knownTransactionIds?: string[]; anchorAccountBalance?: number };
        const sinceMs = Number(body?.sinceMs ?? 0) || 0;
        const knownTransactionIds = Array.isArray(body?.knownTransactionIds) ? body.knownTransactionIds : undefined;
        const anchorAccountBalance = Number(body?.anchorAccountBalance);
        const result = await syncAirwallexUsdTransactionsToSheet(
          sinceMs,
          knownTransactionIds,
          Number.isFinite(anchorAccountBalance) ? anchorAccountBalance : undefined,
        );
        log(`sync-airwallex-usd-transactions: ${result.transactions.length} new transaction(s)`);
        res.json({ ok: true, count: result.transactions.length, ...result.sheet });
      } catch (err) {
        log("sync-airwallex-usd-transactions failed", (err as Error).message);
        res.status(500).json({ error: (err as Error).message });
      }
    });

    app.post("/cron/sync-airwallex-eur-transactions", express.json({ limit: "512kb" }), async (req, res) => {
      if (!cronAuth(req, res)) return;
      try {
        const body = req.body as { sinceMs?: number; knownTransactionIds?: string[]; anchorAccountBalance?: number };
        const sinceMs = Number(body?.sinceMs ?? 0) || 0;
        const knownTransactionIds = Array.isArray(body?.knownTransactionIds) ? body.knownTransactionIds : undefined;
        const anchorAccountBalance = Number(body?.anchorAccountBalance);
        const result = await syncAirwallexEurTransactionsToSheet(
          sinceMs,
          knownTransactionIds,
          Number.isFinite(anchorAccountBalance) ? anchorAccountBalance : undefined,
        );
        log(`sync-airwallex-eur-transactions: ${result.transactions.length} new transaction(s)`);
        res.json({ ok: true, count: result.transactions.length, ...result.sheet });
      } catch (err) {
        log("sync-airwallex-eur-transactions failed", (err as Error).message);
        res.status(500).json({ error: (err as Error).message });
      }
    });

    app.post("/cron/sync-mercury-transactions", express.json({ limit: "512kb" }), async (req, res) => {
      if (!cronAuth(req, res)) return;
      try {
        const sinceMs = Number((req.body as { sinceMs?: number })?.sinceMs ?? 0) || 0;
        const result = await syncMercuryTransactionsToSheet(sinceMs);
        log(`sync-mercury-transactions: ${result.transactions.length} new transaction(s)`);
        res.json({ ok: true, count: result.transactions.length, ...result.sheet });
      } catch (err) {
        log("sync-mercury-transactions failed", (err as Error).message);
        res.status(500).json({ error: (err as Error).message });
      }
    });

    const registerTransactionSync = (
      path: string,
      label: string,
      handler: (sinceMs: number, knownTransactionIds: string[], knownDateAmountKeys?: string[]) => Promise<{ transactions: unknown[]; sheet: Record<string, unknown> }>,
    ) => {
      app.post(path, express.json({ limit: "512kb" }), async (req, res) => {
        if (!cronAuth(req, res)) return;
        try {
          const body = req.body as { sinceMs?: number; knownTransactionIds?: string[]; knownDateAmountKeys?: string[] };
          const sinceMs = Number(body?.sinceMs ?? 0) || 0;
          const knownTransactionIds = Array.isArray(body?.knownTransactionIds) ? body.knownTransactionIds : [];
          const knownDateAmountKeys = Array.isArray(body?.knownDateAmountKeys) ? body.knownDateAmountKeys : [];
          const result = await handler(sinceMs, knownTransactionIds, knownDateAmountKeys);
          log(`${label}: ${result.transactions.length} new transaction(s)`);
          res.json({ ok: true, count: result.transactions.length, ...result.sheet });
        } catch (err) {
          log(`${label} failed`, (err as Error).message);
          res.status(500).json({ error: (err as Error).message });
        }
      });
    };

    registerTransactionSync("/cron/sync-cledara-transactions", "sync-cledara-transactions", syncCledaraTransactionsToSheet);
    registerTransactionSync("/cron/sync-wise-usd-transactions", "sync-wise-usd-transactions", syncWiseUsdTransactionsToSheet);
    registerTransactionSync("/cron/sync-wise-eur-transactions", "sync-wise-eur-transactions", syncWiseEurTransactionsToSheet);
    registerTransactionSync("/cron/sync-paypal-transactions", "sync-paypal-transactions", syncPaypalTransactionsToSheet);
    registerTransactionSync("/cron/sync-eurobank-transactions", "sync-eurobank-transactions", syncEurobankBranchTransactionsToSheet);
    registerTransactionSync("/cron/sync-eurobank-ike-transactions", "sync-eurobank-ike-transactions", syncEurobankIkeTransactionsToSheet);
    registerTransactionSync("/cron/sync-viva-transactions", "sync-viva-transactions", syncVivaTransactionsToSheet);

    app.post("/cron/seed-balance-cache", express.json({ limit: "4kb" }), (req, res) => {
      if (!cronAuth(req, res)) return;
      const body = req.body as Record<string, unknown>;
      const sessionLabel = String(body.label ?? body.sessionLabel ?? "");
      const available = Number(body.available);
      if (!sessionLabel || !Number.isFinite(available)) {
        res.status(400).json({ error: "label and available are required" });
        return;
      }
      try {
        const seeded = seedBalanceCacheForLabel({
          sessionLabel,
          available,
          booked: Number.isFinite(Number(body.booked)) ? Number(body.booked) : undefined,
          currency: typeof body.currency === "string" ? body.currency : undefined,
          account: typeof body.account === "string" ? body.account : undefined,
          accountUid: typeof body.accountUid === "string" ? body.accountUid : typeof body.uid === "string" ? body.uid : undefined,
        });
        log(`seed-balance-cache: ${seeded.map((row) => `${row.account}=${available}`).join(", ")}`);
        res.json({ ok: true, seeded });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    });
  }

  app.get("/connect", async (req, res) => {
    if (!isConfigured()) return void res.status(503).type("html").send(failedPage("Finish setup first."));
    const bank = String(req.query.bank ?? "Eurobank");
    const bankKey = bank.toLowerCase();
    let country = String(req.query.country ?? config.country).toUpperCase();
    const psuTypeDefault = bankKey === "wise" ? "business" : "personal";
    const psuType = String(req.query.psu_type ?? req.query.customer_type ?? psuTypeDefault).toLowerCase() === "business" ? "business" : "personal";
    const label = String(req.query.label ?? "").trim() || undefined;
    if (bankKey === "wise" && isWiseConfigured()) {
      return void res.status(400).type("html").send(failedPage("Wise is configured via WISE_API_TOKEN on this server. Enable Banking connect is not used for Wise."));
    }
    try {
      const findBank = (list: Awaited<ReturnType<typeof eb.listAspsps>>) =>
        list.find((b) => b.name === bank) ?? list.find((b) => b.name.toLowerCase() === bankKey);
      let banks = await eb.listAspsps(country);
      let aspsp = findBank(banks);
      if (!aspsp && bankKey === "wise" && !req.query.country) {
        for (const fallback of ["GB", "EE", "US"]) {
          if (fallback === country) continue;
          banks = await eb.listAspsps(fallback);
          aspsp = findBank(banks);
          if (aspsp) {
            country = fallback;
            break;
          }
        }
      }
      if (!aspsp) return void res.status(404).type("html").send(failedPage(`Bank "${bank}" not found in ${country}.`));
      const maxSeconds = Math.min(aspsp.maximum_consent_validity ?? 180 * 86_400, 180 * 86_400);
      const validUntil = new Date(Date.now() + maxSeconds * 1000 - 60_000);
      const state = randomUUID();
      store().addPendingAuth({ state, bank: { name: aspsp.name, country: aspsp.country }, label, started: new Date().toISOString() });
      const auth = await eb.startAuthorization({ aspsp, state, redirectUrl: `${config.baseUrl}/callback`, validUntil, psuType });
      res.redirect(302, auth.url);
    } catch (err) {
      log("connect failed", (err as Error).message);
      res.status(500).type("html").send(failedPage(err instanceof EnableBankingError ? `${err.status}: ${err.body.slice(0, 300)}` : (err as Error).message));
    }
  });

  app.get("/privacy", (_req, res) => void res.type("html").send(privacyPage()));
  app.get("/terms", (_req, res) => void res.type("html").send(termsPage()));

  app.get("/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query as Record<string, string | undefined>;
    const pending = state ? store().takePendingAuth(state) : undefined;
    const failed = (msg: string) => res.status(400).type("html").send(failedPage(msg));

    if (error || !code) return void failed(error_description || error || "The bank did not return an authorization code.");
    if (!pending) return void failed("Unknown or expired authorization. Visit /connect?bank=YourBank to start again.");

    try {
      let created = await eb.createSession(code);
      summarizeSessionCreation(created, pending.label);
      let session = await completeSession(created);
      ebLog("callback.completeSession", {
        label: pending.label ?? session.aspsp.name,
        sessionId: session.session_id,
        accountCount: session.accounts.length,
        accountUids: session.accounts.map((a) => a.uid),
      });
      if (!session.accounts.length) {
        await new Promise((r) => setTimeout(r, 1500));
        session = await completeSession(created);
        ebLog("callback.completeSession.retry", {
          label: pending.label ?? session.aspsp.name,
          sessionId: session.session_id,
          accountCount: session.accounts.length,
          accountUids: session.accounts.map((a) => a.uid),
        });
      }
      store().addSession(session, { label: pending.label });
      const currencies = session.accounts.map((a) => a.currency).join(", ");
      log(`bank connected: ${pending.label ?? session.aspsp.name}, ${session.accounts.length} account(s) [${currencies}] psu=${session.psu_type} country=${session.aspsp.country}`);
      res.type("html").send(connectedPage(session, pending.label));
    } catch (err) {
      const msg = err instanceof EnableBankingError ? `Enable Banking returned ${err.status}: ${err.body.slice(0, 300)}` : (err as Error).message;
      log("callback failed", msg);
      failed(msg);
    }
  });

  return app;
}
