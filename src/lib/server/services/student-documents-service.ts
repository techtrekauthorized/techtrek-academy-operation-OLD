import "server-only";
import { appendRecordsToDataRegions, atomicSheetMutation, getHeaders, readSheet, readSheetDataRegion } from "@/lib/server/google/sheets";
import { downloadDriveFile } from "@/lib/server/google/drive";
import type { SafeUser } from "@/lib/server/auth/types";
import type { EnrollmentRow, SheetRow, StudentRow } from "@/lib/server/types";
import type { BatchRow, GroupRow } from "@/types/operations";
import type { StudentDocumentBulkValidationRow, StudentDocumentExistingRow, StudentDocumentSelectedPublishInput, StudentDocumentSelectedPublishResult, StudentDocumentsExistingData, StudentDocumentsFormData, StudentDocumentsQueueData, StudentPortalDocumentPlayback, StudentPortalDocumentSummary } from "@/types/student-documents";
import { extractGoogleDriveFileId, googleDrivePreviewUrl } from "@/lib/drive-links";
import { ServiceError } from "./errors";
import { nextId } from "./id-service";

export type StudentDocumentRow = Record<string, string> & {
  Student_Document_ID: string;
  Academy_Student_ID: string;
  Enrollment_ID: string;
  Document_Type: string;
  Document_Title: string;
  Document_Description: string;
  File_Provider: string;
  File_URL: string;
  File_ID: string;
  File_Name: string;
  Publish_Status: string;
  Available_From: string;
  Available_To: string;
  Is_Active: string;
  Published_At: string;
  Published_By: string;
  Created_At: string;
  Created_By: string;
  Notes: string;
};

type ResolvedStudentPortalDocument = StudentPortalDocumentPlayback & {
  fileId: string;
};

const DOCUMENT_HEADERS = ["Student_Document_ID", "Academy_Student_ID", "Enrollment_ID", "Document_Type", "Document_Title", "Document_Description", "File_Provider", "File_URL", "File_ID", "File_Name", "Publish_Status", "Available_From", "Available_To", "Is_Active", "Published_At", "Published_By", "Created_At", "Created_By", "Notes"];
const TRAINING_FORM_TITLE = "Training Evaluation Form";
const TRAINING_FORM_DESCRIPTION = "Your official training evaluation form is available below. You can view or download the PDF and submit it to your university as required.";

export async function getStudentDocumentsFormData(): Promise<StudentDocumentsFormData> {
  await validateStudentDocumentHeaders();
  const [batches, groups, enrollments] = await Promise.all([readSheetDataRegion<BatchRow>("Batches"), readSheetDataRegion<GroupRow>("Groups"), readSheet<EnrollmentRow>("Enrollments")]);
  return {
    batches: batches.map(row => ({ id: row.Batch_ID, name: row.Batch_Name, location: String(row.Batch_Location ?? "") })).sort((a, b) => a.name.localeCompare(b.name)),
    groups: groups.map(row => ({ id: row.Group_ID, name: row.Group_Name, batchId: row.Batch_ID })).sort((a, b) => a.name.localeCompare(b.name)),
    programScopes: uniqueDisplayValues(enrollments.map(row => row.University)),
  };
}

