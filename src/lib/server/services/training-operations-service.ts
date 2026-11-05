import "server-only";
import { appendRecordToDataRegion, appendRecordsToDataRegions, atomicSheetMutation, getHeaders, readSheet, readSheetDataRegion, updateRecord, type SheetTab } from "@/lib/server/google/sheets";
import type { EnrollmentRow, SheetRow, StudentRow, TrackRow } from "@/lib/server/types";
import { ServiceError } from "@/lib/server/services/errors";
import { normalizeBatchDateFields, normalizeSheetDateOrOriginal, normalizeSheetTimeOrOriginal } from "@/lib/server/services/sheet-date-time";
import type { BatchLevelRow, BatchRow, BatchStaffAssignmentRow, DeliveryTrackLevelRow, DeliveryTrackRow, GroupRow, OfferingDeliveryMapRow, SessionRow, StaffRow, TrainingOperationsData } from "@/types/operations";

const REQUIRED_HEADERS = {
  Delivery_Tracks: ["Delivery_Track_ID", "Delivery_Track_Name", "Curriculum_Hours", "Is_Active", "Notes"],
  Delivery_Track_Levels: ["Delivery_Track_Level_ID", "Delivery_Track_ID", "Level_Code", "Level_Name", "Curriculum_Hours", "Sort_Order", "Is_Active", "Notes"],
  Offering_Delivery_Map: ["Offering_ID", "Delivery_Track_ID", "Is_Active", "Notes"],
  Batches: ["Batch_ID", "Batch_Name", "Delivery_Track_ID", "Intake", "Start_Date", "End_Date", "Status", "Notes"],
  Batch_Levels: ["Batch_Level_ID", "Batch_ID", "Delivery_Track_Level_ID", "Level_Code", "Level_Name", "Start_Date", "End_Date", "Curriculum_Hours", "Planned_Live_Hours", "Project_Assignment_Hours", "Session_Count", "Attendance_Rule", "Status", "Notes"],
  Groups: ["Group_ID", "Group_Name", "Batch_ID", "Level_Selection", "Level_1_Attendance_Mode", "Level_2_Attendance_Mode", "Capacity", "Status", "Notes"],
  Sessions: ["Session_ID", "Batch_Level_ID", "Session_Number", "Session_Date", "Day_Name", "Start_Time", "End_Time", "Duration_Hours", "Session_Title", "Session_Status", "Notes"],
  Staff: ["Staff_ID", "Staff_Name", "Phone", "Email", "Is_Active", "Notes"],
  Batch_Staff_Assignments: ["Batch_Staff_Assignment_ID", "Batch_ID", "Batch_Level_ID", "Staff_ID", "Role", "Pay_Basis", "Hourly_Rate", "Fixed_Total", "Is_Active", "Notes"],
} satisfies Record<string, string[]>;
const OPTIONAL_SESSION_TEAM_HEADERS = ["Lead_Batch_Staff_Assignment_ID", "Assistant_Batch_Staff_Assignment_ID", "Mentor_Batch_Staff_Assignment_ID"] as const;
const OPTIONAL_BATCH_HEADERS = ["Batch_Location"] as const;

type OperationalTab = keyof typeof REQUIRED_HEADERS;
export class TrainingOperationsConfigurationError extends Error { constructor(public sheet: string, public issue: string) { super(`Training Operations configuration error in ${sheet}: ${issue}`); } }

export type DeliverySetupMutation =
  | { action: "create-track"; name: string; curriculumHours: number; isActive: boolean; notes: string }
  | { action: "update-track"; id: string; name: string; curriculumHours: number; isActive: boolean; notes: string }
  | { action: "create-level"; deliveryTrackId: string; levelCode: "LEVEL_1" | "LEVEL_2"; levelName: string; curriculumHours: number; isActive: boolean; notes: string }
  | { action: "update-level"; id: string; levelName: string; curriculumHours: number; isActive: boolean; notes: string }
  | { action: "create-mapping"; offeringId: string; deliveryTrackId: string; isActive: boolean; notes: string }
  | { action: "update-mapping"; offeringId: string; deliveryTrackId: string; isActive: boolean; notes: string };

