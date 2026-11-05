import "server-only";
import { getHeaders, readSheet, readSheetDataRegion, updateRecord } from "@/lib/server/google/sheets";
import type { EnrollmentRow, PaymentReceiptRow, StudentRow } from "@/lib/server/types";
import type { CertificateRow } from "@/types/tasks-grades";
import { ServiceError } from "@/lib/server/services/errors";
import { formatCertificateDate } from "@/lib/server/services/certificates-service";
import { enrollmentDto, numberValue, studentDto } from "@/lib/server/services/mappers";
import { extractGoogleDriveFileId, googleDriveDownloadUrl, googleDrivePreviewUrl } from "@/lib/drive-links";
import type { StudentPortalLearningResourcePlayback, StudentPortalLearningResourceSummary } from "@/types/learning-resources";
import { validateLearningResourceHeaders } from "@/lib/server/services/learning-resources-service";

export type StudentPortalProfile = {
  student: {
    academyStudentId: string;
    studentName: string;
    studentId: string;
    phone: string;
    email: string;
    university: string;
    college: string;
    department: string;
    certificateProfile: StudentCertificateProfile;
  };
  enrollments: Array<{
    enrollmentId: string;
    registrationDate: string;
    intake: string;
    programScope: string;
    track: string;
    packageLabel: string;
    exactHours: number;
    deliveryMode: string;
    enrollmentStatus: string;
    paymentStatus: string;
    finalContractPrice: number;
    totalPaid: number;
    remaining: number;
    payments: Array<{
      paymentDate: string;
      paymentType: string;
      paymentAmount: number;
      totalPaidAfterPayment: number;
      remainingAfterPayment: number;
      paymentMethod: string;
      receiptNumber: string;
      receiptStatus: string;
      receiptLink: string;
    }>;
  }>;
  recordedSessions: StudentPortalRecordingSummary[];
  sessionMaterials: StudentPortalMaterialSummary[];
};

export type StudentCertificateProfile = {
  certificateName: string;
  certificateEmail: string;
  certificateProfileStatus: string;
  certificateProfileConfirmedAt: string;
};

export type StudentPortalCertificateSummary = {
  certificateId: string;
  certificateName: string;
  studentNameOnCertificate: string;
  issueDate: string;
  verificationUrl: string;
  viewHref: string;
  downloadHref: string;
  imageDownloadHref: string;
  imageFormat: "JPG";
  pdfFilename: string;
  imageFilename: string;
};

export type StudentPortalCertificatePlayback = StudentPortalCertificateSummary & {
  previewUrl: string;
  studentName: string;
  studentId: string;
};

const CERTIFICATE_PROFILE_HEADERS = ["Certificate_Name", "Certificate_Email", "Certificate_Profile_Status", "Certificate_Profile_Confirmed_At"] as const;

export type StudentPortalRecordingSummary = {
  recordingId: string;
  recordingTitle: string;
  provider: string;
  sessionNumber: string;
  levelCode: string;
};

export type StudentPortalRecordingPlayback = StudentPortalRecordingSummary & {
  videoId: string;
  studentName: string;
  studentId: string;
};

export type StudentPortalMaterialSummary = {
  materialId: string;
  materialTitle: string;
  materialType: string;
  sessionNumber: string;
  levelCode: string;
};

export type StudentPortalMaterialPlayback = StudentPortalMaterialSummary & {
  previewUrl: string;
  studentName: string;
  studentId: string;
};

type RecordedSessionRow = Record<string, string>;
type RecordedSessionGroupRow = Record<string, string>;
type SessionMaterialRow = Record<string, string>;
type SessionMaterialGroupRow = Record<string, string>;
type LearningResourceRow = Record<string, string> & { Resource_ID: string; Batch_ID: string; Related_Attendance_Session_ID: string; Resource_Title: string; Resource_Description: string; Resource_Type: string; Resource_Category: string; Provider: string; Video_URL: string; Video_ID: string; Publish_Status: string; Available_From: string; Available_To: string; Is_Active: string; Notes: string };
type LearningResourceGroupRow = Record<string, string> & { Resource_Group_Map_ID: string; Resource_ID: string; Group_ID: string; Access_Status: string; Notes: string };
type AttendanceSessionRow = Record<string, string> & { Attendance_Session_ID: string; Attendance_Code: string };

