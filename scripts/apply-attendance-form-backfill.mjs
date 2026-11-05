import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import nextEnv from "@next/env";
import { google } from "googleapis";

nextEnv.loadEnvConfig(process.cwd());

const READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const REPORT_PATH = path.resolve(process.cwd(), "ATTENDANCE_FORM_BACKFILL_APPLY_REPORT.md");
const CONFIRM = "APPLY_ATTENDANCE_FORM_BACKFILL";
const EXPECTED = {
  processedRows: 2384,
  uniquePairs: 2321,
  duplicateFormSubmissions: 61,
  lateOutsideAccepted: 41,
  create: 1462,
  update: 106,
  alreadyPresent: 583,
  duplicateValidatedReview: 20,
  finalPresent: 2151,
  sessionReviewRequired: 86,
  studentReviewRequired: 36,
  identityConflicts: 5,
  noEligibleMapping: 22,
  multipleEligibleEnrollments: 3,
};
const LIVE_SHEETS = ["Students", "Enrollments", "Groups", "Attendance_Sessions", "Attendance_Session_Groups", "Attendance_Validated", "Attendance_Form_Responses"];
const REQUIRED_HEADERS = ["Attendance_ID", "Source_Response_Row", "Source_Timestamp", "Attendance_Code", "Attendance_Session_ID", "Input_University_Student_ID", "Resolved_Academy_Student_ID", "Enrollment_ID", "Resolved_Group_ID", "Student_Name", "Input_Phone", "Attendance_Status", "Validation_Status", "Submitted_At", "Validated_At", "Reviewed_By", "Review_Status", "Notes"];
const args = parseArgs(process.argv.slice(2));
const explicitApply = args.apply === true && args.confirm === CONFIRM;
const startedAt = new Date().toISOString();
const result = {
  applyTimestamp: startedAt,
  previewResult: "NOT_RUN",
  previewWrites: 0,
  freshPreflightResult: "NOT_RUN",
  finalPreWriteDriftResult: "NOT_RUN",
  backupDir: "",
  backupValidation: "NOT_RUN",
  createCandidates: 0,
  updateCandidates: 0,
  alreadyPresent: 0,
  lateSubmissionsApplied: 0,
  rowsCreated: 0,
  rowsUpdated: 0,
  idempotentNoOps: 0,
  duplicateAttendanceIds: 0,
  duplicatePresentPairs: 0,
  reviewCandidatesChanged: 0,
  absentRowsCreated: 0,
  sourceRowsUnresolved: 0,
  postApplyVerification: "NOT_RUN",
  idempotencyResult: "NOT_RUN",
  rollbackAttempted: "No",
  rollbackResult: "Not attempted",
  googleSheetsWriteCalls: 0,
  finalResult: "BLOCKED",
  remainingIssue: "Not run.",
  failedStep: "",
};

try {
  if (!args.file) fail("INPUT_FILE_REQUIRED", "Input workbook is required.");
  if (!fs.existsSync(path.resolve("scripts/verify-attendance-form-backfill.mjs"))) fail("VERIFIER_MISSING", "scripts/verify-attendance-form-backfill.mjs is required.");
  const workbookPath = resolveWorkbookPath(args.file);
  const workbookHash = sha256File(workbookPath);
  const preflight = await calculatePlan(workbookPath, explicitApply ? WRITE_SCOPE : READONLY_SCOPE);
  validateApprovedCounts(preflight.counts);
  result.freshPreflightResult = "READY FOR APPLY REVIEW";
  result.createCandidates = preflight.creates.length;
  result.updateCandidates = preflight.updates.length;
  result.alreadyPresent = preflight.counts.alreadyPresent;
  result.lateSubmissionsApplied = preflight.counts.lateOutsideAccepted;
  result.sourceRowsUnresolved = preflight.counts.sourceRowUnresolved;
  result.previewResult = "PASSED";
  if (!explicitApply) {
    result.finalResult = "PREVIEW PASSED";
    result.remainingIssue = "Explicit --apply confirmation was not provided; writes performed = 0.";
    writeReport(result, workbookPath, workbookHash, preflight);
    printResult(result);
    process.exit(0);
  }
  const finalRead = await calculatePlan(workbookPath, WRITE_SCOPE);
  validateApprovedCounts(finalRead.counts);
  if (!samePlan(preflight, finalRead)) fail("FINAL_READ_DRIFT_DETECTED", "Final read candidate plan differed from fresh preflight.");
  result.finalPreWriteDriftResult = "PASSED";
  validateWritePlan(finalRead);
  const backup = createBackup(workbookPath, workbookHash, finalRead);
  result.backupDir = backup.dir;
  result.backupValidation = validateBackup(backup.dir) ? "PASSED" : "FAILED";
  if (result.backupValidation !== "PASSED") fail("BACKUP_FAILED", "Backup validation failed.");
  const applied = await applyPlan(finalRead);
  result.rowsCreated = applied.created;
  result.rowsUpdated = applied.updated;
  result.idempotentNoOps = applied.noops;
  const post = await verifyPostApply(workbookPath, finalRead, applied);
  result.postApplyVerification = post.ok ? "PASSED" : "FAILED";
  result.duplicateAttendanceIds = post.duplicateAttendanceIds;
  result.duplicatePresentPairs = post.duplicatePresentPairs;
  result.absentRowsCreated = post.absentRowsCreated;
  if (!post.ok) throw new Error(post.reason);
  const idempotency = await calculatePlan(workbookPath, WRITE_SCOPE);
  result.idempotencyResult = idempotency.creates.length === 0 && idempotency.updates.length === 0 && idempotency.counts.alreadyPresent === EXPECTED.finalPresent ? "PASSED" : "FAILED";
  if (result.idempotencyResult !== "PASSED") throw new Error("Idempotency simulation failed.");
  result.finalResult = "APPLY SUCCESSFUL";
  result.remainingIssue = "None";
  writeReport(result, workbookPath, workbookHash, finalRead);
  printResult(result);
} catch (error) {
  result.failedStep ||= error?.code || "APPLY_FAILED";
  result.remainingIssue = error?.message || String(error);
  if (explicitApply && result.backupDir && (result.rowsCreated || result.rowsUpdated)) {
    result.rollbackAttempted = "Yes";
    try {
      await rollbackFromBackup(result.backupDir);
      result.rollbackResult = "PASSED";
      result.finalResult = "APPLY FAILED AND ROLLED BACK";
    } catch (rollbackError) {
      result.rollbackResult = rollbackError?.message || String(rollbackError);
      result.finalResult = "APPLY FAILED — MANUAL RESTORATION REQUIRED";
    }
  } else {
    result.finalResult = "BLOCKED";
  }
  writeReport(result, args.file ? path.resolve(args.file) : "", "", null);
  printResult(result);
  process.exitCode = 1;
}

