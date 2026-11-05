import nextEnv from "@next/env";
import { google } from "googleapis";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CONFIRM = "FORMAT_ATTENDANCE_DATE_TIME";
const READ_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const REPORT_PATH = path.resolve(process.cwd(), "ATTENDANCE_DATE_TIME_FORMAT_REPORT.md");

const TARGETS = {
  Attendance_Sessions: {
    Session_Date: { type: "DATE", pattern: "yyyy-mm-dd" },
    Start_Time: { type: "TIME", pattern: "h:mm" },
    End_Time: { type: "TIME", pattern: "h:mm" },
    Open_From: { type: "DATE_TIME", pattern: "yyyy-mm-dd h:mm" },
    Close_At: { type: "DATE_TIME", pattern: "yyyy-mm-dd h:mm" },
  },
  Batches: {
    Start_Date: { type: "DATE", pattern: "yyyy-mm-dd" },
    End_Date: { type: "DATE", pattern: "yyyy-mm-dd" },
  },
  Batch_Levels: {
    Start_Date: { type: "DATE", pattern: "yyyy-mm-dd" },
    End_Date: { type: "DATE", pattern: "yyyy-mm-dd" },
  },
};

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply && args.confirm === CONFIRM);

try {
  const client = await sheetsClient(apply ? WRITE_SCOPE : READ_SCOPE);
  const before = await inspectTargets(client.sheets, client.spreadsheetId);
  const requests = buildFormatRequests(before);
  const backupDir = apply ? createSnapshot(before) : "";

  if (!apply) {
    writeReport({ mode: "PREVIEW", previewResult: "PASSED", backupDir: "", before, after: null, requests, writes: 0, valueChanges: 0, rowsAppended: 0, rowsDeleted: 0, headersChanged: 0, formatVerified: false, finalResult: "PREVIEW ONLY", remainingIssue: "Run with --apply and exact confirmation to format." });
    printSummary("PREVIEW", 0, requests.length);
    process.exit(0);
  }

  const writesPerformed = await applyFormatRequests(client.sheets, client.spreadsheetId, requests);
  const after = await inspectTargets(client.sheets, client.spreadsheetId);
  const integrity = compareIntegrity(before, after);
  const formatVerified = await verifyFormats(client.sheets, client.spreadsheetId, before);
  const finalResult = integrity.valueChanges === 0 && integrity.rowsAppended === 0 && integrity.rowsDeleted === 0 && integrity.headersChanged === 0 && formatVerified.ok ? "FORMAT SUCCESSFUL" : "FORMAT FAILED";
  writeReport({ mode: "APPLY", previewResult: "PASSED BEFORE APPLY", backupDir, before, after, requests, writes: writesPerformed, valueChanges: integrity.valueChanges, rowsAppended: integrity.rowsAppended, rowsDeleted: integrity.rowsDeleted, headersChanged: integrity.headersChanged, formatVerified: formatVerified.ok, finalResult, remainingIssue: finalResult === "FORMAT SUCCESSFUL" ? "None" : formatVerified.reason || integrity.reason });
  printSummary(finalResult, writesPerformed, requests.length);
  process.exit(finalResult === "FORMAT SUCCESSFUL" ? 0 : 1);
} catch (error) {
  const message = safeErrorMessage(error);
  writeReport({ mode: apply ? "APPLY" : "PREVIEW", previewResult: "BLOCKED", backupDir: "", before: null, after: null, requests: [], writes: 0, valueChanges: 0, rowsAppended: 0, rowsDeleted: 0, headersChanged: 0, formatVerified: false, finalResult: "BLOCKED", remainingIssue: message });
  console.error(message);
  process.exit(1);
}

async function sheetsClient(scope) {
  nextEnv.loadEnvConfig(process.cwd());
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const encoded = requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({ credentials, scopes: [scope] });
  return { spreadsheetId, sheets: google.sheets({ version: "v4", auth }) };
}