export async function authenticateStudentPortal(studentIdInput: string, phoneInput: string) {
  const studentId = normalizeStudentId(studentIdInput);
  const phoneVariants = phoneComparisonValues(phoneInput);
  if (!studentId || !phoneVariants.size) throw new ServiceError("STUDENT_PORTAL_INVALID_LOGIN", "Student not found. Please check your University Student ID and phone number.", 401);
  const students = await readSheet<StudentRow>("Students");
  const matchingIdRows = students.filter(row => normalizeStudentId(row.Student_ID) === studentId);
  if (matchingIdRows.length > 1) throw new ServiceError("STUDENT_PORTAL_DUPLICATE_ID", "This ID needs review. Please contact TechTrek support.", 409);
  const student = matchingIdRows[0];
  if (!student || !sharesPhoneVariant(phoneVariants, phoneComparisonValues(student.Phone))) throw new ServiceError("STUDENT_PORTAL_INVALID_LOGIN", "Student not found. Please check your University Student ID and phone number.", 401);
  return { academyStudentId: student.Academy_Student_ID.trim(), studentId: student.Student_ID.trim() };
}

export async function getStudentPortalProfile(academyStudentId: string, studentId: string): Promise<StudentPortalProfile> {
  const [students, enrollments, payments, recordedSessions, recordedSessionGroups, sessionMaterials, sessionMaterialGroups] = await Promise.all([
    readSheet<StudentRow>("Students"),
    readSheet<EnrollmentRow>("Enrollments"),
    readSheet<PaymentReceiptRow>("Payments_Receipts"),
    readSheetDataRegion<RecordedSessionRow>("Recorded_Sessions"),
    readSheetDataRegion<RecordedSessionGroupRow>("Recorded_Session_Groups"),
    readSheetDataRegion<SessionMaterialRow>("Session_Materials"),
    readSheetDataRegion<SessionMaterialGroupRow>("Session_Material_Groups"),
  ]);
  const studentRow = students.find(row => row.Academy_Student_ID.trim() === academyStudentId && normalizeStudentId(row.Student_ID) === normalizeStudentId(studentId));
  if (!studentRow) throw new ServiceError("STUDENT_PORTAL_SESSION_INVALID", "Student portal session expired. Please sign in again.", 401);
  const student = studentDto(studentRow);
  const studentEnrollments = enrollments.filter(row => row.Academy_Student_ID.trim() === academyStudentId && row.Enrollment_ID.trim()).map(enrollmentDto);
  const groupIds = studentEnrollments.map(enrollment => enrollment.groupId.trim()).filter(Boolean);
  const paymentsByEnrollment = new Map<string, PaymentReceiptRow[]>();
  for (const payment of payments.filter(row => row.Academy_Student_ID.trim() === academyStudentId && row.Enrollment_ID.trim())) {
    const key = payment.Enrollment_ID.trim();
    paymentsByEnrollment.set(key, [...(paymentsByEnrollment.get(key) ?? []), payment]);
  }
  return {
    student: {
      academyStudentId: student.academyStudentId,
      studentName: student.studentName,
      studentId: student.studentId,
      phone: student.phone,
      email: student.email,
      university: student.university,
      college: student.college,
      department: student.department,
      certificateProfile: studentCertificateProfileDto(studentRow),
    },
    enrollments: studentEnrollments.map(enrollment => ({
      enrollmentId: enrollment.enrollmentId,
      registrationDate: enrollment.registrationDate,
      intake: enrollment.intake,
      programScope: enrollment.programScope,
      track: enrollment.track,
      packageLabel: enrollment.packageLabel,
      exactHours: enrollment.exactHours,
      deliveryMode: enrollment.deliveryMode,
      enrollmentStatus: enrollment.enrollmentStatus,
      paymentStatus: enrollment.paymentStatus,
      finalContractPrice: enrollment.finalContractPrice,
      totalPaid: enrollment.totalPaid,
      remaining: enrollment.remaining,
      payments: (paymentsByEnrollment.get(enrollment.enrollmentId) ?? []).map(payment => ({
        paymentDate: payment.Payment_Date,
        paymentType: payment.Payment_Type,
        paymentAmount: numberValue(payment.Payment_Amount),
        totalPaidAfterPayment: numberValue(payment.Total_Paid_After_Payment),
        remainingAfterPayment: numberValue(payment.Remaining_After_Payment),
        paymentMethod: payment.Payment_Method,
        receiptNumber: payment.Receipt_Number,
        receiptStatus: payment.Receipt_Status,
        receiptLink: payment.Receipt_Link,
      })),
    })),
    recordedSessions: getAccessibleRecordings(groupIds, recordedSessions, recordedSessionGroups).map(recording => ({
      recordingId: field(recording, "Recording_ID"),
      recordingTitle: field(recording, "Recording_Title"),
      provider: field(recording, "Provider"),
      sessionNumber: field(recording, "Session_Number"),
      levelCode: field(recording, "Level_Code"),
    })),
    sessionMaterials: getAccessibleMaterials(groupIds, sessionMaterials, sessionMaterialGroups).map(material => ({
      materialId: field(material, "Material_ID"),
      materialTitle: field(material, "Material_Title"),
      materialType: field(material, "Material_Type"),
      sessionNumber: field(material, "Session_Number"),
      levelCode: field(material, "Level_Code"),
    })),
  };
}

