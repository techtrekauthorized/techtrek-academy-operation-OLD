import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import nextEnv from "@next/env";
import { google } from "googleapis";

nextEnv.loadEnvConfig(process.cwd());

const GOOGLE_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const REPORT_PATH = path.resolve(process.cwd(), "ATTENDANCE_FORM_BACKFILL_DRY_RUN_REPORT.md");
const REQUIRED_SHEETS = ["Processed Data", "Session Summary", "Needs Review"];
const REQUIRED_PROCESSED_HEADERS = [
  "Timestamp",
  "Original Code",
  "Canonical Code",
  "Session Group",
  "Match Confidence",
  "Timing Status",
  "University Student ID",
  "Student Name",
  "Phone",
  "Attendance Status",
  "Matching / Timing Note",
  "Original Row",
];
const LIVE_SHEETS = ["Students", "Enrollments", "Groups", "Attendance_Sessions", "Attendance_Session_Groups", "Attendance_Validated", "Attendance_Form_Responses"];
const EXPECTED = { processedRows: 2384, uniquePairs: 2321, duplicateSubmissions: 61, needsReviewRows: 2 };

const args = parseArgs(process.argv.slice(2));
const workbookPath = args.file ? path.resolve(args.file) : "";

const result = {
  workbookRead: false,
  requiredSheetsFound: false,
  processedRows: 0,
  uniqueRawPairs: 0,
  duplicateFormSubmissionsRemoved: 0,
  lateOutsideAccepted: 0,
  needsReviewSessionGroupRows: 0,
  exactSessionMatches: 0,
  sessionReviewRequired: 0,
  exactStudentIdMatches: 0,
  safeFallbackMatches: 0,
  studentReviewRequired: 0,
  identityConflicts: 0,
  eligibleMappedCandidates: 0,
  noEligibleMapping: 0,
  multipleEligibleEnrollments: 0,
  createValidated: 0,
  updateExisting: 0,
  alreadyPresent: 0,
  duplicateValidatedReview: 0,
  sourceRowUnresolved: 0,
  finalUniquePresentCandidates: 0,
  googleScope: GOOGLE_READONLY_SCOPE,
  googleSheetsWritesPerformed: 0,
  sheetsRead: [],
  diagnostics: {},
  sessionBreakdown: new Map(),
  blocking: [],
  finalResult: "BLOCKED",
  remainingIssue: "Not run.",
};

try {
  if (!workbookPath) block("WORKBOOK_FILE_REQUIRED", "Workbook path is required.");
  const workbook = readXlsxWorkbook(workbookPath);
  result.workbookRead = true;
  validateWorkbook(workbook);
  const processed = workbook.sheets["Processed Data"].rows;
  validateWorkbookSanity(processed);
  const live = await readLiveSheets();
  const plan = buildPlan(processed, live);
  Object.assign(result, plan.counts);
  result.sessionBreakdown = plan.sessionBreakdown;
  result.diagnostics = plan.diagnostics;
  result.finalResult = result.blocking.length ? "BLOCKED" : "READY FOR APPLY REVIEW";
  result.remainingIssue = result.blocking.length ? "Structural validation failed." : "None";
} catch (error) {
  if (!result.blocking.length) block(error?.code || "DRY_RUN_FAILED", error?.message || String(error));
  result.finalResult = "BLOCKED";
  result.remainingIssue = result.blocking.map(item => item.reason).join("; ") || "Dry run failed.";
} finally {
  fs.writeFileSync(REPORT_PATH, buildReport(result), "utf8");
  printSummary(result);
  process.exitCode = result.finalResult === "READY FOR APPLY REVIEW" ? 0 : 1;
}