async function calculatePlan(file, scope) {
  const workbook = readXlsxWorkbook(file);
  const processed = workbook.sheets["Processed Data"]?.rows ?? [];
  validateWorkbook(workbook, processed);
  const live = await readLiveSheets(scope);
  validateAttendanceHeaders(live.Attendance_Validated.headers);
  const plan = buildPlan(processed, live);
  return { ...plan, live, workbookRows: processed };
}

function buildPlan(rows, live) {
  const counts = zeroCounts();
  counts.processedRows = rows.length;
  counts.needsReviewRows = rows.filter(row => normalizeSessionGroup(row["Session Group"]) === "NEEDS REVIEW").length;
  const resolvedRows = rows.filter(row => normalizeSessionGroup(row["Session Group"]) !== "NEEDS REVIEW");
  const uniqueRaw = new Set(resolvedRows.map(rawPairKey).filter(Boolean));
  counts.uniquePairs = uniqueRaw.size;
  counts.duplicateFormSubmissions = resolvedRows.length - uniqueRaw.size;
  const students = live.Students.rows;
  const enrollments = live.Enrollments.rows;
  const groups = live.Groups.rows;
  const sessions = live.Attendance_Sessions.rows;
  const mappings = live.Attendance_Session_Groups.rows;
  const validated = live.Attendance_Validated.rows;
  const formResponses = live.Attendance_Form_Responses.rows;
  const studentsByUniversityId = groupBy(students, row => normalizeUniversityId(row.Student_ID));
  const studentsByPhone = groupBy(students.filter(row => normalizePhone(row.Phone)), row => normalizePhone(row.Phone));
  const studentsByName = groupBy(students.filter(row => normalizeName(row.Student_Name)), row => normalizeName(row.Student_Name));
  const studentsByAcademy = new Map(students.map(row => [text(row.Academy_Student_ID), row]));
  const enrollmentById = new Map(enrollments.map(row => [text(row.Enrollment_ID), row]));
  const groupsById = new Map(groups.map(row => [text(row.Group_ID), row]));
  const sessionsById = new Map(sessions.map(row => [text(row.Attendance_Session_ID), row]));
  const sessionsByCodeDate = groupBy(sessions, row => `${normalizeCode(row.Attendance_Code)}::${normalizeDate(row.Session_Date)}`);
  const activeMappings = new Set(mappings.filter(isMappingActive).map(row => `${text(row.Attendance_Session_ID)}::${text(row.Group_ID)}`));
  const validatedByPair = groupBy(validated.filter(row => text(row.Attendance_Session_ID) && text(row.Resolved_Academy_Student_ID)), row => pairKey(row.Attendance_Session_ID, row.Resolved_Academy_Student_ID));
  const formResponsesBySignature = groupBy(formResponses, row => sourceSignature(row.Timestamp, row.Attendance_Code, row.University_Student_ID, row.Student_Name, row.Phone));
  const existingIds = new Set(validated.map(row => text(row.Attendance_ID)).filter(Boolean));
  const seenRaw = new Set();
  const seenFinal = new Set();
  const creates = [];
  const updates = [];
  const already = [];
  const reviewKeys = new Set();
  for (const row of rows) {
    const rawKey = rawPairKey(row);
    if (!rawKey || normalizeSessionGroup(row["Session Group"]) === "NEEDS REVIEW") {
      counts.sessionReviewRequired++;
      continue;
    }
    if (seenRaw.has(rawKey)) continue;
    seenRaw.add(rawKey);
    if (isLateOrOutside(row)) counts.lateOutsideAccepted++;
    const session = resolveSession(row, sessionsByCodeDate);
    if (!session) {
      counts.sessionReviewRequired++;
      continue;
    }
    counts.exactSessionMatches++;
    const studentResolution = resolveStudent(row, studentsByUniversityId, studentsByPhone, studentsByName);
    if (studentResolution.category === "IDENTITY_CONFLICT") {
      counts.identityConflicts++;
      reviewKeys.add(reviewKey(row, session.Attendance_Session_ID));
      continue;
    }
    if (!studentResolution.student) {
      counts.studentReviewRequired++;
      reviewKeys.add(reviewKey(row, session.Attendance_Session_ID));
      continue;
    }
    if (studentResolution.category === "EXACT") counts.exactStudentIdMatches++;
    if (studentResolution.category === "FALLBACK") counts.safeFallbackMatches++;
    const eligible = resolveEligibleEnrollment(studentResolution.student, session, enrollments, groupsById, activeMappings);
    if (eligible.category === "NONE") {
      counts.noEligibleMapping++;
      reviewKeys.add(reviewKey(row, session.Attendance_Session_ID));
      continue;
    }
    if (eligible.category === "MULTIPLE") {
      counts.multipleEligibleEnrollments++;
      reviewKeys.add(reviewKey(row, session.Attendance_Session_ID));
      continue;
    }
    const finalKey = pairKey(session.Attendance_Session_ID, studentResolution.student.Academy_Student_ID);
    if (seenFinal.has(finalKey)) continue;
    seenFinal.add(finalKey);
    counts.eligibleMappedCandidates++;
    const sourceMatches = formResponsesBySignature.get(sourceSignature(row.Timestamp, row["Original Code"], row["University Student ID"], row["Student Name"], row.Phone)) ?? [];
    const sourceRow = sourceMatches.length === 1 ? String(sourceMatches[0]._rowNumber) : "";
    if (!sourceRow) counts.sourceRowUnresolved++;
    const existing = validatedByPair.get(finalKey) ?? [];
    const baseRecord = {
      Source_Response_Row: sourceRow,
      Source_Timestamp: text(row.Timestamp),
      Attendance_Code: text(session.Attendance_Code),
      Attendance_Session_ID: text(session.Attendance_Session_ID),
      Input_University_Student_ID: normalizeUniversityId(row["University Student ID"]),
      Resolved_Academy_Student_ID: text(studentResolution.student.Academy_Student_ID),
      Enrollment_ID: text(eligible.enrollment.Enrollment_ID),
      Resolved_Group_ID: text(eligible.enrollment.Group_ID),
      Student_Name: text(studentResolution.student.Student_Name),
      Input_Phone: normalizePhone(row.Phone),
      Attendance_Status: "Present",
      Validation_Status: "Valid",
      Submitted_At: text(row.Timestamp),
      Validated_At: "",
      Reviewed_By: "",
      Review_Status: "Auto Validated",
      Notes: `Historical attendance form backfill. Late submissions accepted.${sourceRow ? "" : " Source response row unresolved."}`,
    };
    if (existing.length > 1) {
      counts.duplicateValidatedReview++;
      reviewKeys.add(reviewKey(row, session.Attendance_Session_ID));
      continue;
    }
    if (existing.length === 1) {
      if (isValidPresent(existing[0])) {
        counts.alreadyPresent++;
        counts.finalPresent++;
        already.push({ key: finalKey, attendanceId: existing[0].Attendance_ID, isLate: isLateOrOutside(row) });
      } else {
        counts.update++;
        counts.finalPresent++;
        updates.push({ key: finalKey, rowNumber: existing[0]._rowNumber, attendanceId: existing[0].Attendance_ID, existing: existing[0], record: baseRecord, isLate: isLateOrOutside(row) });
      }
    } else {
      counts.create++;
      counts.finalPresent++;
      creates.push({ key: finalKey, record: baseRecord, isLate: isLateOrOutside(row) });
    }
  }
  return { counts, creates, updates, already, reviewKeys, indexes: { studentsByAcademy, enrollmentById, groupsById, sessionsById, activeMappings, existingIds } };
}

