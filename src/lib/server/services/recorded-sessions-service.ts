import "server-only";
import { appendRecordToDataRegion, appendRecordsToDataRegions, getHeaders, readSheetDataRegion, updateRecord } from "@/lib/server/google/sheets";
import { ServiceError } from "@/lib/server/services/errors";
import { normalizeAttendanceSessionDateFields, sortAttendanceSessions } from "@/lib/server/services/sheet-date-time";
import type { SheetRow } from "@/lib/server/types";
import type { BatchRow, GroupRow } from "@/types/operations";
import type { RecordedSessionsData, RecordedSessionsExistingData, RecordedSessionsFormData } from "@/types/recorded-sessions";

type AttendanceSessionRow = Record<string, string> & { Attendance_Session_ID: string; Attendance_Code: string };
type RecordedSessionRow = Record<string, string> & {
  Recording_ID: string;
  Attendance_Session_ID: string;
  Recording_Title: string;
  Provider: string;
  Video_URL: string;
  Video_ID: string;
  Session_Number: string;
  Level_Code: string;
  Publish_Status: string;
  Available_From: string;
  Available_To: string;
  Is_Active: string;
  Notes: string;
};
type RecordedSessionGroupRow = Record<string, string> & {
  Recording_Access_ID: string;
  Recording_ID: string;
  Group_ID: string;
  Access_Status: string;
  Notes: string;
};

const RECORDED_SESSION_HEADERS = ["Recording_ID", "Attendance_Session_ID", "Recording_Title", "Provider", "Video_URL", "Video_ID", "Session_Number", "Level_Code", "Publish_Status", "Available_From", "Available_To", "Is_Active", "Notes"];
const RECORDED_ACCESS_HEADERS = ["Recording_Access_ID", "Recording_ID", "Group_ID", "Access_Status", "Notes"];
const PUBLISH_STATUSES = new Set(["Draft", "Published", "Hidden"]);
const PROVIDERS = new Set(["GoogleDrive"]);

export async function getRecordedSessionsData(): Promise<RecordedSessionsData> {
  const [formData, existingData] = await Promise.all([getRecordedSessionsFormData(), getRecordedSessionsExistingData()]);
  return { ...formData, ...existingData };
}

export async function getRecordedSessionsFormData(): Promise<RecordedSessionsFormData> {
  await validateRecordedHeaders();
  const [sessions, batches, groups] = await Promise.all([
    readSheetDataRegion<AttendanceSessionRow>("Attendance_Sessions"),
    readSheetDataRegion<BatchRow>("Batches"),
    readSheetDataRegion<GroupRow>("Groups"),
  ]);
  const normalizedSessions = sortAttendanceSessions(sessions.map(row => normalizeAttendanceSessionDateFields(row) as SheetRow<AttendanceSessionRow>));
  return {
    sessions: recordedSessionOptions(normalizedSessions),
    batches: batchOptions(batches),
    groups: groupOptions(groups),
  };
}