export type BatchSetupMutation =
  | { action: "create-batch"; name: string; deliveryTrackId: string; intake: string; startDate: string; endDate: string; status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED"; location: "Alexandria" | "Cairo"; notes: string }
  | { action: "update-batch"; id: string; name: string; startDate: string; endDate: string; status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED"; location: "Alexandria" | "Cairo"; notes: string }
  | { action: "update-batch-level"; id: string; levelName: string; startDate: string; endDate: string; curriculumHours: number; plannedLiveHours: number; projectAssignmentHours: number; sessionCount: number; attendanceRule: "ONLINE_ONLY" | "OFFLINE_ONLY" | "ONLINE_OR_OFFLINE"; status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED"; notes: string };

export type GroupSetupMutation =
  | { action: "create-group"; name: string; batchId: string; levelSelection: "BOTH_LEVELS" | "LEVEL_1" | "LEVEL_2"; level1AttendanceMode: "ONLINE" | "OFFLINE" | ""; level2AttendanceMode: "ONLINE" | "OFFLINE" | ""; capacity: number | null; status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CLOSED" | "CANCELLED"; notes: string }
  | { action: "update-group"; id: string; name: string; batchId: string; levelSelection: "BOTH_LEVELS" | "LEVEL_1" | "LEVEL_2"; level1AttendanceMode: "ONLINE" | "OFFLINE" | ""; level2AttendanceMode: "ONLINE" | "OFFLINE" | ""; capacity: number | null; status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CLOSED" | "CANCELLED"; notes: string };

export type StudentPlacementMutation = { enrollmentId: string; levelSelection: "BOTH_LEVELS" | "LEVEL_1" | "LEVEL_2"; groupId: string };

export type SessionSetupMutation =
  | { action: "create-session"; deliveryTrackId: string; batchId: string; batchLevelId: string; sessionNumber: number; sessionDate: string; startTime: string; endTime: string; title: string; status: "PLANNED" | "COMPLETED" | "CANCELLED" | "RESCHEDULED"; notes: string; leadAssignmentId: string; assistantAssignmentId: string; mentorAssignmentId: string }
  | { action: "update-session"; id: string; deliveryTrackId: string; batchId: string; batchLevelId: string; sessionNumber: number; sessionDate: string; startTime: string; endTime: string; title: string; status: "PLANNED" | "COMPLETED" | "CANCELLED" | "RESCHEDULED"; notes: string; leadAssignmentId: string; assistantAssignmentId: string; mentorAssignmentId: string };

export type StaffSetupMutation =
  | { action: "create-staff"; name: string; phone: string; email: string; isActive: boolean; notes: string }
  | { action: "update-staff"; id: string; name: string; phone: string; email: string; isActive: boolean; notes: string }
  | { action: "create-assignment"; batchId: string; batchLevelId: string; staffId: string; role: "INSTRUCTOR" | "MENTOR" | "ASSISTANT"; payBasis: "HOURLY" | "FIXED_TOTAL"; hourlyRate: number | null; fixedTotal: number | null; isActive: boolean; notes: string }
  | { action: "update-assignment"; id: string; batchId: string; batchLevelId: string; staffId: string; role: "INSTRUCTOR" | "MENTOR" | "ASSISTANT"; payBasis: "HOURLY" | "FIXED_TOTAL"; hourlyRate: number | null; fixedTotal: number | null; isActive: boolean; notes: string };

async function readRequired<T extends Record<string, string>>(tab: OperationalTab) {
  try {
    const headers = await getHeaders(tab as SheetTab); const expected = REQUIRED_HEADERS[tab];
    const optionalTrailing = tab === "Sessions" ? OPTIONAL_SESSION_TEAM_HEADERS : tab === "Batches" ? OPTIONAL_BATCH_HEADERS : undefined;
    const headerIssue = describeHeaderIssue(headers, expected, optionalTrailing);
    if (headerIssue) throw new TrainingOperationsConfigurationError(tab, headerIssue);
    return await readSheetDataRegion<T>(tab as SheetTab);
  } catch (error) {
    if (error instanceof TrainingOperationsConfigurationError) throw error;
    throw new TrainingOperationsConfigurationError(tab, "sheet is missing or inaccessible");
  }
}

async function readRequiredDataRegion<T extends Record<string, string>>(tab: "Delivery_Tracks" | "Delivery_Track_Levels" | "Offering_Delivery_Map") {
  try {
    const headers = await getHeaders(tab); const expected = REQUIRED_HEADERS[tab];
    const headerIssue = describeHeaderIssue(headers, expected);
    if (headerIssue) throw new TrainingOperationsConfigurationError(tab, headerIssue);
    return await readSheetDataRegion<T>(tab);
  } catch (error) {
    if (error instanceof TrainingOperationsConfigurationError) throw error;
    throw new TrainingOperationsConfigurationError(tab, "sheet is missing or inaccessible");
  }
}

async function readOptionalTeamRows<T extends Record<string, string>>(tab: "Staff" | "Batch_Staff_Assignments") {
  try {
    return await readRequired<T>(tab);
  } catch (error) {
    if (error instanceof TrainingOperationsConfigurationError) {
      console.warn("Optional Session Team data unavailable", { sheet: error.sheet, issue: error.issue });
      return [];
    }
    throw error;
  }
}

const numberValue = (value: string) => Number(String(value ?? "").replace(/,/g, "")) || 0;
const activeValue = (value: string) => ["true", "yes", "1", "active"].includes(value.trim().toLowerCase());
const normalizedName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const normalizedPhone = (value: string) => value.trim().replace(/\s+/g, " ");
const sheetBoolean = (value: boolean) => value ? "TRUE" : "FALSE";
const keyPart = (value: string, fallback: string) => value.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9_-]/g, "").toLowerCase() || fallback;
function describeHeaderIssue(headers: string[], expected: readonly string[], optionalTrailing?: readonly string[]) {
  for (let index = 0; index < expected.length; index++) {
    const actual = headers[index] ?? "";
    if (actual !== expected[index]) return actual ? `expected header "${expected[index]}" at column ${index + 1}, found "${actual}"` : `missing header "${expected[index]}" at column ${index + 1}`;
  }
  if (optionalTrailing) return "";
  return headers.length === expected.length ? "" : `unexpected header "${headers[expected.length]}" at column ${expected.length + 1}`;
}
const textValue = (value: unknown) => String(value ?? "").trim();
function batchLocationValue(row: BatchRow) {
  const value = Object.entries(row).find(([key]) => key.trim() === "Batch_Location")?.[1] ?? "";
  const trimmed = String(value).trim();
  return trimmed === "Alexandria" || trimmed === "Cairo" ? trimmed : "Unassigned Location";
}
function uniqueClientKey(base: string, counts: Map<string, number>) {
  const safeBase = base || "missing-key";
  const count = counts.get(safeBase) ?? 0;
  counts.set(safeBase, count + 1);
  return count === 0 ? safeBase : `${safeBase}__${count + 1}`;
}

export async function getTrainingOperations(canViewCompensation: boolean): Promise<TrainingOperationsData> {
  const [deliveryTracks, deliveryTrackLevels, offeringMappings, offerings, batches, batchLevels, groups, sessions, staff, staffAssignments, enrollments, students, systemConfig, batchHeaders] = await Promise.all([
    readRequiredDataRegion<DeliveryTrackRow>("Delivery_Tracks"), readRequiredDataRegion<DeliveryTrackLevelRow>("Delivery_Track_Levels"), readRequiredDataRegion<OfferingDeliveryMapRow>("Offering_Delivery_Map"), readSheet<TrackRow>("Tracks"), readRequired<BatchRow>("Batches"), readRequired<BatchLevelRow>("Batch_Levels"), readRequired<GroupRow>("Groups"), readRequired<SessionRow>("Sessions"), readOptionalTeamRows<StaffRow>("Staff"), readOptionalTeamRows<BatchStaffAssignmentRow>("Batch_Staff_Assignments"), readSheet<EnrollmentRow>("Enrollments"), readSheet<StudentRow>("Students"), readSheet<{ Config_Key: string; Config_Value: string }>("System_Config"),
    getHeaders("Batches"),
  ]);
  const trackNames = new Map(deliveryTracks.map(row => [textValue(row.Delivery_Track_ID), textValue(row.Delivery_Track_Name)]));
  const offeringsById = new Map(offerings.map(row => [textValue(row.Offering_ID), row]));
  const normalizedBatches = batches.map(row => normalizeBatchDateFields(row) as SheetRow<BatchRow>);
  const normalizedBatchLevels = batchLevels.map(row => normalizeBatchDateFields(row) as SheetRow<BatchLevelRow>);
  const normalizedSessions = sessions.map(row => ({ ...row, Session_Date: normalizeSheetDateOrOriginal(row.Session_Date), Start_Time: normalizeSheetTimeOrOriginal(row.Start_Time), End_Time: normalizeSheetTimeOrOriginal(row.End_Time) }) as SheetRow<SessionRow>);
  const batchNames = new Map(normalizedBatches.map(row => [textValue(row.Batch_ID), textValue(row.Batch_Name)]));
  const batchesById = new Map(normalizedBatches.map(row => [textValue(row.Batch_ID), row]));
  const levelNames = new Map(normalizedBatchLevels.map(row => [textValue(row.Batch_Level_ID), textValue(row.Level_Name || row.Level_Code)]));
  const batchLevelsById = new Map(normalizedBatchLevels.map(row => [textValue(row.Batch_Level_ID), row]));
  const staffById = new Map(staff.map(row => [textValue(row.Staff_ID), row]));
  const staffNames = new Map(staff.map(row => [textValue(row.Staff_ID), textValue(row.Staff_Name)]));
  const staffAssignmentsById = new Map(staffAssignments.map(row => [textValue(row.Batch_Staff_Assignment_ID), row]));
  const resolveSessionTeam = (assignmentId: unknown) => {
    const id = textValue(assignmentId);
    const assignment = id ? staffAssignmentsById.get(id) : undefined;
    if (!id) return undefined;
    if (!assignment) return { assignmentId: id, staffName: "Unknown Staff", role: "" };
    return { assignmentId: id, staffName: staffById.get(textValue(assignment.Staff_ID))?.Staff_Name ?? "Unknown Staff", role: textValue(assignment.Role) };
  };
  const levelCounts = normalizedBatchLevels.reduce<Record<string, number>>((counts, row) => { const batchId = textValue(row.Batch_ID); counts[batchId] = (counts[batchId] ?? 0) + 1; return counts; }, {});
  const assignedCounts = enrollments.reduce<Record<string, number>>((counts, row) => { const groupId = textValue(row.Group_ID); if (groupId) counts[groupId] = (counts[groupId] ?? 0) + 1; return counts; }, {});
  const studentsById = new Map(students.map(row => [textValue(row.Academy_Student_ID), row]));
  const deliveryTrackKeyCounts = new Map<string, number>();
  const deliveryTrackLevelKeyCounts = new Map<string, number>();
  const offeringKeyCounts = new Map<string, number>();
  const offeringMappingKeyCounts = new Map<string, number>();

  return {
    summary: { deliveryTracks: deliveryTracks.length, offeringMappings: offeringMappings.length, batches: batches.length, groups: groups.length, scheduledSessions: sessions.length, activeStaff: staff.filter(row => activeValue(row.Is_Active)).length },
    deliveryTracks: deliveryTracks.map(row => ({ clientKey: uniqueClientKey(textValue(row.Delivery_Track_ID) || `missing-delivery-track-${keyPart(row.Delivery_Track_Name, "unnamed")}`, deliveryTrackKeyCounts), id: textValue(row.Delivery_Track_ID), name: textValue(row.Delivery_Track_Name), curriculumHours: numberValue(row.Curriculum_Hours), isActive: activeValue(row.Is_Active), notes: row.Notes })),
    deliveryTrackLevels: deliveryTrackLevels.map(row => ({ clientKey: uniqueClientKey(textValue(row.Delivery_Track_Level_ID) || `missing-delivery-track-level-${keyPart(row.Delivery_Track_ID, "track")}-${keyPart(row.Level_Code, "level")}`, deliveryTrackLevelKeyCounts), id: textValue(row.Delivery_Track_Level_ID), deliveryTrackId: textValue(row.Delivery_Track_ID), deliveryTrackName: trackNames.get(textValue(row.Delivery_Track_ID)) ?? textValue(row.Delivery_Track_ID), levelCode: normalizedCode(row.Level_Code), levelName: textValue(row.Level_Name), curriculumHours: numberValue(row.Curriculum_Hours), sortOrder: numberValue(row.Sort_Order), isActive: activeValue(row.Is_Active), notes: row.Notes })),
    offerings: offerings.map(row => ({ clientKey: uniqueClientKey(`${textValue(row.Offering_ID) || "missing-offering"}-${keyPart(row.University, "scope")}-${keyPart(row.Track, "track")}-${keyPart(row.Package_Label, "package")}-${keyPart(row.Exact_Hours, "hours")}`, offeringKeyCounts), offeringId: textValue(row.Offering_ID), soldTrack: textValue(row.Track), programScope: textValue(row.University), packageLabel: textValue(row.Package_Label), exactHours: numberValue(row.Exact_Hours), isActive: activeValue(row.Is_Active) })),
    offeringMappings: offeringMappings.map(row => { const offering = offeringsById.get(row.Offering_ID); return { clientKey: uniqueClientKey(`${row.Offering_ID.trim() || "missing-offering"}-${row.Delivery_Track_ID.trim() || "missing-delivery-track"}`, offeringMappingKeyCounts), offeringId: row.Offering_ID, soldTrack: offering?.Track ?? "Unavailable offering", programScope: offering?.University ?? "â€”", packageLabel: offering?.Package_Label ?? "â€”", exactHours: numberValue(offering?.Exact_Hours ?? ""), deliveryTrackId: row.Delivery_Track_ID, deliveryTrackName: trackNames.get(row.Delivery_Track_ID) ?? row.Delivery_Track_ID, isActive: activeValue(row.Is_Active), notes: row.Notes }; }),
    batches: normalizedBatches.map(row => ({ id: textValue(row.Batch_ID), name: textValue(row.Batch_Name), deliveryTrackId: textValue(row.Delivery_Track_ID), deliveryTrackName: trackNames.get(textValue(row.Delivery_Track_ID)) ?? "Unknown Delivery Track", intake: row.Intake, startDate: row.Start_Date, endDate: row.End_Date, status: normalizedCode(row.Status), notes: row.Notes, location: batchLocationValue(row), levelCount: levelCounts[textValue(row.Batch_ID)] ?? 0 })),
    batchLevels: normalizedBatchLevels.map(row => ({ id: textValue(row.Batch_Level_ID), batchId: textValue(row.Batch_ID), batchName: batchNames.get(textValue(row.Batch_ID)) ?? "Unknown Batch", deliveryTrackLevelId: textValue(row.Delivery_Track_Level_ID), levelCode: normalizedCode(row.Level_Code), levelName: row.Level_Name || row.Level_Code, startDate: row.Start_Date, endDate: row.End_Date, curriculumHours: numberValue(row.Curriculum_Hours), plannedLiveHours: numberValue(row.Planned_Live_Hours), projectAssignmentHours: numberValue(row.Project_Assignment_Hours), sessionCount: numberValue(row.Session_Count), attendanceRule: normalizedCode(row.Attendance_Rule), status: normalizedCode(row.Status), notes: row.Notes })),
    groups: groups.map(row => { const batch = batchesById.get(textValue(row.Batch_ID)); return { id: textValue(row.Group_ID), name: row.Group_Name, batchId: textValue(row.Batch_ID), batchName: batch?.Batch_Name ?? "Unknown Batch", deliveryTrackName: batch ? trackNames.get(textValue(batch.Delivery_Track_ID)) ?? "Unknown Delivery Track" : "Unknown Delivery Track", levelSelection: normalizedCode(row.Level_Selection), level1AttendanceMode: normalizedCode(row.Level_1_Attendance_Mode), level2AttendanceMode: normalizedCode(row.Level_2_Attendance_Mode), capacity: numberValue(row.Capacity), assignedStudentsCount: assignedCounts[textValue(row.Group_ID)] ?? 0, status: normalizedCode(row.Status), notes: row.Notes }; }),
    placementQueue: enrollments.filter(row => textValue(row.Enrollment_ID)).map(row => buildPlacementQueueEntry(row, studentsById.get(textValue(row.Academy_Student_ID)), offeringMappings, deliveryTracks, normalizedBatches, normalizedBatchLevels, groups)),
    sessions: normalizedSessions.map(row => { const level = batchLevelsById.get(row.Batch_Level_ID); const batch = level ? batchesById.get(level.Batch_ID) : undefined; const leadAssignmentId = textValue(row.Lead_Batch_Staff_Assignment_ID); const assistantAssignmentId = textValue(row.Assistant_Batch_Staff_Assignment_ID); const mentorAssignmentId = textValue(row.Mentor_Batch_Staff_Assignment_ID); return { id: row.Session_ID, batchLevelId: row.Batch_Level_ID, batchId: level?.Batch_ID ?? "", batchName: batch?.Batch_Name ?? "Unknown Batch", deliveryTrackId: batch?.Delivery_Track_ID ?? "", deliveryTrackName: batch ? trackNames.get(batch.Delivery_Track_ID) ?? "Unknown Delivery Track" : "Unknown Delivery Track", levelCode: level?.Level_Code ?? "", levelName: level?.Level_Name || level?.Level_Code || "Unknown Batch Level", attendanceRule: level?.Attendance_Rule ?? "", sessionDate: row.Session_Date, dayName: row.Day_Name, sessionNumber: numberValue(row.Session_Number), startTime: row.Start_Time, endTime: row.End_Time, durationHours: numberValue(row.Duration_Hours), title: row.Session_Title, status: row.Session_Status, notes: row.Notes, leadAssignmentId, assistantAssignmentId, mentorAssignmentId, leadBatchStaffAssignmentId: leadAssignmentId, assistantBatchStaffAssignmentId: assistantAssignmentId, mentorBatchStaffAssignmentId: mentorAssignmentId, leadTrainer: resolveSessionTeam(leadAssignmentId), assistant: resolveSessionTeam(assistantAssignmentId), mentor: resolveSessionTeam(mentorAssignmentId) }; }).sort((left, right) => left.sessionDate.localeCompare(right.sessionDate) || left.startTime.localeCompare(right.startTime) || left.sessionNumber - right.sessionNumber || left.id.localeCompare(right.id)),
    staff: staff.map(row => ({ id: row.Staff_ID, name: row.Staff_Name, phone: row.Phone, email: row.Email, isActive: activeValue(row.Is_Active), notes: row.Notes })),
    staffAssignments: staffAssignments.map(row => { const batch = batchesById.get(row.Batch_ID); return { id: row.Batch_Staff_Assignment_ID, staffId: row.Staff_ID, staffName: staffNames.get(row.Staff_ID) ?? "Unknown Staff", batchId: row.Batch_ID, batchName: batch?.Batch_Name ?? "Unknown Batch", batchLevelId: row.Batch_Level_ID, levelName: row.Batch_Level_ID ? levelNames.get(row.Batch_Level_ID) ?? "Unknown Level" : "Full Batch", deliveryTrackId: batch?.Delivery_Track_ID ?? "", deliveryTrackName: batch ? trackNames.get(batch.Delivery_Track_ID) ?? "Unknown Delivery Track" : "Unknown Delivery Track", role: row.Role, payBasis: row.Pay_Basis, isActive: activeValue(row.Is_Active), notes: row.Notes, ...(canViewCompensation ? { hourlyRate: numberValue(row.Hourly_Rate), fixedTotal: numberValue(row.Fixed_Total) } : {}) }; }),
    canViewCompensation,
    canManageDeliverySetup: canViewCompensation,
    canManageBatchSetup: canViewCompensation,
    canManageGroups: true,
    canManagePlacement: true,
    canManageSessions: true,
    canManageStaff: canViewCompensation,
    batchLocationConfigured: batchHeaders.includes("Batch_Location"),
    currentIntake: systemConfig.find(row => row.Config_Key.trim() === "CURRENT_INTAKE")?.Config_Value.trim() ?? "",
  };
}

export async function mutateDeliverySetup(input: DeliverySetupMutation) {
  const [tracks, levels, mappings, offerings] = await Promise.all([
    readRequiredDataRegion<DeliveryTrackRow>("Delivery_Tracks"),
    readRequiredDataRegion<DeliveryTrackLevelRow>("Delivery_Track_Levels"),
    readRequiredDataRegion<OfferingDeliveryMapRow>("Offering_Delivery_Map"),
    readSheet<TrackRow>("Tracks"),
  ]);

  if (input.action === "create-track" || input.action === "update-track") {
    const name = input.name.trim().replace(/\s+/g, " ");
    const current = input.action === "update-track" ? tracks.find(row => row.Delivery_Track_ID === input.id) : undefined;
    if (input.action === "update-track" && !current) throw new ServiceError("DELIVERY_TRACK_NOT_FOUND", "Delivery Track was not found.", 404);
    if (input.isActive && tracks.some(row => row.Delivery_Track_ID !== current?.Delivery_Track_ID && activeValue(row.Is_Active) && normalizedName(row.Delivery_Track_Name) === normalizedName(name))) {
      throw new ServiceError("DUPLICATE_DELIVERY_TRACK", "An active Delivery Track with this name already exists.", 409);
    }
    const record = { Delivery_Track_Name: name, Curriculum_Hours: input.curriculumHours, Is_Active: sheetBoolean(input.isActive), Notes: input.notes.trim() };
    const deliveryTrackId = current?.Delivery_Track_ID ?? nextDeliveryTrackId(tracks.map(row => row.Delivery_Track_ID));
    if (current) await atomicSheetMutation({ updates: [{ tab: "Delivery_Tracks", rowNumber: current._rowNumber, patch: record }] });
    else await appendRecordToDataRegion("Delivery_Tracks", { Delivery_Track_ID: deliveryTrackId, ...record });
    const saved = await readPersistedDeliveryTrack(deliveryTrackId);
    return { message: current ? "Delivery Track updated." : "Delivery Track created.", record: saved };
  }

  if (input.action === "create-level" || input.action === "update-level") {
    const current = input.action === "update-level" ? levels.find(row => row.Delivery_Track_Level_ID === input.id) : undefined;
    if (input.action === "update-level" && !current) throw new ServiceError("DELIVERY_TRACK_LEVEL_NOT_FOUND", "Delivery Track Level was not found.", 404);
    const deliveryTrackId = current?.Delivery_Track_ID ?? (input.action === "create-level" ? input.deliveryTrackId : "");
    const parent = tracks.find(row => row.Delivery_Track_ID === deliveryTrackId);
    if (!parent) throw new ServiceError("DELIVERY_TRACK_NOT_FOUND", "Select a valid existing Delivery Track.", 404);
    const levelCode = current?.Level_Code ?? (input.action === "create-level" ? input.levelCode : "");
    if ((levelCode !== "LEVEL_1" && levelCode !== "LEVEL_2")) throw new ServiceError("INVALID_LEVEL_CODE", "Level Code must be LEVEL_1 or LEVEL_2.");
    if (input.isActive && levels.some(row => row.Delivery_Track_Level_ID !== current?.Delivery_Track_Level_ID && row.Delivery_Track_ID === deliveryTrackId && row.Level_Code === levelCode && activeValue(row.Is_Active))) {
      throw new ServiceError("DUPLICATE_ACTIVE_LEVEL", `This Delivery Track already has an active ${levelCode.replace("_", " ")}.`, 409);
    }
    const record = { Level_Name: input.levelName.trim().replace(/\s+/g, " "), Curriculum_Hours: input.curriculumHours, Is_Active: sheetBoolean(input.isActive), Notes: input.notes.trim() };
    const levelId = current?.Delivery_Track_Level_ID ?? nextLevelId(deliveryTrackId, levelCode, levels.map(row => row.Delivery_Track_Level_ID));
    if (current) await atomicSheetMutation({ updates: [{ tab: "Delivery_Track_Levels", rowNumber: current._rowNumber, patch: record }] });
    else await appendRecordToDataRegion("Delivery_Track_Levels", { Delivery_Track_Level_ID: levelId, Delivery_Track_ID: deliveryTrackId, Level_Code: levelCode, Sort_Order: levelCode === "LEVEL_1" ? 1 : 2, ...record });
    const saved = await readPersistedDeliveryTrackLevel(levelId);
    return { message: current ? "Delivery Track Level updated." : "Delivery Track Level created.", record: saved };
  }

  const offering = offerings.find(row => row.Offering_ID === input.offeringId);
  if (!offering) throw new ServiceError("OFFERING_NOT_FOUND", "Select a valid existing Offering.", 404);
  const deliveryTrack = tracks.find(row => row.Delivery_Track_ID === input.deliveryTrackId);
  if (!deliveryTrack || !activeValue(deliveryTrack.Is_Active)) throw new ServiceError("DELIVERY_TRACK_INACTIVE", "Mappings require an active Delivery Track.");
  const activeMappings = mappings.filter(row => row.Offering_ID === input.offeringId && activeValue(row.Is_Active));
  if (input.action === "create-mapping") {
    if (input.isActive && activeMappings.length) throw new ServiceError("ACTIVE_MAPPING_EXISTS", "This Offering already has an active mapping. Use Edit Mapping instead.", 409);
    const record = { Offering_ID: input.offeringId, Delivery_Track_ID: input.deliveryTrackId, Is_Active: sheetBoolean(input.isActive), Notes: input.notes.trim() };
    await appendRecordToDataRegion("Offering_Delivery_Map", record);
    const saved = await readPersistedOfferingMapping(record);
    return { message: "Offering mapping created.", record: saved };
  }
  if (activeMappings.length !== 1) throw new ServiceError("ACTIVE_MAPPING_NOT_FOUND", "The active Offering mapping could not be identified. Refresh and try again.", 409);
  const record = { Offering_ID: input.offeringId, Delivery_Track_ID: input.deliveryTrackId, Is_Active: sheetBoolean(input.isActive), Notes: input.notes.trim() };
  await atomicSheetMutation({ updates: [{ tab: "Offering_Delivery_Map", rowNumber: activeMappings[0]._rowNumber, patch: { Delivery_Track_ID: record.Delivery_Track_ID, Is_Active: record.Is_Active, Notes: record.Notes } }] });
  const saved = await readPersistedOfferingMapping(record);
  return { message: "Offering mapping updated.", record: saved };
}

async function readPersistedDeliveryTrack(deliveryTrackId: string) {
  const rows = await readRequiredDataRegion<DeliveryTrackRow>("Delivery_Tracks");
  const saved = rows.find(row => row.Delivery_Track_ID === deliveryTrackId);
  if (!saved) throw new ServiceError("DELIVERY_TRACK_WRITE_NOT_CONFIRMED", "Delivery Track could not be confirmed in Google Sheets after saving.", 502);
  return { id: saved.Delivery_Track_ID, name: saved.Delivery_Track_Name, curriculumHours: numberValue(saved.Curriculum_Hours), isActive: activeValue(saved.Is_Active), notes: saved.Notes };
}

async function readPersistedDeliveryTrackLevel(levelId: string) {
  const rows = await readRequiredDataRegion<DeliveryTrackLevelRow>("Delivery_Track_Levels");
  const saved = rows.find(row => row.Delivery_Track_Level_ID === levelId);
  if (!saved) throw new ServiceError("DELIVERY_TRACK_LEVEL_WRITE_NOT_CONFIRMED", "Delivery Track Level could not be confirmed in Google Sheets after saving.", 502);
  return { id: saved.Delivery_Track_Level_ID, deliveryTrackId: saved.Delivery_Track_ID, levelCode: saved.Level_Code, levelName: saved.Level_Name, curriculumHours: numberValue(saved.Curriculum_Hours), sortOrder: numberValue(saved.Sort_Order), isActive: activeValue(saved.Is_Active), notes: saved.Notes };
}

async function readPersistedOfferingMapping(record: OfferingDeliveryMapRow) {
  const rows = await readRequiredDataRegion<OfferingDeliveryMapRow>("Offering_Delivery_Map");
  const saved = rows.find(row => row.Offering_ID === record.Offering_ID && row.Delivery_Track_ID === record.Delivery_Track_ID && activeValue(row.Is_Active) === activeValue(record.Is_Active) && row.Notes === record.Notes);
  if (!saved) throw new ServiceError("OFFERING_MAPPING_WRITE_NOT_CONFIRMED", "Offering mapping could not be confirmed in Google Sheets after saving.", 502);
  return { offeringId: saved.Offering_ID, deliveryTrackId: saved.Delivery_Track_ID, isActive: activeValue(saved.Is_Active), notes: saved.Notes };
}

export async function mutateBatchSetup(input: BatchSetupMutation) {
  const batchHeaders = await getHeaders("Batches");
  if ((input.action === "create-batch" || input.action === "update-batch") && !batchHeaders.includes("Batch_Location")) throw new ServiceError("BATCH_LOCATION_HEADER_MISSING", "Batches is missing required header for this action: Batch_Location", 503);
  const [batches, batchLevels, deliveryTracks, deliveryTrackLevels] = await Promise.all([
    readRequired<BatchRow>("Batches"),
    readRequired<BatchLevelRow>("Batch_Levels"),
    readRequired<DeliveryTrackRow>("Delivery_Tracks"),
    readRequired<DeliveryTrackLevelRow>("Delivery_Track_Levels"),
  ]);

  if (input.startDate > input.endDate) throw new ServiceError("INVALID_DATE_RANGE", "Start Date must be before or equal to End Date.");

  if (input.action === "create-batch") {
    const name = input.name.trim().replace(/\s+/g, " ");
    const intake = input.intake.trim().replace(/\s+/g, " ");
    const deliveryTrack = deliveryTracks.find(row => row.Delivery_Track_ID === input.deliveryTrackId);
    if (!deliveryTrack || !activeValue(deliveryTrack.Is_Active)) throw new ServiceError("DELIVERY_TRACK_INACTIVE", "Select an active Delivery Track.");
    const sourceLevels = deliveryTrackLevels
      .filter(row => row.Delivery_Track_ID === input.deliveryTrackId && activeValue(row.Is_Active))
      .sort((left, right) => numberValue(left.Sort_Order) - numberValue(right.Sort_Order));
    if (!sourceLevels.length) throw new ServiceError("ACTIVE_LEVELS_REQUIRED", "The selected Delivery Track has no active levels. Configure its levels before creating a Batch.", 409);
    if (batches.some(row => row.Delivery_Track_ID === input.deliveryTrackId && normalizedName(row.Intake) === normalizedName(intake) && normalizedName(row.Batch_Name) === normalizedName(name) && ["PLANNED", "ACTIVE"].includes(row.Status.trim().toUpperCase()))) {
      throw new ServiceError("DUPLICATE_BATCH", "A planned or active Batch with this name already exists for the selected Delivery Track and Intake.", 409);
    }
    const batchId = nextBatchId(batches.map(row => row.Batch_ID));
    const usedLevelIds = new Set(batchLevels.map(row => row.Batch_Level_ID.trim().toUpperCase()));
    const appends: Array<{ tab: "Batches" | "Batch_Levels"; record: Record<string, string | number> }> = [{
      tab: "Batches",
      record: { Batch_ID: batchId, Batch_Name: name, Delivery_Track_ID: input.deliveryTrackId, Intake: intake, Start_Date: input.startDate, End_Date: input.endDate, Status: input.status, Notes: input.notes.trim(), Batch_Location: input.location },
    }];
    for (const source of sourceLevels) {
      const batchLevelId = nextBatchLevelId(batchId, source.Level_Code, usedLevelIds);
      usedLevelIds.add(batchLevelId);
      appends.push({ tab: "Batch_Levels", record: { Batch_Level_ID: batchLevelId, Batch_ID: batchId, Delivery_Track_Level_ID: source.Delivery_Track_Level_ID, Level_Code: source.Level_Code, Level_Name: source.Level_Name.trim(), Start_Date: input.startDate, End_Date: input.endDate, Curriculum_Hours: numberValue(source.Curriculum_Hours), Planned_Live_Hours: 0, Project_Assignment_Hours: 0, Session_Count: 0, Attendance_Rule: "ONLINE_OR_OFFLINE", Status: "PLANNED", Notes: "" } });
    }
    await appendRecordsToDataRegions(appends);
    const [savedBatches, savedBatchLevels] = await Promise.all([readRequired<BatchRow>("Batches"), readRequired<BatchLevelRow>("Batch_Levels")]);
    if (!savedBatches.some(row => row.Batch_ID === batchId) || sourceLevels.some(source => !savedBatchLevels.some(row => row.Batch_ID === batchId && row.Delivery_Track_Level_ID === source.Delivery_Track_Level_ID))) {
      throw new ServiceError("BATCH_WRITE_NOT_CONFIRMED", "Batch could not be confirmed in Google Sheets after saving.", 502);
    }
    return { message: `Batch created with ${sourceLevels.length} level${sourceLevels.length === 1 ? "" : "s"}.`, batchId };
  }

  if (input.action === "update-batch") {
    const current = batches.find(row => row.Batch_ID === input.id);
    if (!current) throw new ServiceError("BATCH_NOT_FOUND", "Batch was not found.", 404);
    const name = input.name.trim().replace(/\s+/g, " ");
    if (["PLANNED", "ACTIVE"].includes(input.status) && batches.some(row => row.Batch_ID !== current.Batch_ID && row.Delivery_Track_ID === current.Delivery_Track_ID && normalizedName(row.Intake) === normalizedName(current.Intake) && normalizedName(row.Batch_Name) === normalizedName(name) && ["PLANNED", "ACTIVE"].includes(row.Status.trim().toUpperCase()))) {
      throw new ServiceError("DUPLICATE_BATCH", "A planned or active Batch with this name already exists for the same Delivery Track and Intake.", 409);
    }
    await updateRecord("Batches", current._rowNumber, { Batch_Name: name, Start_Date: input.startDate, End_Date: input.endDate, Status: input.status, Notes: input.notes.trim(), Batch_Location: input.location });
    return { message: "Batch updated." };
  }

  const current = batchLevels.find(row => row.Batch_Level_ID === input.id);
  if (!current) throw new ServiceError("BATCH_LEVEL_NOT_FOUND", "Batch Level was not found.", 404);
  await updateRecord("Batch_Levels", current._rowNumber, {
    Level_Name: input.levelName.trim().replace(/\s+/g, " "),
    Start_Date: input.startDate,
    End_Date: input.endDate,
    Curriculum_Hours: input.curriculumHours,
    Planned_Live_Hours: input.plannedLiveHours,
    Project_Assignment_Hours: input.projectAssignmentHours,
    Session_Count: input.sessionCount,
    Attendance_Rule: input.attendanceRule,
    Status: input.status,
    Notes: input.notes.trim(),
  });
  return { message: "Batch Level updated." };
}

export async function mutateGroupSetup(input: GroupSetupMutation) {
  const [groups, batches, batchLevels, enrollments] = await Promise.all([
    readRequired<GroupRow>("Groups"),
    readRequired<BatchRow>("Batches"),
    readRequired<BatchLevelRow>("Batch_Levels"),
    readSheet<EnrollmentRow>("Enrollments"),
  ]);
  const current = input.action === "update-group" ? groups.find(row => row.Group_ID === input.id) : undefined;
  if (input.action === "update-group" && !current) throw new ServiceError("GROUP_NOT_FOUND", "Group was not found.", 404);
  const name = input.name.trim().replace(/\s+/g, " ");
  const batch = batches.find(row => row.Batch_ID === input.batchId);
  const assignedStudentsCount = current ? enrollments.filter(row => row.Group_ID === current.Group_ID).length : 0;
  const configurationChanged = !current || current.Batch_ID !== input.batchId || current.Level_Selection !== input.levelSelection || current.Level_1_Attendance_Mode !== input.level1AttendanceMode || current.Level_2_Attendance_Mode !== input.level2AttendanceMode;
  if (current && assignedStudentsCount > 0 && configurationChanged) throw new ServiceError("GROUP_CONFIGURATION_LOCKED", "Batch, Level Selection, and attendance modes cannot change while students are assigned to this Group.", 409);
  if (configurationChanged) {
    if (!batch) throw new ServiceError("BATCH_NOT_FOUND", "Select a valid existing Batch.", 404);
    validateGroupConfiguration(input, batch, batchLevels);
  }
  if (["PLANNED", "ACTIVE"].includes(input.status) && groups.some(row => row.Group_ID !== current?.Group_ID && row.Batch_ID === input.batchId && normalizedName(row.Group_Name) === normalizedName(name) && ["PLANNED", "ACTIVE"].includes(row.Status.trim().toUpperCase()))) {
    throw new ServiceError("DUPLICATE_GROUP", "A planned or active Group with this name already exists in the selected Batch.", 409);
  }
  const record = { Group_Name: name, Batch_ID: input.batchId, Level_Selection: input.levelSelection, Level_1_Attendance_Mode: input.level1AttendanceMode, Level_2_Attendance_Mode: input.level2AttendanceMode, Capacity: input.capacity ?? "", Status: input.status, Notes: input.notes.trim() };
  if (current) {
    await updateRecord("Groups", current._rowNumber, record);
    return { message: "Group updated." };
  }
  const groupId = nextGroupId(groups.map(row => row.Group_ID));
  await appendRecordToDataRegion("Groups", { Group_ID: groupId, ...record });
  if (!(await readRequired<GroupRow>("Groups")).some(row => row.Group_ID === groupId)) throw new ServiceError("GROUP_WRITE_NOT_CONFIRMED", "Group could not be confirmed in Google Sheets after saving.", 502);
  return { message: "Group created.", groupId };
}

export async function placeStudentEnrollment(input: StudentPlacementMutation) {
  const [enrollments, mappings, deliveryTracks, batches, batchLevels, groups] = await Promise.all([
    readSheet<EnrollmentRow>("Enrollments"),
    readRequired<OfferingDeliveryMapRow>("Offering_Delivery_Map"),
    readRequired<DeliveryTrackRow>("Delivery_Tracks"),
    readRequired<BatchRow>("Batches"),
    readRequired<BatchLevelRow>("Batch_Levels"),
    readRequired<GroupRow>("Groups"),
  ]);
  const enrollment = enrollments.find(row => textValue(row.Enrollment_ID) === textValue(input.enrollmentId));
  if (!enrollment) throw new ServiceError("ENROLLMENT_NOT_FOUND", "Enrollment was not found.", 404);
  const resolution = resolveDeliveryTrack(enrollment.Offering_ID, mappings, deliveryTracks);
  if (resolution.issue || !resolution.track) throw new ServiceError("DELIVERY_MAPPING_REQUIRED", resolution.issue ?? "This offering has not been mapped to an operational Delivery Track yet.", 409);
  const deliveryMode = normalizedCode(enrollment.Delivery_Mode);
  if (!VALID_DELIVERY_MODES.includes(deliveryMode)) throw new ServiceError("DELIVERY_MODE_REQUIRED", "This enrollment requires a Delivery Mode before operational placement.", 409);
  const packageIssue = validatePackageLevelSelection(enrollment.Package_Label, deliveryMode, input.levelSelection);
  if (packageIssue) throw new ServiceError("INVALID_LEVEL_SELECTION", packageIssue, 409);
  const group = groups.find(row => textValue(row.Group_ID) === textValue(input.groupId));
  if (!group) throw new ServiceError("GROUP_NOT_FOUND", "Select a valid compatible Group.", 404);
  const compatibilityIssue = placementCompatibilityIssue(enrollment, input.levelSelection, group, resolution.track.Delivery_Track_ID, batches, batchLevels);
  if (compatibilityIssue) throw new ServiceError("INCOMPATIBLE_PLACEMENT", compatibilityIssue, 409);
  const capacity = group.Capacity.trim() ? Number(group.Capacity) : 0;
  if (group.Capacity.trim() && (!Number.isInteger(capacity) || capacity <= 0)) throw new ServiceError("INVALID_GROUP_CAPACITY", "The selected Group has an invalid Capacity configuration.", 409);
  const assignedOtherEnrollments = enrollments.filter(row => textValue(row.Group_ID) === textValue(group.Group_ID) && textValue(row.Enrollment_ID) !== textValue(enrollment.Enrollment_ID)).length;
  if (capacity > 0 && assignedOtherEnrollments >= capacity) throw new ServiceError("GROUP_FULL", "The selected Group is already at full capacity.", 409);
  await updateRecord("Enrollments", enrollment._rowNumber, { Level_Selection: input.levelSelection, Group_ID: textValue(group.Group_ID) });
  return { message: enrollment.Group_ID ? "Placement updated." : "Student enrollment placed.", enrollmentId: textValue(enrollment.Enrollment_ID), groupId: textValue(group.Group_ID) };
}

export async function mutateSessionSetup(input: SessionSetupMutation) {
  const [sessions, deliveryTracks, batches, batchLevels, staffAssignments, staff] = await Promise.all([
    readRequired<SessionRow>("Sessions"),
    readRequired<DeliveryTrackRow>("Delivery_Tracks"),
    readRequired<BatchRow>("Batches"),
    readRequired<BatchLevelRow>("Batch_Levels"),
    readRequired<BatchStaffAssignmentRow>("Batch_Staff_Assignments"),
    readRequired<StaffRow>("Staff"),
  ]);
  const current = input.action === "update-session" ? sessions.find(row => row.Session_ID === input.id) : undefined;
  if (input.action === "update-session" && !current) throw new ServiceError("SESSION_NOT_FOUND", "Session was not found.", 404);
  const deliveryTrack = deliveryTracks.find(row => row.Delivery_Track_ID === input.deliveryTrackId && activeValue(row.Is_Active));
  if (!deliveryTrack) throw new ServiceError("DELIVERY_TRACK_INACTIVE", "Select an active Delivery Track.", 409);
  const batch = batches.find(row => row.Batch_ID === input.batchId && row.Delivery_Track_ID === deliveryTrack.Delivery_Track_ID && ["PLANNED", "ACTIVE"].includes(normalizedCode(row.Status)));
  if (!batch) throw new ServiceError("BATCH_NOT_ELIGIBLE", "Select a planned or active Batch for the chosen Delivery Track.", 409);
  const batchLevel = batchLevels.find(row => row.Batch_Level_ID === input.batchLevelId && row.Batch_ID === batch.Batch_ID && ["PLANNED", "ACTIVE"].includes(normalizedCode(row.Status)));
  if (!batchLevel) throw new ServiceError("BATCH_LEVEL_NOT_ELIGIBLE", "Select a planned or active Batch Level belonging to the chosen Batch.", 409);
  if (sessions.some(row => row.Session_ID !== current?.Session_ID && row.Batch_Level_ID === batchLevel.Batch_Level_ID && numberValue(row.Session_Number) === input.sessionNumber)) throw new ServiceError("DUPLICATE_SESSION_NUMBER", "This Session Number already exists for the selected Batch Level.", 409);
  const startMinutes = timeToMinutes(input.startTime); const endMinutes = timeToMinutes(input.endTime);
  if (startMinutes < 0 || endMinutes < 0) throw new ServiceError("INVALID_SESSION_TIME", "Start Time and End Time must use a valid 24-hour time.");
  if (endMinutes <= startMinutes) throw new ServiceError("INVALID_SESSION_TIME_RANGE", "End Time must be later than Start Time. Overnight Sessions are not supported.");
  const date = parseDate(input.sessionDate);
  if (!date) throw new ServiceError("INVALID_SESSION_DATE", "Use a valid Session Date.");
  const durationHours = Number(((endMinutes - startMinutes) / 60).toFixed(2));
  const team = validateSessionTeamSelection(input, batch, batchLevel, staffAssignments, staff);
  const record = { Batch_Level_ID: batchLevel.Batch_Level_ID, Session_Number: input.sessionNumber, Session_Date: input.sessionDate, Day_Name: new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date), Start_Time: normalizeTime(input.startTime), End_Time: normalizeTime(input.endTime), Duration_Hours: durationHours, Session_Title: input.title.trim().replace(/\s+/g, " "), Session_Status: input.status, Notes: input.notes.trim(), Lead_Batch_Staff_Assignment_ID: team.leadAssignmentId, Assistant_Batch_Staff_Assignment_ID: team.assistantAssignmentId, Mentor_Batch_Staff_Assignment_ID: team.mentorAssignmentId };
  if (current) {
    await updateRecord("Sessions", current._rowNumber, record);
    return { message: "Session updated.", sessionId: current.Session_ID };
  }
  const sessionId = nextSessionId(sessions.map(row => row.Session_ID));
  await appendRecordToDataRegion("Sessions", { Session_ID: sessionId, ...record });
  if (!(await readRequired<SessionRow>("Sessions")).some(row => row.Session_ID === sessionId)) throw new ServiceError("SESSION_WRITE_NOT_CONFIRMED", "Session could not be confirmed in Google Sheets after saving.", 502);
  return { message: "Session created.", sessionId };
}

function validateSessionTeamSelection(input: SessionSetupMutation, batch: BatchRow, batchLevel: BatchLevelRow, assignments: BatchStaffAssignmentRow[], staff: StaffRow[]) {
  const leadAssignmentId = input.leadAssignmentId.trim();
  const assistantAssignmentId = input.assistantAssignmentId.trim();
  const mentorAssignmentId = input.mentorAssignmentId.trim();
  if (input.status !== "CANCELLED" && !leadAssignmentId) throw new ServiceError("SESSION_LEAD_REQUIRED", "Lead Trainer is required for non-cancelled Sessions.");
  const selected = [leadAssignmentId, assistantAssignmentId, mentorAssignmentId].filter(Boolean);
  if (new Set(selected).size !== selected.length) throw new ServiceError("DUPLICATE_SESSION_TEAM_ASSIGNMENT", "The same Staff assignment cannot be selected more than once for a Session.");
  const staffById = new Map(staff.map(row => [row.Staff_ID, row]));
  const validate = (assignmentId: string, label: string, allowedRoles: string[]) => {
    if (!assignmentId) return "";
    const assignment = assignments.find(row => row.Batch_Staff_Assignment_ID === assignmentId);
    if (!assignment || !activeValue(assignment.Is_Active)) throw new ServiceError("SESSION_TEAM_ASSIGNMENT_INVALID", `${label} must be an active eligible Staff assignment.`);
    const staffMember = staffById.get(assignment.Staff_ID);
    if (!staffMember || !activeValue(staffMember.Is_Active)) throw new ServiceError("SESSION_TEAM_STAFF_INACTIVE", `${label} must reference an active Staff member.`);
    if (assignment.Batch_ID !== batch.Batch_ID) throw new ServiceError("SESSION_TEAM_BATCH_MISMATCH", `${label} must belong to the selected Batch.`);
    if (assignment.Batch_Level_ID && assignment.Batch_Level_ID !== batchLevel.Batch_Level_ID) throw new ServiceError("SESSION_TEAM_LEVEL_MISMATCH", `${label} must be assigned to the selected Batch Level or the full Batch.`);
    if (!allowedRoles.includes(assignment.Role)) throw new ServiceError("SESSION_TEAM_ROLE_INVALID", `${label} has an invalid Staff role.`);
    return assignmentId;
  };
  return {
    leadAssignmentId: validate(leadAssignmentId, "Lead Trainer", ["INSTRUCTOR", "ASSISTANT"]),
    assistantAssignmentId: validate(assistantAssignmentId, "Assistant", ["ASSISTANT"]),
    mentorAssignmentId: validate(mentorAssignmentId, "Mentor", ["MENTOR"]),
  };
}

export async function mutateStaffSetup(input: StaffSetupMutation) {
  const [staff, assignments, batches, batchLevels] = await Promise.all([
    readRequired<StaffRow>("Staff"),
    readRequired<BatchStaffAssignmentRow>("Batch_Staff_Assignments"),
    readRequired<BatchRow>("Batches"),
    readRequired<BatchLevelRow>("Batch_Levels"),
  ]);
  if (input.action === "create-staff" || input.action === "update-staff") {
    const current = input.action === "update-staff" ? staff.find(row => row.Staff_ID === input.id) : undefined;
    if (input.action === "update-staff" && !current) throw new ServiceError("STAFF_NOT_FOUND", "Staff member was not found.", 404);
    const name = input.name.trim().replace(/\s+/g, " "); const phone = input.phone.trim(); const email = input.email.trim().toLowerCase();
    if (input.isActive && email && staff.some(row => row.Staff_ID !== current?.Staff_ID && activeValue(row.Is_Active) && row.Email.trim().toLowerCase() === email)) throw new ServiceError("DUPLICATE_STAFF_EMAIL", "An active Staff member with this email already exists.", 409);
    if (input.isActive && !email && staff.some(row => row.Staff_ID !== current?.Staff_ID && activeValue(row.Is_Active) && !row.Email.trim() && normalizedName(row.Staff_Name) === normalizedName(name) && normalizedPhone(row.Phone) === normalizedPhone(phone))) throw new ServiceError("DUPLICATE_STAFF", "An active Staff member with this name and phone already exists.", 409);
    const record = { Staff_Name: name, Phone: phone, Email: email, Is_Active: sheetBoolean(input.isActive), Notes: input.notes.trim() };
    if (current) { await updateRecord("Staff", current._rowNumber, record); return { message: "Staff profile updated." }; }
    const staffId = nextStaffId(staff.map(row => row.Staff_ID)); await appendRecordToDataRegion("Staff", { Staff_ID: staffId, ...record }); if (!(await readRequired<StaffRow>("Staff")).some(row => row.Staff_ID === staffId)) throw new ServiceError("STAFF_WRITE_NOT_CONFIRMED", "Staff profile could not be confirmed in Google Sheets after saving.", 502); return { message: "Staff member created.", staffId };
  }

  const current = input.action === "update-assignment" ? assignments.find(row => row.Batch_Staff_Assignment_ID === input.id) : undefined;
  if (input.action === "update-assignment" && !current) throw new ServiceError("STAFF_ASSIGNMENT_NOT_FOUND", "Staff assignment was not found.", 404);
  const staffMember = staff.find(row => row.Staff_ID === input.staffId);
  if (!staffMember) throw new ServiceError("STAFF_NOT_FOUND", "Select a valid Staff member.", 404);
  if ((input.action === "create-assignment" || input.isActive || current?.Staff_ID !== input.staffId) && !activeValue(staffMember.Is_Active)) throw new ServiceError("STAFF_INACTIVE", "Inactive Staff cannot be selected for this assignment.", 409);
  const batch = batches.find(row => row.Batch_ID === input.batchId);
  if (!batch) throw new ServiceError("BATCH_NOT_FOUND", "Select a valid Batch.", 404);
  const assignmentScopeChanged = !current || current.Batch_ID !== input.batchId || current.Batch_Level_ID !== input.batchLevelId;
  if ((input.action === "create-assignment" || input.isActive || assignmentScopeChanged) && !["PLANNED", "ACTIVE"].includes(normalizedCode(batch.Status))) throw new ServiceError("BATCH_NOT_ELIGIBLE", "Staff can only be assigned to a planned or active Batch.", 409);
  if (input.batchLevelId) {
    const level = batchLevels.find(row => row.Batch_Level_ID === input.batchLevelId && row.Batch_ID === batch.Batch_ID);
    if (!level) throw new ServiceError("BATCH_LEVEL_NOT_FOUND", "The selected Batch Level does not belong to this Batch.", 409);
    if ((input.action === "create-assignment" || input.isActive || assignmentScopeChanged) && !["PLANNED", "ACTIVE"].includes(normalizedCode(level.Status))) throw new ServiceError("BATCH_LEVEL_NOT_ELIGIBLE", "Staff can only be assigned to a planned or active Batch Level.", 409);
  }
  const payBasis = input.payBasis;
  const hourlyRate = payBasis === "HOURLY" ? input.hourlyRate : null; const fixedTotal = payBasis === "FIXED_TOTAL" ? input.fixedTotal : null;
  if (payBasis === "HOURLY" && (!hourlyRate || hourlyRate <= 0)) throw new ServiceError("HOURLY_RATE_REQUIRED", "Hourly assignments require an Hourly Rate greater than zero.");
  if (payBasis === "FIXED_TOTAL" && (!fixedTotal || fixedTotal <= 0)) throw new ServiceError("FIXED_TOTAL_REQUIRED", "Fixed Total assignments require a Fixed Total greater than zero.");
  if (payBasis === "HOURLY" && input.fixedTotal !== null) throw new ServiceError("INVALID_PAY_FIELDS", "Fixed Total must be blank when Pay Basis is Hourly.");
  if (payBasis === "FIXED_TOTAL" && input.hourlyRate !== null) throw new ServiceError("INVALID_PAY_FIELDS", "Hourly Rate must be blank when Pay Basis is Fixed Total.");
  if (input.isActive) {
    const conflicts = assignments.filter(row => row.Batch_Staff_Assignment_ID !== current?.Batch_Staff_Assignment_ID && activeValue(row.Is_Active) && row.Batch_ID === input.batchId && row.Staff_ID === input.staffId && row.Role === input.role);
    if (conflicts.some(row => row.Batch_Level_ID === input.batchLevelId)) throw new ServiceError("DUPLICATE_STAFF_ASSIGNMENT", "This active Staff assignment already exists.", 409);
    if (conflicts.some(row => !row.Batch_Level_ID || !input.batchLevelId)) throw new ServiceError("OVERLAPPING_STAFF_ASSIGNMENT", "A full-Batch and level-specific assignment cannot overlap for the same Staff member and Role.", 409);
  }
  const record = { Batch_ID: input.batchId, Batch_Level_ID: input.batchLevelId, Staff_ID: input.staffId, Role: input.role, Pay_Basis: payBasis, Hourly_Rate: hourlyRate ?? "", Fixed_Total: fixedTotal ?? "", Is_Active: sheetBoolean(input.isActive), Notes: input.notes.trim() };
  if (current) { await updateRecord("Batch_Staff_Assignments", current._rowNumber, record); return { message: "Staff assignment updated." }; }
  const assignmentId = nextStaffAssignmentId(assignments.map(row => row.Batch_Staff_Assignment_ID)); await appendRecordToDataRegion("Batch_Staff_Assignments", { Batch_Staff_Assignment_ID: assignmentId, ...record }); if (!(await readRequired<BatchStaffAssignmentRow>("Batch_Staff_Assignments")).some(row => row.Batch_Staff_Assignment_ID === assignmentId)) throw new ServiceError("STAFF_ASSIGNMENT_WRITE_NOT_CONFIRMED", "Staff assignment could not be confirmed in Google Sheets after saving.", 502); return { message: "Staff assigned.", assignmentId };
}

function timeToMinutes(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
}

function normalizeTime(value: string) { const minutes = timeToMinutes(value); return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }
function parseDate(value: string) { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!match) return undefined; const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))); return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? date : undefined; }