async function applyPlan(plan) {
  const timestamp = new Date().toISOString();
  const sheets = await sheetsClient(WRITE_SCOPE);
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const headers = plan.live.Attendance_Validated.headers;
  const finalLive = await readLiveSheets(WRITE_SCOPE);
  const liveValidated = finalLive.Attendance_Validated.rows;
  ensureNoTargetDuplicateValidatedDrift(liveValidated, plan);
  const existingIds = new Set(liveValidated.map(row => text(row.Attendance_ID)).filter(Boolean));
  const createRecords = [];
  const noops = [];
  const generatedIds = reserveAttendanceIds(existingIds, plan.creates.length);
  for (const [index, item] of plan.creates.entries()) {
    const livePairRows = liveValidated.filter(row => pairKey(row.Attendance_Session_ID, row.Resolved_Academy_Student_ID) === item.key);
    if (livePairRows.length > 1) fail("VALIDATED_DUPLICATE_DRIFT", `Multiple validated rows now exist for ${item.key}.`);
    if (livePairRows.length === 1 && isValidPresent(livePairRows[0])) {
      noops.push(item);
      continue;
    }
    if (livePairRows.length === 1) fail("FINAL_CREATE_DRIFT", `Create candidate now has a non-present existing row for ${item.key}.`);
    createRecords.push({ ...item.record, Attendance_ID: item.attendanceId || generatedIds[index], Validated_At: timestamp });
  }
  const updateData = [];
  for (const item of plan.updates) {
    const liveRow = liveValidated.find(row => text(row.Attendance_ID) === text(item.attendanceId));
    if (!liveRow) fail("FINAL_UPDATE_DRIFT", `Update candidate ${item.attendanceId} no longer exists.`);
    if (isValidPresent(liveRow)) {
      noops.push(item);
      continue;
    }
    const patch = { ...item.record, Attendance_ID: item.attendanceId, Source_Response_Row: text(liveRow.Source_Response_Row) || item.record.Source_Response_Row, Source_Timestamp: text(liveRow.Source_Timestamp) || item.record.Source_Timestamp, Validated_At: timestamp, Notes: mergeNotes(liveRow.Notes, item.record.Notes) };
    for (const [header, value] of Object.entries(patch)) {
      if (!headers.includes(header)) continue;
      if (String(liveRow[header] ?? "") === String(value ?? "")) continue;
      updateData.push({ range: `'Attendance_Validated'!${columnName(headers.indexOf(header) + 1)}${liveRow._rowNumber}`, values: [[value ?? ""]] });
    }
  }
  if (updateData.length) {
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data: chunkData(updateData, 400).flat() } });
    result.googleSheetsWriteCalls++;
  }
  for (const chunk of chunkData(createRecords, 500)) {
    if (!chunk.length) continue;
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "'Attendance_Validated'!A:ZZ",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: chunk.map(record => headers.map(header => record[header] ?? "")) },
    });
    result.googleSheetsWriteCalls++;
  }
  return { created: createRecords.length, updated: plan.updates.length - noops.filter(item => item.attendanceId).length, noops: noops.length };
}

