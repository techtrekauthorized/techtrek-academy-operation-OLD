import "server-only";
import type { EnrollmentRow, SheetRow, StudentRow, TrackRow } from "../types";
import type { BatchRow, GroupRow } from "@/types/operations";
import type { AssignmentGroupRow, AssignmentResultRow, AssignmentRow, SubmissionStatus, TasksGradesAssignment } from "@/types/tasks-grades";
import { deliveryModeLabel } from "@/lib/delivery-mode";
import { createXlsxWorkbookBuffer } from "../xlsx";
import { ServiceError } from "./errors";
import { enrollmentDto, studentDto } from "./mappers";
import { activeGroupsByAssignment, mapAssignment, normalizeStatus, readTasksGradesBundle, text } from "./tasks-grades-service";

type AttendanceSessionRow = Record<string, string> & {
  Attendance_Session_ID: string;
  Attendance_Code: string;
};

type AttendanceSessionGroupRow = Record<string, string> & {
  Attendance_Session_ID: string;
  Group_ID: string;
  Is_Active?: string;
  Access_Status?: string;
};

type AttendanceValidatedRow = Record<string, string> & {
  Attendance_ID: string;
  Attendance_Code: string;
  Attendance_Session_ID: string;
  Resolved_Academy_Student_ID: string;
  Enrollment_ID: string;
  Resolved_Group_ID: string;
  Attendance_Status: string;
  Validation_Status: string;
  Notes: string;
};

type AttendanceStatus = "Present" | "Needs Review" | "Absent" | "Excused" | "Rejected";

type ResolvedEnrollment = {
  enrollment: SheetRow<EnrollmentRow>;
  student: SheetRow<StudentRow>;
  group?: SheetRow<GroupRow>;
  batch?: SheetRow<BatchRow>;
  track?: SheetRow<TrackRow>;
};

type WorkEntry = {
  enrollmentId: string;
  assignment: TasksGradesAssignment;
  status: SubmissionStatus;
  grade: number | null;
  maxGrade: number | null;
  percentage: number | null;
  gradedAt: string;
};

type AttendanceHistory = {
  enrollmentId: string;
  totalTakenSessions: number;
  present: number;
  absent: number;
  excused: number;
  needsReview: number;
  attendancePercent: number;
  rows: Array<{
    sessionDate: string;
    time: string;
    attendanceCode: string;
    sessionNumber: string;
    sessionTitle: string;
    deliveryMode: string;
    groupName: string;
    attendanceStatus: AttendanceStatus;
    validationStatus: string;
  }>;
};

