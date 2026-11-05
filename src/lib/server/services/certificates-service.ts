import "server-only";
import { randomBytes } from "crypto";
import type { EnrollmentRow, StudentRow, TrackRow } from "../types";
import type { BatchRow, GroupRow } from "@/types/operations";
import type { AssignmentGroupRow, AssignmentResultRow, AssignmentRow, BatchRoadmapDto, BatchRoadmapRow, CertificateDto, CertificateEligibilityRow, CertificateRow, CertificatesData, CertificateStatus, CertificateTrackDto, CertificateVerificationData, LearningRoadmapItemRow, LearningRoadmapRow, RoadmapDto, RoadmapItemDto } from "@/types/tasks-grades";
import { appendRecordToDataRegion, atomicSheetMutation, updateRecord } from "../google/sheets";
import { ServiceError } from "./errors";
import { activeGroupsByAssignment, boolValue, buildCertificateReadinessRows, mapAssignment, normalizeStatus, readTasksGradesBundle, TASKS_GRADES_REQUIRED_HEADERS, text } from "./tasks-grades-service";
import { enrollmentDto, numberValue, studentDto } from "./mappers";
import { nextId } from "./id-service";
import type { SafeUser } from "../auth/types";
import { extractGoogleDriveFileId } from "@/lib/drive-links";

const CERTIFICATE_HEADERS = {
  ...TASKS_GRADES_REQUIRED_HEADERS,
  Learning_Roadmaps: ["Roadmap_ID", "Track_ID", "Credit_Hours", "Roadmap_Name", "Version", "Is_Active", "Created_At", "Created_By", "Notes"],
  Learning_Roadmap_Items: ["Roadmap_Item_ID", "Roadmap_ID", "Section_Name", "Topic_Title", "Sort_Order", "Is_Active", "Notes"],
  Batch_Roadmaps: ["Batch_Roadmap_ID", "Batch_ID", "Group_ID", "Roadmap_ID", "Is_Active", "Assigned_At", "Assigned_By", "Notes"],
  Certificates: ["Certificate_ID", "Verification_Token", "Academy_Student_ID", "Enrollment_ID", "Batch_ID", "Roadmap_ID", "Certificate_Name", "Issue_Date", "Certificate_Status", "Issued_By", "Issued_At", "Revoked_By", "Revoked_At", "Notes"],
} as const;

const CERTIFICATE_DELIVERY_HEADERS = ["Certificate_File_URL", "Certificate_File_ID", "Certificate_File_Name", "Portal_Status", "Published_At", "Published_By"] as const;

type CertificateSheets = {
  batches: Array<BatchRow & { _rowNumber: number }>;
  groups: Array<GroupRow & { _rowNumber: number }>;
  students: Array<StudentRow & { _rowNumber: number }>;
  enrollments: Array<EnrollmentRow & { _rowNumber: number }>;
  tracks: Array<TrackRow & { _rowNumber: number }>;
  assignments: Array<AssignmentRow & { _rowNumber: number }>;
  assignmentGroups: Array<AssignmentGroupRow & { _rowNumber: number }>;
  assignmentResults: Array<AssignmentResultRow & { _rowNumber: number }>;
  certificateEligibility: Array<CertificateEligibilityRow & { _rowNumber: number }>;
  learningRoadmaps: Array<LearningRoadmapRow & { _rowNumber: number }>;
  learningRoadmapItems: Array<LearningRoadmapItemRow & { _rowNumber: number }>;
  batchRoadmaps: Array<BatchRoadmapRow & { _rowNumber: number }>;
  certificates: Array<CertificateRow & { _rowNumber: number }>;
  certificateHeaders: string[];
};

function sheetRows<T extends Record<string, string>>(values: unknown[][] = []) {
  const headers = (values[0] ?? []).map(value => String(value ?? "").trim());
  return values.slice(1).map((cells, index) => {
    const record: Record<string, string | number> = { _rowNumber: index + 2 };
    headers.forEach((header, column) => { record[header] = String(cells[column] ?? ""); });
    return record as T & { _rowNumber: number };
  }).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && value !== ""));
}

function verifyHeaders(data: Record<string, unknown[][]>) {
  for (const [tab, expected] of Object.entries(CERTIFICATE_HEADERS)) {
    const headers = (data[tab]?.[0] ?? []).map(header => String(header ?? "").trim());
    const mismatch = expected.find((header, index) => headers[index] !== header);
    if (mismatch) throw new ServiceError("CERTIFICATES_SCHEMA_NOT_READY", `${tab} headers do not match the required Certificates schema.`, 409);
  }
}

async function loadCertificateSheets(): Promise<CertificateSheets> {
  const tabs = ["Batches", "Groups", "Students", "Enrollments", "Tracks", "Assignments", "Assignment_Groups", "Assignment_Results", "Certificate_Eligibility", "Learning_Roadmaps", "Learning_Roadmap_Items", "Batch_Roadmaps", "Certificates"];
  const data = await readTasksGradesBundle(tabs);
  verifyHeaders(data);
  return {
    batches: sheetRows<BatchRow>(data.Batches),
    groups: sheetRows<GroupRow>(data.Groups),
    students: sheetRows<StudentRow>(data.Students),
    enrollments: sheetRows<EnrollmentRow>(data.Enrollments),
    tracks: sheetRows<TrackRow>(data.Tracks),
    assignments: sheetRows<AssignmentRow>(data.Assignments),
    assignmentGroups: sheetRows<AssignmentGroupRow>(data.Assignment_Groups),
    assignmentResults: sheetRows<AssignmentResultRow>(data.Assignment_Results),
    certificateEligibility: sheetRows<CertificateEligibilityRow>(data.Certificate_Eligibility),
    learningRoadmaps: sheetRows<LearningRoadmapRow>(data.Learning_Roadmaps),
    learningRoadmapItems: sheetRows<LearningRoadmapItemRow>(data.Learning_Roadmap_Items),
    batchRoadmaps: sheetRows<BatchRoadmapRow>(data.Batch_Roadmaps),
    certificates: sheetRows<CertificateRow>(data.Certificates),
    certificateHeaders: (data.Certificates?.[0] ?? []).map(header => String(header ?? "").trim()),
  };
}

