import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("viva config", () => {
  it("isVivaConfigured is false without credentials", async () => {
    const prevUser = process.env.VIVA_MERCHANT_ID;
    const prevPass = process.env.VIVA_API_KEY;
    delete process.env.VIVA_MERCHANT_ID;
    delete process.env.VIVA_API_KEY;
    delete process.env.VIVA_BASIC_USER;
    delete process.env.VIVA_BASIC_PASSWORD;
    const { isVivaConfigured } = await import("../src/viva.ts");
    assert.equal(isVivaConfigured(), false);
    if (prevUser) process.env.VIVA_MERCHANT_ID = prevUser;
    if (prevPass) process.env.VIVA_API_KEY = prevPass;
  });

  it("isVivaAccountTransactionsConfigured is false without account credentials", async () => {
    const prevId = process.env.VIVA_ACCOUNT_CLIENT_ID;
    const prevSecret = process.env.VIVA_ACCOUNT_CLIENT_SECRET;
    delete process.env.VIVA_ACCOUNT_CLIENT_ID;
    delete process.env.VIVA_ACCOUNT_CLIENT_SECRET;
    delete process.env.VIVA_CLIENT_ID;
    delete process.env.VIVA_CLIENT_SECRET;
    const { isVivaAccountTransactionsConfigured } = await import("../src/viva.ts");
    assert.equal(isVivaAccountTransactionsConfigured(), false);
    if (prevId) process.env.VIVA_ACCOUNT_CLIENT_ID = prevId;
    if (prevSecret) process.env.VIVA_ACCOUNT_CLIENT_SECRET = prevSecret;
  });

  it("isVivaDataServicesConfigured is false without Data Services credentials", async () => {
    const prevId = process.env.VIVA_DATA_SERVICES_CLIENT_ID;
    const prevSecret = process.env.VIVA_DATA_SERVICES_CLIENT_SECRET;
    delete process.env.VIVA_DATA_SERVICES_CLIENT_ID;
    delete process.env.VIVA_DATA_SERVICES_CLIENT_SECRET;
    const { isVivaDataServicesConfigured } = await import("../src/viva.ts");
    assert.equal(isVivaDataServicesConfigured(), false);
    if (prevId) process.env.VIVA_DATA_SERVICES_CLIENT_ID = prevId;
    if (prevSecret) process.env.VIVA_DATA_SERVICES_CLIENT_SECRET = prevSecret;
  });
});

describe("normalizeVivaTransaction", () => {
  it("maps Data Services Search rows", async () => {
    const { normalizeVivaTransaction } = await import("../src/viva.ts");
    const tx = normalizeVivaTransaction({
      accountTransactionId: "fa694443-79dc-459f-81fa-04e993f083a4",
      created: "2026-09-11T15:45:31.91+03:00",
      subTypeId: 100,
      amount: -15.9,
      currencyCode: 978,
      targetAvailable: 100.29,
      valueDate: "2026-09-09T00:00:00",
      isAuthorization: false,
      counterPart: "SKROUTZ",
    });
    assert.deepEqual(tx, {
      id: "fa694443-79dc-459f-81fa-04e993f083a4",
      created: "2026-09-11T15:45:31.91+03:00",
      valueDate: "2026-09-09T00:00:00",
      description: "SKROUTZ",
      amount: -15.9,
      balance: 100.29,
    });
  });

  it("builds IBAN fee description from subtype + counterpart", async () => {
    const { normalizeVivaTransaction } = await import("../src/viva.ts");
    const tx = normalizeVivaTransaction({
      accountTransactionId: "fee1",
      created: "2026-09-10T14:02:04.753+03:00",
      subTypeId: 4,
      amount: -1.5,
      counterPart: "GR8002600570000530200819470",
    });
    assert.equal(tx?.description, "Fee - Money out to IBAN - GR8002600570000530200819470");
  });

  it("builds Wallet2Wallet description from subtype + counterpart", async () => {
    const { normalizeVivaTransaction } = await import("../src/viva.ts");
    const tx = normalizeVivaTransaction({
      accountTransactionId: "abc",
      created: "2026-09-01T00:00:00Z",
      subTypeId: 140,
      amount: -50,
      counterPart: "HOSTHUB GREECE",
    });
    assert.equal(tx?.description, "Wallet2Wallet Transfer - HOSTHUB GREECE");
  });

  it("prefers API description when present", async () => {
    const { normalizeVivaTransaction } = await import("../src/viva.ts");
    const tx = normalizeVivaTransaction({
      accountTransactionId: "abc",
      created: "2026-09-01T00:00:00Z",
      subTypeId: 140,
      amount: -50,
      description: "Wallet2Wallet Transfer - φορτιση καρτας - HOSTHUB GREECE",
      counterPart: "HOSTHUB GREECE",
    });
    assert.equal(tx?.description, "Wallet2Wallet Transfer - φορτιση καρτας - HOSTHUB GREECE");
  });
});