async function verifyPostApply(file, plan, applied) {
  const live = await readLiveSheets(WRITE_SCOPE);
  const validated = live.Attendance_Validated.rows;
  const duplicateAttendanceIds = countDuplicateValues(validated.map(row => text(row.Attendance_ID)).filter(Boolean));
  const presentRows = validated.filter(isValidPresent);
  const duplicatePresentPairs = countDuplicateValues(presentRows.map(row => pairKey(row.Attendance_Session_ID, row.Resolved_Academy_Student_ID)).filter(key => key !== "::"));
  const absentRowsCreated = validated.filter(row => normalizeCode(row.Attendance_Status) === "ABSENT").length - plan.live.Attendance_Validated.rows.filter(row => normalizeCode(row.Attendance_Status) === "ABSENT").length;
  const rowDelta = validated.length - plan.live.Attendance_Validated.rows.length;
  const expectedDelta = applied.created;
  if (rowDelta !== expectedDelta) return { ok: false, reason: `Attendance_Validated row delta ${rowDelta} did not equal created rows ${expectedDelta}.`, duplicateAttendanceIds, duplicatePresentPairs, absentRowsCreated };
  if (duplicateAttendanceIds || duplicatePresentPairs || absentRowsCreated) return { ok: false, reason: "Duplicate IDs, duplicate present pairs, or absent rows detected.", duplicateAttendanceIds, duplicatePresentPairs, absentRowsCreated };
  const recalculated = await calculatePlan(file, WRITE_SCOPE);
  if (recalculated.creates.length || recalculated.updates.length || recalculated.counts.alreadyPresent !== EXPECTED.finalPresent) return { ok: false, reason: "Recalculated plan still has safe candidates after apply.", duplicateAttendanceIds, duplicatePresentPairs, absentRowsCreated };
  return { ok: true, reason: "", duplicateAttendanceIds, duplicatePresentPairs, absentRowsCreated };
}

function createBackup(file, hash, plan) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(process.cwd(), "backups", "attendance-form-backfill", stamp);
  fs.mkdirSync(dir, { recursive: true });
  const reservedCreateIds = reserveAttendanceIds(new Set(plan.live.Attendance_Validated.rows.map(row => text(row.Attendance_ID)).filter(Boolean)), plan.creates.length);
  plan.creates.forEach((item, index) => { item.attendanceId = reservedCreateIds[index]; });
  const full = plan.live.Attendance_Validated;
  writeJson(path.join(dir, "attendance-validated-full.json"), full);
  writeJson(path.join(dir, "create-candidates.json"), plan.creates.map(item => ({ key: item.key, attendanceId: item.attendanceId, record: item.record, isLate: item.isLate })));
  writeJson(path.join(dir, "update-candidates.json"), plan.updates.map(item => ({ key: item.key, attendanceId: item.attendanceId, rowNumber: item.rowNumber, before: item.existing, record: item.record, isLate: item.isLate })));
  writeJson(path.join(dir, "skipped-and-review-counts.json"), { alreadyPresent: plan.counts.alreadyPresent, duplicateValidatedReview: plan.counts.duplicateValidatedReview, sessionReviewRequired: plan.counts.sessionReviewRequired, studentReviewRequired: plan.counts.studentReviewRequired, identityConflicts: plan.counts.identityConflicts, noEligibleMapping: plan.counts.noEligibleMapping, multipleEligibleEnrollments: plan.counts.multipleEligibleEnrollments });
  const manifest = {
    timestamp: startedAt,
    inputFilename: path.basename(file),
    inputSha256: hash,
    originalAttendanceValidatedRowCount: full.rows.length,
    createCount: plan.creates.length,
    updateCount: plan.updates.length,
    alreadyPresent: plan.counts.alreadyPresent,
    reviewCounts: {
      duplicateValidatedReview: plan.counts.duplicateValidatedReview,
      sessionReviewRequired: plan.counts.sessionReviewRequired,
      studentReviewRequired: plan.counts.studentReviewRequired,
      identityConflicts: plan.counts.identityConflicts,
      noEligibleMapping: plan.counts.noEligibleMapping,
      multipleEligibleEnrollments: plan.counts.multipleEligibleEnrollments,
    },
    idsPlannedForUpdate: plan.updates.map(item => item.attendanceId),
    keysPlannedForCreate: plan.creates.map(item => item.key),
    backupCompletedBeforeWrites: true,
  };
  writeJson(path.join(dir, "manifest.json"), manifest);
  try { fs.copyFileSync(file, path.join(dir, path.basename(file))); } catch {}
  return { dir };
}