const VALID_DELIVERY_MODES = ["ONLINE", "OFFLINE", "HYBRID"];
const VALID_ATTENDANCE_RULES = ["ONLINE_ONLY", "OFFLINE_ONLY", "ONLINE_OR_OFFLINE"];
const normalizedCode = (value: string) => value.trim().toUpperCase().replace(/[\s-]+/g, "_");
const normalizedLabel = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

function resolveDeliveryTrack(offeringId: string, mappings: Array<OfferingDeliveryMapRow & { _rowNumber: number }>, deliveryTracks: Array<DeliveryTrackRow & { _rowNumber: number }>) {
  const targetOfferingId = textValue(offeringId);
  const activeMappings = mappings.filter(row => textValue(row.Offering_ID) === targetOfferingId && activeValue(row.Is_Active));
  if (activeMappings.length !== 1) return { issue: "This offering has not been mapped to an operational Delivery Track yet." };
  const mappedDeliveryTrackId = textValue(activeMappings[0].Delivery_Track_ID);
  const track = deliveryTracks.find(row => textValue(row.Delivery_Track_ID) === mappedDeliveryTrackId && activeValue(row.Is_Active));
  if (!track) return { issue: "The mapped operational Delivery Track is unavailable or inactive." };
  return { track, issue: "" };
}

