import nextEnv from "@next/env";
import { google } from "googleapis";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const REQUIRED_WORKBOOK_SHEETS = ["README", "Migration_Rules", "Normalized_Timetable", "Current_Future_Sessions", "Proposed_Attendance_Sessions", "Proposed_Session_Groups", "Changes_Diff", "Validation", "Reference_Batches", "Reference_Groups"];
const REQUIRED_DATE_WORKBOOK_SHEETS = ["README", "Proposed_Batches", "Proposed_Batch_Levels", "Date_Extension_Diff", "Migration_Rules"];
const LIVE_SHEETS = ["Attendance_Sessions", "Attendance_Session_Groups", "Batches", "Batch_Levels", "Groups", "Attendance_Form_Responses", "Attendance_Validated", "Recorded_Sessions", "Recorded_Session_Groups", "Session_Materials", "Session_Material_Groups", "Staff"];
const SESSION_FIELDS = ["Attendance_Session_ID", "Batch_ID", "Batch_Level_ID", "Session_Number", "Level_Code", "Session_Date", "Start_Time", "End_Time", "Attendance_Code", "Delivery_Mode", "Location", "Session_Status"];
const SESSION_REQUIRED_HEADERS = ["Attendance_Session_ID", "Attendance_Code", "Session_Number", "Session_Date", "Start_Time", "End_Time", "Batch_ID", "Batch_Level_ID", "Level_Code"];
const PROPOSED_SESSION_HEADERS = ["Attendance_Session_ID", "Migration_Action", "Apply_Eligible", "Validation_Status"];
const PROPOSED_MAPPING_HEADERS = ["Migration_Action", "Apply_Eligible", "Attendance_Session_ID", "Group_ID", "Validation_Status"];
const PROPOSED_BATCH_HEADERS = ["Batch_ID", "Migration_Action", "Apply_Eligible", "Changed_Fields", "Old_End_Date", "New_End_Date"];
const PROPOSED_BATCH_LEVEL_HEADERS = ["Batch_Level_ID", "Batch_ID", "Migration_Action", "Apply_Eligible", "Changed_Fields", "Old_End_Date", "New_End_Date"];
const APPROVED_RAW_RESPONSE_EXCEPTIONS = new Set(["ASCH_00036", "ASCH_00046", "ASCH_00064"]);
const APPROVED_RAW_ONLY_EXCEPTIONS = new Set(["ASCH_00046", "ASCH_00064"]);
const VALID_DELIVERY_MODES = new Set(["ONLINE", "OFFLINE", "HYBRID", "UNASSIGNED"]);
const VALID_ACTIONS = new Set(["CREATE", "UPDATE"]);
const VALID_MAPPING_ACTIONS = new Set(["CREATE", "UPDATE", "DISABLE"]);
const V2_EXPECTED_COUNTS = { sessionCreates: 42, sessionUpdates: 65, mappingCreates: 132, mappingUpdates: 162, mappingDisables: 16 };
const V3_EXPECTED_COUNTS = { batchUpdates: 7, batchLevelUpdates: 7 };
const GOOGLE_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const REPORT_PATH = path.resolve(process.cwd(), "ATTENDANCE_SCHEDULE_DRY_RUN_REPORT.md");

const args = parseArgs(process.argv.slice(2));
const workbookPath = args.file ? path.resolve(args.file) : "";
const dateWorkbookPath = args.dateFile ? path.resolve(args.dateFile) : "";

const blocking = [];
const warnings = [];
const readsPerformed = [];
const findingKeys = new Set();
const warningKeys = new Set();
const driftFieldsBySession = new Map();
const batchDriftById = new Map();
const batchLevelDriftById = new Map();

try {
  if (!args.file || !args.dateFile) throw new Error("Both --file and --date-file are required for this final dry run.");
  const workbook = readXlsxWorkbook(workbookPath);
  const dateWorkbook = readXlsxWorkbook(dateWorkbookPath);
  verifyWorkbookBasics(workbook);
  verifyDateWorkbookBasics(dateWorkbook);
  const workbookPreflight = verifyWorkbookParsePreflight(workbook);
  const dateWorkbookPreflight = verifyDateWorkbookParsePreflight(dateWorkbook);

  if (blocking.length) {
    const result = buildPreLiveResult(workbook, workbookPreflight, dateWorkbook, dateWorkbookPreflight);
    fs.writeFileSync(REPORT_PATH, buildReport(result), "utf8");
    printSummary(result);
    process.exit(1);
  }

  nextEnv.loadEnvConfig(process.cwd());
  const live = await readLiveSheets();
  const result = validateDryRun(workbook, dateWorkbook, live, workbookPreflight, dateWorkbookPreflight);
  const report = buildReport(result);
  fs.writeFileSync(REPORT_PATH, report, "utf8");
  printSummary(result);
  process.exit(result.blockingIssueCount ? 1 : 0);
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown verifier error";
  const fallback = {
    workbookRead: false,
    workbookStatus: "UNREADABLE",
    workbookParserStatus: "UNAVAILABLE",
    googleReadOnly: false,
    googleScope: GOOGLE_READONLY_SCOPE,
    writesPerformed: 0,
    readsPerformed,
    sessionCreates: 0,
    sessionUpdates: 0,
    mappingCreates: 0,
    mappingUpdates: 0,
    mappingDisables: 0,
    batchUpdates: 0,
    batchLevelUpdates: 0,
    liveDataDriftCount: 0,
    mappingLiveDriftCount: 0,
    batchLiveDriftCount: 0,
    batchLevelLiveDriftCount: 0,
    liveDataDriftFieldCount: 0,
    sessionsExceedingFinalBatchDates: 0,
    sessionsExceedingFinalBatchLevelDates: 0,
    blockingIssueCount: 1,
    warningCount: 0,
    finalResult: "BLOCKED",
    blocking: [{ code: "SETUP_ERROR", id: "WORKBOOK_OR_READ", reason: message }],
    warnings: [],
    workbookDiagnostics: { requiredSheetsFound: false, readyStatusFound: false, criticalValidationCount: 0 },
    dateWorkbookRead: false,
    dateWorkbookParserStatus: "UNAVAILABLE",
    dateWorkbookDiagnostics: { requiredSheetsFound: false, readyStatusFound: false },
    sessionSummary: {},
    mappingSummary: {},
    codeSummary: {},
    driftFieldsBySession: {},
    batchDriftById: {},
    batchLevelDriftById: {},
  };
  fs.writeFileSync(REPORT_PATH, buildReport(fallback), "utf8");
  printSummary(fallback);
  process.exit(1);
}

