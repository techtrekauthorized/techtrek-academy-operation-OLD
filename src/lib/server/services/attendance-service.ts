import "server-only";
import { getSheetsClient, getSpreadsheetId } from "@/lib/server/google/client";
import { appendRecordToDataRegion, atomicSheetMutation, getHeaders, readSheet, readSheetDataRegion, updateRecord } from "@/lib/server/google/sheets";
import { googleWorkspaceError, ServiceError } from "@/lib/server/services/errors";
import { getCairoNowParts, normalizeAttendanceSessionDateFields, sheetDateTimeSortKey, sortAttendanceSessions } from "@/lib/server/services/sheet-date-time";
import type { EnrollmentRow, StudentRow } from "@/lib/server/types";
import type { SheetRow } from "@/lib/server/types";
import type { AttendanceBatchOptionDto, AttendanceData, AttendanceFormResponseDto, AttendanceMatrixResponse, AttendanceMatrixStatus, AttendanceScheduleData, AttendanceSessionDto, AttendanceSessionReviewDto, AttendanceSyncSummary, AttendanceValidatedDto, StudentAttendanceHistory } from "@/types/attendance";
import type { BatchRow, GroupRow } from "@/types/operations";

type AttendanceSessionRow = Record<string, string> & {
  Attendance_Session_ID: string;
  Attendance_Code: string;
};
type AttendanceSessionGroupRow = Record<string, string> & {
  Attendance_Session_ID: string;
  Group_ID: string;
};
type AttendanceFormResponseRow = Record<string, string> & {
  Timestamp: string;
  Attendance_Code: string;
  University_Student_ID: string;
  Student_Name: string;
  Phone: string;
};
type AttendanceValidatedRow = Record<string, string> & {
  Attendance_ID: string;
  Source_Response_Row: string;
  Source_Timestamp: string;
  Attendance_Code: string;
  Attendance_Session_ID: string;
  Input_University_Student_ID: string;
  Resolved_Academy_Student_ID: string;
  Enrollment_ID: string;
  Resolved_Group_ID: string;
  Student_Name: string;
  Input_Phone: string;
  Attendance_Status: string;
  Validation_Status: string;
  Submitted_At: string;
  Validated_At: string;
  Reviewed_By: string;
  Review_Status: string;
  Notes: string;
};
type MatrixCorrectionRecord = { studentId: string; attendanceSessionId: string };
type MatrixPresentPlan = {
  appends: AttendanceValidatedRow[];
  updates: Array<{ rowNumber: number; record: AttendanceValidatedRow }>;
  alreadyPresent: number;
};

const VALIDATED_HEADERS = ["Attendance_ID", "Source_Response_Row", "Source_Timestamp", "Attendance_Code", "Attendance_Session_ID", "Input_University_Student_ID", "Resolved_Academy_Student_ID", "Enrollment_ID", "Resolved_Group_ID", "Student_Name", "Input_Phone", "Attendance_Status", "Validation_Status", "Submitted_At", "Validated_At", "Reviewed_By", "Review_Status", "Notes"];
const FORM_REQUIRED_HEADERS = ["Timestamp", "Attendance_Code", "University_Student_ID"];
const ACTIVE_EXCLUDED_STATUSES = new Set(["CANCELLED", "WITHDRAWN"]);
type ManualAttendanceAction = "PRESENT" | "EXCUSED" | "NEEDS_REVIEW" | "REJECT";
let attendanceSyncInProgress: Promise<AttendanceSyncSummary> | null = null;

export async function getAttendanceData(): Promise<AttendanceData> {
  const { sessions, sessionGroups, formResponses, validated, students, enrollments, groups, batches } = await loadAttendanceTables();
  const batchById = new Map(batches.map(row => [row.Batch_ID, row]));
  const sessionDtos = sortAttendanceSessions(sessions).map(row => sessionDto(row, batchById));
  const formDtos = formResponses.map(formResponseDto);
  const validatedDtos = buildValidatedDtos(validated, students, groups);
  return {
    overview: {
      totalSessions: sessions.length,
      totalFormResponses: formResponses.length,
      validPresent: validated.filter(row => row.Validation_Status === "Valid" && row.Attendance_Status === "Present").length,
      needsReview: validated.filter(row => row.Attendance_Status === "Needs Review").length,
      invalidOrNotEligible: validated.filter(row => ["Invalid Code", "Not Eligible For Session", "Student Not Found"].includes(row.Validation_Status)).length,
      lastSyncTime: validated.map(row => row.Validated_At).filter(Boolean).sort().at(-1) ?? "",
    },
    batches: batchOptions(batches),
    sessions: sessionDtos,
    formResponses: formDtos.slice(-100).reverse(),
    validated: validatedDtos.slice().reverse(),
    sessionReviews: buildSessionReviews(sessions, sessionGroups, validated, students, enrollments, groups, batchById),
  };
}

