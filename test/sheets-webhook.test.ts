import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isSheetsDoGetHelp,
  parseSheetsWebhookBody,
  postSheetsWebhook,
  type SheetsFetch,
} from "../src/sheets-webhook.ts";

test("isSheetsDoGetHelp detects the Apps Script doGet payload", () => {
  assert.equal(
    isSheetsDoGetHelp({
      ok: true,
      service: "BankConnector",
      action: "Use POST { action: 'fill' | ... }",
    }),
    true,
  );
  assert.equal(isSheetsDoGetHelp({ ok: true, action: "appended", row: 885 }), false);
});

test("parseSheetsWebhookBody rejects 404 HTML and doGet help", () => {
  assert.throws(
    () => parseSheetsWebhookBody(404, '<!DOCTYPE html><html><script>window["ppConfig"]={}</script>'),
    /echo\/redirect HTML/,
  );
  assert.throws(
    () => parseSheetsWebhookBody(200, JSON.stringify({ ok: true, service: "BankConnector", action: "Use POST { action: 'fill'" })),
    /hit doGet help/,
  );
  assert.deepEqual(parseSheetsWebhookBody(200, JSON.stringify({ ok: true, action: "appended", row: 885 })), {
    ok: true,
    action: "appended",
    row: 885,
  });
});

test("postSheetsWebhook POSTs once then GETs the echo Location", async () => {
  const calls: Array<{ url: string; method?: string; redirect?: string }> = [];
  const fetchImpl: SheetsFetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method, redirect: init?.redirect as string | undefined });
    if (url.includes("/exec")) {
      return new Response(null, {
        status: 302,
        headers: { Location: "https://script.googleusercontent.com/macros/echo?k=1" },
      });
    }
    return new Response(JSON.stringify({ ok: true, action: "appended", row: 885 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const sheet = await postSheetsWebhook({ action: "fill" }, { url: "https://script.google.com/macros/s/x/exec", fetch: fetchImpl, retries: 1 });
  assert.equal(sheet.action, "appended");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].redirect, "manual");
  assert.equal(calls[1].method, "GET");
  assert.match(calls[1].url, /googleusercontent.com/);
});

test("postSheetsWebhook retries a 404 echo then succeeds", async () => {
  let echoHits = 0;
  const fetchImpl: SheetsFetch = async (input, init) => {
    if (String(input).includes("/exec")) {
      return new Response(null, {
        status: 302,
        headers: { Location: "https://script.googleusercontent.com/macros/echo?k=1" },
      });
    }
    echoHits += 1;
    if (echoHits === 1) {
      return new Response('<!DOCTYPE html><html><head><script>window["ppConfig"]={}</script>', { status: 404 });
    }
    return new Response(JSON.stringify({ ok: true, action: "skip", reason: "Today already filled" }), { status: 200 });
  };

  const sheet = await postSheetsWebhook({ action: "fill" }, {
    url: "https://script.google.com/macros/s/x/exec",
    fetch: fetchImpl,
    retries: 2,
    sleepMs: 1,
  });
  assert.equal(sheet.action, "skip");
  assert.equal(echoHits, 2);
});