function validatePackageLevelSelection(packageLabel: string, deliveryMode: string, selection: string) {
  const fullProgram = normalizedLabel(packageLabel) === "full program";
  if (fullProgram && selection !== "BOTH_LEVELS") return "Full Program enrollments must be placed in BOTH LEVELS.";
  if (!fullProgram && selection !== "LEVEL_1" && selection !== "LEVEL_2") return "Non-Full Program enrollments require either LEVEL 1 or LEVEL 2 selection.";
  if (deliveryMode === "HYBRID" && selection !== "BOTH_LEVELS") return "A single-level enrollment cannot be placed with Hybrid delivery mode.";
  return "";
}

function placementCompatibilityIssue(enrollment: EnrollmentRow, selection: string, group: GroupRow, deliveryTrackId: string, batches: Array<BatchRow & { _rowNumber: number }>, batchLevels: Array<BatchLevelRow & { _rowNumber: number }>) {
  const batch = batches.find(row => textValue(row.Batch_ID) === textValue(group.Batch_ID));
  if (!batch || textValue(batch.Delivery_Track_ID) !== textValue(deliveryTrackId)) return "The selected Group does not belong to an eligible Batch for this Delivery Track.";
  if (!["PLANNED", "ACTIVE"].includes(normalizedCode(batch.Status))) return "The selected Batch is not planned or active.";
  if (!["PLANNED", "ACTIVE"].includes(normalizedCode(group.Status))) return "The selected Group is not planned or active.";
  if (normalizedCode(group.Level_Selection) !== selection) return "The selected Group does not match the required Level Selection.";
  const requiredLevels = selection === "BOTH_LEVELS" ? ["LEVEL_1", "LEVEL_2"] : [selection];
  for (const levelCode of requiredLevels) {
    const level = batchLevels.find(row => textValue(row.Batch_ID) === textValue(batch.Batch_ID) && normalizedCode(row.Level_Code) === levelCode && ["PLANNED", "ACTIVE"].includes(normalizedCode(row.Status)));
    if (!level) return `${levelCode.replace("_", " ")} is not available as a planned or active Batch Level.`;
    if (!VALID_ATTENDANCE_RULES.includes(normalizedCode(level.Attendance_Rule))) return `${levelCode.replace("_", " ")} has a missing or invalid Attendance Rule.`;
    const groupMode = levelCode === "LEVEL_1" ? normalizedCode(group.Level_1_Attendance_Mode) : normalizedCode(group.Level_2_Attendance_Mode);
    if (!attendanceRuleAllows(normalizedCode(level.Attendance_Rule), groupMode)) return `The selected Group's ${levelCode.replace("_", " ")} attendance mode does not comply with the Batch Level Attendance Rule.`;
  }
  const deliveryMode = normalizedCode(enrollment.Delivery_Mode);
  if (deliveryMode === "HYBRID") {
    if (selection !== "BOTH_LEVELS") return "A single-level enrollment cannot be placed with Hybrid delivery mode.";
    if (normalizedCode(group.Level_1_Attendance_Mode) !== "OFFLINE" || normalizedCode(group.Level_2_Attendance_Mode) !== "ONLINE") return "Hybrid placement requires Level 1 Offline and Level 2 Online attendance.";
    return "";
  }
  if (selection === "BOTH_LEVELS" && (normalizedCode(group.Level_1_Attendance_Mode) !== deliveryMode || normalizedCode(group.Level_2_Attendance_Mode) !== deliveryMode)) return `Both Group levels must use ${deliveryMode} attendance for this enrollment.`;
  if (selection === "LEVEL_1" && normalizedCode(group.Level_1_Attendance_Mode) !== deliveryMode) return `Level 1 must use ${deliveryMode} attendance for this enrollment.`;
  if (selection === "LEVEL_2" && normalizedCode(group.Level_2_Attendance_Mode) !== deliveryMode) return `Level 2 must use ${deliveryMode} attendance for this enrollment.`;
  return "";
}

