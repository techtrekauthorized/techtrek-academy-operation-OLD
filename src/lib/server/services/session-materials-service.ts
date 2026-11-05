import "server-only";
import { appendRecordToDataRegion, appendRecordsToDataRegions, getHeaders, readSheetDataRegion, updateRecord } from "@/lib/server/google/sheets";
import { ServiceError } from "@/lib/server/services/errors";
import { normalizeAttendanceSessionDateFields, sortAttendanceSessions } from "@/lib/server/services/sheet-date-time";
import type { SheetRow } from "@/lib/server/types";
import type { BatchRow, GroupRow } from "@/types/operations";
import type { SessionMaterialsData, SessionMaterialsExistingData, SessionMaterialsFormData } from "@/types/session-materials";

type AttendanceSessionRow = Record<string, string> & { Attendance_Session_ID: string; Attendance_Code: string };
type SessionMaterialRow = Record<string, string> & {
  Material_ID: string;
  Attendance_Session_ID: string;
  Material_Title: string;
  Material_Type: string;
  Provider: string;
  File_URL: string;
  File_ID: string;
  Session_Number: string;
  Level_Code: string;
  Publish_Status: string;
  Available_From: string;
  Available_To: string;
  Is_Active: string;
  Notes: string;
};
type SessionMaterialGroupRow = Record<string, string> & {
  Material_Access_ID: string;
  Material_ID: string;
  Group_ID: string;
  Access_Status: string;
  Notes: string;
};

const MATERIAL_HEADERS = ["Material_ID", "Attendance_Session_ID", "Material_Title", "Material_Type", "Provider", "File_URL", "File_ID", "Session_Number", "Level_Code", "Publish_Status", "Available_From", "Available_To", "Is_Active", "Notes"];
const MATERIAL_ACCESS_HEADERS = ["Material_Access_ID", "Material_ID", "Group_ID", "Access_Status", "Notes"];
const MATERIAL_TYPES = new Set(["PDF", "Presentation", "Doc", "Sheet", "Other"]);
const PUBLISH_STATUSES = new Set(["Draft", "Published", "Hidden"]);

export async function getSessionMaterialsData(): Promise<SessionMaterialsData> {
  const [formData, existingData] = await Promise.all([getSessionMaterialsFormData(), getSessionMaterialsExistingData()]);
  return { ...formData, ...existingData };
}

export async function getSessionMaterialsFormData(): Promise<SessionMaterialsFormData> {
  await validateMaterialHeaders();
  const [sessions, batches, groups] = await Promise.all([
    readSheetDataRegion<AttendanceSessionRow>("Attendance_Sessions"),
    readSheetDataRegion<BatchRow>("Batches"),
    readSheetDataRegion<GroupRow>("Groups"),
  ]);
  const normalizedSessions = sortAttendanceSessions(sessions.map(row => normalizeAttendanceSessionDateFields(row) as SheetRow<AttendanceSessionRow>));
  return {
    sessions: materialSessionOptions(normalizedSessions),
    batches: materialBatchOptions(batches),
    groups: materialGroupOptions(groups),
  };
}

export async function getSessionMaterialsExistingData(): Promise<SessionMaterialsExistingData> {
  await validateMaterialHeaders();
  const [materials, accessRows, sessions] = await Promise.all([
    readSheetDataRegion<SessionMaterialRow>("Session_Materials"),
    readSheetDataRegion<SessionMaterialGroupRow>("Session_Material_Groups"),
    readSheetDataRegion<AttendanceSessionRow>("Attendance_Sessions"),
  ]);
  const normalizedSessions = sortAttendanceSessions(sessions.map(row => normalizeAttendanceSessionDateFields(row) as SheetRow<AttendanceSessionRow>));
  const sessionById = new Map(normalizedSessions.map(row => [row.Attendance_Session_ID, row]));
  const activeGroupsByMaterial = new Map<string, string[]>();
  for (const row of accessRows.filter(row => row.Access_Status.trim().toLowerCase() === "active")) {
    activeGroupsByMaterial.set(row.Material_ID, [...(activeGroupsByMaterial.get(row.Material_ID) ?? []), row.Group_ID]);
  }
  return {
    materials: materials.map(row => {
      const session = sessionById.get(row.Attendance_Session_ID);
      const groupIds = activeGroupsByMaterial.get(row.Material_ID) ?? [];
      return {
        id: row.Material_ID,
        attendanceSessionId: row.Attendance_Session_ID,
        attendanceCode: session?.Attendance_Code ?? "",
        materialTitle: row.Material_Title,
        materialType: row.Material_Type,
        provider: row.Provider,
        fileUrl: row.File_URL,
        fileId: row.File_ID,
        sessionNumber: row.Session_Number,
        levelCode: row.Level_Code,
        publishStatus: row.Publish_Status,
        availableFrom: row.Available_From,
        availableTo: row.Available_To,
        isActive: row.Is_Active,
        notes: row.Notes,
        accessGroupsCount: groupIds.length,
        groupIds,
      };
    }),
  };
}