export async function getAttendanceMatrixData(filters: { batchId?: string; attendanceSessionId?: string; university?: string; studentId?: string; groupId?: string; attendanceStatus?: string; validationStatus?: string }): Promise<AttendanceMatrixResponse> {
  const { sessions, sessionGroups, validated, students, enrollments, groups, batches } = await loadAttendanceTablesWithoutFormResponses();
  const batchId = (filters.batchId ?? "").trim();
  const batchById = new Map(batches.map(row => [row.Batch_ID, row]));
  const batch = batchId ? batchById.get(batchId) : undefined;
  const batchGroups = groups.filter(group => group.Batch_ID === batchId);
  const batchGroupIds = new Set(batchGroups.map(group => group.Group_ID));
  const groupById = new Map(groups.map(row => [row.Group_ID, row]));
  const studentByAcademyId = new Map(students.map(row => [row.Academy_Student_ID, row]));
  const mappings = sessionGroups.filter(row => activeMapping(row) && batchGroupIds.has(row.Group_ID));
  const mappingsBySession = groupBy(mappings, row => row.Attendance_Session_ID);
  const sessionIdsForBatch = new Set(mappings.map(row => row.Attendance_Session_ID));
  const today = localDateValue();
  const completedSessions = sortAttendanceSessions(sessions.filter(session =>
    sessionIdsForBatch.has(session.Attendance_Session_ID)
    && session.Session_Date
    && session.Session_Date <= today
    && !isContentOnlyExtraSession(session)
    && (mappingsBySession.get(session.Attendance_Session_ID) ?? []).length > 0,
  ));
  const completedSessionIds = new Set(completedSessions.map(session => session.Attendance_Session_ID));
  const mappingsByGroup = groupBy(mappings.filter(row => completedSessionIds.has(row.Attendance_Session_ID)), row => row.Group_ID);
  const activeEnrollments = enrollments.filter(enrollment => enrollment.Group_ID && batchGroupIds.has(enrollment.Group_ID) && !ACTIVE_EXCLUDED_STATUSES.has(normalizeCode(enrollment.Enrollment_Status)));
  const dedupedEnrollments = dedupeEnrollmentsForMatrix(activeEnrollments);
  const universityOptions = uniqueUniversities(dedupedEnrollments.map(enrollment => studentByAcademyId.get(enrollment.Academy_Student_ID)?.University || enrollment.University));
  const normalizedUniversity = (filters.university ?? "").trim();
  const studentSearch = normalizeId(filters.studentId ?? "");
  const selectedGroupId = (filters.groupId ?? "").trim();
  const selectedSessionId = (filters.attendanceSessionId ?? "").trim();
  const selectedAttendanceStatus = normalizeCode(filters.attendanceStatus ?? "");
  const selectedValidationStatus = (filters.validationStatus ?? "").trim();
  const relevantValidated = validated.filter(row => completedSessionIds.has(row.Attendance_Session_ID));
  const validatedByEnrollmentSession = new Map<string, SheetRow<AttendanceValidatedRow>>();
  for (const row of relevantValidated) {
    const key = `${row.Enrollment_ID}::${row.Attendance_Session_ID}`;
    const current = validatedByEnrollmentSession.get(key);
    if (!current || attendancePriority(row) > attendancePriority(current)) validatedByEnrollmentSession.set(key, row);
  }
  const sessionRows = completedSessions.map(session => ({
    attendanceSessionId: session.Attendance_Session_ID,
    sessionNumber: numberValue(session.Session_Number),
    title: session.Session_Title || session.Title || session.Track || session.Track_Context || session.Attendance_Code || session.Attendance_Session_ID,
    date: session.Session_Date,
    startTime: session.Start_Time,
    deliveryMode: session.Delivery_Mode ?? "",
  }));
  const rows = dedupedEnrollments.flatMap(enrollment => {
    const student = studentByAcademyId.get(enrollment.Academy_Student_ID);
    if (!student) return [];
    const universityName = student.University || enrollment.University || "Unknown University";
    if (normalizedUniversity && universityName !== normalizedUniversity) return [];
    if (selectedGroupId && enrollment.Group_ID !== selectedGroupId) return [];
    if (studentSearch && !normalizeId(student.Student_ID).includes(studentSearch)) return [];
    const eligibleSessionIds = new Set((mappingsByGroup.get(enrollment.Group_ID) ?? []).map(row => row.Attendance_Session_ID));
    const sessionStatuses: Record<string, AttendanceMatrixStatus> = {};
    const sessionValidationStatuses: Record<string, string> = {};
    let eligibleSessionsCount = 0;
    let presentCount = 0;
    let absentCount = 0;
    let pendingCount = 0;
    let excusedCount = 0;
    for (const session of completedSessions) {
      if (!eligibleSessionIds.has(session.Attendance_Session_ID)) {
        sessionStatuses[session.Attendance_Session_ID] = "NOT_APPLICABLE";
        sessionValidationStatuses[session.Attendance_Session_ID] = "Not Applicable";
        continue;
      }
      eligibleSessionsCount++;
      const match = validatedByEnrollmentSession.get(`${enrollment.Enrollment_ID}::${session.Attendance_Session_ID}`);
      const status = matrixStatusFromRecord(match);
      sessionStatuses[session.Attendance_Session_ID] = status;
      sessionValidationStatuses[session.Attendance_Session_ID] = match?.Validation_Status || "Absent";
      if (status === "PRESENT") presentCount++;
      if (status === "ABSENT") absentCount++;
      if (status === "PENDING") pendingCount++;
      if (status === "EXCUSED") excusedCount++;
    }
    if (selectedSessionId && sessionStatuses[selectedSessionId] === "NOT_APPLICABLE") return [];
    const statusValues = selectedSessionId ? [sessionStatuses[selectedSessionId]] : Object.values(sessionStatuses);
    const validationValues = selectedSessionId ? [sessionValidationStatuses[selectedSessionId]] : Object.values(sessionValidationStatuses);
    if (selectedAttendanceStatus && !statusValues.some(status => normalizeCode(status) === selectedAttendanceStatus)) return [];
    if (selectedValidationStatus && !validationValues.includes(selectedValidationStatus)) return [];
    const denominator = presentCount + absentCount;
    return [{
      studentId: student.Student_ID,
      studentName: student.Student_Name,
      mobile: student.Phone,
      universityId: universityName,
      universityName,
      groupId: enrollment.Group_ID,
      groupName: groupById.get(enrollment.Group_ID)?.Group_Name ?? enrollment.Group_ID,
      packageHours: packageHours(enrollment),
      attendanceMode: attendanceModeForEnrollment(enrollment, groupById.get(enrollment.Group_ID)),
      eligibleSessionsCount,
      presentCount,
      absentCount,
      pendingCount,
      excusedCount,
      attendancePercentage: denominator ? Math.round((presentCount / denominator) * 100) : null,
      sessionStatuses,
      sessionValidationStatuses,
    }];
  }).sort((left, right) => left.studentId.localeCompare(right.studentId));
  const percentages = rows.map(row => row.attendancePercentage).filter((value): value is number => value !== null);
  const pendingRecords = rows.reduce((total, row) => total + row.pendingCount, 0);
  const presentRecords = rows.reduce((total, row) => total + row.presentCount, 0);
  const absentRecords = rows.reduce((total, row) => total + row.absentCount, 0);
  return {
    batch: { id: batchId, name: batch?.Batch_Name ?? "" },
    filters: {
      batches: batchOptions(batches),
      universities: universityOptions.map(name => ({ id: name, name })),
      groups: batchGroups.map(group => ({ id: group.Group_ID, name: group.Group_Name })).sort((left, right) => left.name.localeCompare(right.name)),
    },
    sessions: sessionRows,
    students: rows,
    summary: {
      totalStudents: rows.length,
      completedSessions: sessionRows.length,
      presentRecords,
      absentRecords,
      averageAttendancePercentage: percentages.length ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length) : null,
      pendingRecords,
    },
    diagnostics: {
      duplicateStudents: activeEnrollments.length - dedupedEnrollments.length,
      orphanedAttendanceRecords: relevantValidated.filter(row => row.Enrollment_ID && !activeEnrollments.some(enrollment => enrollment.Enrollment_ID === row.Enrollment_ID)).length,
    },
  };
}

export async function markAttendanceMatrixPresent(input: { records: Array<{ studentId: string; attendanceSessionId: string }>; reason?: string }, reviewer: string) {
  const requested = dedupeMatrixCorrectionRecords(input.records);
  if (!requested.length) throw new ServiceError("VALIDATION_FAILED", "At least one attendance record is required.", 400);
  if (requested.length > 200) throw new ServiceError("VALIDATION_FAILED", "Too many attendance records selected.", 400);
  const { sessions, sessionGroups, validated, students, enrollments, groups } = await loadAttendanceTablesWithoutFormResponses();
  const plan = buildMatrixPresentPlan({ requested, reason: input.reason ?? "", reviewer, sessions, sessionGroups, validated, students, enrollments, groups });
  const changes = plan.appends.length + plan.updates.length;
  try {
    if (changes) {
      await atomicSheetMutation({
        appends: plan.appends.map(record => ({ tab: "Attendance_Validated", record })),
        updates: plan.updates.map(update => ({ tab: "Attendance_Validated", rowNumber: update.rowNumber, patch: update.record })),
      });
    }
  } catch (error) {
    throw googleWorkspaceError(error, "marking attendance matrix records present");
  }
  const refreshed = changes ? await readSheetDataRegion<AttendanceValidatedRow>("Attendance_Validated") : validated;
  for (const record of [...plan.appends, ...plan.updates.map(update => update.record)]) {
    const match = refreshed.find(row => row.Attendance_ID === record.Attendance_ID);
    if (attendanceStatusFromRecord(match) !== "Present") throw new ServiceError("ATTENDANCE_MATRIX_VERIFY_FAILED", "Attendance correction verification failed.", 500);
  }
  return { updated: changes, alreadyPresent: plan.alreadyPresent, rejected: 0, message: `${changes} records updated; ${plan.alreadyPresent} already present.` };
}

