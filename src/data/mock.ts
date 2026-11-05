import type { AcademicRecord, Assessment, Enrollment, Expense, Group, Payment, PaymentStatus, PaymentType, Receipt, Session, Staff, Student, StreamlitReceiptPayload } from "@/types";

export const money = (value: number) => new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(value);
export const currentUser = { id: "USR-001", name: "Nadia Fawzy", role: "Admin" as const };
export const intakes = ["Summer 2026", "Winter 2026", "Fall 2025"];
export const universities = ["Alexandria National University", "Alexandria University", "AIET", "Benha National University"];
export const colleges = ["Engineering", "Computer Science", "Artificial Intelligence", "Business", "Science"];
export const tracks = ["Cyber Security (SOC)", "Artificial Intelligence AI", "Advanced Data Science", "Frontend Development (React)"];
export const packages = ["Short Diploma", "Professional Diploma", "Intensive Diploma"];

export const students: Student[] = [
  { id: "STU-001", academyStudentId: "TTA-2026-000145", universityStudentId: "BNU-25145", arabicFullName: "أحمد علي حسن", englishFullName: "Ahmed Ali Hassan", phone: "+20 100 145 2026", email: "ahmed.ali@gmail.com", university: "Benha National University", college: "Artificial Intelligence", department: "Intelligent Systems" },
  { id: "STU-002", academyStudentId: "TTA-2026-000184", universityStudentId: "ANU-30184", arabicFullName: "مريم حسن محمد", englishFullName: "Mariam Hassan Mohamed", phone: "+20 111 184 2026", email: "mariam.hassan@gmail.com", university: "Alexandria National University", college: "Computer Science", department: "Data Science" },
  { id: "STU-003", academyStudentId: "TTA-2026-000217", universityStudentId: "AIET-40217", arabicFullName: "عمر فوزي نبيل", englishFullName: "Omar Fawzy Nabil", phone: "+20 122 217 2026", email: "omar.fawzy@gmail.com", university: "AIET", college: "Engineering", department: "Computer Engineering" },
  { id: "STU-004", academyStudentId: "TTA-2026-000263", universityStudentId: "AU-51263", arabicFullName: "نور السيد أحمد", englishFullName: "Nour El-Sayed Ahmed", phone: "+20 155 263 2026", email: "nour.elsayed@gmail.com", university: "Alexandria University", college: "Science", department: "Information Technology" },
];

export const staff: Staff[] = [
  { id: "ST-041", name: "Ahmed Khalil", initials: "AK", role: "Instructor", specialty: "Full Stack", rate: 650, approvedHours: 42, accrued: 27300, paid: 20000, groups: ["SOC-BNU-01"], status: "Active" },
  { id: "ST-052", name: "Tarek Mansour", initials: "TM", role: "Instructor", specialty: "Cyber Security", rate: 700, approvedHours: 38, accrued: 26600, paid: 26600, groups: ["SOC-BNU-01", "SOC-ANU-01"], status: "Active" },
  { id: "ST-067", name: "Mona Ibrahim", initials: "MI", role: "Instructor", specialty: "AI & Data Science", rate: 700, approvedHours: 34, accrued: 23800, paid: 16000, groups: ["AI-BNU-02", "DS-AIET-01"], status: "Active" },
  { id: "ST-072", name: "Salma Tarek", initials: "ST", role: "Mentor", specialty: "Frontend Engineering", rate: 280, approvedHours: 46, accrued: 12880, paid: 8000, groups: ["AI-BNU-02"], status: "Active" },
  { id: "ST-084", name: "Hana Magdy", initials: "HM", role: "Mentor", specialty: "Security Operations", rate: 300, approvedHours: 32, accrued: 9600, paid: 9600, groups: ["SOC-BNU-01", "SOC-ANU-01"], status: "Active" },
  { id: "ST-093", name: "Rana Salem", initials: "RS", role: "Coordinator", specialty: "Program Operations", rate: 250, approvedHours: 48, accrued: 12000, paid: 10000, groups: ["SOC-BNU-01", "AI-BNU-02"], status: "On Leave" },
];