function validateWorkbook(workbook) {
  const missingSheets = REQUIRED_SHEETS.filter(sheet => !workbook.sheets[sheet]);
  if (missingSheets.length) block("WORKBOOK_REQUIRED_SHEET_MISSING", `Missing workbook sheets: ${missingSheets.join(", ")}`);
  result.requiredSheetsFound = true;
  const processed = workbook.sheets["Processed Data"];
  const duplicatedHeaders = duplicates(processed.headers);
  if (duplicatedHeaders.length) block("WORKBOOK_DUPLICATED_HEADER", `Processed Data duplicated headers: ${duplicatedHeaders.join(", ")}`);
  const missingHeaders = REQUIRED_PROCESSED_HEADERS.filter(header => !processed.headers.includes(header));
  if (missingHeaders.length) block("WORKBOOK_REQUIRED_HEADER_MISSING", `Processed Data missing headers: ${missingHeaders.join(", ")}`);
}

function validateWorkbookSanity(rows) {
  result.processedRows = rows.length;
  result.needsReviewSessionGroupRows = rows.filter(row => normalizeSessionGroup(row["Session Group"]) === "NEEDS REVIEW").length;
  const resolvedRows = rows.filter(row => normalizeSessionGroup(row["Session Group"]) !== "NEEDS REVIEW");
  const uniquePairs = new Set(resolvedRows.map(row => rawPairKey(row)).filter(Boolean));
  result.uniqueRawPairs = uniquePairs.size;
  result.duplicateFormSubmissionsRemoved = resolvedRows.length - uniquePairs.size;
  if (result.processedRows !== EXPECTED.processedRows || result.uniqueRawPairs !== EXPECTED.uniquePairs || result.duplicateFormSubmissionsRemoved !== EXPECTED.duplicateSubmissions || result.needsReviewSessionGroupRows !== EXPECTED.needsReviewRows) {
    block("WORKBOOK_PARSE_COUNT_MISMATCH", `Parsed processed=${result.processedRows}, uniquePairs=${result.uniqueRawPairs}, duplicates=${result.duplicateFormSubmissionsRemoved}, needsReview=${result.needsReviewSessionGroupRows}`);
  }
}

async function readLiveSheets() {
  const spreadsheetId = requiredEnv("GOOGLE_SHEET_ID");
  const encoded = requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({ credentials, scopes: [GOOGLE_READONLY_SCOPE] });
  const sheets = google.sheets({ version: "v4", auth });
  const entries = [];
  for (const sheet of LIVE_SHEETS) {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheet}'!A:ZZ`,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "SERIAL_NUMBER",
    });
    result.sheetsRead.push(sheet);
    entries.push([sheet, rowsFromValues(response.data.values ?? [])]);
  }
  return Object.fromEntries(entries);
}

