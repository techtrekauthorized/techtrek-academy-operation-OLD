export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";
export type DeliveryMode = "Online" | "Offline" | "Hybrid";
export type AttendanceStatus = "Present" | "Late" | "Absent" | "Excused";
export type PaymentStatus = "Unpaid" | "Partially Paid" | "Fully Paid";
export type PaymentType = "Deposit" | "Installment" | "Final Payment" | "Full Payment";
export type ReceiptStatus = "Pending" | "Generated" | "Failed" | "Voided" | "Replaced";
export type ReceiptSource = "Legacy" | "Streamlit Generator";
export type CertificateEligibility = "Ready" | "Blocked: Attendance" | "Blocked: Tasks" | "Blocked: Score" | "Blocked: Payment";

export type PricingPlan = {
  id: string;
  scopeType: "UNIVERSITY" | "PROGRAM_CATEGORY";
  universityOrScopeName: string;
  trackDisplayName: string;
  normalizedTrackName: string;
  packageLabel: string;
  exactHours: number;
  durationDays: number;
  listPrice: number;
  currency: "EGP";
  isActive: boolean;
  validFrom: string;
  validTo: string | null;
  lastUpdated: string;
};

export type Student = {
  id: string;
  academyStudentId: string;
  universityStudentId: string;
  arabicFullName: string;
  englishFullName: string;
  phone: string;
  email: string;
  university: string;
  college: string;
  department: string;
};

export type Enrollment = {
  id: string;
  code: string;
  studentId: string;
  intake: string;
  university: string;
  track: string;
  normalizedTrackName: string;
  packageLabel: string;
  exactHours: number;
  deliveryMode: DeliveryMode;
  groupId: string;
  instructorId: string;
  pricingPlanId: string;
  cataloguePrice: number;
  discount: number;
  discountReason: string;
  finalContractPrice: number;
  attendancePercentage: number;
  academicCompletion: number;
  finalScore: number;
  certificateEligibility: CertificateEligibility;
  certificateFulfillment: "Not Ready" | "Ready" | "Prepared" | "Delivered";
};

export type Group = {
  id: string;
  code: string;
  name: string;
  university: string;
  intake: string;
  trackId: string;
  track: string;
  normalizedTrackName: string;
  packageLabel: string;
  exactHours: number;
  deliveryMode: DeliveryMode;
  instructorId: string;
  instructor: string;
  mentorIds: string[];
  mentors: string[];
  students: number;
  capacity: number;
  startDate: string;
  endDate: string;
  venue: string;
  onlineMeetingLink: string;
  cataloguePrice: number;
  attendance: number;
  collections: number;
  profitability: number;
  nextSession: string;
};

export type Session = {
  id: string;
  title: string;
  topic: string;
  date: string;
  time: string;
  endTime: string;
  groups: string[];
  track: string;
  instructorId: string;
  instructor: string;
  mentorIds: string[];
  mentors: string[];
  mode: DeliveryMode;
  venue: string;
  onlineMeetingLink: string;
  attendanceStatus: "Not Started" | "Draft" | "Finalized";
  status: "Scheduled" | "In Progress" | "Completed" | "Conflict" | "Cancelled" | "Rescheduled";
  activityHistory: Array<{ action: string; at: string; by: string }>;
};

export type Staff = {
  id: string;
  name: string;
  initials: string;
  role: "Instructor" | "Mentor" | "Coordinator";
  specialty: string;
  rate: number;
  approvedHours: number;
  accrued: number;
  paid: number;
  groups: string[];
  status: "Active" | "On Leave";
};

export type Payment = {
  id: string;
  enrollmentId: string;
  studentId: string;
  date: string;
  type: PaymentType;
  method: "Cash" | "InstaPay" | "Card" | "Bank Transfer";
  reference: string;
  notes: string;
  receiverName: string;
  amount: number;
  totalPaidAfter: number;
  remainingAfter: number;
};

export type Receipt = {
  id: string;
  receiptNumber: string;
  receiptStatus: ReceiptStatus;
  receiptSource: ReceiptSource;
  receiptLink: string;
  pdfDownloadLink: string;
  generatedAt: string;
  generatedBy: string;
  paymentId: string;
  enrollmentCode: string;
};

export type StreamlitReceiptPayload = {
  receipt_number: string;
  date: string;
  student_name: string;
  academy_student_id: string;
  university_student_id: string;
  phone: string;
  student_gmail: string;
  university: string;
  faculty_college: string;
  department: string;
  intake: string;
  track_name: string;
  package_label: string;
  credit_hours: number;
  delivery_mode: DeliveryMode;
  group: string;
  required_amount: number;
  paid_amount: number;
  total_paid_after_payment: number;
  remaining_amount: number;
  payment_method: Payment["method"];
  payment_type: PaymentType;
  payment_status: PaymentStatus;
  notes: string;
  receiver_name: string;
};

export type Assessment = {
  id: string;
  title: string;
  intake: string;
  university: string;
  track: string;
  groupId: string;
  type: "Task" | "Quiz" | "Project" | "Midterm" | "Final" | "Participation";
  maxScore: number;
  minimumRequiredScore: number;
  requiredForCertificate: boolean;
  dueDate: string;
  notes: string;
};

export type AcademicRecord = {
  id: string;
  enrollmentId: string;
  assessmentId: string;
  completed: boolean;
  score: number;
  notes: string;
  updatedBy: string;
  updatedAt: string;
};

export type Expense = {
  id: string;
  date: string;
  category: string;
  vendor: string;
  description: string;
  amount: number;
  linkedTo: string;
  status: "Approved" | "Pending" | "Rejected";
};