export const groups: Group[] = [
  { id: "GRP-001", code: "SOC-BNU-01", name: "SOC BNU 01 · Sun/Tue", university: "Benha National University", intake: "Summer 2026", trackId: "cyber-security-soc", track: "Cyber Security (SOC)", normalizedTrackName: "Cyber Security (SOC)", packageLabel: "Short Diploma", exactHours: 64, deliveryMode: "Offline", instructorId: "ST-052", instructor: "Tarek Mansour", mentorIds: ["ST-084"], mentors: ["Hana Magdy"], students: 26, capacity: 30, startDate: "2026-07-05", endDate: "2026-08-25", venue: "BNU Cyber Lab", onlineMeetingLink: "", cataloguePrice: 2500, attendance: 94, collections: 56200, profitability: 38, nextSession: "Sun, 10:00 AM" },
  { id: "GRP-002", code: "AI-BNU-02", name: "AI BNU 02 · Mon/Wed", university: "Benha National University", intake: "Summer 2026", trackId: "artificial-intelligence", track: "Artificial Intelligence AI", normalizedTrackName: "Artificial Intelligence AI", packageLabel: "Professional Diploma", exactHours: 120, deliveryMode: "Hybrid", instructorId: "ST-067", instructor: "Mona Ibrahim", mentorIds: ["ST-072"], mentors: ["Salma Tarek"], students: 24, capacity: 28, startDate: "2026-07-06", endDate: "2026-10-05", venue: "BNU Lab 2", onlineMeetingLink: "https://meet.google.com/ai-bnu-02", cataloguePrice: 3500, attendance: 91, collections: 68100, profitability: 35, nextSession: "Mon, 5:00 PM" },
  { id: "GRP-003", code: "SOC-ANU-01", name: "SOC ANU 01 · Fri/Sat", university: "Alexandria National University", intake: "Summer 2026", trackId: "cyber-security-soc", track: "Cyber Security (SOC)", normalizedTrackName: "Cyber Security (SOC)", packageLabel: "Intensive Diploma", exactHours: 140, deliveryMode: "Hybrid", instructorId: "ST-052", instructor: "Tarek Mansour", mentorIds: ["ST-084"], mentors: ["Hana Magdy"], students: 28, capacity: 30, startDate: "2026-07-04", endDate: "2026-10-15", venue: "ANU Hall C", onlineMeetingLink: "https://meet.google.com/soc-anu-01", cataloguePrice: 4000, attendance: 96, collections: 102000, profitability: 42, nextSession: "Fri, 2:00 PM" },
  { id: "GRP-004", code: "DS-AIET-01", name: "Data Science AIET 01", university: "AIET", intake: "Summer 2026", trackId: "advanced-data-science", track: "Advanced Data Science", normalizedTrackName: "Advanced Data Science", packageLabel: "Short Diploma", exactHours: 60, deliveryMode: "Online", instructorId: "ST-067", instructor: "Mona Ibrahim", mentorIds: ["ST-072"], mentors: ["Salma Tarek"], students: 20, capacity: 25, startDate: "2026-07-08", endDate: "2026-08-19", venue: "Online", onlineMeetingLink: "https://meet.google.com/ds-aiet-01", cataloguePrice: 2500, attendance: 89, collections: 43800, profitability: 31, nextSession: "Wed, 7:00 PM" },
  { id: "GRP-005", code: "REACT-AU-01", name: "React AU 01", university: "Alexandria University", intake: "Summer 2026", trackId: "frontend-react", track: "Frontend Development (React)", normalizedTrackName: "Frontend Development (React)", packageLabel: "Short Diploma", exactHours: 60, deliveryMode: "Offline", instructorId: "ST-041", instructor: "Ahmed Khalil", mentorIds: ["ST-072"], mentors: ["Salma Tarek"], students: 18, capacity: 24, startDate: "2026-07-09", endDate: "2026-08-20", venue: "AU Lab 4", onlineMeetingLink: "", cataloguePrice: 1000, attendance: 87, collections: 16500, profitability: 28, nextSession: "Thu, 4:00 PM" },
];