function validateBackup(dir) {
  for (const name of ["manifest.json", "attendance-validated-full.json", "create-candidates.json", "update-candidates.json", "skipped-and-review-counts.json"]) JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  return true;
}

async function rollbackFromBackup(dir) {
  const { rollbackAttendanceBackfill } = await import("./rollback-attendance-form-backfill.mjs");
  await rollbackAttendanceBackfill(dir, { internal: true });
}

function validateApprovedCounts(counts) {
  const mismatches = [];
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const actualKey = key === "duplicateFormSubmissions" ? "duplicateFormSubmissions" : key;
    if (counts[actualKey] !== expected) mismatches.push(`${key}: expected ${expected}, got ${counts[actualKey]}`);
  }
  if (mismatches.length) fail("PREFLIGHT_COUNT_DRIFT", mismatches.join("; "));
}

function validateWritePlan(plan) {
  if (plan.creates.length !== EXPECTED.create || plan.updates.length !== EXPECTED.update) fail("SAFE_WRITE_PLAN_MISMATCH", "Safe write plan did not match approved create/update counts.");
  const keys = [...plan.creates, ...plan.updates].map(item => item.key);
  if (new Set(keys).size !== keys.length) fail("WRITE_PLAN_DUPLICATE_KEY", "Write plan contains duplicate session/student keys.");
  const ids = reserveAttendanceIds(new Set(plan.live.Attendance_Validated.rows.map(row => text(row.Attendance_ID)).filter(Boolean)), plan.creates.length);
  if (new Set(ids).size !== ids.length) fail("ATTENDANCE_ID_GENERATION_FAILED", "Generated Attendance_ID values are not unique.");
}

function samePlan(left, right) {
  const createLeft = new Set(left.creates.map(item => item.key));
  const createRight = new Set(right.creates.map(item => item.key));
  const updateLeft = new Set(left.updates.map(item => `${item.key}::${item.attendanceId}`));
  const updateRight = new Set(right.updates.map(item => `${item.key}::${item.attendanceId}`));
  return setEq(createLeft, createRight) && setEq(updateLeft, updateRight);
}

function setEq(left, right) {
  return left.size === right.size && [...left].every(item => right.has(item));
}

function reserveAttendanceIds(existing, count) {
  const nums = [...existing].map(id => /^ATT_(\d{5,})$/.exec(id)).filter(Boolean).map(match => Number(match[1]));
  if (!nums.length) fail("ATTENDANCE_ID_CONVENTION_UNKNOWN", "No ATT_00000 style Attendance_ID values found.");
  let next = Math.max(...nums) + 1;
  const ids = [];
  while (ids.length < count) {
    const id = `ATT_${String(next).padStart(5, "0")}`;
    if (!existing.has(id)) ids.push(id);
    next++;
  }
  return ids;
}

function ensureNoTargetDuplicateValidatedDrift(rows, plan) {
  const targetKeys = new Set([...plan.creates, ...plan.updates].map(item => item.key));
  const byPair = groupBy(rows.filter(row => targetKeys.has(pairKey(row.Attendance_Session_ID, row.Resolved_Academy_Student_ID))), row => pairKey(row.Attendance_Session_ID, row.Resolved_Academy_Student_ID));
  for (const [key, matches] of byPair.entries()) {
    if (matches.length > 1) fail("VALIDATED_DUPLICATE_DRIFT", `Target candidate ${key} now has multiple validated rows.`);
  }
}

async function readLiveSheets(scope) {
  const sheets = await sheetsClient(scope);
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const entries = [];
  for (const sheet of LIVE_SHEETS) {
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheet}'!A:ZZ`, valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
    entries.push([sheet, rowsFromValues(response.data.values ?? [])]);
  }
  return Object.fromEntries(entries);
}

