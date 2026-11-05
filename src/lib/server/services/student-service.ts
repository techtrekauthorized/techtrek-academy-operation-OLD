import "server-only";
import { appendRecord, deleteSheetRowsInOrder, readSheet, readSheetDataRegion, updateRecord } from "../google/sheets";
import { trashFile } from "../google/drive";
import type { EnrollmentRow, OperationalTrainingDetailsDto, PaymentReceiptRow, RegistryRowDto, SheetRow, StudentAcademicProfileDto, StudentAcademicWorkRow, StudentDto, StudentIssuedCertificateDto, StudentRow, TrackRow } from "../types";
import type { BatchLevelRow, BatchRow, DeliveryTrackRow, GroupRow, OfferingDeliveryMapRow } from "@/types/operations";
import type { AssignmentGroupRow, AssignmentResultRow, AssignmentRow, CertificateEligibilityRow, CertificateRow, LearningRoadmapItemRow, LearningRoadmapRow, TasksGradesAssignment } from "@/types/tasks-grades";
import { enrollmentDto, numberValue, paymentDto, studentDto } from "./mappers";
import { ServiceError } from "./errors";
import { getStudentAttendanceHistory } from "./attendance-service";
import { activeGroupsByAssignment, buildCertificateReadinessRows, mapAssignment, normalizeDecision, normalizeStatus, readTasksGradesBundle, text, type TasksGradesSheets } from "./tasks-grades-service";
import { formatCertificateDate } from "./certificates-service";

type StudentDocumentRow = Record<string, string> & { Student_Document_ID: string; Academy_Student_ID: string; Enrollment_ID: string; Document_Type: string; Publish_Status: string; Is_Active: string };

export async function getStudents() { return (await readSheet<StudentRow>("Students")).map(studentDto); }

export async function findStudent(id: string) {
  const rows = await readSheet<StudentRow>("Students");
  const normalized = decodeURIComponent(id).toLowerCase();
  const row = rows.find(item => item.Academy_Student_ID.toLowerCase() === normalized || item.Student_ID.toLowerCase() === normalized);
  return row ? { row, student: studentDto(row) } : undefined;
}

export async function searchStudents(query: string) {
  const needle = query.trim().toLowerCase();
  const [students, enrollments] = await Promise.all([readSheet<StudentRow>("Students"), readSheet<EnrollmentRow>("Enrollments")]);
  const enrollmentStudentIds = new Set(enrollments.filter(row => row.Enrollment_ID.toLowerCase().includes(needle)).map(row => row.Academy_Student_ID));
  return students.filter(row => !needle || enrollmentStudentIds.has(row.Academy_Student_ID) || [row.Academy_Student_ID, row.Student_ID, row.Phone, row.Student_Name].some(value => value.toLowerCase().includes(needle))).slice(0, 20).map(studentDto);
}

