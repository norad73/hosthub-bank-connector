var VIVA_SPEC = bankConnectorMakeFillHandlers_({
  sheetName: "Viva",
  endpoint: "/cron/sync-viva-transactions",
  action: "fill-viva",
  menuHandler: "fillVivaTransactions",
  menuLabel: "Fill Viva transactions",
  label: "Viva",
  logPrefix: "fillVivaTransactions",
  skipReason: "No new Viva transactions",
  compositeKnownFields: ["transactionDate", "description", "origAmount"],
  sinceDateField: "transactionDate",
  uniqueIdFrom: function (tx) { return [tx.transactionDate, tx.description, tx.origAmount]; },
  yellowHeaders: {
    transactionDate: "Transaction Date",
    valueDate: "Value Date",
    description: "Description",
    origAmount: "Orig Amount",
    balance: "Balance",
    fxRate: "Ισοτιμία ",
  },
  writeRows: function (sheet, startRow, colMap, transactions) {
    var endRow = startRow + transactions.length - 1;
    bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.transactionDate, transactions, function (tx) { return tx.transactionDate; }, "@");
    bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.valueDate, transactions, function (tx) { return tx.valueDate; }, "@");
    bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.description, transactions, function (tx) { return tx.description; }, "@");
    bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.origAmount, transactions, function (tx) { return tx.origAmount; }, "@");
    bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.balance, transactions, function (tx) { return tx.balance; }, "@");
    bankConnectorWriteColumn_(sheet, startRow, endRow, colMap.fxRate, transactions, function (tx) { return tx.fxRate; });
  },
});

function fillVivaTransactions() { return VIVA_SPEC.fillMenu(); }