function assignmentDtos(sheets: CertificateSheets) {
  const groupNamesById = new Map(sheets.groups.map(row => [row.Group_ID, row.Group_Name]));
  return sheets.assignments.map(row => mapAssignment(row, groupNamesById, activeGroupsByAssignment(sheets.assignmentGroups)));
}

function roadmapDtos(sheets: CertificateSheets): RoadmapDto[] {
  const itemsByRoadmap = countBy(sheets.learningRoadmapItems.filter(row => boolValue(row.Is_Active)), row => row.Roadmap_ID);
  const groupsByRoadmap = countBy(sheets.batchRoadmaps.filter(row => boolValue(row.Is_Active) && text(row.Group_ID)), row => row.Roadmap_ID);
  return sheets.learningRoadmaps.map(row => ({
    roadmapId: row.Roadmap_ID,
    trackId: row.Track_ID,
    creditHours: text(row.Credit_Hours) ? numberValue(row.Credit_Hours) : 0,
    roadmapName: row.Roadmap_Name,
    version: row.Version,
    isActive: boolValue(row.Is_Active),
    createdAt: row.Created_At,
    createdBy: row.Created_By,
    notes: row.Notes,
    topicCount: itemsByRoadmap.get(row.Roadmap_ID) ?? 0,
    batchCount: groupsByRoadmap.get(row.Roadmap_ID) ?? 0,
  }));
}

function itemDtos(sheets: CertificateSheets): RoadmapItemDto[] {
  return sheets.learningRoadmapItems.map(row => ({ roadmapItemId: row.Roadmap_Item_ID, roadmapId: row.Roadmap_ID, sectionName: row.Section_Name, topicTitle: row.Topic_Title, sortOrder: text(row.Sort_Order) ? numberValue(row.Sort_Order) : null, isActive: boolValue(row.Is_Active), notes: row.Notes })).sort((left, right) => left.roadmapId.localeCompare(right.roadmapId) || (left.sortOrder ?? 999999) - (right.sortOrder ?? 999999) || left.topicTitle.localeCompare(right.topicTitle));
}

function batchRoadmapDtos(sheets: CertificateSheets): BatchRoadmapDto[] {
  const groupsById = new Map(sheets.groups.map(row => [row.Group_ID, row.Group_Name]));
  const roadmapsById = new Map(sheets.learningRoadmaps.map(row => [row.Roadmap_ID, row.Roadmap_Name]));
  return sheets.batchRoadmaps.map(row => ({
    batchRoadmapId: row.Batch_Roadmap_ID,
    batchId: row.Batch_ID,
    groupId: row.Group_ID,
    groupName: groupsById.get(row.Group_ID) ?? (row.Group_ID || "Legacy mapping without Group"),
    roadmapId: row.Roadmap_ID,
    roadmapName: roadmapsById.get(row.Roadmap_ID) ?? row.Roadmap_ID,
    isActive: boolValue(row.Is_Active),
    assignedAt: row.Assigned_At,
    assignedBy: row.Assigned_By,
    notes: row.Notes,
  }));
}

function certificateDtos(sheets: CertificateSheets): CertificateDto[] {
  const studentsById = new Map(sheets.students.map(row => [row.Academy_Student_ID, studentDto(row)]));
  const enrollmentsById = new Map(sheets.enrollments.map(row => [row.Enrollment_ID, enrollmentDto(row)]));
  const groupsById = new Map(sheets.groups.map(row => [row.Group_ID, row]));
  const roadmapsById = new Map(roadmapDtos(sheets).map(row => [row.roadmapId, row]));
  return sheets.certificates.map(row => {
    const verification = resolveCertificateVerificationRecord(row, sheets);
    const student = studentsById.get(row.Academy_Student_ID);
    const enrollment = enrollmentsById.get(row.Enrollment_ID);
    const group = enrollment ? groupsById.get(enrollment.groupId) : undefined;
    const roadmap = roadmapsById.get(row.Roadmap_ID);
    const certificateStatus: CertificateStatus = row.Certificate_Status === "REVOKED" ? "REVOKED" : "ISSUED";
    const verificationUrl = verificationUrlForToken(row.Verification_Token);
    const portalStatus = text(row.Portal_Status).toUpperCase() === "PUBLISHED" ? "PUBLISHED" as const : "NOT_PUBLISHED" as const;
    return {
      certificateId: row.Certificate_ID,
      verificationToken: row.Verification_Token,
      academyStudentId: row.Academy_Student_ID,
      enrollmentId: row.Enrollment_ID,
      batchId: group?.Batch_ID ?? row.Batch_ID,
      groupId: enrollment?.groupId ?? "",
      roadmapId: row.Roadmap_ID,
      certificateName: verification?.certificate?.certificateName ?? row.Certificate_Name,
      issueDate: verification?.certificate?.issueDate ?? formatCertificateDate(row.Issue_Date),
      certificateStatus,
      studentName: student?.studentName ?? "Unknown Student",
      studentNameOnCertificate: verification?.certificate?.studentName ?? text(row.Student_Name_On_Certificate),
      certificateDeliveryEmail: text(row.Certificate_Delivery_Email).toLowerCase(),
      university: verification?.certificate?.university ?? student?.university ?? "",
      college: verification?.certificate?.college ?? student?.college ?? "",
      universityStudentId: verification?.certificate?.universityStudentId ?? student?.studentId ?? "",
      groupName: enrollment ? group?.Group_Name ?? enrollment.groupId : "",
      track: verification?.certificate?.track ?? enrollment?.track ?? "",
      creditHours: verification?.certificate?.creditHours ?? enrollment?.exactHours ?? 0,
      deliveryMode: verification?.certificate?.deliveryMode ?? enrollment?.deliveryMode ?? "",
      roadmapName: verification?.certificate?.roadmapName ?? roadmap?.roadmapName ?? row.Roadmap_ID,
      roadmapVersion: verification?.certificate?.roadmapVersion ?? roadmap?.version ?? "",
      learningRoadmap: flattenRoadmapSections(verification?.roadmapSections ?? []),
      completedTasks: (verification?.tasks ?? []).map(task => task.title).join("\n"),
      projects: (verification?.projects ?? []).map(project => `${project.title} - ${project.result}`).join("\n"),
      verificationUrl,
      qrCodeValue: verificationUrl,
      certificateFileId: text(row.Certificate_File_ID),
      certificateFileName: text(row.Certificate_File_Name),
      portalStatus,
      publishedAt: formatCertificateDate(row.Published_At),
      publishedBy: text(row.Published_By),
    };
  }).sort((left, right) => right.issueDate.localeCompare(left.issueDate) || left.studentName.localeCompare(right.studentName));
}