export async function getStudentDocumentsQueueData(programScope: string): Promise<StudentDocumentsQueueData> {
  await validateStudentDocumentHeaders();
  const selectedProgramScope = clean(programScope);
  if (!selectedProgramScope) throw new ServiceError("VALIDATION_FAILED", "Program Scope is required.", 400);
  const [students, enrollments, groups, batches, documents] = await Promise.all([
    readSheet<StudentRow>("Students"),
    readSheet<EnrollmentRow>("Enrollments"),
    readSheetDataRegion<GroupRow>("Groups"),
    readSheetDataRegion<BatchRow>("Batches"),
    readSheetDataRegion<StudentDocumentRow>("Student_Documents"),
  ]);
  const studentsByAcademyId = new Map(students.map(row => [clean(row.Academy_Student_ID), row]));
  const groupsById = new Map(groups.map(row => [clean(row.Group_ID), row]));
  const batchesById = new Map(batches.map(row => [clean(row.Batch_ID), row]));
  const activeTrainingForms = activeTrainingFormsByEnrollment(documents);
  const programScopeKey = normalizeProgramScope(selectedProgramScope);
  const rows = enrollments.flatMap(enrollment => {
    const student = studentsByAcademyId.get(clean(enrollment.Academy_Student_ID));
    if (!student || normalizeProgramScope(enrollment.University) !== programScopeKey) return [];
    const group = groupsById.get(clean(enrollment.Group_ID));
    const batch = group ? batchesById.get(clean(group.Batch_ID)) : undefined;
    const existing = activeTrainingForms.get(clean(enrollment.Enrollment_ID));
    return [{
      academyStudentId: student.Academy_Student_ID,
      enrollmentId: enrollment.Enrollment_ID,
      studentName: student.Student_Name,
      universityStudentId: student.Student_ID,
      programScope: enrollment.University,
      university: student.University,
      track: enrollment.Track,
      batchId: group?.Batch_ID ?? "",
      batchName: batch?.Batch_Name ?? group?.Batch_ID ?? "",
      groupId: enrollment.Group_ID,
      groupName: group?.Group_Name ?? enrollment.Group_ID,
      creditHours: enrollment["Credit Hours"],
      deliveryMode: enrollment.Delivery_Mode,
      existingStatus: existing ? normalizePublishStatus(existing.Publish_Status) === "PUBLISHED" ? "PUBLISHED" as const : "ALREADY_EXISTS" as const : "NONE" as const,
      existingDocumentId: existing?.Student_Document_ID ?? "",
    }];
  }).sort((left, right) => left.studentName.localeCompare(right.studentName) || left.universityStudentId.localeCompare(right.universityStudentId) || left.enrollmentId.localeCompare(right.enrollmentId));
  return { programScope: selectedProgramScope, rows };
}

export async function getStudentDocumentsExistingData(): Promise<StudentDocumentsExistingData> {
  await validateStudentDocumentHeaders();
  const [documents, students, enrollments, groups, batches] = await Promise.all([
    readSheetDataRegion<StudentDocumentRow>("Student_Documents"),
    readSheet<StudentRow>("Students"),
    readSheet<EnrollmentRow>("Enrollments"),
    readSheetDataRegion<GroupRow>("Groups"),
    readSheetDataRegion<BatchRow>("Batches"),
  ]);
  const studentsById = new Map(students.map(row => [clean(row.Academy_Student_ID), row]));
  const enrollmentsById = new Map(enrollments.map(row => [clean(row.Enrollment_ID), row]));
  const groupsById = new Map(groups.map(row => [clean(row.Group_ID), row]));
  const batchesById = new Map(batches.map(row => [clean(row.Batch_ID), row]));
  return {
    documents: documents.map(row => {
      const enrollment = enrollmentsById.get(clean(row.Enrollment_ID));
      const student = studentsById.get(clean(row.Academy_Student_ID));
      const group = enrollment ? groupsById.get(clean(enrollment.Group_ID)) : undefined;
      const batch = group ? batchesById.get(clean(group.Batch_ID)) : undefined;
      return {
        studentDocumentId: row.Student_Document_ID,
        academyStudentId: row.Academy_Student_ID,
        enrollmentId: row.Enrollment_ID,
        universityStudentId: student?.Student_ID ?? "",
        studentName: student?.Student_Name ?? "Unknown Student",
        programScope: enrollment?.University ?? "",
        university: student?.University ?? enrollment?.University ?? "",
        batchId: group?.Batch_ID ?? "",
        batchName: batch?.Batch_Name ?? group?.Batch_ID ?? "",
        groupId: enrollment?.Group_ID ?? "",
        groupName: group?.Group_Name ?? enrollment?.Group_ID ?? "",
        track: enrollment?.Track ?? "",
        creditHours: enrollment?.["Credit Hours"] ?? "",
        deliveryMode: enrollment?.Delivery_Mode ?? "",
        documentType: "TRAINING_FORM",
        documentTypeLabel: documentTypeLabel(row.Document_Type),
        documentTitle: row.Document_Title,
        publishStatus: normalizePublishStatus(row.Publish_Status),
        isActive: activeValue(row.Is_Active),
        publishedAt: row.Published_At,
        fileStatus: row.File_ID ? "Ready" : "Missing File",
        fileId: row.File_ID,
        fileName: row.File_Name,
      } satisfies StudentDocumentExistingRow;
    }).sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || left.studentName.localeCompare(right.studentName)),
  };
}