function validateDryRun(workbook, dateWorkbook, live, workbookPreflight, dateWorkbookPreflight) {
  const proposedSessions = workbook.sheets.Proposed_Attendance_Sessions.rows;
  const proposedMappings = workbook.sheets.Proposed_Session_Groups.rows;
  const currentFutureSessions = workbook.sheets.Current_Future_Sessions.rows;
  const changesDiff = workbook.sheets.Changes_Diff.rows;

  const sessionCandidates = workbookPreflight.sessionCandidates;
  const mappingCandidates = workbookPreflight.mappingCandidates;
  const proposedSessionById = mapUnique(sessionCandidates, "Attendance_Session_ID", "PROPOSED_SESSION_DUPLICATE");
  const liveSessionById = mapUnique(live.Attendance_Sessions.rows, "Attendance_Session_ID", "LIVE_SESSION_DUPLICATE");
  const liveMappingById = mapUnique(live.Attendance_Session_Groups.rows, mappingIdHeader(live.Attendance_Session_Groups.headers), "LIVE_MAPPING_DUPLICATE");
  const proposedMappingById = mapUnique(mappingCandidates, mappingIdHeader(workbook.sheets.Proposed_Session_Groups.headers), "PROPOSED_MAPPING_DUPLICATE");
  const liveBatchById = mapUnique(live.Batches.rows, "Batch_ID", "LIVE_BATCH_DUPLICATE");
  const liveBatchLevelById = mapUnique(live.Batch_Levels.rows, "Batch_Level_ID", "LIVE_BATCH_LEVEL_DUPLICATE");
  const liveGroupById = mapUnique(live.Groups.rows, "Group_ID", "LIVE_GROUP_DUPLICATE");
  const snapshotById = new Map(currentFutureSessions.map(row => [text(row.Attendance_Session_ID), row]).filter(([id]) => id));
  const diffById = new Map(changesDiff.map(row => [text(row.Attendance_Session_ID), row]).filter(([id]) => id));
  const effectiveSessionById = buildEffectiveSessionState(live.Attendance_Sessions.rows, sessionCandidates);
  const effectiveMappingById = buildEffectiveMappingState(live.Attendance_Session_Groups.rows, mappingCandidates, live.Attendance_Session_Groups.headers, workbook.sheets.Proposed_Session_Groups.headers);
  const effectiveBatchById = buildEffectiveBatchState(live.Batches.rows, dateWorkbookPreflight.batchCandidates);
  const effectiveBatchLevelById = buildEffectiveBatchLevelState(live.Batch_Levels.rows, dateWorkbookPreflight.batchLevelCandidates);
  const candidateSessionIds = new Set(sessionCandidates.map(row => text(row.Attendance_Session_ID)).filter(Boolean));
  const candidateMappingHeader = mappingIdHeader(workbook.sheets.Proposed_Session_Groups.headers);
  const candidateMappingIds = new Set(mappingCandidates.map(row => text(row[candidateMappingHeader])).filter(Boolean));

  const activeMappingsBySession = new Map();
  for (const row of effectiveMappingById.values()) {
    if (disabled(row)) continue;
    const sessionId = text(row.Attendance_Session_ID);
    if (!sessionId) continue;
    activeMappingsBySession.set(sessionId, (activeMappingsBySession.get(sessionId) ?? 0) + 1);
  }

  validateBatchDateUpdates(dateWorkbookPreflight.batchCandidates, liveBatchById);
  validateBatchLevelDateUpdates(dateWorkbookPreflight.batchLevelCandidates, liveBatchLevelById, effectiveBatchById);
  validateSessions(sessionCandidates, { live, liveSessionById, liveBatchById, liveBatchLevelById, effectiveBatchById, effectiveBatchLevelById, activeMappingsBySession, snapshotById, diffById, proposedSessionById });
  validateMappings(mappingCandidates, { live, liveSessionById, proposedSessionById, effectiveSessionById, liveMappingById, proposedMappingById, liveBatchById, liveGroupById, effectiveMappingById, candidateSessionIds, candidateMappingIds });
  validateFinalDateCoverage(sessionCandidates, effectiveBatchById, effectiveBatchLevelById);
  validateProtection(sessionCandidates, live);
  const codeSummary = validateAttendanceCodes(effectiveSessionById, effectiveMappingById, candidateSessionIds, candidateMappingIds);

  const liveDataDriftCount = driftFieldsBySession.size;
  const liveDataDriftFieldCount = [...driftFieldsBySession.values()].reduce((total, fields) => total + fields.length, 0);
  const sessionsExceedingFinalBatchDates = blocking.filter(item => item.code === "SESSION_EXCEEDS_FINAL_BATCH_END").length;
  const sessionsExceedingFinalBatchLevelDates = blocking.filter(item => item.code === "SESSION_EXCEEDS_FINAL_BATCH_LEVEL_END").length;
  const result = {
    workbookRead: true,
    dateWorkbookRead: true,
    workbookStatus: "READY",
    workbookParserStatus: "OK",
    dateWorkbookParserStatus: dateWorkbookPreflight.parserStatus,
    googleReadOnly: true,
    googleScope: GOOGLE_READONLY_SCOPE,
    writesPerformed: 0,
    readsPerformed,
    sessionCreates: workbookPreflight.counts.sessionCreates,
    sessionUpdates: workbookPreflight.counts.sessionUpdates,
    protectedUnchanged: proposedSessions.filter(row => !bool(row.Apply_Eligible)).length,
    mappingCreates: workbookPreflight.counts.mappingCreates,
    mappingUpdates: workbookPreflight.counts.mappingUpdates,
    mappingDisables: workbookPreflight.counts.mappingDisables,
    batchUpdates: dateWorkbookPreflight.counts.batchUpdates,
    batchLevelUpdates: dateWorkbookPreflight.counts.batchLevelUpdates,
    liveDataDriftCount,
    mappingLiveDriftCount: 0,
    batchLiveDriftCount: batchDriftById.size,
    batchLevelLiveDriftCount: batchLevelDriftById.size,
    liveDataDriftFieldCount,
    sessionsExceedingFinalBatchDates,
    sessionsExceedingFinalBatchLevelDates,
    blockingIssueCount: blocking.length,
    warningCount: warnings.length,
    finalResult: blocking.length ? "BLOCKED" : "READY FOR APPLY REVIEW",
    blocking,
    warnings,
    workbookDiagnostics: {
      requiredSheetsFound: REQUIRED_WORKBOOK_SHEETS.every(name => workbook.sheets[name]),
      readyStatusFound: workbook.readyStatusFound,
      criticalValidationCount: workbook.criticalValidationCount,
    },
    dateWorkbookDiagnostics: {
      requiredSheetsFound: REQUIRED_DATE_WORKBOOK_SHEETS.every(name => dateWorkbook.sheets[name]),
      readyStatusFound: dateWorkbook.readyStatusFound,
    },
    sessionSummary: {
      liveSessions: live.Attendance_Sessions.rows.length,
      proposedCandidates: sessionCandidates.length,
      creates: workbookPreflight.counts.sessionCreates,
      updates: workbookPreflight.counts.sessionUpdates,
    },
    mappingSummary: {
      liveMappings: live.Attendance_Session_Groups.rows.length,
      proposedCandidates: mappingCandidates.length,
      creates: workbookPreflight.counts.mappingCreates,
      updates: workbookPreflight.counts.mappingUpdates,
      disables: workbookPreflight.counts.mappingDisables,
      effectiveActiveMappings: [...effectiveMappingById.values()].filter(row => !disabled(row)).length,
    },
    codeSummary,
    driftFieldsBySession: Object.fromEntries([...driftFieldsBySession.entries()].map(([id, fields]) => [id, fields])),
    batchDriftById: Object.fromEntries([...batchDriftById.entries()]),
    batchLevelDriftById: Object.fromEntries([...batchLevelDriftById.entries()]),
  };
  return result;
}

function buildPreLiveResult(workbook, workbookPreflight, dateWorkbook, dateWorkbookPreflight) {
  return {
    workbookRead: true,
    dateWorkbookRead: Boolean(dateWorkbook),
    workbookStatus: workbook.readyStatusFound ? "READY" : "NOT_READY",
    workbookParserStatus: workbookPreflight?.parserStatus ?? "BLOCKED",
    dateWorkbookParserStatus: dateWorkbookPreflight?.parserStatus ?? "BLOCKED",
    googleReadOnly: false,
    googleScope: GOOGLE_READONLY_SCOPE,
    writesPerformed: 0,
    readsPerformed,
    sessionCreates: workbookPreflight?.counts.sessionCreates ?? 0,
    sessionUpdates: workbookPreflight?.counts.sessionUpdates ?? 0,
    protectedUnchanged: workbook.sheets.Proposed_Attendance_Sessions?.rows.filter(row => !bool(row.Apply_Eligible)).length ?? 0,
    mappingCreates: workbookPreflight?.counts.mappingCreates ?? 0,
    mappingUpdates: workbookPreflight?.counts.mappingUpdates ?? 0,
    mappingDisables: workbookPreflight?.counts.mappingDisables ?? 0,
    batchUpdates: dateWorkbookPreflight?.counts.batchUpdates ?? 0,
    batchLevelUpdates: dateWorkbookPreflight?.counts.batchLevelUpdates ?? 0,
    liveDataDriftCount: 0,
    mappingLiveDriftCount: 0,
    batchLiveDriftCount: 0,
    batchLevelLiveDriftCount: 0,
    liveDataDriftFieldCount: 0,
    sessionsExceedingFinalBatchDates: 0,
    sessionsExceedingFinalBatchLevelDates: 0,
    blockingIssueCount: blocking.length,
    warningCount: warnings.length,
    finalResult: "BLOCKED",
    blocking,
    warnings,
    workbookDiagnostics: {
      requiredSheetsFound: REQUIRED_WORKBOOK_SHEETS.every(name => workbook.sheets[name]),
      readyStatusFound: workbook.readyStatusFound,
      criticalValidationCount: workbook.criticalValidationCount,
    },
    dateWorkbookDiagnostics: {
      requiredSheetsFound: dateWorkbook ? REQUIRED_DATE_WORKBOOK_SHEETS.every(name => dateWorkbook.sheets[name]) : false,
      readyStatusFound: Boolean(dateWorkbook?.readyStatusFound),
    },
    sessionSummary: { liveSessions: 0, proposedCandidates: workbookPreflight?.sessionCandidates.length ?? 0, creates: workbookPreflight?.counts.sessionCreates ?? 0, updates: workbookPreflight?.counts.sessionUpdates ?? 0 },
    mappingSummary: { liveMappings: 0, proposedCandidates: workbookPreflight?.mappingCandidates.length ?? 0, creates: workbookPreflight?.counts.mappingCreates ?? 0, updates: workbookPreflight?.counts.mappingUpdates ?? 0, disables: workbookPreflight?.counts.mappingDisables ?? 0 },
    codeSummary: workbookPreflight?.codeSummary ?? {},
    driftFieldsBySession: {},
    batchDriftById: {},
    batchLevelDriftById: {},
  };
}