function attendanceRuleAllows(rule: string, mode: string) {
  if (rule === "ONLINE_ONLY") return mode === "ONLINE";
  if (rule === "OFFLINE_ONLY") return mode === "OFFLINE";
  if (rule === "ONLINE_OR_OFFLINE") return mode === "ONLINE" || mode === "OFFLINE";
  return false;
}

function buildPlacementQueueEntry(enrollment: EnrollmentRow, student: (StudentRow & { _rowNumber: number }) | undefined, mappings: Array<OfferingDeliveryMapRow & { _rowNumber: number }>, deliveryTracks: Array<DeliveryTrackRow & { _rowNumber: number }>, batches: Array<BatchRow & { _rowNumber: number }>, batchLevels: Array<BatchLevelRow & { _rowNumber: number }>, groups: Array<GroupRow & { _rowNumber: number }>): TrainingOperationsData["placementQueue"][number] {
  const resolution = resolveDeliveryTrack(enrollment.Offering_ID, mappings, deliveryTracks);
  const group = textValue(enrollment.Group_ID) ? groups.find(row => textValue(row.Group_ID) === textValue(enrollment.Group_ID)) : undefined;
  const deliveryMode = normalizedCode(enrollment.Delivery_Mode);
  const levelSelection = normalizedCode(enrollment.Level_Selection);
  let configurationMessage = resolution.issue || "";
  if (!configurationMessage && !VALID_DELIVERY_MODES.includes(deliveryMode)) configurationMessage = "This enrollment requires a Delivery Mode before operational placement.";
  if (!configurationMessage && normalizedLabel(enrollment.Package_Label) !== "full program" && deliveryMode === "HYBRID") configurationMessage = "A single-level enrollment cannot be placed with Hybrid delivery mode.";
  if (!configurationMessage && levelSelection) configurationMessage = validatePackageLevelSelection(enrollment.Package_Label, deliveryMode, levelSelection);
  if (!configurationMessage && enrollment.Group_ID) configurationMessage = !group ? "The current Group no longer exists." : placementCompatibilityIssue(enrollment, levelSelection, group, resolution.track?.Delivery_Track_ID ?? "", batches, batchLevels);
  const placementStatuses: TrainingOperationsData["placementQueue"][number]["placementStatuses"] = [];
  if (enrollment.Group_ID) placementStatuses.push("PLACED");
  else {
    placementStatuses.push("UNPLACED");
    placementStatuses.push(levelSelection ? "READY_TO_PLACE" : "NEEDS_LEVEL_SELECTION");
  }
  if (configurationMessage) placementStatuses.push("CONFIGURATION_REQUIRED");
  return { enrollmentId: textValue(enrollment.Enrollment_ID), academyStudentId: textValue(enrollment.Academy_Student_ID), studentName: student?.Student_Name ?? "Unknown Student", phone: student?.Phone ?? "", studentUniversity: student?.University ?? "", offeringId: textValue(enrollment.Offering_ID), soldTrack: enrollment.Track, programScope: enrollment.University, packageLabel: enrollment.Package_Label, creditHours: numberValue(enrollment["Credit Hours"]), deliveryMode: deliveryMode || "UNASSIGNED", levelSelection, groupId: textValue(enrollment.Group_ID), currentGroupName: group?.Group_Name ?? (enrollment.Group_ID ? "Unknown Group" : ""), deliveryTrackId: textValue(resolution.track?.Delivery_Track_ID), deliveryTrackName: resolution.track?.Delivery_Track_Name ?? "Unmapped", placementStatuses, configurationMessage };
}

