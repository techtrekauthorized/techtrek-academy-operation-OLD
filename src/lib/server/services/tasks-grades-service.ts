import "server-only";
import type { EnrollmentRow, StudentRow } from "../types";
import type { BatchRow, GroupRow } from "@/types/operations";
import type { AssignmentGroupRow, AssignmentInput, AssignmentResultInput, AssignmentResultRow, AssignmentRow, AssignmentType, CertificateApprovalStatus, CertificateDecisionChangeInput, CertificateDecisionInput, CertificateEligibilityRow, CertificateReadinessAssignmentEntry, CertificateReadinessRow, GradebookRow, SubmissionStatus, TasksGradesAssignment, TasksGradesData } from "@/types/tasks-grades";
import { appendRecordToDataRegion, atomicSheetMutation, updateRecord } from "../google/sheets";
import { getSheetsClient, getSpreadsheetId } from "../google/client";
import { ServiceError } from "./errors";
import { activeValue, enrollmentDto, numberValue, studentDto } from "./mappers";
import { nextId } from "./id-service";
import type { SafeUser } from "../auth/types";

const ASSIGNMENT_TYPES: AssignmentType[] = ["TASK", "PROJECT"];
const SUBMISSION_STATUSES: SubmissionStatus[] = ["NOT_SUBMITTED", "SUBMITTED", "GRADED"];
const CERTIFICATE_DECISIONS: CertificateApprovalStatus[] = ["PENDING", "APPROVED", "NOT_APPROVED"];
export const TASKS_GRADES_REQUIRED_HEADERS = {
  Assignments: ["Assignment_ID", "Batch_ID", "Assignment_Type", "Title", "Description", "Level_Code", "Max_Grade", "Required_For_Certificate", "Show_On_Verification", "Verification_Order", "Is_Active", "Created_At", "Created_By", "Notes"],
  Assignment_Groups: ["Assignment_Group_Map_ID", "Assignment_ID", "Group_ID", "Is_Active", "Notes"],
  Assignment_Results: ["Assignment_Result_ID", "Assignment_ID", "Academy_Student_ID", "Enrollment_ID", "Group_ID", "Submission_Status", "Grade", "Graded_By", "Graded_At", "Notes", "Updated_At"],
  Certificate_Eligibility: ["Certificate_Eligibility_ID", "Academy_Student_ID", "Enrollment_ID", "Batch_ID", "Approval_Status", "Approved_By", "Approved_At", "Updated_At", "Notes"],
} as const;

class TasksGradesSchemaNotReadyError extends ServiceError {
  constructor() { super("TASKS_GRADES_SCHEMA_NOT_READY", "Tasks & Grades storage is not configured yet.", 409); }
}

export type TasksGradesSheets = {
  batches: Array<BatchRow & { _rowNumber: number }>;
  groups: Array<GroupRow & { _rowNumber: number }>;
  students: Array<StudentRow & { _rowNumber: number }>;
  enrollments: Array<EnrollmentRow & { _rowNumber: number }>;
  assignments: Array<AssignmentRow & { _rowNumber: number }>;
  assignmentGroups: Array<AssignmentGroupRow & { _rowNumber: number }>;
  assignmentResults: Array<AssignmentResultRow & { _rowNumber: number }>;
  certificateEligibility: Array<CertificateEligibilityRow & { _rowNumber: number }>;
};

type LoadResult = { schemaReady: true; sheets: TasksGradesSheets } | { schemaReady: false; partial: Pick<TasksGradesSheets, "batches" | "groups" | "students" | "enrollments"> };

function isMissingSheetError(error: unknown) {
  const candidate = error as { code?: number | string; response?: { status?: number; data?: { error?: { status?: string; message?: string } } }; message?: string };
  const status = Number(candidate?.response?.status ?? candidate?.code ?? 0);
  const message = String(candidate?.response?.data?.error?.message ?? candidate?.message ?? "").toLowerCase();
  return status === 400 || status === 404 || message.includes("unable to parse range") || message.includes("range") && message.includes("not found");
}

async function readBaseSheets() {
  const sheets = await readTasksGradesBundle(["Batches", "Groups", "Students", "Enrollments"]);
  return {
    batches: sheetRows<BatchRow>(sheets.Batches),
    groups: sheetRows<GroupRow>(sheets.Groups),
    students: sheetRows<StudentRow>(sheets.Students),
    enrollments: sheetRows<EnrollmentRow>(sheets.Enrollments),
  };
}

