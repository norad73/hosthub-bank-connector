// Single onOpen() for this spreadsheet — all menu actions in one place.
// Script version: 0.5.10 (keep in sync with BankConnector app version)
//
// Bank transaction menu items follow spreadsheet tab order (not "… match" sheets).

function onOpen() {
  var menu = SpreadsheetApp.getUi().createMenu("Custom Menu");

  menu.addItem("Fill balances sheet", "fillBalancesSheet");
  addBankConnectorTransactionMenuItems_(menu);

  menu.addSeparator();
  menu.addItem("Append New Unique IDs", "updateUniqueIDs");
  menu.addItem("Pull transactions from all bank sheets", "consolidateData");
  menu.addItem("PnL category suggestions", "categorizeTrans");

  menu.addToUi();
}
