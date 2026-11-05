import "server-only";
import { getHeaders, readSheet, updateRecord } from "@/lib/server/google/sheets";
import { ServiceError } from "@/lib/server/services/errors";
import type { EnrollmentRow, StudentRow } from "@/lib/server/types";
import type { BatchLevelRow, BatchRow, DeliveryTrackRow, GroupRow } from "@/types/operations";
import type { GroupRostersData } from "@/types/group-rosters";

const ENROLLMENT_WHATSAPP_HEADER = "Entered_WhatsApp_Group";

const numberValue = (value: string) => Number(String(value ?? "").replace(/,/g, "")) || 0;
const truthySheetValue = (value: string) => value.trim().toUpperCase() === "TRUE";
const stableId = (value: string) => value.trim();
const readableDeliveryMode = (value: string) => {
  const normalized = value.trim().toUpperCase();
  if (normalized === "ONLINE") return "Online";
  if (normalized === "OFFLINE") return "Offline";
  if (normalized === "HYBRID") return "Hybrid";
  return "Unassigned";
};
const displayValue = (value: string, fallback = "-") => value.trim() || fallback;

async function assertWhatsAppHeader() {
  const headers = await getHeaders("Enrollments");
  if (!headers.includes(ENROLLMENT_WHATSAPP_HEADER)) {
    throw new ServiceError("MISSING_ENROLLMENT_WHATSAPP_HEADER", "Enrollments is missing required header: Entered_WhatsApp_Group", 503);
  }
}

export async function getGroupRosters(): Promise<GroupRostersData> {
  await assertWhatsAppHeader();
  const [groups, enrollments, students, batches, batchLevels, deliveryTracks] = await Promise.all([
    readSheet<GroupRow>("Groups"),
    readSheet<EnrollmentRow>("Enrollments"),
    readSheet<StudentRow>("Students"),
    readSheet<BatchRow>("Batches"),
    readSheet<BatchLevelRow>("Batch_Levels"),
    readSheet<DeliveryTrackRow>("Delivery_Tracks"),
  ]);

  const studentsById = new Map(students.map(student => [stableId(student.Academy_Student_ID), student]));
  const batchesById = new Map(batches.map(batch => [batch.Batch_ID, batch]));
  const deliveryTracksById = new Map(deliveryTracks.map(track => [track.Delivery_Track_ID, track]));
  const levelsByBatch = batchLevels.reduce<Record<string, BatchLevelRow[]>>((accumulator, level) => {
    accumulator[level.Batch_ID] = [...(accumulator[level.Batch_ID] ?? []), level];
    return accumulator;
  }, {});
  const enrollmentsByGroup = enrollments.reduce<Record<string, EnrollmentRow[]>>((accumulator, enrollment) => {
    const groupId = enrollment.Group_ID.trim();
    if (!groupId) return accumulator;
    accumulator[groupId] = [...(accumulator[groupId] ?? []), enrollment];
    return accumulator;
  }, {});

  const rosterGroups = groups.map(group => {
    const batch = batchesById.get(group.Batch_ID);
    const deliveryTrack = batch ? deliveryTracksById.get(batch.Delivery_Track_ID) : undefined;
    const groupEnrollments = enrollmentsByGroup[group.Group_ID] ?? [];
    const studentsInGroup = groupEnrollments.map(enrollment => {
      const student = studentsById.get(stableId(enrollment.Academy_Student_ID));
      return {
        enrollmentId: enrollment.Enrollment_ID,
        academyStudentId: enrollment.Academy_Student_ID,
        universityStudentId: student?.Student_ID.trim() ?? "",
        studentName: displayValue(student?.Student_Name ?? "", "Unknown Student"),
        phone: student?.Phone ?? "",
        email: student?.Email ?? "",
        studentUniversity: student?.University ?? "",
        college: student?.College ?? "",
        soldTrack: enrollment.Track,
        packageLabel: enrollment.Package_Label,
        creditHours: numberValue(enrollment["Credit Hours"]),
        deliveryMode: readableDeliveryMode(enrollment.Delivery_Mode),
        levelSelection: enrollment.Level_Selection,
        paymentStatus: enrollment.Payment_Status,
        enteredWhatsAppGroup: truthySheetValue(enrollment.Entered_WhatsApp_Group ?? ""),
      };
    }).sort((left, right) => left.studentName.localeCompare(right.studentName) || left.enrollmentId.localeCompare(right.enrollmentId));
    const enteredCount = studentsInGroup.filter(student => student.enteredWhatsAppGroup).length;
    const level1 = (levelsByBatch[group.Batch_ID] ?? []).find(level => level.Level_Code === "LEVEL_1");
    const level2 = (levelsByBatch[group.Batch_ID] ?? []).find(level => level.Level_Code === "LEVEL_2");
    return {
      id: group.Group_ID,
      name: group.Group_Name,
      batchId: group.Batch_ID,
      batchName: batch?.Batch_Name ?? "Unknown Batch",
      deliveryTrackId: batch?.Delivery_Track_ID ?? "",
      deliveryTrackName: deliveryTrack?.Delivery_Track_Name ?? "Unknown Delivery Track",
      levelSelection: group.Level_Selection,
      level1AttendanceMode: group.Level_1_Attendance_Mode || (level1 ? "" : ""),
      level2AttendanceMode: group.Level_2_Attendance_Mode || (level2 ? "" : ""),
      status: group.Status,
      capacity: numberValue(group.Capacity),
      assignedStudentsCount: studentsInGroup.length,
      whatsappEnteredCount: enteredCount,
      whatsappMissingCount: studentsInGroup.length - enteredCount,
      students: studentsInGroup,
    };
  }).sort((left, right) => left.deliveryTrackName.localeCompare(right.deliveryTrackName) || left.batchName.localeCompare(right.batchName) || left.name.localeCompare(right.name));

  const totalPlacedStudents = rosterGroups.reduce((sum, group) => sum + group.assignedStudentsCount, 0);
  const enteredWhatsApp = rosterGroups.reduce((sum, group) => sum + group.whatsappEnteredCount, 0);
  return {
    summary: {
      totalGroups: rosterGroups.length,
      totalPlacedStudents,
      enteredWhatsApp,
      notEnteredWhatsApp: totalPlacedStudents - enteredWhatsApp,
    },
    groups: rosterGroups,
  };
}

export async function updateEnrollmentWhatsAppStatus(input: { enrollmentId: string; groupId: string; entered: boolean }) {
  await assertWhatsAppHeader();
  const enrollments = await readSheet<EnrollmentRow>("Enrollments");
  const enrollment = enrollments.find(row => row.Enrollment_ID === input.enrollmentId);
  if (!enrollment) throw new ServiceError("ENROLLMENT_NOT_FOUND", "Enrollment was not found.", 404);
  if (enrollment.Group_ID !== input.groupId) throw new ServiceError("ENROLLMENT_GROUP_MISMATCH", "This enrollment is not assigned to the selected group.", 400);
  await updateRecord("Enrollments", enrollment._rowNumber, { [ENROLLMENT_WHATSAPP_HEADER]: input.entered ? "TRUE" : "FALSE" });
  return { enrollmentId: input.enrollmentId, groupId: input.groupId, enteredWhatsAppGroup: input.entered };
}
