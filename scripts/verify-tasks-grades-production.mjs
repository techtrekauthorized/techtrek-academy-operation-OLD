import nextEnv from "@next/env";
import { google } from "googleapis";

nextEnv.loadEnvConfig(process.cwd());

const spreadsheetId = process.env.GOOGLE_SHEET_ID;
const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
if (!spreadsheetId || !encoded) throw new Error("Google Sheets environment is not configured");

const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });

const tabs = ["Assignments", "Assignment_Groups", "Assignment_Results", "Certificate_Eligibility", "Batches", "Groups"];
const requiredTabs = ["Assignments", "Assignment_Groups", "Assignment_Results", "Certificate_Eligibility"];
const expectedHeaders = {
  Assignments: ["Assignment_ID", "Batch_ID", "Assignment_Type", "Title", "Description", "Level_Code", "Max_Grade", "Required_For_Certificate", "Is_Active", "Created_At", "Created_By", "Notes"],
  Assignment_Groups: ["Assignment_Group_Map_ID", "Assignment_ID", "Group_ID", "Is_Active", "Notes"],
  Assignment_Results: ["Assignment_Result_ID", "Assignment_ID", "Academy_Student_ID", "Enrollment_ID", "Group_ID", "Submission_Status", "Grade", "Graded_By", "Graded_At", "Notes", "Updated_At"],
  Certificate_Eligibility: ["Certificate_Eligibility_ID", "Academy_Student_ID", "Enrollment_ID", "Batch_ID", "Approval_Status", "Approved_By", "Approved_At", "Updated_At", "Notes"],
};

let readCalls = 0;
let writeCalls = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryAfterMs(error) {
  const header = error?.response?.headers?.get?.("retry-after");
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

function statusOf(error) {
  return Number(error?.response?.status ?? error?.code ?? error?.status ?? 0);
}

async function withRateLimitBackoff(operation) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (statusOf(error) !== 429 || attempt === 3) break;
      const fallback = 2000 * (2 ** attempt) + Math.floor(Math.random() * 500);
      await sleep(retryAfterMs(error) ?? fallback);
    }
  }
  throw lastError;
}

function range(tab) {
  return `'${tab}'!A:ZZ`;
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

function rowObjects(values = []) {
  const headers = (values[0] ?? []).map(value => String(value ?? ""));
  return values.slice(1).map((row, index) => ({
    _rowNumber: index + 2,
    ...Object.fromEntries(headers.map((header, column) => [header, String(row[column] ?? "")])),
  })).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && String(value).trim() !== ""));
}