export async function buildGradesAttendanceExport(enrollmentIds: string[]) {
  const requestedIds = uniqueIds(enrollmentIds);
  if (!requestedIds.length) throw new ServiceError("VALIDATION_ERROR", "At least one Enrollment ID is required for export.", 400);
  if (requestedIds.length > 1000) throw new ServiceError("VALIDATION_ERROR", "Export is limited to 1000 filtered enrollment records at a time.", 400);

  const data = await readTasksGradesBundle([
    "Students",
    "Enrollments",
    "Groups",
    "Batches",
    "Tracks",
    "Attendance_Sessions",
    "Attendance_Session_Groups",
    "Attendance_Validated",
    "Assignments",
    "Assignment_Groups",
    "Assignment_Results",
  ]);

  const students = sheetRows<StudentRow>(data.Students);
  const enrollments = sheetRows<EnrollmentRow>(data.Enrollments);
  const groups = sheetRows<GroupRow>(data.Groups);
  const batches = sheetRows<BatchRow>(data.Batches);
  const tracks = sheetRows<TrackRow>(data.Tracks);
  const sessions = sheetRows<AttendanceSessionRow>(data.Attendance_Sessions).map(normalizeAttendanceSessionDateFields);
  const sessionGroups = sheetRows<AttendanceSessionGroupRow>(data.Attendance_Session_Groups);
  const validated = sheetRows<AttendanceValidatedRow>(data.Attendance_Validated);
  const assignmentRows = sheetRows<AssignmentRow>(data.Assignments);
  const assignmentGroups = sheetRows<AssignmentGroupRow>(data.Assignment_Groups);
  const assignmentResults = sheetRows<AssignmentResultRow>(data.Assignment_Results);

  const studentById = new Map(students.map(row => [row.Academy_Student_ID, row]));
  const enrollmentById = new Map(enrollments.map(row => [row.Enrollment_ID, row]));
  const groupById = new Map(groups.map(row => [row.Group_ID, row]));
  const batchById = new Map(batches.map(row => [row.Batch_ID, row]));
  const trackByOfferingId = new Map(tracks.map(row => [row.Offering_ID, row]));
  const missingEnrollmentIds = requestedIds.filter(id => !enrollmentById.has(id));
  if (missingEnrollmentIds.length) throw new ServiceError("ENROLLMENT_NOT_FOUND", "One or more selected registry rows could not be found for export.", 404);

  const selected = requestedIds.map(id => {
    const enrollment = enrollmentById.get(id)!;
    const student = studentById.get(enrollment.Academy_Student_ID);
    if (!student) throw new ServiceError("STUDENT_NOT_FOUND", "One or more selected registry rows is missing student information.", 404);
    const group = groupById.get(enrollment.Group_ID);
    return { enrollment, student, group, batch: group ? batchById.get(group.Batch_ID) : undefined, track: trackByOfferingId.get(enrollment.Offering_ID) } satisfies ResolvedEnrollment;
  });

  const groupNamesById = new Map(groups.map(row => [row.Group_ID, row.Group_Name]));
  const assignments = assignmentRows.map(row => mapAssignment(row, groupNamesById, activeGroupsByAssignment(assignmentGroups)));
  const workByEnrollment = buildWorkByEnrollment(selected, assignments, assignmentResults);
  const attendanceByEnrollment = buildAttendanceByEnrollment(selected, sessions, sessionGroups, validated);
  const dynamicAssignments = selectedDynamicAssignments(selected, assignments);

  const workbook = createXlsxWorkbookBuffer([
    mainSheet(selected, attendanceByEnrollment, workByEnrollment, dynamicAssignments),
    attendanceSheet(selected, attendanceByEnrollment),
    gradesSheet(selected, workByEnrollment),
  ]);

  return {
    buffer: workbook,
    filename: `TechTrek_Grades_Attendance_${new Date().toISOString().slice(0, 10)}.xlsx`,
    rowCount: selected.length,
  };
}

function buildWorkByEnrollment(selected: ResolvedEnrollment[], assignments: TasksGradesAssignment[], assignmentResults: Array<SheetRow<AssignmentResultRow>>) {
  const selectedIds = new Set(selected.map(item => item.enrollment.Enrollment_ID));
  const resultsByKey = new Map(assignmentResults.filter(row => selectedIds.has(row.Enrollment_ID)).map(row => [`${row.Assignment_ID}:${row.Enrollment_ID}`, row]));
  const byEnrollment = new Map<string, WorkEntry[]>();
  for (const item of selected) {
    const batchId = item.group?.Batch_ID ?? "";
    const entries = assignments.filter(assignment => assignment.batchId === batchId && assignment.isActive && assignment.groupIds.includes(item.enrollment.Group_ID)).map(assignment => {
      const result = resultsByKey.get(`${assignment.assignmentId}:${item.enrollment.Enrollment_ID}`);
      const status = result ? normalizeStatus(result.Submission_Status) : "NOT_SUBMITTED";
      const grade = result ? numericOrNull(result.Grade) : null;
      const maxGrade = assignment.maxGrade;
      return {
        enrollmentId: item.enrollment.Enrollment_ID,
        assignment,
        status,
        grade,
        maxGrade,
        percentage: grade !== null && maxGrade !== null && maxGrade > 0 ? roundPercentage((grade / maxGrade) * 100) : null,
        gradedAt: result?.Graded_At ?? result?.Updated_At ?? "",
      } satisfies WorkEntry;
    }).sort(workSort);
    byEnrollment.set(item.enrollment.Enrollment_ID, entries);
  }
  return byEnrollment;
}

function selectedDynamicAssignments(selected: ResolvedEnrollment[], assignments: TasksGradesAssignment[]) {
  const applicable = new Map<string, TasksGradesAssignment>();
  for (const item of selected) {
    const batchId = item.group?.Batch_ID ?? "";
    for (const assignment of assignments) {
      if (assignment.batchId === batchId && assignment.isActive && assignment.groupIds.includes(item.enrollment.Group_ID)) applicable.set(assignment.assignmentId, assignment);
    }
  }
  return [...applicable.values()].sort((left, right) => left.assignmentType.localeCompare(right.assignmentType) || (left.verificationOrder ?? 999999) - (right.verificationOrder ?? 999999) || left.title.localeCompare(right.title) || left.assignmentId.localeCompare(right.assignmentId));
}