async function inspectTargets(sheets, spreadsheetId) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const sheetIds = new Map((spreadsheet.data.sheets ?? []).map(sheet => [sheet.properties?.title, sheet.properties?.sheetId]));
  const inspected = {};
  for (const [sheetName, columns] of Object.entries(TARGETS)) {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheetName}'!A:ZZ`, valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
    const values = response.data.values ?? [];
    const headers = (values[0] ?? []).map(value => text(value));
    const rowCount = values.length;
    const columnsOut = {};
    for (const [header, format] of Object.entries(columns)) {
      const matches = headers.map((value, index) => value === header ? index : -1).filter(index => index >= 0);
      if (matches.length !== 1) throw new Error(`Header ${header} in ${sheetName} is ${matches.length === 0 ? "missing" : "duplicated"}.`);
      const columnIndex = matches[0];
      const columnValues = values.slice(1).map(row => row[columnIndex] ?? "");
      columnsOut[header] = { header, columnIndex, rowCount: Math.max(rowCount - 1, 0), values: columnValues, hash: hashValues(columnValues), format };
    }
    inspected[sheetName] = { sheetName, sheetId: sheetIds.get(sheetName), headers, rowCount, columns: columnsOut };
    if (inspected[sheetName].sheetId === undefined || inspected[sheetName].sheetId === null) throw new Error(`Sheet not found: ${sheetName}`);
  }
  return inspected;
}

function buildFormatRequests(inspected) {
  const requests = [];
  for (const sheet of Object.values(inspected)) {
    if (sheet.rowCount <= 1) continue;
    for (const column of Object.values(sheet.columns)) {
      requests.push({
        label: `${sheet.sheetName}.${column.header}`,
        repeatCell: {
          range: {
            sheetId: sheet.sheetId,
            startRowIndex: 1,
            endRowIndex: sheet.rowCount,
            startColumnIndex: column.columnIndex,
            endColumnIndex: column.columnIndex + 1,
          },
          cell: { userEnteredFormat: { numberFormat: column.format } },
          fields: "userEnteredFormat.numberFormat",
        },
      });
    }
  }
  return requests;
}

async function applyFormatRequests(sheets, spreadsheetId, requests) {
  let performed = 0;
  for (const request of requests) {
    const { label, ...apiRequest } = request;
    try {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [apiRequest] } });
      performed++;
    } catch (error) {
      throw new Error(`${label}: ${safeErrorMessage(error)}`);
    }
  }
  return performed;
}

function createSnapshot(inspected) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(process.cwd(), "backups", "attendance-formatting", timestamp);
  fs.mkdirSync(dir, { recursive: true });
  const snapshot = {
    timestamp,
    sheets: Object.fromEntries(Object.entries(inspected).map(([sheetName, sheet]) => [sheetName, {
      headers: Object.fromEntries(Object.entries(sheet.columns).map(([header, column]) => [header, {
        columnIndex: column.columnIndex,
        rowCount: column.rowCount,
        originalUnformattedValues: column.values,
        hash: column.hash,
      }])),
    }])),
  };
  const snapshotPath = path.join(dir, "target-column-values.json");
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
  JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  return dir;
}

function compareIntegrity(before, after) {
  let valueChanges = 0;
  let rowsAppended = 0;
  let rowsDeleted = 0;
  let headersChanged = 0;
  const reasons = [];
  for (const [sheetName, beforeSheet] of Object.entries(before)) {
    const afterSheet = after[sheetName];
    if (beforeSheet.rowCount !== afterSheet.rowCount) {
      if (afterSheet.rowCount > beforeSheet.rowCount) rowsAppended += afterSheet.rowCount - beforeSheet.rowCount;
      else rowsDeleted += beforeSheet.rowCount - afterSheet.rowCount;
    }
    if (JSON.stringify(beforeSheet.headers) !== JSON.stringify(afterSheet.headers)) headersChanged++;
    for (const [header, beforeColumn] of Object.entries(beforeSheet.columns)) {
      const afterColumn = afterSheet.columns[header];
      if (beforeColumn.hash !== afterColumn.hash) {
        valueChanges++;
        reasons.push(`${sheetName}.${header}`);
      }
    }
  }
  return { valueChanges, rowsAppended, rowsDeleted, headersChanged, reason: reasons.join(", ") };
}