export async function getStudentCertificateProfile(academyStudentId: string, studentId: string): Promise<StudentCertificateProfile> {
  const studentRow = await resolveStudentPortalStudentRow(academyStudentId, studentId);
  return studentCertificateProfileDto(studentRow);
}

export async function getStudentPortalCertificates(academyStudentId: string, studentId: string): Promise<StudentPortalCertificateSummary[]> {
  await resolveStudentPortalStudentRow(academyStudentId, studentId);
  const [enrollments, certificates] = await Promise.all([
    readSheet<EnrollmentRow>("Enrollments"),
    readSheet<CertificateRow>("Certificates"),
  ]);
  const enrollmentIds = new Set(enrollments.filter(row => row.Academy_Student_ID.trim() === academyStudentId).map(row => row.Enrollment_ID.trim()).filter(Boolean));
  return certificates.filter(row => enrollmentIds.has(row.Enrollment_ID.trim()) && row.Academy_Student_ID.trim() === academyStudentId && row.Certificate_Status.trim().toUpperCase() === "ISSUED" && String(row.Portal_Status ?? "").trim().toUpperCase() === "PUBLISHED" && String(row.Certificate_File_ID ?? "").trim()).map(studentPortalCertificateSummaryDto).sort((left, right) => right.issueDate.localeCompare(left.issueDate) || left.certificateName.localeCompare(right.certificateName));
}

export async function getStudentPortalCertificate(academyStudentId: string, studentId: string, certificateId: string): Promise<StudentPortalCertificatePlayback | null> {
  const studentRow = await resolveStudentPortalStudentRow(academyStudentId, studentId);
  const certificates = await getStudentPortalCertificates(academyStudentId, studentId);
  const summary = certificates.find(row => row.certificateId === certificateId);
  if (!summary) return null;
  const rows = await readSheet<CertificateRow>("Certificates");
  const certificate = rows.find(row => row.Certificate_ID.trim() === certificateId && row.Academy_Student_ID.trim() === academyStudentId);
  const fileId = String(certificate?.Certificate_File_ID ?? "").trim();
  if (!fileId) return null;
  return {
    ...summary,
    previewUrl: googleDrivePreviewUrl(fileId),
    studentName: studentRow.Student_Name,
    studentId: studentRow.Student_ID,
  };
}

export async function getStudentPortalCertificateDownloadUrl(academyStudentId: string, studentId: string, certificateId: string) {
  const certificate = await getStudentPortalCertificate(academyStudentId, studentId, certificateId);
  if (!certificate) throw new ServiceError("STUDENT_CERTIFICATE_NOT_FOUND", "Certificate was not found.", 404);
  const rows = await readSheet<CertificateRow>("Certificates");
  const row = rows.find(item => item.Certificate_ID.trim() === certificateId && item.Academy_Student_ID.trim() === academyStudentId);
  const url = googleDriveDownloadUrl(row?.Certificate_File_ID);
  if (!url) throw new ServiceError("STUDENT_CERTIFICATE_NOT_FOUND", "Certificate was not found.", 404);
  return url;
}

