// BankConnector — fill the "Balances" and "CC" tabs from live bank data.
// Script version: 0.6.97 (keep in sync with BankConnector app version)
//
// Setup: paste ALL bankconnector-*.gs files + Create Custom menu.gs into Apps Script.
// Menu items are built in Create Custom menu.gs via addAllBankConnectorMenuItems_().
// Then deploy a new version of the existing web app (same URL).

const SHEET_NAME = "Balances";
const CC_SHEET_NAME = "CC";

/** Header labels on row 1 — columns are resolved by text, not fixed index. */
const BALANCE_HEADERS = {
  date: "Date",
  mercury: "Mercury",
  stripe: "Stripe",
  airwallexUsd: "Airwallex USD",
  airwallexEur: "Airwallex EUR",
  wiseUsd: "Wise (USD)",
  wiseEur: "Wise (EUR)",
  paypal: "Paypal",
  eurobank: "Eurobank",
  viva: "Viva",
  eurobankIke: "Eurobank IKE",
  inTransit: "In transit",
  total: "TOTAL",
};

const BALANCE_FILL_KEYS = [
  "mercury", "stripe", "airwallexUsd", "airwallexEur", "wiseUsd", "wiseEur",
  "paypal", "eurobank", "viva", "eurobankIke",
];

const CC_HEADERS = { date: "Date", close: "Close" };

function doGet() {
  return json({
    ok: true,
    service: "BankConnector",
    action: bankConnectorActionHelp_(),
  });
}

function doPost(e) {
  log_("doPost started");
  try {
    const body = e && e.postData ? JSON.parse(e.postData.contents) : {};
    log_("doPost body", { action: body.action, source: body.source, count: (body.transactions || []).length });
    if (body.action === "fill") {
      const result = fillSheetsImpl_(body);
      log_("doPost done", { action: result.action, row: result.row, cc: result.cc });
      return json(result);
    }
    const module = findBankConnectorModule_(body.action);
    if (module) {
      const result = module.impl(body);
      log_("doPost done", result);
      return json(result);
    }
    log_("doPost unknown action", body.action);
    return json({ ok: false, error: "Unknown action. " + bankConnectorActionHelp_() });
  } catch (err) {
    log_("doPost failed", { error: String(err.message || err) });
    return json({ ok: false, error: String(err.message || err) });
  }
}

function fillBalancesSheet() {
  log_("fillBalancesSheet started (menu)");
  try {
    const payload = callBankConnector_("/cron/prepare-balance-fill");
    const result = fillSheetsImpl_(payload);
    log_("fillBalancesSheet done", { action: result.action, row: result.row, cc: result.cc });
    try {
      SpreadsheetApp.getUi().alert(formatFillAlert_(result));
    } catch (ignore) {}
    return result;
  } catch (err) {
    log_("fillBalancesSheet failed", { error: String(err.message || err) });
    try { SpreadsheetApp.getUi().alert(String(err.message || err)); } catch (ignore) {}
    throw err;
  }
}

function formatFillAlert_(result) {
  const parts = [];
  if (result.action === "skip") parts.push("Balances: skipped (" + (result.reason || "already filled") + ")");
  else parts.push("Balances: filled row " + result.row + " (" + result.date + ")");
  if (result.cc) {
    if (result.cc.action === "skip") parts.push("CC: skipped (" + (result.cc.reason || "already filled") + ")");
    else parts.push("CC: filled row " + result.cc.row + " (" + result.cc.date + ", " + result.cc.close + ")");
  }
  return parts.join("\n");
}

function fillSheetsImpl_(body) {
  body = body || {};
  log_("fillSheetsImpl started", { date: body.date, fxDate: body.fxDate });
  const cc = fillCcSheetImpl_(body);
  const balances = fillBalancesSheetImpl_(body);
  const result = Object.assign({}, balances, { cc: cc });
  log_("fillSheetsImpl done", { balances: { action: balances.action, row: balances.row }, cc: cc });
  return result;
}

function findBalancesColumnMap_(sheet) {
  return bankConnectorFindColumnMap_(sheet, BALANCE_HEADERS);
}

function findCcColumnMap_(sheet) {
  return bankConnectorFindColumnMap_(sheet, CC_HEADERS);
}