function buildMatrixPresentPlan({ requested, reason, reviewer, sessions, sessionGroups, validated, students, enrollments, groups }: {
  requested: MatrixCorrectionRecord[];
  reason: string;
  reviewer: string;
  sessions: Array<SheetRow<AttendanceSessionRow>>;
  sessionGroups: Array<SheetRow<AttendanceSessionGroupRow>>;
  validated: Array<SheetRow<AttendanceValidatedRow>>;
  students: Array<SheetRow<StudentRow>>;
  enrollments: Array<SheetRow<EnrollmentRow>>;
  groups: Array<SheetRow<GroupRow>>;
}): MatrixPresentPlan {
  const today = localDateValue();
  const sessionById = new Map(sessions.map(row => [row.Attendance_Session_ID, row]));
  const studentsById = groupBy(students, row => normalizeId(row.Student_ID));
  const studentsByAcademyId = groupBy(students, row => normalizeId(row.Academy_Student_ID));
  const groupById = new Map(groups.map(row => [row.Group_ID.trim(), row]));
  const activeMappingsBySession = groupBy(sessionGroups.filter(activeMapping), row => row.Attendance_Session_ID);
  const existingIds = new Set(validated.map(row => row.Attendance_ID));
  const status = manualStatus("PRESENT");
  const note = reason.trim() || "Manual attendance correction from Attendance Matrix";
  const appends: AttendanceValidatedRow[] = [];
  const updates: Array<{ rowNumber: number; record: AttendanceValidatedRow }> = [];
  let alreadyPresent = 0;
  for (const record of requested) {
    const session = sessionById.get(record.attendanceSessionId);
    if (!session) throw correctionError(record, "Attendance session was not found.", 404, "ATTENDANCE_SESSION_NOT_FOUND");
    if (!session.Session_Date || session.Session_Date > today) throw correctionError(record, "Future sessions cannot be corrected from the matrix.");
    if (isContentOnlyExtraSession(session)) throw correctionError(record, "Content-only seminar sessions cannot be corrected from the matrix.");
    const matchingStudents = uniqueSheetRowsByNumber([...(studentsById.get(normalizeId(record.studentId)) ?? []), ...(studentsByAcademyId.get(normalizeId(record.studentId)) ?? [])]);
    if (matchingStudents.length !== 1) throw correctionError(record, "Student ID needs review.", matchingStudents.length ? 409 : 404, matchingStudents.length ? "STUDENT_REVIEW_REQUIRED" : "STUDENT_NOT_FOUND");
    const student = matchingStudents[0];
    const allowedGroupIds = new Set((activeMappingsBySession.get(session.Attendance_Session_ID) ?? []).map(row => row.Group_ID.trim()));
    const eligible = enrollments.filter(enrollment => enrollment.Academy_Student_ID === student.Academy_Student_ID && enrollment.Group_ID.trim() && allowedGroupIds.has(enrollment.Group_ID.trim()) && !ACTIVE_EXCLUDED_STATUSES.has(normalizeCode(enrollment.Enrollment_Status)));
    if (eligible.length !== 1) throw correctionError(record, "Student/session eligibility needs review.", 409, eligible.length > 1 ? "MULTIPLE_ELIGIBLE_ENROLLMENTS" : "NOT_ELIGIBLE_FOR_SESSION");
    const enrollment = eligible[0];
    const group = groupById.get(enrollment.Group_ID.trim());
    if (!group) throw correctionError(record, "Mapped group was not found.", 409, "NOT_ELIGIBLE_FOR_SESSION");
    if (group.Batch_ID.trim() && session.Batch_ID?.trim() && group.Batch_ID.trim() !== session.Batch_ID.trim()) throw correctionError(record, "Mapped group belongs to a different batch.", 409, "NOT_ELIGIBLE_FOR_SESSION");
    const existing = validated.filter(row => row.Attendance_Session_ID === session.Attendance_Session_ID && (row.Enrollment_ID === enrollment.Enrollment_ID || (!row.Enrollment_ID && row.Resolved_Academy_Student_ID === student.Academy_Student_ID)));
    if (existing.length > 1) throw correctionError(record, "Multiple attendance records already exist.", 409, "DUPLICATE_VALIDATED_RECORDS");
    const currentStatus = attendanceStatusFromRecord(existing[0]);
    if (currentStatus === "Present") {
      alreadyPresent++;
      continue;
    }
    if (currentStatus === "Excused") throw correctionError(record, "Excused attendance cannot be marked present from the matrix.", 409, "ATTENDANCE_STATE_CONFLICT");
    const now = new Date().toISOString();
    const recordToSave: AttendanceValidatedRow = sheetSafeAttendanceRecord({
      Attendance_ID: existing[0]?.Attendance_ID || reserveNextAttendanceId(existingIds),
      Source_Response_Row: existing[0]?.Source_Response_Row || "MANUAL",
      Source_Timestamp: existing[0]?.Source_Timestamp || now,
      Attendance_Code: existing[0]?.Attendance_Code || session.Attendance_Code,
      Attendance_Session_ID: session.Attendance_Session_ID,
      Input_University_Student_ID: existing[0]?.Input_University_Student_ID || student.Student_ID,
      Resolved_Academy_Student_ID: student.Academy_Student_ID,
      Enrollment_ID: enrollment.Enrollment_ID,
      Resolved_Group_ID: enrollment.Group_ID.trim(),
      Student_Name: existing[0]?.Student_Name || student.Student_Name,
      Input_Phone: existing[0]?.Input_Phone || student.Phone,
      Attendance_Status: status.attendanceStatus,
      Validation_Status: status.validationStatus,
      Submitted_At: existing[0]?.Submitted_At || now,
      Validated_At: now,
      Reviewed_By: reviewer,
      Review_Status: status.reviewStatus,
      Notes: appendManualNote(existing[0]?.Notes ?? "", note),
    });
    if (existing[0]) updates.push({ rowNumber: existing[0]._rowNumber, record: recordToSave });
    else appends.push(recordToSave);
  }
  return { appends, updates, alreadyPresent };
}

export async function getAttendanceScheduleData(canManageSessions: boolean): Promise<AttendanceScheduleData> {
  await validateAttendanceHeaders();
  const [sessions, sessionGroups, groups] = await Promise.all([
    readSheetDataRegion<AttendanceSessionRow>("Attendance_Sessions"),
    readSheetDataRegion<AttendanceSessionGroupRow>("Attendance_Session_Groups"),
    readSheetDataRegion<GroupRow>("Groups"),
  ]);
  const groupById = new Map(groups.map(row => [row.Group_ID, row]));
  const groupsBySession = groupBy(sessionGroups, row => row.Attendance_Session_ID);
  const events = sortAttendanceSessions(normalizeAttendanceSessions(sessions)).map(row => {
    const mappings = groupsBySession.get(row.Attendance_Session_ID) ?? [];
    const groupIds = mappings.map(item => item.Group_ID).filter(Boolean);
    const groupNames = groupIds.map(groupId => groupById.get(groupId)?.Group_Name || groupId);
    const title = row.Session_Title || row.Title || row.Track || row.Delivery_Track || row.Attendance_Code || row.Attendance_Session_ID;
    return {
      id: row.Attendance_Session_ID,
      title,
      date: row.Session_Date ?? "",
      startTime: row.Start_Time ?? "",
      endTime: row.End_Time ?? "",
      attendanceCode: row.Attendance_Code,
      sessionNumber: row.Session_Number ?? "",
      levelCode: row.Level_Code ?? "",
      deliveryMode: row.Delivery_Mode ?? "",
      location: row.Location ?? "",
      instructor: row.Instructor ?? "",
      mentor: row.Mentor ?? "",
      status: row.Status ?? row.Session_Status ?? "",
      track: row.Track ?? row.Delivery_Track ?? "",
      notes: row.Notes ?? "",
      groupIds,
      groupNames,
    };
  });
  return { canManageSessions, events };
}

export async function syncAttendanceResponses(): Promise<AttendanceSyncSummary> {
  if (attendanceSyncInProgress) throw new ServiceError("SYNC_ALREADY_RUNNING", "Attendance Sync is already running. Please wait for it to finish.", 409);
  attendanceSyncInProgress = runAttendanceSync();
  try {
    return await attendanceSyncInProgress;
  } finally {
    attendanceSyncInProgress = null;
  }
}

