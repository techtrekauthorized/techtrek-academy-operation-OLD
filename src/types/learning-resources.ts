export type LearningResourceDto = {
  id: string;
  batchId: string;
  batchName: string;
  relatedAttendanceSessionId: string;
  relatedSessionLabel: string;
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
  createdAt: string;
  createdBy: string;
  notes: string;
  activeGroupsCount: number;
  groupIds: string[];
};

export type LearningResourceBatchOption = {
  id: string;
  name: string;
  location: string;
};

export type LearningResourceGroupOption = {
  id: string;
  name: string;
  batchId: string;
  levelSelection: string;
  level1AttendanceMode: string;
  level2AttendanceMode: string;
  capacity: string;
  status: string;
};

export type LearningResourceSessionOption = {
  id: string;
  attendanceCode: string;
  batchId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  sessionNumber: string;
  sessionTitle: string;
  track: string;
  levelCode: string;
};

export type LearningResourcesFormData = {
  sessions: LearningResourceSessionOption[];
  batches: LearningResourceBatchOption[];
  groups: LearningResourceGroupOption[];
};

export type LearningResourcesExistingData = {
  resources: LearningResourceDto[];
};

export type LearningResourcesData = LearningResourcesFormData & LearningResourcesExistingData;

export type StudentPortalLearningResourceSummary = {
  resourceId: string;
  resourceTitle: string;
  resourceDescription: string;
  resourceCategory: string;
  relatedSessionLabel: string;
  availableFrom: string;
  availableTo: string;
};

export type StudentPortalLearningResourcePlayback = StudentPortalLearningResourceSummary & {
  provider: "GoogleDrive";
  videoId: string;
  studentName: string;
  studentId: string;
};