function buildPlan(rows, live) {
  const counts = {
    lateOutsideAccepted: 0,
    exactSessionMatches: 0,
    sessionReviewRequired: 0,
    exactStudentIdMatches: 0,
    safeFallbackMatches: 0,
    studentReviewRequired: 0,
    identityConflicts: 0,
    eligibleMappedCandidates: 0,
    noEligibleMapping: 0,
    multipleEligibleEnrollments: 0,
    createValidated: 0,
    updateExisting: 0,
    alreadyPresent: 0,
    duplicateValidatedReview: 0,
    sourceRowUnresolved: 0,
    finalUniquePresentCandidates: 0,
  };
  const diagnostics = createDiagnostics();
  const sessionBreakdown = new Map();
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
  const sessionsByCodeDate = groupBy(sessions, row => `${normalizeCode(row.Attendance_Code)}::${normalizeDate(row.Session_Date)}`);
  const groupsById = new Map(groups.map(row => [text(row.Group_ID), row]));
  const activeMappings = new Set(mappings.filter(isMappingActive).map(row => `${text(row.Attendance_Session_ID)}::${text(row.Group_ID)}`));
  const validatedByPair = groupBy(validated.filter(row => text(row.Attendance_Session_ID) && text(row.Resolved_Academy_Student_ID)), row => `${text(row.Attendance_Session_ID)}::${text(row.Resolved_Academy_Student_ID)}`);
  const formResponsesBySignature = groupBy(formResponses, row => sourceSignature(row.Timestamp, row.Attendance_Code, row.University_Student_ID, row.Student_Name, row.Phone));
  const seenFinalPairs = new Set();
  const uniqueRows = [];
  const seenRaw = new Set();

  for (const row of rows) {
    const rawKey = rawPairKey(row);
    if (normalizeSessionGroup(row["Session Group"]) === "NEEDS REVIEW" || !rawKey) {
      counts.sessionReviewRequired++;
      addDiagnostic(diagnostics.SESSION_REVIEW_REQUIRED, row, "", "Session Group requires review.");
      continue;
    }
    if (seenRaw.has(rawKey)) continue;
    seenRaw.add(rawKey);
    uniqueRows.push(row);
  }

  for (const row of uniqueRows) {
    if (isLateOrOutside(row)) counts.lateOutsideAccepted++;
    const sessionResolution = resolveSession(row, sessionsByCodeDate);
    if (!sessionResolution.session) {
      counts.sessionReviewRequired++;
      addDiagnostic(diagnostics.SESSION_REVIEW_REQUIRED, row, sessionResolution.sessionGroup, sessionResolution.reason);
      continue;
    }
    const session = sessionResolution.session;
    counts.exactSessionMatches++;
    const studentResolution = resolveStudent(row, studentsByUniversityId, studentsByPhone, studentsByName);
    if (studentResolution.category === "IDENTITY_CONFLICT") {
      counts.identityConflicts++;
      addDiagnostic(diagnostics.IDENTITY_CONFLICT, row, session.Attendance_Session_ID, studentResolution.reason);
      incrementBreakdown(sessionBreakdown, session.Attendance_Session_ID, "reviewRequired");
      continue;
    }
    if (!studentResolution.student) {
      counts.studentReviewRequired++;
      addDiagnostic(diagnostics.STUDENT_REVIEW_REQUIRED, row, session.Attendance_Session_ID, studentResolution.reason);
      incrementBreakdown(sessionBreakdown, session.Attendance_Session_ID, "reviewRequired");
      continue;
    }
    if (studentResolution.category === "EXACT") counts.exactStudentIdMatches++;
    if (studentResolution.category === "FALLBACK") counts.safeFallbackMatches++;
    const eligible = resolveEligibleEnrollment(studentResolution.student, session, enrollments, groupsById, activeMappings);
    if (eligible.category === "NONE") {
      counts.noEligibleMapping++;
      addDiagnostic(diagnostics.NO_ELIGIBLE_SESSION_MAPPING, row, session.Attendance_Session_ID, eligible.reason);
      incrementBreakdown(sessionBreakdown, session.Attendance_Session_ID, "reviewRequired");
      continue;
    }
    if (eligible.category === "MULTIPLE") {
      counts.multipleEligibleEnrollments++;
      addDiagnostic(diagnostics.MULTIPLE_ELIGIBLE_ENROLLMENTS, row, session.Attendance_Session_ID, eligible.reason);
      incrementBreakdown(sessionBreakdown, session.Attendance_Session_ID, "reviewRequired");
      continue;
    }
    const finalKey = `${session.Attendance_Session_ID}::${studentResolution.student.Academy_Student_ID}`;
    if (seenFinalPairs.has(finalKey)) {
      continue;
    }
    seenFinalPairs.add(finalKey);
    counts.eligibleMappedCandidates++;
    const sourceMatches = formResponsesBySignature.get(sourceSignature(row.Timestamp, row["Original Code"], row["University Student ID"], row["Student Name"], row.Phone)) ?? [];
    if (sourceMatches.length !== 1) {
      counts.sourceRowUnresolved++;
      addDiagnostic(diagnostics.SOURCE_ROW_UNRESOLVED, row, session.Attendance_Session_ID, "Live source response row was not uniquely resolved.");
    }
    const existing = validatedByPair.get(finalKey) ?? [];
    incrementBreakdown(sessionBreakdown, session.Attendance_Session_ID, "candidatePresentCount");
    if (existing.length > 1) {
      counts.duplicateValidatedReview++;
      addDiagnostic(diagnostics.DUPLICATE_VALIDATED_REVIEW, row, session.Attendance_Session_ID, "Multiple Attendance_Validated rows exist for this student/session.");
      incrementBreakdown(sessionBreakdown, session.Attendance_Session_ID, "reviewRequired");
      continue;
    }
    if (existing.length === 1) {
      if (isValidPresent(existing[0])) {
        counts.alreadyPresent++;
        counts.finalUniquePresentCandidates++;
        incrementBreakdown(sessionBreakdown, session.Attendance_Session_ID, "alreadyPresent");
      } else {
        counts.updateExisting++;
        counts.finalUniquePresentCandidates++;
        incrementBreakdown(sessionBreakdown, session.Attendance_Session_ID, "update");
      }
    } else {
      counts.createValidated++;
      counts.finalUniquePresentCandidates++;
      incrementBreakdown(sessionBreakdown, session.Attendance_Session_ID, "create");
    }
  }
  return { counts, diagnostics, sessionBreakdown };
}