function verifyWorkbookBasics(workbook) {
  for (const sheet of REQUIRED_WORKBOOK_SHEETS) if (!workbook.sheets[sheet]) addBlock("WORKBOOK_SHEET_MISSING", sheet, "Required workbook sheet is missing.");
  requireHeaders(workbook.sheets.Proposed_Attendance_Sessions, PROPOSED_SESSION_HEADERS, "Proposed_Attendance_Sessions");
  requireHeaders(workbook.sheets.Proposed_Session_Groups, PROPOSED_MAPPING_HEADERS, "Proposed_Session_Groups");
  requireHeaders(workbook.sheets.Current_Future_Sessions, ["Attendance_Session_ID"], "Current_Future_Sessions");
  if (!workbook.readyStatusFound) addBlock("WORKBOOK_NOT_READY", "README", "README status is not READY FOR CODEX DRY RUN.");
  if (workbook.criticalValidationCount > 0) addBlock("WORKBOOK_CRITICAL_VALIDATIONS", "Validation", `${workbook.criticalValidationCount} critical validation row(s) found.`);
}

function verifyDateWorkbookBasics(workbook) {
  for (const sheet of REQUIRED_DATE_WORKBOOK_SHEETS) if (!workbook.sheets[sheet]) addBlock("DATE_WORKBOOK_SHEET_MISSING", sheet, "Required V3 date-extension workbook sheet is missing.");
  requireHeaders(workbook.sheets.Proposed_Batches, PROPOSED_BATCH_HEADERS, "Proposed_Batches");
  requireHeaders(workbook.sheets.Proposed_Batch_Levels, PROPOSED_BATCH_LEVEL_HEADERS, "Proposed_Batch_Levels");
  if (!workbook.readyStatusFound) addBlock("DATE_WORKBOOK_NOT_READY", "README", "V3 README status is not READY FOR CODEX DRY RUN.");
}

function verifyWorkbookParsePreflight(workbook) {
  const proposedSessions = workbook.sheets.Proposed_Attendance_Sessions?.rows ?? [];
  const proposedMappings = workbook.sheets.Proposed_Session_Groups?.rows ?? [];
  const sessionCandidates = proposedSessions.filter(row => VALID_ACTIONS.has(code(row.Migration_Action)) && bool(row.Apply_Eligible));
  const mappingCandidates = proposedMappings.filter(row => VALID_MAPPING_ACTIONS.has(code(row.Migration_Action)) && bool(row.Apply_Eligible));
  const counts = {
    sessionCreates: sessionCandidates.filter(row => code(row.Migration_Action) === "CREATE").length,
    sessionUpdates: sessionCandidates.filter(row => code(row.Migration_Action) === "UPDATE").length,
    mappingCreates: mappingCandidates.filter(row => code(row.Migration_Action) === "CREATE").length,
    mappingUpdates: mappingCandidates.filter(row => code(row.Migration_Action) === "UPDATE").length,
    mappingDisables: mappingCandidates.filter(row => code(row.Migration_Action) === "DISABLE").length,
  };
  validateExpectedCounts("V2", counts, V2_EXPECTED_COUNTS);

  validateWorkbookCandidates(sessionCandidates, mappingCandidates);
  const proposedSessionById = mapUnique(sessionCandidates, "Attendance_Session_ID", "PROPOSED_SESSION_DUPLICATE");
  const proposedCodeByValue = new Map();
  const invalidCodes = new Set();
  const duplicateCodes = new Set();
  for (const row of sessionCandidates) {
    const id = text(row.Attendance_Session_ID);
    const value = text(row.Attendance_Code);
    if (!value) addBlock("SESSION_ATTENDANCE_CODE_BLANK", id || "Proposed_Attendance_Sessions", "Eligible session has blank Attendance_Code.");
    if (value && !/^[1-9][0-9]{5}$/.test(value)) {
      invalidCodes.add(id || value);
      addBlock("INVALID_ATTENDANCE_CODE", id || value, "Attendance_Code is not six numeric digits without leading zero.");
    }
    if (/^[1-9][0-9]{5}$/.test(value)) {
      const existing = proposedCodeByValue.get(value);
      if (existing && existing !== id) {
        duplicateCodes.add(value);
        addBlock("ATTENDANCE_CODE_DUPLICATE", value, "Proposed effective sessions contain duplicate Attendance_Code.");
      }
      proposedCodeByValue.set(value, id);
    }
  }

  const proposedMappingHeader = mappingIdHeader(workbook.sheets.Proposed_Session_Groups?.headers ?? []);
  const proposedMappingPairs = new Set();
  const proposedMappingMismatches = new Set();
  for (const row of mappingCandidates) {
    if (code(row.Migration_Action) === "DISABLE" || disabled(row)) continue;
    const id = text(row[proposedMappingHeader]) || text(row.Attendance_Session_ID);
    const parent = proposedSessionById.get(text(row.Attendance_Session_ID));
    const pair = `${text(row.Attendance_Session_ID)}\u0001${text(row.Group_ID)}`;
    if (proposedMappingPairs.has(pair)) addBlock("DUPLICATE_PROPOSED_MAPPING_PAIR", id, "Duplicate active proposed Attendance_Session_ID + Group_ID mapping.");
    if (text(row.Attendance_Session_ID) && text(row.Group_ID)) proposedMappingPairs.add(pair);
    if (!parent) continue;
    if (text(row.Attendance_Code) && text(row.Attendance_Code) !== text(parent.Attendance_Code)) {
      proposedMappingMismatches.add(id);
      addBlock("MAPPING_CODE_MISMATCH", id, "Active proposed mapping Attendance_Code does not match proposed parent session.");
    }
    if (text(row.Session_Number) && normalizeSessionNumber(row.Session_Number) !== normalizeSessionNumber(parent.Session_Number)) addBlock("MAPPING_SESSION_NUMBER_MISMATCH", id, "Active proposed mapping Session_Number does not match proposed parent session.");
    if (text(row.Batch_ID) && text(row.Batch_ID) !== text(parent.Batch_ID)) addBlock("MAPPING_BATCH_ID_MISMATCH", id, "Active proposed mapping Batch_ID does not match proposed parent session.");
    if (text(row.Level_Code) && code(row.Level_Code) !== code(parent.Level_Code)) addBlock("MAPPING_LEVEL_CODE_MISMATCH", id, "Active proposed mapping Level_Code does not match proposed parent session.");
  }

  return {
    parserStatus: "OK",
    sessionCandidates,
    mappingCandidates,
    counts,
    codeSummary: {
      validNumericCodes: sessionCandidates.length - invalidCodes.size,
      invalidCodes: invalidCodes.size,
      duplicateCodes: duplicateCodes.size,
      sessionMapCodeMismatches: proposedMappingMismatches.size,
    },
  };
}

function verifyDateWorkbookParsePreflight(workbook) {
  const batchRows = workbook.sheets.Proposed_Batches?.rows ?? [];
  const batchLevelRows = workbook.sheets.Proposed_Batch_Levels?.rows ?? [];
  const batchCandidates = batchRows.filter(row => code(row.Migration_Action) === "UPDATE" && bool(row.Apply_Eligible));
  const batchLevelCandidates = batchLevelRows.filter(row => code(row.Migration_Action) === "UPDATE" && bool(row.Apply_Eligible));
  const counts = { batchUpdates: batchCandidates.length, batchLevelUpdates: batchLevelCandidates.length };
  validateExpectedCounts("V3", counts, V3_EXPECTED_COUNTS);

  const seenBatchIds = new Set();
  for (const row of batchCandidates) {
    const id = text(row.Batch_ID);
    if (!id) addBlock("BATCH_ID_MISSING", "Proposed_Batches", "Candidate batch update is missing Batch_ID.");
    if (id && seenBatchIds.has(id)) addBlock("PROPOSED_BATCH_DUPLICATE", id, "Duplicate proposed Batch_ID update.");
    seenBatchIds.add(id);
    validateDateExtensionCandidate(row, id || "Proposed_Batches", "Batch");
  }

  const seenBatchLevelIds = new Set();
  for (const row of batchLevelCandidates) {
    const id = text(row.Batch_Level_ID);
    if (!id) addBlock("BATCH_LEVEL_ID_MISSING", "Proposed_Batch_Levels", "Candidate batch-level update is missing Batch_Level_ID.");
    if (id && seenBatchLevelIds.has(id)) addBlock("PROPOSED_BATCH_LEVEL_DUPLICATE", id, "Duplicate proposed Batch_Level_ID update.");
    seenBatchLevelIds.add(id);
    validateDateExtensionCandidate(row, id || "Proposed_Batch_Levels", "Batch Level");
  }

  return { parserStatus: "OK", batchCandidates, batchLevelCandidates, counts };
}

function validateExpectedCounts(label, counts, expected) {
  const mismatch = Object.entries(expected).filter(([key, value]) => counts[key] !== value);
  if (!mismatch.length) return;
  addBlock("WORKBOOK_PARSE_COUNT_MISMATCH", label, `Parsed counts: ${Object.entries(counts).map(([key, value]) => `${key} ${value}`).join(", ")}.`);
}