async function sheetsClient(scope) {
  const credentials = JSON.parse(Buffer.from(requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64"), "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({ credentials, scopes: [scope] });
  return google.sheets({ version: "v4", auth });
}

function validateWorkbook(workbook, processed) {
  for (const sheet of ["Processed Data", "Session Summary", "Needs Review"]) if (!workbook.sheets[sheet]) fail("WORKBOOK_REQUIRED_SHEET_MISSING", `${sheet} missing.`);
  const required = ["Timestamp", "Original Code", "Canonical Code", "Session Group", "Match Confidence", "Timing Status", "University Student ID", "Student Name", "Phone", "Attendance Status", "Matching / Timing Note", "Original Row"];
  const headers = workbook.sheets["Processed Data"].headers;
  const missing = required.filter(header => !headers.includes(header));
  if (missing.length) fail("WORKBOOK_REQUIRED_HEADER_MISSING", missing.join(", "));
  const dup = duplicates(headers);
  if (dup.length) fail("WORKBOOK_DUPLICATED_HEADER", dup.join(", "));
  if (processed.length !== EXPECTED.processedRows) fail("WORKBOOK_PARSE_COUNT_MISMATCH", `Processed rows ${processed.length}`);
}

function validateAttendanceHeaders(headers) {
  const missing = REQUIRED_HEADERS.filter(header => !headers.includes(header));
  if (missing.length) fail("ATTENDANCE_VALIDATED_HEADER_MISSING", missing.join(", "));
}

function resolveSession(row, sessionsByCodeDate) {
  const sessionGroup = normalizeSessionGroup(row["Session Group"]);
  const parts = sessionGroup.split("|").map(part => part.trim());
  const groupDate = normalizeDate(parts.at(-1) ?? "");
  const matches = sessionsByCodeDate.get(`${normalizeCode(row["Canonical Code"])}::${groupDate}`) ?? [];
  return matches.length === 1 ? matches[0] : null;
}

function resolveStudent(row, studentsByUniversityId, studentsByPhone, studentsByName) {
  const id = normalizeUniversityId(row["University Student ID"]);
  const phone = normalizePhone(row.Phone);
  const name = normalizeName(row["Student Name"]);
  const exact = studentsByUniversityId.get(id) ?? [];
  if (exact.length === 1) {
    const student = exact[0];
    const phoneMatches = phone ? studentsByPhone.get(phone) ?? [] : [];
    const nameMatches = name ? studentsByName.get(name) ?? [] : [];
    if (phoneMatches.length === 1 && phoneMatches[0].Academy_Student_ID !== student.Academy_Student_ID) return { category: "IDENTITY_CONFLICT", student: null };
    if (nameMatches.length === 1 && nameMatches[0].Academy_Student_ID !== student.Academy_Student_ID) return { category: "IDENTITY_CONFLICT", student: null };
    return { category: "EXACT", student };
  }
  if (!exact.length) {
    const phoneMatches = phone ? studentsByPhone.get(phone) ?? [] : [];
    const nameMatches = name ? studentsByName.get(name) ?? [] : [];
    if (phoneMatches.length === 1 && nameMatches.length === 1 && phoneMatches[0].Academy_Student_ID === nameMatches[0].Academy_Student_ID) return { category: "FALLBACK", student: phoneMatches[0] };
  }
  return { category: "REVIEW", student: null };
}

function resolveEligibleEnrollment(student, session, enrollments, groupsById, activeMappings) {
  const eligible = enrollments.filter(enrollment => {
    if (text(enrollment.Academy_Student_ID) !== text(student.Academy_Student_ID)) return false;
    if (["CANCELLED", "WITHDRAWN"].includes(normalizeCode(enrollment.Enrollment_Status))) return false;
    const groupId = text(enrollment.Group_ID);
    const group = groupsById.get(groupId);
    return group && text(group.Batch_ID) === text(session.Batch_ID) && activeMappings.has(`${text(session.Attendance_Session_ID)}::${groupId}`);
  });
  if (eligible.length === 1) return { category: "ONE", enrollment: eligible[0] };
  if (eligible.length > 1) return { category: "MULTIPLE", enrollment: null };
  return { category: "NONE", enrollment: null };
}

function readXlsxWorkbook(filePath) {
  if (!fs.existsSync(filePath)) fail("WORKBOOK_NOT_READABLE", `Workbook not found: ${filePath}`);
  const zip = readZipEntries(fs.readFileSync(filePath));
  const sharedStrings = parseSharedStrings(readZipText(zip, "xl/sharedStrings.xml", false));
  const workbookXml = readZipText(zip, "xl/workbook.xml", true);
  const rels = parseRelationships(readZipText(zip, "xl/_rels/workbook.xml.rels", true));
  const sheets = {};
  for (const sheet of parseWorkbookSheets(workbookXml)) {
    const target = rels.get(sheet.rId);
    if (!target) continue;
    sheets[sheet.name] = parseSheet(readZipText(zip, `xl/${target.replace(/^\/?xl\//, "")}`, true), sharedStrings);
  }
  return { sheets };
}

function readZipEntries(buffer) {
  const eocdOffset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocdOffset < 0) fail("WORKBOOK_NOT_XLSX", "Workbook is not readable XLSX.");
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let offset = centralOffset;
  const end = centralOffset + centralSize;
  while (offset < end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : zlib.inflateRawSync(compressed, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    if (data.length !== uncompressedSize && uncompressedSize !== 0) fail("XLSX_ENTRY_SIZE_MISMATCH", name);
    entries.set(name, data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function parseSheet(xml, sharedStrings) {
  const rawRows = [...xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)];
  const rows = rawRows.map((rowMatch, rowIndex) => {
    const cells = {};
    for (const cellMatch of rowMatch[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const ref = attr(cellMatch[1], "r");
      if (!ref) continue;
      cells[ref.replace(/[0-9]/g, "")] = parseCellValue(cellMatch[1], cellMatch[2] ?? "", sharedStrings);
    }
    cells._rowNumber = rowIndex + 1;
    return cells;
  });
  const headerByColumn = new Map();
  for (const column of Object.keys(rows[0] ?? {}).filter(key => key !== "_rowNumber").sort(columnSort)) {
    const header = text(rows[0][column]);
    if (header) headerByColumn.set(column, header);
  }
  const headers = [...headerByColumn.values()];
  const dataRows = rows.slice(1).map((cells, index) => {
    const row = { _rowNumber: index + 2 };
    for (const [column, header] of headerByColumn.entries()) row[header] = cells[column] ?? "";
    return row;
  }).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && text(value)));
  return { headers, rows: dataRows };
}

function parseCellValue(attrs, body, sharedStrings) {
  const type = attr(attrs, "t");
  const inline = /<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/.exec(body);
  const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body);
  if (type === "s" && v) return sharedStrings[Number(v[1])] ?? "";
  if (inline) return decodeXml(inline[1]);
  if (type === "b" && v) return v[1] === "1" ? "TRUE" : "FALSE";
  if (v) return decodeXml(v[1]);
  return "";
}

function rowsFromValues(values) {
  const headers = (values[0] ?? []).map(value => text(value));
  return { headers, rows: values.slice(1).map((row, index) => {
    const object = { _rowNumber: index + 2 };
    headers.forEach((header, column) => { if (header) object[header] = String(row[column] ?? ""); });
    return object;
  }).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && text(value))) };
}

