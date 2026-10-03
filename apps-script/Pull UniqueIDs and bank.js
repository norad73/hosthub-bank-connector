function consolidateData() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var activeSheet = ss.getActiveSheet();

    if (activeSheet.getName() !== "all banks") {
      Logger.log("This function can only be run from the 'all banks' sheet.");
      return;
    }

    var sheets = [
      'SVB match', 
      'Mercury match', 
      'Airwallex USD match', 
      'Airwallex EUR match', 
      'Cledara match', 
      'Wise USD match',
      'Wise GBP match',
      'Paypal match', 
      'Wise EUR match', 
      'Eurobank match', 
      'EurobankIKE match',
      'Viva match',
      'Revolut EUR match',
      'Revolut USD match'
    ];

    var allBanksData = activeSheet.getDataRange().getValues();
    var existingUniqueIDs = allBanksData.slice(1).map(row => row[0]).filter(Boolean);
    var existingBanks = allBanksData.slice(1).map(row => row[1]).filter(Boolean);

    Logger.log("Number of Unique IDs in 'all banks': " + existingUniqueIDs.length);
    Logger.log("Number of Bank entries in 'all banks': " + existingBanks.length);

    var newUniqueIDs = [];

    sheets.forEach(function(sheetName) {
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        Logger.log("Sheet not found: " + sheetName);
        return;
      }

      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      Logger.log("Headers in sheet '" + sheetName + "': " + headers.join(", "));

      var uniqueIDCol = headers.indexOf("UniqueID") + 1;
      var bankCol = headers.indexOf("Bank") + 1;

      if (uniqueIDCol === 0 || bankCol === 0) {
        Logger.log("Columns 'UniqueID' and/or 'Bank' not found in the sheet: " + sheetName);
        return;
      }

      var sheetData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
      var sheetUniqueIDs = sheetData.map(row => row[uniqueIDCol - 1]).filter(Boolean);
      var bankName = sheetData[0][bankCol - 1]; // Assuming the bank name is the same for all entries in the sheet

      var existingBankEntries = existingBanks.filter(bank => bank === bankName).length;
      Logger.log("Number of entries for bank '" + bankName + "' in 'all banks': " + existingBankEntries);

      Logger.log("Number of Unique IDs in '" + sheetName + "': " + sheetUniqueIDs.length);

      sheetData.forEach(row => {
        var uniqueID = row[uniqueIDCol - 1].toString();
        if (uniqueID && !existingUniqueIDs.includes(uniqueID)) {
          newUniqueIDs.push([uniqueID, row[bankCol - 1]]);
        }
      });
    });

    Logger.log("Number of new Unique IDs to add: " + newUniqueIDs.length);

    if (newUniqueIDs.length > 0) {
      var lastRowWithData = allBanksData.findIndex(row => !row[0]) + 1;
      if (lastRowWithData === 0) {
        lastRowWithData = activeSheet.getLastRow() + 1;
      }

      // Insert new rows if needed
      if (lastRowWithData + newUniqueIDs.length > activeSheet.getMaxRows()) {
        var rowsToAdd = lastRowWithData + newUniqueIDs.length - activeSheet.getMaxRows();
        activeSheet.insertRowsAfter(activeSheet.getMaxRows(), rowsToAdd);
        Logger.log("Number of new rows added: " + rowsToAdd);
      }

      activeSheet.getRange(lastRowWithData, 1, newUniqueIDs.length, 1).setNumberFormat("@");
      activeSheet.getRange(lastRowWithData, 1, newUniqueIDs.length, 1).setValues(newUniqueIDs.map(row => [row[0]]));
      activeSheet.getRange(lastRowWithData, 2, newUniqueIDs.length, 1).setValues(newUniqueIDs.map(row => [row[1]]));
    } else {
      Logger.log("No new Unique IDs to add.");
    }

  } catch (e) {
    Logger.log("Error in consolidateData: " + e.toString());
  }
}