export const enrollments: Enrollment[] = [
  { id: "ENR-001", code: "ENR-S26-00145-SOC", studentId: "STU-001", intake: "Summer 2026", university: "Benha National University", track: "Cyber Security (SOC)", normalizedTrackName: "Cyber Security (SOC)", packageLabel: "Short Diploma", exactHours: 64, deliveryMode: "Offline", groupId: "GRP-001", instructorId: "ST-052", pricingPlanId: "PRICE-072", cataloguePrice: 2500, discount: 0, discountReason: "", finalContractPrice: 2500, attendancePercentage: 96, academicCompletion: 100, finalScore: 91, certificateEligibility: "Ready", certificateFulfillment: "Ready" },
  { id: "ENR-002", code: "ENR-S26-00145-AI", studentId: "STU-001", intake: "Summer 2026", university: "Benha National University", track: "Artificial Intelligence AI", normalizedTrackName: "Artificial Intelligence AI", packageLabel: "Professional Diploma", exactHours: 120, deliveryMode: "Hybrid", groupId: "GRP-002", instructorId: "ST-067", pricingPlanId: "PRICE-076", cataloguePrice: 3500, discount: 300, discountReason: "Multi-track student scholarship", finalContractPrice: 3200, attendancePercentage: 88, academicCompletion: 70, finalScore: 78, certificateEligibility: "Blocked: Payment", certificateFulfillment: "Not Ready" },
  { id: "ENR-003", code: "ENR-S26-00184-SOC", studentId: "STU-002", intake: "Summer 2026", university: "Alexandria National University", track: "Cyber Security (SOC)", normalizedTrackName: "Cyber Security (SOC)", packageLabel: "Intensive Diploma", exactHours: 140, deliveryMode: "Hybrid", groupId: "GRP-003", instructorId: "ST-052", pricingPlanId: "PRICE-008", cataloguePrice: 4000, discount: 500, discountReason: "University partner discount", finalContractPrice: 3500, attendancePercentage: 94, academicCompletion: 82, finalScore: 84, certificateEligibility: "Blocked: Tasks", certificateFulfillment: "Not Ready" },
  { id: "ENR-004", code: "ENR-S26-00217-DS", studentId: "STU-003", intake: "Summer 2026", university: "AIET", track: "Advanced Data Science", normalizedTrackName: "Advanced Data Science", packageLabel: "Short Diploma", exactHours: 60, deliveryMode: "Online", groupId: "GRP-004", instructorId: "ST-067", pricingPlanId: "PRICE-040", cataloguePrice: 2500, discount: 0, discountReason: "", finalContractPrice: 2500, attendancePercentage: 72, academicCompletion: 61, finalScore: 69, certificateEligibility: "Blocked: Attendance", certificateFulfillment: "Not Ready" },
  { id: "ENR-005", code: "ENR-S26-00263-REACT", studentId: "STU-004", intake: "Summer 2026", university: "Alexandria University", track: "Frontend Development (React)", normalizedTrackName: "Frontend Development (React)", packageLabel: "Short Diploma", exactHours: 60, deliveryMode: "Offline", groupId: "GRP-005", instructorId: "ST-041", pricingPlanId: "PRICE-029", cataloguePrice: 1000, discount: 0, discountReason: "", finalContractPrice: 1000, attendancePercentage: 90, academicCompletion: 100, finalScore: 94, certificateEligibility: "Ready", certificateFulfillment: "Prepared" },
];