function validateDateExtensionCandidate(row, id, label) {
  if (code(row.Migration_Action) !== "UPDATE") addBlock(`${code(label)}_ACTION_INVALID`, id, "Migration_Action must equal UPDATE.");
  if (!bool(row.Apply_Eligible)) addBlock(`${code(label)}_NOT_APPLY_ELIGIBLE`, id, "Apply_Eligible must equal TRUE.");
  if (code(row.Changed_Fields) !== "END_DATE") addBlock(`${code(label)}_CHANGED_FIELDS_INVALID`, id, "Changed_Fields must equal End_Date.");
  const oldDate = parseDate(row.Old_End_Date);
  const newDate = parseDate(row.New_End_Date);
  if (!oldDate) addBlock(`${code(label)}_OLD_END_DATE_INVALID`, id, "Old_End_Date is invalid.");
  if (!newDate) addBlock(`${code(label)}_NEW_END_DATE_INVALID`, id, "New_End_Date is invalid.");
  if (oldDate && newDate && newDate.day < oldDate.day) addBlock(`${code(label)}_NEW_END_DATE_EARLIER`, id, "New_End_Date is earlier than Old_End_Date.");
}

function validateWorkbookCandidates(sessionCandidates, mappingCandidates) {
  for (const row of sessionCandidates) {
    const id = text(row.Attendance_Session_ID);
    if (!id) addBlock("SESSION_ID_MISSING", "Proposed_Attendance_Sessions", "Candidate session is missing Attendance_Session_ID.");
    for (const field of ["Attendance_Code", "Migration_Action", "Apply_Eligible", "Validation_Status"]) if (!text(row[field])) addBlock("WORKBOOK_PARSER_SANITY_FAILED", id || "Proposed_Attendance_Sessions", `Eligible session has unreadable ${field}.`);
    if (!text(row.Validation_Status)) addWarn("SESSION_VALIDATION_STATUS_BLANK", id || "Proposed_Attendance_Sessions", "Validation_Status is blank.");
  }
  for (const row of mappingCandidates) {
    const id = text(row[mappingIdHeader(Object.keys(row))]);
    if (!id) addBlock("MAPPING_ID_MISSING", text(row.Attendance_Session_ID) || "Proposed_Session_Groups", "Candidate mapping is missing mapping ID.");
    if (!text(row.Validation_Status)) addWarn("MAPPING_VALIDATION_STATUS_BLANK", id || text(row.Attendance_Session_ID), "Validation_Status is blank.");
  }
}

function validateSessions(candidates, context) {
  const proposedDuplicateKey = new Set();
  for (const row of candidates) {
    const id = text(row.Attendance_Session_ID);
    const action = code(row.Migration_Action);
    const liveRow = context.liveSessionById.get(id);
    if (action === "UPDATE") {
      if (!liveRow) addBlock("LIVE_SESSION_NOT_FOUND", id, "Proposed update target does not exist in live Attendance_Sessions.");
      else detectSessionDrift(row, liveRow, context.snapshotById.get(id), context.diffById.get(id));
    }
    if (action === "CREATE") {
      if (liveRow) addBlock("NEW_SESSION_ID_EXISTS", id, "Proposed create ID already exists in live Attendance_Sessions.");
      const duplicate = context.live.Attendance_Sessions.rows.find(live => sessionDuplicateKey(live) === sessionDuplicateKey(row));
      if (duplicate) addBlock("DUPLICATE_LIVE_SESSION", id, "Proposed create duplicates an existing live session signature.");
    }
    const duplicateKey = sessionDuplicateKey(row);
    if (duplicateKey && proposedDuplicateKey.has(duplicateKey)) addBlock("DUPLICATE_PROPOSED_SESSION", id, "Proposed sessions contain duplicate session signature.");
    if (duplicateKey) proposedDuplicateKey.add(duplicateKey);
    validateSessionFields(row, context, action);
  }
}

function validateSessionFields(row, context, action) {
  const id = text(row.Attendance_Session_ID);
  const batch = (context.effectiveBatchById ?? context.liveBatchById).get(text(row.Batch_ID));
  const level = (context.effectiveBatchLevelById ?? context.liveBatchLevelById).get(text(row.Batch_Level_ID));
  if (!batch) addBlock("BATCH_NOT_FOUND", id, "Batch_ID does not exist.");
  if (!level) addBlock("BATCH_LEVEL_NOT_FOUND", id, "Batch_Level_ID does not exist.");
  if (batch && level && text(level.Batch_ID) !== text(row.Batch_ID)) addBlock("BATCH_LEVEL_BATCH_MISMATCH", id, "Batch_Level_ID does not belong to Batch_ID.");
  if (level && code(level.Level_Code) !== code(row.Level_Code)) addBlock("LEVEL_CODE_MISMATCH", id, "Level_Code does not match Batch_Level.");
  if (!Number.isFinite(Number(text(row.Session_Number))) || Number(text(row.Session_Number)) <= 0) addBlock("INVALID_SESSION_NUMBER", id, "Session_Number is invalid.");
  const date = parseDate(text(row.Session_Date));
  if (!date) addBlock("INVALID_SESSION_DATE", id, "Session_Date is invalid.");
  const start = minutes(text(row.Start_Time));
  const end = minutes(text(row.End_Time));
  if (start === null || end === null || end <= start) addBlock("INVALID_SESSION_TIME_RANGE", id, "Start_Time and End_Time are invalid or not ordered.");
  const duration = numeric(row.Duration_Hours);
  if (duration !== null && start !== null && end !== null && Math.abs(duration - ((end - start) / 60)) > 0.01) addBlock("DURATION_MISMATCH", id, "Duration_Hours does not match Start_Time and End_Time.");
  if (date && text(row.Day_Name) && normalizeDay(text(row.Day_Name)) !== normalizeDay(dayName(date))) addBlock("DAY_NAME_MISMATCH", id, "Day_Name does not match Session_Date.");
  if (date && text(row.Open_From) && !dateTimeMatches(text(row.Open_From), date.iso, text(row.Start_Time))) addBlock("OPEN_FROM_MISMATCH", id, "Open_From does not match Session_Date and Start_Time.");
  if (date && text(row.Close_At) && !dateTimeMatches(text(row.Close_At), date.iso, text(row.End_Time))) addBlock("CLOSE_AT_MISMATCH", id, "Close_At does not match Session_Date and End_Time.");
  if (!text(row.Session_Title)) addBlock("SESSION_TITLE_BLANK", id, "Session_Title is blank.");
  if (!VALID_DELIVERY_MODES.has(code(row.Delivery_Mode))) addBlock("INVALID_DELIVERY_MODE", id, "Delivery_Mode is invalid.");
  if (!text(row.Location)) addBlock("LOCATION_BLANK", id, "Location is blank.");
  if (action === "CREATE" && !context.activeMappingsBySession.get(id)) addBlock("NEW_SESSION_WITHOUT_ACTIVE_MAPPING", id, "New session has no active proposed/live group mapping.");
  if (action === "UPDATE" && !context.activeMappingsBySession.get(id)) addBlock("UPDATED_SESSION_WITHOUT_ACTIVE_MAPPING", id, "Updated session would have no active group mapping.");
  if (text(row.Instructor) && !text(row.Staff_ID)) addWarn("INSTRUCTOR_WITHOUT_STAFF_ID", id, "Instructor name is present without Staff ID.");
}

function validateMappings(candidates, context) {
  const proposedPairKeys = new Set();
  for (const row of candidates) {
    const mapHeader = mappingIdHeader(Object.keys(row));
    const id = text(row[mapHeader]);
    const action = code(row.Migration_Action);
    const sessionId = text(row.Attendance_Session_ID);
    const groupId = text(row.Group_ID);
    const session = context.effectiveSessionById.get(sessionId);
    const group = context.liveGroupById.get(groupId);
    if (!session) addBlock("MAPPING_SESSION_NOT_FOUND", id || sessionId, "Attendance_Session_ID does not exist in live or proposed sessions.");
    if (!group) addBlock("MAPPING_GROUP_NOT_FOUND", id || groupId, "Group_ID does not exist.");
    if (action === "CREATE" && context.liveMappingById.get(id)) addBlock("NEW_MAPPING_ID_EXISTS", id, "Proposed mapping ID already exists.");
    if ((action === "UPDATE" || action === "DISABLE") && !context.liveMappingById.get(id)) addBlock("LIVE_MAPPING_NOT_FOUND", id, "Proposed mapping target does not exist.");
    const pair = `${sessionId}\u0001${groupId}`;
    if (action === "CREATE" && findLiveActivePair(context.live.Attendance_Session_Groups.rows, sessionId, groupId)) addBlock("DUPLICATE_LIVE_MAPPING_PAIR", id, "Live active mapping already exists for this session and group.");
    if (action !== "DISABLE") {
      if (proposedPairKeys.has(pair)) addBlock("DUPLICATE_PROPOSED_MAPPING_PAIR", id, "Duplicate proposed Attendance_Session_ID + Group_ID mapping.");
      if (sessionId && groupId) proposedPairKeys.add(pair);
    }
  }
  validateEffectiveMappings(context.effectiveMappingById, context.effectiveSessionById, context.liveGroupById, context.candidateSessionIds, context.candidateMappingIds);
}