export async function getRecordedSessionsExistingData(): Promise<RecordedSessionsExistingData> {
  await validateRecordedHeaders();
  const [recordings, accessRows, sessions] = await Promise.all([
    readSheetDataRegion<RecordedSessionRow>("Recorded_Sessions"),
    readSheetDataRegion<RecordedSessionGroupRow>("Recorded_Session_Groups"),
    readSheetDataRegion<AttendanceSessionRow>("Attendance_Sessions"),
  ]);
  const normalizedSessions = sortAttendanceSessions(sessions.map(row => normalizeAttendanceSessionDateFields(row) as SheetRow<AttendanceSessionRow>));
  const sessionById = new Map(normalizedSessions.map(row => [row.Attendance_Session_ID, row]));
  const activeGroupsByRecording = new Map<string, string[]>();
  for (const row of accessRows.filter(row => row.Access_Status.trim().toLowerCase() === "active")) {
    activeGroupsByRecording.set(row.Recording_ID, [...(activeGroupsByRecording.get(row.Recording_ID) ?? []), row.Group_ID]);
  }
  return {
    recordings: recordings.map(row => {
      const session = sessionById.get(row.Attendance_Session_ID);
      const groupIds = activeGroupsByRecording.get(row.Recording_ID) ?? [];
      return {
        id: row.Recording_ID,
        attendanceSessionId: row.Attendance_Session_ID,
        attendanceCode: session?.Attendance_Code ?? "",
        recordingTitle: row.Recording_Title,
        provider: row.Provider,
        videoUrl: row.Video_URL,
        videoId: row.Video_ID,
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

function recordedSessionOptions(normalizedSessions: Array<SheetRow<AttendanceSessionRow>>): RecordedSessionsFormData["sessions"] {
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

function batchOptions(batches: Array<SheetRow<BatchRow>>): RecordedSessionsFormData["batches"] {
  return batches.map(row => ({ id: row.Batch_ID, name: row.Batch_Name, location: String(Object.entries(row).find(([key]) => key.trim() === "Batch_Location")?.[1] ?? "") }));
}

function groupOptions(groups: Array<SheetRow<GroupRow>>): RecordedSessionsFormData["groups"] {
  return groups.map(row => ({ id: row.Group_ID, name: row.Group_Name, batchId: row.Batch_ID, levelSelection: row.Level_Selection, level1AttendanceMode: row.Level_1_Attendance_Mode, level2AttendanceMode: row.Level_2_Attendance_Mode, capacity: row.Capacity, status: row.Status }));
}

export async function saveRecordedSession(input: {
  recordingId?: string;
  attendanceSessionId: string;
  recordingTitle: string;
  provider: string;
  videoUrl: string;
  videoId: string;
  sessionNumber: string;
  levelCode: string;
  publishStatus: string;
  availableFrom: string;
  availableTo: string;
  isActive: boolean;
  notes: string;
  groupIds: string[];
}) {
  await validateRecordedHeaders();
  const [recordings, accessRows, sessions, groups] = await Promise.all([
    readSheetDataRegion<RecordedSessionRow>("Recorded_Sessions"),
    readSheetDataRegion<RecordedSessionGroupRow>("Recorded_Session_Groups"),
    readSheetDataRegion<AttendanceSessionRow>("Attendance_Sessions"),
    readSheetDataRegion<GroupRow>("Groups"),
  ]);
  const session = sessions.find(row => row.Attendance_Session_ID === input.attendanceSessionId.trim());
  if (!session) throw new ServiceError("ATTENDANCE_SESSION_NOT_FOUND", "Attendance session was not found.", 404);
  const selectedGroupIds = [...new Set(input.groupIds.map(value => value.trim()).filter(Boolean))];
  const groupById = new Map(groups.map(row => [row.Group_ID, row]));
  for (const groupId of selectedGroupIds) if (!groupById.has(groupId)) throw new ServiceError("GROUP_NOT_FOUND", "One selected group was not found.", 404);
  const current = input.recordingId ? recordings.find(row => row.Recording_ID === input.recordingId) : undefined;
  if (input.recordingId && !current) throw new ServiceError("RECORDING_NOT_FOUND", "Recording was not found in the active table region.", 404);
  const record = buildRecordingRecord(input, current?.Recording_ID || nextRecordingId(recordings.map(row => row.Recording_ID)));
  if (current) await updateRecord("Recorded_Sessions", current._rowNumber, record);
  else await appendRecordToDataRegion("Recorded_Sessions", record);
  await saveAccessRows(record.Recording_ID, selectedGroupIds, accessRows, input.notes);
  return { message: current ? "Recording updated." : "Recording created.", recordingId: record.Recording_ID };
}

async function saveAccessRows(recordingId: string, selectedGroupIds: string[], accessRows: Array<SheetRow<RecordedSessionGroupRow>>, notes: string) {
  const existing = accessRows.filter(row => row.Recording_ID === recordingId);
  const existingByGroup = new Map(existing.map(row => [row.Group_ID, row]));
  const selected = new Set(selectedGroupIds);
  const appends: Array<{ tab: "Recorded_Session_Groups"; record: Record<string, string | number> }> = [];
  const usedIds = accessRows.map(row => row.Recording_Access_ID);
  for (const groupId of selectedGroupIds) {
    const current = existingByGroup.get(groupId);
    if (current) await updateRecord("Recorded_Session_Groups", current._rowNumber, { Access_Status: "Active", Notes: notes.trim() });
    else appends.push({ tab: "Recorded_Session_Groups", record: { Recording_Access_ID: nextAccessId([...usedIds, ...appends.map(row => String(row.record.Recording_Access_ID))]), Recording_ID: recordingId, Group_ID: groupId, Access_Status: "Active", Notes: notes.trim() } });
  }
  for (const row of existing) if (!selected.has(row.Group_ID) && row.Access_Status.trim().toLowerCase() !== "disabled") await updateRecord("Recorded_Session_Groups", row._rowNumber, { Access_Status: "Disabled" });
  if (appends.length) await appendRecordsToDataRegions(appends);
}

function buildRecordingRecord(input: Parameters<typeof saveRecordedSession>[0], recordingId: string): RecordedSessionRow {
  const title = input.recordingTitle.trim();
  const videoUrl = input.videoUrl.trim();
  const provider = input.provider.trim();
  const videoId = input.videoId.trim() || extractVideoId(provider, videoUrl);
  if (!title) throw new ServiceError("VALIDATION_FAILED", "Recording Title is required.", 400);
  if (!PROVIDERS.has(provider)) throw new ServiceError("VALIDATION_FAILED", "Provider must be GoogleDrive.", 400);
  if (!videoUrl) throw new ServiceError("VALIDATION_FAILED", "Video URL is required.", 400);
  if (!videoId) throw new ServiceError("VALIDATION_FAILED", "Video ID is required.", 400);
  if (!PUBLISH_STATUSES.has(input.publishStatus)) throw new ServiceError("VALIDATION_FAILED", "Publish Status is invalid.", 400);
  return {
    Recording_ID: recordingId,
    Attendance_Session_ID: input.attendanceSessionId.trim(),
    Recording_Title: title,
    Provider: provider,
    Video_URL: videoUrl,
    Video_ID: videoId,
    Session_Number: input.sessionNumber.trim(),
    Level_Code: input.levelCode.trim(),
    Publish_Status: input.publishStatus,
    Available_From: input.availableFrom.trim(),
    Available_To: input.availableTo.trim(),
    Is_Active: input.isActive ? "TRUE" : "FALSE",
    Notes: input.notes.trim(),
  };
}

function extractVideoId(_provider: string, url: string) {
  return extractGoogleDriveFileId(url);
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

async function validateRecordedHeaders() {
  const [recordingHeaders, accessHeaders] = await Promise.all([getHeaders("Recorded_Sessions"), getHeaders("Recorded_Session_Groups")]);
  assertHeaders("Recorded_Sessions", recordingHeaders, RECORDED_SESSION_HEADERS);
  assertHeaders("Recorded_Session_Groups", accessHeaders, RECORDED_ACCESS_HEADERS);
}

function assertHeaders(tab: string, actual: string[], expected: string[]) {
  const normalizedActual = actual.map(header => header.trim());
  const missing = expected.filter(header => !normalizedActual.includes(header));
  if (missing.length) throw new ServiceError("CONFIGURATION_ERROR", `${tab} is missing required header: ${missing[0]}`, 503);
}

function nextRecordingId(existing: string[]) {
  return nextId("REC_", existing);
}

function nextAccessId(existing: string[]) {
  return nextId("RACC_", existing);
}

function nextId(prefix: string, existing: string[]) {
  const used = new Set(existing.map(value => value.trim()));
  let counter = 1;
  while (used.has(`${prefix}${String(counter).padStart(4, "0")}`)) counter++;
  return `${prefix}${String(counter).padStart(4, "0")}`;
}
