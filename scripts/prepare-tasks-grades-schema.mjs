import fs from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { google } from "googleapis";

nextEnv.loadEnvConfig(process.cwd());

const REPORT_PATH = path.join(process.cwd(), "TASKS_GRADES_SCHEMA_REPORT.md");
const READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

const REQUIRED_SCHEMAS = {
  Assignments: [
    "Assignment_ID",
    "Batch_ID",
    "Assignment_Type",
    "Title",
    "Description",
    "Level_Code",
    "Max_Grade",
    "Required_For_Certificate",
    "Is_Active",
    "Created_At",
    "Created_By",
    "Notes",
  ],
  Assignment_Groups: [
    "Assignment_Group_Map_ID",
    "Assignment_ID",
    "Group_ID",
    "Is_Active",
    "Notes",
  ],
  Assignment_Results: [
    "Assignment_Result_ID",
    "Assignment_ID",
    "Academy_Student_ID",
    "Enrollment_ID",
    "Group_ID",
    "Submission_Status",
    "Grade",
    "Graded_By",
    "Graded_At",
    "Notes",
    "Updated_At",
  ],
  Certificate_Eligibility: [
    "Certificate_Eligibility_ID",
    "Academy_Student_ID",
    "Enrollment_ID",
    "Batch_ID",
    "Approval_Status",
    "Approved_By",
    "Approved_At",
    "Updated_At",
    "Notes",
  ],
};

const STRUCTURAL_TABS = [
  "Students",
  "Enrollments",
  "Groups",
  "Batches",
  "Recorded_Sessions",
  "Recorded_Session_Groups",
  "Session_Materials",
  "Session_Material_Groups",
  ...Object.keys(REQUIRED_SCHEMAS),
  "Tasks",
  "Projects",
  "Grades",
  "Submissions",
  "Assessments",
  "Assessment_Assignments",
  "AssessmentAssignments",
  "GroupAssessments",
  "AcademicRecords",
];

function decodeServiceAccount() {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!encoded) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not configured");
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

function spreadsheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID is not configured");
  return id;
}

function escapeMarkdown(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function normalizeHeader(value) {
  return String(value ?? "").trim();
}

function missingHeaders(actual, required) {
  const actualSet = new Set(actual.map(normalizeHeader));
  return required.filter(header => !actualSet.has(header));
}

async function readTabSummary(sheets, id, title) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `'${title.replaceAll("'", "''")}'!A:ZZ`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  const values = response.data.values ?? [];
  const headers = (values[0] ?? []).map(value => String(value ?? ""));
  const rowCount = Math.max(0, values.slice(1).filter(row => row.some(cell => String(cell ?? "").trim() !== "")).length);
  return { title, headers, rowCount };
}

