export type StudentDocumentType = "TRAINING_FORM";
export type StudentDocumentPublishStatus = "DRAFT" | "PUBLISHED" | "HIDDEN";

export type StudentDocumentBatchOption = { id: string; name: string; location: string };
export type StudentDocumentGroupOption = { id: string; name: string; batchId: string };

export type StudentDocumentValidationStatus =
  | "READY"
  | "UNKNOWN_STUDENT"
  | "ENROLLMENT_NOT_FOUND"
  | "MULTIPLE_ENROLLMENTS"
  | "INVALID_DRIVE_LINK"
  | "DUPLICATE_STUDENT_ID"
  | "ALREADY_HAS_DOCUMENT"
  | "DUPLICATE_INPUT_ROW"
  | "PUBLISHED"
  | "ALREADY_EXISTS"
  | "FAILED";

export type StudentDocumentBulkValidationRow = {
  lineNumber: number;
  universityStudentId: string;
  fileUrl: string;
  fileId: string;
  fileName: string;
  academyStudentId: string;
  enrollmentId: string;
  studentName: string;
  university: string;
  groupId: string;
  groupName: string;
  status: StudentDocumentValidationStatus;
  message: string;
};

export type StudentDocumentExistingRow = {
  studentDocumentId: string;
  academyStudentId: string;
  enrollmentId: string;
  universityStudentId: string;
  studentName: string;
  programScope: string;
  university: string;
  batchId: string;
  batchName: string;
  groupId: string;
  groupName: string;
  track: string;
  creditHours: string;
  deliveryMode: string;
  documentType: StudentDocumentType;
  documentTypeLabel: string;
  documentTitle: string;
  publishStatus: StudentDocumentPublishStatus;
  isActive: boolean;
  publishedAt: string;
  fileStatus: string;
  fileId: string;
  fileName: string;
};

export type StudentDocumentsFormData = {
  batches: StudentDocumentBatchOption[];
  groups: StudentDocumentGroupOption[];
  programScopes: string[];
};

export type StudentDocumentsExistingData = {
  documents: StudentDocumentExistingRow[];
};

export type StudentDocumentQueueStatus = "NO_FILE" | "INVALID_LINK" | "READY" | "PUBLISHED" | "ALREADY_EXISTS";

export type StudentDocumentQueueRow = {
  academyStudentId: string;
  enrollmentId: string;
  studentName: string;
  universityStudentId: string;
  programScope: string;
  university: string;
  track: string;
  batchId: string;
  batchName: string;
  groupId: string;
  groupName: string;
  creditHours: string;
  deliveryMode: string;
  existingStatus: "PUBLISHED" | "ALREADY_EXISTS" | "NONE";
  existingDocumentId: string;
};

export type StudentDocumentsQueueData = {
  programScope: string;
  rows: StudentDocumentQueueRow[];
};

export type StudentDocumentSelectedPublishInput = {
  enrollmentId: string;
  driveUrl: string;
};

export type StudentDocumentPublishResultStatus = "PUBLISHED" | "ALREADY_PUBLISHED" | "INVALID_LINK" | "ENROLLMENT_NOT_FOUND" | "STUDENT_NOT_FOUND" | "FAILED";

export type StudentDocumentPublishResultRow = {
  enrollmentId: string;
  academyStudentId: string;
  studentName: string;
  universityStudentId: string;
  status: StudentDocumentPublishResultStatus;
  message: string;
  studentDocumentId: string;
};

export type StudentDocumentSelectedPublishResult = {
  total: number;
  published: number;
  rows: StudentDocumentPublishResultRow[];
};

export type StudentPortalDocumentSummary = {
  studentDocumentId: string;
  documentType: string;
  documentTypeLabel: string;
  documentTitle: string;
  documentDescription: string;
  previewUrl: string;
  downloadHref: string;
  viewHref: string;
  filename: string;
};

export type StudentPortalDocumentPlayback = StudentPortalDocumentSummary & {
  studentId: string;
  studentName: string;
};