export async function getRegistry() {
  const [studentRows, enrollmentRows, paymentRows, groupRows, trackRows, certificateRows, documentRows] = await Promise.all([readSheet<StudentRow>("Students"), readSheet<EnrollmentRow>("Enrollments"), readSheet<PaymentReceiptRow>("Payments_Receipts"), readSheetDataRegion<GroupRow>("Groups"), readSheet<TrackRow>("Tracks"), readSheetDataRegion<CertificateRow>("Certificates"), readSheetDataRegion<StudentDocumentRow>("Student_Documents")]);
  const students = new Map(studentRows.map(row => [textKey(row.Academy_Student_ID), studentDto(row)]));
  const groupNames = new Map(groupRows.map(row => [textKey(row.Group_ID), row.Group_Name]));
  const tracksByOfferingId = new Map(trackRows.map(row => [textKey(row.Offering_ID), row]));
  const certificatesByEnrollmentId = new Map<string, Array<CertificateRow & { _rowNumber: number }>>();
  for (const certificate of certificateRows) {
    const enrollmentId = textKey(certificate.Enrollment_ID);
    if (!enrollmentId) continue;
    certificatesByEnrollmentId.set(enrollmentId, [...(certificatesByEnrollmentId.get(enrollmentId) ?? []), certificate]);
  }
  const publishedTrainingForms = new Set(documentRows.filter(row => text(row.Document_Type).toUpperCase() === "TRAINING_FORM" && text(row.Publish_Status).toUpperCase() === "PUBLISHED" && activeFlag(row.Is_Active)).map(row => textKey(row.Enrollment_ID)).filter(Boolean));
  const receiptCounts = paymentRows.reduce<Record<string, number>>((counts, row) => { const enrollmentId = textKey(row.Enrollment_ID); counts[enrollmentId] = (counts[enrollmentId] ?? 0) + (row.Receipt_Number ? 1 : 0); return counts; }, {});
  return enrollmentRows.flatMap(row => {
    const student = students.get(textKey(row.Academy_Student_ID));
    if (!student) return [];
    const enrollment = enrollmentDto(row);
    const track = tracksByOfferingId.get(textKey(row.Offering_ID));
    const groupId = textKey(row.Group_ID);
    const certificateState = registryCertificateState(certificatesByEnrollmentId.get(textKey(row.Enrollment_ID)) ?? []);
    return [{
      ...student,
      ...enrollment,
      trackId: textKey(track?.Track_ID),
      track: enrollment.track.trim() || track?.Track.trim() || "",
      receiptCount: receiptCounts[textKey(row.Enrollment_ID)] ?? 0,
      groupName: groupId ? groupNames.get(groupId) ?? "-" : "-",
      ...certificateState,
      trainingFormStatus: publishedTrainingForms.has(textKey(row.Enrollment_ID)) ? "PUBLISHED" : "NOT_PUBLISHED",
      trainingFormStatusLabel: publishedTrainingForms.has(textKey(row.Enrollment_ID)) ? "Published" : "Not Published",
    } satisfies RegistryRowDto];
  });
}

function activeFlag(value: unknown) {
  return ["true", "yes", "1", "active"].includes(String(value ?? "").trim().toLowerCase());
}

function registryCertificateState(certificates: Array<CertificateRow & { _rowNumber: number }>): Pick<RegistryRowDto, "certificateStatus" | "certificateStatusLabel" | "certificateDeliveryStatus" | "certificateDeliveryStatusLabel"> {
  const issued = certificates.find(row => text(row.Certificate_Status).toUpperCase() === "ISSUED");
  if (issued) {
    const delivered = text(issued.Portal_Status).toUpperCase() === "PUBLISHED";
    return {
      certificateStatus: "ISSUED",
      certificateStatusLabel: "Issued",
      certificateDeliveryStatus: delivered ? "DELIVERED" : "NOT_DELIVERED",
      certificateDeliveryStatusLabel: delivered ? "Delivered" : "Not Delivered",
    };
  }
  const revoked = certificates.find(row => text(row.Certificate_Status).toUpperCase() === "REVOKED");
  if (revoked) {
    return {
      certificateStatus: "REVOKED",
      certificateStatusLabel: "Revoked",
      certificateDeliveryStatus: "NOT_DELIVERED",
      certificateDeliveryStatusLabel: "Not Delivered",
    };
  }
  return {
    certificateStatus: "NOT_ISSUED",
    certificateStatusLabel: "Not Issued",
    certificateDeliveryStatus: "NOT_DELIVERED",
    certificateDeliveryStatusLabel: "Not Delivered",
  };
}

export async function getStudentProfile(id: string) {
  const found = await findStudent(id);
  if (!found) throw new ServiceError("STUDENT_NOT_FOUND", "Student not found", 404);
  const [enrollmentRows, paymentRows, mappingRows, deliveryTrackRows, groupRows, batchRows, batchLevelRows] = await Promise.all([
    readSheet<EnrollmentRow>("Enrollments"),
    readSheet<PaymentReceiptRow>("Payments_Receipts"),
    readSheetDataRegion<OfferingDeliveryMapRow>("Offering_Delivery_Map"),
    readSheetDataRegion<DeliveryTrackRow>("Delivery_Tracks"),
    readSheetDataRegion<GroupRow>("Groups"),
    readSheetDataRegion<BatchRow>("Batches"),
    readSheetDataRegion<BatchLevelRow>("Batch_Levels"),
  ]);
  const matchingEnrollmentRows = enrollmentRows.filter(row => row.Academy_Student_ID === found.student.academyStudentId);
  const enrollments = matchingEnrollmentRows.map(enrollmentDto);
  const enrollmentIds = new Set(enrollments.map(item => item.enrollmentId));
  const payments = paymentRows.filter(row => enrollmentIds.has(row.Enrollment_ID)).map(paymentDto);
  const operationalDetails = matchingEnrollmentRows.map(row => operationalTrainingDetails(row, enrollmentRows, mappingRows, deliveryTrackRows, groupRows, batchRows, batchLevelRows));
  const [attendanceHistory, academicProfile] = await Promise.all([
    getStudentAttendanceHistory(found.student.academyStudentId),
    getStudentAcademicProfile(found.row, matchingEnrollmentRows, groupRows, batchRows),
  ]);
  return { student: found.student, enrollments, payments, operationalDetails, attendanceHistory, academicProfile };
}