async function runAttendanceSync(): Promise<AttendanceSyncSummary> {
  const { sessions, sessionGroups, formResponses, validated, students, enrollments, groups } = await loadAttendanceTables();
  const processedRows = new Set(validated.map(row => row.Source_Response_Row).filter(value => /^\d+$/.test(value)));
  const processedSignatures = new Set(validated.map(row => responseSignature(row.Source_Timestamp, row.Attendance_Code, row.Input_University_Student_ID)).filter(Boolean));
  const sessionByCode = new Map(sessions.map(row => [normalizeCode(row.Attendance_Code), row]));
  const groupsBySession = groupBy(sessionGroups, row => row.Attendance_Session_ID);
  const studentsByUniversityId = groupBy(students.filter(row => normalizeId(row.Student_ID)), row => normalizeId(row.Student_ID));
  const existingValidKeys = new Set(validated.filter(row => row.Validation_Status === "Valid" && row.Attendance_Status === "Present" && row.Resolved_Academy_Student_ID && row.Attendance_Session_ID).map(row => `${row.Attendance_Session_ID}::${row.Resolved_Academy_Student_ID}`));
  const nextIds = new Set(validated.map(row => row.Attendance_ID));
  const summary = createSyncSummary(formResponses.length);

  await processAttendanceSyncPass({ formResponses, processedRows, processedSignatures, sessionByCode, groupsBySession, studentsByUniversityId, enrollments, groups, existingValidKeys, nextIds, summary });
  const latestFormResponses = await readAttendanceFormResponses();
  summary.totalRawResponses = latestFormResponses.length;
  const latestRow = latestFormResponses.at(-1)?._rowNumber ?? 0;
  const firstPassLatestRow = formResponses.at(-1)?._rowNumber ?? 0;
  if (latestRow > firstPassLatestRow) {
    summary.newResponsesArrivedDuringSync = true;
    await processAttendanceSyncPass({ formResponses: latestFormResponses.filter(row => row._rowNumber > firstPassLatestRow), processedRows, processedSignatures, sessionByCode, groupsBySession, studentsByUniversityId, enrollments, groups, existingValidKeys, nextIds, summary });
  }

  console.info("attendance.sync.summary", { totalRawResponses: summary.totalRawResponses, alreadyProcessed: summary.alreadyProcessed, newProcessed: summary.newProcessed, validPresent: summary.validPresent, needsReview: summary.needsReview, duplicates: summary.duplicates, invalidCodes: summary.invalidCodes, studentNotFound: summary.studentNotFound, enrollmentNotFound: summary.enrollmentNotFound, notEligible: summary.notEligible, skippedMissingTimestamp: summary.skippedMissingTimestamp, skippedMissingAttendanceCode: summary.skippedMissingAttendanceCode, skippedMissingUniversityStudentId: summary.skippedMissingUniversityStudentId, errors: summary.errors, lastProcessedSourceRow: summary.lastProcessedSourceRow, newResponsesArrivedDuringSync: summary.newResponsesArrivedDuringSync });
  return summary;
}

export async function applyManualAttendanceAction(input: { attendanceSessionId: string; enrollmentId?: string; attendanceId?: string; sourceResponseRow?: string; resolvedAcademyStudentId?: string; action: ManualAttendanceAction; note?: string }, reviewer: string) {
  const { sessions, sessionGroups, validated, students, enrollments } = await loadAttendanceTablesWithoutFormResponses();
  const session = sessions.find(row => row.Attendance_Session_ID === input.attendanceSessionId);
  if (!session) throw new ServiceError("ATTENDANCE_SESSION_NOT_FOUND", "Attendance session was not found.", 404);
  const selectedRecord = findSelectedAttendanceRecord(input, validated);
  const enrollmentId = input.enrollmentId || selectedRecord?.Enrollment_ID || "";
  const academyStudentId = input.resolvedAcademyStudentId || selectedRecord?.Resolved_Academy_Student_ID || "";
  let enrollment = enrollments.find(row => row.Enrollment_ID === enrollmentId);
  const allowedGroupIds = new Set(sessionGroups.filter(row => row.Attendance_Session_ID === session.Attendance_Session_ID).map(row => row.Group_ID.trim()));
  if (!enrollment && academyStudentId) {
    const possibleEnrollments = enrollments.filter(row => row.Academy_Student_ID === academyStudentId && row.Group_ID && allowedGroupIds.has(row.Group_ID.trim()) && !ACTIVE_EXCLUDED_STATUSES.has(normalizeCode(row.Enrollment_Status)));
    if (possibleEnrollments.length > 1) throw new ServiceError("ATTENDANCE_ENROLLMENT_AMBIGUOUS", "Cannot approve automatically. Enrollment needs review.", 409);
    enrollment = possibleEnrollments[0];
  }
  if (!enrollment && input.action === "REJECT" && selectedRecord) {
    const now = new Date().toISOString();
    const status = manualStatus(input.action);
    await updateRecord("Attendance_Validated", selectedRecord._rowNumber, {
      ...selectedRecord,
      Attendance_Status: status.attendanceStatus,
      Validation_Status: status.validationStatus,
      Validated_At: now,
      Reviewed_By: reviewer,
      Review_Status: status.reviewStatus,
      Notes: appendManualNote(selectedRecord.Notes ?? "", input.note?.trim() || status.defaultNote),
    });
    return { message: `${status.attendanceStatus} attendance saved.`, attendanceId: selectedRecord.Attendance_ID };
  }
  if (!enrollment) throw new ServiceError("ENROLLMENT_NOT_FOUND", "Enrollment was not found.", 404);
  if (!enrollment.Group_ID || !allowedGroupIds.has(enrollment.Group_ID)) throw new ServiceError("ATTENDANCE_ENROLLMENT_NOT_ELIGIBLE", "This enrollment is not eligible for the selected attendance session.", 409);
  const student = students.find(row => row.Academy_Student_ID === enrollment.Academy_Student_ID);
  if (!student) throw new ServiceError("STUDENT_NOT_FOUND", "Student was not found.", 404);
  const existing = selectedRecord ? [selectedRecord] : validated.filter(row => row.Attendance_Session_ID === session.Attendance_Session_ID && row.Enrollment_ID === enrollment.Enrollment_ID);
  if (!selectedRecord && existing.length > 1) throw new ServiceError("ATTENDANCE_CONFLICT", "Multiple attendance records already exist for this enrollment and session. Review manually.", 409);
  if (existing[0] && attendanceStatusFromRecord(existing[0]) === "Present" && !isManualRecord(existing[0])) throw new ServiceError("ATTENDANCE_AUTOMATIC_RECORD_EXISTS", "An automatic valid present record already exists for this enrollment and session.", 409);
  const now = new Date().toISOString();
  const status = manualStatus(input.action);
  const selectedNotes = existing[0]?.Notes ?? "";
  const defaultNote = input.action === "PRESENT" && existing[0] && attendanceStatusFromRecord(existing[0]) === "Needs Review"
    ? "Manually approved as present from Needs Review."
    : status.defaultNote;
  const record: AttendanceValidatedRow = {
    Attendance_ID: existing[0]?.Attendance_ID || nextAttendanceId(new Set(validated.map(row => row.Attendance_ID))),
    Source_Response_Row: existing[0]?.Source_Response_Row || "MANUAL",
    Source_Timestamp: existing[0]?.Source_Timestamp || now,
    Attendance_Code: existing[0]?.Attendance_Code || session.Attendance_Code,
    Attendance_Session_ID: session.Attendance_Session_ID,
    Input_University_Student_ID: existing[0]?.Input_University_Student_ID || student.Student_ID,
    Resolved_Academy_Student_ID: student.Academy_Student_ID,
    Enrollment_ID: enrollment.Enrollment_ID,
    Resolved_Group_ID: enrollment.Group_ID,
    Student_Name: existing[0]?.Student_Name || student.Student_Name,
    Input_Phone: existing[0]?.Input_Phone || student.Phone,
    Attendance_Status: status.attendanceStatus,
    Validation_Status: status.validationStatus,
    Submitted_At: existing[0]?.Submitted_At || now,
    Validated_At: now,
    Reviewed_By: reviewer,
    Review_Status: status.reviewStatus,
    Notes: appendManualNote(selectedNotes, input.note?.trim() || defaultNote),
  };
  if (existing[0]) await updateRecord("Attendance_Validated", existing[0]._rowNumber, record);
  else await appendRecordToDataRegion("Attendance_Validated", record);
  return { message: `${status.attendanceStatus} attendance saved.`, attendanceId: record.Attendance_ID };
}