export async function validateStudentDocumentBulk(input: { batchId: string; documentType: "TRAINING_FORM"; lines: string }) {
  await validateStudentDocumentHeaders();
  const rows = parseBulkLines(input.lines);
  const resolved = await resolveBulkRows(input.batchId, rows);
  return { total: rows.length, rows: resolved, summary: summarizeValidation(resolved) };
}

export async function publishStudentDocumentsBulk(input: { batchId: string; documentType: "TRAINING_FORM"; lines: string }, user: SafeUser) {
  await validateStudentDocumentHeaders();
  const rows = parseBulkLines(input.lines);
  const resolved = await resolveBulkRows(input.batchId, rows);
  const ready = resolved.filter(row => row.status === "READY");
  if (!ready.length) throw new ServiceError("NO_READY_DOCUMENTS", "No valid documents are ready to publish.", 400);
  const existing = await readSheetDataRegion<StudentDocumentRow>("Student_Documents");
  let ids = existing.map(row => row.Student_Document_ID);
  const now = new Date().toISOString();
  const appends = ready.map(row => {
    const id = nextStudentDocumentId(ids);
    ids = [...ids, id];
    return {
      tab: "Student_Documents" as const,
      record: {
        Student_Document_ID: id,
        Academy_Student_ID: row.academyStudentId,
        Enrollment_ID: row.enrollmentId,
        Document_Type: "TRAINING_FORM",
        Document_Title: TRAINING_FORM_TITLE,
        Document_Description: TRAINING_FORM_DESCRIPTION,
        File_Provider: "GoogleDrive",
        File_URL: row.fileUrl,
        File_ID: row.fileId,
        File_Name: row.fileName || `Training_Form_${row.universityStudentId}.pdf`,
        Publish_Status: "PUBLISHED",
        Available_From: "",
        Available_To: "",
        Is_Active: "TRUE",
        Published_At: now,
        Published_By: user.userId,
        Created_At: now,
        Created_By: user.userId,
        Notes: "",
      },
    };
  });
  await appendRecordsToDataRegions(appends);
  return { total: rows.length, published: appends.length, rows: resolved.map(row => row.status === "READY" ? { ...row, status: "PUBLISHED" as const, message: "Published" } : row), summary: summarizeValidation(resolved) };
}

export async function publishSelectedStudentDocuments(input: { programScope: string; documents: StudentDocumentSelectedPublishInput[] }, user: SafeUser): Promise<StudentDocumentSelectedPublishResult> {
  await validateStudentDocumentHeaders();
  const selectedProgramScope = clean(input.programScope);
  if (!selectedProgramScope) throw new ServiceError("VALIDATION_FAILED", "Program Scope is required.", 400);
  const programScopeKey = normalizeProgramScope(selectedProgramScope);
  const selected = input.documents.map(item => ({ enrollmentId: clean(item.enrollmentId), driveUrl: clean(item.driveUrl) })).filter(item => item.enrollmentId || item.driveUrl);
  if (!selected.length) throw new ServiceError("NO_SELECTED_DOCUMENTS", "Select at least one ready document to publish.", 400);
  const [students, enrollments, documents] = await Promise.all([
    readSheet<StudentRow>("Students"),
    readSheet<EnrollmentRow>("Enrollments"),
    readSheetDataRegion<StudentDocumentRow>("Student_Documents"),
  ]);
  const studentsByAcademyId = new Map(students.map(row => [clean(row.Academy_Student_ID), row]));
  const enrollmentsById = new Map(enrollments.map(row => [clean(row.Enrollment_ID), row]));
  const activeTrainingForms = activeTrainingFormsByEnrollment(documents);
  const selectedCounts = new Map<string, number>();
  for (const item of selected) selectedCounts.set(item.enrollmentId, (selectedCounts.get(item.enrollmentId) ?? 0) + 1);

  let ids = documents.map(row => row.Student_Document_ID);
  const now = new Date().toISOString();
  const appends: Array<{ tab: "Student_Documents"; record: Record<string, string> }> = [];
  const results = selected.map(item => {
    const enrollment = enrollmentsById.get(item.enrollmentId);
    if (!enrollment) return publishResult(item.enrollmentId, "", "", "", "ENROLLMENT_NOT_FOUND", "Enrollment was not found.");
    if (normalizeProgramScope(enrollment.University) !== programScopeKey) return publishResult(item.enrollmentId, enrollment.Academy_Student_ID, "", "", "ENROLLMENT_NOT_FOUND", "Enrollment does not belong to the selected Program Scope.");
    const student = studentsByAcademyId.get(clean(enrollment.Academy_Student_ID));
    if (!student) return publishResult(item.enrollmentId, enrollment.Academy_Student_ID, "", "", "STUDENT_NOT_FOUND", "Student was not found.");
    if ((selectedCounts.get(item.enrollmentId) ?? 0) > 1) return publishResult(item.enrollmentId, student.Academy_Student_ID, student.Student_Name, student.Student_ID, "FAILED", "This Enrollment was selected more than once.");
    if (activeTrainingForms.has(item.enrollmentId)) return publishResult(item.enrollmentId, student.Academy_Student_ID, student.Student_Name, student.Student_ID, "ALREADY_PUBLISHED", "This Enrollment already has an active Training Form.");
    const fileId = extractGoogleDriveFileId(item.driveUrl);
    if (!fileId) return publishResult(item.enrollmentId, student.Academy_Student_ID, student.Student_Name, student.Student_ID, "INVALID_LINK", "Google Drive PDF link is invalid.");
    const id = nextStudentDocumentId(ids);
    ids = [...ids, id];
    appends.push({
      tab: "Student_Documents",
      record: {
        Student_Document_ID: id,
        Academy_Student_ID: student.Academy_Student_ID,
        Enrollment_ID: enrollment.Enrollment_ID,
        Document_Type: "TRAINING_FORM",
        Document_Title: TRAINING_FORM_TITLE,
        Document_Description: TRAINING_FORM_DESCRIPTION,
        File_Provider: "GoogleDrive",
        File_URL: item.driveUrl,
        File_ID: fileId,
        File_Name: `Training_Form_${student.Student_ID}.pdf`,
        Publish_Status: "PUBLISHED",
        Available_From: "",
        Available_To: "",
        Is_Active: "TRUE",
        Published_At: now,
        Published_By: user.userId,
        Created_At: now,
        Created_By: user.userId,
        Notes: "",
      },
    });
    return publishResult(item.enrollmentId, student.Academy_Student_ID, student.Student_Name, student.Student_ID, "PUBLISHED", "Published.", id);
  });
  if (appends.length) await appendRecordsToDataRegions(appends);
  return { total: selected.length, published: appends.length, rows: results };
}

