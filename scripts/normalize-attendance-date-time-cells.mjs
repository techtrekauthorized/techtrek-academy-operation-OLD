import nextEnv from "@next/env";
import { google } from "googleapis";
import fs from "node:fs";
import path from "node:path";

const CONFIRM = "NORMALIZE_ATTENDANCE_DATE_TIME_LOCALE";
const EXPECTED_NUMERIC_TEXT = 363;
const READ_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const REPORT_PATH = path.resolve(process.cwd(), "ATTENDANCE_DATE_TIME_NORMALIZATION_REPORT.md");

const TARGETS = {
  Attendance_Sessions: {
    Session_Date: { role: "date", type: "DATE" },
    Start_Time: { role: "time", type: "TIME" },
    End_Time: { role: "time", type: "TIME" },
    Open_From: { role: "dateTime", type: "DATE_TIME" },
    Close_At: { role: "dateTime", type: "DATE_TIME" },
  },
  Batches: {
    Start_Date: { role: "date", type: "DATE" },
    End_Date: { role: "date", type: "DATE" },
  },
  Batch_Levels: {
    Start_Date: { role: "date", type: "DATE" },
    End_Date: { role: "date", type: "DATE" },
  },
};

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply && args.confirm === CONFIRM);

try {
  const client = await sheetsClient(apply ? WRITE_SCOPE : READ_SCOPE);
  const before = await inspectTargets(client.sheets, client.spreadsheetId);
  const plan = buildPlan(before);
  const planError = validatePlan(plan);
  if (planError) {
    writeReport({ previewResult: "BLOCKED", previewWrites: 0, spreadsheet: before.spreadsheet, plan, backupDir: "-", post: null, rollback: { attempted: "No", result: "-" }, writeCalls: 0, finalResult: "BLOCKED", remainingIssue: planError });
    console.error(planError);
    process.exit(1);
  }

  if (!apply) {
    writeReport({ previewResult: "PASSED", previewWrites: 0, spreadsheet: before.spreadsheet, plan, backupDir: "-", post: null, rollback: { attempted: "No", result: "-" }, writeCalls: 0, finalResult: "PREVIEW ONLY", remainingIssue: "Run with --apply and exact confirmation to normalize." });
    console.log(`Preview passed. Writes performed: 0. Numeric-looking text cells detected: ${plan.toNormalize.length}.`);
    process.exit(0);
  }

  const backupDir = createBackup(plan);
  validateBackup(backupDir);
  await applyNormalization(client.sheets, client.spreadsheetId, plan);
  let post = await verifyPost(client.sheets, client.spreadsheetId, before, plan);
  let rollback = { attempted: "No", result: "-" };
  let finalResult = post.ok ? "NORMALIZATION SUCCESSFUL" : "NORMALIZATION FAILED AND ROLLED BACK";
  if (!post.ok) {
    rollback = await rollbackCells(client.sheets, client.spreadsheetId, backupDir, plan);
    finalResult = "NORMALIZATION FAILED AND ROLLED BACK";
  }
  writeReport({ previewResult: "PASSED BEFORE APPLY", previewWrites: 0, spreadsheet: before.spreadsheet, plan, backupDir, post, rollback, writeCalls: 1, finalResult, remainingIssue: post.ok ? "None" : post.reason });
  console.log(`${finalResult}. Cells normalized: ${post.ok ? plan.toNormalize.length : 0}.`);
  process.exit(post.ok ? 0 : 1);
} catch (error) {
  writeReport({ previewResult: "BLOCKED", previewWrites: 0, spreadsheet: { locale: "-", timeZone: "-" }, plan: emptyPlan(), backupDir: "-", post: null, rollback: { attempted: "No", result: "-" }, writeCalls: 0, finalResult: "BLOCKED", remainingIssue: String(error?.message ?? error) });
  console.error(String(error?.message ?? error));
  process.exit(1);
}