function resolveSession(row, sessionsByCodeDate) {
  const sessionGroup = normalizeSessionGroup(row["Session Group"]);
  const code = normalizeCode(row["Canonical Code"]);
  if (!sessionGroup || sessionGroup === "NEEDS REVIEW" || !code) return { session: null, sessionGroup, reason: "Missing resolved session group or canonical code." };
  const groupParts = sessionGroup.split("|").map(part => part.trim());
  const groupDate = normalizeDate(groupParts.at(-1) ?? "");
  if (!groupDate) return { session: null, sessionGroup, reason: "Session Group date was not readable." };
  const matches = sessionsByCodeDate.get(`${code}::${groupDate}`) ?? [];
  if (matches.length !== 1) return { session: null, sessionGroup, reason: matches.length ? "Code/date matched multiple live sessions." : "Code/date did not match a live session." };
  return { session: matches[0], sessionGroup, reason: "" };
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
    if (phoneMatches.length === 1 && phoneMatches[0].Academy_Student_ID !== student.Academy_Student_ID) return { category: "IDENTITY_CONFLICT", student: null, reason: "Phone matches a different database student." };
    if (nameMatches.length === 1 && nameMatches[0].Academy_Student_ID !== student.Academy_Student_ID) return { category: "IDENTITY_CONFLICT", student: null, reason: "Name matches a different database student." };
    return { category: "EXACT", student, reason: "" };
  }
  if (exact.length > 1) return { category: "REVIEW", student: null, reason: "University Student ID matches multiple live students." };
  const phoneMatches = phone ? studentsByPhone.get(phone) ?? [] : [];
  const nameMatches = name ? studentsByName.get(name) ?? [] : [];
  if (phoneMatches.length === 1 && nameMatches.length === 1 && phoneMatches[0].Academy_Student_ID === nameMatches[0].Academy_Student_ID) return { category: "FALLBACK", student: phoneMatches[0], reason: "" };
  return { category: "REVIEW", student: null, reason: "Student identity was not uniquely resolved." };
}

function resolveEligibleEnrollment(student, session, enrollments, groupsById, activeMappings) {
  const eligible = enrollments.filter(enrollment => {
    if (text(enrollment.Academy_Student_ID) !== text(student.Academy_Student_ID)) return false;
    if (isExcludedEnrollment(enrollment.Enrollment_Status)) return false;
    const groupId = text(enrollment.Group_ID);
    if (!groupId) return false;
    const group = groupsById.get(groupId);
    if (!group || text(group.Batch_ID) !== text(session.Batch_ID)) return false;
    return activeMappings.has(`${text(session.Attendance_Session_ID)}::${groupId}`);
  });
  if (eligible.length === 1) return { category: "ONE", enrollment: eligible[0], reason: "" };
  if (eligible.length > 1) return { category: "MULTIPLE", enrollment: null, reason: "Multiple active enrollments are mapped to this session." };
  return { category: "NONE", enrollment: null, reason: "No active enrollment has an active group mapping for this session." };
}