function validateBatchDateUpdates(candidates, liveBatchById) {
  for (const row of candidates) {
    const id = text(row.Batch_ID);
    const liveRow = liveBatchById.get(id);
    if (!liveRow) {
      addBlock("LIVE_BATCH_NOT_FOUND", id, "Proposed Batch End_Date update target does not exist in live Batches.");
      continue;
    }
    if (normalizeDateValue(liveRow.End_Date) !== normalizeDateValue(row.Old_End_Date)) {
      batchDriftById.set(id, ["End_Date"]);
      addBlock("LIVE_BATCH_DATA_DRIFT", id, "Live Batch End_Date differs from Old_End_Date in the V3 workbook.");
    }
    validateOnlyEndDateChanged(row, liveRow, id, "LIVE_BATCH_FIELD_DRIFT");
  }
}

function validateBatchLevelDateUpdates(candidates, liveBatchLevelById, effectiveBatchById) {
  for (const row of candidates) {
    const id = text(row.Batch_Level_ID);
    const liveRow = liveBatchLevelById.get(id);
    if (!liveRow) {
      addBlock("LIVE_BATCH_LEVEL_NOT_FOUND", id, "Proposed Batch Level End_Date update target does not exist in live Batch_Levels.");
      continue;
    }
    if (normalizeDateValue(liveRow.End_Date) !== normalizeDateValue(row.Old_End_Date)) {
      batchLevelDriftById.set(id, ["End_Date"]);
      addBlock("LIVE_BATCH_LEVEL_DATA_DRIFT", id, "Live Batch Level End_Date differs from Old_End_Date in the V3 workbook.");
    }
    if (text(liveRow.Batch_ID) !== text(row.Batch_ID)) addBlock("BATCH_LEVEL_BATCH_MISMATCH", id, "Batch Level does not belong to the stated Batch_ID.");
    if (!effectiveBatchById.get(text(row.Batch_ID))) addBlock("BATCH_LEVEL_BATCH_NOT_FOUND", id, "Stated Batch_ID does not exist in effective Batches.");
    validateOnlyEndDateChanged(row, liveRow, id, "LIVE_BATCH_LEVEL_FIELD_DRIFT");
  }
}

function validateFinalDateCoverage(sessionCandidates, effectiveBatchById, effectiveBatchLevelById) {
  const latestSessionByBatchLevel = new Map();
  for (const row of sessionCandidates) {
    const id = text(row.Attendance_Session_ID);
    const sessionDate = parseDate(row.Session_Date);
    const batch = effectiveBatchById.get(text(row.Batch_ID));
    const level = effectiveBatchLevelById.get(text(row.Batch_Level_ID));
    if (!sessionDate || !batch || !level) continue;
    const batchEnd = parseDate(batch.End_Date);
    const levelEnd = parseDate(level.End_Date);
    if (batchEnd && sessionDate.day > batchEnd.day) addBlock("SESSION_EXCEEDS_FINAL_BATCH_END", id, "Session_Date is after the effective final Batch End_Date.");
    if (levelEnd && sessionDate.day > levelEnd.day) addBlock("SESSION_EXCEEDS_FINAL_BATCH_LEVEL_END", id, "Session_Date is after the effective final Batch Level End_Date.");
    if (text(level.Batch_ID) !== text(batch.Batch_ID)) addBlock("FINAL_BATCH_LEVEL_BATCH_MISMATCH", id, "Effective Batch Level does not belong to effective Batch.");
    if (code(level.Level_Code) !== code(row.Level_Code)) addBlock("FINAL_LEVEL_CODE_MISMATCH", id, "Effective Batch Level Level_Code does not match session Level_Code.");
    const latest = latestSessionByBatchLevel.get(text(row.Batch_Level_ID));
    if (!latest || sessionDate.day > latest.date.day) latestSessionByBatchLevel.set(text(row.Batch_Level_ID), { date: sessionDate, sessionId: id });
  }

  for (const level of effectiveBatchLevelById.values()) {
    const batch = effectiveBatchById.get(text(level.Batch_ID));
    const batchEnd = parseDate(batch?.End_Date);
    const levelEnd = parseDate(level.End_Date);
    if (batch && batchEnd && levelEnd && batchEnd.day < levelEnd.day) addBlock("FINAL_BATCH_END_BEFORE_BATCH_LEVEL_END", text(level.Batch_Level_ID), "Effective Batch End_Date is earlier than an included Batch Level End_Date.");
  }

  for (const [batchLevelId, latest] of latestSessionByBatchLevel.entries()) {
    const levelEnd = parseDate(effectiveBatchLevelById.get(batchLevelId)?.End_Date);
    if (levelEnd && latest.date.day > levelEnd.day) addBlock("BATCH_LEVEL_DOES_NOT_COVER_LATEST_SESSION", batchLevelId, `Latest proposed session ${latest.sessionId} is after effective Batch Level End_Date.`);
  }
}

function validateOnlyEndDateChanged(proposed, live, id, errorCode) {
  const ignored = new Set(["Migration_Action", "Apply_Eligible", "Changed_Fields", "Old_End_Date", "New_End_Date", "Validation_Status", "Protection_Reasons", "Notes", "_rowNumber", "Batch_Name", "Track_Name", "Level_Name"]);
  for (const [field, value] of Object.entries(proposed)) {
    if (ignored.has(field) || field === "End_Date" || field.startsWith("Old_") || field.startsWith("New_")) continue;
    if (!Object.hasOwn(live, field) || !text(value)) continue;
    if (!fieldValuesMatch(field, live[field], value)) addBlock(errorCode, id, `${field} differs from the current live row.`);
  }
}

function fieldValuesMatch(field, left, right) {
  if (field.endsWith("_Date") || field === "Start_Date" || field === "End_Date") return normalizeDateValue(left) === normalizeDateValue(right);
  if (field === "Session_Number" || field === "Hours" || field === "Credit_Hours") return normalizeSessionNumber(left) === normalizeSessionNumber(right);
  return normalizeCompare(left) === normalizeCompare(right);
}

function validateEffectiveMappings(effectiveMappingById, effectiveSessionById, liveGroupById, candidateSessionIds, candidateMappingIds) {
  const activePairs = new Map();
  for (const row of effectiveMappingById.values()) {
    if (disabled(row)) continue;
    const id = text(row[mappingIdHeader(Object.keys(row))]) || text(row.Session_Group_Map_ID) || `${text(row.Attendance_Session_ID)}:${text(row.Group_ID)}`;
    const sessionId = text(row.Attendance_Session_ID);
    const groupId = text(row.Group_ID);
    const relatedToMigration = candidateMappingIds.has(id) || candidateSessionIds.has(sessionId);
    if (!relatedToMigration) continue;
    const session = effectiveSessionById.get(sessionId);
    const group = liveGroupById.get(groupId);
    if (!session || !group) continue;
    const pair = `${sessionId}\u0001${groupId}`;
    const existingPair = activePairs.get(pair);
    if (existingPair) addBlock("DUPLICATE_EFFECTIVE_MAPPING_PAIR", id, `Effective active mapping duplicates ${existingPair}.`);
    activePairs.set(pair, id);
    if (text(group.Batch_ID) !== text(session.Batch_ID)) addBlock("MAPPING_BATCH_MISMATCH", id, "Group Batch_ID does not match parent session Batch_ID.");
    if (!groupLevelCompatible(group, session)) addBlock("MAPPING_LEVEL_INCOMPATIBLE", id, "Group level selection is not compatible with parent session Level_Code.");
    validateActiveMappingSnapshot(row, session, id);
    const parentTitle = `${text(session.Track_Name)} ${text(session.Session_Title)} ${text(session.Batch_ID)}`.toLowerCase();
    const isOnlineSharedTrack = parentTitle.includes("bug") || parentTitle.includes("angular");
    if (isOnlineSharedTrack && code(row.Session_Delivery_Mode || session.Delivery_Mode) !== "ONLINE") addBlock("ONLINE_MAPPING_EXPECTED", id, "Bug/Angular mapping Session_Delivery_Mode must be ONLINE.");
    if (isOnlineSharedTrack && code(row.Group_Attendance_Mode) && code(row.Group_Attendance_Mode) !== "ONLINE") addBlock("ONLINE_GROUP_MODE_EXPECTED", id, "Bug/Angular mapping Group_Attendance_Mode must be ONLINE.");
  }
}

function validateActiveMappingSnapshot(row, session, id) {
  if (!session) return;
  const checks = [
    ["Session_Number", "MAPPING_SESSION_NUMBER_MISMATCH"],
    ["Batch_ID", "MAPPING_BATCH_ID_MISMATCH"],
    ["Level_Code", "MAPPING_LEVEL_CODE_MISMATCH"],
  ];
  for (const [field, errorCode] of checks) {
    if (!text(row[field])) continue;
    const matches = field === "Session_Number" ? normalizeSessionNumber(row[field]) === normalizeSessionNumber(session[field]) : code(row[field]) === code(session[field]);
    if (!matches) addBlock(errorCode === "MAPPING_CODE_MISMATCH" ? "MAPPING_CODE_MISMATCH" : errorCode, id, `Active mapping ${field} does not match parent session.`);
  }
}