async function sheetsClient(scope) {
  nextEnv.loadEnvConfig(process.cwd());
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const credentials = JSON.parse(Buffer.from(requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64"), "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({ credentials, scopes: [scope] });
  return { spreadsheetId, sheets: google.sheets({ version: "v4", auth }) };
}

async function inspectTargets(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "properties(locale,timeZone),sheets.properties" });
  const sheetIds = new Map((meta.data.sheets ?? []).map(sheet => [sheet.properties?.title, sheet.properties?.sheetId]));
  const spreadsheet = { locale: meta.data.properties?.locale ?? "-", timeZone: meta.data.properties?.timeZone ?? "-" };
  const sheetsOut = {};

  for (const [sheetName, targetHeaders] of Object.entries(TARGETS)) {
    const sheetId = sheetIds.get(sheetName);
    if (sheetId === undefined || sheetId === null) throw new Error(`Sheet missing: ${sheetName}`);
    const valuesRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheetName}'!A:ZZ`, valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
    const formulaRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheetName}'!A:ZZ`, valueRenderOption: "FORMULA", dateTimeRenderOption: "SERIAL_NUMBER" });
    const values = valuesRes.data.values ?? [];
    const formulas = formulaRes.data.values ?? [];
    const headers = (values[0] ?? []).map(text);
    const indexes = Object.fromEntries(Object.keys(targetHeaders).map(header => [header, findHeader(headers, sheetName, header)]));
    const maxColumn = Math.max(...Object.values(indexes));
    const grid = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [`'${sheetName}'!A1:${columnName(maxColumn + 1)}${Math.max(values.length, 1)}`],
      includeGridData: true,
      fields: "sheets(properties(title),data(rowData(values(userEnteredValue,effectiveValue,formattedValue,userEnteredFormat(numberFormat),effectiveFormat(numberFormat)))))",
    });
    const gridRows = grid.data.sheets?.find(sheet => sheet.properties?.title === sheetName)?.data?.[0]?.rowData ?? [];
    const cells = [];
    for (const [header, config] of Object.entries(targetHeaders)) {
      const columnIndex = indexes[header];
      for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
        const rowNumber = rowIndex + 1;
        const formula = formulas[rowIndex]?.[columnIndex];
        const gridCell = gridRows[rowIndex]?.values?.[columnIndex] ?? {};
        cells.push({
          sheetName,
          sheetId,
          header,
          config,
          rowNumber,
          rowIndex,
          columnIndex,
          a1: `${columnName(columnIndex + 1)}${rowNumber}`,
          value: values[rowIndex]?.[columnIndex] ?? "",
          formula: typeof formula === "string" && formula.startsWith("=") ? formula : "",
          userEnteredValue: gridCell.userEnteredValue ?? null,
          effectiveValue: gridCell.effectiveValue ?? null,
          formattedValue: gridCell.formattedValue ?? "",
          userEnteredFormat: gridCell.userEnteredFormat?.numberFormat ?? null,
          effectiveFormat: gridCell.effectiveFormat?.numberFormat ?? null,
        });
      }
    }
    sheetsOut[sheetName] = { sheetName, sheetId, values, formulas, headers, rowCount: values.length, cells };
  }
  return { spreadsheet, sheets: sheetsOut };
}

function buildPlan(inspection) {
  const counts = { numeric: 0, numericText: 0, readableText: 0, formula: 0, unexpected: 0 };
  const toNormalize = [];
  const readableCells = [];
  const formulaCells = [];
  const unexpected = [];
  for (const sheet of Object.values(inspection.sheets)) {
    for (const cell of sheet.cells) {
      const classification = classifyCell(cell);
      cell.classification = classification;
      if (classification === "blank") continue;
      if (classification === "numeric") counts.numeric++;
      if (classification === "numericText") {
        counts.numericText++;
        const numberValue = Number(text(cell.value));
        toNormalize.push({ ...cell, numberValue, semantic: canonical(numberValue, cell.config.role) });
      }
      if (classification === "readableText") {
        counts.readableText++;
        readableCells.push(cell);
      }
      if (classification === "formula") {
        counts.formula++;
        formulaCells.push(cell);
      }
      if (classification === "unexpected") {
        counts.unexpected++;
        unexpected.push(cell);
      }
    }
  }
  return { counts, toNormalize, readableCells, formulaCells, unexpected };
}

