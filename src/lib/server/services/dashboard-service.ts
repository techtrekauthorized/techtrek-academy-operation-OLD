import "server-only";
import { readSheet } from "@/lib/server/google/sheets";
import type { EnrollmentRow, PaymentReceiptRow, StudentRow, SystemConfigRow, TrackRow } from "@/lib/server/types";
import type { DashboardChartItem, DashboardFilters, DashboardPlanningRow, DashboardResponse, ReceiverAcquisitionFilters, ReceiverAcquisitionResponse } from "@/types/dashboard";
import { deliveryModeLabel, normalizeDeliveryMode } from "@/lib/delivery-mode";

type JoinedEnrollment = {
  enrollmentId: string; academyStudentId: string; studentUniversity: string; college: string; intake: string; programScope: string;
  track: string; packageLabel: string; exactHours: number; deliveryMode: string; paymentStatus: string;
  finalContractPrice: number; remaining: number; collected: number;
};

type ReceiverAggregationInput = {
  enrollments: Array<EnrollmentRow & { _rowNumber: number }>;
  payments: Array<PaymentReceiptRow & { _rowNumber: number }>;
  students: Array<StudentRow & { _rowNumber: number }>;
  currentIntake: string;
  filters: ReceiverAcquisitionFilters;
};

type EligibleEnrollment = {
  enrollmentId: string;
  academyStudentId: string;
  registrationDate: string;
  registrationDay: number | null;
  intake: string;
  university: string;
  status: string;
};

const ALL_INTAKES = "__ALL__";
const UNASSIGNED_RECEIVER_KEY = "__unassigned_receiver";
const NO_INITIAL_PAYMENT_KEY = "__no_initial_payment";
const INVALID_REGISTRATION_DATE_KEY = "__invalid_registration_date";

