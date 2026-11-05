import "server-only";
import { getHeaders, readSheet, readSheetDataRegion } from "@/lib/server/google/sheets";
import type { EnrollmentRow, StudentRow } from "@/lib/server/types";
import type { AnalysisBatchRow, AnalysisData, AnalysisLocationRow, AnalysisSummary } from "@/types/analysis";
import type { BatchRow, DeliveryTrackRow, GroupRow } from "@/types/operations";

const LOCATIONS = ["Alexandria", "Cairo", "Unassigned Location"];

export async function getAnalysisData(): Promise<AnalysisData> {
  const [batchHeaders, batches, groups, enrollments, students, deliveryTracks] = await Promise.all([
    getHeaders("Batches"),
    readSheetDataRegion<BatchRow>("Batches"),
    readSheetDataRegion<GroupRow>("Groups"),
    readSheet<EnrollmentRow>("Enrollments"),
    readSheet<StudentRow>("Students"),
    readSheetDataRegion<DeliveryTrackRow>("Delivery_Tracks"),
  ]);
  const configurationWarning = batchHeaders.some(header => header.trim() === "Batch_Location") ? "" : "Batches is missing optional header: Batch_Location. Existing batches are shown as Unassigned Location until the header is added.";
  const batchById = new Map(batches.map(row => [row.Batch_ID, row]));
  const groupById = new Map(groups.map(row => [row.Group_ID, row]));
  const trackById = new Map(deliveryTracks.map(row => [row.Delivery_Track_ID, row.Delivery_Track_Name]));
  const studentById = new Map(students.map(row => [row.Academy_Student_ID, row]));
  const batchStats = new Map<string, MutableSummary>();
  const unassigned = emptyMutableSummary();
  const enrollmentFacts: AnalysisData["enrollmentFacts"] = [];

  for (const batch of batches) batchStats.set(batch.Batch_ID, emptyMutableSummary());
  for (const enrollment of enrollments.filter(row => row.Enrollment_ID.trim())) {
    const group = enrollment.Group_ID.trim() ? groupById.get(enrollment.Group_ID) : undefined;
    const batch = group ? batchById.get(group.Batch_ID) : undefined;
    const student = studentById.get(enrollment.Academy_Student_ID);
    const target = batch ? batchStats.get(batch.Batch_ID) ?? emptyMutableSummary() : unassigned;
    addEnrollment(target, enrollment, student);
    if (batch && !batchStats.has(batch.Batch_ID)) batchStats.set(batch.Batch_ID, target);
    enrollmentFacts.push({
      enrollmentId: enrollment.Enrollment_ID,
      academyStudentId: enrollment.Academy_Student_ID,
      batchId: batch?.Batch_ID ?? "",
      batchName: batch?.Batch_Name ?? "Unassigned Batch",
      batchLocation: batch ? locationValue(batchLocationField(batch)) : "Unassigned Location",
      deliveryTrack: batch ? trackById.get(batch.Delivery_Track_ID) ?? "Unknown Delivery Track" : "Unassigned Batch",
      groupId: group?.Group_ID ?? "",
      groupName: group?.Group_Name ?? "Unassigned Batch",
      studentUniversity: student?.University ?? "",
      paymentStatus: enrollment.Payment_Status,
      expectedRevenue: moneyValue(enrollment.Final_Contract_Price),
      collected: moneyValue(enrollment.Total_Paid),
      remaining: moneyValue(enrollment.Remaining),
    });
  }

  const batchRows: AnalysisBatchRow[] = batches.map(batch => {
    const summary = finalize(batchStats.get(batch.Batch_ID) ?? emptyMutableSummary(), groups.filter(group => group.Batch_ID === batch.Batch_ID).length, 1);
    return {
      batchId: batch.Batch_ID,
      batchName: batch.Batch_Name,
      batchLocation: locationValue(batchLocationField(batch)),
      deliveryTrack: trackById.get(batch.Delivery_Track_ID) ?? "Unknown Delivery Track",
      startDate: batch.Start_Date,
      endDate: batch.End_Date,
      status: batch.Status,
      ...summary,
    };
  });

  const locationMap = new Map<string, MutableSummary>();
  const locationGroups = new Map<string, Set<string>>();
  const locationBatches = new Map<string, Set<string>>();
  for (const batch of batches) {
    const location = locationValue(batchLocationField(batch));
    const stats = locationMap.get(location) ?? emptyMutableSummary();
    mergeMutable(stats, batchStats.get(batch.Batch_ID) ?? emptyMutableSummary());
    locationMap.set(location, stats);
    locationBatches.set(location, (locationBatches.get(location) ?? new Set()).add(batch.Batch_ID));
    const groupSet = locationGroups.get(location) ?? new Set<string>();
    groups.filter(group => group.Batch_ID === batch.Batch_ID).forEach(group => groupSet.add(group.Group_ID));
    locationGroups.set(location, groupSet);
  }
  const locationRows: AnalysisLocationRow[] = LOCATIONS.map(location => ({
    batchLocation: location,
    ...finalize(locationMap.get(location) ?? emptyMutableSummary(), locationGroups.get(location)?.size ?? 0, locationBatches.get(location)?.size ?? 0),
  }));

  const blankLocationBatchIds = new Set(batches.filter(batch => locationValue(batchLocationField(batch)) === "Unassigned Location").map(batch => batch.Batch_ID));
  const blankLocationFacts = enrollmentFacts.filter(fact => fact.batchId && blankLocationBatchIds.has(fact.batchId));
  console.info("analysis.location.summary", { blankLocationBatches: blankLocationBatchIds.size, blankLocationEnrollments: blankLocationFacts.length, unassignedLocationExpectedRevenue: blankLocationFacts.reduce((total, fact) => total + fact.expectedRevenue, 0) });
  return {
    configurationWarning,
    global: finalize([...batchStats.values()].reduce((all, item) => mergeMutable(all, item), emptyMutableSummary()), groups.length, batches.length),
    batchRows,
    locationRows,
    unassigned: finalize(unassigned, 0, 0),
    filters: {
      batchLocations: LOCATIONS,
      batches: batches.map(row => ({ id: row.Batch_ID, name: row.Batch_Name })),
      tracks: unique(batchRows.map(row => row.deliveryTrack)),
      paymentStatuses: unique(enrollments.map(row => row.Payment_Status)),
      studentUniversities: unique(students.map(row => row.University)),
      groups: groups.map(row => ({ id: row.Group_ID, name: row.Group_Name })),
    },
    enrollmentFacts,
  };
}