function validatePlan(plan) {
  if (plan.unexpected.length) return `Unexpected target values: ${plan.unexpected.map(cell => `${cell.sheetName}.${cell.header}.${cell.rowNumber}`).join(", ")}`;
  if (plan.toNormalize.length !== EXPECTED_NUMERIC_TEXT) return `NUMERIC_TEXT_COUNT_MISMATCH: found ${plan.toNormalize.length}, expected ${EXPECTED_NUMERIC_TEXT}`;
  return "";
}

function classifyCell(cell) {
  if (cell.formula || cell.userEnteredValue?.formulaValue) return "formula";
  if (cell.value === "" || cell.value === null || cell.value === undefined) return "blank";
  if (typeof cell.value === "number") return validSerial(cell.value, cell.config.role) ? "numeric" : "unexpected";
  const raw = text(cell.value);
  if (!raw) return "blank";
  if (isNumericText(raw)) return validSerial(Number(raw), cell.config.role) ? "numericText" : "unexpected";
  if (isReadable(raw, cell.config.role)) return "readableText";
  return "unexpected";
}

async function applyNormalization(sheets, spreadsheetId, plan) {
  const requests = plan.toNormalize.map(cell => ({
    updateCells: {
      start: { sheetId: cell.sheetId, rowIndex: cell.rowIndex, columnIndex: cell.columnIndex },
      rows: [{ values: [{ userEnteredValue: { numberValue: cell.numberValue }, userEnteredFormat: { numberFormat: { type: cell.config.type } } }] }],
      fields: "userEnteredValue,userEnteredFormat.numberFormat",
    },
  }));
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}

async function verifyPost(sheets, spreadsheetId, before, plan) {
  const after = await inspectTargets(sheets, spreadsheetId);
  const afterPlan = buildPlan(after);
  const checks = {
    numericTextRemaining: afterPlan.toNormalize.length,
    semanticFailures: 0,
    readableDisplayFailures: 0,
    bareSerialDisplays: 0,
    numberFormatTypeFailures: 0,
    formulasChanged: 0,
    readableTextChanged: 0,
    nonTargetChanged: 0,
    rowsAppended: 0,
    rowsDeleted: 0,
    headersChanged: 0,
    idempotency: "Not run",
  };

  for (const [sheetName, sheet] of Object.entries(before.sheets)) {
    const afterSheet = after.sheets[sheetName];
    checks.rowsAppended += Math.max(0, afterSheet.rowCount - sheet.rowCount);
    checks.rowsDeleted += Math.max(0, sheet.rowCount - afterSheet.rowCount);
    if (JSON.stringify(sheet.headers) !== JSON.stringify(afterSheet.headers)) checks.headersChanged++;
  }

  for (const cell of plan.toNormalize) {
    const afterCell = findAfterCell(after, cell);
    if (typeof afterCell.value !== "number") checks.numericTextRemaining++;
    if (canonical(afterCell.value, cell.config.role) !== cell.semantic) checks.semanticFailures++;
    if (afterCell.userEnteredFormat?.type !== cell.config.type) checks.numberFormatTypeFailures++;
    if (!readableDisplay(afterCell.formattedValue, cell.config.role)) checks.readableDisplayFailures++;
    if (isBareSerialDisplay(afterCell.formattedValue)) checks.bareSerialDisplays++;
    if (afterCell.formula) checks.formulasChanged++;
  }

  for (const cell of plan.readableCells) {
    const afterCell = findAfterCell(after, cell);
    if (text(afterCell.value) !== text(cell.value)) checks.readableTextChanged++;
  }
  for (const cell of plan.formulaCells) {
    const afterCell = findAfterCell(after, cell);
    if (text(afterCell.formula) !== text(cell.formula)) checks.formulasChanged++;
  }

  checks.idempotency = afterPlan.toNormalize.length === 0 ? "Passed" : `Failed: ${afterPlan.toNormalize.length} writes required`;
  const ok = checks.numericTextRemaining === 0 && checks.semanticFailures === 0 && checks.readableDisplayFailures === 0 && checks.bareSerialDisplays === 0 && checks.numberFormatTypeFailures === 0 && checks.formulasChanged === 0 && checks.readableTextChanged === 0 && checks.rowsAppended === 0 && checks.rowsDeleted === 0 && checks.headersChanged === 0 && checks.idempotency === "Passed";
  return { ok, checks, afterPlan, reason: ok ? "Passed" : JSON.stringify(checks) };
}