async function getStudentAcademicProfile(student: SheetRow<StudentRow>, enrollmentRows: Array<EnrollmentRow & { _rowNumber: number }>, groups: Array<GroupRow & { _rowNumber: number }>, batches: Array<BatchRow & { _rowNumber: number }>): Promise<StudentAcademicProfileDto> {
  const data = await readTasksGradesBundle(["Assignments", "Assignment_Groups", "Assignment_Results", "Certificate_Eligibility", "Learning_Roadmaps", "Learning_Roadmap_Items", "Certificates"]);
  const sheets: Pick<TasksGradesSheets, "batches" | "groups" | "students" | "enrollments" | "assignments" | "assignmentGroups" | "assignmentResults" | "certificateEligibility"> & {
    learningRoadmaps: Array<LearningRoadmapRow & { _rowNumber: number }>;
    learningRoadmapItems: Array<LearningRoadmapItemRow & { _rowNumber: number }>;
    certificates: Array<CertificateRow & { _rowNumber: number }>;
  } = {
    batches,
    groups,
    students: [student],
    enrollments: enrollmentRows,
    assignments: sheetRows<AssignmentRow>(data.Assignments),
    assignmentGroups: sheetRows<AssignmentGroupRow>(data.Assignment_Groups),
    assignmentResults: sheetRows<AssignmentResultRow>(data.Assignment_Results),
    certificateEligibility: sheetRows<CertificateEligibilityRow>(data.Certificate_Eligibility),
    learningRoadmaps: sheetRows<LearningRoadmapRow>(data.Learning_Roadmaps),
    learningRoadmapItems: sheetRows<LearningRoadmapItemRow>(data.Learning_Roadmap_Items),
    certificates: sheetRows<CertificateRow>(data.Certificates),
  };
  const assignments = academicAssignments(sheets);
  const academicWork = buildStudentAcademicWork(sheets, assignments);
  return {
    certificateProfile: {
      certificateName: text(student.Certificate_Name),
      certificateEmail: text(student.Certificate_Email).toLowerCase(),
      status: text(student.Certificate_Profile_Status).toUpperCase() === "CONFIRMED" ? "CONFIRMED" : "NOT_CONFIRMED",
      confirmedAt: text(student.Certificate_Profile_Confirmed_At),
    },
    workSummary: buildStudentWorkSummary(enrollmentRows, academicWork),
    academicWork,
    certificateReadiness: buildStudentCertificateReadiness(sheets, assignments),
    issuedCertificates: buildStudentIssuedCertificates(sheets),
  };
}

function sheetRows<T extends Record<string, string>>(values: unknown[][] = []) {
  const headers = (values[0] ?? []).map(value => String(value ?? "").trim());
  return values.slice(1).map((cells, index) => {
    const record: Record<string, string | number> = { _rowNumber: index + 2 };
    headers.forEach((header, column) => { record[header] = String(cells[column] ?? ""); });
    return record as T & { _rowNumber: number };
  }).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && value !== ""));
}

function academicAssignments(sheets: Pick<TasksGradesSheets, "groups" | "assignments" | "assignmentGroups">) {
  const groupNamesById = new Map(sheets.groups.map(row => [row.Group_ID, row.Group_Name]));
  return sheets.assignments.map(row => mapAssignment(row, groupNamesById, activeGroupsByAssignment(sheets.assignmentGroups)));
}