export async function getStudentAttendanceHistory(academyStudentId: string): Promise<StudentAttendanceHistory[]> {
  const { sessions, sessionGroups, validated, students, enrollments, groups } = await loadAttendanceTablesWithoutFormResponses();
  const student = students.find(row => row.Academy_Student_ID === academyStudentId);
  if (!student) return [];
  const studentEnrollments = enrollments.filter(row => row.Academy_Student_ID === academyStudentId);
  const groupById = new Map(groups.map(row => [row.Group_ID, row]));
  const groupsBySession = groupBy(sessionGroups, row => row.Attendance_Session_ID);
  const today = localDateValue();
  return studentEnrollments.map(enrollment => {
    const rows = sessions.filter(session => session.Session_Date && dateOnly(session.Session_Date) <= today && (groupsBySession.get(session.Attendance_Session_ID) ?? []).some(item => item.Group_ID === enrollment.Group_ID)).map(session => {
      const match = validated.find(row => row.Attendance_Session_ID === session.Attendance_Session_ID && row.Enrollment_ID === enrollment.Enrollment_ID);
      const status = attendanceStatusFromRecord(match);
      return {
        enrollmentId: enrollment.Enrollment_ID,
        sessionDate: session.Session_Date ?? "",
        time: [session.Start_Time ?? "", session.End_Time ?? ""].filter(Boolean).join(" - "),
        attendanceCode: session.Attendance_Code,
        sessionNumber: session.Session_Number ?? "",
        trackContext: session.Track ?? session.Track_Context ?? session.Session_Title ?? session.Title ?? "",
        groupName: groupById.get(enrollment.Group_ID)?.Group_Name ?? enrollment.Group_ID,
        attendanceStatus: status,
        validationStatus: match?.Validation_Status ?? "Absent",
        notes: match?.Notes ?? "",
      };
    }).sort((left, right) => sheetDateTimeSortKey(right.sessionDate, right.time).localeCompare(sheetDateTimeSortKey(left.sessionDate, left.time)));
    const total = rows.length;
    const present = rows.filter(row => row.attendanceStatus === "Present").length;
    const absent = rows.filter(row => row.attendanceStatus === "Absent").length;
    const excused = rows.filter(row => row.attendanceStatus === "Excused").length;
    const needsReview = rows.filter(row => row.attendanceStatus === "Needs Review").length;
    return { enrollmentId: enrollment.Enrollment_ID, totalTakenSessions: total, present, absent, excused, needsReview, attendancePercent: total ? Math.round((present / total) * 100) : 0, rows };
  });
}

async function loadAttendanceTables() {
  await validateAttendanceHeaders();
  const [sessions, sessionGroups, formResponses, validated, students, enrollments, groups, batches] = await Promise.all([
    readSheetDataRegion<AttendanceSessionRow>("Attendance_Sessions"),
    readSheetDataRegion<AttendanceSessionGroupRow>("Attendance_Session_Groups"),
    readAttendanceFormResponses(),
    readSheetDataRegion<AttendanceValidatedRow>("Attendance_Validated"),
    readSheet<StudentRow>("Students"),
    readSheet<EnrollmentRow>("Enrollments"),
    readSheetDataRegion<GroupRow>("Groups"),
    readSheetDataRegion<BatchRow>("Batches"),
  ]);
  return { sessions: normalizeAttendanceSessions(sessions), sessionGroups, formResponses, validated, students, enrollments, groups, batches };
}

async function loadAttendanceTablesWithoutFormResponses() {
  await validateAttendanceHeaders();
  const [sessions, sessionGroups, validated, students, enrollments, groups, batches] = await Promise.all([
    readSheetDataRegion<AttendanceSessionRow>("Attendance_Sessions"),
    readSheetDataRegion<AttendanceSessionGroupRow>("Attendance_Session_Groups"),
    readSheetDataRegion<AttendanceValidatedRow>("Attendance_Validated"),
    readSheet<StudentRow>("Students"),
    readSheet<EnrollmentRow>("Enrollments"),
    readSheetDataRegion<GroupRow>("Groups"),
    readSheetDataRegion<BatchRow>("Batches"),
  ]);
  return { sessions: normalizeAttendanceSessions(sessions), sessionGroups, validated, students, enrollments, groups, batches };
}

async function processAttendanceSyncPass({ formResponses, processedRows, processedSignatures, sessionByCode, groupsBySession, studentsByUniversityId, enrollments, groups, existingValidKeys, nextIds, summary }: {
  formResponses: Array<SheetRow<AttendanceFormResponseRow>>;
  processedRows: Set<string>;
  processedSignatures: Set<string>;
  sessionByCode: Map<string, SheetRow<AttendanceSessionRow>>;
  groupsBySession: Map<string, SheetRow<AttendanceSessionGroupRow>[]>;
  studentsByUniversityId: Map<string, SheetRow<StudentRow>[]>;
  enrollments: Array<SheetRow<EnrollmentRow>>;
  groups: Array<SheetRow<GroupRow>>;
  existingValidKeys: Set<string>;
  nextIds: Set<string>;
  summary: AttendanceSyncSummary;
}) {
  const now = new Date().toISOString();
  const newRows: AttendanceValidatedRow[] = [];
  for (const response of formResponses) {
    const sourceRow = String(response._rowNumber);
    const signature = responseSignature(response.Timestamp, response.Attendance_Code, response.University_Student_ID);
    const hasStableSourceRow = /^\d+$/.test(sourceRow);
    if (processedRows.has(sourceRow) || (!hasStableSourceRow && !!signature && processedSignatures.has(signature))) {
      summary.alreadyProcessed++;
      continue;
    }
    if (!response.Timestamp.trim()) {
      processedRows.add(sourceRow);
      summary.skippedMissingTimestamp++;
      continue;
    }
    if (!response.Attendance_Code.trim()) {
      processedRows.add(sourceRow);
      summary.skippedMissingAttendanceCode++;
      continue;
    }
    if (!response.University_Student_ID.trim()) {
      processedRows.add(sourceRow);
      summary.skippedMissingUniversityStudentId++;
      continue;
    }
    const result = validateResponse(response, sessionByCode, groupsBySession, studentsByUniversityId, enrollments, groups, existingValidKeys);
    const attendanceId = nextAttendanceId(nextIds);
    nextIds.add(attendanceId);
    processedRows.add(sourceRow);
    if (signature) processedSignatures.add(signature);
    if (result.validationStatus === "Valid" && result.attendanceStatus === "Present" && result.sessionId && result.academyStudentId) existingValidKeys.add(`${result.sessionId}::${result.academyStudentId}`);
    newRows.push(sheetSafeAttendanceRecord({
      Attendance_ID: attendanceId,
      Source_Response_Row: sourceRow,
      Source_Timestamp: response.Timestamp,
      Attendance_Code: response.Attendance_Code,
      Attendance_Session_ID: result.sessionId,
      Input_University_Student_ID: response.University_Student_ID,
      Resolved_Academy_Student_ID: result.academyStudentId,
      Enrollment_ID: result.enrollmentId,
      Resolved_Group_ID: result.groupId,
      Student_Name: response.Student_Name,
      Input_Phone: response.Phone,
      Attendance_Status: result.attendanceStatus,
      Validation_Status: result.validationStatus,
      Submitted_At: response.Timestamp,
      Validated_At: now,
      Reviewed_By: "",
      Review_Status: result.validationStatus === "Valid" ? "Auto Validated" : "Pending Review",
      Notes: result.notes,
    }));
    summary.newProcessed++;
    summary.lastProcessedSourceRow = sourceRow;
    if (result.attendanceStatus === "Needs Review") summary.needsReview++;
    if (result.validationStatus === "Valid") summary.validPresent++;
    if (result.validationStatus === "Duplicate") summary.duplicates++;
    if (result.validationStatus === "Invalid Code") summary.invalidCodes++;
    if (result.validationStatus === "Student Not Found") summary.studentNotFound++;
    if (result.validationStatus === "Enrollment Not Found") summary.enrollmentNotFound++;
    if (result.validationStatus === "Not Eligible For Session") summary.notEligible++;
  }
  if (newRows.length) await appendAttendanceValidatedRowsSafely(newRows);
}

async function appendAttendanceValidatedRowsSafely(rows: AttendanceValidatedRow[]) {
  try {
    await atomicSheetMutation({ appends: rows.map(record => ({ tab: "Attendance_Validated", record: sheetSafeAttendanceRecord(record) })) });
  } catch (error) {
    const current = await readSheetDataRegion<AttendanceValidatedRow>("Attendance_Validated").catch(() => []);
    const confirmed = rows.every(row => current.some(currentRow => currentRow.Attendance_ID === row.Attendance_ID || currentRow.Source_Response_Row === row.Source_Response_Row));
    if (!confirmed) throw googleWorkspaceError(error, "writing attendance sync validation rows");
  }
}

