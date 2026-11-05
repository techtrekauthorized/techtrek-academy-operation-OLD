export type AssignmentType = "TASK" | "PROJECT";
export type SubmissionStatus = "NOT_SUBMITTED" | "SUBMITTED" | "GRADED";
export type CertificateApprovalStatus = "PENDING" | "APPROVED" | "NOT_APPROVED";
export type AutomaticReadinessStatus = "READY" | "NOT_READY" | "NOT_CONFIGURED";

export type AssignmentRow = {
  Assignment_ID: string;
  Batch_ID: string;
  Assignment_Type: AssignmentType | string;
  Title: string;
  Description: string;
  Level_Code: string;
  Max_Grade: string;
  Required_For_Certificate: string;
  Show_On_Verification: string;
  Verification_Order: string;
  Is_Active: string;
  Created_At: string;
  Created_By: string;
  Notes: string;
};

export type AssignmentGroupRow = {
  Assignment_Group_Map_ID: string;
  Assignment_ID: string;
  Group_ID: string;
  Is_Active: string;
  Notes: string;
};

export type AssignmentResultRow = {
  Assignment_Result_ID: string;
  Assignment_ID: string;
  Academy_Student_ID: string;
  Enrollment_ID: string;
  Group_ID: string;
  Submission_Status: SubmissionStatus | string;
  Grade: string;
  Graded_By: string;
  Graded_At: string;
  Notes: string;
  Updated_At: string;
};

export type CertificateEligibilityRow = {
  Certificate_Eligibility_ID: string;
  Academy_Student_ID: string;
  Enrollment_ID: string;
  Batch_ID: string;
  Approval_Status: CertificateApprovalStatus | string;
  Approved_By: string;
  Approved_At: string;
  Updated_At: string;
  Notes: string;
};

export type TasksGradesAssignment = {
  assignmentId: string;
  batchId: string;
  assignmentType: AssignmentType;
  title: string;
  description: string;
  levelCode: string;
  maxGrade: number | null;
  requiredForCertificate: boolean;
  showOnVerification: boolean;
  verificationOrder: number | null;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  notes: string;
  groupIds: string[];
  groupNames: string[];
};

export type TasksGradesBatch = { batchId: string; batchName: string; status: string };
export type TasksGradesGroup = { groupId: string; groupName: string; batchId: string; status: string };

export type GradebookRow = {
  enrollmentId: string;
  academyStudentId: string;
  studentName: string;
  studentEmail: string;
  universityStudentId: string;
  university: string;
  groupId: string;
  groupName: string;
  submissionStatus: SubmissionStatus;
  grade: number | null;
  maxGrade: number | null;
  notes: string;
  lastUpdated: string;
};

export type CertificateReadinessAssignmentEntry = {
  assignmentId: string;
  title: string;
  assignmentType: AssignmentType;
  submissionStatus: SubmissionStatus;
  grade: number | null;
  maxGrade: number | null;
};

export type CertificateReadinessRow = {
  enrollmentId: string;
  academyStudentId: string;
  studentName: string;
  universityStudentId: string;
  phone: string;
  university: string;
  college: string;
  groupId: string;
  groupName: string;
  track: string;
  creditHours: number;
  deliveryMode: string;
  requiredTasks: number;
  submittedTasks: number;
  requiredProjects: number;
  submittedProjects: number;
  missingRequiredAssignments: number;
  gradedAssignments: number;
  averageGradePercentage: number | null;
  automaticReadiness: AutomaticReadinessStatus;
  certificateDecision: CertificateApprovalStatus;
  certificateStatus?: "NOT_ISSUED" | "ISSUED" | "REVOKED";
  certificateId?: string;
  certificateProfileStatus?: "NOT_CONFIRMED" | "CONFIRMED";
  certificateProfileConfirmedAt?: string;
  certificateNameOnCertificate?: string;
  certificateDeliveryEmail?: string;
  roadmapId?: string;
  roadmapName?: string;
  roadmapVersion?: string;
  roadmapStatus?: "ASSIGNED" | "NOT_ASSIGNED" | "CONFLICT" | "INACTIVE";
  certificateIssueBlockReason?: string;
  requiredTaskDetails: CertificateReadinessAssignmentEntry[];
  requiredProjectDetails: CertificateReadinessAssignmentEntry[];
};

export type TasksGradesData = {
  schemaReady: boolean;
  schemaMessage?: string;
  batches: TasksGradesBatch[];
  groups: TasksGradesGroup[];
  assignments: TasksGradesAssignment[];
  gradebookRows: GradebookRow[];
  readinessRows: CertificateReadinessRow[];
};

export type AssignmentInput = {
  assignmentId?: string;
  batchId: string;
  assignmentType: AssignmentType;
  title: string;
  description?: string;
  levelCode?: string;
  maxGrade?: number | null;
  requiredForCertificate: boolean;
  showOnVerification: boolean;
  verificationOrder?: number | null;
  isActive: boolean;
  groupIds: string[];
  notes?: string;
};