function buildStudentAcademicWork(sheets: Pick<TasksGradesSheets, "batches" | "groups" | "enrollments" | "assignmentResults">, assignments: TasksGradesAssignment[]): StudentAcademicWorkRow[] {
  const groupsById = new Map(sheets.groups.map(row => [row.Group_ID, row]));
  const batchesById = new Map(sheets.batches.map(row => [row.Batch_ID, row]));
  const resultsByKey = new Map(sheets.assignmentResults.map(row => [`${row.Assignment_ID}:${row.Enrollment_ID}`, row]));
  return sheets.enrollments.flatMap(enrollment => {
    const group = groupsById.get(enrollment.Group_ID);
    const batchId = group?.Batch_ID ?? "";
    return assignments.filter(assignment => assignment.groupIds.includes(enrollment.Group_ID) && (!batchId || assignment.batchId === batchId) && (assignment.isActive || resultsByKey.has(`${assignment.assignmentId}:${enrollment.Enrollment_ID}`))).map(assignment => {
      const result = resultsByKey.get(`${assignment.assignmentId}:${enrollment.Enrollment_ID}`);
      const status = result ? normalizeStatus(result.Submission_Status) : "NOT_SUBMITTED";
      const grade = result && text(result.Grade) ? numberValue(result.Grade) : null;
      const maxGrade = assignment.maxGrade;
      return {
        enrollmentId: enrollment.Enrollment_ID,
        type: assignment.assignmentType,
        assignmentId: assignment.assignmentId,
        assignmentTitle: assignment.title,
        batchId: assignment.batchId,
        batchName: batchesById.get(assignment.batchId)?.Batch_Name ?? assignment.batchId,
        groupId: enrollment.Group_ID,
        groupName: group?.Group_Name ?? enrollment.Group_ID,
        levelCode: assignment.levelCode,
        status,
        grade,
        maxGrade,
        percentage: grade !== null && maxGrade !== null && maxGrade > 0 ? Math.round((grade / maxGrade) * 1000) / 10 : null,
        requiredForCertificate: assignment.requiredForCertificate,
        gradedAt: result?.Graded_At ?? result?.Updated_At ?? "",
      };
    });
  }).sort((left, right) => left.batchName.localeCompare(right.batchName) || left.groupName.localeCompare(right.groupName) || left.type.localeCompare(right.type) || left.assignmentTitle.localeCompare(right.assignmentTitle));
}

function buildStudentWorkSummary(enrollments: Array<EnrollmentRow & { _rowNumber: number }>, rows: StudentAcademicWorkRow[]) {
  return enrollments.map(enrollment => {
    const work = rows.filter(row => row.enrollmentId === enrollment.Enrollment_ID);
    const graded = work.filter(row => row.grade !== null && row.maxGrade !== null && row.maxGrade > 0);
    const earned = graded.reduce((sum, row) => sum + (row.grade ?? 0), 0);
    const possible = graded.reduce((sum, row) => sum + (row.maxGrade ?? 0), 0);
    return {
      enrollmentId: enrollment.Enrollment_ID,
      totalApplicable: work.length,
      completed: work.filter(row => row.status === "SUBMITTED" || row.status === "GRADED").length,
      notSubmitted: work.filter(row => row.status === "NOT_SUBMITTED").length,
      tasks: work.filter(row => row.type === "TASK").length,
      projects: work.filter(row => row.type === "PROJECT").length,
      averageGradePercentage: possible > 0 ? Math.round((earned / possible) * 1000) / 10 : null,
    };
  });
}