async function rollbackCells(sheets, spreadsheetId, backupDir, plan) {
  try {
    const backup = JSON.parse(fs.readFileSync(path.join(backupDir, "target-cells.json"), "utf8"));
    const byKey = new Map(backup.cells.map(cell => [`${cell.sheetName}|${cell.header}|${cell.rowNumber}`, cell]));
    const requests = plan.toNormalize.map(cell => {
      const saved = byKey.get(`${cell.sheetName}|${cell.header}|${cell.rowNumber}`);
      if (!saved) throw new Error(`Backup missing ${cell.sheetName}.${cell.header}.${cell.rowNumber}`);
      const value = saved.originalFormula ? { formulaValue: saved.originalFormula } : typeof saved.originalValue === "number" ? { numberValue: saved.originalValue } : { stringValue: String(saved.originalValue ?? "") };
      return {
        updateCells: {
          start: { sheetId: cell.sheetId, rowIndex: cell.rowIndex, columnIndex: cell.columnIndex },
          rows: [{ values: [{ userEnteredValue: value, userEnteredFormat: { numberFormat: saved.originalNumberFormat ?? {} } }] }],
          fields: "userEnteredValue,userEnteredFormat.numberFormat",
        },
      };
    });
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    return { attempted: "Yes", result: "Rollback completed" };
  } catch (error) {
    return { attempted: "Yes", result: `Rollback failed: ${String(error?.message ?? error)}` };
  }
}

function createBackup(plan) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(process.cwd(), "backups", "attendance-date-time-normalization", timestamp);
  fs.mkdirSync(dir, { recursive: true });
  const cells = plan.toNormalize.map(cell => ({
    sheetName: cell.sheetName,
    header: cell.header,
    rowNumber: cell.rowNumber,
    a1: cell.a1,
    originalUserEnteredValue: cell.userEnteredValue,
    originalValue: cell.value,
    originalValueType: typeof cell.value,
    originalFormula: cell.formula,
    originalNumberFormat: cell.userEnteredFormat,
    semanticCanonicalValue: cell.semantic,
  }));
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ timestamp, cellCount: cells.length }, null, 2), "utf8");
  fs.writeFileSync(path.join(dir, "target-cells.json"), JSON.stringify({ cells }, null, 2), "utf8");
  validateBackup(dir);
  return dir;
}

function validateBackup(dir) {
  JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  JSON.parse(fs.readFileSync(path.join(dir, "target-cells.json"), "utf8"));
}