type MutableSummary = Omit<AnalysisSummary, "studentCount" | "batchCount" | "groupsCount"> & { students: Set<string> };

function emptyMutableSummary(): MutableSummary {
  return { expectedRevenue: 0, collected: 0, remaining: 0, enrollmentCount: 0, fullyPaidCount: 0, withRemainingCount: 0, students: new Set() };
}

function addEnrollment(target: MutableSummary, enrollment: EnrollmentRow, student?: StudentRow) {
  target.expectedRevenue += moneyValue(enrollment.Final_Contract_Price);
  target.collected += moneyValue(enrollment.Total_Paid);
  const remaining = moneyValue(enrollment.Remaining);
  target.remaining += remaining;
  target.enrollmentCount++;
  if (enrollment.Academy_Student_ID) target.students.add(enrollment.Academy_Student_ID);
  if (student?.Academy_Student_ID) target.students.add(student.Academy_Student_ID);
  if (remaining <= 0 || enrollment.Payment_Status.trim().toLowerCase() === "fully paid") target.fullyPaidCount++;
  else target.withRemainingCount++;
}

function mergeMutable(target: MutableSummary, source: MutableSummary) {
  target.expectedRevenue += source.expectedRevenue;
  target.collected += source.collected;
  target.remaining += source.remaining;
  target.enrollmentCount += source.enrollmentCount;
  target.fullyPaidCount += source.fullyPaidCount;
  target.withRemainingCount += source.withRemainingCount;
  source.students.forEach(id => target.students.add(id));
  return target;
}

function finalize(summary: MutableSummary, groupsCount: number, batchCount: number): AnalysisSummary {
  return { expectedRevenue: summary.expectedRevenue, collected: summary.collected, remaining: summary.remaining, studentCount: summary.students.size, enrollmentCount: summary.enrollmentCount, batchCount, groupsCount, fullyPaidCount: summary.fullyPaidCount, withRemainingCount: summary.withRemainingCount };
}

function locationValue(value?: string) {
  const trimmed = String(value ?? "").trim();
  return trimmed === "Alexandria" || trimmed === "Cairo" ? trimmed : "Unassigned Location";
}

function batchLocationField(batch: BatchRow) {
  return Object.entries(batch).find(([key]) => key.trim() === "Batch_Location")?.[1] ?? "";
}

function moneyValue(value: string) {
  return Number(String(value ?? "").replace(/,/g, "")) || 0;
}

function unique(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort();
}