export async function getStudentPortalCertificateFile(academyStudentId: string, studentId: string, certificateId: string) {
  await resolveStudentPortalStudentRow(academyStudentId, studentId);
  const [enrollments, certificates] = await Promise.all([
    readSheet<EnrollmentRow>("Enrollments"),
    readSheet<CertificateRow>("Certificates"),
  ]);
  const enrollmentIds = new Set(enrollments.filter(row => row.Academy_Student_ID.trim() === academyStudentId).map(row => row.Enrollment_ID.trim()).filter(Boolean));
  const row = certificates.find(item => item.Certificate_ID.trim() === certificateId && item.Academy_Student_ID.trim() === academyStudentId && enrollmentIds.has(item.Enrollment_ID.trim()) && item.Certificate_Status.trim().toUpperCase() === "ISSUED" && String(item.Portal_Status ?? "").trim().toUpperCase() === "PUBLISHED" && String(item.Certificate_File_ID ?? "").trim());
  if (!row) throw new ServiceError("STUDENT_CERTIFICATE_NOT_FOUND", "Certificate was not found.", 404);
  const summary = studentPortalCertificateSummaryDto(row);
  return { fileId: String(row.Certificate_File_ID ?? "").trim(), pdfFilename: summary.pdfFilename, imageFilename: summary.imageFilename };
}

export async function confirmStudentCertificateProfile(input: { certificateName: string; certificateEmail: string }, academyStudentId: string, studentId: string): Promise<StudentCertificateProfile> {
  const studentRow = await resolveStudentPortalStudentRow(academyStudentId, studentId);
  assertCertificateProfileHeaders(studentRow);
  if (isCertificateProfileConfirmed(studentRow)) throw new ServiceError("CERTIFICATE_PROFILE_ALREADY_CONFIRMED", "Certificate information has already been confirmed and cannot be changed.", 409);
  const certificateName = normalizeCertificateName(input.certificateName);
  const certificateEmail = normalizeCertificateEmail(input.certificateEmail);
  const headers = await getHeaders("Students");
  const missing = CERTIFICATE_PROFILE_HEADERS.find(header => !headers.includes(header));
  if (missing) throw new ServiceError("STUDENT_CERTIFICATE_SCHEMA_NOT_READY", "Certificate information is temporarily unavailable. Please try again later.", 503);
  const latestRows = await readSheet<StudentRow>("Students");
  const latestRow = latestRows.find(row => row.Academy_Student_ID.trim() === academyStudentId && normalizeStudentId(row.Student_ID) === normalizeStudentId(studentId));
  if (!latestRow) throw new ServiceError("STUDENT_PORTAL_SESSION_INVALID", "Student portal session expired. Please sign in again.", 401);
  if (isCertificateProfileConfirmed(latestRow)) throw new ServiceError("CERTIFICATE_PROFILE_ALREADY_CONFIRMED", "Certificate information has already been confirmed and cannot be changed.", 409);
  const confirmedAt = new Date().toISOString();
  await updateRecord("Students", latestRow._rowNumber, {
    Certificate_Name: certificateName,
    Certificate_Email: certificateEmail,
    Certificate_Profile_Status: "CONFIRMED",
    Certificate_Profile_Confirmed_At: confirmedAt,
  });
  return { certificateName, certificateEmail, certificateProfileStatus: "CONFIRMED", certificateProfileConfirmedAt: confirmedAt };
}

export async function getStudentPortalRecording(academyStudentId: string, studentId: string, recordingId: string): Promise<StudentPortalRecordingPlayback | null> {
  const [students, enrollments, recordedSessions, recordedSessionGroups] = await Promise.all([
    readSheet<StudentRow>("Students"),
    readSheet<EnrollmentRow>("Enrollments"),
    readSheetDataRegion<RecordedSessionRow>("Recorded_Sessions"),
    readSheetDataRegion<RecordedSessionGroupRow>("Recorded_Session_Groups"),
  ]);
  const studentRow = students.find(row => row.Academy_Student_ID.trim() === academyStudentId && normalizeStudentId(row.Student_ID) === normalizeStudentId(studentId));
  if (!studentRow) throw new ServiceError("STUDENT_PORTAL_SESSION_INVALID", "Student portal session expired. Please sign in again.", 401);
  const groupIds = enrollments.filter(row => row.Academy_Student_ID.trim() === academyStudentId).map(row => row.Group_ID.trim()).filter(Boolean);
  const recording = getAccessibleRecordings(groupIds, recordedSessions, recordedSessionGroups).find(row => field(row, "Recording_ID") === recordingId);
  if (!recording) return null;
  const provider = field(recording, "Provider");
  const videoId = field(recording, "Video_ID") || extractVideoId(provider, field(recording, "Video_URL"));
  if (!videoId) return null;
  return {
    recordingId: field(recording, "Recording_ID"),
    recordingTitle: field(recording, "Recording_Title"),
    provider,
    sessionNumber: field(recording, "Session_Number"),
    levelCode: field(recording, "Level_Code"),
    videoId,
    studentName: studentRow.Student_Name,
    studentId: studentRow.Student_ID,
  };
}