export async function setStudentDocumentPublishStatus(input: { studentDocumentId: string; publishStatus: "PUBLISHED" | "HIDDEN" | "DRAFT"; isActive?: boolean }, user: SafeUser) {
  await validateStudentDocumentHeaders();
  const rows = await readSheetDataRegion<StudentDocumentRow>("Student_Documents");
  const row = rows.find(item => item.Student_Document_ID === input.studentDocumentId);
  if (!row) throw new ServiceError("DOCUMENT_NOT_FOUND", "Student document was not found.", 404);
  const now = new Date().toISOString();
  await atomicSheetMutation({
    updates: [{
      tab: "Student_Documents",
      rowNumber: row._rowNumber,
      patch: {
        Publish_Status: input.publishStatus,
        Is_Active: input.isActive === undefined ? row.Is_Active : input.isActive ? "TRUE" : "FALSE",
        Published_At: input.publishStatus === "PUBLISHED" ? (row.Published_At || now) : row.Published_At,
        Published_By: input.publishStatus === "PUBLISHED" ? (row.Published_By || user.userId) : row.Published_By,
      },
    }],
  });
  return { message: input.publishStatus === "PUBLISHED" ? "Document published." : "Document unpublished." };
}

export async function getStudentDocumentFileForPortal(academyStudentId: string, studentId: string, documentId: string) {
  const document = await resolveStudentPortalDocument(academyStudentId, studentId, documentId);
  if (!document) throw new ServiceError("STUDENT_DOCUMENT_NOT_FOUND", "Document was not found.", 404);
  return { fileId: document.fileId, filename: document.filename };
}

export async function downloadStudentDocumentPdf(academyStudentId: string, studentId: string, documentId: string) {
  const file = await getStudentDocumentFileForPortal(academyStudentId, studentId, documentId);
  return { bytes: await downloadDriveFile(file.fileId), filename: file.filename };
}