function buildStudentCertificateReadiness(sheets: Pick<TasksGradesSheets, "batches" | "groups" | "students" | "enrollments" | "assignments" | "assignmentGroups" | "assignmentResults" | "certificateEligibility">, assignments: TasksGradesAssignment[]) {
  const groupsById = new Map(sheets.groups.map(row => [row.Group_ID, row]));
  const batchesById = new Map(sheets.batches.map(row => [row.Batch_ID, row]));
  const byEnrollment = new Map<string, ReturnType<typeof buildCertificateReadinessRows>[number]>();
  for (const batchId of [...new Set(sheets.enrollments.map(row => groupsById.get(row.Group_ID)?.Batch_ID).filter((value): value is string => Boolean(value)))]) {
    for (const row of buildCertificateReadinessRows(sheets, assignments, batchId)) byEnrollment.set(row.enrollmentId, row);
  }
  return sheets.enrollments.map(enrollment => {
    const group = groupsById.get(enrollment.Group_ID);
    const batchId = group?.Batch_ID ?? "";
    const readiness = byEnrollment.get(enrollment.Enrollment_ID);
    const required = (readiness?.requiredTasks ?? 0) + (readiness?.requiredProjects ?? 0);
    const completed = (readiness?.submittedTasks ?? 0) + (readiness?.submittedProjects ?? 0);
    return {
      enrollmentId: enrollment.Enrollment_ID,
      batchId,
      batchName: batchesById.get(batchId)?.Batch_Name ?? batchId,
      groupId: enrollment.Group_ID,
      groupName: group?.Group_Name ?? enrollment.Group_ID,
      track: enrollment.Track,
      creditHours: numberValue(enrollment["Credit Hours"]),
      deliveryMode: enrollment.Delivery_Mode,
      applicableRequiredAssignments: required,
      completedRequiredAssignments: completed,
      missingRequiredAssignments: readiness?.missingRequiredAssignments ?? 0,
      readiness: readiness?.automaticReadiness ?? "NOT_CONFIGURED",
      certificateDecision: readiness?.certificateDecision ?? normalizeDecision(""),
    };
  });
}

function buildStudentIssuedCertificates(sheets: Pick<TasksGradesSheets, "enrollments"> & { learningRoadmaps: Array<LearningRoadmapRow & { _rowNumber: number }>; certificates: Array<CertificateRow & { _rowNumber: number }> }): StudentIssuedCertificateDto[] {
  const enrollmentIds = new Set(sheets.enrollments.map(row => row.Enrollment_ID));
  const roadmapsById = new Map(sheets.learningRoadmaps.map(row => [row.Roadmap_ID, row]));
  return sheets.certificates.filter(row => enrollmentIds.has(row.Enrollment_ID)).map(row => {
    const roadmap = roadmapsById.get(row.Roadmap_ID);
    return {
      enrollmentId: row.Enrollment_ID,
      certificateId: row.Certificate_ID,
      certificateName: row.Certificate_Name,
      studentNameOnCertificate: text(row.Student_Name_On_Certificate),
      roadmapId: row.Roadmap_ID,
      roadmapName: roadmap?.Roadmap_Name ?? row.Roadmap_ID,
      roadmapVersion: roadmap?.Version ?? "",
      issueDate: formatCertificateDate(row.Issue_Date),
      status: text(row.Certificate_Status).toUpperCase() === "REVOKED" ? "REVOKED" as const : "ISSUED" as const,
      verificationUrl: text(row.Verification_Token) ? `/verify/certificate/${encodeURIComponent(row.Verification_Token)}` : "",
    };
  }).sort((left, right) => right.issueDate.localeCompare(left.issueDate) || left.certificateId.localeCompare(right.certificateId));
}

