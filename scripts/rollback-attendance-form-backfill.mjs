import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { google } from "googleapis";

nextEnv.loadEnvConfig(process.cwd());

const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const CONFIRM = "ROLLBACK_ATTENDANCE_FORM_BACKFILL";

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.rollback || args.confirm !== CONFIRM) {
    console.log("Rollback preview only. Writes performed: 0");
    process.exit(0);
  }
  rollbackAttendanceBackfill(args.backupDir, { internal: false }).then(() => {
    console.log("Rollback completed.");
  }).catch(error => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}

export async function rollbackAttendanceBackfill(backupDir, _options = {}) {
  if (!backupDir) throw new Error("Backup directory is required.");
  const dir = path.resolve(backupDir);
  const manifest = readJson(path.join(dir, "manifest.json"));
  const backup = readJson(path.join(dir, "attendance-validated-full.json"));
  const creates = readJson(path.join(dir, "create-candidates.json"));
  const updates = readJson(path.join(dir, "update-candidates.json"));
  if (!manifest.backupCompletedBeforeWrites) throw new Error("Backup manifest is not valid for rollback.");
  const sheets = await sheetsClient();
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const current = rowsFromValues((await sheets.spreadsheets.values.get({ spreadsheetId, range: "'Attendance_Validated'!A:ZZ", valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" })).data.values ?? []);
  const headers = current.headers;
  const byId = new Map(current.rows.map(row => [text(row.Attendance_ID), row]));
  const updateData = [];
  for (const item of updates) {
    const live = byId.get(text(item.attendanceId));
    if (!live) throw new Error(`Updated row missing during rollback: ${item.attendanceId}`);
    const before = item.before;
    for (const header of headers) {
      const oldValue = before[header] ?? "";
      if (String(live[header] ?? "") === String(oldValue)) continue;
      updateData.push({ range: `'Attendance_Validated'!${columnName(headers.indexOf(header) + 1)}${live._rowNumber}`, values: [[oldValue]] });
    }
  }
  for (const chunk of chunkData(updateData, 400)) {
    if (chunk.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data: chunk } });
  }
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
  const sheetId = metadata.data.sheets?.find(sheet => sheet.properties?.title === "Attendance_Validated")?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) throw new Error("Attendance_Validated sheet metadata unavailable.");
  const deleteRows = [];
  for (const item of creates) {
    const live = byId.get(text(item.attendanceId));
    if (!live) continue;
    if (text(live.Attendance_Session_ID) !== text(item.record.Attendance_Session_ID) || text(live.Resolved_Academy_Student_ID) !== text(item.record.Resolved_Academy_Student_ID) || text(live.Attendance_Status) !== "Present" || text(live.Validation_Status) !== "Valid") throw new Error(`Created row has unexpected edits: ${item.attendanceId}`);
    deleteRows.push(live._rowNumber);
  }
  const requests = deleteRows.sort((a, b) => b - a).map(rowNumber => ({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } }));
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  const after = rowsFromValues((await sheets.spreadsheets.values.get({ spreadsheetId, range: "'Attendance_Validated'!A:ZZ", valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" })).data.values ?? []);
  if (after.rows.length !== backup.rows.length) throw new Error("Rollback row count does not match backup.");
  const backupById = new Map(backup.rows.map(row => [text(row.Attendance_ID), row]));
  for (const row of after.rows) {
    const original = backupById.get(text(row.Attendance_ID));
    if (!original) throw new Error(`Unexpected row remains after rollback: ${row.Attendance_ID}`);
    for (const header of backup.headers) {
      if (String(row[header] ?? "") !== String(original[header] ?? "")) throw new Error(`Rollback mismatch for ${row.Attendance_ID} ${header}`);
    }
  }
}

async function sheetsClient() {
  const credentials = JSON.parse(Buffer.from(requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64"), "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({ credentials, scopes: [WRITE_SCOPE] });
  return google.sheets({ version: "v4", auth });
}

function rowsFromValues(values) {
  const headers = (values[0] ?? []).map(value => text(value));
  return { headers, rows: values.slice(1).map((row, index) => {
    const object = { _rowNumber: index + 2 };
    headers.forEach((header, column) => { if (header) object[header] = String(row[column] ?? ""); });
    return object;
  }).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && text(value))) };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--backup-dir") parsed.backupDir = argv[++index] ?? "";
    else if (argv[index] === "--rollback") parsed.rollback = true;
    else if (argv[index] === "--confirm") parsed.confirm = argv[++index] ?? "";
  }
  return parsed;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function chunkData(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

function columnName(index) {
  let value = index;
  let name = "";
  while (value > 0) {
    value--;
    name = String.fromCharCode(65 + value % 26) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function text(value) {
  return String(value ?? "").trim();
}