function buildAttendanceByEnrollment(selected: ResolvedEnrollment[], sessions: Array<SheetRow<AttendanceSessionRow>>, sessionGroups: Array<SheetRow<AttendanceSessionGroupRow>>, validated: Array<SheetRow<AttendanceValidatedRow>>) {
  const groupsBySession = groupBy(sessionGroups.filter(activeMapping), row => row.Attendance_Session_ID);
  const validatedBySession = groupBy(validated, row => row.Attendance_Session_ID);
  const today = localDateValue();
  const byEnrollment = new Map<string, AttendanceHistory>();
  for (const item of selected) {
    const rows = sessions.filter(session => text(session.Session_Date) && dateOnly(text(session.Session_Date)) <= today && (groupsBySession.get(session.Attendance_Session_ID) ?? []).some(row => row.Group_ID === item.enrollment.Group_ID)).map(session => {
      const match = (validatedBySession.get(session.Attendance_Session_ID) ?? []).find(row => row.Enrollment_ID === item.enrollment.Enrollment_ID);
      const status = attendanceStatusFromRecord(match);
      return {
        sessionDate: session.Session_Date ?? "",
        time: [session.Start_Time ?? "", session.End_Time ?? ""].filter(Boolean).join(" - "),
        attendanceCode: session.Attendance_Code,
        sessionNumber: session.Session_Number ?? "",
        sessionTitle: session.Session_Title ?? session.Title ?? session.Track ?? session.Track_Context ?? "",
        deliveryMode: session.Delivery_Mode ?? "",
        groupName: item.group?.Group_Name ?? item.enrollment.Group_ID,
        attendanceStatus: status,
        validationStatus: match?.Validation_Status ?? "Absent",
      };
    }).sort((left, right) => sheetDateTimeSortKey(right.sessionDate, right.time).localeCompare(sheetDateTimeSortKey(left.sessionDate, left.time)));
    const total = rows.length;
    const present = rows.filter(row => row.attendanceStatus === "Present").length;
    const absent = rows.filter(row => row.attendanceStatus === "Absent").length;
    const excused = rows.filter(row => row.attendanceStatus === "Excused").length;
    const needsReview = rows.filter(row => row.attendanceStatus === "Needs Review" || row.attendanceStatus === "Rejected").length;
    byEnrollment.set(item.enrollment.Enrollment_ID, { enrollmentId: item.enrollment.Enrollment_ID, totalTakenSessions: total, present, absent, excused, needsReview, attendancePercent: total ? Math.round((present / total) * 100) : 0, rows });
  }
  return byEnrollment;
}

function mainSheet(selected: ResolvedEnrollment[], attendanceByEnrollment: Map<string, AttendanceHistory>, workByEnrollment: Map<string, WorkEntry[]>, dynamicAssignments: TasksGradesAssignment[]) {
  const fixedHeaders = [
    "Academy_Student_ID", "University_Student_ID", "Student_Name", "Email", "Phone", "University", "College", "Department", "Academic_Level", "Enrollment_ID", "Track", "Batch", "Group", "Credit_Hours", "Delivery_Mode",
    "Attendance_Total_Sessions", "Attendance_Present", "Attendance_Absent", "Attendance_Excused", "Attendance_Pending", "Attendance_Percentage",
    "Applicable_Tasks", "Tasks_Submitted", "Tasks_Graded", "Tasks_Not_Submitted", "Task_Grade_Total", "Task_Max_Grade_Total", "Task_Percentage",
    "Applicable_Projects", "Projects_Submitted", "Projects_Graded", "Projects_Not_Submitted", "Project_Grade_Total", "Project_Max_Grade_Total", "Project_Percentage",
  ];
  const assignmentHeaders = dynamicAssignments.map(assignment => `${assignment.assignmentType === "PROJECT" ? "Project" : "Task"} - ${assignment.title}${assignment.maxGrade ? ` [Max ${formatNumber(assignment.maxGrade)}]` : ""}`);
  return {
    name: "Grades & Attendance",
    rows: [
      [...fixedHeaders, ...assignmentHeaders],
      ...selected.map(item => {
        const enrollment = enrollmentDto(item.enrollment);
        const student = studentDto(item.student);
        const attendance = attendanceByEnrollment.get(enrollment.enrollmentId);
        const work = workByEnrollment.get(enrollment.enrollmentId) ?? [];
        const tasks = work.filter(row => row.assignment.assignmentType === "TASK");
        const projects = work.filter(row => row.assignment.assignmentType === "PROJECT");
        const dynamicValues = dynamicAssignments.map(assignment => assignmentCell(work.find(row => row.assignment.assignmentId === assignment.assignmentId)));
        return [
          student.academyStudentId,
          student.studentId,
          student.studentName,
          student.email,
          student.phone,
          student.university || enrollment.programScope,
          student.college,
          student.department,
          levelSelectionLabel(enrollment.levelSelection ?? ""),
          enrollment.enrollmentId,
          enrollment.track || item.track?.Track || "",
          item.batch?.Batch_Name ?? item.group?.Batch_ID ?? "",
          item.group?.Group_Name ?? enrollment.groupId,
          enrollment.exactHours,
          deliveryModeLabel(enrollment.deliveryMode),
          attendance?.totalTakenSessions ?? 0,
          attendance?.present ?? 0,
          attendance?.absent ?? 0,
          attendance?.excused ?? 0,
          attendance?.needsReview ?? 0,
          percentageLabel(attendance?.attendancePercent ?? null),
          tasks.length,
          completedCount(tasks),
          tasks.filter(row => row.status === "GRADED").length,
          tasks.filter(row => row.status === "NOT_SUBMITTED").length,
          gradeTotal(tasks),
          maxGradeTotal(tasks),
          aggregatePercentage(tasks),
          projects.length,
          completedCount(projects),
          projects.filter(row => row.status === "GRADED").length,
          projects.filter(row => row.status === "NOT_SUBMITTED").length,
          gradeTotal(projects),
          maxGradeTotal(projects),
          aggregatePercentage(projects),
          ...dynamicValues,
        ];
      }),
    ],
    widths: [...Array(fixedHeaders.length).fill(18), ...dynamicAssignments.map(() => 24)],
  };
}