function fillBalancesSheetImpl_(body) {
  const sheet = getBalancesSheet_();
  const colMap = findBalancesColumnMap_(sheet);
  if (!colMap.date) throw new Error('Balances tab missing "Date" header in row 1');
  const missing = bankConnectorMissingHeaders_(colMap, BALANCE_HEADERS);
  const requiredMissing = missing.filter(function (h) {
    return h !== BALANCE_HEADERS.total && h !== BALANCE_HEADERS.inTransit;
  });
  if (requiredMissing.length) {
    throw new Error("Balances tab missing headers: " + requiredMissing.join(", "));
  }

  const today = body.date || athensDateString_();
  const target = resolveTargetRow_(sheet, today, colMap.date, function (row) {
    return balanceRowIsFilled_(sheet, row, colMap);
  });

  log_("Balances target row", target);

  if (target.action === "skip") {
    writeInTransit_(sheet, target.row, colMap, body.inTransit);
    log_("Balances skipped", { reason: target.reason, row: target.row });
    return {
      ok: true,
      action: "skip",
      reason: target.reason || "Today already filled",
      row: target.row,
      date: today,
      inTransitUpdated: Boolean(colMap.inTransit),
    };
  }

  const columns = body.columns;
  if (!columns) throw new Error("Missing columns in fill request");
  log_("Balances writing columns", columns);

  if (target.setDate) {
    copyRowFormat_(sheet, target.templateRow, target.row);
    sheet.getRange(target.row, colMap.date).setValue(today);
  }

  writeBalanceValues_(sheet, target.row, columns, colMap);
  writeInTransit_(sheet, target.row, colMap, body.inTransit);
  copyTotalFormula_(sheet, target.templateRow, target.row, colMap);

  return {
    ok: true,
    action: target.setDate ? "appended" : "updated",
    row: target.row,
    date: today,
    columns: columns,
  };
}

function fillCcSheetImpl_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CC_SHEET_NAME);
  if (!sheet) return { ok: true, action: "skip", reason: "CC sheet not found" };

  const ccCol = findCcColumnMap_(sheet);
  if (!ccCol.date || !ccCol.close) {
    return { ok: true, action: "skip", reason: "CC sheet missing Date or Close header" };
  }

  const rateDate = body.fxDate || body.date || athensDateString_();
  const close = body.eurUsdClose;
  if (close === undefined || close === null) {
    return { ok: true, action: "skip", reason: "No EUR/USD rate in fill request" };
  }

  const gapFill = fillCcGapDays_(sheet, ccCol, rateDate, close, body.date || athensDateString_());
  if (gapFill) return gapFill;

  const target = resolveTargetRow_(sheet, rateDate, ccCol.date, function (row) {
    const value = sheet.getRange(row, ccCol.close).getValue();
    return value !== "" && value !== null && value !== 0;
  });

  log_("CC target row", target);

  if (target.action === "skip") {
    log_("CC skipped", { reason: target.reason, row: target.row });
    return { ok: true, action: "skip", reason: target.reason || "Already filled", row: target.row, date: rateDate, close: close };
  }

  log_("CC writing close", { row: target.row, date: rateDate, close: close });

  if (target.setDate) {
    copyRowFormat_(sheet, target.templateRow, target.row);
    sheet.getRange(target.row, ccCol.date).setValue(rateDate);
  }

  sheet.getRange(target.row, ccCol.close).setValue(close);

  return {
    ok: true,
    action: target.setDate ? "appended" : "updated",
    row: target.row,
    date: rateDate,
    close: close,
  };
}

/**
 * ECB publishes no rate on weekends/holidays, but bank tabs VLOOKUP every calendar day.
 * Append each missing day after the last CC row up to today: days before the ECB rate date
 * carry the previous close, the rate date and later carry the new close (Friday → Sat/Sun).
 * Returns null when the last CC row is not before today (normal path handles it).
 */