function createSyncSummary(totalRawResponses: number): AttendanceSyncSummary {
  return { totalRawResponses, alreadyProcessed: 0, newProcessed: 0, validPresent: 0, needsReview: 0, duplicates: 0, invalidCodes: 0, studentNotFound: 0, enrollmentNotFound: 0, notEligible: 0, skippedMissingTimestamp: 0, skippedMissingAttendanceCode: 0, skippedMissingUniversityStudentId: 0, errors: 0, lastProcessedSourceRow: "", newResponsesArrivedDuringSync: false };
}

async function validateAttendanceHeaders() {
  const [sessionHeaders, sessionGroupHeaders, validatedHeaders] = await Promise.all([
    getHeaders("Attendance_Sessions"),
    getHeaders("Attendance_Session_Groups"),
    getHeaders("Attendance_Validated"),
  ]);
  requireHeaders("Attendance_Sessions", sessionHeaders, ["Attendance_Session_ID", "Attendance_Code"]);
  requireHeaders("Attendance_Session_Groups", sessionGroupHeaders, ["Attendance_Session_ID", "Group_ID"]);
  const missingValidated = VALIDATED_HEADERS.filter(header => !validatedHeaders.includes(header));
  if (missingValidated.length) throw new ServiceError("ATTENDANCE_CONFIGURATION_ERROR", `Attendance_Validated is missing required header: ${missingValidated[0]}`, 503);
  const extraOrderMismatch = VALIDATED_HEADERS.some((header, index) => validatedHeaders[index] !== header);
  if (extraOrderMismatch) throw new ServiceError("ATTENDANCE_CONFIGURATION_ERROR", "Attendance_Validated headers do not match the required structure.", 503);
}

function requireHeaders(sheet: string, headers: string[], required: string[]) {
  const missing = required.filter(header => !headers.includes(header));
  if (missing.length) throw new ServiceError("ATTENDANCE_CONFIGURATION_ERROR", `${sheet} is missing required header: ${missing[0]}`, 503);
}

async function readAttendanceFormResponses(): Promise<Array<SheetRow<AttendanceFormResponseRow>>> {
  const sheets = await getSheetsClient();
  const response = await withAttendanceReadRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: getSpreadsheetId(), range: "'Attendance_Form_Responses'!A:ZZ" }));
  const values = response.data.values ?? [];
  const headers = (values[0] ?? []).map(header => String(header).trim());
  requireHeaders("Attendance_Form_Responses", headers, FORM_REQUIRED_HEADERS);
  return values.slice(1).map((cells, index) => {
    const record: Record<string, string | number> = { _rowNumber: index + 2, Student_Name: "", Phone: "" };
    headers.forEach((header, column) => { record[header] = String(cells[column] ?? "").trim(); });
    return record as SheetRow<AttendanceFormResponseRow>;
  }).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && String(value).trim() !== ""));
}

function validateResponse(response: SheetRow<AttendanceFormResponseRow>, sessionByCode: Map<string, SheetRow<AttendanceSessionRow>>, groupsBySession: Map<string, SheetRow<AttendanceSessionGroupRow>[]>, studentsByUniversityId: Map<string, SheetRow<StudentRow>[]>, enrollments: Array<SheetRow<EnrollmentRow>>, groups: Array<SheetRow<GroupRow>>, existingValidKeys: Set<string>) {
  const session = sessionByCode.get(normalizeCode(response.Attendance_Code));
  if (!session) return invalid("Invalid Code", "Attendance code was not found.");
  const inputStudentId = normalizeId(response.University_Student_ID);
  const matchingStudents = studentsByUniversityId.get(inputStudentId) ?? [];
  if (!inputStudentId || !matchingStudents.length) return invalid("Student Not Found", "University Student ID was not found.", session.Attendance_Session_ID);
  if (matchingStudents.length > 1) return invalid("Duplicate Student ID In Database", "More than one student has this University Student ID.", session.Attendance_Session_ID);
  const student = matchingStudents[0];
  const allowedGroupIds = new Set((groupsBySession.get(session.Attendance_Session_ID) ?? []).map(row => row.Group_ID.trim()).filter(Boolean));
  const studentEnrollments = enrollments.filter(enrollment => enrollment.Academy_Student_ID === student.Academy_Student_ID && !ACTIVE_EXCLUDED_STATUSES.has(normalizeCode(enrollment.Enrollment_Status)));
  if (!studentEnrollments.length) return invalid("Enrollment Not Found", "Student does not have an active enrollment.", session.Attendance_Session_ID, student.Academy_Student_ID);
  const eligibleEnrollments = studentEnrollments.filter(enrollment => enrollment.Group_ID && allowedGroupIds.has(enrollment.Group_ID.trim()));
  if (!eligibleEnrollments.length) return invalid("Not Eligible For Session", "Student does not have a current enrollment in an allowed group for this attendance session.", session.Attendance_Session_ID, student.Academy_Student_ID);
  if (eligibleEnrollments.length > 1) return invalid("Multiple Matching Enrollments", "More than one enrollment matched this attendance session.", session.Attendance_Session_ID, student.Academy_Student_ID);
  const enrollment = eligibleEnrollments[0];
  const duplicateKey = `${session.Attendance_Session_ID}::${student.Academy_Student_ID}`;
  if (existingValidKeys.has(duplicateKey)) return { sessionId: session.Attendance_Session_ID, academyStudentId: student.Academy_Student_ID, enrollmentId: enrollment.Enrollment_ID, groupId: enrollment.Group_ID, attendanceStatus: "Needs Review", validationStatus: "Duplicate", notes: "A valid present record already exists for this student and attendance session." };
  const groupExists = groups.some(group => group.Group_ID === enrollment.Group_ID);
  return { sessionId: session.Attendance_Session_ID, academyStudentId: student.Academy_Student_ID, enrollmentId: enrollment.Enrollment_ID, groupId: enrollment.Group_ID, attendanceStatus: "Present", validationStatus: "Valid", notes: groupExists ? "" : "Resolved group ID is not available in Groups." };
}

function invalid(validationStatus: string, notes: string, sessionId = "", academyStudentId = "") {
  return { sessionId, academyStudentId, enrollmentId: "", groupId: "", attendanceStatus: "Needs Review", validationStatus, notes };
}

function sessionDto(row: SheetRow<AttendanceSessionRow>, batchById: Map<string, SheetRow<BatchRow>>): AttendanceSessionDto {
  const batch = batchById.get(row.Batch_ID ?? "");
  return {
    attendanceSessionId: row.Attendance_Session_ID,
    attendanceCode: row.Attendance_Code,
    batchId: row.Batch_ID ?? "",
    batchName: batch?.Batch_Name ?? "",
    sessionDate: row.Session_Date ?? "",
    startTime: row.Start_Time ?? "",
    endTime: row.End_Time ?? "",
    sessionNumber: row.Session_Number ?? "",
    durationHours: row.Duration_Hours ?? "",
    isExtraSession: row.Is_Extra_Session ?? "",
    status: row.Status ?? row.Session_Status ?? "",
    trackContext: row.Track ?? row.Track_Context ?? row.Group_Context ?? "",
    sessionTitle: row.Session_Title ?? row.Title ?? "",
    deliveryMode: row.Delivery_Mode ?? "",
  };
}

function batchOptions(batches: Array<SheetRow<BatchRow>>): AttendanceBatchOptionDto[] {
  return batches.map(row => ({ batchId: row.Batch_ID, batchName: row.Batch_Name, status: row.Status, intake: row.Intake })).sort((left, right) => left.batchName.localeCompare(right.batchName) || left.batchId.localeCompare(right.batchId));
}

function normalizeAttendanceSessions(rows: Array<SheetRow<AttendanceSessionRow>>) {
  return rows.map(row => normalizeAttendanceSessionDateFields(row) as SheetRow<AttendanceSessionRow>);
}

function formResponseDto(row: SheetRow<AttendanceFormResponseRow>): AttendanceFormResponseDto {
  return { sourceResponseRow: row._rowNumber, timestamp: row.Timestamp, attendanceCode: row.Attendance_Code, universityStudentId: row.University_Student_ID, studentName: row.Student_Name, phone: row.Phone ?? "" };
}