export async function listStudentPortalDocuments(academyStudentId: string, studentId: string): Promise<StudentPortalDocumentSummary[]> {
  const [student, enrollments, documents] = await loadStudentPortalDocumentTables(academyStudentId, studentId);
  const enrollmentIds = new Set(enrollments.map(row => row.Enrollment_ID.trim()).filter(Boolean));
  return documents.filter(row => portalDocumentAllowed(row, academyStudentId, enrollmentIds)).map(row => portalDocumentSummary(row, student.Student_ID)).sort((left, right) => left.documentTitle.localeCompare(right.documentTitle) || left.studentDocumentId.localeCompare(right.studentDocumentId));
}

export async function getStudentPortalDocument(academyStudentId: string, studentId: string, documentId: string): Promise<StudentPortalDocumentPlayback | null> {
  const document = await resolveStudentPortalDocument(academyStudentId, studentId, documentId);
  if (!document) return null;
  return {
    studentDocumentId: document.studentDocumentId,
    documentType: document.documentType,
    documentTypeLabel: document.documentTypeLabel,
    documentTitle: document.documentTitle,
    documentDescription: document.documentDescription,
    previewUrl: document.previewUrl,
    downloadHref: document.downloadHref,
    viewHref: document.viewHref,
    filename: document.filename,
    studentId: document.studentId,
    studentName: document.studentName,
  };
}

async function resolveStudentPortalDocument(academyStudentId: string, studentId: string, documentId: string): Promise<ResolvedStudentPortalDocument | null> {
  const [student, enrollments, documents] = await loadStudentPortalDocumentTables(academyStudentId, studentId);
  const enrollmentIds = new Set(enrollments.map(row => row.Enrollment_ID.trim()).filter(Boolean));
  const row = documents.find(item => item.Student_Document_ID.trim() === documentId && portalDocumentAllowed(item, academyStudentId, enrollmentIds));
  if (!row) return null;
  return { ...portalDocumentSummary(row, student.Student_ID), studentId: student.Student_ID, studentName: student.Student_Name, fileId: row.File_ID };
}

async function loadStudentPortalDocumentTables(academyStudentId: string, studentId: string): Promise<[SheetRow<StudentRow>, Array<SheetRow<EnrollmentRow>>, Array<SheetRow<StudentDocumentRow>>]> {
  const [students, enrollments, documents] = await Promise.all([readSheet<StudentRow>("Students"), readSheet<EnrollmentRow>("Enrollments"), readSheetDataRegion<StudentDocumentRow>("Student_Documents")]);
  const student = students.find(row => row.Academy_Student_ID.trim() === academyStudentId && row.Student_ID.trim().toLowerCase() === studentId.trim().toLowerCase());
  if (!student) throw new ServiceError("STUDENT_PORTAL_SESSION_INVALID", "Student portal session expired. Please sign in again.", 401);
  return [student, enrollments.filter(row => row.Academy_Student_ID.trim() === academyStudentId && row.Enrollment_ID.trim()), documents];
}

function portalDocumentAllowed(row: SheetRow<StudentDocumentRow>, academyStudentId: string, enrollmentIds: Set<string>) {
  const today = todayValue();
  return row.Academy_Student_ID.trim() === academyStudentId
    && enrollmentIds.has(row.Enrollment_ID.trim())
    && row.Publish_Status.trim().toUpperCase() === "PUBLISHED"
    && activeValue(row.Is_Active)
    && availableFrom(row.Available_From, today)
    && availableTo(row.Available_To, today)
    && Boolean(row.File_ID.trim());
}

function portalDocumentSummary(row: StudentDocumentRow, universityStudentId: string): StudentPortalDocumentSummary {
  const title = row.Document_Title.trim() || documentTypeLabel(row.Document_Type);
  const filename = safeFilename(row.File_Name || `${title}_${universityStudentId}.pdf`);
  return {
    studentDocumentId: row.Student_Document_ID,
    documentType: row.Document_Type,
    documentTypeLabel: documentTypeLabel(row.Document_Type),
    documentTitle: title,
    documentDescription: row.Document_Description,
    previewUrl: googleDrivePreviewUrl(row.File_ID),
    downloadHref: `/api/student-portal/documents/${encodeURIComponent(row.Student_Document_ID)}/download`,
    viewHref: `/student/documents/${encodeURIComponent(row.Student_Document_ID)}`,
    filename,
  };
}