function validateProtection(candidates, live) {
  const validatedSessions = new Set(live.Attendance_Validated.rows.map(row => text(row.Attendance_Session_ID)).filter(Boolean));
  const rawSessions = new Set(live.Attendance_Form_Responses.rows.map(row => text(row.Attendance_Session_ID)).filter(Boolean));
  const rawCodes = new Set(live.Attendance_Form_Responses.rows.map(row => text(row.Attendance_Code)).filter(Boolean));
  const publishedRecordings = new Set(live.Recorded_Sessions.rows.filter(row => activePublished(row)).map(row => text(row.Attendance_Session_ID)).filter(Boolean));
  const publishedMaterials = new Set(live.Session_Materials.rows.filter(row => activePublished(row)).map(row => text(row.Attendance_Session_ID)).filter(Boolean));
  const now = new Date();
  for (const row of candidates) {
    const id = text(row.Attendance_Session_ID);
    const end = sessionEndDate(row);
    const hasValidated = validatedSessions.has(id);
    if (end && end < now) addBlock("PAST_SESSION_PROTECTED", id, "Session end date/time has passed.");
    if (hasValidated) addBlock(APPROVED_RAW_ONLY_EXCEPTIONS.has(id) ? "APPROVED_EXCEPTION_HAS_VALIDATED_ROWS" : "VALIDATED_ATTENDANCE_PROTECTED", id, "Session has Attendance_Validated rows.");
    if (publishedRecordings.has(id)) addBlock("PUBLISHED_RECORDING_PROTECTED", id, "Session has published recordings.");
    if (publishedMaterials.has(id)) addBlock("PUBLISHED_MATERIAL_PROTECTED", id, "Session has published materials.");
    if (!APPROVED_RAW_RESPONSE_EXCEPTIONS.has(id) && (rawSessions.has(id) || rawCodes.has(text(row.Attendance_Code)))) addBlock("RAW_RESPONSES_PROTECTED", id, "Session has raw form responses.");
  }
}

function validateAttendanceCodes(effectiveSessionById, effectiveMappingById, candidateSessionIds, candidateMappingIds) {
  const invalidCodes = new Set();
  const duplicateCodes = new Set();
  const mismatches = new Set();
  const codeToSessionIds = new Map();
  for (const row of effectiveSessionById.values()) {
    const id = text(row.Attendance_Session_ID);
    const value = text(row.Attendance_Code);
    if (!value) continue;
    if (candidateSessionIds.has(id) && !/^[1-9][0-9]{5}$/.test(value)) {
      invalidCodes.add(id);
      addBlock("INVALID_ATTENDANCE_CODE", id, "Attendance_Code is not six numeric digits without leading zero.");
      continue;
    }
    if (/^[1-9][0-9]{5}$/.test(value)) codeToSessionIds.set(value, [...(codeToSessionIds.get(value) ?? []), id]);
  }
  for (const [value, ids] of codeToSessionIds.entries()) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length > 1 && uniqueIds.some(id => candidateSessionIds.has(id))) {
      duplicateCodes.add(value);
      addBlock("ATTENDANCE_CODE_DUPLICATE", value, "Attendance code is duplicated in the effective final session state.");
    }
  }
  for (const row of effectiveMappingById.values()) {
    if (disabled(row) || !text(row.Attendance_Code)) continue;
    const id = text(row[mappingIdHeader(Object.keys(row))]) || text(row.Attendance_Session_ID);
    const sessionId = text(row.Attendance_Session_ID);
    if (!candidateMappingIds.has(id) && !candidateSessionIds.has(sessionId)) continue;
    const expected = text(effectiveSessionById.get(text(row.Attendance_Session_ID))?.Attendance_Code);
    if (expected && text(row.Attendance_Code) !== expected) {
      mismatches.add(id);
      addBlock("MAPPING_CODE_MISMATCH", id, "Active mapping Attendance_Code differs from parent session Attendance_Code.");
    }
  }
  return { validNumericCodes: candidateSessionIds.size - invalidCodes.size, invalidCodes: invalidCodes.size, duplicateCodes: duplicateCodes.size, sessionMapCodeMismatches: mismatches.size };
}

function detectSessionDrift(proposed, live, snapshot, diff) {
  const id = text(proposed.Attendance_Session_ID);
  const source = snapshot ?? diff;
  if (!source) {
    addWarn("SNAPSHOT_MISSING", id, "No snapshot row found for drift comparison.");
    return;
  }
  const changedFields = [];
  for (const field of SESSION_FIELDS) {
    const oldValue = oldFieldValue(source, field);
    if (oldValue === null) continue;
    if (normalizeFieldForCompare(field, live[field]) !== normalizeFieldForCompare(field, oldValue)) changedFields.push(field);
  }
  if (changedFields.length) {
    driftFieldsBySession.set(id, changedFields);
    addBlock("LIVE_DATA_DRIFT", id, `Changed fields: ${changedFields.join(", ")}`);
  }
}

async function readLiveSheets() {
  nextEnv.loadEnvConfig(process.cwd());
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const encoded = requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({ credentials, scopes: [GOOGLE_READONLY_SCOPE] });
  const sheets = google.sheets({ version: "v4", auth });
  const entries = [];
  for (const sheet of LIVE_SHEETS) {
    const response = await readSheetValuesWithRetry(sheets, spreadsheetId, sheet);
    readsPerformed.push(sheet);
    entries.push([sheet, rowsFromValues(response.data.values ?? [])]);
  }
  return Object.fromEntries(entries);
}

async function readSheetValuesWithRetry(sheets, spreadsheetId, sheet) {
  let lastError;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      return await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheet}'!A:ZZ`, valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
    } catch (error) {
      lastError = error;
      if (!isTransientGoogleReadError(error) || attempt === 2) break;
      await delay(500 + Math.floor(Math.random() * 700) + attempt * 500);
    }
  }
  throw lastError;
}

function isTransientGoogleReadError(error) {
  const status = Number(error?.code ?? error?.response?.status);
  const message = String(error?.message ?? "").toLowerCase();
  return [408, 429, 500, 502, 503, 504].includes(status) || message.includes("timeout") || message.includes("quota") || message.includes("exhausted") || message.includes("network");
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rowsFromValues(values) {
  const headers = (values[0] ?? []).map(String);
  const rows = values.slice(1).map((cells, index) => {
    const row = { _rowNumber: index + 2 };
    headers.forEach((header, column) => { row[header] = String(cells[column] ?? ""); });
    return row;
  }).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && value !== ""));
  return { headers, rows };
}

function readXlsxWorkbook(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Attached workbook could not be read: ${filePath}`);
  const zip = readZipEntries(fs.readFileSync(filePath));
  const sharedStrings = parseSharedStrings(readZipText(zip, "xl/sharedStrings.xml", false));
  const workbookXml = readZipText(zip, "xl/workbook.xml", true);
  const relsXml = readZipText(zip, "xl/_rels/workbook.xml.rels", true);
  const rels = parseRelationships(relsXml);
  const sheets = {};
  const rawSheets = {};
  for (const sheet of parseWorkbookSheets(workbookXml)) {
    const target = rels.get(sheet.rId);
    if (!target) continue;
    const sheetPath = `xl/${target.replace(/^\/?xl\//, "")}`;
    const sheetXml = readZipText(zip, sheetPath, true);
    rawSheets[sheet.name] = sheetXml;
    sheets[sheet.name] = parseSheet(sheetXml, sharedStrings);
  }
  const readyStatusFound = workbookContains(sheets.README, "READY FOR CODEX DRY RUN") || text(rawSheets.README).toUpperCase().includes("READY FOR CODEX DRY RUN");
  const criticalValidationCount = countCriticalValidations(sheets.Validation);
  return { sheets, readyStatusFound, criticalValidationCount };
}

function readZipEntries(buffer) {
  const eocdOffset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocdOffset < 0) throw new Error("Workbook is not a readable XLSX zip.");
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
    if (data.length !== uncompressedSize && uncompressedSize !== 0) throw new Error(`XLSX entry size mismatch: ${name}`);
    entries.set(name, data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipText(entries, name, required) {
  const value = entries.get(name);
  if (!value) {
    if (required) throw new Error(`Workbook entry missing: ${name}`);
    return "";
  }
  return value.toString("utf8");
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<(?:\w+:)?si\b[\s\S]*?<\/(?:\w+:)?si>/g)].map(match => decodeXml([...match[0].matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(item => item[1]).join("")));
}

function parseRelationships(xml) {
  const rels = new Map();
  for (const match of xml.matchAll(/<Relationship\b([^>]+?)\s*\/>/g)) rels.set(attr(match[1], "Id"), attr(match[1], "Target"));
  return rels;
}

function parseWorkbookSheets(xml) {
  return [...xml.matchAll(/<(?:\w+:)?sheet\b([^>]+?)\s*\/>/g)].map(match => ({ name: decodeXml(attr(match[1], "name")), rId: attr(match[1], "r:id") }));
}

function parseSheet(xml, sharedStrings) {
  const rows = [];
  const rawRows = [...xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)];
  for (const rowMatch of rawRows) {
    const cells = {};
    for (const cellMatch of rowMatch[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attrs = cellMatch[1];
      const ref = attr(attrs, "r");
      const type = attr(attrs, "t");
      if (!ref) continue;
      const column = ref.replace(/[0-9]/g, "");
      const body = cellMatch[2] ?? "";
      let value = "";
      const inline = /<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/.exec(body);
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body);
      if (type === "s" && v) value = sharedStrings[Number(v[1])] ?? "";
      else if (inline) value = decodeXml(inline[1]);
      else if (type === "b" && v) value = v[1] === "1" ? "TRUE" : "FALSE";
      else if (v) value = decodeXml(v[1]);
      cells[column] = value;
    }
    rows.push(cells);
  }
  const headerCells = rows[0] ?? {};
  const headerByColumn = new Map();
  for (const column of Object.keys(headerCells).sort(columnSort)) {
    const header = text(headerCells[column]);
    if (header) headerByColumn.set(column, header);
  }
  const headers = [...headerByColumn.values()];
  const dataRows = rows.slice(1).map(cells => {
    const row = {};
    for (const [column, header] of headerByColumn.entries()) row[header] = cells[column] ?? "";
    return row;
  }).filter(row => Object.values(row).some(value => text(value)));
  return { headers, rows: dataRows };
}

