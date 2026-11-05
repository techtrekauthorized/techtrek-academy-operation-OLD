export type SessionMaterialDto = {
  id: string;
  attendanceSessionId: string;
  attendanceCode: string;
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
  isActive: string;
  notes: string;
  accessGroupsCount: number;
  groupIds: string[];
};

export type SessionMaterialSessionOption = {
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

export type SessionMaterialBatchOption = {
  id: string;
  name: string;
  location: string;
};

export type SessionMaterialGroupOption = {
  id: string;
  name: string;
  batchId: string;
  levelSelection: string;
  level1AttendanceMode: string;
  level2AttendanceMode: string;
  capacity: string;
  status: string;
};

export type SessionMaterialsFormData = {
  sessions: SessionMaterialSessionOption[];
  batches: SessionMaterialBatchOption[];
  groups: SessionMaterialGroupOption[];
};

export type SessionMaterialsExistingData = {
  materials: SessionMaterialDto[];
};

export type SessionMaterialsData = SessionMaterialsFormData & SessionMaterialsExistingData;