export type AssignmentResultInput = {
  assignmentId: string;
  enrollmentId: string;
  submissionStatus: SubmissionStatus;
  grade?: number | null;
  notes?: string;
};

export type CertificateDecisionInput = {
  enrollmentId: string;
  decision: CertificateApprovalStatus;
  notes?: string;
};

export type CertificateDecisionChangeInput = {
  enrollmentId: string;
  decision: CertificateApprovalStatus;
  notes?: string;
};

export type CertificateStatus = "ISSUED" | "REVOKED";

export type LearningRoadmapRow = {
  Roadmap_ID: string; Track_ID: string; Credit_Hours: string; Roadmap_Name: string; Version: string; Is_Active: string; Created_At: string; Created_By: string; Notes: string;
};

export type LearningRoadmapItemRow = {
  Roadmap_Item_ID: string; Roadmap_ID: string; Section_Name: string; Topic_Title: string; Sort_Order: string; Is_Active: string; Notes: string;
};

export type BatchRoadmapRow = {
  Batch_Roadmap_ID: string; Batch_ID: string; Group_ID: string; Roadmap_ID: string; Is_Active: string; Assigned_At: string; Assigned_By: string; Notes: string;
};

export type CertificateRow = {
  Certificate_ID: string; Verification_Token: string; Academy_Student_ID: string; Enrollment_ID: string; Batch_ID: string; Roadmap_ID: string; Certificate_Name: string; Issue_Date: string; Certificate_Status: CertificateStatus | string; Issued_By: string; Issued_At: string; Revoked_By: string; Revoked_At: string; Notes: string;
  Student_Name_On_Certificate?: string;
  Certificate_Delivery_Email?: string;
  Certificate_File_URL?: string;
  Certificate_File_ID?: string;
  Certificate_File_Name?: string;
  Portal_Status?: string;
  Published_At?: string;
  Published_By?: string;
};

export type RoadmapDto = { roadmapId: string; trackId: string; creditHours: number; roadmapName: string; version: string; isActive: boolean; createdAt: string; createdBy: string; notes: string; topicCount: number; batchCount: number };
export type RoadmapItemDto = { roadmapItemId: string; roadmapId: string; sectionName: string; topicTitle: string; sortOrder: number | null; isActive: boolean; notes: string };
export type BatchRoadmapDto = { batchRoadmapId: string; batchId: string; groupId: string; groupName: string; roadmapId: string; roadmapName: string; isActive: boolean; assignedAt: string; assignedBy: string; notes: string };
export type CertificatePortalStatus = "PUBLISHED" | "NOT_PUBLISHED";
export type CertificateDto = { certificateId: string; verificationToken: string; academyStudentId: string; enrollmentId: string; batchId: string; groupId: string; roadmapId: string; certificateName: string; issueDate: string; certificateStatus: CertificateStatus; studentName: string; studentNameOnCertificate: string; certificateDeliveryEmail: string; university: string; college: string; universityStudentId: string; groupName: string; track: string; creditHours: number; deliveryMode: string; roadmapName: string; roadmapVersion: string; learningRoadmap: string; completedTasks: string; projects: string; verificationUrl: string; qrCodeValue: string; certificateFileId: string; certificateFileName: string; portalStatus: CertificatePortalStatus; publishedAt: string; publishedBy: string };
export type CertificateTrackDto = { trackId: string; trackName: string; university: string; exactHours: number; isActive: boolean; label: string };

export type CertificatesData = {
  schemaReady: boolean;
  schemaMessage?: string;
  batches: TasksGradesBatch[];
  groups: TasksGradesGroup[];
  tracks: CertificateTrackDto[];
  readinessRows: CertificateReadinessRow[];
  roadmaps: RoadmapDto[];
  roadmapItems: RoadmapItemDto[];
  batchRoadmaps: BatchRoadmapDto[];
  certificates: CertificateDto[];
  certificateSnapshotFields: {
    studentNameOnCertificate: boolean;
    certificateDeliveryEmail: boolean;
  };
  certificateDeliveryFields: {
    ready: boolean;
    missing: string[];
  };
};

export type CertificateVerificationData = {
  status: "FOUND" | "NOT_FOUND" | "RATE_LIMITED" | "CONFIGURATION_ERROR";
  certificate?: {
    certificateId: string; certificateName: string; issueDate: string; status: CertificateStatus; studentName: string; university: string; college: string; universityStudentId: string; track: string; creditHours: number; deliveryMode: string; roadmapName: string; roadmapVersion: string; revokedAt?: string;
  };
  roadmapSections: Array<{ sectionName: string; topics: string[] }>;
  tasks: Array<{ title: string }>;
  projects: Array<{ title: string; result: string }>;
};