export async function getStudentPortalLearningResources(academyStudentId: string, studentId: string): Promise<StudentPortalLearningResourceSummary[]> {
  await validateLearningResourceHeaders();
  const [students, enrollments, resources, accessRows, sessions] = await Promise.all([
    readSheet<StudentRow>("Students"),
    readSheet<EnrollmentRow>("Enrollments"),
    readSheetDataRegion<LearningResourceRow>("Learning_Resources"),
    readSheetDataRegion<LearningResourceGroupRow>("Learning_Resource_Groups"),
    readSheetDataRegion<AttendanceSessionRow>("Attendance_Sessions"),
  ]);
  const studentRow = students.find(row => row.Academy_Student_ID.trim() === academyStudentId && normalizeStudentId(row.Student_ID) === normalizeStudentId(studentId));
  if (!studentRow) throw new ServiceError("STUDENT_PORTAL_SESSION_INVALID", "Student portal session expired. Please sign in again.", 401);
  const groupIds = enrollments.filter(row => row.Academy_Student_ID.trim() === academyStudentId).map(row => row.Group_ID.trim()).filter(Boolean);
  return getAccessibleLearningResources(groupIds, resources, accessRows).map(resource => ({
    resourceId: field(resource, "Resource_ID"),
    resourceTitle: field(resource, "Resource_Title"),
    resourceDescription: field(resource, "Resource_Description"),
    resourceCategory: field(resource, "Resource_Category") || "Other",
    relatedSessionLabel: relatedResourceSessionLabel(field(resource, "Related_Attendance_Session_ID"), sessions),
    availableFrom: field(resource, "Available_From"),
    availableTo: field(resource, "Available_To"),
  }));
}

export async function getStudentPortalLearningResource(academyStudentId: string, studentId: string, resourceId: string): Promise<StudentPortalLearningResourcePlayback | null> {
  await validateLearningResourceHeaders();
  const [students, enrollments, resources, accessRows, sessions] = await Promise.all([
    readSheet<StudentRow>("Students"),
    readSheet<EnrollmentRow>("Enrollments"),
    readSheetDataRegion<LearningResourceRow>("Learning_Resources"),
    readSheetDataRegion<LearningResourceGroupRow>("Learning_Resource_Groups"),
    readSheetDataRegion<AttendanceSessionRow>("Attendance_Sessions"),
  ]);
  const studentRow = students.find(row => row.Academy_Student_ID.trim() === academyStudentId && normalizeStudentId(row.Student_ID) === normalizeStudentId(studentId));
  if (!studentRow) throw new ServiceError("STUDENT_PORTAL_SESSION_INVALID", "Student portal session expired. Please sign in again.", 401);
  const groupIds = enrollments.filter(row => row.Academy_Student_ID.trim() === academyStudentId).map(row => row.Group_ID.trim()).filter(Boolean);
  const resource = getAccessibleLearningResources(groupIds, resources, accessRows).find(row => field(row, "Resource_ID") === resourceId);
  if (!resource) return null;
  return {
    resourceId: field(resource, "Resource_ID"),
    resourceTitle: field(resource, "Resource_Title"),
    resourceDescription: field(resource, "Resource_Description"),
    resourceCategory: field(resource, "Resource_Category") || "Other",
    relatedSessionLabel: relatedResourceSessionLabel(field(resource, "Related_Attendance_Session_ID"), sessions),
    availableFrom: field(resource, "Available_From"),
    availableTo: field(resource, "Available_To"),
    provider: "GoogleDrive",
    videoId: field(resource, "Video_ID") || extractGoogleDriveFileId(field(resource, "Video_URL")),
    studentName: studentRow.Student_Name,
    studentId: studentRow.Student_ID,
  };
}

