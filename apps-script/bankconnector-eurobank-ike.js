var EUROBANK_IKE_SPEC = bankConnectorMakeFillHandlers_({
  sheetName: "EurobankIKE",
  endpoint: "/cron/sync-eurobank-ike-transactions",
  action: "fill-eurobank-ike",
  menuHandler: "fillEurobankIkeTransactions",
  menuLabel: "Fill Eurobank IKE transactions",
  label: "Eurobank IKE",
  logPrefix: "fillEurobankIkeTransactions",
  skipReason: "No new Eurobank IKE transactions",
  sinceDateField: "bookingDate",
  compositeKnownFields: ["bookingDate", "description", "amount"],
  uniqueIdFrom: function (tx) { return [tx.bookingDate, tx.description, tx.amount]; },
  yellowHeaders: {
    bookingDate: "ΗΜ/ΝΙΑ ΚINΗΣΗΣ",
    valueDate: "ΗΜ/ΝΙΑ ΑΞΙΑΣ",
    description: "Description",
    amount: "ΠΟΣΟ",
    balance: "ΥΠΟΛΟΙΠΟ",
    fxRate: "Ισοτιμία ",
  },
  dateToMs: function (value) {
    var text = String(value || "").trim();
    var m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return Date.parse(m[3] + "-" + m[2] + "-" + m[1]);
    return bankConnectorDateToMsDefault_(value);
  },
  writeRows: function (sheet, startRow, colMap, transactions) {
    bankConnectorWriteEurobankRows_(sheet, startRow, colMap, transactions);
  },
});

function fillEurobankIkeTransactions() { return EUROBANK_IKE_SPEC.fillMenu(); }