function buildReport(result) {
  const blockLines = result.blocking.length ? result.blocking.map(item => `- ${item.code} | ${item.id} | ${item.reason}`).join("\n") : "- None";
  const warningLines = result.warnings.length ? result.warnings.map(item => `- ${item.code} | ${item.id} | ${item.reason}`).join("\n") : "- None";
  const driftLines = Object.entries(result.driftFieldsBySession ?? {}).length ? Object.entries(result.driftFieldsBySession).map(([id, fields]) => `- ${id}: ${fields.join(", ")}`).join("\n") : "- None";
  const batchDriftLines = Object.entries(result.batchDriftById ?? {}).length ? Object.entries(result.batchDriftById).map(([id, fields]) => `- ${id}: ${fields.join(", ")}`).join("\n") : "- None";
  const batchLevelDriftLines = Object.entries(result.batchLevelDriftById ?? {}).length ? Object.entries(result.batchLevelDriftById).map(([id, fields]) => `- ${id}: ${fields.join(", ")}`).join("\n") : "- None";
  const protectionBlockers = result.blocking.filter(item => item.code.includes("PROTECTED") || item.code === "PAST_SESSION_PROTECTED" || item.code === "APPROVED_EXCEPTION_HAS_VALIDATED_ROWS");
  const protectionLines = protectionBlockers.length ? protectionBlockers.map(item => `- ${item.code} | ${item.id} | ${item.reason}`).join("\n") : "- None";
  return `# Attendance Schedule Migration Dry Run Report

## Dry Run Summary
- Result: ${result.finalResult}
- V2 workbook parser status: ${result.workbookParserStatus ?? "-"}
- V3 workbook parser status: ${result.dateWorkbookParserStatus ?? "-"}
- Writes performed: ${result.writesPerformed}

## Attached Workbook Verification
- V2 workbook readable: ${result.workbookRead ? "Yes" : "No"}
- V2 README status ready: ${result.workbookDiagnostics.readyStatusFound ? "Yes" : "No"}
- V2 required sheets found: ${result.workbookDiagnostics.requiredSheetsFound ? "Yes" : "No"}
- V2 critical blocking validations: ${result.workbookDiagnostics.criticalValidationCount}
- V3 workbook readable: ${result.dateWorkbookRead ? "Yes" : "No"}
- V3 README status ready: ${result.dateWorkbookDiagnostics.readyStatusFound ? "Yes" : "No"}
- V3 required sheets found: ${result.dateWorkbookDiagnostics.requiredSheetsFound ? "Yes" : "No"}

## Live Google Sheets Read Verification
- Google Sheets access: ${result.googleReadOnly ? "READ-ONLY" : "Unavailable"}
- Google Sheets OAuth scope: ${result.googleScope ?? "-"}
- Sheets read: ${result.readsPerformed.join(", ") || "None"}
- Writes performed: ${result.writesPerformed}

## Session Create Summary
- Proposed creates: ${result.sessionCreates}

## Session Update Summary
- Proposed updates: ${result.sessionUpdates}
- Live data drift: ${result.liveDataDriftCount}

## Protected Sessions
- Protected or unchanged workbook rows: ${result.protectedUnchanged ?? 0}

## Session Group Mapping Summary
- Proposed creates: ${result.mappingCreates}
- Proposed updates: ${result.mappingUpdates}
- Proposed disables: ${result.mappingDisables}

## Batch Date Extension Summary
- Batch updates: ${result.batchUpdates ?? 0}
- Batch Level updates: ${result.batchLevelUpdates ?? 0}

## Attendance Code Validation
- Valid numeric codes: ${result.codeSummary.validNumericCodes ?? 0}
- Invalid codes: ${result.codeSummary.invalidCodes ?? 0}
- Unique duplicate codes: ${result.codeSummary.duplicateCodes ?? 0}
- Effective mapping code mismatches: ${result.codeSummary.sessionMapCodeMismatches ?? 0}

## Live Data Drift
- Session live-data drift: ${result.liveDataDriftCount}
- Mapping live-data drift: ${result.mappingLiveDriftCount ?? 0}
- Batch live-data drift: ${result.batchLiveDriftCount ?? 0}
- Batch Level live-data drift: ${result.batchLevelLiveDriftCount ?? 0}
- Total drift field count: ${result.liveDataDriftFieldCount ?? 0}

## Drift Fields by Session ID
${driftLines}

## Batch Drift
${batchDriftLines}

## Batch Level Drift
${batchLevelDriftLines}

## Protection Blockers
${protectionLines}

## Final Date Coverage
- Sessions exceeding final Batch dates: ${result.sessionsExceedingFinalBatchDates ?? 0}
- Sessions exceeding final Batch Level dates: ${result.sessionsExceedingFinalBatchLevelDates ?? 0}

## Blocking Issues
${blockLines}

## Non-Blocking Warnings
${warningLines}

## Ready/Blocked Decision
${result.finalResult}

## Confirmation That No Writes Were Performed
No Google Sheets rows, cells, headers, formatting, or protected data were written, appended, updated, deleted, sorted, moved, renamed, or cleared by this dry run.
`;
}

function printSummary(result) {
  console.log(`Attendance Schedule Migration Dry Run

Workbook status: ${result.workbookStatus}
Google Sheets access: ${result.googleReadOnly ? "READ-ONLY" : "UNAVAILABLE"}
Writes performed: ${result.writesPerformed}

Sessions:
- Current live sessions: ${result.sessionSummary.liveSessions ?? 0}
- Proposed creates: ${result.sessionCreates}
- Proposed updates: ${result.sessionUpdates}
- Protected/unchanged: ${result.protectedUnchanged ?? 0}
- Live data drift: ${result.liveDataDriftCount}
- Blocking conflicts: ${result.blockingIssueCount}

Session group mappings:
- Current live mappings: ${result.mappingSummary.liveMappings ?? 0}
- Proposed creates: ${result.mappingCreates}
- Proposed updates: ${result.mappingUpdates}
- Proposed disables: ${result.mappingDisables}

Batch date extensions:
- Batch updates: ${result.batchUpdates ?? 0}
- Batch Level updates: ${result.batchLevelUpdates ?? 0}

Attendance codes:
- Valid numeric codes: ${result.codeSummary.validNumericCodes ?? 0}
- Invalid codes: ${result.codeSummary.invalidCodes ?? 0}
- Duplicate codes: ${result.codeSummary.duplicateCodes ?? 0}
- Session/map code mismatches: ${result.codeSummary.sessionMapCodeMismatches ?? 0}

Result:
- ${result.finalResult}`);
  for (const item of result.blocking.slice(0, 30)) console.log(`${item.code} | ${item.id} | ${item.reason}`);
}

function requireHeaders(sheet, required, name) {
  if (!sheet) return;
  for (const header of required) if (!sheet.headers.includes(header)) addBlock("WORKBOOK_HEADER_MISSING", name, `Missing required header: ${header}`);
}

function buildEffectiveSessionState(liveRows, sessionCandidates) {
  const effective = new Map();
  for (const row of liveRows) {
    const id = text(row.Attendance_Session_ID);
    if (id) effective.set(id, { ...row });
  }
  for (const row of sessionCandidates) {
    const id = text(row.Attendance_Session_ID);
    if (!id) continue;
    const action = code(row.Migration_Action);
    if (action === "UPDATE") effective.set(id, mergeRows(effective.get(id), row));
    if (action === "CREATE") effective.set(id, { ...row });
  }
  return effective;
}

