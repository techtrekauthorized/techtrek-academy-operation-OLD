import nextEnv from "@next/env";
import { google } from "googleapis";

nextEnv.loadEnvConfig(process.cwd());

const spreadsheetId = process.env.GOOGLE_SHEET_ID;
const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
if (!spreadsheetId || !encoded) throw new Error("Google Sheets environment is not configured");

const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
const sheets = google.sheets({ version: "v4", auth });
const tabs = ["Certificates", "Enrollments", "Groups", "Assignments", "Assignment_Groups", "Assignment_Results", "Learning_Roadmap_Items"];
let readCalls = 0;

function rows(values = []) {
  const headers = (values[0] ?? []).map(value => String(value ?? "").trim());
  return values.slice(1).map(row => Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "").trim()]))).filter(row => Object.values(row).some(value => String(value).trim()));
}

function bool(value) {
  return ["true", "yes", "1", "active"].includes(String(value ?? "").trim().toLowerCase());
}

function status(value) {
  return String(value ?? "").trim().toUpperCase();
}

const response = await sheets.spreadsheets.values.batchGet({
  spreadsheetId,
  ranges: tabs.map(tab => `'${tab}'!A:ZZ`),
  valueRenderOption: "UNFORMATTED_VALUE",
  dateTimeRenderOption: "SERIAL_NUMBER",
}, { retry: false });
readCalls++;

const data = Object.fromEntries((response.data.valueRanges ?? []).map((range, index) => [tabs[index], rows(range.values ?? [])]));
const issuedCertificates = data.Certificates.filter(row => status(row.Certificate_Status) === "ISSUED");
const certificate = issuedCertificates[0];

let result = {
  readCalls,
  issuedCertificateCount: issuedCertificates.length,
  analyzedCertificateId: certificate?.Certificate_ID ?? "",
  taskRootCause: "NO_ISSUED_CERTIFICATE",
  projectRootCause: "NO_ISSUED_CERTIFICATE",
  productionWrites: 0,
};

if (certificate) {
  const enrollment = data.Enrollments.find(row => row.Enrollment_ID === certificate.Enrollment_ID);
  const group = enrollment ? data.Groups.find(row => row.Group_ID === enrollment.Group_ID) : undefined;
  const batchId = group?.Batch_ID || certificate.Batch_ID;
  const groupId = enrollment?.Group_ID || "";
  const batchAssignments = data.Assignments.filter(row => row.Batch_ID === batchId);
  const certificateBatchAssignments = data.Assignments.filter(row => row.Batch_ID === certificate.Batch_ID);
  const certificateBatchCompleted = certificateBatchAssignments.filter(assignment => bool(assignment.Is_Active) && bool(assignment.Show_On_Verification) && data.Assignment_Groups.some(mapping => mapping.Assignment_ID === assignment.Assignment_ID && mapping.Group_ID === groupId && bool(mapping.Is_Active)) && data.Assignment_Results.some(result => result.Assignment_ID === assignment.Assignment_ID && result.Enrollment_ID === certificate.Enrollment_ID && ["SUBMITTED", "GRADED"].includes(status(result.Submission_Status))));
  const activeAssignments = batchAssignments.filter(row => bool(row.Is_Active));
  const publicAssignments = activeAssignments.filter(row => bool(row.Show_On_Verification));
  const applicableAssignments = publicAssignments.filter(assignment => data.Assignment_Groups.some(mapping => mapping.Assignment_ID === assignment.Assignment_ID && mapping.Group_ID === groupId && bool(mapping.Is_Active)));
  const completedAssignments = applicableAssignments.filter(assignment => {
    const row = data.Assignment_Results.find(result => result.Assignment_ID === assignment.Assignment_ID && result.Enrollment_ID === certificate.Enrollment_ID);
    return ["SUBMITTED", "GRADED"].includes(status(row?.Submission_Status));
  });
  const taskAssignments = completedAssignments.filter(row => status(row.Assignment_Type) === "TASK");
  const projectAssignments = completedAssignments.filter(row => status(row.Assignment_Type) === "PROJECT");
  const taskCandidates = applicableAssignments.filter(row => status(row.Assignment_Type) === "TASK");
  const projectCandidates = applicableAssignments.filter(row => status(row.Assignment_Type) === "PROJECT");
  const taskMissingResults = taskCandidates.length - taskAssignments.length;
  const projectMissingResults = projectCandidates.length - projectAssignments.length;
  const hiddenPublicTasks = activeAssignments.filter(row => status(row.Assignment_Type) === "TASK" && !bool(row.Show_On_Verification)).length;
  const hiddenPublicProjects = activeAssignments.filter(row => status(row.Assignment_Type) === "PROJECT" && !bool(row.Show_On_Verification)).length;
  result = {
    readCalls,
    issuedCertificateCount: issuedCertificates.length,
    analyzedCertificateId: certificate.Certificate_ID,
    enrollmentFound: Boolean(enrollment),
    groupFound: Boolean(group),
    batchAssignmentCount: batchAssignments.length,
    certificateStoredBatchAssignmentCount: certificateBatchAssignments.length,
    certificateStoredBatchCompletedPublicCount: certificateBatchCompleted.length,
    activeAssignmentCount: activeAssignments.length,
    publicAssignmentCount: publicAssignments.length,
    applicableAssignmentCount: applicableAssignments.length,
    completedPublicTaskCount: taskAssignments.length,
    completedPublicProjectCount: projectAssignments.length,
    applicableTaskCount: taskCandidates.length,
    applicableProjectCount: projectCandidates.length,
    taskMissingResultOrIncompleteCount: Math.max(0, taskMissingResults),
    projectMissingResultOrIncompleteCount: Math.max(0, projectMissingResults),
    activeTasksHiddenByShowOnVerification: hiddenPublicTasks,
    activeProjectsHiddenByShowOnVerification: hiddenPublicProjects,
    roadmapItemCount: data.Learning_Roadmap_Items.filter(row => row.Roadmap_ID === certificate.Roadmap_ID && bool(row.Is_Active)).length,
    taskRootCause: taskAssignments.length ? "TASKS_DISPLAYABLE" : !taskCandidates.length ? "NO_APPLICABLE_PUBLIC_TASKS_FOR_CERTIFICATE_BATCH_GROUP" : "APPLICABLE_TASKS_HAVE_NO_SUBMITTED_OR_GRADED_RESULT_FOR_CERTIFICATE_ENROLLMENT",
    projectRootCause: projectAssignments.length ? "PROJECTS_DISPLAYABLE" : !projectCandidates.length ? "NO_APPLICABLE_PUBLIC_PROJECTS_FOR_CERTIFICATE_BATCH_GROUP" : "APPLICABLE_PROJECTS_HAVE_NO_SUBMITTED_OR_GRADED_RESULT_FOR_CERTIFICATE_ENROLLMENT",
    productionWrites: 0,
  };
}

console.log(JSON.stringify(result, null, 2));