function rawPairKey(row) {
  const sessionGroup = normalizeSessionGroup(row["Session Group"]);
  const universityId = normalizeUniversityId(row["University Student ID"]);
  if (!sessionGroup || !universityId || sessionGroup === "NEEDS REVIEW") return "";
  return `${sessionGroup}::${universityId}`;
}

function isLateOrOutside(row) {
  const timing = text(row["Timing Status"]);
  const status = text(row["Attendance Status"]);
  const value = `${timing} ${status}`;
  return /خارج|توقيت|متأخر|late|outside/i.test(value) && !/داخل توقيت السيشن/i.test(timing);
}

function isValidPresent(row) {
  return normalizeCode(row.Attendance_Status) === "PRESENT" && normalizeCode(row.Validation_Status) === "VALID";
}

function isMappingActive(row) {
  const raw = text(row.Is_Active || row.Access_Status || row.Mapping_Status);
  if (!raw) return true;
  return ["TRUE", "ACTIVE", "YES", "1"].includes(raw.toUpperCase());
}

function isExcludedEnrollment(status) {
  return ["CANCELLED", "WITHDRAWN"].includes(normalizeCode(status));
}

function sourceSignature(timestamp, code, studentId, name, phone) {
  return [normalizeTimestamp(timestamp), normalizeCode(code), normalizeUniversityId(studentId), normalizeName(name), normalizePhone(phone)].join("::");
}

function createDiagnostics() {
  return {
    SESSION_REVIEW_REQUIRED: [],
    STUDENT_REVIEW_REQUIRED: [],
    IDENTITY_CONFLICT: [],
    NO_ELIGIBLE_SESSION_MAPPING: [],
    MULTIPLE_ELIGIBLE_ENROLLMENTS: [],
    DUPLICATE_VALIDATED_REVIEW: [],
    SOURCE_ROW_UNRESOLVED: [],
  };
}

function addDiagnostic(list, row, sessionOrGroup, reason) {
  if (list.length >= 10) return;
  list.push({
    originalRow: text(row["Original Row"]) || String(row._rowNumber ?? ""),
    universityStudentId: normalizeUniversityId(row["University Student ID"]) || "-",
    session: sessionOrGroup || normalizeSessionGroup(row["Session Group"]) || "-",
    reason,
  });
}

function incrementBreakdown(map, sessionId, key) {
  const row = map.get(sessionId) ?? { candidatePresentCount: 0, alreadyPresent: 0, create: 0, update: 0, reviewRequired: 0 };
  row[key] += 1;
  map.set(sessionId, row);
}

