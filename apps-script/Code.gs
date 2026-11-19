/**
 * 問句王投稿。綁在 Google 試算表上：擴充功能 → Apps Script。
 * doPost 新增一列（預設未審核）。doGet 只回傳 approved 為 TRUE 的列。
 * 部署說明見同資料夾的 SETUP.md。
 */

var SHEET_NAME = "投稿";
var HEADERS = [
  "id",
  "createdAt",
  "type",
  "submitter",
  "bank",
  "category",
  "title",
  "objectionId",
  "nodePath",
  "clientSays",
  "followUp",
  "dimension",
  "question",
  "C",
  "A",
  "R",
  "approved",
  "note"
];

function getSs_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("找不到試算表。請從試算表的「擴充功能 → Apps Script」建立這個程式。");
  }
  return ss;
}

function ensureSheet_() {
  var ss = getSs_();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#f4efe6");
    sh.setFrozenRows(1);
  }
  var header = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0].map(String);
  if (header[0] !== "id") {
    throw new Error("第一列必須是欄位名稱，且第一格是 id。請不要改第一列。");
  }
  var approvedCol = header.indexOf("approved") + 1;
  if (!approvedCol) throw new Error("找不到 approved 欄。");
  sh.getRange(2, approvedCol, 1000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build()
  );
  return { sheet: sh, header: header };
}

function clip_(value, max) {
  var text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (text.length > max) text = text.slice(0, max);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return text;
}

function append_(data) {
  if (data && String(data.company || "").trim()) {
    return "";
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var found = ensureSheet_();
    var sh = found.sheet;
    var id = Utilities.getUuid();
    var row = [
      id,
      Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss"),
      clip_(data.type, 40),
      clip_(data.submitter, 40),
      clip_(data.bank, 40),
      clip_(data.category, 40),
      clip_(data.title, 200),
      clip_(data.objectionId, 80),
      clip_(data.nodePath, 40),
      clip_(data.clientSays, 300),
      clip_(data.followUp, 400),
      clip_(data.dimension, 20),
      clip_(data.question, 400),
      clip_(data.C, 400),
      clip_(data.A, 400),
      clip_(data.R, 400),
      false,
      ""
    ];
    sh.appendRow(row);
    return id;
  } finally {
    lock.releaseLock();
  }
}

function readBody_(e) {
  if (e && e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }
  if (e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }
  throw new Error("沒有收到內容");
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var id = append_(readBody_(e));
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.payload) {
      var id = append_(JSON.parse(e.parameter.payload));
      return json_({ ok: true, id: id });
    }
    var found = ensureSheet_();
    var sh = found.sheet;
    var values = sh.getDataRange().getValues();
    var header = values[0].map(String);
    var approvedAt = header.indexOf("approved");
    var items = [];
    for (var r = 1; r < values.length; r++) {
      var approved = values[r][approvedAt];
      var yes = approved === true || String(approved).trim().toUpperCase() === "TRUE";
      if (!yes) continue;
      var item = {};
      for (var c = 0; c < header.length; c++) {
        var cell = values[r][c];
        if (cell instanceof Date) {
          item[header[c]] = Utilities.formatDate(cell, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
        } else if (typeof cell === "boolean") {
          item[header[c]] = cell ? "TRUE" : "FALSE";
        } else {
          item[header[c]] = cell == null ? "" : String(cell);
        }
      }
      items.push(item);
    }
    return json_({ ok: true, items: items });
  } catch (err) {
    return json_({ ok: false, error: String(err), items: [] });
  }
}
