import "server-only";
import { appendRecordsToDataRegions, atomicSheetMutation, getHeaders, readSheetDataRegion } from "@/lib/server/google/sheets";
import { ServiceError } from "@/lib/server/services/errors";
import { normalizeAttendanceSessionDateFields, sortAttendanceSessions } from "@/lib/server/services/sheet-date-time";
import type { SafeUser } from "@/lib/server/auth/types";
import type { SheetRow } from "@/lib/server/types";
import type { BatchRow, GroupRow } from "@/types/operations";
import type { LearningResourcesData, LearningResourcesExistingData, LearningResourcesFormData } from "@/types/learning-resources";
import { extractGoogleDriveFileId } from "@/lib/drive-links";

type AttendanceSessionRow = Record<string, string> & { Attendance_Session_ID: string; Attendance_Code: string; Batch_ID: string };
type LearningResourceRow = Record<string, string> & {
  Resource_ID: string;
  Batch_ID: string;
  Related_Attendance_Session_ID: string;
  Resource_Title: string;
  Resource_Description: string;
  Resource_Type: string;
  Resource_Category: string;
  Provider: string;
  Video_URL: string;
  Video_ID: string;
  Publish_Status: string;
  Available_From: string;
  Available_To: string;
  Is_Active: string;
  Created_At: string;
  Created_By: string;
  Notes: string;
};
type LearningResourceGroupRow = Record<string, string> & {
  Resource_Group_Map_ID: string;
  Resource_ID: string;
  Group_ID: string;
  Access_Status: string;
  Notes: string;
};

const RESOURCE_HEADERS = ["Resource_ID", "Batch_ID", "Related_Attendance_Session_ID", "Resource_Title", "Resource_Description", "Resource_Type", "Resource_Category", "Provider", "Video_URL", "Video_ID", "Publish_Status", "Available_From", "Available_To", "Is_Active", "Created_At", "Created_By", "Notes"];
const RESOURCE_GROUP_HEADERS = ["Resource_Group_Map_ID", "Resource_ID", "Group_ID", "Access_Status", "Notes"];
const CATEGORIES = new Set(["Revision", "Tutorial", "Reference", "Project Support", "Career", "Extra Practice", "Other"]);
const PUBLISH_STATUSES = new Set(["Draft", "Published", "Hidden"]);

export async function getLearningResourcesData(): Promise<LearningResourcesData> {
  const [formData, existingData] = await Promise.all([getLearningResourcesFormData(), getLearningResourcesExistingData()]);
  return { ...formData, ...existingData };
}

export async function getLearningResourcesFormData(): Promise<LearningResourcesFormData> {
  await validateLearningResourceHeaders();
  const [sessions, batches, groups] = await Promise.all([
    readSheetDataRegion<AttendanceSessionRow>("Attendance_Sessions"),
    readSheetDataRegion<BatchRow>("Batches"),
    readSheetDataRegion<GroupRow>("Groups"),
  ]);
  const normalizedSessions = sortAttendanceSessions(sessions.map(row => normalizeAttendanceSessionDateFields(row) as SheetRow<AttendanceSessionRow>));
  return {
    sessions: learningResourceSessionOptions(normalizedSessions),
    batches: learningResourceBatchOptions(batches),
    groups: learningResourceGroupOptions(groups),
  };
}

