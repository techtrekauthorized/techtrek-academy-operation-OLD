export type SheetRow<T> = T & { _rowNumber: number };

export type UniversityRow = {
  University_ID: string; University_Name: string; Code: string;
  Receipts_Drive_Folder_ID: string; Receipts_Drive_Folder_Link: string; Is_Active: string;
};

export type TrackRow = {
  Track_ID: string; Offering_ID: string; University: string; Offering_Type: "UNIVERSITY_PROGRAM" | "INTENSIVE_DIPLOMA";
  Track: string; Package_Label: string; Exact_Hours: string; Duration_Days: string; Price: string; Is_Active: string;
};

export type StudentRow = {
  Academy_Student_ID: string; Student_Name: string; Phone: string; Email: string; University: string;
  College: string; Department: string; Student_ID: string; Student_Status: string;
  Certificate_Name?: string; Certificate_Email?: string; Certificate_Profile_Status?: string; Certificate_Profile_Confirmed_At?: string;
};

export type EnrollmentRow = {
  Enrollment_ID: string; Registration_Date: string; Academy_Student_ID: string; Intake: string; University: string;
  Offering_ID: string; Package_Label: string; Track: string; "Credit Hours": string; Catalogue_Price: string;
  Discount: string; Final_Contract_Price: string; Total_Paid: string; Remaining: string; Payment_Status: string;
  Group_ID: string; Delivery_Mode: string; Level_Selection: string; Enrollment_Status: string; Entered_WhatsApp_Group: string;
};

export type PaymentReceiptRow = {
  Payment_ID: string; Enrollment_ID: string; Academy_Student_ID: string; Payment_Date: string; Payment_Type: string;
  Payment_Amount: string; Total_Paid_After_Payment: string; Remaining_After_Payment: string; Payment_Method: string;
  Receipt_Number: string; Receipt_Status: string; Receipt_Link: string; Receiver_Name: string; Notes: string;
  Receipt_Source: string; Receipt_PDF_File_ID: string;
};

export type SystemConfigRow = { Config_Key: string; Config_Value: string };

export type UserRow = {
  User_ID: string; Username: string; Display_Name: string; Role: string; Password: string; Is_Active: string;
};

export type StudentDto = {
  academyStudentId: string; studentName: string; phone: string; email: string; university: string;
  college: string; department: string; studentId: string; studentStatus: string;
};

export type OfferingDto = {
  trackId: string; offeringId: string; university: string; offeringType: "UNIVERSITY_PROGRAM" | "INTENSIVE_DIPLOMA";
  track: string; packageLabel: string; exactHours: number; durationDays: number; price: number; isActive: boolean;
};

export type EnrollmentDto = {
  enrollmentId: string; registrationDate: string; academyStudentId: string; intake: string; programScope: string;
  offeringId: string; packageLabel: string; track: string; exactHours: number; cataloguePrice: number; discount: number;
  finalContractPrice: number; totalPaid: number; remaining: number; paymentStatus: string; groupId: string;
  deliveryMode: string; levelSelection?: string; enrollmentStatus: string;
};

export type PaymentDto = {
  paymentId: string; enrollmentId: string; academyStudentId: string; paymentDate: string; paymentType: string;
  paymentAmount: number; totalPaidAfterPayment: number; remainingAfterPayment: number; paymentMethod: string;
  receiptNumber: string; receiptStatus: string; receiptLink: string; receiverName: string; notes: string;
  receiptSource: string; receiptPdfFileId: string;
};

export type RegistryCertificateStatus = "ISSUED" | "NOT_ISSUED" | "REVOKED";
export type RegistryCertificateDeliveryStatus = "DELIVERED" | "NOT_DELIVERED";
export type RegistryTrainingFormStatus = "PUBLISHED" | "NOT_PUBLISHED";
export type RegistryRowDto = EnrollmentDto & StudentDto & {
  trackId: string;
  receiptCount: number;
  groupName: string;
  certificateStatus: RegistryCertificateStatus;
  certificateStatusLabel: string;
  certificateDeliveryStatus: RegistryCertificateDeliveryStatus;
  certificateDeliveryStatusLabel: string;
  trainingFormStatus: RegistryTrainingFormStatus;
  trainingFormStatusLabel: string;
};