function validateGroupConfiguration(input: GroupSetupMutation, batch: BatchRow, batchLevels: Array<BatchLevelRow & { _rowNumber: number }>) {
  if (["CANCELLED", "COMPLETED"].includes(batch.Status.trim().toUpperCase())) throw new ServiceError("BATCH_NOT_ELIGIBLE", "Groups cannot be configured for a cancelled or completed Batch.", 409);
  const eligibleLevels = batchLevels.filter(row => row.Batch_ID === batch.Batch_ID && ["PLANNED", "ACTIVE"].includes(row.Status.trim().toUpperCase()));
  const level1 = eligibleLevels.find(row => row.Level_Code === "LEVEL_1");
  const level2 = eligibleLevels.find(row => row.Level_Code === "LEVEL_2");
  if (input.levelSelection === "BOTH_LEVELS") {
    validateAttendanceMode(level1, input.level1AttendanceMode, "Level 1");
    validateAttendanceMode(level2, input.level2AttendanceMode, "Level 2");
  } else if (input.levelSelection === "LEVEL_1") {
    if (input.level2AttendanceMode) throw new ServiceError("IRRELEVANT_ATTENDANCE_MODE", "Level 2 Attendance Mode must be blank for a Level 1 Group.");
    validateAttendanceMode(level1, input.level1AttendanceMode, "Level 1");
  } else {
    if (input.level1AttendanceMode) throw new ServiceError("IRRELEVANT_ATTENDANCE_MODE", "Level 1 Attendance Mode must be blank for a Level 2 Group.");
    validateAttendanceMode(level2, input.level2AttendanceMode, "Level 2");
  }
}