function materialSessionOptions(normalizedSessions: Array<SheetRow<AttendanceSessionRow>>): SessionMaterialsFormData["sessions"] {
  return normalizedSessions.map(row => ({
    id: row.Attendance_Session_ID,
    attendanceCode: row.Attendance_Code,
    batchId: row.Batch_ID ?? "",
    sessionDate: row.Session_Date ?? "",
    startTime: row.Start_Time ?? "",
    endTime: row.End_Time ?? "",
    sessionNumber: row.Session_Number ?? "",
    sessionTitle: row.Session_Title ?? row.Title ?? "",
    track: row.Track ?? row.Delivery_Track ?? "",
    levelCode: row.Level_Code ?? "",
  }));
}

function materialBatchOptions(batches: Array<SheetRow<BatchRow>>): SessionMaterialsFormData["batches"] {
  return batches.map(row => ({ id: row.Batch_ID, name: row.Batch_Name, location: String(Object.entries(row).find(([key]) => key.trim() === "Batch_Location")?.[1] ?? "") }));
}

function materialGroupOptions(groups: Array<SheetRow<GroupRow>>): SessionMaterialsFormData["groups"] {
  return groups.map(row => ({ id: row.Group_ID, name: row.Group_Name, batchId: row.Batch_ID, levelSelection: row.Level_Selection, level1AttendanceMode: row.Level_1_Attendance_Mode, level2AttendanceMode: row.Level_2_Attendance_Mode, capacity: row.Capacity, status: row.Status }));
}

export async function saveSessionMaterial(input: {
  materialId?: string;
  attendanceSessionId: string;
  materialTitle: string;
  materialType: string;
  provider: string;
  fileUrl: string;
  fileId: string;
  sessionNumber: string;
  levelCode: string;
  publishStatus: string;
  availableFrom: string;
  availableTo: string;
  isActive: boolean;
  notes: string;
  groupIds: string[];
}) {
  await validateMaterialHeaders();
  const [materials, accessRows, sessions, groups] = await Promise.all([
    readSheetDataRegion<SessionMaterialRow>("Session_Materials"),
    readSheetDataRegion<SessionMaterialGroupRow>("Session_Material_Groups"),
    readSheetDataRegion<AttendanceSessionRow>("Attendance_Sessions"),
    readSheetDataRegion<GroupRow>("Groups"),
  ]);
  const session = sessions.find(row => row.Attendance_Session_ID === input.attendanceSessionId.trim());
  if (!session) throw new ServiceError("ATTENDANCE_SESSION_NOT_FOUND", "Attendance session was not found.", 404);
  const selectedGroupIds = [...new Set(input.groupIds.map(value => value.trim()).filter(Boolean))];
  const groupById = new Map(groups.map(row => [row.Group_ID, row]));
  for (const groupId of selectedGroupIds) if (!groupById.has(groupId)) throw new ServiceError("GROUP_NOT_FOUND", "One selected group was not found.", 404);
  const current = input.materialId ? materials.find(row => row.Material_ID === input.materialId) : undefined;
  if (input.materialId && !current) throw new ServiceError("MATERIAL_NOT_FOUND", "Material was not found in the active table region.", 404);
  const record = buildMaterialRecord(input, current?.Material_ID || nextMaterialId(materials.map(row => row.Material_ID)));
  if (current) await updateRecord("Session_Materials", current._rowNumber, record);
  else await appendRecordToDataRegion("Session_Materials", record);
  await saveAccessRows(record.Material_ID, selectedGroupIds, accessRows, input.notes);
  return { message: current ? "Material updated." : "Material created.", materialId: record.Material_ID };
}