function buildValidatedDtos(validated: Array<SheetRow<AttendanceValidatedRow>>, students: Array<SheetRow<StudentRow>>, groups: Array<SheetRow<GroupRow>>): AttendanceValidatedDto[] {
  const studentByAcademyId = new Map(students.map(row => [row.Academy_Student_ID, row]));
  const groupById = new Map(groups.map(row => [row.Group_ID, row]));
  return validated.map(row => {
    const student = studentByAcademyId.get(row.Resolved_Academy_Student_ID);
    const group = groupById.get(row.Resolved_Group_ID);
    return {
      attendanceId: row.Attendance_ID,
      sourceResponseRow: row.Source_Response_Row,
      sourceTimestamp: row.Source_Timestamp,
      attendanceCode: row.Attendance_Code,
      attendanceSessionId: row.Attendance_Session_ID,
      inputUniversityStudentId: row.Input_University_Student_ID,
      resolvedAcademyStudentId: row.Resolved_Academy_Student_ID,
      enrollmentId: row.Enrollment_ID,
      resolvedGroupId: row.Resolved_Group_ID,
      resolvedGroupName: group?.Group_Name ?? "",
      studentName: row.Student_Name,
      inputPhone: row.Input_Phone,
      studentUniversity: student?.University ?? "",
      attendanceStatus: row.Attendance_Status,
      validationStatus: row.Validation_Status,
      submittedAt: row.Submitted_At,
      validatedAt: row.Validated_At,
      reviewedBy: row.Reviewed_By,
      reviewStatus: row.Review_Status,
      notes: row.Notes,
    };
  });
}

function buildSessionReviews(sessions: Array<SheetRow<AttendanceSessionRow>>, sessionGroups: Array<SheetRow<AttendanceSessionGroupRow>>, validated: Array<SheetRow<AttendanceValidatedRow>>, students: Array<SheetRow<StudentRow>>, enrollments: Array<SheetRow<EnrollmentRow>>, groups: Array<SheetRow<GroupRow>>, batchById: Map<string, SheetRow<BatchRow>>): AttendanceSessionReviewDto[] {
  const studentByAcademyId = new Map(students.map(row => [row.Academy_Student_ID, row]));
  const groupById = new Map(groups.map(row => [row.Group_ID, row]));
  const groupsBySession = groupBy(sessionGroups, row => row.Attendance_Session_ID);
  return sessions.map(session => {
    const allowedGroupIds = new Set((groupsBySession.get(session.Attendance_Session_ID) ?? []).map(row => row.Group_ID.trim()).filter(Boolean));
    const expected = enrollments.filter(enrollment => enrollment.Group_ID && allowedGroupIds.has(enrollment.Group_ID.trim()) && !ACTIVE_EXCLUDED_STATUSES.has(normalizeCode(enrollment.Enrollment_Status)));
    const sessionValidated = validated.filter(row => row.Attendance_Session_ID === session.Attendance_Session_ID);
    const usedValidatedIds = new Set<string>();
    const rows = expected.map(enrollment => {
      const student = studentByAcademyId.get(enrollment.Academy_Student_ID);
      const match = selectAttendanceRecord(sessionValidated, enrollment);
      if (match?.Attendance_ID) usedValidatedIds.add(match.Attendance_ID);
      const attendanceStatus = attendanceStatusFromRecord(match);
      return {
        attendanceId: match?.Attendance_ID ?? "",
        sourceResponseRow: match?.Source_Response_Row ?? "",
        studentName: student?.Student_Name ?? "Unknown Student",
        phone: student?.Phone ?? "",
        email: student?.Email ?? "",
        academyStudentId: enrollment.Academy_Student_ID,
        universityStudentId: student?.Student_ID ?? "",
        studentUniversity: student?.University ?? "",
        groupId: enrollment.Group_ID,
        groupName: groupById.get(enrollment.Group_ID)?.Group_Name ?? enrollment.Group_ID,
        enrollmentId: enrollment.Enrollment_ID,
        attendanceStatus,
        validationStatus: match?.Validation_Status ?? "Absent",
        attendanceCode: session.Attendance_Code,
      };
    });
    const exceptionRows = sessionValidated.filter(row => row.Attendance_ID && !usedValidatedIds.has(row.Attendance_ID) && attendanceStatusFromRecord(row) === "Needs Review").map(row => {
      const student = studentByAcademyId.get(row.Resolved_Academy_Student_ID);
      const group = groupById.get(row.Resolved_Group_ID);
      return {
        attendanceId: row.Attendance_ID,
        sourceResponseRow: row.Source_Response_Row,
        studentName: row.Student_Name || student?.Student_Name || "Unknown Student",
        phone: row.Input_Phone || student?.Phone || "",
        email: student?.Email ?? "",
        academyStudentId: row.Resolved_Academy_Student_ID,
        universityStudentId: row.Input_University_Student_ID || student?.Student_ID || "",
        studentUniversity: student?.University ?? "",
        groupId: row.Resolved_Group_ID,
        groupName: group?.Group_Name ?? row.Resolved_Group_ID,
        enrollmentId: row.Enrollment_ID,
        attendanceStatus: attendanceStatusFromRecord(row),
        validationStatus: row.Validation_Status,
        attendanceCode: row.Attendance_Code || session.Attendance_Code,
      };
    });
    rows.push(...exceptionRows);
    return {
      sessionId: session.Attendance_Session_ID,
      attendanceCode: session.Attendance_Code,
      batchId: session.Batch_ID ?? "",
      batchName: batchById.get(session.Batch_ID ?? "")?.Batch_Name ?? "",
      sessionDate: session.Session_Date ?? "",
      startTime: session.Start_Time ?? "",
      endTime: session.End_Time ?? "",
      sessionNumber: session.Session_Number ?? "",
      durationHours: session.Duration_Hours ?? "",
      isExtraSession: session.Is_Extra_Session ?? "",
      trackContext: session.Track ?? session.Track_Context ?? session.Group_Context ?? "",
      sessionTitle: session.Session_Title ?? session.Title ?? "",
      deliveryMode: session.Delivery_Mode ?? "",
      expectedStudents: rows.length,
      presentStudents: rows.filter(row => row.attendanceStatus === "Present").length,
      needsReview: rows.filter(row => row.attendanceStatus === "Needs Review").length,
      absentStudents: rows.filter(row => row.attendanceStatus === "Absent").length,
      excusedStudents: rows.filter(row => row.attendanceStatus === "Excused").length,
      rows,
    };
  });
}