export async function getLearningResourcesExistingData(): Promise<LearningResourcesExistingData> {
  await validateLearningResourceHeaders();
  const [resources, accessRows, sessions, batches] = await Promise.all([
    readSheetDataRegion<LearningResourceRow>("Learning_Resources"),
    readSheetDataRegion<LearningResourceGroupRow>("Learning_Resource_Groups"),
    readSheetDataRegion<AttendanceSessionRow>("Attendance_Sessions"),
    readSheetDataRegion<BatchRow>("Batches"),
  ]);
  const normalizedSessions = sortAttendanceSessions(sessions.map(row => normalizeAttendanceSessionDateFields(row) as SheetRow<AttendanceSessionRow>));
  const sessionById = new Map(normalizedSessions.map(row => [row.Attendance_Session_ID, row]));
  const batchById = new Map(batches.map(row => [row.Batch_ID, row]));
  const activeGroupsByResource = new Map<string, string[]>();
  for (const row of accessRows.filter(row => isActiveAccess(row.Access_Status))) {
    activeGroupsByResource.set(row.Resource_ID, [...(activeGroupsByResource.get(row.Resource_ID) ?? []), row.Group_ID]);
  }
  return {
    resources: resources.map(row => {
      const session = sessionById.get(row.Related_Attendance_Session_ID);
      const batch = batchById.get(row.Batch_ID);
      const groupIds = activeGroupsByResource.get(row.Resource_ID) ?? [];
      return {
        id: row.Resource_ID,
        batchId: row.Batch_ID,
        batchName: batch?.Batch_Name ?? "",
        relatedAttendanceSessionId: row.Related_Attendance_Session_ID,
        relatedSessionLabel: session ? sessionLabel(session) : "",
        resourceTitle: row.Resource_Title,
        resourceDescription: row.Resource_Description,
        resourceType: "VIDEO",
        resourceCategory: row.Resource_Category || "Other",
        provider: "GoogleDrive",
        videoUrl: row.Video_URL,
        videoId: row.Video_ID,
        publishStatus: publishStatus(row.Publish_Status),
        availableFrom: row.Available_From,
        availableTo: row.Available_To,
        isActive: activeValue(row.Is_Active),
        createdAt: row.Created_At,
        createdBy: row.Created_By,
        notes: row.Notes,
        activeGroupsCount: groupIds.length,
        groupIds,
      };
    }),
  };
}