async function saveAccessRows(materialId: string, selectedGroupIds: string[], accessRows: Array<SheetRow<SessionMaterialGroupRow>>, notes: string) {
  const existing = accessRows.filter(row => row.Material_ID === materialId);
  const existingByGroup = new Map(existing.map(row => [row.Group_ID, row]));
  const selected = new Set(selectedGroupIds);
  const appends: Array<{ tab: "Session_Material_Groups"; record: Record<string, string | number> }> = [];
  const usedIds = accessRows.map(row => row.Material_Access_ID);
  for (const groupId of selectedGroupIds) {
    const current = existingByGroup.get(groupId);
    if (current) await updateRecord("Session_Material_Groups", current._rowNumber, { Access_Status: "Active", Notes: notes.trim() });
    else appends.push({ tab: "Session_Material_Groups", record: { Material_Access_ID: nextAccessId([...usedIds, ...appends.map(row => String(row.record.Material_Access_ID))]), Material_ID: materialId, Group_ID: groupId, Access_Status: "Active", Notes: notes.trim() } });
  }
  for (const row of existing) if (!selected.has(row.Group_ID) && row.Access_Status.trim().toLowerCase() !== "disabled") await updateRecord("Session_Material_Groups", row._rowNumber, { Access_Status: "Disabled" });
  if (appends.length) await appendRecordsToDataRegions(appends);
}

function buildMaterialRecord(input: Parameters<typeof saveSessionMaterial>[0], materialId: string): SessionMaterialRow {
  const title = input.materialTitle.trim();
  const type = input.materialType.trim();
  const provider = input.provider.trim();
  const fileUrl = input.fileUrl.trim();
  const fileId = input.fileId.trim() || extractGoogleDriveFileId(fileUrl);
  if (!title) throw new ServiceError("VALIDATION_FAILED", "Material Title is required.", 400);
  if (!MATERIAL_TYPES.has(type)) throw new ServiceError("VALIDATION_FAILED", "Material Type is invalid.", 400);
  if (provider !== "GoogleDrive") throw new ServiceError("VALIDATION_FAILED", "Provider must be GoogleDrive.", 400);
  if (!fileUrl) throw new ServiceError("VALIDATION_FAILED", "File URL is required.", 400);
  if (!fileId) throw new ServiceError("VALIDATION_FAILED", "File ID is required.", 400);
  if (!PUBLISH_STATUSES.has(input.publishStatus)) throw new ServiceError("VALIDATION_FAILED", "Publish Status is invalid.", 400);
  return {
    Material_ID: materialId,
    Attendance_Session_ID: input.attendanceSessionId.trim(),
    Material_Title: title,
    Material_Type: type,
    Provider: provider,
    File_URL: fileUrl,
    File_ID: fileId,
    Session_Number: input.sessionNumber.trim(),
    Level_Code: input.levelCode.trim(),
    Publish_Status: input.publishStatus,
    Available_From: input.availableFrom.trim(),
    Available_To: input.availableTo.trim(),
    Is_Active: input.isActive ? "TRUE" : "FALSE",
    Notes: input.notes.trim(),
  };
}

function extractGoogleDriveFileId(url: string) {
  const text = url.trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    const id = parsed.searchParams.get("id");
    if (id) return id.trim();
    const parts = parsed.pathname.split("/").filter(Boolean);
    const markerIndex = parts.findIndex(part => part === "d");
    if (markerIndex >= 0) return parts[markerIndex + 1] ?? "";
  } catch {
    return "";
  }
  return "";
}

async function validateMaterialHeaders() {
  const [materialHeaders, accessHeaders] = await Promise.all([getHeaders("Session_Materials"), getHeaders("Session_Material_Groups")]);
  assertHeaders("Session_Materials", materialHeaders, MATERIAL_HEADERS);
  assertHeaders("Session_Material_Groups", accessHeaders, MATERIAL_ACCESS_HEADERS);
}

function assertHeaders(tab: string, actual: string[], expected: string[]) {
  const normalizedActual = actual.map(header => header.trim());
  const missing = expected.filter(header => !normalizedActual.includes(header));
  if (missing.length) throw new ServiceError("CONFIGURATION_ERROR", `${tab} is missing required header: ${missing[0]}`, 503);
}

function nextMaterialId(existing: string[]) {
  return nextId("MAT_", existing);
}

function nextAccessId(existing: string[]) {
  return nextId("MACC_", existing);
}

function nextId(prefix: string, existing: string[]) {
  const used = new Set(existing.map(value => value.trim()));
  let counter = 1;
  while (used.has(`${prefix}${String(counter).padStart(4, "0")}`)) counter++;
  return `${prefix}${String(counter).padStart(4, "0")}`;
}