function buildReport({ readable, readError, tabs }) {
  const tabMap = new Map(tabs.map(tab => [tab.title, tab]));
  const requiredRows = Object.entries(REQUIRED_SCHEMAS).map(([title, headers]) => {
    const tab = tabMap.get(title);
    const missing = tab ? missingHeaders(tab.headers, headers) : headers;
    return { title, found: Boolean(tab), rowCount: tab?.rowCount ?? 0, missing };
  });
  const allRequiredPresent = requiredRows.every(row => row.found && row.missing.length === 0);
  const foundAssignmentLike = tabs.filter(tab => /assignment|task|project|grade|submission|assessment|academic|certificate/i.test(tab.title));
  const safeToImplement = allRequiredPresent;
  const now = new Date().toISOString();

  return `# Tasks & Grades Schema Report

Generated: ${now}

## Read-only diagnostic

- Workbook readable: ${readable ? "Yes" : "No"}
- Google Sheets OAuth scope: \`${READONLY_SCOPE}\`
- Google Sheets writes performed: 0
${readError ? `- Read error: ${escapeMarkdown(readError)}` : ""}

## Existing assignment-related sheets found

${foundAssignmentLike.length ? "| Sheet | Rows |\n| --- | ---: |\n" + foundAssignmentLike.map(tab => `| ${escapeMarkdown(tab.title)} | ${tab.rowCount} |`).join("\n") : "No assignment, task, project, grade, assessment, academic-record, or certificate eligibility sheets were found in the live spreadsheet metadata."}

## Required schema compatibility

| Required sheet | Found | Rows | Missing required fields |
| --- | --- | ---: | --- |
${requiredRows.map(row => `| ${escapeMarkdown(row.title)} | ${row.found ? "Yes" : "No"} | ${row.rowCount} | ${row.missing.length ? row.missing.map(escapeMarkdown).join(", ") : "None"} |`).join("\n")}

## Proposed headers

${Object.entries(REQUIRED_SCHEMAS).map(([title, headers]) => `### ${title}\n\n${headers.map(header => `- ${header}`).join("\n")}`).join("\n\n")}

## Required relationships

- \`Assignments.Batch_ID\` must reference \`Batches.Batch_ID\`.
- \`Assignment_Groups.Assignment_ID\` must reference \`Assignments.Assignment_ID\`.
- \`Assignment_Groups.Group_ID\` must reference \`Groups.Group_ID\`.
- \`Assignment_Results.Assignment_ID\` must reference \`Assignments.Assignment_ID\`.
- \`Assignment_Results.Academy_Student_ID\` must reference \`Students.Academy_Student_ID\`.
- \`Assignment_Results.Enrollment_ID\` must reference \`Enrollments.Enrollment_ID\`.
- \`Assignment_Results.Group_ID\` must match the student's eligible enrollment group and an active assignment-group mapping.
- \`Certificate_Eligibility.Enrollment_ID\` should be unique for the current one-program-certificate-per-enrollment workflow.

## Data migration impact

- Production schema creation is required before the internal Tasks & Grades runtime can be safely implemented.
- No student-facing Tasks & Grades, grade display, certificate readiness, certificate generation, QR codes, or public verification should be enabled from this report alone.
- Existing Students, Enrollments, Groups, Payments, Attendance, Recordings, Materials, and Certificates data are unchanged.

## Final result

${safeToImplement ? "READY_FOR_IMPLEMENTATION" : "BLOCKED_FOR_SCHEMA_APPLY"}

## Remaining issue

${safeToImplement ? "Required storage exists. Runtime implementation can proceed in a separate change using these existing sheets." : "Required production sheets/columns for Assignments, Assignment_Groups, Assignment_Results, and Certificate_Eligibility are missing or incomplete. Apply a reviewed schema migration before building the runtime Tasks & Grades module."}
`;
}

async function main() {
  if (process.argv.includes("--apply")) {
    throw new Error("This preview script never applies Google Sheets schema changes. Remove --apply and review the generated report.");
  }

  let readable = false;
  let readError = "";
  let tabs = [];

  try {
    const auth = new google.auth.GoogleAuth({ credentials: decodeServiceAccount(), scopes: [READONLY_SCOPE] });
    const sheets = google.sheets({ version: "v4", auth });
    const id = spreadsheetId();
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: "sheets.properties.title",
    });
    const titles = new Set((metadata.data.sheets ?? []).map(sheet => String(sheet.properties?.title ?? "")).filter(Boolean));
    const titlesToRead = [...new Set([...STRUCTURAL_TABS.filter(title => titles.has(title)), ...Object.keys(REQUIRED_SCHEMAS).filter(title => titles.has(title))])];
    tabs = await Promise.all(titlesToRead.map(title => readTabSummary(sheets, id, title)));
    readable = true;
  } catch (error) {
    readError = error instanceof Error ? error.message : String(error);
  }

  const report = buildReport({ readable, readError, tabs });
  await fs.writeFile(REPORT_PATH, report, "utf8");
  console.log(JSON.stringify({
    reportPath: REPORT_PATH,
    workbookReadable: readable,
    requiredSheets: Object.fromEntries(Object.keys(REQUIRED_SCHEMAS).map(title => [title, tabs.some(tab => tab.title === title)])),
    googleSheetsWritesPerformed: 0,
    finalResult: report.includes("BLOCKED_FOR_SCHEMA_APPLY") ? "BLOCKED_FOR_SCHEMA_APPLY" : "READY_FOR_IMPLEMENTATION",
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