async function resolveBulkRows(batchId: string, parsedRows: Array<{ lineNumber: number; universityStudentId: string; fileUrl: string }>): Promise<StudentDocumentBulkValidationRow[]> {
  const selectedBatchId = batchId.trim();
  if (!selectedBatchId) throw new ServiceError("VALIDATION_FAILED", "Batch is required.", 400);
  const [students, enrollments, groups, batches, documents] = await Promise.all([
    readSheet<StudentRow>("Students"),
    readSheet<EnrollmentRow>("Enrollments"),
    readSheetDataRegion<GroupRow>("Groups"),
    readSheetDataRegion<BatchRow>("Batches"),
    readSheetDataRegion<StudentDocumentRow>("Student_Documents"),
  ]);
  if (!batches.some(row => row.Batch_ID === selectedBatchId)) throw new ServiceError("BATCH_NOT_FOUND", "Batch was not found.", 404);
  const studentsByUniversityId = new Map<string, Array<SheetRow<StudentRow>>>();
  for (const student of students) {
    const key = normalizeUniversityStudentId(student.Student_ID);
    if (!key) continue;
    studentsByUniversityId.set(key, [...(studentsByUniversityId.get(key) ?? []), student]);
  }
  const groupsById = new Map(groups.map(row => [row.Group_ID, row]));
  const activeTrainingFormEnrollments = new Set(documents.filter(row => row.Document_Type.trim().toUpperCase() === "TRAINING_FORM" && activeValue(row.Is_Active)).map(row => row.Enrollment_ID.trim()).filter(Boolean));
  const inputCounts = new Map<string, number>();
  for (const row of parsedRows) inputCounts.set(normalizeUniversityStudentId(row.universityStudentId), (inputCounts.get(normalizeUniversityStudentId(row.universityStudentId)) ?? 0) + 1);
  return parsedRows.map(row => {
    const normalizedId = normalizeUniversityStudentId(row.universityStudentId);
    const fileId = extractGoogleDriveFileId(row.fileUrl);
    const base = baseValidationRow(row, fileId);
    if (!normalizedId) return { ...base, status: "UNKNOWN_STUDENT", message: "University Student ID is required." };
    if ((inputCounts.get(normalizedId) ?? 0) > 1) return { ...base, status: "DUPLICATE_INPUT_ROW", message: "Duplicate University Student ID in this paste." };
    if (!fileId) return { ...base, status: "INVALID_DRIVE_LINK", message: "Google Drive PDF link is invalid." };
    const matches = studentsByUniversityId.get(normalizedId) ?? [];
    if (!matches.length) return { ...base, status: "UNKNOWN_STUDENT", message: "Student ID was not found." };
    if (matches.length > 1) return { ...base, status: "DUPLICATE_STUDENT_ID", message: "More than one student uses this University Student ID." };
    const student = matches[0];
    const matchingEnrollments = enrollments.filter(enrollment => enrollment.Academy_Student_ID === student.Academy_Student_ID && groupsById.get(enrollment.Group_ID)?.Batch_ID === selectedBatchId);
    if (!matchingEnrollments.length) return { ...base, academyStudentId: student.Academy_Student_ID, studentName: student.Student_Name, university: student.University, status: "ENROLLMENT_NOT_FOUND", message: "No Enrollment exists for this student in the selected Batch." };
    if (matchingEnrollments.length > 1) return { ...base, academyStudentId: student.Academy_Student_ID, studentName: student.Student_Name, university: student.University, status: "MULTIPLE_ENROLLMENTS", message: "Multiple Enrollments found in the selected Batch." };
    const enrollment = matchingEnrollments[0];
    const group = groupsById.get(enrollment.Group_ID);
    if (activeTrainingFormEnrollments.has(enrollment.Enrollment_ID)) return { ...base, academyStudentId: student.Academy_Student_ID, enrollmentId: enrollment.Enrollment_ID, studentName: student.Student_Name, university: student.University, groupId: enrollment.Group_ID, groupName: group?.Group_Name ?? enrollment.Group_ID, status: "ALREADY_HAS_DOCUMENT", message: "This Enrollment already has an active Training Form." };
    return { ...base, academyStudentId: student.Academy_Student_ID, enrollmentId: enrollment.Enrollment_ID, studentName: student.Student_Name, university: student.University, groupId: enrollment.Group_ID, groupName: group?.Group_Name ?? enrollment.Group_ID, fileName: `Training_Form_${row.universityStudentId}.pdf`, status: "READY", message: "Ready to publish." };
  });
}