export async function getStudentPortalMaterial(academyStudentId: string, studentId: string, materialId: string): Promise<StudentPortalMaterialPlayback | null> {
  const [students, enrollments, sessionMaterials, sessionMaterialGroups] = await Promise.all([
    readSheet<StudentRow>("Students"),
    readSheet<EnrollmentRow>("Enrollments"),
    readSheetDataRegion<SessionMaterialRow>("Session_Materials"),
    readSheetDataRegion<SessionMaterialGroupRow>("Session_Material_Groups"),
  ]);
  const studentRow = students.find(row => row.Academy_Student_ID.trim() === academyStudentId && normalizeStudentId(row.Student_ID) === normalizeStudentId(studentId));
  if (!studentRow) throw new ServiceError("STUDENT_PORTAL_SESSION_INVALID", "Student portal session expired. Please sign in again.", 401);
  const groupIds = enrollments.filter(row => row.Academy_Student_ID.trim() === academyStudentId).map(row => row.Group_ID.trim()).filter(Boolean);
  const material = getAccessibleMaterials(groupIds, sessionMaterials, sessionMaterialGroups).find(row => field(row, "Material_ID") === materialId);
  if (!material) return null;
  const fileId = field(material, "File_ID") || extractGoogleFileId(field(material, "File_URL"));
  const previewUrl = materialPreviewUrl(field(material, "Provider"), field(material, "Material_Type"), fileId, field(material, "File_URL"));
  if (!previewUrl) return null;
  return {
    materialId: field(material, "Material_ID"),
    materialTitle: field(material, "Material_Title"),
    materialType: field(material, "Material_Type"),
    sessionNumber: field(material, "Session_Number"),
    levelCode: field(material, "Level_Code"),
    previewUrl,
    studentName: studentRow.Student_Name,
    studentId: studentRow.Student_ID,
  };
}

function extractVideoId(provider: string, url: string) {
  return provider === "GoogleDrive" ? extractGoogleDriveFileId(url) : "";
}

function getAccessibleRecordings(groupIds: string[], recordings: Array<RecordedSessionRow>, accessRows: Array<RecordedSessionGroupRow>) {
  const studentGroups = new Set(groupIds);
  const allowedRecordingIds = new Set(accessRows.filter(row => studentGroups.has(field(row, "Group_ID")) && activeAccess(field(row, "Access_Status"))).map(row => field(row, "Recording_ID")).filter(Boolean));
  const today = todayValue();
  return recordings.filter(row => field(row, "Provider") === "GoogleDrive" && allowedRecordingIds.has(field(row, "Recording_ID")) && activeValue(field(row, "Is_Active")) && field(row, "Publish_Status") === "Published" && availableFrom(field(row, "Available_From"), today) && availableTo(field(row, "Available_To"), today)).sort((left, right) => compareSessionNumber(field(left, "Session_Number"), field(right, "Session_Number")) || field(left, "Recording_Title").localeCompare(field(right, "Recording_Title")));
}

function getAccessibleMaterials(groupIds: string[], materials: Array<SessionMaterialRow>, accessRows: Array<SessionMaterialGroupRow>) {
  const studentGroups = new Set(groupIds);
  const allowedMaterialIds = new Set(accessRows.filter(row => studentGroups.has(field(row, "Group_ID")) && activeAccess(field(row, "Access_Status"))).map(row => field(row, "Material_ID")).filter(Boolean));
  const today = todayValue();
  const seen = new Set<string>();
  return materials.filter(row => {
    const materialId = field(row, "Material_ID");
    if (!materialId || seen.has(materialId)) return false;
    const allowed = field(row, "Provider") === "GoogleDrive" && allowedMaterialIds.has(materialId) && activeValue(field(row, "Is_Active")) && field(row, "Publish_Status") === "Published" && availableFrom(field(row, "Available_From"), today) && availableTo(field(row, "Available_To"), today);
    if (allowed) seen.add(materialId);
    return allowed;
  }).sort((left, right) => compareSessionNumber(field(left, "Session_Number"), field(right, "Session_Number")) || field(left, "Material_Title").localeCompare(field(right, "Material_Title")));
}

