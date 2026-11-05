export type AttendanceSessionDto = {
  attendanceSessionId: string;
  attendanceCode: string;
  batchId: string;
  batchName: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  sessionNumber: string;
  durationHours: string;
  isExtraSession: string;
  status: string;
  trackContext: string;
  sessionTitle: string;
  deliveryMode: string;
};

export type AttendanceBatchOptionDto = {
  batchId: string;
  batchName: string;
  status: string;
  intake: string;
};

export type AttendanceFormResponseDto = {
  sourceResponseRow: number;
  timestamp: string;
  attendanceCode: string;
  universityStudentId: string;
  studentName: string;
  phone: string;
};

export type AttendanceValidatedDto = {
  attendanceId: string;
  sourceResponseRow: string;
  sourceTimestamp: string;
  attendanceCode: string;
  attendanceSessionId: string;
  inputUniversityStudentId: string;
  resolvedAcademyStudentId: string;
  enrollmentId: string;
  resolvedGroupId: string;
  resolvedGroupName: string;
  studentName: string;
  inputPhone: string;
  studentUniversity: string;
  attendanceStatus: string;
  validationStatus: string;
  submittedAt: string;
  validatedAt: string;
  reviewedBy: string;
  reviewStatus: string;
  notes: string;
};

export type AttendanceSessionReviewRow = {
  attendanceId: string;
  sourceResponseRow: string;
  studentName: string;
  phone: string;
  email: string;
  academyStudentId: string;
  universityStudentId: string;
  studentUniversity: string;
  groupId: string;
  groupName: string;
  enrollmentId: string;
  attendanceStatus: "Present" | "Needs Review" | "Absent" | "Excused" | "Rejected";
  validationStatus: string;
  attendanceCode: string;
};

export type AttendanceSessionReviewDto = {
  sessionId: string;
  attendanceCode: string;
  batchId: string;
  batchName: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  sessionNumber: string;
  durationHours: string;
  isExtraSession: string;
  trackContext: string;
  sessionTitle: string;
  deliveryMode: string;
  expectedStudents: number;
  presentStudents: number;
  needsReview: number;
  absentStudents: number;
  excusedStudents: number;
  rows: AttendanceSessionReviewRow[];
};

export type StudentAttendanceHistoryRow = {
  enrollmentId: string;
  sessionDate: string;
  time: string;
  attendanceCode: string;
  sessionNumber: string;
  trackContext: string;
  groupName: string;
  attendanceStatus: "Present" | "Needs Review" | "Absent" | "Excused" | "Rejected";
  validationStatus: string;
  notes: string;
};

export type StudentAttendanceHistory = {
  enrollmentId: string;
  totalTakenSessions: number;
  present: number;
  absent: number;
  excused: number;
  needsReview: number;
  attendancePercent: number;
  rows: StudentAttendanceHistoryRow[];
};

export type AttendanceOverviewDto = {
  totalSessions: number;
  totalFormResponses: number;
  validPresent: number;
  needsReview: number;
  invalidOrNotEligible: number;
  lastSyncTime: string;
};

export type AttendanceSyncSummary = {
  totalRawResponses: number;
  alreadyProcessed: number;
  newProcessed: number;
  validPresent: number;
  needsReview: number;
  duplicates: number;
  invalidCodes: number;
  studentNotFound: number;
  enrollmentNotFound: number;
  notEligible: number;
  skippedMissingTimestamp: number;
  skippedMissingAttendanceCode: number;
  skippedMissingUniversityStudentId: number;
  errors: number;
  lastProcessedSourceRow: string;
  newResponsesArrivedDuringSync: boolean;
};

export type AttendanceData = {
  overview: AttendanceOverviewDto;
  batches: AttendanceBatchOptionDto[];
  sessions: AttendanceSessionDto[];
  formResponses: AttendanceFormResponseDto[];
  validated: AttendanceValidatedDto[];
  sessionReviews: AttendanceSessionReviewDto[];
};

export type AttendanceScheduleEventDto = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  attendanceCode: string;
  sessionNumber: string;
  levelCode: string;
  deliveryMode: string;
  location: string;
  instructor: string;
  mentor: string;
  status: string;
  track: string;
  notes: string;
  groupIds: string[];
  groupNames: string[];
};

export type AttendanceScheduleData = {
  canManageSessions: boolean;
  events: AttendanceScheduleEventDto[];
};

export type AttendanceMatrixStatus = "PRESENT" | "ABSENT" | "PENDING" | "EXCUSED" | "NOT_APPLICABLE";

export type AttendanceMatrixResponse = {
  batch: { id: string; name: string };
  filters: {
    batches: AttendanceBatchOptionDto[];
    universities: Array<{ id: string; name: string }>;
    groups: Array<{ id: string; name: string }>;
  };
  sessions: Array<{
    attendanceSessionId: string;
    sessionNumber: number;
    title: string;
    date: string;
    startTime: string;
    deliveryMode: string;
  }>;
  students: Array<{
    studentId: string;
    studentName: string;
    mobile: string;
    universityId: string;
    universityName: string;
    groupId: string;
    groupName: string;
    packageHours: number | null;
    attendanceMode: string;
    eligibleSessionsCount: number;
    presentCount: number;
    absentCount: number;
    pendingCount: number;
    excusedCount: number;
    attendancePercentage: number | null;
    sessionStatuses: Record<string, AttendanceMatrixStatus>;
    sessionValidationStatuses: Record<string, string>;
  }>;
  summary: {
    totalStudents: number;
    completedSessions: number;
    presentRecords: number;
    absentRecords: number;
    averageAttendancePercentage: number | null;
    pendingRecords: number;
  };
  diagnostics: {
    duplicateStudents: number;
    orphanedAttendanceRecords: number;
  };
};

export type AttendanceMatrixMarkPresentResult = {
  updated: number;
  alreadyPresent: number;
  rejected: number;
  message: string;
};