function validateAttendanceMode(level: (BatchLevelRow & { _rowNumber: number }) | undefined, mode: string, label: string) {
  if (!level) throw new ServiceError("BATCH_LEVEL_REQUIRED", `${label} is not available as an active or planned Batch Level.`, 409);
  const rule = level.Attendance_Rule.trim().toUpperCase();
  const allowed = rule === "ONLINE_ONLY" ? ["ONLINE"] : rule === "OFFLINE_ONLY" ? ["OFFLINE"] : rule === "ONLINE_OR_OFFLINE" ? ["ONLINE", "OFFLINE"] : [];
  if (!allowed.length) throw new ServiceError("INVALID_ATTENDANCE_RULE", `${label} has a missing or invalid Attendance Rule.`, 409);
  if (!allowed.includes(mode)) throw new ServiceError("ATTENDANCE_MODE_NOT_ALLOWED", `${label} Attendance Mode does not comply with its Batch Level Attendance Rule.`);
}

function nextDeliveryTrackId(ids: string[]) {
  const used = new Set(ids.map(value => value.trim().toUpperCase()));
  const numeric = ids.map(value => Number(/^DTRK_(\d+)$/.exec(value.trim().toUpperCase())?.[1] ?? 0));
  let sequence = Math.max(0, ...numeric) + 1;
  let candidate = `DTRK_${String(sequence).padStart(3, "0")}`;
  while (used.has(candidate)) { sequence++; candidate = `DTRK_${String(sequence).padStart(3, "0")}`; }
  return candidate;
}