export const payments: Payment[] = [
  { id: "PAY-1001", enrollmentId: "ENR-001", studentId: "STU-001", date: "2026-06-10", type: "Deposit", method: "InstaPay", reference: "IP-44102", notes: "Initial deposit", receiverName: "Nadia Fawzy", amount: 1000, totalPaidAfter: 1000, remainingAfter: 1500 },
  { id: "PAY-1002", enrollmentId: "ENR-001", studentId: "STU-001", date: "2026-06-24", type: "Final Payment", method: "Cash", reference: "CASH-180", notes: "Balance cleared", receiverName: "Heba Ali", amount: 1500, totalPaidAfter: 2500, remainingAfter: 0 },
  { id: "PAY-1003", enrollmentId: "ENR-002", studentId: "STU-001", date: "2026-06-12", type: "Deposit", method: "Card", reference: "CARD-9281", notes: "Opening payment", receiverName: "Nadia Fawzy", amount: 1200, totalPaidAfter: 1200, remainingAfter: 2000 },
  { id: "PAY-1004", enrollmentId: "ENR-002", studentId: "STU-001", date: "2026-07-01", type: "Installment", method: "InstaPay", reference: "IP-44991", notes: "Second installment", receiverName: "Heba Ali", amount: 800, totalPaidAfter: 2000, remainingAfter: 1200 },
  { id: "PAY-1005", enrollmentId: "ENR-003", studentId: "STU-002", date: "2026-06-18", type: "Full Payment", method: "Bank Transfer", reference: "BNK-30618", notes: "Partner payment", receiverName: "Heba Ali", amount: 3500, totalPaidAfter: 3500, remainingAfter: 0 },
  { id: "PAY-1006", enrollmentId: "ENR-004", studentId: "STU-003", date: "2026-06-20", type: "Deposit", method: "Cash", reference: "CASH-204", notes: "", receiverName: "Nadia Fawzy", amount: 1000, totalPaidAfter: 1000, remainingAfter: 1500 },
  { id: "PAY-1007", enrollmentId: "ENR-005", studentId: "STU-004", date: "2026-06-22", type: "Full Payment", method: "InstaPay", reference: "IP-43002", notes: "", receiverName: "Heba Ali", amount: 1000, totalPaidAfter: 1000, remainingAfter: 0 },
];

export const receipts: Receipt[] = payments.map((payment, index) => ({
  id: `RCT-${index + 1}`,
  receiptNumber: index < 3 ? `LEGACY-${982 + index}` : `TTR-2026-${String(1001 + index).padStart(4, "0")}`,
  receiptStatus: "Generated",
  receiptSource: index < 3 ? "Legacy" : "Streamlit Generator",
  receiptLink: `https://receipts.techtrek.local/${payment.id}`,
  pdfDownloadLink: `https://receipts.techtrek.local/${payment.id}.pdf`,
  generatedAt: `${payment.date}T14:30:00`,
  generatedBy: payment.receiverName,
  paymentId: payment.id,
  enrollmentCode: enrollments.find(enrollment => enrollment.id === payment.enrollmentId)?.code ?? "",
}));

export const assessments: Assessment[] = [
  { id: "ASM-001", title: "SOC Investigation Project", intake: "Summer 2026", university: "Benha National University", track: "Cyber Security (SOC)", groupId: "GRP-001", type: "Project", maxScore: 100, minimumRequiredScore: 70, requiredForCertificate: true, dueDate: "2026-08-12", notes: "Final incident investigation report" },
  { id: "ASM-002", title: "AI Fundamentals Quiz", intake: "Summer 2026", university: "Benha National University", track: "Artificial Intelligence AI", groupId: "GRP-002", type: "Quiz", maxScore: 40, minimumRequiredScore: 24, requiredForCertificate: true, dueDate: "2026-08-05", notes: "" },
  { id: "ASM-003", title: "Security Operations Midterm", intake: "Summer 2026", university: "Alexandria National University", track: "Cyber Security (SOC)", groupId: "GRP-003", type: "Midterm", maxScore: 60, minimumRequiredScore: 36, requiredForCertificate: true, dueDate: "2026-08-20", notes: "" },
  { id: "ASM-004", title: "React Capstone", intake: "Summer 2026", university: "Alexandria University", track: "Frontend Development (React)", groupId: "GRP-005", type: "Final", maxScore: 100, minimumRequiredScore: 70, requiredForCertificate: true, dueDate: "2026-08-18", notes: "Frontend capstone review" },
];