function getAccessibleLearningResources(groupIds: string[], resources: Array<LearningResourceRow>, accessRows: Array<LearningResourceGroupRow>) {
  const studentGroups = new Set(groupIds);
  const allowedResourceIds = new Set(accessRows.filter(row => studentGroups.has(field(row, "Group_ID")) && activeAccess(field(row, "Access_Status"))).map(row => field(row, "Resource_ID")).filter(Boolean));
  const today = todayValue();
  const seen = new Set<string>();
  return resources.filter(row => {
    const resourceId = field(row, "Resource_ID");
    const allowed = Boolean(resourceId)
      && !seen.has(resourceId)
      && allowedResourceIds.has(resourceId)
      && field(row, "Resource_Type").toUpperCase() === "VIDEO"
      && field(row, "Provider") === "GoogleDrive"
      && field(row, "Publish_Status") === "Published"
      && activeValue(field(row, "Is_Active"))
      && availableFrom(field(row, "Available_From"), today)
      && availableTo(field(row, "Available_To"), today)
      && Boolean(field(row, "Video_ID") || extractGoogleDriveFileId(field(row, "Video_URL")));
    if (allowed) seen.add(resourceId);
    return allowed;
  }).sort((left, right) => field(left, "Resource_Title").localeCompare(field(right, "Resource_Title")) || field(left, "Resource_ID").localeCompare(field(right, "Resource_ID")));
}

function relatedResourceSessionLabel(sessionId: string, sessions: Array<AttendanceSessionRow>) {
  if (!sessionId) return "";
  const session = sessions.find(row => field(row, "Attendance_Session_ID") === sessionId);
  if (!session) return "";
  return `Session ${field(session, "Session_Number") || "-"} | ${field(session, "Session_Title") || field(session, "Attendance_Code") || sessionId}`;
}

