export type DashboardFilters = {
  programScope: string[]; studentUniversity: string[]; college: string[]; track: string[]; packageLabel: string[];
  exactHours: string[]; paymentStatus: string[]; deliveryMode: string[]; intake: string[];
};

export type DashboardOverview = {
  totalExpectedRevenue: number; totalCollected: number; totalRemaining: number;
  totalStudents: number; totalEnrollments: number; fullyPaid: number; withRemaining: number;
};

export type DashboardPlanningRow = {
  programScope: string; track: string; packageLabel: string; exactHours: number; deliveryMode: string;
  totalEnrollments: number; uniqueStudents: number; fullyPaid: number; partiallyPaid: number;
  withRemaining: number; expectedRevenue: number; collected: number; remaining: number;
};

export type DashboardChartItem = { label: string; value: number };
export type DashboardMatrix = { tracks: string[]; rows: Array<{ programScope: string; counts: number[]; total: number }> };

export type ReceiverAcquisitionFilters = {
  intake: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  university: string | null;
  receiver: string | null;
};

export type ReceiverAcquisitionReceiver = {
  receiverKey: string;
  receiverName: string;
  enrollmentCount: number;
  percentage: number;
  universityCount: number;
  universities: Array<{ university: string; enrollmentCount: number; percentage: number }>;
};

export type ReceiverAcquisitionResponse = {
  filters: ReceiverAcquisitionFilters;
  availableFilters: { intakes: string[]; universities: string[]; receivers: Array<{ key: string; name: string }>; currentIntake: string };
  totals: { eligibleEnrollments: number; attributedEnrollments: number; unassignedEnrollments: number; noInitialPaymentEnrollments: number; invalidRegistrationDateEnrollments: number; receiverCount: number };
  receivers: ReceiverAcquisitionReceiver[];
  reconciliation: { receiverTotalsMatchEligible: boolean; universityTotalsMatchReceivers: boolean };
  diagnostics: { invalidRegistrationDates: number; invalidPaymentDates: number; duplicateEnrollmentIds: number; malformedEnrollmentIds: number; malformedReceiverNames: number; missingUniversities: number };
  generatedAt: string;
};

export type DashboardResponse = {
  global: DashboardOverview;
  filtered: { matchingEnrollments: number; uniqueStudents: number; fullyPaid: number; withRemaining: number };
  availableFilters: Record<keyof DashboardFilters, string[]>;
  planning: DashboardPlanningRow[];
  charts: { byTrack: DashboardChartItem[]; byProgramScope: DashboardChartItem[]; byPackage: DashboardChartItem[]; byDeliveryMode: DashboardChartItem[] };
  matrix: DashboardMatrix;
  receiverAcquisition: ReceiverAcquisitionResponse;
  diagnostics: { paymentRowsTotal: number; enrollmentPaidSnapshotTotal: number; difference: number; orphanPaymentRows: number; enrollmentsWithoutStudent: number };
};