async function loadSheets(): Promise<LoadResult> {
  try {
    const data = await readTasksGradesBundle(["Batches", "Groups", "Students", "Enrollments", "Assignments", "Assignment_Groups", "Assignment_Results", "Certificate_Eligibility"]);
    verifyTasksGradesHeaders(data);
    const base = {
      batches: sheetRows<BatchRow>(data.Batches),
      groups: sheetRows<GroupRow>(data.Groups),
      students: sheetRows<StudentRow>(data.Students),
      enrollments: sheetRows<EnrollmentRow>(data.Enrollments),
    };
    const assignments = sheetRows<AssignmentRow>(data.Assignments);
    const assignmentGroups = sheetRows<AssignmentGroupRow>(data.Assignment_Groups);
    const assignmentResults = sheetRows<AssignmentResultRow>(data.Assignment_Results);
    const certificateEligibility = sheetRows<CertificateEligibilityRow>(data.Certificate_Eligibility);
    return { schemaReady: true, sheets: { ...base, assignments, assignmentGroups, assignmentResults, certificateEligibility } };
  } catch (error) {
    if (isRateLimitError(error)) throw new ServiceError("GOOGLE_SHEETS_RATE_LIMITED", "Google Sheets is temporarily busy. Please try again shortly.", 429);
    if (isMissingSheetError(error)) return { schemaReady: false, partial: await readBaseSheets() };
    throw error;
  }
}

type RawSheetData = Record<string, unknown[][]>;

export async function readTasksGradesBundle(tabs: string[]): Promise<RawSheetData> {
  const sheets = await getSheetsClient();
  const response = await withRateLimitBackoff(() => sheets.spreadsheets.values.batchGet({
    spreadsheetId: getSpreadsheetId(),
    ranges: tabs.map(tab => `'${tab}'!A:ZZ`),
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  }));
  return Object.fromEntries((response.data.valueRanges ?? []).map((range, index) => [tabs[index], range.values ?? []]));
}

async function withRateLimitBackoff<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === 3) break;
      await delay(2000 * (2 ** attempt) + Math.floor(Math.random() * 500));
    }
  }
  throw lastError;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown) {
  const candidate = error as { code?: number | string; status?: number; response?: { status?: number } };
  return Number(candidate?.response?.status ?? candidate?.status ?? candidate?.code ?? 0) === 429;
}

function sheetRows<T extends Record<string, string>>(values: unknown[][] = []) {
  const headers = (values[0] ?? []).map(value => String(value ?? "").trim());
  return values.slice(1).map((cells, index) => {
    const record: Record<string, string | number> = { _rowNumber: index + 2 };
    headers.forEach((header, column) => { record[header] = String(cells[column] ?? ""); });
    return record as T & { _rowNumber: number };
  }).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && value !== ""));
}

function verifyTasksGradesHeaders(data: RawSheetData) {
  for (const [tab, expected] of Object.entries(TASKS_GRADES_REQUIRED_HEADERS)) {
    const headers = (data[tab]?.[0] ?? []).map(header => String(header ?? "").trim());
    const missing = expected.filter((header, index) => headers[index] !== header);
    if (missing.length) {
      throw new ServiceError("TASKS_GRADES_SCHEMA_NOT_READY", `${tab} headers do not match the required Tasks & Grades schema.`, 409);
    }
  }
}

export function boolValue(value: unknown) {
  if (typeof value === "boolean") return value;
  return activeValue(String(value ?? ""));
}