function fillCcGapDays_(sheet, ccCol, rateDate, close, today) {
  const lastRow = findLastDateRow_(sheet, ccCol.date);
  if (lastRow < 2) return null;
  const lastDate = toIsoDate_(sheet.getRange(lastRow, ccCol.date).getValue());
  const lastClose = sheet.getRange(lastRow, ccCol.close).getValue();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDate) || lastDate >= today || lastClose === "" || lastClose === null) return null;

  const rows = [];
  for (let day = ccNextIsoDay_(lastDate); day <= today && rows.length < 31; day = ccNextIsoDay_(day)) {
    rows.push({ date: day, close: day >= rateDate ? close : lastClose });
  }
  if (!rows.length) return null;

  rows.forEach(function (row, i) {
    const r = lastRow + 1 + i;
    copyRowFormat_(sheet, lastRow, r);
    sheet.getRange(r, ccCol.date).setValue(row.date);
    sheet.getRange(r, ccCol.close).setValue(row.close);
  });
  log_("CC gap days written", { fromRow: lastRow + 1, rows: rows });

  const last = rows[rows.length - 1];
  return { ok: true, action: "appended", row: lastRow + rows.length, date: last.date, close: last.close, added: rows.length };
}

function ccNextIsoDay_(iso) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getBalancesSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet "Balances" not found');
  return sheet;
}

function toIsoDate_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, "Europe/Athens", "yyyy-MM-dd");
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, "Europe/Athens", "yyyy-MM-dd");
  return text;
}

function findLastDateRow_(sheet, dateCol) {
  const values = sheet.getRange(1, dateCol, sheet.getLastRow(), dateCol).getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (toIsoDate_(values[i][0])) return i + 1;
  }
  return 1;
}

function resolveTargetRow_(sheet, today, dateCol, rowIsFilledFn) {
  const lastRow = findLastDateRow_(sheet, dateCol);
  const lastDate = toIsoDate_(sheet.getRange(lastRow, dateCol).getValue());

  if (lastDate === today) {
    if (rowIsFilledFn(lastRow)) {
      return { action: "skip", row: lastRow, reason: "Today already filled" };
    }
    return { action: "fill", row: lastRow, setDate: false, templateRow: lastRow > 2 ? lastRow - 1 : lastRow };
  }

  if (!lastDate || lastDate < today) {
    const newRow = lastRow + 1;
    return { action: "fill", row: newRow, setDate: true, templateRow: lastRow };
  }

  return { action: "skip", row: lastRow, reason: "Last date is in the future: " + lastDate };
}

function balanceRowIsFilled_(sheet, row, colMap) {
  return BALANCE_FILL_KEYS.some(function (key) {
    const col = colMap[key];
    if (!col) return false;
    const value = sheet.getRange(row, col).getValue();
    return value !== "" && value !== null && value !== 0;
  });
}

function writeBalanceValues_(sheet, row, columns, colMap) {
  BALANCE_FILL_KEYS.forEach(function (key) {
    const col = colMap[key];
    const value = columns[key];
    if (!col || value === undefined || value === null) return;
    sheet.getRange(row, col).setValue(value);
  });
}

function writeInTransit_(sheet, row, colMap, resolved) {
  var col = colMap.inTransit;
  if (!col) return;
  resolved = resolved || {};
  var amount = Math.round(Number(resolved.amountUsd) || 0);
  var cell = sheet.getRange(row, col);
  if (amount > 0) {
    cell.setValue(amount);
    if (resolved.note) cell.setNote(resolved.note);
    else cell.clearNote();
  } else {
    cell.clearContent();
    cell.clearNote();
  }
  log_("In transit", { row: row, amountUsd: amount, source: "bank-api" });
}

function copyTotalFormula_(sheet, templateRow, row, colMap) {
  const totalCol = colMap.total;
  if (!totalCol) return;
  const formula = sheet.getRange(templateRow, totalCol).getFormula();
  if (formula) {
    sheet.getRange(row, totalCol).setFormula(formula.replace(new RegExp(templateRow, "g"), String(row)));
    return;
  }
  const sumCols = BALANCE_FILL_KEYS.map(function (key) { return colMap[key]; }).filter(Boolean).sort(function (a, b) { return a - b; });
  if (!sumCols.length) return;
  const startCol = columnLetter_(sumCols[0]);
  const endCol = columnLetter_(sumCols[sumCols.length - 1]);
  sheet.getRange(row, totalCol).setFormula("=SUM(" + startCol + row + ":" + endCol + row + ")");
}

function columnLetter_(col) {
  let letter = "";
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}