export function formatCertificateDate(value: unknown) {
  const date = parseCertificateDate(value);
  if (!date) return text(value) || "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function parseCertificateDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const numeric = typeof value === "number" ? value : /^-?\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
  if (Number.isFinite(numeric) && numeric > 0) {
    const epoch = Date.UTC(1899, 11, 30);
    const millis = epoch + Math.floor(numeric) * 24 * 60 * 60 * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isTemporarySheetsError(error: unknown) {
  const candidate = error as { code?: number | string; status?: number | string; response?: { status?: number | string } };
  const status = Number(candidate?.response?.status ?? candidate?.status ?? candidate?.code ?? 0);
  return [408, 429, 500, 502, 503, 504].includes(status);
}

function certificateSnapshotFields(sheets: CertificateSheets) {
  return {
    studentNameOnCertificate: sheets.certificateHeaders.includes("Student_Name_On_Certificate"),
    certificateDeliveryEmail: sheets.certificateHeaders.includes("Certificate_Delivery_Email"),
  };
}

function certificateDeliveryFields(sheets: CertificateSheets) {
  const missing = CERTIFICATE_DELIVERY_HEADERS.filter(header => !sheets.certificateHeaders.includes(header));
  return { ready: missing.length === 0, missing: [...missing] };
}

function assertCertificateDeliveryFields(sheets: CertificateSheets) {
  const fields = certificateDeliveryFields(sheets);
  if (!fields.ready) throw new ServiceError("CERTIFICATE_DELIVERY_SCHEMA_NOT_READY", `Certificates is missing delivery headers: ${fields.missing.join(", ")}`, 409);
}

function confirmedCertificateProfile(student?: StudentRow) {
  const certificateName = text(student?.Certificate_Name);
  const certificateEmail = text(student?.Certificate_Email).toLowerCase();
  const status: "CONFIRMED" | "NOT_CONFIRMED" = text(student?.Certificate_Profile_Status).toUpperCase() === "CONFIRMED" ? "CONFIRMED" : "NOT_CONFIRMED";
  return {
    status,
    certificateName,
    certificateEmail,
    confirmedAt: text(student?.Certificate_Profile_Confirmed_At),
    complete: status === "CONFIRMED" && Boolean(certificateName) && Boolean(certificateEmail),
  };
}

function activeCertificateStatus(row: CertificateRow | undefined) {
  if (!row) return "NOT_ISSUED" as const;
  return text(row.Certificate_Status).toUpperCase() === "REVOKED" ? "REVOKED" as const : "ISSUED" as const;
}

function activeRoadmapsForGroup(sheets: CertificateSheets, batchId: string, groupId: string) {
  return sheets.batchRoadmaps.filter(row => row.Batch_ID === batchId && row.Group_ID === groupId && boolValue(row.Is_Active));
}

function issueBlockReason(row: {
  automaticReadiness: string;
  certificateDecision: string;
  certificateStatus?: string;
  certificateProfileStatus?: string;
  certificateNameOnCertificate?: string;
  certificateDeliveryEmail?: string;
  roadmapStatus?: string;
}, snapshots: ReturnType<typeof certificateSnapshotFields>) {
  if (row.certificateStatus === "ISSUED") return "Certificate has already been issued for this enrollment.";
  if (row.automaticReadiness !== "READY") return "Student is not automatically ready for certificate issuance yet.";
  if (row.certificateDecision !== "APPROVED") return "Certificate approval is required before issuance.";
  if (row.certificateProfileStatus !== "CONFIRMED") return "Student has not confirmed certificate information.";
  if (!text(row.certificateNameOnCertificate) || !text(row.certificateDeliveryEmail)) return "Confirmed certificate information is incomplete.";
  if (row.roadmapStatus === "NOT_ASSIGNED") return "No active Roadmap is assigned to this Group.";
  if (row.roadmapStatus === "CONFLICT") return "Multiple active Roadmaps are assigned to this Group.";
  if (row.roadmapStatus === "INACTIVE") return "Assigned Roadmap is inactive or unavailable.";
  if (!snapshots.studentNameOnCertificate || !snapshots.certificateDeliveryEmail) return "Certificate snapshot columns are missing from Certificates.";
  return "";
}

export function buildRoadmapTrackOptions(rows: TrackRow[]): CertificateTrackDto[] {
  const byTrackId = new Map<string, { option: CertificateTrackDto; signature: string; labelKey: string; variantLabel: string }>();
  let conflictingDuplicateIds = 0;
  for (const row of rows) {
    const trackId = text(row.Track_ID);
    const trackName = normalizeSpaces(row.Track);
    if (!trackId || !trackName) continue;
    const exactHours = text(row.Exact_Hours) ? numberValue(row.Exact_Hours) : 0;
    const option = {
      trackId,
      trackName,
      university: normalizeSpaces(row.University),
      exactHours,
      isActive: boolValue(row.Is_Active),
      label: `${trackName} (${exactHours}H)`,
    };
    const signature = [normalizeKey(option.trackName), option.exactHours, normalizeKey(option.university), normalizeKey(row.Offering_Type), normalizeKey(row.Package_Label), option.isActive ? "active" : "inactive"].join("|");
    const variantLabel = [normalizeSpaces(row.Offering_Type).replace(/_/g, " "), normalizeSpaces(row.Package_Label), option.university].filter(Boolean).join(" — ");
    const existing = byTrackId.get(trackId);
    if (!existing) byTrackId.set(trackId, { option, signature, labelKey: normalizeKey(option.label), variantLabel });
    else if (existing.signature !== signature) {
      conflictingDuplicateIds++;
      if (process.env.NODE_ENV !== "production") console.warn(`Duplicate Track_ID with conflicting metadata: ${trackId}`);
      if (trackOptionRank(option) < trackOptionRank(existing.option)) byTrackId.set(trackId, { option, signature, labelKey: normalizeKey(option.label), variantLabel });
    }
  }
  const byLabel = new Map<string, Array<{ option: CertificateTrackDto; signature: string; variantLabel: string }>>();
  for (const entry of byTrackId.values()) {
    byLabel.set(entry.labelKey, [...(byLabel.get(entry.labelKey) ?? []), entry]);
  }
  const options: CertificateTrackDto[] = [];
  for (const entries of byLabel.values()) {
    const bySignature = new Map<string, Array<{ option: CertificateTrackDto; signature: string; variantLabel: string }>>();
    for (const entry of entries) bySignature.set(entry.signature, [...(bySignature.get(entry.signature) ?? []), entry]);
    const canonicalEntries = [...bySignature.values()].map(signatureEntries => signatureEntries.sort((left, right) => trackOptionRank(left.option) - trackOptionRank(right.option) || left.option.trackId.localeCompare(right.option.trackId))[0]);
    if (canonicalEntries.length === 1) {
      options.push(canonicalEntries[0].option);
      continue;
    }
    const labelCounts = new Map<string, number>();
    for (const entry of canonicalEntries) {
      const variant = entry.variantLabel || entry.option.trackId;
      const label = `${entry.option.label} — ${variant}`;
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
      options.push({ ...entry.option, label: labelCounts.get(label)! > 1 ? `${label} — ${entry.option.trackId}` : label });
    }
  }
  if (conflictingDuplicateIds && process.env.NODE_ENV !== "production") console.warn(`Conflicting duplicate Track_ID count: ${conflictingDuplicateIds}`);
  return options.sort((left, right) => left.trackName.localeCompare(right.trackName) || left.exactHours - right.exactHours || left.university.localeCompare(right.university) || left.trackId.localeCompare(right.trackId));
}

export async function getCertificatesData(params: { batchId?: string; groupId?: string } = {}): Promise<CertificatesData> {
  const sheets = await loadCertificateSheets();
  const assignments = assignmentDtos(sheets);
  const certificatesByEnrollment = new Map(sheets.certificates.map(row => [row.Enrollment_ID, row]));
  const studentsById = new Map(sheets.students.map(row => [row.Academy_Student_ID, row]));
  const groupsById = new Map(sheets.groups.map(row => [row.Group_ID, row]));
  const roadmapsById = new Map(roadmapDtos(sheets).map(row => [row.roadmapId, row]));
  const snapshots = certificateSnapshotFields(sheets);
  let readinessRows = params.batchId ? buildCertificateReadinessRows(sheets, assignments, params.batchId) : [];
  if (params.groupId) readinessRows = readinessRows.filter(row => row.groupId === params.groupId);
  readinessRows = readinessRows.map(row => {
    const certificate = certificatesByEnrollment.get(row.enrollmentId);
    const studentProfile = confirmedCertificateProfile(studentsById.get(row.academyStudentId));
    const group = groupsById.get(row.groupId);
    const activeRoadmaps = group ? activeRoadmapsForGroup(sheets, group.Batch_ID, group.Group_ID) : [];
    const activeMapping = activeRoadmaps.length === 1 ? activeRoadmaps[0] : undefined;
    const roadmap = activeMapping ? roadmapsById.get(activeMapping.Roadmap_ID) : undefined;
    const roadmapStatus: "ASSIGNED" | "NOT_ASSIGNED" | "CONFLICT" | "INACTIVE" = !activeRoadmaps.length ? "NOT_ASSIGNED" : activeRoadmaps.length > 1 ? "CONFLICT" : !roadmap?.isActive ? "INACTIVE" : "ASSIGNED";
    const enriched = {
      ...row,
      certificateStatus: activeCertificateStatus(certificate),
      certificateId: certificate?.Certificate_ID,
      certificateProfileStatus: studentProfile.status,
      certificateProfileConfirmedAt: studentProfile.confirmedAt,
      certificateNameOnCertificate: studentProfile.certificateName,
      certificateDeliveryEmail: studentProfile.certificateEmail,
      roadmapId: activeMapping?.Roadmap_ID,
      roadmapName: roadmap?.roadmapName,
      roadmapVersion: roadmap?.version,
      roadmapStatus,
    };
    return { ...enriched, certificateIssueBlockReason: issueBlockReason(enriched, snapshots) };
  });
  return {
    schemaReady: true,
    batches: sheets.batches.map(row => ({ batchId: row.Batch_ID, batchName: row.Batch_Name, status: row.Status })).sort((left, right) => left.batchName.localeCompare(right.batchName)),
    groups: sheets.groups.map(row => ({ groupId: row.Group_ID, groupName: row.Group_Name, batchId: row.Batch_ID, status: row.Status })).sort((left, right) => left.groupName.localeCompare(right.groupName)),
    tracks: buildRoadmapTrackOptions(sheets.tracks),
    readinessRows,
    roadmaps: roadmapDtos(sheets),
    roadmapItems: itemDtos(sheets),
    batchRoadmaps: batchRoadmapDtos(sheets),
    certificates: certificateDtos(sheets).filter(row => (!params.batchId || row.batchId === params.batchId) && (!params.groupId || row.groupId === params.groupId)),
    certificateSnapshotFields: snapshots,
    certificateDeliveryFields: certificateDeliveryFields(sheets),
  };
}

export async function issueCertificate(input: { enrollmentId: string }, user: SafeUser) {
  const sheets = await loadCertificateSheets();
  const now = new Date().toISOString();
  const context = buildIssuanceContext(sheets);
  const certificateId = allocateCertificateId(context.allocatedCertificateIds);
  const token = allocateToken(context.allocatedTokens);
  const prepared = prepareCertificateIssuance(input.enrollmentId, sheets, context, certificateId, token, now, user);
  if (prepared.status !== "ISSUED") throw new ServiceError(prepared.code ?? "CERTIFICATE_ISSUE_FAILED", prepared.message, prepared.status === "ALREADY_ISSUED" ? 409 : 400);
  await appendRecordToDataRegion("Certificates", prepared.record);
  return { certificateId, verificationToken: token };
}

export async function issueCertificatesBulk(input: { enrollmentIds: string[] }, user: SafeUser) {
  const sheets = await loadCertificateSheets();
  const context = buildIssuanceContext(sheets);
  const now = new Date().toISOString();
  const requestedEnrollmentIds = [...new Set(input.enrollmentIds.map(value => text(value)).filter(Boolean))];
  if (!requestedEnrollmentIds.length) throw new ServiceError("VALIDATION_ERROR", "At least one Enrollment is required.", 400);
  if (requestedEnrollmentIds.length > 200) throw new ServiceError("VALIDATION_ERROR", "Too many certificates selected for one bulk issue request.", 400);
  const results: Array<{ enrollmentId: string; status: "ISSUED" | "ALREADY_ISSUED" | "FAILED"; certificateId?: string; message?: string }> = [];
  const appends: Array<{ tab: "Certificates"; record: CertificateRow }> = [];
  for (const enrollmentId of requestedEnrollmentIds) {
    const certificateId = allocateCertificateId(context.allocatedCertificateIds);
    const token = allocateToken(context.allocatedTokens);
    const prepared = prepareCertificateIssuance(enrollmentId, sheets, context, certificateId, token, now, user);
    if (prepared.status === "ISSUED") {
      appends.push({ tab: "Certificates", record: prepared.record });
      results.push({ enrollmentId, status: "ISSUED", certificateId });
    } else {
      context.allocatedCertificateIds.delete(certificateId);
      context.allocatedTokens.delete(token);
      results.push({ enrollmentId, status: prepared.status, message: prepared.message });
    }
  }
  if (appends.length) await atomicSheetMutation({ appends });
  return {
    issued: results.filter(result => result.status === "ISSUED").length,
    alreadyIssued: results.filter(result => result.status === "ALREADY_ISSUED").length,
    failed: results.filter(result => result.status === "FAILED").length,
    results,
  };
}

function buildIssuanceContext(sheets: CertificateSheets) {
  const assignments = assignmentDtos(sheets);
  const studentsById = new Map(sheets.students.map(row => [row.Academy_Student_ID, row]));
  const enrollmentsById = new Map(sheets.enrollments.map(row => [row.Enrollment_ID, row]));
  const groupsById = new Map(sheets.groups.map(row => [row.Group_ID, row]));
  const roadmapsById = new Map(sheets.learningRoadmaps.map(row => [row.Roadmap_ID, row]));
  const activeIssuedByEnrollment = new Map<string, CertificateRow>(sheets.certificates.filter(row => text(row.Certificate_Status).toUpperCase() === "ISSUED").map(row => [row.Enrollment_ID, row]));
  const readinessByEnrollment = new Map<string, ReturnType<typeof buildCertificateReadinessRows>[number]>();
  for (const batchId of [...new Set(sheets.groups.map(row => row.Batch_ID).filter(Boolean))]) {
    for (const row of buildCertificateReadinessRows(sheets, assignments, batchId)) readinessByEnrollment.set(row.enrollmentId, row);
  }
  return {
    snapshots: certificateSnapshotFields(sheets),
    studentsById,
    enrollmentsById,
    groupsById,
    roadmapsById,
    activeIssuedByEnrollment,
    readinessByEnrollment,
    allocatedCertificateIds: new Set(sheets.certificates.map(row => row.Certificate_ID)),
    allocatedTokens: new Set(sheets.certificates.map(row => row.Verification_Token).filter(Boolean)),
  };
}

function prepareCertificateIssuance(enrollmentId: string, sheets: CertificateSheets, context: ReturnType<typeof buildIssuanceContext>, certificateId: string, token: string, now: string, user: SafeUser): { status: "ISSUED"; record: CertificateRow } | { status: "ALREADY_ISSUED" | "FAILED"; code?: string; message: string } {
  const enrollment = context.enrollmentsById.get(enrollmentId);
  if (!enrollment) return { status: "FAILED", code: "ENROLLMENT_NOT_FOUND", message: "Enrollment was not found." };
  const student = context.studentsById.get(enrollment.Academy_Student_ID);
  if (!student) return { status: "FAILED", code: "STUDENT_NOT_FOUND", message: "Student record was not found." };
  const studentProfile = confirmedCertificateProfile(student);
  if (!studentProfile.complete) return { status: "FAILED", code: "CERTIFICATE_PROFILE_NOT_CONFIRMED", message: "Certificate information is not confirmed." };
  if (!context.snapshots.studentNameOnCertificate || !context.snapshots.certificateDeliveryEmail) return { status: "FAILED", code: "CERTIFICATE_SNAPSHOT_SCHEMA_MISSING", message: "Certificate snapshot fields are not configured." };
  const group = context.groupsById.get(enrollment.Group_ID);
  if (!group) return { status: "FAILED", code: "VALIDATION_ERROR", message: "Enrollment group is not configured." };
  const readiness = context.readinessByEnrollment.get(enrollmentId);
  if (!readiness) return { status: "FAILED", code: "ENROLLMENT_NOT_FOUND", message: "Enrollment readiness could not be calculated." };
  if (readiness.automaticReadiness !== "READY") return { status: "FAILED", code: "CERTIFICATE_NOT_READY", message: "Student is not ready for certificate issuance." };
  if (readiness.certificateDecision !== "APPROVED") return { status: "FAILED", code: "CERTIFICATE_NOT_APPROVED", message: "Certificate approval is required." };
  if (context.activeIssuedByEnrollment.has(enrollmentId)) return { status: "ALREADY_ISSUED", code: "CERTIFICATE_ALREADY_ISSUED", message: "Certificate already issued." };
  const activeRoadmaps = activeRoadmapsForGroup(sheets, group.Batch_ID, group.Group_ID);
  if (activeRoadmaps.length === 0) return { status: "FAILED", code: "ROADMAP_GROUP_MAPPING_NOT_FOUND", message: "Roadmap is not assigned." };
  if (activeRoadmaps.length > 1) return { status: "FAILED", code: "ROADMAP_GROUP_MAPPING_CONFLICT", message: "Multiple active Roadmaps are configured." };
  const roadmap = context.roadmapsById.get(activeRoadmaps[0].Roadmap_ID);
  if (!roadmap || !boolValue(roadmap.Is_Active)) return { status: "FAILED", code: "ROADMAP_NOT_FOUND", message: "Assigned roadmap is inactive or unavailable." };
  context.activeIssuedByEnrollment.set(enrollmentId, { Certificate_ID: certificateId, Verification_Token: token, Academy_Student_ID: readiness.academyStudentId, Enrollment_ID: readiness.enrollmentId, Batch_ID: group.Batch_ID, Roadmap_ID: activeRoadmaps[0].Roadmap_ID, Certificate_Name: roadmap.Roadmap_Name || `${readiness.track} Certificate`, Issue_Date: now.slice(0, 10), Certificate_Status: "ISSUED", Issued_By: user.userId, Issued_At: now, Revoked_By: "", Revoked_At: "", Notes: "", Student_Name_On_Certificate: studentProfile.certificateName, Certificate_Delivery_Email: studentProfile.certificateEmail });
  return { status: "ISSUED", record: context.activeIssuedByEnrollment.get(enrollmentId)! };
}

function allocateCertificateId(allocatedIds: Set<string>) {
  const id = nextId([...allocatedIds], /^CERT_(\d+)$/, sequence => `CERT_${String(sequence).padStart(6, "0")}`);
  allocatedIds.add(id);
  return id;
}

function allocateToken(allocatedTokens: Set<string>) {
  const token = uniqueToken(allocatedTokens);
  allocatedTokens.add(token);
  return token;
}

export async function revokeCertificate(input: { certificateId: string }, user: SafeUser) {
  const sheets = await loadCertificateSheets();
  const certificate = sheets.certificates.find(row => row.Certificate_ID === input.certificateId);
  if (!certificate) throw new ServiceError("CERTIFICATE_NOT_FOUND", "Certificate was not found.", 404);
  if (certificate.Certificate_Status === "REVOKED") return { certificateId: input.certificateId, status: "REVOKED" };
  await updateRecord("Certificates", certificate._rowNumber, { Certificate_Status: "REVOKED", Revoked_By: user.userId, Revoked_At: new Date().toISOString() });
  return { certificateId: input.certificateId, status: "REVOKED" };
}

export async function publishCertificatesBulk(input: { certificates: Array<{ certificateId: string; driveUrl?: string }> }, user: SafeUser) {
  const sheets = await loadCertificateSheets();
  assertCertificateDeliveryFields(sheets);
  const requested = [...new Map(input.certificates.map(row => [text(row.certificateId), row])).values()].filter(row => text(row.certificateId));
  if (!requested.length) throw new ServiceError("VALIDATION_ERROR", "At least one certificate is required.", 400);
  if (requested.length > 200) throw new ServiceError("VALIDATION_ERROR", "Too many certificates selected for one publish request.", 400);
  const enrollmentsById = new Map(sheets.enrollments.map(row => [row.Enrollment_ID, row]));
  const studentsById = new Map(sheets.students.map(row => [row.Academy_Student_ID, row]));
  const certificatesById = new Map(sheets.certificates.map(row => [row.Certificate_ID, row]));
  const now = new Date().toISOString();
  const updates: Array<{ tab: "Certificates"; rowNumber: number; patch: Record<string, string> }> = [];
  const results: Array<{ certificateId: string; status: "PUBLISHED" | "ALREADY_PUBLISHED" | "FAILED"; message?: string }> = [];
  for (const request of requested) {
    const certificateId = text(request.certificateId);
    const certificate = certificatesById.get(certificateId);
    if (!certificate) {
      results.push({ certificateId, status: "FAILED", message: "Certificate was not found." });
      continue;
    }
    if (text(certificate.Certificate_Status).toUpperCase() !== "ISSUED") {
      results.push({ certificateId, status: "FAILED", message: "Only issued certificates can be published." });
      continue;
    }
    const enrollment = enrollmentsById.get(certificate.Enrollment_ID);
    const student = studentsById.get(certificate.Academy_Student_ID);
    if (!enrollment || !student || enrollment.Academy_Student_ID !== certificate.Academy_Student_ID) {
      results.push({ certificateId, status: "FAILED", message: "Certificate ownership could not be validated." });
      continue;
    }
    const existingFileId = text(certificate.Certificate_File_ID);
    const driveUrl = text(request.driveUrl) || text(certificate.Certificate_File_URL);
    const fileId = extractGoogleDriveFileId(driveUrl) || existingFileId;
    if (!fileId) {
      results.push({ certificateId, status: "FAILED", message: "A valid Google Drive certificate PDF link is required." });
      continue;
    }
    if (text(certificate.Portal_Status).toUpperCase() === "PUBLISHED" && existingFileId === fileId) {
      results.push({ certificateId, status: "ALREADY_PUBLISHED", message: "Certificate is already published." });
      continue;
    }
    updates.push({
      tab: "Certificates",
      rowNumber: certificate._rowNumber,
      patch: {
        Certificate_File_URL: driveUrl || `https://drive.google.com/file/d/${fileId}/view`,
        Certificate_File_ID: fileId,
        Certificate_File_Name: text(certificate.Certificate_File_Name) || `${certificate.Certificate_ID}.pdf`,
        Portal_Status: "PUBLISHED",
        Published_At: now,
        Published_By: user.userId,
      },
    });
    results.push({ certificateId, status: "PUBLISHED" });
  }
  if (updates.length) await atomicSheetMutation({ updates });
  return {
    published: results.filter(result => result.status === "PUBLISHED").length,
    alreadyPublished: results.filter(result => result.status === "ALREADY_PUBLISHED").length,
    failed: results.filter(result => result.status === "FAILED").length,
    results,
  };
}

export async function unpublishCertificate(input: { certificateId: string }, user: SafeUser) {
  const sheets = await loadCertificateSheets();
  assertCertificateDeliveryFields(sheets);
  const certificate = sheets.certificates.find(row => row.Certificate_ID === input.certificateId);
  if (!certificate) throw new ServiceError("CERTIFICATE_NOT_FOUND", "Certificate was not found.", 404);
  if (text(certificate.Portal_Status).toUpperCase() !== "PUBLISHED") return { certificateId: input.certificateId, status: "NOT_PUBLISHED" };
  await updateRecord("Certificates", certificate._rowNumber, { Portal_Status: "NOT_PUBLISHED", Published_By: user.userId, Published_At: new Date().toISOString() });
  return { certificateId: input.certificateId, status: "NOT_PUBLISHED" };
}

export async function saveRoadmap(input: { roadmapId?: string; trackId: string; creditHours: number; roadmapName: string; version?: string; isActive: boolean; notes?: string }, user: SafeUser) {
  const sheets = await loadCertificateSheets();
  if (!text(input.roadmapName)) throw new ServiceError("VALIDATION_ERROR", "Roadmap name is required.", 400);
  const existing = input.roadmapId ? sheets.learningRoadmaps.find(row => row.Roadmap_ID === input.roadmapId) : undefined;
  const now = new Date().toISOString();
  const roadmapId = existing?.Roadmap_ID ?? nextId(sheets.learningRoadmaps.map(row => row.Roadmap_ID), /^RDM_(\d+)$/, sequence => `RDM_${String(sequence).padStart(5, "0")}`);
  const record: LearningRoadmapRow = { Roadmap_ID: roadmapId, Track_ID: text(input.trackId), Credit_Hours: String(input.creditHours || ""), Roadmap_Name: text(input.roadmapName), Version: text(input.version) || "v1", Is_Active: String(input.isActive).toUpperCase(), Created_At: existing?.Created_At || now, Created_By: existing?.Created_By || user.userId, Notes: text(input.notes) };
  if (existing) await updateRecord("Learning_Roadmaps", existing._rowNumber, record);
  else await appendRecordToDataRegion("Learning_Roadmaps", record);
  return { roadmapId };
}

export async function saveRoadmapItem(input: { roadmapItemId?: string; roadmapId: string; sectionName: string; topicTitle: string; sortOrder?: number | null; isActive: boolean; notes?: string }) {
  const sheets = await loadCertificateSheets();
  if (!sheets.learningRoadmaps.some(row => row.Roadmap_ID === input.roadmapId)) throw new ServiceError("ROADMAP_NOT_FOUND", "Roadmap was not found.", 404);
  const existing = input.roadmapItemId ? sheets.learningRoadmapItems.find(row => row.Roadmap_Item_ID === input.roadmapItemId) : undefined;
  const roadmapItemId = existing?.Roadmap_Item_ID ?? nextId(sheets.learningRoadmapItems.map(row => row.Roadmap_Item_ID), /^RDMI_(\d+)$/, sequence => `RDMI_${String(sequence).padStart(5, "0")}`);
  const record: LearningRoadmapItemRow = { Roadmap_Item_ID: roadmapItemId, Roadmap_ID: input.roadmapId, Section_Name: text(input.sectionName), Topic_Title: text(input.topicTitle), Sort_Order: input.sortOrder == null ? "" : String(input.sortOrder), Is_Active: String(input.isActive).toUpperCase(), Notes: text(input.notes) };
  if (existing) await updateRecord("Learning_Roadmap_Items", existing._rowNumber, record);
  else await appendRecordToDataRegion("Learning_Roadmap_Items", record);
  return { roadmapItemId };
}

export async function assignRoadmapToGroup(input: { batchId: string; groupId?: string; groupIds?: string[]; roadmapId: string; notes?: string }, user: SafeUser) {
  const sheets = await loadCertificateSheets();
  if (!sheets.batches.some(row => row.Batch_ID === input.batchId)) throw new ServiceError("VALIDATION_ERROR", "Batch was not found.", 404);
  const groupIds = [...new Set([...(input.groupIds ?? []), ...(input.groupId ? [input.groupId] : [])].map(value => text(value)).filter(Boolean))];
  if (!groupIds.length) throw new ServiceError("VALIDATION_ERROR", "At least one Group is required.", 400);
  const roadmap = sheets.learningRoadmaps.find(row => row.Roadmap_ID === input.roadmapId);
  if (!roadmap) throw new ServiceError("ROADMAP_NOT_FOUND", "Roadmap was not found.", 404);
  if (!boolValue(roadmap.Is_Active)) throw new ServiceError("ROADMAP_NOT_FOUND", "Roadmap is inactive.", 404);
  const now = new Date().toISOString();
  const groupsById = new Map(sheets.groups.map(row => [row.Group_ID, row]));
  const existingIds = new Set(sheets.batchRoadmaps.map(row => row.Batch_Roadmap_ID));
  const allocatedIds: string[] = [];
  const updates: Array<{ tab: "Batch_Roadmaps"; rowNumber: number; patch: { Is_Active: string } }> = [];
  const appends: Array<{ tab: "Batch_Roadmaps"; record: BatchRoadmapRow }> = [];
  let created = 0;
  let reassigned = 0;
  let unchanged = 0;
  const allocateId = () => {
    let id = "";
    do id = nextId([...existingIds, ...allocatedIds], /^BRDM_(\d+)$/, sequence => `BRDM_${String(sequence).padStart(5, "0")}`);
    while (existingIds.has(id) || allocatedIds.includes(id));
    allocatedIds.push(id);
    return id;
  };
  for (const groupId of groupIds) {
    const group = groupsById.get(groupId);
    if (!group) throw new ServiceError("VALIDATION_ERROR", `Group was not found: ${groupId}`, 404);
    if (group.Batch_ID !== input.batchId) throw new ServiceError("GROUP_NOT_IN_BATCH", "Selected Group does not belong to the selected Batch.", 409);
    const activeForGroup = sheets.batchRoadmaps.filter(row => row.Batch_ID === input.batchId && row.Group_ID === groupId && boolValue(row.Is_Active));
    if (activeForGroup.length > 1) throw new ServiceError("ROADMAP_GROUP_MAPPING_CONFLICT", "Multiple active roadmaps are assigned to this Group.", 409);
    if (activeForGroup.length === 1 && activeForGroup[0].Roadmap_ID === input.roadmapId) {
      unchanged++;
      continue;
    }
    if (activeForGroup.length === 1) {
      updates.push({ tab: "Batch_Roadmaps", rowNumber: activeForGroup[0]._rowNumber, patch: { Is_Active: "FALSE" } });
      reassigned++;
    } else {
      created++;
    }
    appends.push({ tab: "Batch_Roadmaps", record: { Batch_Roadmap_ID: allocateId(), Batch_ID: input.batchId, Group_ID: groupId, Roadmap_ID: input.roadmapId, Is_Active: "TRUE", Assigned_At: now, Assigned_By: user.userId, Notes: text(input.notes) } });
  }
  if (updates.length || appends.length) await atomicSheetMutation({ updates, appends });
  return { batchRoadmapIds: allocatedIds, created, reassigned, unchanged, totalSelected: groupIds.length };
}

export async function getCertificateVerificationByToken(token: string): Promise<CertificateVerificationData> {
  if (!text(token)) return { status: "NOT_FOUND", roadmapSections: [], tasks: [], projects: [] };
  let sheets: CertificateSheets;
  try {
    sheets = await loadCertificateSheets();
  } catch (error) {
    if (isTemporarySheetsError(error)) return { status: "RATE_LIMITED", roadmapSections: [], tasks: [], projects: [] };
    throw error;
  }
  const matches = sheets.certificates.filter(row => row.Verification_Token === token);
  if (matches.length === 0) return { status: "NOT_FOUND", roadmapSections: [], tasks: [], projects: [] };
  if (matches.length > 1) return { status: "CONFIGURATION_ERROR", roadmapSections: [], tasks: [], projects: [] };
  const certificate = matches[0];
  const resolved = resolveCertificateVerificationRecord(certificate, sheets);
  if (!resolved) return { status: "NOT_FOUND", roadmapSections: [], tasks: [], projects: [] };
  return resolved;
}

function resolveCertificateVerificationRecord(certificate: CertificateRow, sheets: CertificateSheets): CertificateVerificationData | null {
  const certificateStatus = text(certificate.Certificate_Status).toUpperCase();
  if (certificateStatus !== "ISSUED" && certificateStatus !== "REVOKED") return null;
  const student = sheets.students.find(row => row.Academy_Student_ID === certificate.Academy_Student_ID);
  const enrollment = sheets.enrollments.find(row => row.Enrollment_ID === certificate.Enrollment_ID);
  if (!student || !enrollment) return null;
  const studentData = studentDto(student);
  const enrollmentData = enrollmentDto(enrollment);
  const enrollmentGroup = sheets.groups.find(row => row.Group_ID === enrollment.Group_ID);
  const certificateBatchId = enrollmentGroup?.Batch_ID || certificate.Batch_ID;
  const assignments = assignmentDtos(sheets).filter(assignment => assignment.batchId === certificateBatchId && assignment.isActive && assignment.showOnVerification && assignment.groupIds.includes(enrollmentData.groupId));
  const resultsByKey = new Map(sheets.assignmentResults.map(row => [`${row.Assignment_ID}:${row.Enrollment_ID}`, row]));
  const completed = assignments.flatMap(assignment => {
    const result = resultsByKey.get(`${assignment.assignmentId}:${certificate.Enrollment_ID}`);
    const status = result ? normalizeStatus(result.Submission_Status) : "NOT_SUBMITTED";
    if (status !== "SUBMITTED" && status !== "GRADED") return [];
    const grade = result && text(result.Grade) ? numberValue(result.Grade) : null;
    const order = assignment.verificationOrder ?? 999999;
    return [{ assignment, grade, status, order }];
  }).sort((left, right) => left.order - right.order || left.assignment.title.localeCompare(right.assignment.title) || left.assignment.assignmentId.localeCompare(right.assignment.assignmentId));
  const roadmapItems = itemDtos(sheets).filter(item => item.roadmapId === certificate.Roadmap_ID && item.isActive);
  const roadmap = roadmapDtos(sheets).find(row => row.roadmapId === certificate.Roadmap_ID);
  const sectionMap = new Map<string, string[]>();
  for (const item of roadmapItems) sectionMap.set(item.sectionName || "Learning Topics", [...(sectionMap.get(item.sectionName || "Learning Topics") ?? []), item.topicTitle]);
  return {
    status: "FOUND",
    certificate: {
      certificateId: certificate.Certificate_ID,
      certificateName: certificate.Certificate_Name,
      issueDate: formatCertificateDate(certificate.Issue_Date),
      status: certificateStatus as CertificateStatus,
      studentName: text(certificate.Student_Name_On_Certificate) || studentData.studentName,
      university: studentData.university,
      college: studentData.college,
      universityStudentId: studentData.studentId,
      track: enrollmentData.track,
      creditHours: enrollmentData.exactHours,
      deliveryMode: labelValue(enrollmentData.deliveryMode),
      roadmapName: roadmap?.roadmapName ?? certificate.Roadmap_ID,
      roadmapVersion: roadmap?.version ?? "",
      revokedAt: certificateStatus === "REVOKED" ? formatCertificateDate(certificate.Revoked_At) : undefined,
    },
    roadmapSections: Array.from(sectionMap.entries()).map(([sectionName, topics]) => ({ sectionName, topics })),
    tasks: completed.filter(item => item.assignment.assignmentType === "TASK").map(item => ({ title: item.assignment.title })),
    projects: completed.filter(item => item.assignment.assignmentType === "PROJECT").map(item => ({ title: item.assignment.title, result: item.grade !== null && item.assignment.maxGrade ? `${Math.round((item.grade / item.assignment.maxGrade) * 1000) / 10}%` : "Submitted" })),
  };
}

function flattenRoadmapSections(sections: CertificateVerificationData["roadmapSections"]) {
  return sections.map(section => `${section.sectionName}:\n${section.topics.join("\n")}`).join("\n\n");
}

function verificationUrlForToken(token: string) {
  if (!text(token)) return "";
  const path = `/verify/certificate/${encodeURIComponent(token)}`;
  const base = text(process.env.NEXT_PUBLIC_APP_URL) || text(process.env.PUBLIC_APP_URL) || text(process.env.APP_BASE_URL) || text(process.env.SITE_URL);
  if (!base) return path;
  try {
    return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
  } catch {
    return path;
  }
}

function countBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, number>();
  rows.forEach(row => map.set(key(row), (map.get(key(row)) ?? 0) + 1));
  return map;
}

function uniqueToken(existing: Set<string>) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const token = randomBytes(24).toString("base64url");
    if (!existing.has(token)) return token;
  }
  throw new ServiceError("TOKEN_GENERATION_FAILED", "Unable to generate a unique verification token.", 500);
}

function normalizeSpaces(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeKey(value: unknown) {
  return normalizeSpaces(value).toLowerCase();
}

function trackOptionRank(option: CertificateTrackDto) {
  return (option.isActive ? 0 : 1000) + (option.trackName ? 0 : 100) + (option.exactHours ? 0 : 10);
}

function labelValue(value: unknown) {
  return normalizeSpaces(value).replace(/_/g, " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}