function readXlsxWorkbook(filePath) {
  if (!fs.existsSync(filePath)) throw Object.assign(new Error(`Attached workbook could not be read: ${filePath}`), { code: "WORKBOOK_NOT_READABLE" });
  const zip = readZipEntries(fs.readFileSync(filePath));
  const sharedStrings = parseSharedStrings(readZipText(zip, "xl/sharedStrings.xml", false));
  const workbookXml = readZipText(zip, "xl/workbook.xml", true);
  const relsXml = readZipText(zip, "xl/_rels/workbook.xml.rels", true);
  const rels = parseRelationships(relsXml);
  const sheets = {};
  for (const sheet of parseWorkbookSheets(workbookXml)) {
    const target = rels.get(sheet.rId);
    if (!target) continue;
    const sheetPath = `xl/${target.replace(/^\/?xl\//, "")}`;
    sheets[sheet.name] = parseSheet(readZipText(zip, sheetPath, true), sharedStrings);
  }
  return { sheets };
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

function parseSheet(xml, sharedStrings) {
  const rawRows = [...xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)];
  const rows = rawRows.map((rowMatch, rowIndex) => {
    const cells = {};
    for (const cellMatch of rowMatch[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attrs = cellMatch[1];
      const ref = attr(attrs, "r");
      if (!ref) continue;
      const column = ref.replace(/[0-9]/g, "");
      cells[column] = parseCellValue(attrs, cellMatch[2] ?? "", sharedStrings);
    }
    cells._rowNumber = rowIndex + 1;
    return cells;
  });
  const headerCells = rows[0] ?? {};
  const headerByColumn = new Map();
  for (const column of Object.keys(headerCells).filter(key => key !== "_rowNumber").sort(columnSort)) {
    const header = text(headerCells[column]);
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
  const duplicatedHeaders = duplicates(headers.filter(Boolean));
  if (duplicatedHeaders.length) block("LIVE_DUPLICATED_HEADER", `Duplicated live sheet headers: ${duplicatedHeaders.join(", ")}`);
  return {
    headers,
    rows: values.slice(1).map((row, index) => {
      const object = { _rowNumber: index + 2 };
      headers.forEach((header, column) => { if (header) object[header] = valueToText(row[column]); });
      return object;
    }).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && text(value))),
  };
}

function valueToText(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index];
    if (item === "--file") parsed.file = argv[++index] ?? "";
  }
  return parsed;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw Object.assign(new Error(`${name} is not configured.`), { code: "GOOGLE_SHEETS_CONFIG_MISSING" });
  return value;
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

function attr(source, name) {
  const escaped = name.replace(":", "\\:");
  const match = new RegExp(`(?:${escaped}|${name})="([^"]*)"`).exec(source);
  return match ? decodeXml(match[1]) : "";
}