export const academicRecords: AcademicRecord[] = enrollments.map((enrollment, index) => ({ id: `GRADE-${index + 1}`, enrollmentId: enrollment.id, assessmentId: assessments[Math.min(index, assessments.length - 1)].id, completed: index !== 2, score: [91, 31, 42, 28, 94][index], notes: index === 2 ? "Required task remains incomplete" : "On track", updatedBy: "Rana Salem", updatedAt: `2026-07-0${index + 1} 14:20` }));

export const sessions: Session[] = [
  { id: "SES-0901", title: "SOC Monitoring & Triage", topic: "Security Operations", date: "2026-07-05", time: "10:00", endTime: "12:00", groups: ["GRP-001", "GRP-003"], track: "Cyber Security (SOC)", instructorId: "ST-052", instructor: "Tarek Mansour", mentorIds: ["ST-084"], mentors: ["Hana Magdy"], mode: "Hybrid", venue: "BNU Cyber Lab + Online", onlineMeetingLink: "https://meet.google.com/soc-shared-01", attendanceStatus: "Draft", status: "Scheduled", activityHistory: [{ action: "Shared session created", at: "2026-07-01 10:20", by: "Rana Salem" }, { action: "ANU group linked", at: "2026-07-02 09:10", by: "Rana Salem" }] },
  { id: "SES-0902", title: "AI Search Algorithms", topic: "Artificial Intelligence", date: "2026-07-06", time: "17:00", endTime: "19:00", groups: ["GRP-002"], track: "Artificial Intelligence AI", instructorId: "ST-067", instructor: "Mona Ibrahim", mentorIds: ["ST-072"], mentors: ["Salma Tarek"], mode: "Hybrid", venue: "BNU Lab 2", onlineMeetingLink: "https://meet.google.com/ai-bnu-02", attendanceStatus: "Not Started", status: "Conflict", activityHistory: [{ action: "Conflict detected", at: "2026-07-02 12:00", by: "System" }] },
  { id: "SES-0903", title: "Data Pipeline Workshop", topic: "Data Engineering", date: "2026-07-08", time: "19:00", endTime: "21:00", groups: ["GRP-004"], track: "Advanced Data Science", instructorId: "ST-067", instructor: "Mona Ibrahim", mentorIds: ["ST-072"], mentors: ["Salma Tarek"], mode: "Online", venue: "Online", onlineMeetingLink: "https://meet.google.com/ds-aiet-01", attendanceStatus: "Not Started", status: "Scheduled", activityHistory: [{ action: "Session created", at: "2026-07-01 16:30", by: "Omar Atef" }] },
  { id: "SES-0904", title: "React State Patterns", topic: "Frontend Engineering", date: "2026-07-09", time: "16:00", endTime: "18:00", groups: ["GRP-005"], track: "Frontend Development (React)", instructorId: "ST-041", instructor: "Ahmed Khalil", mentorIds: ["ST-072"], mentors: ["Salma Tarek"], mode: "Offline", venue: "AU Lab 4", onlineMeetingLink: "", attendanceStatus: "Finalized", status: "Completed", activityHistory: [{ action: "Attendance finalized", at: "2026-07-09 18:15", by: "Yara Samir" }] },
];

export const expenses: Expense[] = [
  { id: "EXP-284", date: "2026-06-28", category: "Venue", vendor: "The Workshop Hub", description: "July lab rental", amount: 18000, linkedTo: "SOC-BNU-01", status: "Approved" },
  { id: "EXP-285", date: "2026-06-29", category: "Materials", vendor: "Tech Supplies Co.", description: "Lab networking kits", amount: 7400, linkedTo: "SOC-ANU-01", status: "Approved" },
  { id: "EXP-286", date: "2026-07-01", category: "Software", vendor: "Cloud Labs", description: "Training environment credits", amount: 4800, linkedTo: "AI-BNU-02", status: "Pending" },
];