export function text(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeStatus(value: string): SubmissionStatus {
  const normalized = text(value).toUpperCase();
  return SUBMISSION_STATUSES.includes(normalized as SubmissionStatus) ? normalized as SubmissionStatus : "NOT_SUBMITTED";
}

export function normalizeDecision(value: string): CertificateApprovalStatus {
  const normalized = text(value).toUpperCase();
  return CERTIFICATE_DECISIONS.includes(normalized as CertificateApprovalStatus) ? normalized as CertificateApprovalStatus : "PENDING";
}

export function mapAssignment(row: AssignmentRow, groupNamesById: Map<string, string>, groupsByAssignment: Map<string, string[]>): TasksGradesAssignment {
  const groupIds = groupsByAssignment.get(row.Assignment_ID) ?? [];
  return {
    assignmentId: row.Assignment_ID,
    batchId: row.Batch_ID,
    assignmentType: ASSIGNMENT_TYPES.includes(text(row.Assignment_Type) as AssignmentType) ? text(row.Assignment_Type) as AssignmentType : "TASK",
    title: row.Title,
    description: row.Description,
    levelCode: row.Level_Code,
    maxGrade: text(row.Max_Grade) ? numberValue(row.Max_Grade) : null,
    requiredForCertificate: boolValue(row.Required_For_Certificate),
    showOnVerification: boolValue(row.Show_On_Verification),
    verificationOrder: text(row.Verification_Order) ? numberValue(row.Verification_Order) : null,
    isActive: boolValue(row.Is_Active),
    createdAt: row.Created_At,
    createdBy: row.Created_By,
    notes: row.Notes,
    groupIds,
    groupNames: groupIds.map(id => groupNamesById.get(id) ?? id),
  };
}

export function activeGroupsByAssignment(rows: AssignmentGroupRow[]) {
  const result = new Map<string, string[]>();
  for (const row of rows) {
    if (!boolValue(row.Is_Active)) continue;
    const list = result.get(row.Assignment_ID) ?? [];
    if (!list.includes(row.Group_ID)) list.push(row.Group_ID);
    result.set(row.Assignment_ID, list);
  }
  return result;
}

function validateAssignmentInput(input: AssignmentInput, groups: GroupRow[]) {
  if (!input.batchId) throw new ServiceError("VALIDATION_ERROR", "Batch is required.", 400);
  if (!ASSIGNMENT_TYPES.includes(input.assignmentType)) throw new ServiceError("VALIDATION_ERROR", "Assignment type must be TASK or PROJECT.", 400);
  if (!text(input.title)) throw new ServiceError("VALIDATION_ERROR", "Assignment title is required.", 400);
  if (input.maxGrade !== null && input.maxGrade !== undefined && (!Number.isFinite(input.maxGrade) || input.maxGrade <= 0)) throw new ServiceError("INVALID_GRADE", "Max grade must be greater than 0.", 400);
  const verificationOrder = input.verificationOrder === null || input.verificationOrder === undefined || String(input.verificationOrder) === "" ? null : Number(input.verificationOrder);
  if (verificationOrder !== null && (!Number.isInteger(verificationOrder) || verificationOrder < 0)) throw new ServiceError("VALIDATION_ERROR", "Verification order must be a non-negative whole number.", 400);
  const groupIds = [...new Set(input.groupIds.map(text).filter(Boolean))];
  if (!groupIds.length) throw new ServiceError("VALIDATION_ERROR", "At least one Group is required.", 400);
  for (const groupId of groupIds) {
    const group = groups.find(row => row.Group_ID === groupId);
    if (!group || group.Batch_ID !== input.batchId) throw new ServiceError("VALIDATION_ERROR", "All selected Groups must belong to the selected Batch.", 400);
  }
  return { ...input, verificationOrder, title: text(input.title), description: text(input.description), levelCode: text(input.levelCode), notes: text(input.notes), groupIds };
}

function assertNoDuplicateActiveMappings(rows: AssignmentGroupRow[]) {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!boolValue(row.Is_Active)) continue;
    const key = `${row.Assignment_ID}:${row.Group_ID}`;
    if (seen.has(key)) throw new ServiceError("DUPLICATE_ASSIGNMENT_GROUP", "Duplicate active Assignment Group mapping exists.", 409);
    seen.add(key);
  }
}

