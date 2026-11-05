export type GroupRosterStudent = {
  enrollmentId: string;
  academyStudentId: string;
  universityStudentId: string;
  studentName: string;
  phone: string;
  email: string;
  studentUniversity: string;
  college: string;
  soldTrack: string;
  packageLabel: string;
  creditHours: number;
  deliveryMode: string;
  levelSelection: string;
  paymentStatus: string;
  enteredWhatsAppGroup: boolean;
};

export type GroupRosterGroup = {
  id: string;
  name: string;
  batchId: string;
  batchName: string;
  deliveryTrackId: string;
  deliveryTrackName: string;
  levelSelection: string;
  level1AttendanceMode: string;
  level2AttendanceMode: string;
  status: string;
  capacity: number;
  assignedStudentsCount: number;
  whatsappEnteredCount: number;
  whatsappMissingCount: number;
  students: GroupRosterStudent[];
};

export type GroupRostersData = {
  summary: {
    totalGroups: number;
    totalPlacedStudents: number;
    enteredWhatsApp: number;
    notEnteredWhatsApp: number;
  };
  groups: GroupRosterGroup[];
};
