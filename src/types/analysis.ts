export type AnalysisSummary = {
  expectedRevenue: number;
  collected: number;
  remaining: number;
  studentCount: number;
  enrollmentCount: number;
  batchCount: number;
  groupsCount: number;
  fullyPaidCount: number;
  withRemainingCount: number;
};

export type AnalysisBatchRow = AnalysisSummary & {
  batchId: string;
  batchName: string;
  batchLocation: string;
  deliveryTrack: string;
  startDate: string;
  endDate: string;
  status: string;
};

export type AnalysisLocationRow = AnalysisSummary & {
  batchLocation: string;
};

export type AnalysisFilters = {
  batchLocations: string[];
  batches: Array<{ id: string; name: string }>;
  tracks: string[];
  paymentStatuses: string[];
  studentUniversities: string[];
  groups: Array<{ id: string; name: string }>;
};

export type AnalysisData = {
  configurationWarning: string;
  global: AnalysisSummary;
  batchRows: AnalysisBatchRow[];
  locationRows: AnalysisLocationRow[];
  unassigned: AnalysisSummary;
  filters: AnalysisFilters;
  enrollmentFacts: Array<{
    enrollmentId: string;
    academyStudentId: string;
    batchId: string;
    batchName: string;
    batchLocation: string;
    deliveryTrack: string;
    groupId: string;
    groupName: string;
    studentUniversity: string;
    paymentStatus: string;
    expectedRevenue: number;
    collected: number;
    remaining: number;
  }>;
};