function attendanceSheet(selected: ResolvedEnrollment[], attendanceByEnrollment: Map<string, AttendanceHistory>) {
  const rows = selected.flatMap(item => {
    const student = studentDto(item.student);
    const history = attendanceByEnrollment.get(item.enrollment.Enrollment_ID);
    return (history?.rows ?? []).map(row => [
      student.academyStudentId,
      student.studentId,
      student.studentName,
      item.enrollment.Enrollment_ID,
      item.batch?.Batch_Name ?? item.group?.Batch_ID ?? "",
      item.group?.Group_Name ?? item.enrollment.Group_ID,
      row.sessionNumber,
      row.sessionTitle,
      row.sessionDate,
      row.time,
      deliveryModeLabel(row.deliveryMode),
      row.attendanceStatus,
      row.validationStatus,
    ]);
  });
  return {
    name: "Attendance Details",
    rows: [["Academy_Student_ID", "University_Student_ID", "Student_Name", "Enrollment_ID", "Batch", "Group", "Session_Number", "Session_Title", "Session_Date", "Time", "Delivery_Mode", "Attendance_Status", "Validation_Status"], ...rows],
    widths: [18, 20, 28, 20, 26, 30, 16, 34, 16, 18, 16, 18, 20],
  };
}

function gradesSheet(selected: ResolvedEnrollment[], workByEnrollment: Map<string, WorkEntry[]>) {
  const rows = selected.flatMap(item => {
    const student = studentDto(item.student);
    return (workByEnrollment.get(item.enrollment.Enrollment_ID) ?? []).map(row => [
      student.academyStudentId,
      student.studentId,
      student.studentName,
      item.enrollment.Enrollment_ID,
      item.batch?.Batch_Name ?? item.group?.Batch_ID ?? "",
      item.group?.Group_Name ?? item.enrollment.Group_ID,
      row.assignment.assignmentType === "PROJECT" ? "Project" : "Task",
      row.assignment.assignmentId,
      row.assignment.title,
      row.assignment.levelCode,
      statusLabel(row.status),
      row.grade ?? "-",
      row.maxGrade ?? "-",
      row.percentage === null ? "-" : percentageLabel(row.percentage),
      row.assignment.requiredForCertificate ? "Yes" : "No",
      row.gradedAt,
    ]);
  });
  return {
    name: "Grades Details",
    rows: [["Academy_Student_ID", "University_Student_ID", "Student_Name", "Enrollment_ID", "Batch", "Group", "Type", "Assignment_ID", "Assignment_Title", "Level", "Submission_Status", "Grade", "Max_Grade", "Percentage", "Required_For_Certificate", "Graded_At"], ...rows],
    widths: [18, 20, 28, 20, 26, 30, 12, 18, 36, 14, 18, 12, 12, 14, 24, 22],
  };
}