function learningResourceSessionOptions(normalizedSessions: Array<SheetRow<AttendanceSessionRow>>): LearningResourcesFormData["sessions"] {
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

function learningResourceBatchOptions(batches: Array<SheetRow<BatchRow>>): LearningResourcesFormData["batches"] {
  return batches.map(row => ({ id: row.Batch_ID, name: row.Batch_Name, location: String(row.Batch_Location ?? "") }));
}

function learningResourceGroupOptions(groups: Array<SheetRow<GroupRow>>): LearningResourcesFormData["groups"] {
  return groups.map(row => ({ id: row.Group_ID, name: row.Group_Name, batchId: row.Batch_ID, levelSelection: row.Level_Selection, level1AttendanceMode: row.Level_1_Attendance_Mode, level2AttendanceMode: row.Level_2_Attendance_Mode, capacity: row.Capacity, status: row.Status }));
}

export async function saveLearningResource(input: {
  resourceId?: string;
  batchId: string;
  relatedAttendanceSessionId: string;
  resourceTitle: string;
  resourceDescription: string;
  resourceType: "VIDEO";
  resourceCategory: string;
  provider: "GoogleDrive";
  videoUrl: string;
  videoId: string;
  publishStatus: "Draft" | "Published" | "Hidden";
  availableFrom: string;
  availableTo: string;
  isActive: boolean;
  notes: string;
  groupIds: string[];
}, user: SafeUser) {
  await validateLearningResourceHeaders();
  const [resources, accessRows, sessions, batches, groups] = await Promise.all([
    readSheetDataRegion<LearningResourceRow>("Learning_Resources"),
    readSheetDataRegion<LearningResourceGroupRow>("Learning_Resource_Groups"),
    readSheetDataRegion<AttendanceSessionRow>("Attendance_Sessions"),
    readSheetDataRegion<BatchRow>("Batches"),
    readSheetDataRegion<GroupRow>("Groups"),
  ]);
  const selectedGroupIds = [...new Set(input.groupIds.map(value => value.trim()).filter(Boolean))];
  if (!selectedGroupIds.length) throw new ServiceError("VALIDATION_FAILED", "Select at least one Group.", 400);
  const batch = batches.find(row => row.Batch_ID === input.batchId.trim());
  if (!batch) throw new ServiceError("BATCH_NOT_FOUND", "Batch was not found.", 404);
  if (input.relatedAttendanceSessionId.trim()) {
    const session = sessions.find(row => row.Attendance_Session_ID === input.relatedAttendanceSessionId.trim());
    if (!session || session.Batch_ID !== batch.Batch_ID) throw new ServiceError("ATTENDANCE_SESSION_NOT_FOUND", "Related Attendance Session was not found for this Batch.", 404);
  }
  const groupById = new Map(groups.map(row => [row.Group_ID, row]));
  for (const groupId of selectedGroupIds) {
    const group = groupById.get(groupId);
    if (!group) throw new ServiceError("GROUP_NOT_FOUND", "One selected Group was not found.", 404);
    if (group.Batch_ID !== batch.Batch_ID) throw new ServiceError("GROUP_BATCH_MISMATCH", "Selected Groups must belong to the selected Batch.", 400);
  }
  const current = input.resourceId ? resources.find(row => row.Resource_ID === input.resourceId) : undefined;
  if (input.resourceId && !current) throw new ServiceError("RESOURCE_NOT_FOUND", "Learning Resource was not found.", 404);
  const resourceId = current?.Resource_ID || nextResourceId(resources.map(row => row.Resource_ID));
  const record = buildResourceRecord(input, current, user, resourceId);
  const accessPlan = planResourceGroupRows(record.Resource_ID, selectedGroupIds, accessRows, input.notes);
  if (current) {
    await atomicSheetMutation({
      updates: [{ tab: "Learning_Resources", rowNumber: current._rowNumber, patch: record }, ...accessPlan.updates],
      appends: accessPlan.appends,
    });
  } else {
    await appendRecordsToDataRegions([{ tab: "Learning_Resources", record }, ...accessPlan.appends]);
  }
  return { message: current ? "Learning Resource updated." : "Learning Resource created.", resourceId: record.Resource_ID };
}

function planResourceGroupRows(resourceId: string, selectedGroupIds: string[], accessRows: Array<SheetRow<LearningResourceGroupRow>>, notes: string) {
  const existing = accessRows.filter(row => row.Resource_ID === resourceId);
  const existingByGroup = new Map<string, Array<SheetRow<LearningResourceGroupRow>>>();
  for (const row of existing) existingByGroup.set(row.Group_ID, [...(existingByGroup.get(row.Group_ID) ?? []), row]);
  const selected = new Set(selectedGroupIds);
  const appends: Array<{ tab: "Learning_Resource_Groups"; record: Record<string, string | number> }> = [];
  const updates: Array<{ tab: "Learning_Resource_Groups"; rowNumber: number; patch: Record<string, string | number> }> = [];
  const usedIds = accessRows.map(row => row.Resource_Group_Map_ID);
  for (const groupId of selectedGroupIds) {
    const currentRows = existingByGroup.get(groupId) ?? [];
    const current = currentRows[0];
    if (current) {
      updates.push({ tab: "Learning_Resource_Groups", rowNumber: current._rowNumber, patch: { Access_Status: "Active", Notes: notes.trim() } });
      for (const duplicate of currentRows.slice(1)) if (duplicate.Access_Status.trim().toLowerCase() !== "disabled") updates.push({ tab: "Learning_Resource_Groups", rowNumber: duplicate._rowNumber, patch: { Access_Status: "Disabled" } });
    }
    else appends.push({ tab: "Learning_Resource_Groups", record: { Resource_Group_Map_ID: nextResourceGroupMapId([...usedIds, ...appends.map(row => String(row.record.Resource_Group_Map_ID))]), Resource_ID: resourceId, Group_ID: groupId, Access_Status: "Active", Notes: notes.trim() } });
  }
  for (const row of existing) if (!selected.has(row.Group_ID) && row.Access_Status.trim().toLowerCase() !== "disabled") updates.push({ tab: "Learning_Resource_Groups", rowNumber: row._rowNumber, patch: { Access_Status: "Disabled" } });
  return { appends, updates };
}

function buildResourceRecord(input: Parameters<typeof saveLearningResource>[0], current: SheetRow<LearningResourceRow> | undefined, user: SafeUser, resourceId: string): LearningResourceRow {
  const title = input.resourceTitle.trim();
  const videoUrl = input.videoUrl.trim();
  const videoId = input.videoId.trim() || extractGoogleDriveFileId(videoUrl);
  if (!input.batchId.trim()) throw new ServiceError("VALIDATION_FAILED", "Batch is required.", 400);
  if (!title) throw new ServiceError("VALIDATION_FAILED", "Resource Title is required.", 400);
  if (input.resourceType !== "VIDEO") throw new ServiceError("VALIDATION_FAILED", "Resource Type must be VIDEO.", 400);
  if (input.provider !== "GoogleDrive") throw new ServiceError("VALIDATION_FAILED", "Provider must be GoogleDrive.", 400);
  if (!videoUrl) throw new ServiceError("VALIDATION_FAILED", "Video URL is required.", 400);
  if (!videoId) throw new ServiceError("VALIDATION_FAILED", "Video ID is required.", 400);
  if (!CATEGORIES.has(input.resourceCategory)) throw new ServiceError("VALIDATION_FAILED", "Resource Category is invalid.", 400);
  if (!PUBLISH_STATUSES.has(input.publishStatus)) throw new ServiceError("VALIDATION_FAILED", "Publish Status is invalid.", 400);
  return {
    Resource_ID: resourceId,
    Batch_ID: input.batchId.trim(),
    Related_Attendance_Session_ID: input.relatedAttendanceSessionId.trim(),
    Resource_Title: title,
    Resource_Description: input.resourceDescription.trim(),
    Resource_Type: "VIDEO",
    Resource_Category: input.resourceCategory,
    Provider: "GoogleDrive",
    Video_URL: videoUrl,
    Video_ID: videoId,
    Publish_Status: input.publishStatus,
    Available_From: input.availableFrom.trim(),
    Available_To: input.availableTo.trim(),
    Is_Active: input.isActive ? "TRUE" : "FALSE",
    Created_At: current?.Created_At || new Date().toISOString(),
    Created_By: current?.Created_By || user.userId,
    Notes: input.notes.trim(),
  };
}

function nextResourceId(existing: string[]) {
  return nextId("RES_", existing, 5);
}

function nextResourceGroupMapId(existing: string[]) {
  return nextId("RGM_", existing, 5);
}

function nextId(prefix: string, existing: string[], width: number) {
  const used = new Set(existing.map(value => value.trim()));
  let highest = 0;
  for (const value of used) {
    if (!value.startsWith(prefix)) continue;
    const numeric = Number(value.slice(prefix.length));
    if (Number.isInteger(numeric) && numeric > highest) highest = numeric;
  }
  let counter = highest + 1;
  while (used.has(`${prefix}${String(counter).padStart(width, "0")}`)) counter++;
  return `${prefix}${String(counter).padStart(width, "0")}`;
}

export async function validateLearningResourceHeaders() {
  const [resourceHeaders, accessHeaders] = await Promise.all([getHeaders("Learning_Resources"), getHeaders("Learning_Resource_Groups")]);
  assertHeaders("Learning_Resources", resourceHeaders, RESOURCE_HEADERS);
  assertHeaders("Learning_Resource_Groups", accessHeaders, RESOURCE_GROUP_HEADERS);
}

function assertHeaders(tab: string, actual: string[], expected: string[]) {
  const normalizedActual = actual.map(header => header.trim());
  const missing = expected.filter(header => !normalizedActual.includes(header));
  if (missing.length) throw new ServiceError("CONFIGURATION_ERROR", `${tab} is missing required header: ${missing[0]}`, 503);
}

function activeValue(value: string) {
  return ["true", "yes", "1", "active"].includes(value.trim().toLowerCase());
}

function isActiveAccess(value: string) {
  const normalized = value.trim().toLowerCase();
  return !normalized || normalized === "active";
}

function publishStatus(value: string): "Draft" | "Published" | "Hidden" {
  return value === "Published" || value === "Hidden" ? value : "Draft";
}

function sessionLabel(session: AttendanceSessionRow) {
  return `${session.Session_Date || "-"} | S${session.Session_Number || "-"} | ${session.Session_Title || session.Attendance_Code || session.Attendance_Session_ID}`;
}