function parseBulkLines(value: string) {
  const rows = value.split(/\r?\n/).map((line, index) => ({ line, lineNumber: index + 1 })).filter(item => item.line.trim());
  if (!rows.length) throw new ServiceError("VALIDATION_FAILED", "Paste at least one University Student ID and Drive link.", 400);
  return rows.map(item => {
    const parts = item.line.includes("|") ? item.line.split("|") : item.line.split(/\t+/);
    const universityStudentId = clean(parts[0]);
    const fileUrl = clean(parts.slice(1).join(item.line.includes("|") ? "|" : "\t"));
    return { lineNumber: item.lineNumber, universityStudentId, fileUrl };
  });
}

function baseValidationRow(row: { lineNumber: number; universityStudentId: string; fileUrl: string }, fileId: string): StudentDocumentBulkValidationRow {
  return { lineNumber: row.lineNumber, universityStudentId: row.universityStudentId, fileUrl: row.fileUrl, fileId, fileName: "", academyStudentId: "", enrollmentId: "", studentName: "", university: "", groupId: "", groupName: "", status: "READY", message: "" };
}

function summarizeValidation(rows: StudentDocumentBulkValidationRow[]) {
  return rows.reduce<Record<string, number>>((summary, row) => {
    summary[row.status] = (summary[row.status] ?? 0) + 1;
    return summary;
  }, {});
}

function activeTrainingFormsByEnrollment(documents: Array<StudentDocumentRow | SheetRow<StudentDocumentRow>>) {
  const forms = new Map<string, StudentDocumentRow | SheetRow<StudentDocumentRow>>();
  for (const row of documents) {
    const enrollmentId = clean(row.Enrollment_ID);
    if (!enrollmentId) continue;
    if (clean(row.Document_Type).toUpperCase() !== "TRAINING_FORM") continue;
    if (!activeValue(row.Is_Active)) continue;
    if (!forms.has(enrollmentId)) forms.set(enrollmentId, row);
  }
  return forms;
}

function publishResult(enrollmentId: string, academyStudentId: string, studentName: string, universityStudentId: string, status: "PUBLISHED" | "ALREADY_PUBLISHED" | "INVALID_LINK" | "ENROLLMENT_NOT_FOUND" | "STUDENT_NOT_FOUND" | "FAILED", message: string, studentDocumentId = "") {
  return { enrollmentId, academyStudentId, studentName, universityStudentId, status, message, studentDocumentId };
}

function nextStudentDocumentId(existing: string[]) {
  return nextId(existing, /^SDOC_(\d+)$/, sequence => `SDOC_${String(sequence).padStart(6, "0")}`);
}

export async function validateStudentDocumentHeaders() {
  const headers = await getHeaders("Student_Documents");
  const normalized = headers.map(header => header.trim());
  const missing = DOCUMENT_HEADERS.filter(header => !normalized.includes(header));
  if (missing.length) throw new ServiceError("CONFIGURATION_ERROR", `Student_Documents is missing required header: ${missing[0]}`, 503);
}

function normalizePublishStatus(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === "PUBLISHED" || normalized === "HIDDEN") return normalized;
  return "DRAFT";
}

function documentTypeLabel(value: string) {
  return value.trim().toUpperCase() === "TRAINING_FORM" ? "Training Form" : value.trim().replaceAll("_", " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

function activeValue(value: string) {
  return ["true", "yes", "1", "active"].includes(value.trim().toLowerCase());
}

function availableFrom(value: string, today: string) {
  const date = comparableDate(value);
  return !date || date <= today;
}

function availableTo(value: string, today: string) {
  const date = comparableDate(value);
  return !date || date >= today;
}

function comparableDate(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return raw.slice(0, 10);
}

function todayValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function normalizeUniversityStudentId(value: unknown) {
  return clean(value).toLowerCase();
}

function normalizeProgramScope(value: unknown) {
  return clean(value).replace(/\s+/g, " ").toLowerCase();
}

function uniqueDisplayValues(values: unknown[]) {
  const options = new Map<string, string>();
  for (const value of values) {
    const display = clean(value).replace(/\s+/g, " ");
    if (!display) continue;
    const key = normalizeProgramScope(display);
    if (!options.has(key)) options.set(key, display);
  }
  return [...options.values()].sort((left, right) => left.localeCompare(right));
}

function safeFilename(value: unknown) {
  const cleaned = String(value ?? "").trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_.-]/g, "_").replace(/_+/g, "_").slice(0, 120);
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "Document"}.pdf`;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}