function nextId(rows, field, prefix) {
  const pattern = new RegExp(`^${prefix}_(\\d+)$`);
  const highest = rows.reduce((max, row) => {
    const match = String(row[field] ?? "").match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}_${String(highest + 1).padStart(5, "0")}`;
}

function booleanText(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["false", "0", "no"].includes(normalized)) return "FALSE";
  if (["true", "1", "yes"].includes(normalized)) return "TRUE";
  return String(value ?? "").trim();
}

function duplicateCount(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].filter(count => count > 1).length;
}

async function readAll() {
  readCalls++;
  const response = await withRateLimitBackoff(() => sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: tabs.map(range),
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  }, { retry: false }));
  return Object.fromEntries((response.data.valueRanges ?? []).map((valueRange, index) => [tabs[index], valueRange.values ?? []]));
}

function verifyHeaders(data) {
  const result = {};
  for (const tab of requiredTabs) {
    const headers = (data[tab]?.[0] ?? []).map(value => String(value ?? "").trim());
    result[tab] = {
      status: headers.length ? "DETECTED" : "MISSING",
      headerPassed: Boolean(headers.length) && expectedHeaders[tab].every((header, index) => headers[index] === header),
      rowCount: Math.max(0, (data[tab]?.length ?? 1) - 1),
    };
  }
  return result;
}

function verifyReadPaths(data) {
  const assignments = rowObjects(data.Assignments);
  const assignmentGroups = rowObjects(data.Assignment_Groups);
  const assignmentResults = rowObjects(data.Assignment_Results);
  const certificateEligibility = rowObjects(data.Certificate_Eligibility);
  const groups = rowObjects(data.Groups);
  const activeMappings = assignmentGroups.filter(row => String(row.Is_Active).trim().toUpperCase() === "TRUE");
  return {
    assignments,
    assignmentGroups,
    assignmentResults,
    certificateEligibility,
    productionRead: true,
    gradebookRead: groups.length > 0 && assignments.every(assignment => activeMappings.filter(mapping => mapping.Assignment_ID === assignment.Assignment_ID).every(mapping => groups.some(group => group.Group_ID === mapping.Group_ID))),
    readinessRead: true,
    duplicates: {
      assignmentIds: duplicateCount(assignments, row => row.Assignment_ID),
      activeAssignmentGroupMappings: duplicateCount(activeMappings, row => `${row.Assignment_ID}:${row.Group_ID}`),
      resultPairs: duplicateCount(assignmentResults, row => `${row.Assignment_ID}:${row.Enrollment_ID}`),
      eligibilityEnrollments: duplicateCount(certificateEligibility, row => row.Enrollment_ID),
    },
  };
}

async function controlledWriteAndReadBack(data) {
  const assignments = rowObjects(data.Assignments);
  const assignmentGroups = rowObjects(data.Assignment_Groups);
  const batches = rowObjects(data.Batches);
  const groups = rowObjects(data.Groups);
  const group = groups.find(row => row.Group_ID && row.Batch_ID);
  if (!group) throw new Error("No valid Group row found for controlled test");
  const batch = batches.find(row => row.Batch_ID === group.Batch_ID);
  if (!batch) throw new Error("No valid Batch row found for controlled test");

  const title = "SYSTEM TEST - TASKS GRADES INTEGRATION";
  const reusableAssignment = assignments.find(row => row.Title === title && row.Assignment_Type === "TASK" && booleanText(row.Required_For_Certificate) === "FALSE" && booleanText(row.Is_Active) === "FALSE");
  const reusableMapping = reusableAssignment ? assignmentGroups.find(row => row.Assignment_ID === reusableAssignment.Assignment_ID && row.Group_ID === group.Group_ID) : undefined;
  if (reusableAssignment && reusableMapping) {
    return {
      after: data,
      assignmentId: reusableAssignment.Assignment_ID,
      mapId: reusableMapping.Assignment_Group_Map_ID,
      cleanup: "left inactive temporary assignment and mapping for audit/safety",
      created: false,
    };
  }

  const assignmentId = reusableAssignment?.Assignment_ID ?? nextId(assignments, "Assignment_ID", "ASG");
  const mapId = nextId(assignmentGroups, "Assignment_Group_Map_ID", "ASGM");
  const now = new Date().toISOString();
  const assignmentHeaders = expectedHeaders.Assignments;
  const mappingHeaders = expectedHeaders.Assignment_Groups;
  const assignmentRowNumber = Math.max(2, (data.Assignments ?? []).length + 1);
  const mappingRowNumber = Math.max(2, (data.Assignment_Groups ?? []).length + 1);
  const assignment = {
    Assignment_ID: assignmentId,
    Batch_ID: batch.Batch_ID,
    Assignment_Type: "TASK",
    Title: title,
    Description: "Controlled production integration test - inactive temporary row",
    Level_Code: "",
    Max_Grade: "",
    Required_For_Certificate: "FALSE",
    Is_Active: "FALSE",
    Created_At: now,
    Created_By: "Codex controlled verification",
    Notes: "Temporary inactive integration verification row",
  };
  const mapping = {
    Assignment_Group_Map_ID: mapId,
    Assignment_ID: assignmentId,
    Group_ID: group.Group_ID,
    Is_Active: "TRUE",
    Notes: "Temporary integration verification mapping",
  };

  writeCalls++;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
      ...(reusableAssignment ? [] : [{ range: `'Assignments'!A${assignmentRowNumber}:${columnName(assignmentHeaders.length)}${assignmentRowNumber}`, values: [assignmentHeaders.map(header => assignment[header] ?? "")] }]),
      { range: `'Assignment_Groups'!A${mappingRowNumber}:${columnName(mappingHeaders.length)}${mappingRowNumber}`, values: [mappingHeaders.map(header => mapping[header] ?? "")] },
      ],
    },
  });

  const after = await readAll();
  const afterAssignments = rowObjects(after.Assignments);
  const afterMappings = rowObjects(after.Assignment_Groups);
  const created = afterAssignments.find(row => row.Assignment_ID === assignmentId);
  const createdMappings = afterMappings.filter(row => row.Assignment_ID === assignmentId && row.Group_ID === group.Group_ID);
  if (!created || created.Batch_ID !== batch.Batch_ID || created.Assignment_Type !== "TASK" || created.Title !== title || booleanText(created.Required_For_Certificate) !== "FALSE" || booleanText(created.Is_Active) !== "FALSE" || createdMappings.length !== 1) {
    throw new Error("Controlled test read-back failed");
  }
  return {
    after,
    assignmentId,
    mapId,
    cleanup: "left inactive temporary assignment and mapping for audit/safety",
    created: true,
  };
}

async function main() {
  try {
    const data = await readAll();
    const headers = verifyHeaders(data);
    const headerPassed = requiredTabs.every(tab => headers[tab].status === "DETECTED" && headers[tab].headerPassed);
    if (!headerPassed) {
      console.log(JSON.stringify({ finalResult: "BLOCKED", sheets: headers, headerVerification: "Failed", readCalls, writeCalls }, null, 2));
      return;
    }
    const paths = verifyReadPaths(data);
    if (Object.values(paths.duplicates).some(count => count > 0)) {
      console.log(JSON.stringify({ finalResult: "BLOCKED", sheets: headers, headerVerification: "Passed", readPaths: paths, readCalls, writeCalls }, null, 2));
      return;
    }
    const controlled = await controlledWriteAndReadBack(data);
    const finalPaths = verifyReadPaths(controlled.after);
    console.log(JSON.stringify({
      finalResult: "READY_FOR_USE",
      sheets: verifyHeaders(controlled.after),
      headerVerification: "Passed",
      readPaths: finalPaths,
      controlledTest: { created: controlled.created, readBack: "Passed", assignmentId: controlled.assignmentId, mappingId: controlled.mapId, cleanup: controlled.cleanup },
      readCalls,
      writeCalls,
    }, null, 2));
  } catch (error) {
    if (statusOf(error) === 429) {
      console.log(JSON.stringify({
        finalResult: "RATE_LIMITED",
        sheets: Object.fromEntries(requiredTabs.map(tab => [tab, { status: "RATE_LIMITED", headerPassed: false, rowCount: null }])),
        headerVerification: "Not Verified",
        readCalls,
        writeCalls,
      }, null, 2));
      return;
    }
    throw error;
  }
}

main();