export async function getDashboard(filters: Partial<DashboardFilters>, receiverFilters: Partial<ReceiverAcquisitionFilters> = {}): Promise<DashboardResponse> {
  const [students, enrollments, payments, offerings, config] = await Promise.all([
    readSheet<StudentRow>("Students"), readSheet<EnrollmentRow>("Enrollments"), readSheet<PaymentReceiptRow>("Payments_Receipts"),
    readSheet<TrackRow>("Tracks"), readSheet<SystemConfigRow>("System_Config"),
  ]);
  const studentById = new Map(students.map(row => [clean(row.Academy_Student_ID), row]));
  const offeringById = new Map(offerings.filter(row => active(row.Is_Active)).map(row => [clean(row.Offering_ID), row]));
  const validPayments = payments.filter(row => normalize(row.Receipt_Status) !== "voided");
  const collectedByEnrollment = new Map<string, number>();
  for (const payment of validPayments) collectedByEnrollment.set(clean(payment.Enrollment_ID), (collectedByEnrollment.get(clean(payment.Enrollment_ID)) ?? 0) + amount(payment.Payment_Amount));
  const joined = enrollments.filter(row => clean(row.Enrollment_ID)).map(row => {
    const offering = offeringById.get(clean(row.Offering_ID)); const student = studentById.get(clean(row.Academy_Student_ID));
    return {
      enrollmentId: clean(row.Enrollment_ID), academyStudentId: clean(row.Academy_Student_ID), studentUniversity: clean(student?.University), college: clean(student?.College),
      intake: clean(row.Intake), programScope: clean(row.University), track: clean(row.Track) || clean(offering?.Track),
      packageLabel: clean(row.Package_Label) || clean(offering?.Package_Label), exactHours: amount(row["Credit Hours"] || offering?.Exact_Hours), deliveryMode: normalizeDeliveryMode(row.Delivery_Mode),
      paymentStatus: clean(row.Payment_Status), finalContractPrice: amount(row.Final_Contract_Price), remaining: amount(row.Remaining),
      collected: collectedByEnrollment.get(clean(row.Enrollment_ID)) ?? 0,
    } satisfies JoinedEnrollment;
  });
  const filtered = joined.filter(row => matches(row, filters));
  const globalExpected = sum(joined, row => row.finalContractPrice); const paymentRowsTotal = sum(validPayments, row => amount(row.Payment_Amount));
  const enrollmentPaidSnapshotTotal = sum(enrollments, row => amount(row.Total_Paid)); const enrollmentIds = new Set(joined.map(row => row.enrollmentId));
  const planning = planningRows(filtered); const tracks = unique(filtered.map(row => row.track)); const scopes = unique(filtered.map(row => row.programScope));
  const currentIntake = clean(config.find(row => row.Config_Key === "CURRENT_INTAKE")?.Config_Value);
  const receiverAcquisitionFilters = normalizeReceiverFilters(receiverFilters, currentIntake);
  return {
    global: {
      totalExpectedRevenue: globalExpected, totalCollected: paymentRowsTotal, totalRemaining: sum(joined, row => row.remaining),
      totalStudents: new Set(students.map(row => clean(row.Academy_Student_ID)).filter(Boolean)).size, totalEnrollments: joined.length,
      fullyPaid: joined.filter(row => paidStatus(row.paymentStatus) === "fully paid").length, withRemaining: joined.filter(row => row.remaining > 0).length,
    },
    filtered: { matchingEnrollments: filtered.length, uniqueStudents: new Set(filtered.map(row => row.academyStudentId).filter(Boolean)).size, fullyPaid: filtered.filter(row => paidStatus(row.paymentStatus) === "fully paid").length, withRemaining: filtered.filter(row => row.remaining > 0).length },
    availableFilters: {
      programScope: unique([...joined.map(row => row.programScope), ...offerings.filter(row => active(row.Is_Active)).map(row => row.University)]), studentUniversity: unique(joined.map(row => row.studentUniversity)), college: unique(students.map(row => row.College)), track: unique(joined.map(row => row.track)),
      packageLabel: unique(joined.map(row => row.packageLabel)), exactHours: unique(joined.map(row => String(row.exactHours)).filter(value => value !== "0")),
      paymentStatus: unique(joined.map(row => row.paymentStatus)), deliveryMode: ["ONLINE", "OFFLINE", "HYBRID", "UNASSIGNED"], intake: unique(joined.map(row => row.intake || currentIntake)),
    },
    planning,
    charts: { byTrack: chart(filtered, row => row.track), byProgramScope: chart(filtered, row => row.programScope), byPackage: chart(filtered, row => row.packageLabel), byDeliveryMode: ["ONLINE", "OFFLINE", "HYBRID", "UNASSIGNED"].map(mode => ({ label: deliveryModeLabel(mode), value: filtered.filter(row => row.deliveryMode === mode).length })) },
    matrix: { tracks, rows: scopes.map(programScope => { const scoped = filtered.filter(row => row.programScope === programScope); return { programScope, counts: tracks.map(track => scoped.filter(row => row.track === track).length), total: scoped.length }; }) },
    receiverAcquisition: buildReceiverAcquisitionPerformance({ enrollments, payments, students, currentIntake, filters: receiverAcquisitionFilters }),
    diagnostics: { paymentRowsTotal, enrollmentPaidSnapshotTotal, difference: paymentRowsTotal - enrollmentPaidSnapshotTotal, orphanPaymentRows: validPayments.filter(row => clean(row.Enrollment_ID) && !enrollmentIds.has(clean(row.Enrollment_ID))).length, enrollmentsWithoutStudent: joined.filter(row => !studentById.has(row.academyStudentId)).length },
  };
}

