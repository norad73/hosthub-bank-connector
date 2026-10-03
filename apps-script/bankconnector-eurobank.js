var EUROBANK_SPEC = bankConnectorMakeFillHandlers_({
  sheetName: "Eurobank",
  endpoint: "/cron/sync-eurobank-transactions",
  action: "fill-eurobank",
  menuHandler: "fillEurobankTransactions",
  menuLabel: "Fill Eurobank transactions",
  label: "Eurobank",
  logPrefix: "fillEurobankTransactions",
  skipReason: "No new Eurobank transactions",
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
  writeRows: bankConnectorWriteEurobankRows_,
});

function bankConnectorWriteEurobankRows_(sheet, startRow, colMap, transactions) {
  var endRow = startRow + transactions.length - 1;
  bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.bookingDate, transactions, function (tx) { return tx.bookingDate; }, "@");
  bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.valueDate, transactions, function (tx) { return tx.valueDate; }, "@");
  bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.description, transactions, function (tx) { return tx.description; }, "@");
  bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.amount, transactions, function (tx) { return tx.amount; }, "@");
  bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.balance, transactions, function (tx) { return tx.balance; }, "@");
  bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.fxRate, transactions, function (tx) { return tx.fxRate; });
}

function fillEurobankTransactions() { return EUROBANK_SPEC.fillMenu(); }
