console.log(
  JSON.stringify({
    clientIdLen: (process.env.AIRWALLEX_CLIENT_ID ?? "").length,
    apiKeyLen: (process.env.AIRWALLEX_API_KEY ?? "").length,
    accountIdLen: (process.env.AIRWALLEX_ACCOUNT_ID ?? "").length,
    apiBase: process.env.AIRWALLEX_API_BASE ?? "(default prod)",
  }),
);