function normalizeStudentId(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function phoneComparisonValues(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const values = new Set<string>();
  if (!digits) return values;
  values.add(digits);
  if (digits.startsWith("0020") && digits.length > 4) values.add(`0${digits.slice(4)}`);
  if (digits.startsWith("20") && digits.length > 2) values.add(`0${digits.slice(2)}`);
  if (digits.startsWith("0") && digits.length > 1) values.add(`20${digits.slice(1)}`);
  return values;
}

function sharesPhoneVariant(left: Set<string>, right: Set<string>) {
  for (const value of left) if (right.has(value)) return true;
  return false;
}

async function resolveStudentPortalStudentRow(academyStudentId: string, studentId: string) {
  const students = await readSheet<StudentRow>("Students");
  const studentRow = students.find(row => row.Academy_Student_ID.trim() === academyStudentId && normalizeStudentId(row.Student_ID) === normalizeStudentId(studentId));
  if (!studentRow) throw new ServiceError("STUDENT_PORTAL_SESSION_INVALID", "Student portal session expired. Please sign in again.", 401);
  return studentRow;
}

function studentCertificateProfileDto(row: StudentRow): StudentCertificateProfile {
  return {
    certificateName: String(row.Certificate_Name ?? "").trim(),
    certificateEmail: String(row.Certificate_Email ?? "").trim().toLowerCase(),
    certificateProfileStatus: String(row.Certificate_Profile_Status ?? "").trim().toUpperCase(),
    certificateProfileConfirmedAt: String(row.Certificate_Profile_Confirmed_At ?? "").trim(),
  };
}

function studentPortalCertificateSummaryDto(row: CertificateRow): StudentPortalCertificateSummary {
  const certificateId = String(row.Certificate_ID ?? "").trim();
  const token = String(row.Verification_Token ?? "").trim();
  return {
    certificateId,
    certificateName: String(row.Certificate_Name ?? "").trim(),
    studentNameOnCertificate: String(row.Student_Name_On_Certificate ?? "").trim(),
    issueDate: formatCertificateDate(row.Issue_Date),
    verificationUrl: token ? `/verify/certificate/${encodeURIComponent(token)}` : "",
    viewHref: `/student/certificates/${encodeURIComponent(certificateId)}`,
    downloadHref: `/api/student-portal/certificates/${encodeURIComponent(certificateId)}/download`,
    imageDownloadHref: `/api/student-portal/certificates/${encodeURIComponent(certificateId)}/jpg`,
    imageFormat: "JPG",
    pdfFilename: `${safeFilename(certificateId)}_${safeFilename(row.Student_Name_On_Certificate || "Certificate")}.pdf`,
    imageFilename: `${safeFilename(certificateId)}_${safeFilename(row.Student_Name_On_Certificate || "Certificate")}.jpg`,
  };
}

function safeFilename(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "Certificate";
}

function assertCertificateProfileHeaders(row: StudentRow) {
  const missing = CERTIFICATE_PROFILE_HEADERS.find(header => !(header in row));
  if (missing) throw new ServiceError("STUDENT_CERTIFICATE_SCHEMA_NOT_READY", "Certificate information is temporarily unavailable. Please try again later.", 503);
}

function isCertificateProfileConfirmed(row: StudentRow) {
  return String(row.Certificate_Profile_Status ?? "").trim().toUpperCase() === "CONFIRMED";
}

export function normalizeCertificateName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new ServiceError("INVALID_CERTIFICATE_NAME", "Full Name in English is required.", 400);
  if (!/[A-Za-z]/.test(name)) throw new ServiceError("INVALID_CERTIFICATE_NAME", "Certificate name must include English letters.", 400);
  if (!/^[A-Za-z][A-Za-z\s'.-]*[A-Za-z.]$/.test(name) && !/^[A-Za-z]$/.test(name)) throw new ServiceError("INVALID_CERTIFICATE_NAME", "Certificate name may contain English letters, spaces, hyphen, apostrophe, and period only.", 400);
  return name;
}

export function normalizeCertificateEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email) throw new ServiceError("INVALID_CERTIFICATE_EMAIL", "Certificate Email is required.", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ServiceError("INVALID_CERTIFICATE_EMAIL", "Enter a valid certificate delivery email address.", 400);
  return email;
}

function field(row: Record<string, string>, header: string) {
  return String(Object.entries(row).find(([key]) => key.trim() === header)?.[1] ?? "").trim();
}

function activeValue(value: string) {
  return ["true", "yes", "1", "active"].includes(value.trim().toLowerCase());
}

function activeAccess(value: string) {
  const normalized = value.trim().toLowerCase();
  return !normalized || normalized === "active";
}

function availableFrom(value: string, today: string) {
  const date = comparableDate(value);
  return !date || date <= today;
}

function availableTo(value: string, today: string) {
  const date = comparableDate(value);
  return !date || date >= today;
}

function todayValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function comparableDate(value: string) {
  const text = value.trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
  return text.slice(0, 10);
}

function compareSessionNumber(left: string, right: string) {
  const leftNumber = Number(left.replace(/\D/g, ""));
  const rightNumber = Number(right.replace(/\D/g, ""));
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) return leftNumber - rightNumber;
  return left.localeCompare(right, undefined, { numeric: true });
}

function extractGoogleFileId(url: string) {
  const text = url.trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    const driveId = parsed.searchParams.get("id");
    if (driveId) return driveId.trim();
    const parts = parsed.pathname.split("/").filter(Boolean);
    const markerIndex = parts.findIndex(part => part === "d");
    if (markerIndex >= 0) return parts[markerIndex + 1] ?? "";
  } catch {
    return "";
  }
  return "";
}

function materialPreviewUrl(provider: string, materialType: string, fileId: string, fileUrl: string) {
  const id = fileId.trim();
  if (!id || provider !== "GoogleDrive") return "";
  const hostPath = fileUrl.trim().toLowerCase();
  if (hostPath.includes("docs.google.com/presentation/")) return `https://docs.google.com/presentation/d/${encodeURIComponent(id)}/preview`;
  if (hostPath.includes("docs.google.com/document/")) return `https://docs.google.com/document/d/${encodeURIComponent(id)}/preview`;
  if (hostPath.includes("docs.google.com/spreadsheets/")) return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/preview`;
  const normalizedType = materialType.trim().toLowerCase();
  if (normalizedType === "presentation" && hostPath.includes("docs.google.com")) return `https://docs.google.com/presentation/d/${encodeURIComponent(id)}/preview`;
  if (normalizedType === "doc" && hostPath.includes("docs.google.com")) return `https://docs.google.com/document/d/${encodeURIComponent(id)}/preview`;
  if (normalizedType === "sheet" && hostPath.includes("docs.google.com")) return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/preview`;
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
}