function nextBatchId(ids: string[]) {
  const used = new Set(ids.map(value => value.trim().toUpperCase()));
  const numeric = ids.map(value => Number(/^BATCH_(\d+)$/.exec(value.trim().toUpperCase())?.[1] ?? 0));
  let sequence = Math.max(0, ...numeric) + 1;
  let candidate = `BATCH_${String(sequence).padStart(4, "0")}`;
  while (used.has(candidate)) { sequence++; candidate = `BATCH_${String(sequence).padStart(4, "0")}`; }
  return candidate;
}

function nextGroupId(ids: string[]) {
  const used = new Set(ids.map(value => value.trim().toUpperCase()));
  const numeric = ids.map(value => Number(/^GRP_(\d+)$/.exec(value.trim().toUpperCase())?.[1] ?? 0));
  let sequence = Math.max(0, ...numeric) + 1;
  let candidate = `GRP_${String(sequence).padStart(4, "0")}`;
  while (used.has(candidate)) { sequence++; candidate = `GRP_${String(sequence).padStart(4, "0")}`; }
  return candidate;
}

function nextSessionId(ids: string[]) {
  const used = new Set(ids.map(value => value.trim().toUpperCase()));
  const numeric = ids.map(value => Number(/^SES_(\d+)$/.exec(value.trim().toUpperCase())?.[1] ?? 0));
  let sequence = Math.max(0, ...numeric) + 1;
  let candidate = `SES_${String(sequence).padStart(5, "0")}`;
  while (used.has(candidate)) { sequence++; candidate = `SES_${String(sequence).padStart(5, "0")}`; }
  return candidate;
}

function nextStaffId(ids: string[]) {
  const used = new Set(ids.map(value => value.trim().toUpperCase())); const numeric = ids.map(value => Number(/^STF_(\d+)$/.exec(value.trim().toUpperCase())?.[1] ?? 0)); let sequence = Math.max(0, ...numeric) + 1; let candidate = `STF_${String(sequence).padStart(4, "0")}`;
  while (used.has(candidate)) { sequence++; candidate = `STF_${String(sequence).padStart(4, "0")}`; } return candidate;
}

function nextStaffAssignmentId(ids: string[]) {
  const used = new Set(ids.map(value => value.trim().toUpperCase())); const numeric = ids.map(value => Number(/^BSTA_(\d+)$/.exec(value.trim().toUpperCase())?.[1] ?? 0)); let sequence = Math.max(0, ...numeric) + 1; let candidate = `BSTA_${String(sequence).padStart(5, "0")}`;
  while (used.has(candidate)) { sequence++; candidate = `BSTA_${String(sequence).padStart(5, "0")}`; } return candidate;
}

function nextBatchLevelId(batchId: string, levelCode: string, used: Set<string>) {
  const batchCode = batchId.replace(/^BATCH_/i, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "BATCH";
  const levelCodePart = levelCode.replace(/^LEVEL_/i, "L").replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "LEVEL";
  const base = `BLVL_${batchCode}_${levelCodePart}`;
  if (!used.has(base)) return base;
  let sequence = 2; let candidate = `${base}_${String(sequence).padStart(2, "0")}`;
  while (used.has(candidate)) { sequence++; candidate = `${base}_${String(sequence).padStart(2, "0")}`; }
  return candidate;
}

function nextLevelId(deliveryTrackId: string, levelCode: string, ids: string[]) {
  const shortCode = deliveryTrackId.replace(/^DTRK_/i, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "TRACK";
  const level = levelCode === "LEVEL_1" ? "L1" : "L2";
  const base = `DTL_${shortCode}_${level}`;
  const used = new Set(ids.map(value => value.trim().toUpperCase()));
  if (!used.has(base)) return base;
  let sequence = 2; let candidate = `${base}_${String(sequence).padStart(2, "0")}`;
  while (used.has(candidate)) { sequence++; candidate = `${base}_${String(sequence).padStart(2, "0")}`; }
  return candidate;
}