function decodeXml(value) {
  return String(value ?? "").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function columnSort(left, right) {
  return columnIndex(left) - columnIndex(right);
}

function columnIndex(column) {
  return [...column].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeCode(value) {
  return text(value).toUpperCase().replace(/\s+/g, " ");
}

function normalizeSessionGroup(value) {
  return text(value).replace(/\s+/g, " ");
}

function normalizeUniversityId(value) {
  return text(value).replace(/\.0$/, "").replace(/\s+/g, "").toUpperCase();
}

function normalizePhone(value) {
  let digits = text(value).replace(/\D+/g, "");
  if (digits.startsWith("20") && digits.length === 12) digits = `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("1")) digits = `0${digits}`;
  return digits;
}

function normalizeName(value) {
  return text(value).replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function normalizeTimestamp(value) {
  return text(value).replace(/\s+/g, " ");
}

function normalizeDate(value) {
  if (typeof value === "number") return serialDate(value);
  const raw = text(value);
  if (!raw) return "";
  if (/^\d+(\.\d+)?$/.test(raw)) return serialDate(Number(raw));
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const locale = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (locale) return `${locale[3]}-${locale[1].padStart(2, "0")}-${locale[2].padStart(2, "0")}`;
  return "";
}

function serialDate(value) {
  const base = Date.UTC(1899, 11, 30);
  const date = new Date(base + Math.floor(Number(value)) * 86400000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function groupBy(rows, getKey) {
  const map = new Map();
  for (const row of rows) {
    const key = getKey(row);
    if (!key) continue;
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return map;
}

function duplicates(values) {
  const seen = new Set();
  const duplicate = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate];
}

function block(code, reason) {
  const key = `${code}::${reason}`;
  if (!result.blocking.some(item => item.key === key)) result.blocking.push({ key, code, reason });
  const error = Object.assign(new Error(reason), { code });
  throw error;
}

function buildReport(summary) {
  const diagnosticSections = Object.entries(summary.diagnostics ?? {}).map(([category, items]) => {
    const lines = items.length ? items.map(item => `- Original Row ${item.originalRow} | University Student ID ${item.universityStudentId} | ${item.session} | ${item.reason}`).join("\n") : "- None";
    return `### ${category}\n${lines}`;
  }).join("\n\n");
  const sessionRows = [...(summary.sessionBreakdown instanceof Map ? summary.sessionBreakdown.entries() : [])].sort(([left], [right]) => left.localeCompare(right)).map(([sessionId, row]) => `| ${sessionId} | ${row.candidatePresentCount} | ${row.alreadyPresent} | ${row.create} | ${row.update} | ${row.reviewRequired} |`).join("\n") || "| - | 0 | 0 | 0 | 0 | 0 |";
  const blockers = summary.blocking.length ? summary.blocking.map(item => `- ${item.code}: ${item.reason}`).join("\n") : "- None";
  return `# Attendance Form Backfill Dry Run Report

## Summary
- Workbook readable: ${summary.workbookRead ? "Yes" : "No"}
- Required sheets found: ${summary.requiredSheetsFound ? "Yes" : "No"}
- Processed rows: ${summary.processedRows}
- Exact unique raw Session Group + Student ID pairs: ${summary.uniqueRawPairs}
- Duplicate raw submissions removed: ${summary.duplicateFormSubmissionsRemoved}
- Rows accepted despite late/outside timing: ${summary.lateOutsideAccepted}
- Rows unresolved because Session Group is NEEDS REVIEW: ${summary.needsReviewSessionGroupRows}
- Exact session code/date matches: ${summary.exactSessionMatches}
- Session review required: ${summary.sessionReviewRequired}
- Exact University Student ID matches: ${summary.exactStudentIdMatches}
- Safe name+phone fallback matches: ${summary.safeFallbackMatches}
- Student review required: ${summary.studentReviewRequired}
- Identity conflicts: ${summary.identityConflicts}
- Eligible mapped enrollments: ${summary.eligibleMappedCandidates}
- No eligible mapping: ${summary.noEligibleMapping}
- Multiple eligible enrollments: ${summary.multipleEligibleEnrollments}
- CREATE_VALIDATED count: ${summary.createValidated}
- UPDATE_EXISTING count: ${summary.updateExisting}
- ALREADY_PRESENT count: ${summary.alreadyPresent}
- DUPLICATE_VALIDATED_REVIEW count: ${summary.duplicateValidatedReview}
- Source response rows unresolved: ${summary.sourceRowUnresolved}
- Total final unique Present candidates: ${summary.finalUniquePresentCandidates}
- Google Sheets OAuth scope: ${summary.googleScope}
- Google Sheets writes performed: ${summary.googleSheetsWritesPerformed}
- Final result: ${summary.finalResult}
- Remaining issue: ${summary.remainingIssue}

## Live Sheets Read
- Sheets read: ${summary.sheetsRead.join(", ") || "None"}

## Compact Breakdown by Attendance_Session_ID
| Attendance_Session_ID | Candidate present count | Already present | Create | Update | Review required |
| --- | ---: | ---: | ---: | ---: | ---: |
${sessionRows}

## Diagnostic Examples
${diagnosticSections || "- None"}

## Blocking Issues
${blockers}

## Confirmation
- This was a read-only dry run.
- Attendance_Form_Responses was not modified.
- Attendance_Validated was not modified.
- Google Sheets writes performed: ${summary.googleSheetsWritesPerformed}
`;
}

function printSummary(summary) {
  console.log(`Attendance Form Backfill Dry Run
Workbook readable: ${summary.workbookRead ? "Yes" : "No"}
Processed rows: ${summary.processedRows}
Unique candidate pairs before live validation: ${summary.uniqueRawPairs}
Duplicate form submissions removed: ${summary.duplicateFormSubmissionsRemoved}
CREATE_VALIDATED: ${summary.createValidated}
UPDATE_EXISTING: ${summary.updateExisting}
ALREADY_PRESENT: ${summary.alreadyPresent}
Google Sheets writes performed: ${summary.googleSheetsWritesPerformed}
Final result: ${summary.finalResult}
Report: ${REPORT_PATH}`);
}