export type StudentAcademicWorkRow = {
  enrollmentId: string;
  type: "TASK" | "PROJECT";
  assignmentId: string;
  assignmentTitle: string;
  batchId: string;
  batchName: string;
  groupId: string;
  groupName: string;
  levelCode: string;
  status: "NOT_SUBMITTED" | "SUBMITTED" | "GRADED";
  grade: number | null;
  maxGrade: number | null;
  percentage: number | null;
  requiredForCertificate: boolean;
  gradedAt: string;
};

export type StudentAcademicSummaryDto = {
  enrollmentId: string;
  totalApplicable: number;
  completed: number;
  notSubmitted: number;
  tasks: number;
  projects: number;
  averageGradePercentage: number | null;
};

export type StudentCertificateProfileDto = {
  certificateName: string;
  certificateEmail: string;
  status: "CONFIRMED" | "NOT_CONFIRMED";
  confirmedAt: string;
};

export type StudentCertificateReadinessDto = {
  enrollmentId: string;
  batchId: string;
  batchName: string;
  groupId: string;
  groupName: string;
  track: string;
  creditHours: number;
  deliveryMode: string;
  applicableRequiredAssignments: number;
  completedRequiredAssignments: number;
  missingRequiredAssignments: number;
  readiness: "READY" | "NOT_READY" | "NOT_CONFIGURED";
  certificateDecision: "PENDING" | "APPROVED" | "NOT_APPROVED";
};

export type StudentIssuedCertificateDto = {
  enrollmentId: string;
  certificateId: string;
  certificateName: string;
  studentNameOnCertificate: string;
  roadmapId: string;
  roadmapName: string;
  roadmapVersion: string;
  issueDate: string;
  status: "ISSUED" | "REVOKED";
  verificationUrl: string;
};

export type StudentAcademicProfileDto = {
  certificateProfile: StudentCertificateProfileDto;
  workSummary: StudentAcademicSummaryDto[];
  academicWork: StudentAcademicWorkRow[];
  certificateReadiness: StudentCertificateReadinessDto[];
  issuedCertificates: StudentIssuedCertificateDto[];
};

export type OperationalTrainingDetailsDto = {
  enrollmentId: string;
  placementStatus: "PLACED" | "READY_TO_PLACE" | "NEEDS_LEVEL_SELECTION" | "CONFIGURATION_REQUIRED";
  message: string;
  soldTrack: string;
  packageLabel: string;
  creditHours: number;
  registeredDeliveryMode: string;
  levelSelection: string;
  deliveryTrackName: string;
  batchName: string;
  batchIntake: string;
  batchStartDate: string;
  batchEndDate: string;
  batchStatus: string;
  groupName: string;
  groupStatus: string;
  groupCapacity: string;
  assignedStudentsCount: number;
  level1Name: string;
  level2Name: string;
  level1AttendanceMode: string;
  level2AttendanceMode: string;
};

export type ReceiptGenerationInput = {
  paymentId: string; receiptNumber: string; paymentDate: string; paymentStatus: string; programScope: string; student: StudentDto;
  enrollment: EnrollmentDto; deliveryMode: "ONLINE" | "OFFLINE" | "HYBRID" | "UNASSIGNED"; remainingBefore: number; paymentAmount: number; remainingAfter: number; paymentMethod: string; receiverName: string; notes: string;
};

export type RegistrationInput = {
  mode: "new" | "existing"; academyStudentId?: string;
  student: Omit<StudentDto, "academyStudentId">;
  offeringId: string; deliveryMode: "ONLINE" | "OFFLINE" | "HYBRID" | "UNASSIGNED"; discount: number; discountReason: string; openingPaymentAmount: number;
  paymentDate: string; paymentMethod: string; receiverName: string; notes: string;
};

export type PaymentInput = {
  enrollmentId: string; paymentDate: string; paymentAmount: number; paymentMethod: string; receiverName: string; notes: string;
};