export function buildReceiverAcquisitionPerformance({ enrollments, payments, students, currentIntake, filters }: ReceiverAggregationInput): ReceiverAcquisitionResponse {
  const studentById = new Map(students.map(row => [clean(row.Academy_Student_ID), row]));
  const uniqueEnrollments = new Map<string, EnrollmentRow & { _rowNumber: number }>();
  let duplicateEnrollmentIds = 0;
  let malformedEnrollmentIds = 0;
  for (const enrollment of enrollments) {
    const enrollmentId = clean(enrollment.Enrollment_ID);
    if (!enrollmentId) { malformedEnrollmentIds++; continue; }
    if (uniqueEnrollments.has(enrollmentId)) { duplicateEnrollmentIds++; continue; }
    uniqueEnrollments.set(enrollmentId, enrollment);
  }

  const paymentsByEnrollment = new Map<string, Array<PaymentReceiptRow & { _rowNumber: number }>>();
  let invalidPaymentDates = 0;
  for (const payment of payments) {
    const enrollmentId = clean(payment.Enrollment_ID);
    if (!enrollmentId) continue;
    if (clean(payment.Payment_Date) && parseDateDay(payment.Payment_Date) === null) invalidPaymentDates++;
    const bucket = paymentsByEnrollment.get(enrollmentId) ?? [];
    bucket.push(payment);
    paymentsByEnrollment.set(enrollmentId, bucket);
  }

  const availableIntakes = unique([...uniqueEnrollments.values()].map(row => clean(row.Intake)));
  const availableUniversities = new Set<string>();
  const receiverNames = new Map<string, string>();
  const eligibleRows: EligibleEnrollment[] = [];
  let invalidRegistrationDates = 0;
  let missingUniversities = 0;

  for (const enrollment of uniqueEnrollments.values()) {
    if (!isEligibleEnrollmentStatus(enrollment.Enrollment_Status)) continue;
    const enrollmentId = clean(enrollment.Enrollment_ID);
    const student = studentById.get(clean(enrollment.Academy_Student_ID));
    const university = clean(enrollment.University) || clean(student?.University) || "Unknown University";
    if (university === "Unknown University") missingUniversities++;
    const registrationDate = clean(enrollment.Registration_Date);
    const registrationDay = registrationDate ? parseDateDay(registrationDate) : null;
    if (registrationDate && registrationDay === null) invalidRegistrationDates++;
    const row = { enrollmentId, academyStudentId: clean(enrollment.Academy_Student_ID), registrationDate, registrationDay, intake: clean(enrollment.Intake), university, status: clean(enrollment.Enrollment_Status) };
    availableUniversities.add(university);
    const initialPayment = getInitialPayment(paymentsByEnrollment.get(enrollmentId) ?? []);
    if (initialPayment) {
      const receiver = canonicalReceiver(initialPayment.Receiver_Name);
      if (receiver.key) receiverNames.set(receiver.key, receiver.name);
    }
    eligibleRows.push(row);
  }

  const scoped = eligibleRows.filter(row => receiverScopeMatches(row, filters));
  const groups = new Map<string, { receiverName: string; enrollmentCount: number; universities: Map<string, number> }>();
  let malformedReceiverNames = 0;

  for (const enrollment of scoped) {
    const initialPayment = getInitialPayment(paymentsByEnrollment.get(enrollment.enrollmentId) ?? []);
    let receiverKey = "";
    let receiverName = "";
    if (dateFilterNeedsValidRegistration(filters) && enrollment.registrationDay === null) {
      receiverKey = INVALID_REGISTRATION_DATE_KEY;
      receiverName = "Invalid Registration Date";
    } else if (!initialPayment) {
      receiverKey = NO_INITIAL_PAYMENT_KEY;
      receiverName = "No Initial Payment";
    } else {
      const receiver = canonicalReceiver(initialPayment.Receiver_Name);
      receiverKey = receiver.key || UNASSIGNED_RECEIVER_KEY;
      receiverName = receiver.name || "Unassigned Receiver";
      if (receiverKey === UNASSIGNED_RECEIVER_KEY) malformedReceiverNames++;
    }
    if (filters.receiver && filters.receiver !== receiverKey) continue;
    const group = groups.get(receiverKey) ?? { receiverName, enrollmentCount: 0, universities: new Map<string, number>() };
    group.receiverName = receiverName;
    group.enrollmentCount++;
    group.universities.set(enrollment.university, (group.universities.get(enrollment.university) ?? 0) + 1);
    groups.set(receiverKey, group);
  }

  const filteredEligibleCount = [...groups.values()].reduce((total, group) => total + group.enrollmentCount, 0);
  const receivers = [...groups.entries()].map(([receiverKey, group]) => ({
    receiverKey,
    receiverName: group.receiverName,
    enrollmentCount: group.enrollmentCount,
    percentage: percentage(group.enrollmentCount, filteredEligibleCount),
    universityCount: group.universities.size,
    universities: [...group.universities.entries()].map(([university, enrollmentCount]) => ({ university, enrollmentCount, percentage: percentage(enrollmentCount, group.enrollmentCount) })).sort((a, b) => b.enrollmentCount - a.enrollmentCount || a.university.localeCompare(b.university)),
  })).sort((a, b) => b.enrollmentCount - a.enrollmentCount || a.receiverName.localeCompare(b.receiverName));

  const receiverTotalsMatchEligible = receivers.reduce((total, row) => total + row.enrollmentCount, 0) === filteredEligibleCount;
  const universityTotalsMatchReceivers = receivers.every(row => row.universities.reduce((total, item) => total + item.enrollmentCount, 0) === row.enrollmentCount);
  if (!receiverTotalsMatchEligible || !universityTotalsMatchReceivers) console.warn("Receiver acquisition reconciliation failed", { receiverTotalsMatchEligible, universityTotalsMatchReceivers, eligibleEnrollments: filteredEligibleCount, receiverCount: receivers.length });

  return {
    filters,
    availableFilters: {
      intakes: availableIntakes,
      universities: [...availableUniversities].sort((a, b) => a.localeCompare(b)),
      receivers: [...receiverNames.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name)),
      currentIntake,
    },
    totals: { eligibleEnrollments: filteredEligibleCount, attributedEnrollments: receivers.filter(row => ![UNASSIGNED_RECEIVER_KEY, NO_INITIAL_PAYMENT_KEY, INVALID_REGISTRATION_DATE_KEY].includes(row.receiverKey)).reduce((total, row) => total + row.enrollmentCount, 0), unassignedEnrollments: receivers.find(row => row.receiverKey === UNASSIGNED_RECEIVER_KEY)?.enrollmentCount ?? 0, noInitialPaymentEnrollments: receivers.find(row => row.receiverKey === NO_INITIAL_PAYMENT_KEY)?.enrollmentCount ?? 0, invalidRegistrationDateEnrollments: receivers.find(row => row.receiverKey === INVALID_REGISTRATION_DATE_KEY)?.enrollmentCount ?? 0, receiverCount: receivers.filter(row => ![UNASSIGNED_RECEIVER_KEY, NO_INITIAL_PAYMENT_KEY, INVALID_REGISTRATION_DATE_KEY].includes(row.receiverKey)).length },
    receivers,
    reconciliation: { receiverTotalsMatchEligible, universityTotalsMatchReceivers },
    diagnostics: { invalidRegistrationDates, invalidPaymentDates, duplicateEnrollmentIds, malformedEnrollmentIds, malformedReceiverNames, missingUniversities },
    generatedAt: new Date().toISOString(),
  };
}