function completedCount(rows: WorkEntry[]) {
  return rows.filter(row => row.status === "SUBMITTED" || row.status === "GRADED").length;
}

function gradeTotal(rows: WorkEntry[]) {
  const graded = rows.filter(row => row.status === "GRADED" && row.grade !== null);
  if (!graded.length) return "-";
  return roundScore(graded.reduce((sum, row) => sum + (row.grade ?? 0), 0));
}

function maxGradeTotal(rows: WorkEntry[]) {
  const graded = rows.filter(row => row.status === "GRADED" && row.grade !== null && row.maxGrade !== null && row.maxGrade > 0);
  if (!graded.length) return "-";
  return roundScore(graded.reduce((sum, row) => sum + (row.maxGrade ?? 0), 0));
}

function aggregatePercentage(rows: WorkEntry[]) {
  const graded = rows.filter(row => row.status === "GRADED" && row.grade !== null && row.maxGrade !== null && row.maxGrade > 0);
  const earned = graded.reduce((sum, row) => sum + (row.grade ?? 0), 0);
  const possible = graded.reduce((sum, row) => sum + (row.maxGrade ?? 0), 0);
  return possible > 0 ? percentageLabel(roundPercentage((earned / possible) * 100)) : "-";
}

function assignmentCell(row: WorkEntry | undefined) {
  if (!row) return "N/A";
  if (row.status === "NOT_SUBMITTED") return "Not Submitted";
  if (row.status === "SUBMITTED") return "Submitted";
  if (row.grade !== null) return row.grade;
  return "Graded";
}

function workSort(left: WorkEntry, right: WorkEntry) {
  return left.assignment.assignmentType.localeCompare(right.assignment.assignmentType) || (left.assignment.verificationOrder ?? 999999) - (right.assignment.verificationOrder ?? 999999) || left.assignment.title.localeCompare(right.assignment.title) || left.assignment.assignmentId.localeCompare(right.assignment.assignmentId);
}

function statusLabel(status: SubmissionStatus) {
  if (status === "GRADED") return "Graded";
  if (status === "SUBMITTED") return "Submitted";
  return "Not Submitted";
}

function percentageLabel(value: number | null) {
  return value === null ? "-" : `${formatNumber(value)}%`;
}

function roundPercentage(value: number) {
  return Math.round(value * 10) / 10;
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function numericOrNull(value: unknown) {
  const raw = text(value).replace(/,/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function levelSelectionLabel(value: string) {
  const normalized = text(value);
  if (!normalized) return "-";
  return normalized.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

function activeMapping(row: SheetRow<AttendanceSessionGroupRow>) {
  const value = normalizeCode(row.Is_Active || row.Access_Status || "TRUE");
  return !["FALSE", "NO", "0", "DISABLED", "INACTIVE"].includes(value);
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

function normalizeAttendanceSessionDateFields(row: SheetRow<AttendanceSessionRow>) {
  const copy: SheetRow<AttendanceSessionRow> = { ...row };
  for (const field of ["Session_Date", "Start_Time", "End_Time"]) {
    copy[field] = normalizeSheetsDateTime(copy[field]);
  }
  return copy;
}

function normalizeSheetsDateTime(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 20000) {
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + numeric * 86400000);
    return date.toISOString().slice(0, raw.includes(".") ? 16 : 10);
  }
  return raw;
}

function sheetDateTimeSortKey(date: string, time: string) {
  return `${dateOnly(date)} ${time}`.trim();
}

function localDateValue() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function dateOnly(value: string) {
  return value.trim().slice(0, 10);
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s*([-_|/])\s*/g, "$1").replace(/\s+/g, " ");
}

function uniqueIds(values: string[]) {
  return [...new Set(values.map(value => text(value)).filter(Boolean))];
}

function sheetRows<T extends Record<string, string>>(values: unknown[][] = []) {
  const headers = (values[0] ?? []).map(value => String(value ?? "").trim());
  return values.slice(1).map((cells, index) => {
    const record: Record<string, string | number> = { _rowNumber: index + 2 };
    headers.forEach((header, column) => { record[header] = String(cells[column] ?? ""); });
    return record as T & { _rowNumber: number };
  }).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && value !== ""));
}

function groupBy<T>(rows: T[], getKey: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return map;
}