function zeroCounts() { return { processedRows: 0, uniquePairs: 0, duplicateFormSubmissions: 0, needsReviewRows: 0, lateOutsideAccepted: 0, exactSessionMatches: 0, sessionReviewRequired: 0, exactStudentIdMatches: 0, safeFallbackMatches: 0, studentReviewRequired: 0, identityConflicts: 0, eligibleMappedCandidates: 0, noEligibleMapping: 0, multipleEligibleEnrollments: 0, create: 0, update: 0, alreadyPresent: 0, duplicateValidatedReview: 0, sourceRowUnresolved: 0, finalPresent: 0 }; }
function rawPairKey(row) { const sg = normalizeSessionGroup(row["Session Group"]); const id = normalizeUniversityId(row["University Student ID"]); return sg && id && sg !== "NEEDS REVIEW" ? `${sg}::${id}` : ""; }
function reviewKey(row, session) { return `${session}::${normalizeUniversityId(row["University Student ID"])}::${text(row["Original Row"])}`; }
function pairKey(session, academy) { return `${text(session)}::${text(academy)}`; }
function isLateOrOutside(row) { const value = `${text(row["Timing Status"])} ${text(row["Attendance Status"])}`; return /خارج|توقيت|متأخر|late|outside/i.test(value) && !/داخل توقيت السيشن/i.test(text(row["Timing Status"])); }
function isValidPresent(row) { return normalizeCode(row.Attendance_Status) === "PRESENT" && normalizeCode(row.Validation_Status) === "VALID"; }
function isMappingActive(row) { const raw = text(row.Is_Active || row.Access_Status || row.Mapping_Status); return !raw || ["TRUE", "ACTIVE", "YES", "1"].includes(raw.toUpperCase()); }
function normalizeCode(value) { return text(value).toUpperCase().replace(/\s+/g, " "); }
function normalizeSessionGroup(value) { return text(value).replace(/\s+/g, " "); }
function normalizeUniversityId(value) { return text(value).replace(/\.0$/, "").replace(/\s+/g, "").toUpperCase(); }
function normalizePhone(value) { let digits = text(value).replace(/\D+/g, ""); if (digits.startsWith("20") && digits.length === 12) digits = `0${digits.slice(2)}`; if (digits.length === 10 && digits.startsWith("1")) digits = `0${digits}`; return digits; }
function normalizeName(value) { return text(value).replace(/\s+/g, " ").toLocaleLowerCase("en-US"); }
function normalizeDate(value) { const raw = text(value); if (!raw) return ""; if (/^\d+(\.\d+)?$/.test(raw)) return serialDate(Number(raw)); const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw); if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`; const loc = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw); return loc ? `${loc[3]}-${loc[1].padStart(2, "0")}-${loc[2].padStart(2, "0")}` : ""; }
function serialDate(value) { const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(value)) * 86400000); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`; }
function sourceSignature(timestamp, code, studentId, name, phone) { return [text(timestamp).replace(/\s+/g, " "), normalizeCode(code), normalizeUniversityId(studentId), normalizeName(name), normalizePhone(phone)].join("::"); }
function groupBy(rows, getKey) { const map = new Map(); for (const row of rows) { const key = getKey(row); if (!key) continue; map.set(key, [...(map.get(key) ?? []), row]); } return map; }
function duplicates(values) { const seen = new Set(); const dup = new Set(); for (const value of values) { if (seen.has(value)) dup.add(value); seen.add(value); } return [...dup]; }
function countDuplicateValues(values) { return duplicates(values).length; }
function mergeNotes(existing, note) { const base = text(existing); if (!base) return note; return base.includes(note) ? base : `${base} ${note}`; }
function chunkData(values, size) { const chunks = []; for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size)); return chunks; }
function columnName(index) { let value = index, name = ""; while (value > 0) { value--; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26); } return name; }
function text(value) { return String(value ?? "").trim(); }
function parseArgs(argv) { const parsed = {}; for (let i = 0; i < argv.length; i++) { if (argv[i] === "--file") parsed.file = argv[++i] ?? ""; else if (argv[i] === "--apply") parsed.apply = true; else if (argv[i] === "--confirm") parsed.confirm = argv[++i] ?? ""; } return parsed; }
function resolveWorkbookPath(file) { const direct = path.resolve(file); if (fs.existsSync(direct)) return direct; const downloads = path.resolve("C:/Users/Kimo Store/Downloads", file); if (fs.existsSync(downloads)) return downloads; const alt = file.includes("(1)") ? path.resolve("C:/Users/Kimo Store/Downloads", file.replace("(1)", "").replace(/\s+\.xlsx$/, ".xlsx")) : ""; if (alt && fs.existsSync(alt)) return alt; fail("WORKBOOK_NOT_READABLE", `Workbook not found: ${file}`); }
function requiredEnv(name) { const value = process.env[name]; if (!value) fail("GOOGLE_CONFIG_MISSING", `${name} is not configured.`); return value; }
function sha256File(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function writeJson(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function readZipText(entries, name, required) { const value = entries.get(name); if (!value) { if (required) fail("XLSX_ENTRY_MISSING", name); return ""; } return value.toString("utf8"); }
function parseSharedStrings(xml) { if (!xml) return []; return [...xml.matchAll(/<(?:\w+:)?si\b[\s\S]*?<\/(?:\w+:)?si>/g)].map(match => decodeXml([...match[0].matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(item => item[1]).join(""))); }
function parseRelationships(xml) { const rels = new Map(); for (const match of xml.matchAll(/<Relationship\b([^>]+?)\s*\/>/g)) rels.set(attr(match[1], "Id"), attr(match[1], "Target")); return rels; }
function parseWorkbookSheets(xml) { return [...xml.matchAll(/<(?:\w+:)?sheet\b([^>]+?)\s*\/>/g)].map(match => ({ name: decodeXml(attr(match[1], "name")), rId: attr(match[1], "r:id") })); }
function attr(source, name) { const escaped = name.replace(":", "\\:"); const match = new RegExp(`(?:${escaped}|${name})="([^"]*)"`).exec(source); return match ? decodeXml(match[1]) : ""; }
function decodeXml(value) { return String(value ?? "").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"); }
function columnSort(left, right) { return [...left].reduce((v, l) => v * 26 + l.charCodeAt(0) - 64, 0) - [...right].reduce((v, l) => v * 26 + l.charCodeAt(0) - 64, 0); }
function fail(code, message) { const error = new Error(message); error.code = code; result.failedStep ||= code; throw error; }
function writeReport(summary, workbookPath, hash) { fs.writeFileSync(REPORT_PATH, `# Attendance Form Backfill Apply Report\n\n- Apply timestamp: ${summary.applyTimestamp}\n- Input workbook filename: ${workbookPath ? path.basename(workbookPath) : "-"}\n- SHA-256: ${hash || "-"}\n- Fresh preflight result: ${summary.freshPreflightResult}\n- Final pre-write drift result: ${summary.finalPreWriteDriftResult}\n- Backup directory: ${summary.backupDir || "-"}\n- Backup validation: ${summary.backupValidation}\n- Original Attendance_Validated row count: -\n- CREATE candidates: ${summary.createCandidates}\n- UPDATE candidates: ${summary.updateCandidates}\n- ALREADY_PRESENT: ${summary.alreadyPresent}\n- Late candidates applied: ${summary.lateSubmissionsApplied}\n- Rows created: ${summary.rowsCreated}\n- Rows updated: ${summary.rowsUpdated}\n- Idempotent no-ops: ${summary.idempotentNoOps}\n- Duplicate Attendance_ID count: ${summary.duplicateAttendanceIds}\n- Duplicate Present pair count: ${summary.duplicatePresentPairs}\n- Review candidates changed: ${summary.reviewCandidatesChanged}\n- Absent rows created: ${summary.absentRowsCreated}\n- Source rows left unresolved: ${summary.sourceRowsUnresolved}\n- Post-write verification: ${summary.postApplyVerification}\n- Idempotency simulation: ${summary.idempotencyResult}\n- Rollback attempted: ${summary.rollbackAttempted}\n- Rollback result: ${summary.rollbackResult}\n- Google Sheets write API calls: ${summary.googleSheetsWriteCalls}\n- Final result: ${summary.finalResult}\n- Remaining issue: ${summary.remainingIssue}\n`, "utf8"); }
function printResult(summary) { console.log(JSON.stringify({ previewResult: summary.previewResult, previewWrites: summary.previewWrites, freshPreflightResult: summary.freshPreflightResult, backupDir: summary.backupDir, backupValidation: summary.backupValidation, createCandidates: summary.createCandidates, updateCandidates: summary.updateCandidates, alreadyPresent: summary.alreadyPresent, lateSubmissionsApplied: summary.lateSubmissionsApplied, rowsCreated: summary.rowsCreated, rowsUpdated: summary.rowsUpdated, idempotentNoOps: summary.idempotentNoOps, duplicateAttendanceIds: summary.duplicateAttendanceIds, duplicatePresentPairs: summary.duplicatePresentPairs, reviewCandidatesChanged: summary.reviewCandidatesChanged, absentRowsCreated: summary.absentRowsCreated, sourceRowsUnresolved: summary.sourceRowsUnresolved, postApplyVerification: summary.postApplyVerification, idempotencyResult: summary.idempotencyResult, rollbackAttempted: summary.rollbackAttempted, rollbackResult: summary.rollbackResult, googleSheetsWriteCalls: summary.googleSheetsWriteCalls, finalResult: summary.finalResult, reportPath: REPORT_PATH, remainingIssue: summary.remainingIssue }, null, 2)); }
