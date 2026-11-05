import nextEnv from "@next/env";
import { google } from "googleapis";
import fs from "node:fs";
import path from "node:path";

const CONFIRM = "ROLLBACK_ATTENDANCE_SCHEDULE_V3";
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const args = parseArgs(process.argv.slice(2));
const writes = [];

try {
  if (!args.backupDir || !args.rollback || args.confirm !== CONFIRM) throw new Error("Rollback requires --backup-dir, --rollback, and exact confirmation.");
  const backupDir = path.resolve(args.backupDir);
  const manifest = readJson(path.join(backupDir, "manifest.json"));
  const touched = readJson(path.join(backupDir, "touched-records.json"));
  const backup = {
    Attendance_Sessions: readJson(path.join(backupDir, "attendance-sessions.json")),
    Attendance_Session_Groups: readJson(path.join(backupDir, "attendance-session-groups.json")),
    Batches: readJson(path.join(backupDir, "batches.json")),
    Batch_Levels: readJson(path.join(backupDir, "batch-levels.json")),
  };
  validateManifest(manifest);
  const client = await sheetsClient();
  const live = await readSheets(client.sheets, client.spreadsheetId);

  await restoreRows(client.sheets, client.spreadsheetId, "Batches", live.Batches, backup.Batches, "Batch_ID", Object.keys(touched.updated.batches ?? {}));
  await restoreRows(client.sheets, client.spreadsheetId, "Batch_Levels", live.Batch_Levels, backup.Batch_Levels, "Batch_Level_ID", Object.keys(touched.updated.batchLevels ?? {}));
  await restoreRows(client.sheets, client.spreadsheetId, "Attendance_Sessions", live.Attendance_Sessions, backup.Attendance_Sessions, "Attendance_Session_ID", Object.keys(touched.updated.sessions ?? {}));
  await restoreRows(client.sheets, client.spreadsheetId, "Attendance_Session_Groups", live.Attendance_Session_Groups, backup.Attendance_Session_Groups, mappingIdHeader(live.Attendance_Session_Groups.headers), Object.keys(touched.updated.mappings ?? {}));

  const afterRestore = await readSheets(client.sheets, client.spreadsheetId);
  await deleteCreatedRows(client.sheets, client.spreadsheetId, "Attendance_Session_Groups", afterRestore.Attendance_Session_Groups, mappingIdHeader(afterRestore.Attendance_Session_Groups.headers), touched.created.mappings ?? []);
  const afterMappings = await readSheets(client.sheets, client.spreadsheetId);
  await deleteCreatedRows(client.sheets, client.spreadsheetId, "Attendance_Sessions", afterMappings.Attendance_Sessions, "Attendance_Session_ID", touched.created.sessions ?? []);

  const report = `# Attendance Schedule Rollback Report

- Rollback timestamp: ${new Date().toISOString()}
- Backup directory: ${backupDir}
- Writes performed: ${writes.length}
- Result: ROLLBACK COMPLETED
`;
  fs.writeFileSync(path.join(backupDir, "rollback-report.md"), report, "utf8");
  console.log("ROLLBACK COMPLETED");
} catch (error) {
  console.error(String(error?.message ?? error));
  process.exit(1);
}

async function sheetsClient() {
  nextEnv.loadEnvConfig(process.cwd());
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const encoded = requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({ credentials, scopes: [WRITE_SCOPE] });
  return { spreadsheetId, sheets: google.sheets({ version: "v4", auth }) };
}

async function readSheets(sheets, spreadsheetId) {
  const result = {};
  for (const sheet of ["Attendance_Sessions", "Attendance_Session_Groups", "Batches", "Batch_Levels"]) {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheet}'!A:ZZ`, valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
    result[sheet] = rowsFromValues(response.data.values ?? []);
  }
  return result;
}

async function restoreRows(sheets, spreadsheetId, sheetName, liveSheet, backupSheet, idField, ids) {
  if (!ids.length) return;
  const live = uniqueRows(liveSheet.rows, idField);
  const backup = uniqueRows(backupSheet.rows, idField);
  const data = [];
  for (const id of ids) {
    const liveRow = live.get(id);
    const oldRow = backup.get(id);
    if (!liveRow || !oldRow) throw new Error(`Cannot restore ${sheetName}:${id}`);
    liveSheet.headers.forEach((header, index) => {
      const oldValue = oldRow[header] ?? "";
      if (text(liveRow[header]) !== text(oldValue)) data.push({ range: `'${sheetName}'!${columnName(index + 1)}${liveRow._rowNumber}`, values: [[oldValue]] });
    });
  }
  await batchUpdate(sheets, spreadsheetId, data, `${sheetName} restore`);
}

async function deleteCreatedRows(sheets, spreadsheetId, sheetName, sheet, idField, ids) {
  if (!ids.length) return;
  const live = uniqueRows(sheet.rows, idField);
  const rowNumbers = [];
  for (const id of ids) {
    const row = live.get(id);
    if (!row) continue;
    rowNumbers.push(row._rowNumber);
  }
  rowNumbers.sort((a, b) => b - a);
  const sheetId = await getSheetId(sheets, spreadsheetId, sheetName);
  const requests = rowNumbers.map(rowNumber => ({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } }));
  if (!requests.length) return;
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  writes.push(`${sheetName} deleted ${requests.length} rows`);
}

async function getSheetId(sheets, spreadsheetId, sheetName) {
  const response = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const found = response.data.sheets?.find(sheet => sheet.properties?.title === sheetName)?.properties?.sheetId;
  if (found === undefined || found === null) throw new Error(`Sheet id not found: ${sheetName}`);
  return found;
}

async function batchUpdate(sheets, spreadsheetId, data, label) {
  if (!data.length) return;
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data } });
  writes.push(`${label}: ${data.length} cells`);
}

function validateManifest(manifest) {
  for (const sheet of ["Attendance_Sessions", "Attendance_Session_Groups", "Batches", "Batch_Levels"]) if (!manifest.sheets?.includes(sheet)) throw new Error(`Backup manifest missing sheet ${sheet}`);
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function rowsFromValues(values) { const headers = (values[0] ?? []).map(value => text(value)); const rows = values.slice(1).map((cells, index) => { const row = { _rowNumber: index + 2 }; headers.forEach((header, column) => { if (header) row[header] = cells[column] ?? ""; }); return row; }).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && text(value))); return { headers, rows, values }; }
function uniqueRows(rows, field) { const map = new Map(); for (const row of rows) { const id = text(row[field]); if (!id) continue; if (map.has(id)) throw new Error(`Duplicate ${field}: ${id}`); map.set(id, row); } return map; }
function parseArgs(values) { const out = {}; for (let i = 0; i < values.length; i++) { if (values[i] === "--backup-dir") out.backupDir = values[++i]; else if (values[i] === "--rollback") out.rollback = true; else if (values[i] === "--confirm") out.confirm = values[++i]; } return out; }
function requiredEnv(name) { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured`); return value; }
function mappingIdHeader(headers) { return headers.includes("Session_Group_Map_ID") ? "Session_Group_Map_ID" : headers.includes("Attendance_Session_Group_ID") ? "Attendance_Session_Group_ID" : headers.includes("Attendance_Session_Group_Map_ID") ? "Attendance_Session_Group_Map_ID" : "Session_Group_Map_ID"; }
function text(value) { return String(value ?? "").trim(); }
function columnName(count) { let value = count, result = ""; while (value > 0) { value--; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); } return result; }