function dedupeMatrixCorrectionRecords(records: Array<{ studentId: string; attendanceSessionId: string }>) {
  const seen = new Set<string>();
  const result: Array<{ studentId: string; attendanceSessionId: string }> = [];
  for (const record of records) {
    const studentId = record.studentId.trim();
    const attendanceSessionId = record.attendanceSessionId.trim();
    if (!studentId || !attendanceSessionId) continue;
    const key = `${normalizeId(studentId)}::${attendanceSessionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ studentId, attendanceSessionId });
  }
  return result;
}

function uniqueSheetRowsByNumber<T extends { _rowNumber: number }>(rows: T[]) {
  const byRowNumber = new Map<number, T>();
  for (const row of rows) byRowNumber.set(row._rowNumber, row);
  return [...byRowNumber.values()];
}

function correctionError(record: { studentId: string; attendanceSessionId: string }, reason: string, status = 409, code = "ATTENDANCE_MATRIX_CORRECTION_REJECTED") {
  return new ServiceError(code, `${record.studentId} | ${record.attendanceSessionId}: ${reason}`, status);
}

function sheetSafeAttendanceRecord(record: AttendanceValidatedRow): AttendanceValidatedRow {
  return Object.fromEntries(VALIDATED_HEADERS.map(header => {
    const value = record[header] ?? "";
    if (typeof value === "number") return [header, Number.isFinite(value) ? value : ""];
    if (typeof value === "boolean") return [header, value ? "TRUE" : "FALSE"];
    return [header, String(value ?? "")];
  })) as AttendanceValidatedRow;
}

function reserveNextAttendanceId(existing: Set<string>) {
  const id = nextAttendanceId(existing);
  existing.add(id);
  return id;
}

function activeMapping(row: SheetRow<AttendanceSessionGroupRow>) {
  const value = normalizeCode(row.Is_Active || row.Access_Status || "TRUE");
  return !["FALSE", "NO", "0", "DISABLED", "INACTIVE"].includes(value);
}

function isContentOnlyExtraSession(session: SheetRow<AttendanceSessionRow>) {
  return numberValue(session.Session_Number) === 0 && numberValue(session.Duration_Hours) === 0 && ["TRUE", "YES", "1"].includes(normalizeCode(session.Is_Extra_Session ?? ""));
}

function dedupeEnrollmentsForMatrix(enrollments: Array<SheetRow<EnrollmentRow>>) {
  const byStudent = new Map<string, SheetRow<EnrollmentRow>>();
  for (const enrollment of enrollments) {
    const current = byStudent.get(enrollment.Academy_Student_ID);
    if (!current || enrollmentRank(enrollment) > enrollmentRank(current)) byStudent.set(enrollment.Academy_Student_ID, enrollment);
  }
  return [...byStudent.values()];
}

function enrollmentRank(enrollment: SheetRow<EnrollmentRow>) {
  const status = normalizeCode(enrollment.Enrollment_Status);
  if (status === "ACTIVE") return 40;
  if (status === "REGISTERED") return 30;
  if (status === "COMPLETED") return 20;
  return 10;
}

function matrixStatusFromRecord(row: SheetRow<AttendanceValidatedRow> | undefined): AttendanceMatrixStatus {
  const status = attendanceStatusFromRecord(row);
  if (status === "Present") return "PRESENT";
  if (status === "Excused") return "EXCUSED";
  if (status === "Needs Review" || status === "Rejected") return "PENDING";
  return "ABSENT";
}

function packageHours(enrollment: SheetRow<EnrollmentRow>) {
  const parsed = numberValue(enrollment["Credit Hours"] || enrollment.Package_Label.match(/\d+/)?.[0] || "");
  return parsed || null;
}

function attendanceModeForEnrollment(enrollment: SheetRow<EnrollmentRow>, group: SheetRow<GroupRow> | undefined) {
  const mode = normalizeCode(enrollment.Delivery_Mode);
  if (mode === "HYBRID") return "HYBRID";
  if (mode) return mode;
  const modes = new Set([normalizeCode(group?.Level_1_Attendance_Mode ?? ""), normalizeCode(group?.Level_2_Attendance_Mode ?? "")].filter(Boolean));
  return modes.size > 1 ? "HYBRID" : [...modes][0] ?? "";
}

function uniqueUniversities(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean).map(value => value || "Unknown University"))].sort();
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function attendanceStatusFromRecord(row: SheetRow<AttendanceValidatedRow> | undefined) {
  if (!row) return "Absent" as const;
  const attendance = normalizeCode(row.Attendance_Status);
  const validation = normalizeCode(row.Validation_Status);
  if (attendance === "REJECTED" || validation === "MANUAL REJECTED") return "Rejected" as const;
  if (attendance === "EXCUSED" || validation === "MANUAL EXCUSED") return "Excused" as const;
  if (attendance === "PRESENT" || validation === "VALID" || validation === "MANUAL PRESENT") return "Present" as const;
  return "Needs Review" as const;
}

function selectAttendanceRecord(rows: Array<SheetRow<AttendanceValidatedRow>>, enrollment: SheetRow<EnrollmentRow>) {
  const linked = rows.filter(row => row.Enrollment_ID === enrollment.Enrollment_ID || (!row.Enrollment_ID && row.Resolved_Academy_Student_ID === enrollment.Academy_Student_ID));
  return linked.sort((left, right) => attendancePriority(right) - attendancePriority(left))[0];
}

function attendancePriority(row: SheetRow<AttendanceValidatedRow>) {
  const status = attendanceStatusFromRecord(row);
  const validation = normalizeCode(row.Validation_Status);
  if (status === "Present" && validation === "VALID") return 50;
  if (status === "Present") return 40;
  if (status === "Excused") return 30;
  if (status === "Needs Review") return 20;
  if (status === "Rejected") return 10;
  return 0;
}

function isManualRecord(row: SheetRow<AttendanceValidatedRow>) {
  return row.Source_Response_Row === "MANUAL" || normalizeCode(row.Validation_Status).startsWith("MANUAL ");
}

function manualStatus(action: ManualAttendanceAction) {
  if (action === "PRESENT") return { attendanceStatus: "Present", validationStatus: "Manual Present", reviewStatus: "Approved", defaultNote: "Marked present manually" };
  if (action === "EXCUSED") return { attendanceStatus: "Excused", validationStatus: "Manual Excused", reviewStatus: "Approved", defaultNote: "Marked excused manually." };
  if (action === "REJECT") return { attendanceStatus: "Rejected", validationStatus: "Manual Rejected", reviewStatus: "Rejected", defaultNote: "Rejected manually." };
  return { attendanceStatus: "Needs Review", validationStatus: "Manual Needs Review", reviewStatus: "Pending", defaultNote: "Manual review required" };
}

function findSelectedAttendanceRecord(input: { attendanceSessionId: string; enrollmentId?: string; attendanceId?: string; sourceResponseRow?: string; resolvedAcademyStudentId?: string }, validated: Array<SheetRow<AttendanceValidatedRow>>) {
  if (input.attendanceId) return validated.find(row => row.Attendance_ID === input.attendanceId && row.Attendance_Session_ID === input.attendanceSessionId);
  if (input.sourceResponseRow) return validated.find(row => row.Source_Response_Row === input.sourceResponseRow && row.Attendance_Session_ID === input.attendanceSessionId);
  if (input.enrollmentId) return validated.find(row => row.Attendance_Session_ID === input.attendanceSessionId && row.Enrollment_ID === input.enrollmentId);
  if (input.resolvedAcademyStudentId) return validated.find(row => row.Attendance_Session_ID === input.attendanceSessionId && row.Resolved_Academy_Student_ID === input.resolvedAcademyStudentId);
  return undefined;
}

function appendManualNote(existingNotes: string, manualNote: string) {
  const existing = existingNotes.trim();
  if (!existing) return manualNote;
  if (existing.includes(manualNote)) return existing;
  return `${existing} ${manualNote}`;
}

function localDateValue() {
  return getCairoNowParts().date;
}

function dateOnly(value: string) {
  return value.trim().slice(0, 10);
}

function groupBy<T>(rows: T[], getKey: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return map;
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s*([-_|/])\s*/g, "$1").replace(/\s+/g, " ");
}

function normalizeId(value: string) {
  return value.trim().toUpperCase();
}

function responseSignature(timestamp: string, attendanceCode: string, universityStudentId: string) {
  const parts = [timestamp.trim(), normalizeCode(attendanceCode), normalizeId(universityStudentId)];
  if (parts.some(part => !part)) return "";
  return parts.join("::");
}

function nextAttendanceId(existing: Set<string>) {
  let next = 1;
  for (const id of existing) {
    const match = /^ATT_(\d+)$/i.exec(id.trim());
    if (match) next = Math.max(next, Number(match[1]) + 1);
  }
  let id = `ATT_${String(next).padStart(5, "0")}`;
  while (existing.has(id)) {
    next++;
    id = `ATT_${String(next).padStart(5, "0")}`;
  }
  return id;
}

async function withAttendanceReadRetry<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      if (!isTransientAttendanceReadError(error) || attempt === 2) break;
      await delay(150 * (2 ** attempt) + Math.floor(Math.random() * 75));
    }
  }
  throw lastError;
}

function isTransientAttendanceReadError(error: unknown) {
  const candidate = error as { code?: number | string; status?: number; message?: string };
  const status = Number(candidate?.code ?? candidate?.status ?? 0);
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(candidate?.message ?? "").toLowerCase();
  return message.includes("timeout") || message.includes("timed out") || message.includes("econnreset") || message.includes("socket hang up") || message.includes("temporarily unavailable");
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