function assertNoDuplicateResultPairs(rows: AssignmentResultRow[]) {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.Assignment_ID}:${row.Enrollment_ID}`;
    if (seen.has(key)) throw new ServiceError("ATTENDANCE_DATA_CONFLICT", "Duplicate Assignment Result rows exist for the same Assignment and Enrollment.", 409);
    seen.add(key);
  }
}

function assertNoDuplicateEligibilityRows(rows: CertificateEligibilityRow[]) {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.Enrollment_ID) continue;
    if (seen.has(row.Enrollment_ID)) throw new ServiceError("ATTENDANCE_DATA_CONFLICT", "Duplicate Certificate Eligibility rows exist for the same Enrollment.", 409);
    seen.add(row.Enrollment_ID);
  }
}

function validateResultInput(input: AssignmentResultInput, assignment: TasksGradesAssignment) {
  if (!SUBMISSION_STATUSES.includes(input.submissionStatus)) throw new ServiceError("VALIDATION_ERROR", "Submission status is invalid.", 400);
  const grade = input.grade === undefined || input.grade === null || String(input.grade) === "" ? null : Number(input.grade);
  if (grade !== null && (!Number.isFinite(grade) || grade < 0)) throw new ServiceError("INVALID_GRADE", "Grade must be a number greater than or equal to 0.", 400);
  if (grade !== null && assignment.maxGrade !== null && grade > assignment.maxGrade) throw new ServiceError("INVALID_GRADE", "Grade cannot exceed Max Grade.", 400);
  if (input.submissionStatus === "GRADED" && assignment.maxGrade !== null && grade === null) throw new ServiceError("INVALID_GRADE", "Grade is required when status is Graded.", 400);
  return { ...input, grade, notes: text(input.notes) };
}

export async function getTasksGradesData(params: { batchId?: string; assignmentId?: string } = {}): Promise<TasksGradesData> {
  const loaded = await loadSheets();
  const base = loaded.schemaReady ? loaded.sheets : loaded.partial;
  const batches = base.batches.map(row => ({ batchId: row.Batch_ID, batchName: row.Batch_Name, status: row.Status })).sort((left, right) => left.batchName.localeCompare(right.batchName) || left.batchId.localeCompare(right.batchId));
  const groups = base.groups.map(row => ({ groupId: row.Group_ID, groupName: row.Group_Name, batchId: row.Batch_ID, status: row.Status })).sort((left, right) => left.groupName.localeCompare(right.groupName) || left.groupId.localeCompare(right.groupId));
  if (!loaded.schemaReady) return { schemaReady: false, schemaMessage: "Tasks & Grades storage is not configured yet.", batches, groups, assignments: [], gradebookRows: [], readinessRows: [] };

  const groupNamesById = new Map(base.groups.map(row => [row.Group_ID, row.Group_Name]));
  const groupsByAssignment = activeGroupsByAssignment(loaded.sheets.assignmentGroups);
  const assignments = loaded.sheets.assignments.map(row => mapAssignment(row, groupNamesById, groupsByAssignment));
  const filteredAssignments = params.batchId ? assignments.filter(item => item.batchId === params.batchId) : assignments;
  const gradebookRows = params.assignmentId ? buildGradebookRows(loaded.sheets, assignments, params.assignmentId) : [];
  const readinessRows = params.batchId ? buildCertificateReadinessRows(loaded.sheets, assignments, params.batchId) : [];
  return { schemaReady: true, batches, groups, assignments: filteredAssignments, gradebookRows, readinessRows };
}

export function buildGradebookRows(sheets: TasksGradesSheets, assignments: TasksGradesAssignment[], assignmentId: string): GradebookRow[] {
  const assignment = assignments.find(item => item.assignmentId === assignmentId);
  if (!assignment) return [];
  const mappedGroups = new Set(assignment.groupIds);
  const studentsById = new Map(sheets.students.map(row => [row.Academy_Student_ID, studentDto(row)]));
  const groupsById = new Map(sheets.groups.map(row => [row.Group_ID, row]));
  const resultByEnrollment = new Map(sheets.assignmentResults.filter(row => row.Assignment_ID === assignmentId).map(row => [row.Enrollment_ID, row]));
  const seen = new Set<string>();
  return sheets.enrollments.flatMap(row => {
    const enrollment = enrollmentDto(row);
    if (seen.has(enrollment.enrollmentId) || !mappedGroups.has(enrollment.groupId)) return [];
    seen.add(enrollment.enrollmentId);
    const student = studentsById.get(enrollment.academyStudentId);
    const result = resultByEnrollment.get(enrollment.enrollmentId);
    return [{
      enrollmentId: enrollment.enrollmentId,
      academyStudentId: enrollment.academyStudentId,
      studentName: student?.studentName ?? "Unknown Student",
      studentEmail: (student?.email ?? "").trim().toLowerCase(),
      universityStudentId: student?.studentId ?? "",
      university: student?.university ?? enrollment.programScope,
      groupId: enrollment.groupId,
      groupName: groupsById.get(enrollment.groupId)?.Group_Name ?? enrollment.groupId,
      submissionStatus: result ? normalizeStatus(result.Submission_Status) : "NOT_SUBMITTED",
      grade: result && text(result.Grade) ? numberValue(result.Grade) : null,
      maxGrade: assignment.maxGrade,
      notes: result?.Notes ?? "",
      lastUpdated: result?.Updated_At ?? "",
    }];
  });
}

export function buildCertificateReadinessRows(sheets: TasksGradesSheets, assignments: TasksGradesAssignment[], batchId: string): CertificateReadinessRow[] {
  const requiredAssignments = assignments.filter(assignment => assignment.batchId === batchId && assignment.isActive && assignment.requiredForCertificate);
  const studentsById = new Map(sheets.students.map(row => [row.Academy_Student_ID, studentDto(row)]));
  const groupsById = new Map(sheets.groups.map(row => [row.Group_ID, row]));
  const resultsByKey = new Map(sheets.assignmentResults.map(row => [`${row.Assignment_ID}:${row.Enrollment_ID}`, row]));
  const decisionsByEnrollment = new Map(sheets.certificateEligibility.map(row => [row.Enrollment_ID, row]));
  return sheets.enrollments.filter(row => row.Group_ID && row.Enrollment_Status.toLowerCase() !== "cancelled" && (!batchId || groupsById.get(row.Group_ID)?.Batch_ID === batchId)).map(row => {
    const enrollment = enrollmentDto(row);
    const student = studentsById.get(enrollment.academyStudentId);
    const applicable = requiredAssignments.filter(assignment => assignment.groupIds.includes(enrollment.groupId));
    const details = applicable.map(assignment => {
      const result = resultsByKey.get(`${assignment.assignmentId}:${enrollment.enrollmentId}`);
      return { assignmentId: assignment.assignmentId, title: assignment.title, assignmentType: assignment.assignmentType, submissionStatus: result ? normalizeStatus(result.Submission_Status) : "NOT_SUBMITTED", grade: result && text(result.Grade) ? numberValue(result.Grade) : null, maxGrade: assignment.maxGrade } satisfies CertificateReadinessAssignmentEntry;
    });
    const tasks = details.filter(item => item.assignmentType === "TASK");
    const projects = details.filter(item => item.assignmentType === "PROJECT");
    const completed = (item: CertificateReadinessAssignmentEntry) => item.submissionStatus === "SUBMITTED" || item.submissionStatus === "GRADED";
    const missing = details.filter(item => !completed(item)).length;
    const graded = details.filter(item => item.submissionStatus === "GRADED" && item.grade !== null && item.maxGrade !== null && item.maxGrade > 0);
    const earned = graded.reduce((sum, item) => sum + (item.grade ?? 0), 0);
    const possible = graded.reduce((sum, item) => sum + (item.maxGrade ?? 0), 0);
    return {
      enrollmentId: enrollment.enrollmentId,
      academyStudentId: enrollment.academyStudentId,
      studentName: student?.studentName ?? "Unknown Student",
      universityStudentId: student?.studentId ?? "",
      phone: student?.phone ?? "",
      university: student?.university ?? enrollment.programScope,
      college: student?.college ?? "",
      groupId: enrollment.groupId,
      groupName: groupsById.get(enrollment.groupId)?.Group_Name ?? enrollment.groupId,
      track: enrollment.track,
      creditHours: enrollment.exactHours,
      deliveryMode: enrollment.deliveryMode,
      requiredTasks: tasks.length,
      submittedTasks: tasks.filter(completed).length,
      requiredProjects: projects.length,
      submittedProjects: projects.filter(completed).length,
      missingRequiredAssignments: missing,
      gradedAssignments: graded.length,
      averageGradePercentage: possible > 0 ? Math.round((earned / possible) * 1000) / 10 : null,
      automaticReadiness: details.length === 0 ? "NOT_CONFIGURED" : missing === 0 ? "READY" : "NOT_READY",
      certificateDecision: normalizeDecision(decisionsByEnrollment.get(enrollment.enrollmentId)?.Approval_Status ?? ""),
      requiredTaskDetails: tasks,
      requiredProjectDetails: projects,
    };
  });
}

export function getCompletedTasksProjectsForEnrollment(sheets: TasksGradesSheets, assignments: TasksGradesAssignment[], enrollmentId: string) {
  const enrollment = sheets.enrollments.find(row => row.Enrollment_ID === enrollmentId);
  if (!enrollment) throw new ServiceError("ENROLLMENT_NOT_FOUND", "Enrollment was not found.", 404);
  const resultsByKey = new Map(sheets.assignmentResults.map(row => [`${row.Assignment_ID}:${row.Enrollment_ID}`, row]));
  return assignments.filter(assignment => assignment.isActive && assignment.groupIds.includes(enrollment.Group_ID)).flatMap(assignment => {
    const result = resultsByKey.get(`${assignment.assignmentId}:${enrollmentId}`);
    const status = result ? normalizeStatus(result.Submission_Status) : "NOT_SUBMITTED";
    if (status !== "SUBMITTED" && status !== "GRADED") return [];
    return [{ assignmentId: assignment.assignmentId, title: assignment.title, assignmentType: assignment.assignmentType, submissionStatus: status, grade: result && text(result.Grade) ? numberValue(result.Grade) : null, maxGrade: assignment.maxGrade }];
  });
}

async function loadReadySheets() {
  const loaded = await loadSheets();
  if (!loaded.schemaReady) throw new TasksGradesSchemaNotReadyError();
  return loaded.sheets;
}

export async function saveAssignment(input: AssignmentInput, user: SafeUser) {
  const sheets = await loadReadySheets();
  assertNoDuplicateActiveMappings(sheets.assignmentGroups);
  const normalized = validateAssignmentInput(input, sheets.groups);
  const now = new Date().toISOString();
  const existing = normalized.assignmentId ? sheets.assignments.find(row => row.Assignment_ID === normalized.assignmentId) : undefined;
  if (normalized.assignmentId && !existing) throw new ServiceError("ASSIGNMENT_NOT_FOUND", "Assignment was not found.", 404);
  const assignmentId = existing?.Assignment_ID ?? nextId(sheets.assignments.map(row => row.Assignment_ID), /^ASG_(\d+)$/, sequence => `ASG_${String(sequence).padStart(5, "0")}`);
  const record: AssignmentRow = {
    Assignment_ID: assignmentId,
    Batch_ID: normalized.batchId,
    Assignment_Type: normalized.assignmentType,
    Title: normalized.title,
    Description: normalized.description ?? "",
    Level_Code: normalized.levelCode ?? "",
    Max_Grade: normalized.maxGrade === null || normalized.maxGrade === undefined ? "" : String(normalized.maxGrade),
    Required_For_Certificate: String(normalized.requiredForCertificate).toUpperCase(),
    Show_On_Verification: String(normalized.showOnVerification).toUpperCase(),
    Verification_Order: normalized.verificationOrder === null || normalized.verificationOrder === undefined ? "" : String(normalized.verificationOrder),
    Is_Active: String(normalized.isActive).toUpperCase(),
    Created_At: existing?.Created_At || now,
    Created_By: existing?.Created_By || user.userId,
    Notes: normalized.notes ?? "",
  };
  if (existing) await updateRecord("Assignments", existing._rowNumber, record);
  else await appendRecordToDataRegion("Assignments", record);
  await replaceAssignmentGroups(assignmentId, normalized.groupIds, sheets.assignmentGroups);
  return { assignmentId };
}

async function replaceAssignmentGroups(assignmentId: string, groupIds: string[], existingRows: Array<AssignmentGroupRow & { _rowNumber: number }>) {
  const updates = existingRows.filter(row => row.Assignment_ID === assignmentId).map(row => ({ tab: "Assignment_Groups" as const, rowNumber: row._rowNumber, patch: { Is_Active: groupIds.includes(row.Group_ID) ? "TRUE" : "FALSE" } }));
  const existingGroupIds = new Set(existingRows.filter(row => row.Assignment_ID === assignmentId).map(row => row.Group_ID));
  let sequenceIds = existingRows.map(row => row.Assignment_Group_Map_ID);
  const appends = groupIds.filter(groupId => !existingGroupIds.has(groupId)).map(groupId => {
    const id = nextId(sequenceIds, /^ASGM_(\d+)$/, sequence => `ASGM_${String(sequence).padStart(5, "0")}`);
    sequenceIds = [...sequenceIds, id];
    return {
      tab: "Assignment_Groups" as const,
      record: {
      Assignment_Group_Map_ID: id,
      Assignment_ID: assignmentId,
      Group_ID: groupId,
      Is_Active: "TRUE",
      Notes: "",
    },
    };
  });
  await atomicSheetMutation({ appends, updates });
}

export async function saveAssignmentResults(input: { assignmentId: string; results: AssignmentResultInput[] }, user: SafeUser) {
  const sheets = await loadReadySheets();
  assertNoDuplicateResultPairs(sheets.assignmentResults);
  const groupNamesById = new Map(sheets.groups.map(row => [row.Group_ID, row.Group_Name]));
  const assignments = sheets.assignments.map(row => mapAssignment(row, groupNamesById, activeGroupsByAssignment(sheets.assignmentGroups)));
  const assignment = assignments.find(item => item.assignmentId === input.assignmentId);
  if (!assignment) throw new ServiceError("ASSIGNMENT_NOT_FOUND", "Assignment was not found.", 404);
  const eligible = new Map(buildGradebookRows(sheets, assignments, input.assignmentId).map(row => [row.enrollmentId, row]));
  const byEnrollment = new Map<string, AssignmentResultInput>();
  for (const result of input.results) byEnrollment.set(result.enrollmentId, result);
  const now = new Date().toISOString();
  const appends: Array<{ tab: "Assignment_Results"; record: AssignmentResultRow }> = [];
  const updates: Array<{ tab: "Assignment_Results"; rowNumber: number; patch: Record<string, string | number> }> = [];
  let sequenceIds = sheets.assignmentResults.map(row => row.Assignment_Result_ID);
  for (const raw of byEnrollment.values()) {
    const row = eligible.get(raw.enrollmentId);
    if (!row) throw new ServiceError("STUDENT_NOT_ELIGIBLE_FOR_ASSIGNMENT", "Student is not eligible for this assignment.", 409);
    const value = validateResultInput(raw, assignment);
    const existing = sheets.assignmentResults.find(result => result.Assignment_ID === input.assignmentId && result.Enrollment_ID === value.enrollmentId);
    const patch = {
      Assignment_ID: input.assignmentId,
      Academy_Student_ID: row.academyStudentId,
      Enrollment_ID: row.enrollmentId,
      Group_ID: row.groupId,
      Submission_Status: value.submissionStatus,
      Grade: value.grade === null ? "" : String(value.grade),
      Graded_By: value.submissionStatus === "GRADED" ? user.userId : existing?.Graded_By ?? "",
      Graded_At: value.submissionStatus === "GRADED" ? now : existing?.Graded_At ?? "",
      Notes: value.notes ?? "",
      Updated_At: now,
    };
    if (existing) updates.push({ tab: "Assignment_Results", rowNumber: existing._rowNumber, patch });
    else {
      const id = nextId(sequenceIds, /^ASGR_(\d+)$/, sequence => `ASGR_${String(sequence).padStart(5, "0")}`);
      sequenceIds = [...sequenceIds, id];
      appends.push({ tab: "Assignment_Results", record: { Assignment_Result_ID: id, ...patch } });
    }
  }
  await atomicSheetMutation({ appends, updates });
  return { updated: updates.length, created: appends.length };
}

export async function setCertificateDecision(input: CertificateDecisionInput, user: SafeUser) {
  const result = await setCertificateDecisionsBulk({ changes: [input] }, user);
  return { readiness: result.results[0]?.readiness ?? "NOT_CONFIGURED", decision: input.decision };
}

export async function setCertificateDecisionsBulk(input: { changes: CertificateDecisionChangeInput[] }, user: SafeUser) {
  const changes = input.changes.map(change => ({ enrollmentId: text(change.enrollmentId), decision: change.decision, notes: text(change.notes) })).filter(change => change.enrollmentId);
  if (!changes.length) throw new ServiceError("VALIDATION_ERROR", "At least one certificate decision change is required.", 400);
  for (const change of changes) if (!CERTIFICATE_DECISIONS.includes(change.decision)) throw new ServiceError("VALIDATION_ERROR", "Certificate decision is invalid.", 400);
  const duplicateChanges = new Set<string>();
  for (const change of changes) {
    if (duplicateChanges.has(change.enrollmentId)) throw new ServiceError("VALIDATION_ERROR", "Duplicate Enrollment decision changes are not allowed.", 400);
    duplicateChanges.add(change.enrollmentId);
  }
  const sheets = await loadReadySheets();
  assertNoDuplicateEligibilityRows(sheets.certificateEligibility);
  const groupNamesById = new Map(sheets.groups.map(row => [row.Group_ID, row.Group_Name]));
  const assignments = sheets.assignments.map(row => mapAssignment(row, groupNamesById, activeGroupsByAssignment(sheets.assignmentGroups)));
  const enrollmentById = new Map(sheets.enrollments.map(row => [row.Enrollment_ID, row]));
  const groupById = new Map(sheets.groups.map(row => [row.Group_ID, row]));
  const eligibilityByEnrollmentId = new Map(sheets.certificateEligibility.map(row => [row.Enrollment_ID, row]));
  const updates: Array<{ tab: "Certificate_Eligibility"; rowNumber: number; patch: Partial<CertificateEligibilityRow> }> = [];
  const appends: Array<{ tab: "Certificate_Eligibility"; record: CertificateEligibilityRow }> = [];
  let sequenceIds = sheets.certificateEligibility.map(row => row.Certificate_Eligibility_ID);
  const now = new Date().toISOString();
  const results: Array<{ enrollmentId: string; status: "saved" | "unchanged"; decision: CertificateApprovalStatus; readiness: string }> = [];
  for (const change of changes) {
    const enrollment = enrollmentById.get(change.enrollmentId);
    if (!enrollment) throw new ServiceError("ENROLLMENT_NOT_FOUND", "Enrollment was not found.", 404);
    const batchId = groupById.get(enrollment.Group_ID)?.Batch_ID;
    if (!batchId) throw new ServiceError("VALIDATION_ERROR", "Enrollment group is not mapped to a Batch.", 400);
    const readiness = buildCertificateReadinessRows(sheets, assignments, batchId).find(row => row.enrollmentId === change.enrollmentId);
    if (!readiness) throw new ServiceError("ENROLLMENT_NOT_FOUND", "Enrollment readiness could not be calculated.", 404);
    const existing = eligibilityByEnrollmentId.get(change.enrollmentId);
    const currentDecision = existing?.Approval_Status ? normalizeDecision(existing.Approval_Status) : "PENDING";
    if (currentDecision === change.decision && text(existing?.Notes) === change.notes) {
      results.push({ enrollmentId: change.enrollmentId, status: "unchanged", decision: change.decision, readiness: readiness.automaticReadiness });
      continue;
    }
    if (!existing && change.decision === "PENDING" && !change.notes) {
      results.push({ enrollmentId: change.enrollmentId, status: "unchanged", decision: change.decision, readiness: readiness.automaticReadiness });
      continue;
    }
    const patch = {
      Academy_Student_ID: readiness.academyStudentId,
      Enrollment_ID: readiness.enrollmentId,
      Batch_ID: batchId,
      Approval_Status: change.decision,
      Approved_By: change.decision === "APPROVED" ? user.userId : existing?.Approved_By ?? "",
      Approved_At: change.decision === "APPROVED" ? now : existing?.Approved_At ?? "",
      Updated_At: now,
      Notes: change.notes,
    };
    if (existing) updates.push({ tab: "Certificate_Eligibility", rowNumber: existing._rowNumber, patch });
    else {
      const id = nextId(sequenceIds, /^CERTEL_(\d+)$/, sequence => `CERTEL_${String(sequence).padStart(5, "0")}`);
      sequenceIds = [...sequenceIds, id];
      appends.push({ tab: "Certificate_Eligibility", record: { Certificate_Eligibility_ID: id, ...patch } });
    }
    results.push({ enrollmentId: change.enrollmentId, status: "saved", decision: change.decision, readiness: readiness.automaticReadiness });
  }
  if (updates.length || appends.length) await atomicSheetMutation({ updates, appends });
  return { saved: updates.length + appends.length, unchanged: results.filter(row => row.status === "unchanged").length, results };
}
