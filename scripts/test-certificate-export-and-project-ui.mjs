function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const exportColumns = ["Student_Name", "Certificate_ID", "Verification_Status", "Certificate_Name", "Issue_Date", "University", "College", "University_Student_ID", "Track", "Credit_Hours", "Delivery_Mode", "Roadmap_Name", "Roadmap_Version", "Learning_Roadmap", "Completed_Tasks", "Projects", "Verification_URL", "QR_Code_Value"];

function projectResult(grade, maxGrade, status) {
  if (status === "GRADED" && grade !== "" && Number.isFinite(Number(grade)) && Number.isFinite(Number(maxGrade)) && Number(maxGrade) > 0) {
    return `${Math.round((Number(grade) / Number(maxGrade)) * 1000) / 10}%`;
  }
  return "Submitted";
}

function hasCircularIndicator(result) {
  return result.endsWith("%");
}

function exportCertificateRow(row) {
  return [
    row.studentNameOnCertificate || row.studentName || "—",
    row.certificateId,
    row.certificateStatus === "ISSUED" ? "Verified" : "Revoked",
    row.certificateName || "—",
    row.issueDate || "—",
    row.university || "—",
    row.college || "—",
    row.universityStudentId || "—",
    row.track || "—",
    `${row.creditHours} H`,
    row.deliveryMode || "—",
    row.roadmapName || "—",
    row.roadmapVersion || "—",
    row.learningRoadmap || "—",
    row.completedTasks || "—",
    row.projects || "—",
    row.verificationUrl || "—",
    row.qrCodeValue || "—",
  ];
}

assert(projectResult(50, 50, "GRADED") === "100%", "50 / 50 displays 100%");
assert(projectResult(44, 50, "GRADED") === "88%", "44 / 50 displays 88%");
assert(projectResult(42.5, 50, "GRADED") === "85%", "Decimal grade rounds cleanly");
assert(projectResult("", 50, "SUBMITTED") === "Submitted", "Blank submitted grade stays Submitted");
assert(hasCircularIndicator(projectResult(44, 50, "GRADED")), "Graded project uses circular percentage indicator");
assert(!hasCircularIndicator(projectResult("", 50, "SUBMITTED")), "Submitted ungraded project has no percentage circle");

const issued = {
  studentNameOnCertificate: "Mohamed Hassan Khallaf",
  studentName: "Live Name",
  certificateId: "CERT_000001",
  certificateStatus: "ISSUED",
  certificateName: "Advanced Data Science & AI - Level 1 (60H)",
  issueDate: "24 Aug 2026",
  university: "Alexandria National University",
  college: "Computer Science",
  universityStudentId: "2305413",
  track: "Artificial Intelligence(Ai)",
  creditHours: 64,
  deliveryMode: "Offline",
  roadmapName: "Advanced AI Roadmap",
  roadmapVersion: "v1",
  learningRoadmap: "Module 1:\nPython Basics\nSQL Basics",
  completedTasks: "Python EDA Task\nSQL Task",
  projects: "Machine Learning Capstone - 100%",
  verificationUrl: "/verify/certificate/secret-token",
  qrCodeValue: "/verify/certificate/secret-token",
  verificationToken: "secret-token",
  certificateDeliveryEmail: "private@example.com",
  phone: "01000000000",
};
const revoked = { ...issued, certificateStatus: "REVOKED" };
const row = exportCertificateRow(issued);
assert(JSON.stringify(exportColumns) === JSON.stringify(["Student_Name", "Certificate_ID", "Verification_Status", "Certificate_Name", "Issue_Date", "University", "College", "University_Student_ID", "Track", "Credit_Hours", "Delivery_Mode", "Roadmap_Name", "Roadmap_Version", "Learning_Roadmap", "Completed_Tasks", "Projects", "Verification_URL", "QR_Code_Value"]), "Export columns match required order");
assert(row[0] === "Mohamed Hassan Khallaf", "Export uses certificate snapshot student name");
assert(row[2] === "Verified", "ISSUED exports Verified");
assert(exportCertificateRow(revoked)[2] === "Revoked", "REVOKED exports Revoked");
assert(row[4] === "24 Aug 2026", "Issue date is human-readable");
assert(row[7] === "2305413", "University Student ID remains text value");
assert(row[9] === "64 H", "Credit hours are human readable");
assert(row[10] === "Offline", "Delivery mode is human readable");
assert(row[11] === "Advanced AI Roadmap" && row[12] === "v1", "Roadmap name and version are exported");
assert(row[13].includes("Python Basics") && row[14].includes("Python EDA Task") && row[15].includes("100%"), "Roadmap, tasks, and projects are exported as multiline public values");
assert(row[16] === row[17], "QR Code Value equals Verification URL");
const exported = JSON.stringify([exportColumns, row]);
assert(!exportColumns.includes("Verification_Token"), "Raw Verification_Token column is not exported");
assert(!exported.includes("private@example.com"), "Email is not exported");
assert(!exported.includes("01000000000"), "Phone is not exported");

console.log(JSON.stringify({ ok: true, productionWrites: 0 }, null, 2));