function planningRows(rows: JoinedEnrollment[]): DashboardPlanningRow[] {
  const grouped = new Map<string, JoinedEnrollment[]>();
  for (const row of rows) { const key = [row.programScope, row.track, row.packageLabel, row.exactHours, row.deliveryMode].join("\u0001"); grouped.set(key, [...(grouped.get(key) ?? []), row]); }
  return [...grouped.values()].map(items => { const first = items[0]; return { programScope: first.programScope, track: first.track, packageLabel: first.packageLabel, exactHours: first.exactHours, deliveryMode: first.deliveryMode, totalEnrollments: items.length, uniqueStudents: new Set(items.map(item => item.academyStudentId)).size, fullyPaid: items.filter(item => paidStatus(item.paymentStatus) === "fully paid").length, partiallyPaid: items.filter(item => paidStatus(item.paymentStatus) === "partially paid").length, withRemaining: items.filter(item => item.remaining > 0).length, expectedRevenue: sum(items, item => item.finalContractPrice), collected: sum(items, item => item.collected), remaining: sum(items, item => item.remaining) }; }).sort((a, b) => b.totalEnrollments - a.totalEnrollments || a.programScope.localeCompare(b.programScope));
}

function matches(row: JoinedEnrollment, filters: Partial<DashboardFilters>) { return selected(filters.programScope, row.programScope) && selected(filters.studentUniversity, row.studentUniversity) && selected(filters.college, row.college) && selected(filters.track, row.track) && selected(filters.packageLabel, row.packageLabel) && selected(filters.exactHours, String(row.exactHours)) && selectedNormalized(filters.paymentStatus, paidStatus(row.paymentStatus), paidStatus) && selectedNormalized(filters.deliveryMode, row.deliveryMode, normalizeDeliveryMode) && selected(filters.intake, row.intake); }
function selected(values: string[] | undefined, value: string) { return !values?.length || values.includes(value); }
function selectedNormalized(values: string[] | undefined, value: string, normalizeValue: (value: string) => string) { return !values?.length || values.some(item => normalizeValue(item) === value); }
function chart(rows: JoinedEnrollment[], label: (row: JoinedEnrollment) => string): DashboardChartItem[] { const counts = new Map<string, number>(); for (const row of rows) { const key = label(row); if (key) counts.set(key, (counts.get(key) ?? 0) + 1); } return [...counts].map(([key, value]) => ({ label: key, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)); }
function unique(values: string[]) { return [...new Set(values.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); }
function sum<T>(rows: T[], value: (row: T) => number) { return rows.reduce((total, row) => total + value(row), 0); }
function clean(value: unknown) { return String(value ?? "").trim(); }
function normalize(value: unknown) { return clean(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function paidStatus(value: unknown) { return normalize(value); }
function active(value: unknown) { return ["true", "yes", "1", "active"].includes(normalize(value)); }
function amount(value: unknown) { const parsed = Number(clean(value).replace(/[^0-9.-]/g, "")); return Number.isFinite(parsed) ? parsed : 0; }

function normalizeReceiverFilters(filters: Partial<ReceiverAcquisitionFilters>, currentIntake: string): ReceiverAcquisitionFilters {
  const intake = clean(filters.intake);
  return {
    intake: intake === ALL_INTAKES ? null : intake || currentIntake || null,
    dateFrom: validQueryDate(filters.dateFrom) ? clean(filters.dateFrom) : null,
    dateTo: validQueryDate(filters.dateTo) ? clean(filters.dateTo) : null,
    university: clean(filters.university) || null,
    receiver: clean(filters.receiver) || null,
  };
}

function receiverScopeMatches(row: EligibleEnrollment, filters: ReceiverAcquisitionFilters) {
  if (filters.intake && row.intake !== filters.intake) return false;
  if (filters.university && row.university !== filters.university) return false;
  if (dateFilterNeedsValidRegistration(filters) && row.registrationDay === null) return true;
  const from = filters.dateFrom ? parseDateDay(filters.dateFrom) : null;
  const to = filters.dateTo ? parseDateDay(filters.dateTo) : null;
  if (from !== null && row.registrationDay !== null && row.registrationDay < from) return false;
  if (to !== null && row.registrationDay !== null && row.registrationDay > to) return false;
  return true;
}

function isEligibleEnrollmentStatus(value: unknown) {
  const status = normalize(value);
  return status !== "cancelled" && status !== "canceled" && status !== "withdrawn";
}

function getInitialPayment(rows: Array<PaymentReceiptRow & { _rowNumber: number }>) {
  if (!rows.length) return undefined;
  return [...rows].sort((left, right) => {
    const leftDay = parseDateDay(left.Payment_Date);
    const rightDay = parseDateDay(right.Payment_Date);
    if (leftDay !== null && rightDay !== null && leftDay !== rightDay) return leftDay - rightDay;
    if (leftDay !== null && rightDay === null) return -1;
    if (leftDay === null && rightDay !== null) return 1;
    return left._rowNumber - right._rowNumber;
  })[0];
}

function canonicalReceiver(value: unknown) {
  const name = clean(value).replace(/\s+/g, " ");
  return { key: name.toLowerCase(), name };
}

function percentage(value: number, total: number) {
  return total > 0 ? Math.round(value / total * 1000) / 10 : 0;
}

function dateFilterNeedsValidRegistration(filters: ReceiverAcquisitionFilters) {
  return Boolean(filters.dateFrom || filters.dateTo);
}

function validQueryDate(value: unknown) {
  const text = clean(value);
  return Boolean(text && parseDateDay(text) !== null);
}

function parseDateDay(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) return dateDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (slash) {
    const first = Number(slash[1]); const second = Number(slash[2]); const year = Number(slash[3]);
    return dateDay(year, first > 12 ? second : first, first > 12 ? first : second);
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return dateDay(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  return null;
}

function dateDay(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return Math.floor(date.getTime() / 86400000);
}
