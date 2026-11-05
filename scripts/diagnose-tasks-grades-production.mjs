import nextEnv from "@next/env";
import { google } from "googleapis";

nextEnv.loadEnvConfig(process.cwd());

const spreadsheetId = process.env.GOOGLE_SHEET_ID;
const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
if (!spreadsheetId || !encoded) throw new Error("Google Sheets environment is not configured");

const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
const sheets = google.sheets({ version: "v4", auth });
const tabs = ["Assignments", "Assignment_Groups", "Assignment_Results", "Certificate_Eligibility", "Batches", "Groups", "Enrollments", "Students"];
let readCalls = 0;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function statusOf(error) { return Number(error?.response?.status ?? error?.code ?? error?.status ?? 0); }
async function withBackoff(operation) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      if (statusOf(error) !== 429 || attempt === 3) break;
      await sleep(2000 * (2 ** attempt) + Math.floor(Math.random() * 500));
    }
  }
  throw lastError;
}
function rows(values = []) {
  const headers = (values[0] ?? []).map(value => String(value ?? "").trim());
  return values.slice(1).map((row, index) => ({ _rowNumber: index + 2, ...Object.fromEntries(headers.map((header, column) => [header, String(row[column] ?? "").trim()])) })).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && String(value).trim() !== ""));
}
function bool(value) {
  if (typeof value === "boolean") return value;
  return ["true", "yes", "1", "active"].includes(String(value ?? "").trim().toLowerCase());
}
function duplicateCount(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].filter(value => value > 1).length;
}
function batchIdForEnrollment(enrollment, groupsById) {
  return groupsById.get(enrollment.Group_ID)?.Batch_ID ?? "";
}

async function readAll() {
  readCalls++;
  const response = await withBackoff(() => sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: tabs.map(tab => `'${tab}'!A:ZZ`),
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  }, { retry: false }));
  return Object.fromEntries((response.data.valueRanges ?? []).map((range, index) => [tabs[index], rows(range.values ?? [])]));
}

try {
  const data = await readAll();
  const groupsById = new Map(data.Groups.map(row => [row.Group_ID, row]));
  const activeMappings = data.Assignment_Groups.filter(row => bool(row.Is_Active));
  const resultsByAssignment = new Map();
  for (const result of data.Assignment_Results) {
    const list = resultsByAssignment.get(result.Assignment_ID) ?? [];
    list.push(result);
    resultsByAssignment.set(result.Assignment_ID, list);
  }
  const requiredAssignments = data.Assignments.filter(row => bool(row.Required_For_Certificate));
  const requiredDiagnostics = requiredAssignments.map(assignment => {
    const mappings = activeMappings.filter(row => row.Assignment_ID === assignment.Assignment_ID);
    const mappedGroupIds = new Set(mappings.map(row => row.Group_ID));
    const mappedGroups = mappings.map(row => groupsById.get(row.Group_ID)).filter(Boolean);
    const eligibleEnrollments = data.Enrollments.filter(enrollment => mappedGroupIds.has(enrollment.Group_ID) && batchIdForEnrollment(enrollment, groupsById) === assignment.Batch_ID && String(enrollment.Enrollment_Status ?? "").toLowerCase() !== "cancelled");
    const existingResults = resultsByAssignment.get(assignment.Assignment_ID) ?? [];
    return {
      assignmentId: assignment.Assignment_ID,
      batchExists: data.Batches.some(row => row.Batch_ID === assignment.Batch_ID),
      assignmentTypeValid: ["TASK", "PROJECT"].includes(assignment.Assignment_Type),
      isActive: bool(assignment.Is_Active),
      requiredForCertificate: bool(assignment.Required_For_Certificate),
      activeMappedGroups: mappings.length,
      mappedGroupsExist: mappedGroups.length,
      mappedGroupsInAssignmentBatch: mappedGroups.filter(group => group.Batch_ID === assignment.Batch_ID).length,
      eligibleEnrollments: eligibleEnrollments.length,
      existingResults: existingResults.length,
      gradebookRowsExpected: eligibleEnrollments.length,
      virtualNotSubmittedRows: Math.max(0, eligibleEnrollments.length - existingResults.filter(result => eligibleEnrollments.some(enrollment => enrollment.Enrollment_ID === result.Enrollment_ID)).length),
    };
  });
  const selectedRequired = requiredDiagnostics.find(item => item.isActive && item.requiredForCertificate) ?? requiredDiagnostics[0];
  const batchId = selectedRequired?.assignmentId ? data.Assignments.find(row => row.Assignment_ID === selectedRequired.assignmentId)?.Batch_ID ?? "" : "";
  const batchEnrollments = data.Enrollments.filter(enrollment => batchIdForEnrollment(enrollment, groupsById) === batchId && String(enrollment.Enrollment_Status ?? "").toLowerCase() !== "cancelled");
  const eligibilityByEnrollment = new Map(data.Certificate_Eligibility.map(row => [row.Enrollment_ID, row.Approval_Status || "PENDING"]));
  const decisions = { PENDING: 0, APPROVED: 0, NOT_APPROVED: 0 };
  for (const enrollment of batchEnrollments) {
    const status = String(eligibilityByEnrollment.get(enrollment.Enrollment_ID) ?? "PENDING").toUpperCase();
    if (status === "APPROVED") decisions.APPROVED++;
    else if (status === "NOT_APPROVED") decisions.NOT_APPROVED++;
    else decisions.PENDING++;
  }
  console.log(JSON.stringify({
    readCalls,
    rowCounts: {
      Assignments: data.Assignments.length,
      Assignment_Groups: data.Assignment_Groups.length,
      Assignment_Results: data.Assignment_Results.length,
      Certificate_Eligibility: data.Certificate_Eligibility.length,
    },
    duplicates: {
      assignmentIds: duplicateCount(data.Assignments, row => row.Assignment_ID),
      activeAssignmentGroupMappings: duplicateCount(activeMappings, row => `${row.Assignment_ID}:${row.Group_ID}`),
      resultPairs: duplicateCount(data.Assignment_Results, row => `${row.Assignment_ID}:${row.Enrollment_ID}`),
      eligibilityEnrollments: duplicateCount(data.Certificate_Eligibility, row => row.Enrollment_ID),
    },
    requiredAssignmentDetected: requiredDiagnostics.length > 0,
    requiredAssignments: requiredDiagnostics,
    selectedBatch: {
      batchId,
      enrollments: batchEnrollments.length,
      readinessRowsExpected: batchEnrollments.length,
      pendingCertificateDecisions: decisions.PENDING,
      approvedCertificateDecisions: decisions.APPROVED,
      notApprovedCertificateDecisions: decisions.NOT_APPROVED,
    },
    productionWrites: 0,
  }, null, 2));
} catch (error) {
  if (statusOf(error) === 429) {
    console.log(JSON.stringify({ rateLimited: true, readCalls, productionWrites: 0 }, null, 2));
  } else {
    throw error;
  }
}