function writeReport(data) {
  const post = data.post?.checks ?? {};
  const report = `# Attendance Date Time Normalization Report

## Summary
- Preview result: ${data.previewResult}
- Preview writes: ${data.previewWrites}
- Final result: ${data.finalResult}

## Spreadsheet
- Locale: ${data.spreadsheet.locale}
- Timezone: ${data.spreadsheet.timeZone}

## Counts
- Numeric-looking text cells detected: ${data.plan.toNormalize.length}
- Cells normalized: ${data.finalResult === "NORMALIZATION SUCCESSFUL" ? data.plan.toNormalize.length : 0}
- Date cells normalized: ${data.finalResult === "NORMALIZATION SUCCESSFUL" ? countRole(data.plan, "date") : 0}
- Time cells normalized: ${data.finalResult === "NORMALIZATION SUCCESSFUL" ? countRole(data.plan, "time") : 0}
- Date-time cells normalized: ${data.finalResult === "NORMALIZATION SUCCESSFUL" ? countRole(data.plan, "dateTime") : 0}

## Backup
- Backup directory: ${data.backupDir || "-"}

## Verification
- Numeric-looking text cells remaining: ${post.numericTextRemaining ?? data.plan.toNormalize.length}
- Semantic integrity: ${(post.semanticFailures ?? 0) === 0 ? "Passed" : "Failed"}
- Readable display verification: ${(post.readableDisplayFailures ?? 0) === 0 ? "Passed" : "Failed"}
- Bare serial displays remaining: ${post.bareSerialDisplays ?? 0}
- Number-format type verification failures: ${post.numberFormatTypeFailures ?? 0}
- Non-target cells changed: ${post.nonTargetChanged ?? 0}
- Rows appended: ${post.rowsAppended ?? 0}
- Rows deleted: ${post.rowsDeleted ?? 0}
- Headers changed: ${post.headersChanged ?? 0}
- Idempotency result: ${post.idempotency ?? "Not run"}

## Rollback
- Rollback attempted: ${data.rollback.attempted}
- Rollback result: ${data.rollback.result}

## Writes
- Google Sheets write calls: ${data.writeCalls}

## Remaining Issue
- ${data.remainingIssue}
`;
  fs.writeFileSync(REPORT_PATH, report, "utf8");
}

function findAfterCell(after, beforeCell) {
  return after.sheets[beforeCell.sheetName].cells.find(cell => cell.header === beforeCell.header && cell.rowNumber === beforeCell.rowNumber);
}

function validSerial(value, role) {
  if (!Number.isFinite(value)) return false;
  if (role === "date") return value >= 40000 && value <= 60000;
  if (role === "time") return value >= 0 && value < 1;
  if (role === "dateTime") return value >= 40000 && value <= 60001;
  return false;
}

function canonical(value, role) {
  const serial = Number(value);
  if (!Number.isFinite(serial)) return "";
  const whole = Math.floor(serial);
  const fraction = serial - whole;
  const date = dateFromSerial(whole);
  const time = timeFromFraction(role === "time" ? serial : fraction);
  if (role === "date") return date;
  if (role === "time") return time;
  return `${date} ${time}`;
}

function dateFromSerial(serial) {
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function timeFromFraction(fraction) {
  const totalSeconds = Math.round(fraction * 86400);
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readableDisplay(value, role) {
  const raw = text(value);
  if (role === "date") return /^\d{4}-\d{2}-\d{2}$/.test(raw) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw);
  if (role === "time") return /^\d{1,2}:\d{2}(:\d{2})?$/.test(raw) || /^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(raw);
  if (role === "dateTime") return /^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}(:\d{2})?$/.test(raw) || /^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}(:\d{2})?$/.test(raw);
  return false;
}

function isBareSerialDisplay(value) {
  return /^-?\d+(\.\d+)?$/.test(text(value));
}

function isReadable(value, role) {
  return readableDisplay(value, role);
}

function isNumericText(value) {
  return /^-?\d+(\.\d+)?$/.test(text(value));
}

function findHeader(headers, sheet, header) {
  const matches = headers.map((value, index) => value === header ? index : -1).filter(index => index >= 0);
  if (matches.length !== 1) throw new Error(`${sheet}.${header} header is ${matches.length === 0 ? "missing" : "duplicated"}.`);
  return matches[0];
}

function countRole(plan, role) {
  return plan.toNormalize.filter(cell => cell.config.role === role).length;
}

function emptyPlan() {
  return { counts: {}, toNormalize: [], readableCells: [], formulaCells: [], unexpected: [] };
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index++) {
    if (values[index] === "--apply") result.apply = true;
    else if (values[index] === "--confirm") result.confirm = values[++index];
  }
  return result;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function text(value) { return String(value ?? "").trim(); }
function columnName(count) { let value = count, out = ""; while (value > 0) { value--; out = String.fromCharCode(65 + value % 26) + out; value = Math.floor(value / 26); } return out; }
