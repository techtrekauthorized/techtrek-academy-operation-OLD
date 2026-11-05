export type RecordedSessionDto = {
  id: string;
  attendanceSessionId: string;
  attendanceCode: string;
  recordingTitle: string;
  provider: string;
  videoUrl: string;
  videoId: string;
  sessionNumber: string;
  levelCode: string;
  publishStatus: string;
  availableFrom: string;
  availableTo: string;
  isActive: string;
  notes: string;
  accessGroupsCount: number;
  groupIds: string[];
};

export type RecordedAttendanceSessionOption = {
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

export type RecordedBatchOption = {
  id: string;
  name: string;
  location: string;
};

export type RecordedGroupOption = {
  id: string;
  name: string;
  batchId: string;
  levelSelection: string;
  level1AttendanceMode: string;
  level2AttendanceMode: string;
  capacity: string;
  status: string;
};

export type RecordedSessionsFormData = {
  sessions: RecordedAttendanceSessionOption[];
  batches: RecordedBatchOption[];
  groups: RecordedGroupOption[];
};

export type RecordedSessionsExistingData = {
  recordings: RecordedSessionDto[];
};

export type RecordedSessionsData = RecordedSessionsFormData & RecordedSessionsExistingData;
