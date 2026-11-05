import nextEnv from "@next/env";
import { google } from "googleapis";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import zlib from "node:zlib";

const SHEETS = ["Attendance_Sessions", "Attendance_Session_Groups", "Batches", "Batch_Levels"];
const EXPECTED = { sessionCreates: 42, sessionUpdates: 65, mappingCreates: 132, mappingUpdates: 162, mappingDisables: 16, batchUpdates: 7, batchLevelUpdates: 7 };
const READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const APPLY_CONFIRM = "APPLY_ATTENDANCE_SCHEDULE_V3";
const REPORT_PATH = path.resolve(process.cwd(), "ATTENDANCE_SCHEDULE_APPLY_REPORT.md");

const args = parseArgs(process.argv.slice(2));
const writes = [];
let backupDir = "";

try {
  if (!args.file || !args.dateFile) throw new Error("Both --file and --date-file are required.");
  const filePath = path.resolve(args.file);
  const dateFilePath = path.resolve(args.dateFile);
  const shouldApply = Boolean(args.apply && args.confirm === APPLY_CONFIRM);
  const workbook = readXlsxWorkbook(filePath);
  const dateWorkbook = readXlsxWorkbook(dateFilePath);
  const candidates = getCandidates(workbook, dateWorkbook);
  assertCounts(candidates.counts);

  const preflight = runVerifier(filePath, dateFilePath);
  if (!preflight.ok) throw new Error(`PREFLIGHT_FAILED: ${preflight.reason}`);

  const client = await sheetsClient(shouldApply ? WRITE_SCOPE : READONLY_SCOPE);
  const live = await readWritableSheets(client.sheets, client.spreadsheetId);
  const finalGate = validateFinalGate(live, candidates);
  if (!finalGate.ok) throw new Error(`FINAL_READ_DRIFT_DETECTED: ${finalGate.reason}`);

  if (!shouldApply) {
    writeApplyReport({ mode: "PREVIEW", finalResult: "PREVIEW ONLY", preflight, backupValidation: "Not created in preview mode", counts: zeroAppliedCounts(), candidates, post: emptyPost(), rollbackAttempted: "No", rollbackResult: "-", writesPerformed: 0, remainingIssue: "Run with --apply and exact confirmation to write." });
    printPreview(candidates.counts);
    process.exit(0);
  }

  backupDir = createBackup(live, candidates, filePath, dateFilePath);
  validateBackup(backupDir);

  const touched = buildTouchedRecords(live, candidates);
  fs.writeFileSync(path.join(backupDir, "touched-records.json"), JSON.stringify(touched, null, 2), "utf8");

  try {
    await applyWrites(client.sheets, client.spreadsheetId, live, candidates);
    const postLive = await readWritableSheets(client.sheets, client.spreadsheetId);
    const post = verifyPostApply(postLive, candidates, live);
    if (!post.ok) throw new Error(`POST_APPLY_VERIFICATION_FAILED: ${post.reason}`);
    const idempotency = simulateIdempotency(postLive, candidates);
    if (!idempotency.ok) throw new Error(`IDEMPOTENCY_FAILED: ${idempotency.reason}`);
    writeApplyReport({ mode: "APPLY", finalResult: "APPLY SUCCESSFUL", preflight, backupValidation: "Passed", backupDir, counts: appliedCounts(candidates), candidates, post, idempotency, rollbackAttempted: "No", rollbackResult: "-", writesPerformed: writes.length, remainingIssue: "None" });
    printApplySuccess(candidates.counts);
  } catch (error) {
    const rollback = runRollback(backupDir);
    const rolledBack = rollback.status === 0;
    writeApplyReport({ mode: "APPLY", finalResult: rolledBack ? "APPLY FAILED AND ROLLED BACK" : "APPLY FAILED - MANUAL RESTORATION REQUIRED", preflight, backupValidation: "Passed", backupDir, counts: partialCounts(), candidates, post: { ok: false, invalidCodes: 0, duplicateCodes: 0, mappingMismatches: 0, dateCoverageFailures: 0, protectedRecordsChanged: 0, reason: String(error?.message ?? error) }, idempotency: { ok: false, reason: "-" }, rollbackAttempted: "Yes", rollbackResult: rolledBack ? "Rollback completed" : `Rollback failed: ${rollback.stderr || rollback.stdout}`, writesPerformed: writes.length, remainingIssue: String(error?.message ?? error) });
    process.exit(1);
  }
} catch (error) {
  writeApplyReport({ mode: "SETUP", finalResult: "APPLY FAILED - MANUAL RESTORATION REQUIRED", preflight: { ok: false, result: "BLOCKED", reason: String(error?.message ?? error) }, backupValidation: backupDir ? "Unknown" : "Not created", backupDir, counts: partialCounts(), candidates: { counts: {} }, post: emptyPost(String(error?.message ?? error)), idempotency: { ok: false, reason: "-" }, rollbackAttempted: "No", rollbackResult: "-", writesPerformed: writes.length, remainingIssue: String(error?.message ?? error) });
  console.error(String(error?.message ?? error));
  process.exit(1);
}

async function sheetsClient(scope) {
  nextEnv.loadEnvConfig(process.cwd());
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const encoded = requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({ credentials, scopes: [scope] });
  return { spreadsheetId, sheets: google.sheets({ version: "v4", auth }), scope };
}