function buildEffectiveMappingState(liveRows, mappingCandidates, liveHeaders, proposedHeaders) {
  const effective = new Map();
  const liveMapHeader = mappingIdHeader(liveHeaders);
  const proposedMapHeader = mappingIdHeader(proposedHeaders);
  for (const row of liveRows) {
    const id = text(row[liveMapHeader]);
    if (id) effective.set(id, { ...row, [proposedMapHeader]: id });
  }
  for (const row of mappingCandidates) {
    const id = text(row[proposedMapHeader]);
    if (!id) continue;
    const action = code(row.Migration_Action);
    if (action === "CREATE") effective.set(id, { ...row });
    if (action === "UPDATE") effective.set(id, mergeRows(effective.get(id), row));
    if (action === "DISABLE") effective.set(id, { ...mergeRows(effective.get(id), row), Access_Status: "Disabled" });
  }
  return effective;
}

function buildEffectiveBatchState(liveRows, batchCandidates) {
  const effective = new Map();
  for (const row of liveRows) {
    const id = text(row.Batch_ID);
    if (id) effective.set(id, { ...row });
  }
  for (const row of batchCandidates) {
    const id = text(row.Batch_ID);
    if (!id) continue;
    effective.set(id, { ...(effective.get(id) ?? {}), End_Date: row.New_End_Date });
  }
  return effective;
}

function buildEffectiveBatchLevelState(liveRows, batchLevelCandidates) {
  const effective = new Map();
  for (const row of liveRows) {
    const id = text(row.Batch_Level_ID);
    if (id) effective.set(id, { ...row });
  }
  for (const row of batchLevelCandidates) {
    const id = text(row.Batch_Level_ID);
    if (!id) continue;
    effective.set(id, { ...(effective.get(id) ?? {}), End_Date: row.New_End_Date });
  }
  return effective;
}

function mergeRows(base, patch) {
  const result = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(patch ?? {})) result[key] = value;
  return result;
}

function findLiveActivePair(rows, sessionId, groupId) {
  return rows.some(row => !disabled(row) && text(row.Attendance_Session_ID) === sessionId && text(row.Group_ID) === groupId);
}

function mapUnique(rows, field, errorCode) {
  const map = new Map();
  const seen = new Set();
  for (const row of rows) {
    const id = text(row[field]);
    if (!id) continue;
    if (seen.has(id)) addBlock(errorCode, id, `Duplicate key in ${field}.`);
    seen.add(id);
    map.set(id, row);
  }
  return map;
}

function oldFieldValue(row, field) {
  for (const key of [`Old_${field}`, `Current_${field}`, `Existing_${field}`, field]) if (Object.hasOwn(row, key) && text(row[key])) return row[key];
  return null;
}

function sessionDuplicateKey(row) {
  return [text(row.Batch_ID), text(row.Session_Number), code(row.Level_Code), normalizeDateValue(row.Session_Date), normalizeTimeValue(row.Start_Time), code(row.Delivery_Mode)].join("\u0001");
}

function groupLevelCompatible(group, session) {
  const selection = code(group.Level_Selection);
  const level = code(session.Level_Code);
  return selection === "BOTH_LEVELS" || selection === level;
}

function disabled(row) {
  return ["DISABLED", "INACTIVE", "FALSE", "NO"].includes(code(row.Access_Status || row.Is_Active || row.Status));
}

function activePublished(row) {
  return ["PUBLISHED"].includes(code(row.Publish_Status)) && !["FALSE", "NO", "INACTIVE"].includes(code(row.Is_Active));
}

function sessionEndDate(row) {
  const date = parseDate(text(row.Session_Date));
  const end = minutes(text(row.End_Time));
  if (!date || end === null) return null;
  return new Date(Date.UTC(date.year, date.month - 1, date.dayOfMonth, Math.floor(end / 60), end % 60));
}

function dateTimeMatches(value, isoDate, time) {
  const parsedDate = parseDate(value);
  const parsedTime = normalizeTimeValue(value);
  if (parsedDate) return parsedDate.iso === isoDate && parsedTime === normalizeTimeValue(time);
  const normalized = text(value).replace("T", " ");
  return normalized.includes(isoDate) && parsedTime === normalizeTimeValue(time);
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index++) {
    if (values[index] === "--file") result.file = values[++index];
    else if (values[index] === "--date-file") result.dateFile = values[++index];
  }
  return result;
}

function addBlock(codeValue, id, reason) {
  const item = { code: codeValue, id: text(id) || "-", reason };
  const key = `BLOCK|${item.code}|${item.id}|${item.reason}`;
  if (findingKeys.has(key)) return;
  findingKeys.add(key);
  blocking.push(item);
}
function addWarn(codeValue, id, reason) {
  const item = { code: codeValue, id: text(id) || "-", reason };
  const key = `WARN|${item.code}|${item.id}|${item.reason}`;
  if (warningKeys.has(key)) return;
  warningKeys.add(key);
  warnings.push(item);
}
function text(value) { return String(value ?? "").trim(); }
function code(value) { return text(value).toUpperCase().replace(/[\s-]+/g, "_"); }
function bool(value) { return ["TRUE", "YES", "1", "Y"].includes(code(value)); }
function numeric(value) { const parsed = Number(text(value)); return Number.isFinite(parsed) ? parsed : null; }
function normalizeCompare(value) { return text(value).replace(/\s+/g, " ").toUpperCase(); }
function normalizeTextValue(value) { return text(value).replace(/\s+/g, " "); }
function normalizeSessionNumber(value) { const parsed = Number(text(value)); return Number.isFinite(parsed) ? String(Math.trunc(parsed)) : text(value); }
function normalizeFieldForCompare(field, value) {
  if (field === "Session_Number") return normalizeSessionNumber(value);
  if (field === "Session_Date") return normalizeDateValue(value);
  if (field === "Start_Time" || field === "End_Time") return normalizeTimeValue(value);
  if (field === "Delivery_Mode" || field === "Session_Status") return code(value);
  if (field === "Location") return normalizeCompare(value);
  return normalizeTextValue(value);
}
function normalizeDay(value) { return text(value).slice(0, 3).toLowerCase(); }
function dayName(date) { return new Date(Date.UTC(date.year, date.month - 1, date.dayOfMonth)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }); }
function workbookContains(sheet, phrase) { return Boolean(sheet && [...sheet.headers, ...sheet.rows.flatMap(row => Object.values(row))].map(value => text(value).toUpperCase()).join(" ").includes(phrase)); }
function countCriticalValidations(sheet) { return sheet?.rows.filter(row => Object.values(row).some(value => code(value) === "CRITICAL")).length ?? 0; }
function mappingIdHeader(headers) { return headers.includes("Session_Group_Map_ID") ? "Session_Group_Map_ID" : headers.includes("Attendance_Session_Group_ID") ? "Attendance_Session_Group_ID" : headers.includes("Attendance_Session_Group_Map_ID") ? "Attendance_Session_Group_Map_ID" : "Session_Group_Map_ID"; }
function requiredEnv(name) { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured`); return value; }
function attr(source, name) { return new RegExp(`${name}="([^"]*)"`).exec(source)?.[1] ?? ""; }
function decodeXml(value) { return text(value).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }
function columnSort(left, right) { return columnIndex(left) - columnIndex(right); }
function columnIndex(name) { return [...name].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0); }
function columnName(count) { let value = count; let result = ""; while (value > 0) { value--; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); } return result; }

function parseDate(value) {
  const raw = text(value);
  if (!raw) return null;
  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) return dateFromSerial(serial);
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (isoMatch) return dateObject(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  const slashMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(raw);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    return dateObject(Number(slashMatch[3]), first > 12 ? second : first, first > 12 ? first : second);
  }
  {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return dateObject(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
  }
}

function dateFromSerial(serial) {
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.floor(serial) * 86400000);
  return dateObject(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function dateObject(year, month, dayOfMonth) {
  const date = new Date(Date.UTC(year, month - 1, dayOfMonth));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== dayOfMonth) return null;
  return { year, month, dayOfMonth, iso: `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`, day: Math.floor(date.getTime() / 86400000) };
}

function normalizeDateValue(value) { return parseDate(value)?.iso ?? text(value); }

function minutes(value) {
  const raw = text(value);
  if (!raw) return null;
  const numericTime = Number(raw);
  if (Number.isFinite(numericTime) && numericTime >= 0 && numericTime < 1) return Math.round(numericTime * 24 * 60);
  if (Number.isFinite(numericTime) && numericTime >= 1) return Math.round((numericTime - Math.floor(numericTime)) * 24 * 60);
  const match = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(raw);
  if (!match) return null;
  let hours = Number(match[1]);
  const mins = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return hours >= 0 && hours < 24 && mins >= 0 && mins < 60 ? hours * 60 + mins : null;
}

function normalizeTimeValue(value) {
  const valueMinutes = minutes(value);
  return valueMinutes === null ? text(value) : `${String(Math.floor(valueMinutes / 60)).padStart(2, "0")}:${String(valueMinutes % 60).padStart(2, "0")}`;
}