export const users = [
  { name: "Nadia Fawzy", email: "nadia@techtrek.academy", role: "Admin", status: "Active" },
  { name: "Rana Salem", email: "rana@techtrek.academy", role: "Operations Manager", status: "Active" },
  { name: "Omar Atef", email: "omar@techtrek.academy", role: "Program Coordinator", status: "Active" },
  { name: "Heba Ali", email: "heba@techtrek.academy", role: "Finance & Collections Officer", status: "Active" },
  { name: "Yara Samir", email: "yara@techtrek.academy", role: "Attendance / Data Entry Officer", status: "Invited" },
  { name: "Khaled Anwar", email: "khaled@techtrek.academy", role: "Auditor", status: "Active" },
];

export const getStudent = (studentId: string) => students.find(student => student.id === studentId);
export const getEnrollment = (enrollmentId: string) => enrollments.find(enrollment => enrollment.id === enrollmentId);
export const getStudentEnrollments = (studentId: string) => enrollments.filter(enrollment => enrollment.studentId === studentId);
export const getEnrollmentPayments = (enrollmentId: string) => payments.filter(payment => payment.enrollmentId === enrollmentId);
export const getPaymentReceipt = (paymentId: string) => receipts.find(receipt => receipt.paymentId === paymentId);
export const getEnrollmentReceipts = (enrollmentId: string) => getEnrollmentPayments(enrollmentId).map(payment => getPaymentReceipt(payment.id)).filter((receipt): receipt is Receipt => Boolean(receipt));
export const getGroup = (groupId: string) => groups.find(group => group.id === groupId);
export const getStaff = (staffId: string) => staff.find(member => member.id === staffId);
export const getStudentForEnrollment = (enrollment: Enrollment | string) => {
  const resolved = typeof enrollment === "string" ? getEnrollment(enrollment) : enrollment;
  return resolved ? getStudent(resolved.studentId)! : undefined;
};
export const totalPaid = (enrollmentId: string) => getEnrollmentPayments(enrollmentId).reduce((sum, payment) => sum + payment.amount, 0);
export const remainingBalance = (enrollment: Enrollment) => Math.max(0, enrollment.finalContractPrice - totalPaid(enrollment.id));
export const derivePaymentStatus = (enrollment: Enrollment, paid = totalPaid(enrollment.id)): PaymentStatus => paid <= 0 ? "Unpaid" : paid >= enrollment.finalContractPrice ? "Fully Paid" : "Partially Paid";
export const derivePaymentType = (before: number, amount: number, contractPrice: number): PaymentType => before === 0 && amount >= contractPrice ? "Full Payment" : before === 0 ? "Deposit" : before + amount >= contractPrice ? "Final Payment" : "Installment";

export function buildReceiptPayload(payment: Payment): StreamlitReceiptPayload {
  const enrollment = getEnrollment(payment.enrollmentId)!;
  const student = getStudent(payment.studentId)!;
  const group = getGroup(enrollment.groupId)!;
  const receipt = getPaymentReceipt(payment.id)!;
  return { receipt_number: receipt.receiptNumber, date: payment.date, student_name: student.englishFullName, academy_student_id: student.academyStudentId, university_student_id: student.universityStudentId, phone: student.phone, student_gmail: student.email, university: enrollment.university, faculty_college: student.college, department: student.department, intake: enrollment.intake, track_name: enrollment.track, package_label: enrollment.packageLabel, credit_hours: enrollment.exactHours, delivery_mode: enrollment.deliveryMode, group: group.code, required_amount: enrollment.finalContractPrice, paid_amount: payment.amount, total_paid_after_payment: payment.totalPaidAfter, remaining_amount: payment.remainingAfter, payment_method: payment.method, payment_type: payment.type, payment_status: derivePaymentStatus(enrollment, payment.totalPaidAfter), notes: payment.notes, receiver_name: payment.receiverName };
}

export const timeline = [
  { title: "Installment receipt generated", detail: "TTR-2026-1004 · ENR-S26-00145-AI", time: "1 Jul 2026, 3:42 PM" },
  { title: "Attendance marked present", detail: "SOC Monitoring & Triage", time: "28 Jun 2026, 12:04 PM" },
  { title: "Second enrollment added", detail: "Artificial Intelligence · Summer 2026", time: "12 Jun 2026, 11:15 AM" },
];