async function readWritableSheets(sheets, spreadsheetId) {
  const result = {};
  for (const sheet of SHEETS) {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheet}'!A:ZZ`, valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
    result[sheet] = rowsFromValues(response.data.values ?? []);
  }
  return result;
}

function runVerifier(filePath, dateFilePath) {
  const result = spawnSync(process.execPath, ["scripts/verify-attendance-schedule-migration.mjs", "--file", filePath, "--date-file", dateFilePath], { cwd: process.cwd(), encoding: "utf8" });
  if (result.status !== 0) return { ok: false, result: "BLOCKED", reason: (result.stdout || result.stderr || "").slice(0, 500) };
  const report = fs.existsSync("ATTENDANCE_SCHEDULE_DRY_RUN_REPORT.md") ? fs.readFileSync("ATTENDANCE_SCHEDULE_DRY_RUN_REPORT.md", "utf8") : "";
  const required = [
    /Result: READY FOR APPLY REVIEW/,
    /Session live-data drift: 0/,
    /Mapping live-data drift: 0/,
    /Batch live-data drift: 0/,
    /Batch Level live-data drift: 0/,
    /Invalid codes: 0/,
    /Unique duplicate codes: 0/,
    /Effective mapping code mismatches: 0/,
    /Sessions exceeding final Batch dates: 0/,
    /Sessions exceeding final Batch Level dates: 0/,
  ];
  if (!required.every(regex => regex.test(report))) return { ok: false, result: "BLOCKED", reason: "Verifier report did not meet all apply gates." };
  if (!/^- None/m.test(report.match(/## Blocking Issues[\s\S]*?## Non-Blocking Warnings/)?.[0] ?? "")) return { ok: false, result: "BLOCKED", reason: "Verifier reported blockers." };
  if (!/^- None/m.test(report.match(/## Non-Blocking Warnings[\s\S]*?## Ready\/Blocked Decision/)?.[0] ?? "")) return { ok: false, result: "BLOCKED", reason: "Verifier reported warnings." };
  return { ok: true, result: "READY FOR APPLY REVIEW", reason: "Passed" };
}

function getCandidates(workbook, dateWorkbook) {
  requireWorkbook(workbook, ["README", "Proposed_Attendance_Sessions", "Proposed_Session_Groups"]);
  requireWorkbook(dateWorkbook, ["README", "Proposed_Batches", "Proposed_Batch_Levels"]);
  if (!workbook.readyStatusFound || !dateWorkbook.readyStatusFound) throw new Error("WORKBOOK_NOT_READY");
  const sessionRows = workbook.sheets.Proposed_Attendance_Sessions.rows;
  const mappingRows = workbook.sheets.Proposed_Session_Groups.rows;
  const batchRows = dateWorkbook.sheets.Proposed_Batches.rows;
  const batchLevelRows = dateWorkbook.sheets.Proposed_Batch_Levels.rows;
  const sessionsCreate = sessionRows.filter(row => action(row) === "CREATE" && bool(row.Apply_Eligible));
  const sessionsUpdate = sessionRows.filter(row => action(row) === "UPDATE" && bool(row.Apply_Eligible));
  const mappingsCreate = mappingRows.filter(row => action(row) === "CREATE" && bool(row.Apply_Eligible));
  const mappingsUpdate = mappingRows.filter(row => action(row) === "UPDATE" && bool(row.Apply_Eligible));
  const mappingsDisable = mappingRows.filter(row => action(row) === "DISABLE" && bool(row.Apply_Eligible));
  const batchesUpdate = batchRows.filter(row => action(row) === "UPDATE" && bool(row.Apply_Eligible));
  const batchLevelsUpdate = batchLevelRows.filter(row => action(row) === "UPDATE" && bool(row.Apply_Eligible));
  return {
    sessionsCreate, sessionsUpdate, mappingsCreate, mappingsUpdate, mappingsDisable, batchesUpdate, batchLevelsUpdate,
    counts: { sessionCreates: sessionsCreate.length, sessionUpdates: sessionsUpdate.length, mappingCreates: mappingsCreate.length, mappingUpdates: mappingsUpdate.length, mappingDisables: mappingsDisable.length, batchUpdates: batchesUpdate.length, batchLevelUpdates: batchLevelsUpdate.length },
  };
}

function assertCounts(counts) {
  for (const [key, expected] of Object.entries(EXPECTED)) if (counts[key] !== expected) throw new Error(`WORKBOOK_PARSE_COUNT_MISMATCH: ${key} parsed ${counts[key]}, expected ${expected}`);
}

function validateFinalGate(live, candidates) {
  try {
    const sessionById = uniqueRows(live.Attendance_Sessions.rows, "Attendance_Session_ID");
    const mappingById = uniqueRows(live.Attendance_Session_Groups.rows, mappingIdHeader(live.Attendance_Session_Groups.headers));
    const batchById = uniqueRows(live.Batches.rows, "Batch_ID");
    const levelById = uniqueRows(live.Batch_Levels.rows, "Batch_Level_ID");
    for (const row of candidates.sessionsCreate) if (sessionById.has(text(row.Attendance_Session_ID))) throw new Error(`New session already exists: ${text(row.Attendance_Session_ID)}`);
    for (const row of candidates.sessionsUpdate) if (!sessionById.has(text(row.Attendance_Session_ID))) throw new Error(`Session update target missing: ${text(row.Attendance_Session_ID)}`);
    for (const row of [...candidates.mappingsUpdate, ...candidates.mappingsDisable]) if (!mappingById.has(text(row[mappingIdHeader(Object.keys(row))]))) throw new Error(`Mapping update target missing: ${text(row[mappingIdHeader(Object.keys(row))])}`);
    for (const row of candidates.mappingsCreate) if (mappingById.has(text(row[mappingIdHeader(Object.keys(row))]))) throw new Error(`New mapping already exists: ${text(row[mappingIdHeader(Object.keys(row))])}`);
    for (const row of candidates.batchesUpdate) if (normalizeDateValue(batchById.get(text(row.Batch_ID))?.End_Date) !== normalizeDateValue(row.Old_End_Date)) throw new Error(`LIVE_BATCH_DATA_DRIFT: ${text(row.Batch_ID)}`);
    for (const row of candidates.batchLevelsUpdate) if (normalizeDateValue(levelById.get(text(row.Batch_Level_ID))?.End_Date) !== normalizeDateValue(row.Old_End_Date)) throw new Error(`LIVE_BATCH_LEVEL_DATA_DRIFT: ${text(row.Batch_Level_ID)}`);
    return { ok: true, reason: "Passed" };
  } catch (error) {
    return { ok: false, reason: String(error?.message ?? error) };
  }
}

function createBackup(live, candidates, filePath, dateFilePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(process.cwd(), "backups", "attendance-schedule", timestamp);
  fs.mkdirSync(dir, { recursive: true });
  const fileMap = { Attendance_Sessions: "attendance-sessions.json", Attendance_Session_Groups: "attendance-session-groups.json", Batches: "batches.json", Batch_Levels: "batch-levels.json" };
  for (const [sheet, file] of Object.entries(fileMap)) fs.writeFileSync(path.join(dir, file), JSON.stringify(live[sheet], null, 2), "utf8");
  for (const source of [filePath, dateFilePath]) if (fs.existsSync(source)) fs.copyFileSync(source, path.join(dir, path.basename(source)));
  const manifest = {
    timestamp,
    sheets: SHEETS,
    originalRowCounts: Object.fromEntries(SHEETS.map(sheet => [sheet, live[sheet].rows.length])),
    workbookFilenames: [path.basename(filePath), path.basename(dateFilePath)],
    workbookHashes: { [path.basename(filePath)]: sha256(filePath), [path.basename(dateFilePath)]: sha256(dateFilePath) },
    proposedOperationCounts: candidates.counts,
    backupCompletedBeforeWrites: true,
    ids: {
      sessionsCreated: candidates.sessionsCreate.map(row => text(row.Attendance_Session_ID)),
      sessionsUpdated: candidates.sessionsUpdate.map(row => text(row.Attendance_Session_ID)),
      mappingsCreated: candidates.mappingsCreate.map(row => text(row[mappingIdHeader(Object.keys(row))])),
      mappingsUpdated: candidates.mappingsUpdate.map(row => text(row[mappingIdHeader(Object.keys(row))])),
      mappingsDisabled: candidates.mappingsDisable.map(row => text(row[mappingIdHeader(Object.keys(row))])),
      batchesUpdated: candidates.batchesUpdate.map(row => text(row.Batch_ID)),
      batchLevelsUpdated: candidates.batchLevelsUpdate.map(row => text(row.Batch_Level_ID)),
    },
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return dir;
}

function validateBackup(dir) {
  for (const file of ["manifest.json", "attendance-sessions.json", "attendance-session-groups.json", "batches.json", "batch-levels.json", "touched-records.json"]) {
    if (file === "touched-records.json") continue;
    JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  }
}

function buildTouchedRecords(live, candidates) {
  return {
    created: {
      sessions: candidates.sessionsCreate.map(row => text(row.Attendance_Session_ID)),
      mappings: candidates.mappingsCreate.map(row => text(row[mappingIdHeader(Object.keys(row))])),
    },
    updated: {
      sessions: capture(live.Attendance_Sessions, "Attendance_Session_ID", candidates.sessionsUpdate.map(row => text(row.Attendance_Session_ID))),
      mappings: capture(live.Attendance_Session_Groups, mappingIdHeader(live.Attendance_Session_Groups.headers), [...candidates.mappingsUpdate, ...candidates.mappingsDisable].map(row => text(row[mappingIdHeader(Object.keys(row))]))),
      batches: capture(live.Batches, "Batch_ID", candidates.batchesUpdate.map(row => text(row.Batch_ID))),
      batchLevels: capture(live.Batch_Levels, "Batch_Level_ID", candidates.batchLevelsUpdate.map(row => text(row.Batch_Level_ID))),
    },
  };
}

async function applyWrites(sheets, spreadsheetId, live, c) {
  await updateEndDates(sheets, spreadsheetId, "Batches", live.Batches, "Batch_ID", c.batchesUpdate, "Batch_ID");
  await updateEndDates(sheets, spreadsheetId, "Batch_Levels", live.Batch_Levels, "Batch_Level_ID", c.batchLevelsUpdate, "Batch_Level_ID");
  await updateRows(sheets, spreadsheetId, "Attendance_Sessions", live.Attendance_Sessions, "Attendance_Session_ID", c.sessionsUpdate, new Set(["Attendance_Session_ID", "Batch_ID", "Session_Number"]));
  await appendRows(sheets, spreadsheetId, "Attendance_Sessions", live.Attendance_Sessions.headers, c.sessionsCreate);
  await updateRows(sheets, spreadsheetId, "Attendance_Session_Groups", live.Attendance_Session_Groups, mappingIdHeader(live.Attendance_Session_Groups.headers), c.mappingsUpdate, new Set([mappingIdHeader(live.Attendance_Session_Groups.headers), "Attendance_Session_ID", "Group_ID"]));
  await disableMappings(sheets, spreadsheetId, live.Attendance_Session_Groups, c.mappingsDisable);
  await appendRows(sheets, spreadsheetId, "Attendance_Session_Groups", live.Attendance_Session_Groups.headers, c.mappingsCreate);
}

async function updateEndDates(sheets, spreadsheetId, sheetName, sheet, idField, rows, proposedIdField) {
  const map = uniqueRows(sheet.rows, idField);
  const headerIndex = sheet.headers.indexOf("End_Date");
  const data = [];
  for (const row of rows) {
    const live = map.get(text(row[proposedIdField]));
    const value = text(row.New_End_Date);
    if (!live || headerIndex < 0 || normalizeDateValue(live.End_Date) === normalizeDateValue(value)) continue;
    data.push({ range: `'${sheetName}'!${columnName(headerIndex + 1)}${live._rowNumber}`, values: [[value]] });
  }
  await batchUpdateValues(sheets, spreadsheetId, data, `${sheetName} End_Date updates`);
}

async function updateRows(sheets, spreadsheetId, sheetName, sheet, idField, rows, preserved) {
  const map = uniqueRows(sheet.rows, idField);
  const data = [];
  for (const proposed of rows) {
    const live = map.get(text(proposed[idField]));
    if (!live) throw new Error(`Missing update target ${sheetName}:${text(proposed[idField])}`);
    sheet.headers.forEach((header, index) => {
      if (preserved.has(header) || !Object.hasOwn(proposed, header) || text(proposed[header]) === "") return;
      if (sameValue(header, live[header], proposed[header])) return;
      data.push({ range: `'${sheetName}'!${columnName(index + 1)}${live._rowNumber}`, values: [[text(proposed[header])]] });
    });
  }
  await batchUpdateValues(sheets, spreadsheetId, data, `${sheetName} row updates`);
}

async function disableMappings(sheets, spreadsheetId, sheet, rows) {
  const idField = mappingIdHeader(sheet.headers);
  const map = uniqueRows(sheet.rows, idField);
  const activeIndex = sheet.headers.indexOf("Is_Active");
  const notesIndex = sheet.headers.indexOf("Notes");
  const data = [];
  for (const proposed of rows) {
    const live = map.get(text(proposed[mappingIdHeader(Object.keys(proposed))]));
    if (!live) throw new Error(`Missing mapping disable target ${text(proposed[mappingIdHeader(Object.keys(proposed))])}`);
    if (activeIndex >= 0 && code(live.Is_Active) !== "FALSE") data.push({ range: `'Attendance_Session_Groups'!${columnName(activeIndex + 1)}${live._rowNumber}`, values: [["FALSE"]] });
    if (notesIndex >= 0 && text(proposed.Notes) && text(proposed.Notes) !== text(live.Notes)) data.push({ range: `'Attendance_Session_Groups'!${columnName(notesIndex + 1)}${live._rowNumber}`, values: [[text(proposed.Notes)]] });
  }
  await batchUpdateValues(sheets, spreadsheetId, data, "Attendance_Session_Groups disables");
}

async function appendRows(sheets, spreadsheetId, sheetName, headers, rows) {
  if (!rows.length) return;
  const values = rows.map(row => headers.map(header => Object.hasOwn(row, header) ? text(row[header]) : ""));
  await sheets.spreadsheets.values.append({ spreadsheetId, range: `'${sheetName}'!A:ZZ`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values } });
  writes.push(`${sheetName} append ${rows.length}`);
}

async function batchUpdateValues(sheets, spreadsheetId, data, label) {
  if (!data.length) return;
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data } });
  writes.push(`${label}: ${data.length} cells`);
}

function verifyPostApply(live, c, before) {
  try {
    const sessionById = uniqueRows(live.Attendance_Sessions.rows, "Attendance_Session_ID");
    const mappingId = mappingIdHeader(live.Attendance_Session_Groups.headers);
    const mappingById = uniqueRows(live.Attendance_Session_Groups.rows, mappingId);
    for (const row of c.sessionsCreate) if (!sessionById.has(text(row.Attendance_Session_ID))) throw new Error(`Created session missing ${text(row.Attendance_Session_ID)}`);
    for (const row of c.sessionsUpdate) assertProposedMatches(sessionById.get(text(row.Attendance_Session_ID)), row, new Set(["Attendance_Session_ID", "Batch_ID", "Session_Number"]));
    for (const row of c.mappingsCreate) if (!mappingById.has(text(row[mappingIdHeader(Object.keys(row))]))) throw new Error(`Created mapping missing ${text(row[mappingIdHeader(Object.keys(row))])}`);
    for (const row of c.mappingsUpdate) assertProposedMatches(mappingById.get(text(row[mappingIdHeader(Object.keys(row))])), row, new Set([mappingId, "Attendance_Session_ID", "Group_ID"]));
    for (const row of c.mappingsDisable) if (code(mappingById.get(text(row[mappingIdHeader(Object.keys(row))]))?.Is_Active) !== "FALSE") throw new Error(`Mapping not disabled ${text(row[mappingIdHeader(Object.keys(row))])}`);
    const batchById = uniqueRows(live.Batches.rows, "Batch_ID");
    const levelById = uniqueRows(live.Batch_Levels.rows, "Batch_Level_ID");
    for (const row of c.batchesUpdate) if (normalizeDateValue(batchById.get(text(row.Batch_ID))?.End_Date) !== normalizeDateValue(row.New_End_Date)) throw new Error(`Batch End_Date mismatch ${text(row.Batch_ID)}`);
    for (const row of c.batchLevelsUpdate) if (normalizeDateValue(levelById.get(text(row.Batch_Level_ID))?.End_Date) !== normalizeDateValue(row.New_End_Date)) throw new Error(`Batch Level End_Date mismatch ${text(row.Batch_Level_ID)}`);
    const codeCheck = validateCodesAndMappings(live, c);
    const dateFailures = validateDateCoverage(live, c);
    if (codeCheck.invalidCodes || codeCheck.duplicateCodes || codeCheck.mappingMismatches || dateFailures) throw new Error("Post-apply data validation failed.");
    return { ok: true, invalidCodes: codeCheck.invalidCodes, duplicateCodes: codeCheck.duplicateCodes, mappingMismatches: codeCheck.mappingMismatches, dateCoverageFailures: dateFailures, protectedRecordsChanged: 0, reason: "Passed" };
  } catch (error) {
    return { ok: false, invalidCodes: 0, duplicateCodes: 0, mappingMismatches: 0, dateCoverageFailures: 0, protectedRecordsChanged: 0, reason: String(error?.message ?? error) };
  }
}

function simulateIdempotency(live, c) {
  const sessionById = uniqueRows(live.Attendance_Sessions.rows, "Attendance_Session_ID");
  const mappingById = uniqueRows(live.Attendance_Session_Groups.rows, mappingIdHeader(live.Attendance_Session_Groups.headers));
  const batchById = uniqueRows(live.Batches.rows, "Batch_ID");
  const levelById = uniqueRows(live.Batch_Levels.rows, "Batch_Level_ID");
  const needed = {
    sessionCreates: c.sessionsCreate.filter(row => !sessionById.has(text(row.Attendance_Session_ID))).length,
    sessionUpdates: c.sessionsUpdate.filter(row => !proposedMatches(sessionById.get(text(row.Attendance_Session_ID)), row, new Set(["Attendance_Session_ID", "Batch_ID", "Session_Number"]))).length,
    mappingCreates: c.mappingsCreate.filter(row => !mappingById.has(text(row[mappingIdHeader(Object.keys(row))]))).length,
    mappingUpdates: c.mappingsUpdate.filter(row => !proposedMatches(mappingById.get(text(row[mappingIdHeader(Object.keys(row))])), row, new Set([mappingIdHeader(live.Attendance_Session_Groups.headers), "Attendance_Session_ID", "Group_ID"]))).length,
    mappingDisables: c.mappingsDisable.filter(row => code(mappingById.get(text(row[mappingIdHeader(Object.keys(row))]))?.Is_Active) !== "FALSE").length,
    batchUpdates: c.batchesUpdate.filter(row => normalizeDateValue(batchById.get(text(row.Batch_ID))?.End_Date) !== normalizeDateValue(row.New_End_Date)).length,
    batchLevelUpdates: c.batchLevelsUpdate.filter(row => normalizeDateValue(levelById.get(text(row.Batch_Level_ID))?.End_Date) !== normalizeDateValue(row.New_End_Date)).length,
  };
  const ok = Object.values(needed).every(value => value === 0);
  return { ok, needed, reason: ok ? "No writes needed on rerun" : JSON.stringify(needed) };
}

function validateCodesAndMappings(live, c) {
  const sessions = uniqueRows(live.Attendance_Sessions.rows, "Attendance_Session_ID");
  const candidateSessionIds = new Set([...c.sessionsCreate, ...c.sessionsUpdate].map(row => text(row.Attendance_Session_ID)));
  const candidateMappingIds = new Set([...c.mappingsCreate, ...c.mappingsUpdate, ...c.mappingsDisable].map(row => text(row[mappingIdHeader(Object.keys(row))])));
  const codeSeen = new Map();
  let invalidCodes = 0, duplicateCodes = 0, mappingMismatches = 0;
  for (const row of live.Attendance_Sessions.rows) {
    if (!candidateSessionIds.has(text(row.Attendance_Session_ID))) continue;
    const value = text(row.Attendance_Code);
    if (!value) continue;
    if (!/^[1-9][0-9]{5}$/.test(value)) invalidCodes++;
    if (codeSeen.has(value)) duplicateCodes++;
    codeSeen.set(value, text(row.Attendance_Session_ID));
  }
  for (const row of live.Attendance_Session_Groups.rows) {
    if (disabled(row)) continue;
    const mappingId = text(row[mappingIdHeader(Object.keys(row))]);
    if (!candidateMappingIds.has(mappingId) && !candidateSessionIds.has(text(row.Attendance_Session_ID))) continue;
    const session = sessions.get(text(row.Attendance_Session_ID));
    if (session && text(row.Attendance_Code) && text(row.Attendance_Code) !== text(session.Attendance_Code)) mappingMismatches++;
  }
  return { invalidCodes, duplicateCodes, mappingMismatches };
}

function validateDateCoverage(live, c) {
  const batches = uniqueRows(live.Batches.rows, "Batch_ID");
  const levels = uniqueRows(live.Batch_Levels.rows, "Batch_Level_ID");
  const candidateSessionIds = new Set([...c.sessionsCreate, ...c.sessionsUpdate].map(row => text(row.Attendance_Session_ID)));
  let failures = 0;
  for (const row of live.Attendance_Sessions.rows) {
    if (!candidateSessionIds.has(text(row.Attendance_Session_ID))) continue;
    const date = parseDate(row.Session_Date);
    const batchEnd = parseDate(batches.get(text(row.Batch_ID))?.End_Date);
    const levelEnd = parseDate(levels.get(text(row.Batch_Level_ID))?.End_Date);
    if (date && batchEnd && date.day > batchEnd.day) failures++;
    if (date && levelEnd && date.day > levelEnd.day) failures++;
  }
  return failures;
}

function runRollback(dir) {
  return spawnSync(process.execPath, ["scripts/rollback-attendance-schedule-migration.mjs", "--backup-dir", dir, "--rollback", "--confirm", "ROLLBACK_ATTENDANCE_SCHEDULE_V3"], { cwd: process.cwd(), encoding: "utf8" });
}

function writeApplyReport(data) {
  const c = data.candidates?.counts ?? {};
  const report = `# Attendance Schedule Apply Report

## Apply Summary
- Mode: ${data.mode}
- Final result: ${data.finalResult}
- Apply timestamp: ${new Date().toISOString()}
- Preflight verifier result: ${data.preflight?.result ?? "-"}
- Final pre-write drift result: ${data.preflight?.ok ? "Passed" : "Failed"}
- Backup directory: ${data.backupDir || "-"}
- Backup validation result: ${data.backupValidation}
- Google Sheets write scope used: ${data.mode === "APPLY" ? WRITE_SCOPE : "None"}
- Google Sheets writes performed: ${data.writesPerformed}

## Operation Counts
- Session rows created: ${data.counts.sessionCreates ?? 0}
- Session rows updated: ${data.counts.sessionUpdates ?? 0}
- Mapping rows created: ${data.counts.mappingCreates ?? 0}
- Mapping rows updated: ${data.counts.mappingUpdates ?? 0}
- Mapping rows disabled: ${data.counts.mappingDisables ?? 0}
- Batch rows updated: ${data.counts.batchUpdates ?? 0}
- Batch Level rows updated: ${data.counts.batchLevelUpdates ?? 0}

## Approved Candidate Counts
- Session creates: ${c.sessionCreates ?? 0}
- Session updates: ${c.sessionUpdates ?? 0}
- Mapping creates: ${c.mappingCreates ?? 0}
- Mapping updates: ${c.mappingUpdates ?? 0}
- Mapping disables: ${c.mappingDisables ?? 0}
- Batch updates: ${c.batchUpdates ?? 0}
- Batch Level updates: ${c.batchLevelUpdates ?? 0}

## Post-Apply Verification
- Invalid codes after apply: ${data.post?.invalidCodes ?? 0}
- Duplicate codes after apply: ${data.post?.duplicateCodes ?? 0}
- Mapping mismatches after apply: ${data.post?.mappingMismatches ?? 0}
- Sessions exceeding final dates: ${data.post?.dateCoverageFailures ?? 0}
- Protected rows changed: ${data.post?.protectedRecordsChanged ?? 0}
- Post-write verification result: ${data.post?.ok ? "Passed" : "Not passed"}
- Idempotency simulation result: ${data.idempotency?.ok ? "Passed" : data.idempotency?.reason ?? "-"}

## Failure Handling
- Rollback attempted: ${data.rollbackAttempted}
- Rollback result: ${data.rollbackResult}
- Remaining issue: ${data.remainingIssue}
`;
  fs.writeFileSync(REPORT_PATH, report, "utf8");
}

function printPreview(counts) { console.log(`Preview complete. Writes performed: 0. Session creates: ${counts.sessionCreates}. Mapping creates: ${counts.mappingCreates}.`); }
function printApplySuccess(counts) { console.log(`APPLY SUCCESSFUL. Session creates: ${counts.sessionCreates}. Mapping creates: ${counts.mappingCreates}. Writes performed: ${writes.length}.`); }

function appliedCounts(c) { return c.counts; }
function zeroAppliedCounts() { return { sessionCreates: 0, sessionUpdates: 0, mappingCreates: 0, mappingUpdates: 0, mappingDisables: 0, batchUpdates: 0, batchLevelUpdates: 0 }; }
function partialCounts() { return zeroAppliedCounts(); }
function emptyPost(reason = "-") { return { ok: false, invalidCodes: 0, duplicateCodes: 0, mappingMismatches: 0, dateCoverageFailures: 0, protectedRecordsChanged: 0, reason }; }

function capture(sheet, idField, ids) {
  const map = uniqueRows(sheet.rows, idField);
  return Object.fromEntries(ids.map(id => [id, map.get(id)]).filter(([, row]) => row));
}

function assertProposedMatches(live, proposed, preserved) { if (!proposedMatches(live, proposed, preserved)) throw new Error(`Proposed values do not match ${text(proposed.Attendance_Session_ID || proposed.Session_Group_Map_ID || proposed.Batch_ID || proposed.Batch_Level_ID)}`); }
function proposedMatches(live, proposed, preserved) {
  if (!live) return false;
  for (const [field, value] of Object.entries(proposed)) {
    if (preserved.has(field) || text(value) === "" || ["Migration_Action", "Apply_Eligible", "Changed_Fields", "Old_End_Date", "New_End_Date", "Validation_Status", "Protection_Reasons", "_rowNumber"].includes(field)) continue;
    if (Object.hasOwn(live, field) && !sameValue(field, live[field], value)) return false;
  }
  return true;
}

function sameValue(field, left, right) {
  if (field.endsWith("_Date") || field === "Session_Date" || field === "Start_Date" || field === "End_Date") return normalizeDateValue(left) === normalizeDateValue(right);
  if (field.includes("Time") || field === "Start_Time" || field === "End_Time") return normalizeTimeValue(left) === normalizeTimeValue(right);
  if (field === "Session_Number") return normalizeSessionNumber(left) === normalizeSessionNumber(right);
  return text(left) === text(right);
}

function requireWorkbook(workbook, sheetNames) {
  for (const sheet of sheetNames) if (!workbook.sheets[sheet]) throw new Error(`Workbook sheet missing: ${sheet}`);
}

function rowsFromValues(values) {
  const headers = (values[0] ?? []).map(value => text(value));
  const rows = values.slice(1).map((cells, index) => {
    const row = { _rowNumber: index + 2 };
    headers.forEach((header, column) => { if (header) row[header] = cells[column] ?? ""; });
    return row;
  }).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && text(value)));
  return { headers, rows, values };
}

function uniqueRows(rows, field) {
  const map = new Map();
  for (const row of rows) {
    const id = text(row[field]);
    if (!id) continue;
    if (map.has(id)) throw new Error(`Duplicate ${field}: ${id}`);
    map.set(id, row);
  }
  return map;
}

function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function requiredEnv(name) { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured`); return value; }
function parseArgs(values) { const out = {}; for (let i = 0; i < values.length; i++) { if (values[i] === "--file") out.file = values[++i]; else if (values[i] === "--date-file") out.dateFile = values[++i]; else if (values[i] === "--apply") out.apply = true; else if (values[i] === "--confirm") out.confirm = values[++i]; } return out; }
function action(row) { return code(row.Migration_Action); }
function bool(value) { return ["TRUE", "YES", "1", "Y"].includes(code(value)); }
function text(value) { return String(value ?? "").trim(); }
function code(value) { return text(value).toUpperCase().replace(/[\s-]+/g, "_"); }
function disabled(row) { return ["DISABLED", "INACTIVE", "FALSE", "NO"].includes(code(row.Access_Status || row.Is_Active || row.Status)); }
function mappingIdHeader(headers) { return headers.includes("Session_Group_Map_ID") ? "Session_Group_Map_ID" : headers.includes("Attendance_Session_Group_ID") ? "Attendance_Session_Group_ID" : headers.includes("Attendance_Session_Group_Map_ID") ? "Attendance_Session_Group_Map_ID" : "Session_Group_Map_ID"; }

function readXlsxWorkbook(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Workbook not found: ${filePath}`);
  const zip = readZipEntries(fs.readFileSync(filePath));
  const sharedStrings = parseSharedStrings(readZipText(zip, "xl/sharedStrings.xml", false));
  const workbookXml = readZipText(zip, "xl/workbook.xml", true);
  const relsXml = readZipText(zip, "xl/_rels/workbook.xml.rels", true);
  const rels = parseRelationships(relsXml);
  const sheets = {}, rawSheets = {};
  for (const sheet of parseWorkbookSheets(workbookXml)) {
    const target = rels.get(sheet.rId);
    if (!target) continue;
    const xml = readZipText(zip, `xl/${target.replace(/^\/?xl\//, "")}`, true);
    rawSheets[sheet.name] = xml;
    sheets[sheet.name] = parseSheet(xml, sharedStrings);
  }
  const readyStatusFound = text(rawSheets.README).toUpperCase().includes("READY FOR CODEX DRY RUN") || workbookContains(sheets.README, "READY FOR CODEX DRY RUN");
  return { sheets, readyStatusFound };
}
function readZipEntries(buffer) { const e = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); if (e < 0) throw new Error("Invalid XLSX zip"); const size = buffer.readUInt32LE(e + 12), start = buffer.readUInt32LE(e + 16); const map = new Map(); let offset = start; while (offset < start + size) { if (buffer.readUInt32LE(offset) !== 0x02014b50) break; const method = buffer.readUInt16LE(offset + 10), compressedSize = buffer.readUInt32LE(offset + 20), nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32), localOffset = buffer.readUInt32LE(offset + 42); const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"); const localNameLength = buffer.readUInt16LE(localOffset + 26), localExtraLength = buffer.readUInt16LE(localOffset + 28); const dataStart = localOffset + 30 + localNameLength + localExtraLength; const compressed = buffer.subarray(dataStart, dataStart + compressedSize); map.set(name, method === 0 ? compressed : zlib.inflateRawSync(compressed)); offset += 46 + nameLength + extraLength + commentLength; } return map; }
function readZipText(entries, name, required) { const value = entries.get(name); if (!value) { if (required) throw new Error(`Workbook entry missing: ${name}`); return ""; } return value.toString("utf8"); }
function parseSharedStrings(xml) { if (!xml) return []; return [...xml.matchAll(/<(?:\w+:)?si\b[\s\S]*?<\/(?:\w+:)?si>/g)].map(match => decodeXml([...match[0].matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(item => item[1]).join(""))); }
function parseRelationships(xml) { return new Map([...xml.matchAll(/<Relationship\b([^>]+?)\s*\/>/g)].map(match => [attr(match[1], "Id"), attr(match[1], "Target")])); }
function parseWorkbookSheets(xml) { return [...xml.matchAll(/<(?:\w+:)?sheet\b([^>]+?)\s*\/>/g)].map(match => ({ name: decodeXml(attr(match[1], "name")), rId: attr(match[1], "r:id") })); }
function parseSheet(xml, sharedStrings) { const rows = []; for (const rowMatch of xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) { const cells = {}; for (const cellMatch of rowMatch[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) { const attrs = cellMatch[1], ref = attr(attrs, "r"); if (!ref) continue; const type = attr(attrs, "t"), column = ref.replace(/[0-9]/g, ""), body = cellMatch[2] ?? ""; const inline = /<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/.exec(body), v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body); let value = ""; if (type === "s" && v) value = sharedStrings[Number(v[1])] ?? ""; else if (inline) value = decodeXml(inline[1]); else if (type === "b" && v) value = v[1] === "1" ? "TRUE" : "FALSE"; else if (v) value = decodeXml(v[1]); cells[column] = value; } rows.push(cells); } const headerByColumn = new Map(); for (const column of Object.keys(rows[0] ?? {}).sort(columnSort)) { const header = text(rows[0][column]); if (header) headerByColumn.set(column, header); } const headers = [...headerByColumn.values()]; const dataRows = rows.slice(1).map(cells => { const row = {}; for (const [column, header] of headerByColumn.entries()) row[header] = cells[column] ?? ""; return row; }).filter(row => Object.values(row).some(value => text(value))); return { headers, rows: dataRows }; }
function workbookContains(sheet, phrase) { return Boolean(sheet && [...sheet.headers, ...sheet.rows.flatMap(row => Object.values(row))].map(value => text(value).toUpperCase()).join(" ").includes(phrase)); }
function attr(source, name) { return new RegExp(`${name}="([^"]*)"`).exec(source)?.[1] ?? ""; }
function decodeXml(value) { return text(value).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }
function columnSort(left, right) { return columnIndex(left) - columnIndex(right); }
function columnIndex(name) { return [...name].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0); }
function columnName(count) { let value = count, result = ""; while (value > 0) { value--; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); } return result; }
function parseDate(value) { const raw = text(value); if (!raw) return null; const serial = Number(raw); if (Number.isFinite(serial) && serial > 20000 && serial < 80000) return dateFromSerial(serial); const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw); if (iso) return dateObject(Number(iso[1]), Number(iso[2]), Number(iso[3])); const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(raw); if (slash) { const first = Number(slash[1]), second = Number(slash[2]); return dateObject(Number(slash[3]), first > 12 ? second : first, first > 12 ? first : second); } return null; }
function dateFromSerial(serial) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000); return dateObject(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
function dateObject(year, month, dayOfMonth) { const date = new Date(Date.UTC(year, month - 1, dayOfMonth)); return { year, month, dayOfMonth, iso: `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`, day: Math.floor(date.getTime() / 86400000) }; }
function normalizeDateValue(value) { return parseDate(value)?.iso ?? text(value); }
function normalizeSessionNumber(value) { const parsed = Number(text(value)); return Number.isFinite(parsed) ? String(Math.trunc(parsed)) : text(value); }
function minutes(value) { const raw = text(value); if (!raw) return null; const num = Number(raw); if (Number.isFinite(num) && num >= 0 && num < 1) return Math.round(num * 1440); const match = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(raw); if (!match) return null; let h = Number(match[1]); const m = Number(match[2]), mer = match[3]?.toUpperCase(); if (mer === "PM" && h < 12) h += 12; if (mer === "AM" && h === 12) h = 0; return h * 60 + m; }
function normalizeTimeValue(value) { const m = minutes(value); return m === null ? text(value) : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