function operationalTrainingDetails(enrollment: EnrollmentRow, allEnrollments: Array<EnrollmentRow & { _rowNumber: number }>, mappings: Array<OfferingDeliveryMapRow & { _rowNumber: number }>, deliveryTracks: Array<DeliveryTrackRow & { _rowNumber: number }>, groups: Array<GroupRow & { _rowNumber: number }>, batches: Array<BatchRow & { _rowNumber: number }>, batchLevels: Array<BatchLevelRow & { _rowNumber: number }>): OperationalTrainingDetailsDto {
  const activeMappings = mappings.filter(row => row.Offering_ID === enrollment.Offering_ID && activeValue(row.Is_Active));
  const mappedTrack = activeMappings.length === 1 ? deliveryTracks.find(row => row.Delivery_Track_ID === activeMappings[0].Delivery_Track_ID && activeValue(row.Is_Active)) : undefined;
  const group = enrollment.Group_ID.trim() ? groups.find(row => row.Group_ID === enrollment.Group_ID) : undefined;
  const batch = group ? batches.find(row => row.Batch_ID === group.Batch_ID) : undefined;
  const groupTrackMatches = !group || !batch || !mappedTrack || batch.Delivery_Track_ID === mappedTrack.Delivery_Track_ID;
  const level1 = batch ? batchLevels.find(row => row.Batch_ID === batch.Batch_ID && row.Level_Code === "LEVEL_1") : undefined;
  const level2 = batch ? batchLevels.find(row => row.Batch_ID === batch.Batch_ID && row.Level_Code === "LEVEL_2") : undefined;
  const assignedStudentsCount = group ? allEnrollments.filter(row => row.Group_ID === group.Group_ID).length : 0;
  let placementStatus: OperationalTrainingDetailsDto["placementStatus"];
  let message: string;
  if (!mappedTrack) {
    placementStatus = "CONFIGURATION_REQUIRED"; message = "This enrollment has not been mapped to an operational Delivery Track yet.";
  } else if (enrollment.Group_ID.trim() && !group) {
    placementStatus = "CONFIGURATION_REQUIRED"; message = "The assigned operational group could not be found. Review the placement configuration.";
  } else if (group && !batch) {
    placementStatus = "CONFIGURATION_REQUIRED"; message = "The assigned operational batch could not be found. Review the placement configuration.";
  } else if (!groupTrackMatches) {
    placementStatus = "CONFIGURATION_REQUIRED"; message = "The assigned group does not match the mapped operational Delivery Track.";
  } else if (group && batch) {
    placementStatus = "PLACED"; message = "This enrollment is placed in an operational group.";
  } else if (enrollment.Level_Selection.trim()) {
    placementStatus = "READY_TO_PLACE"; message = "This enrollment is ready for operational group placement.";
  } else {
    placementStatus = "NEEDS_LEVEL_SELECTION"; message = "This enrollment must be assigned to Level 1, Level 2, or Both Levels before group placement.";
  }
  return {
    enrollmentId: enrollment.Enrollment_ID,
    placementStatus,
    message,
    soldTrack: enrollment.Track,
    packageLabel: enrollment.Package_Label,
    creditHours: numberValue(enrollment["Credit Hours"]),
    registeredDeliveryMode: enrollment.Delivery_Mode,
    levelSelection: enrollment.Level_Selection,
    deliveryTrackName: mappedTrack?.Delivery_Track_Name ?? "",
    batchName: batch?.Batch_Name ?? "",
    batchIntake: batch?.Intake ?? "",
    batchStartDate: batch?.Start_Date ?? "",
    batchEndDate: batch?.End_Date ?? "",
    batchStatus: batch?.Status ?? "",
    groupName: group?.Group_Name ?? "",
    groupStatus: group?.Status ?? "",
    groupCapacity: group?.Capacity ?? "",
    assignedStudentsCount,
    level1Name: level1?.Level_Name || "Level 1",
    level2Name: level2?.Level_Name || "Level 2",
    level1AttendanceMode: group?.Level_1_Attendance_Mode ?? "",
    level2AttendanceMode: group?.Level_2_Attendance_Mode ?? "",
  };
}

function activeValue(value: string) {
  return ["true", "yes", "1", "active"].includes(value.trim().toLowerCase());
}

function textKey(value: unknown) {
  return String(value ?? "").trim();
}

export async function updateStudent(id: string, patch: Partial<Omit<StudentDto, "academyStudentId">>) {
  const academyStudentId = decodeURIComponent(id).trim().toLowerCase();
  const rows = await readSheet<StudentRow>("Students");
  const row = rows.find(item => item.Academy_Student_ID.trim().toLowerCase() === academyStudentId);
  if (!row) throw new ServiceError("STUDENT_NOT_FOUND", "Student not found", 404);
  const fields: Record<string, string> = {};
  const map: Record<keyof Omit<StudentDto, "academyStudentId">, string> = { studentName: "Student_Name", phone: "Phone", email: "Email", university: "University", college: "College", department: "Department", studentId: "Student_ID", studentStatus: "Student_Status" };
  for (const [key, header] of Object.entries(map)) { const value = patch[key as keyof typeof patch]; if (value !== undefined) fields[header] = value; }
  await updateRecord("Students", row._rowNumber, fields);
  const saved = (await readSheet<StudentRow>("Students")).find(item => item.Academy_Student_ID.trim().toLowerCase() === academyStudentId);
  if (!saved) throw new ServiceError("STUDENT_NOT_FOUND", "Updated student could not be reloaded", 500);
  return studentDto(saved);
}