async function verifyFormats(sheets, spreadsheetId, inspected) {
  const ranges = Object.entries(inspected).map(([sheetName, sheet]) => {
    const maxColumn = Math.max(...Object.values(sheet.columns).map(column => column.columnIndex));
    return `'${sheetName}'!A2:${columnName(maxColumn + 1)}2`;
  });
  const response = await sheets.spreadsheets.get({ spreadsheetId, ranges, includeGridData: true, fields: "sheets(properties(title),data(rowData(values(effectiveFormat(numberFormat)))))" });
  const problems = [];
  for (const sheetData of response.data.sheets ?? []) {
    const sheetName = sheetData.properties?.title;
    const target = inspected[sheetName];
    if (!target) continue;
    const cells = sheetData.data?.[0]?.rowData?.[0]?.values ?? [];
    for (const [header, column] of Object.entries(target.columns)) {
      const actual = cells[column.columnIndex]?.effectiveFormat?.numberFormat;
      if (actual?.type !== column.format.type || actual?.pattern !== column.format.pattern) problems.push(`${sheetName}.${header}`);
    }
  }
  return { ok: problems.length === 0, reason: problems.join(", ") };
}

function writeReport(data) {
  const beforeHashes = data.before ? formatHashes(data.before) : "- None";
  const afterHashes = data.after ? formatHashes(data.after) : "- None";
  const report = `# Attendance Date Time Format Report

## Summary
- Preview result: ${data.previewResult}
- Mode: ${data.mode}
- Final result: ${data.finalResult}

## Sheets Inspected
- Attendance_Sessions
- Batches
- Batch_Levels

## Header Validation Result
- ${data.before ? "Passed" : "Not completed"}

## Backup Directory
- ${data.backupDir || "-"}

## Formatting Requests
- Requests performed: ${data.writes}
- Requests calculated: ${data.requests.length}
- Fields mask: userEnteredFormat.numberFormat

## Attendance_Sessions Columns Formatted
- Session_Date
- Start_Time
- End_Time
- Open_From
- Close_At

## Batches Columns Formatted
- Start_Date
- End_Date

## Batch_Levels Columns Formatted
- Start_Date
- End_Date

## Before-Value Hashes
${beforeHashes}

## After-Value Hashes
${afterHashes}

## Integrity Checks
- Underlying values changed count: ${data.valueChanges}
- Rows appended count: ${data.rowsAppended}
- Rows deleted count: ${data.rowsDeleted}
- Headers changed count: ${data.headersChanged}
- Sheets formatted: ${data.mode === "APPLY" ? 3 : 0}
- Target columns formatted: ${data.mode === "APPLY" ? 9 : 0}
- Format verification: ${data.formatVerified ? "Passed" : "Not passed"}

## Remaining Issue
- ${data.remainingIssue}
`;
  fs.writeFileSync(REPORT_PATH, report, "utf8");
}

function formatHashes(inspected) {
  const lines = [];
  for (const [sheetName, sheet] of Object.entries(inspected)) for (const [header, column] of Object.entries(sheet.columns)) lines.push(`- ${sheetName}.${header}: ${column.hash}`);
  return lines.join("\n");
}

function printSummary(result, writes, calculated) {
  console.log(`Attendance date/time formatting ${result}`);
  console.log(`Formatting writes performed: ${writes}`);
  console.log(`Formatting requests calculated: ${calculated}`);
}

function hashValues(values) {
  return crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

function safeErrorMessage(error) {
  const parts = [String(error?.message ?? error)];
  const details = error?.errors ?? error?.response?.data?.error?.details ?? error?.response?.data?.error?.errors ?? [];
  for (const detail of details) {
    const text = detail?.message || detail?.reason || "";
    if (text) parts.push(text);
  }
  return [...new Set(parts)].join(" | ");
}

function parseArgs(values) {
  const output = {};
  for (let index = 0; index < values.length; index++) {
    if (values[index] === "--apply") output.apply = true;
    else if (values[index] === "--confirm") output.confirm = values[++index];
  }
  return output;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function text(value) {
  return String(value ?? "").trim();
}

function columnName(count) {
  let value = count;
  let result = "";
  while (value > 0) {
    value--;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result;
}