export async function appendStudent(student: StudentDto) {
  await appendRecord("Students", { Academy_Student_ID: student.academyStudentId, Student_Name: student.studentName, Phone: student.phone, Email: student.email, University: student.university, College: student.college, Department: student.department, Student_ID: student.studentId, Student_Status: student.studentStatus });
}

export async function getStudentDeletionPreview(id: string) {
  const academyStudentId = decodeURIComponent(id).trim().toLowerCase();
  const [students, enrollmentRows, paymentRows] = await Promise.all([readSheet<StudentRow>("Students"), readSheet<EnrollmentRow>("Enrollments"), readSheet<PaymentReceiptRow>("Payments_Receipts")]);
  const matchingStudents = students.filter(row => row.Academy_Student_ID.trim().toLowerCase() === academyStudentId);
  if (matchingStudents.length !== 1) throw new ServiceError(matchingStudents.length ? "DUPLICATE_STUDENT_ID" : "STUDENT_NOT_FOUND", matchingStudents.length ? "Student deletion stopped because the Academy Student ID is not unique" : "Student not found", matchingStudents.length ? 409 : 404);
  const studentRow = matchingStudents[0];
  const matchingEnrollments = enrollmentRows.filter(row => row.Academy_Student_ID === studentRow.Academy_Student_ID);
  const enrollmentIds = new Set(matchingEnrollments.map(row => row.Enrollment_ID));
  const matchingPayments = paymentRows.filter(row => enrollmentIds.has(row.Enrollment_ID));
  const knownGeneratedFileIds = [...new Set(matchingPayments.filter(row => row.Receipt_Source.trim().toUpperCase() === "GOOGLE_DOCS" && /^[A-Za-z0-9_-]{10,}$/.test(row.Receipt_PDF_File_ID.trim())).map(row => row.Receipt_PDF_File_ID.trim()))];
  return {
    student: studentDto(studentRow), studentRowNumber: studentRow._rowNumber,
    enrollments: matchingEnrollments.map(row => ({ rowNumber: row._rowNumber, enrollment: enrollmentDto(row) })),
    payments: matchingPayments.map(row => ({ rowNumber: row._rowNumber, paymentId: row.Payment_ID })),
    paymentCount: matchingPayments.length,
    totalPaidAmount: matchingPayments.reduce((sum, row) => sum + numberValue(row.Payment_Amount), 0),
    receiptNumbers: matchingPayments.map(row => row.Receipt_Number).filter(Boolean),
    knownGeneratedFileIds,
  };
}

export async function deleteStudentCompletely(id: string) {
  const preview = await getStudentDeletionPreview(id);
  try {
    await deleteSheetRowsInOrder([
      { tab: "Payments_Receipts", rowNumbers: preview.payments.map(row => row.rowNumber) },
      { tab: "Enrollments", rowNumbers: preview.enrollments.map(row => row.rowNumber) },
      { tab: "Students", rowNumbers: [preview.studentRowNumber] },
    ]);
  } catch {
    console.error("Student deletion failed before Drive cleanup", { academyStudentId: preview.student.academyStudentId });
    throw new ServiceError("STUDENT_DELETE_FAILED", "Student records could not be deleted. No receipt-file cleanup was performed.", 502);
  }
  const cleanupResults = await Promise.allSettled(preview.knownGeneratedFileIds.map(fileId => trashFile(fileId)));
  const receiptCleanupCount = cleanupResults.filter(result => result.status === "fulfilled").length;
  const cleanupFailed = receiptCleanupCount !== preview.knownGeneratedFileIds.length;
  if (cleanupFailed) console.warn("Student records deleted, but some generated receipt files could not be moved to Drive Trash", { academyStudentId: preview.student.academyStudentId, failedFileCount: preview.knownGeneratedFileIds.length - receiptCleanupCount });
  return { deletedEnrollmentCount: preview.enrollments.length, deletedPaymentCount: preview.paymentCount, receiptCleanupCount, ...(cleanupFailed ? { warning: "Student records were deleted, but some old receipt files could not be moved to Drive Trash." } : {}) };
}
