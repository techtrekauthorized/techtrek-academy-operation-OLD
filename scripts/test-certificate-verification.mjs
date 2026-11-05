function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function text(value) {
  return String(value ?? "").trim();
}

function bool(value) {
  return ["true", "yes", "1", "active"].includes(text(value).toLowerCase());
}

function formatCertificateDate(value) {
  const raw = text(value);
  if (!raw) return "—";
  const numeric = typeof value === "number" ? value : /^-?\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
  let date = null;
  if (Number.isFinite(numeric) && numeric > 0) date = new Date(Date.UTC(1899, 11, 30) + Math.floor(numeric) * 24 * 60 * 60 * 1000);
  else date = new Date(raw);
  if (!date || Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function verifyByToken(token, data) {
  if (data.rateLimited) return { status: "RATE_LIMITED" };
  const certificates = data.certificates.filter(row => row.Verification_Token === token);
  if (certificates.length === 0) return { status: "NOT_FOUND" };
  if (certificates.length > 1) return { status: "CONFIGURATION_ERROR" };
  const certificate = certificates[0];
  const status = text(certificate.Certificate_Status).toUpperCase();
  if (status !== "ISSUED" && status !== "REVOKED") return { status: "CONFIGURATION_ERROR" };
  const student = data.students.find(row => row.Academy_Student_ID === certificate.Academy_Student_ID);
  const enrollment = data.enrollments.find(row => row.Enrollment_ID === certificate.Enrollment_ID);
  if (!student || !enrollment) return { status: "NOT_FOUND" };
  const assignments = data.assignments.filter(row => row.Batch_ID === certificate.Batch_ID && bool(row.Is_Active) && bool(row.Show_On_Verification) && data.assignmentGroups.some(mapping => mapping.Assignment_ID === row.Assignment_ID && mapping.Group_ID === enrollment.Group_ID && bool(mapping.Is_Active)));
  const resultsByKey = new Map(data.assignmentResults.map(row => [`${row.Assignment_ID}:${row.Enrollment_ID}`, row]));
  const completed = assignments.flatMap(assignment => {
    const result = resultsByKey.get(`${assignment.Assignment_ID}:${certificate.Enrollment_ID}`);
    const submissionStatus = text(result?.Submission_Status).toUpperCase();
    if (submissionStatus !== "SUBMITTED" && submissionStatus !== "GRADED") return [];
    return [{ assignment, result, order: text(assignment.Verification_Order) ? Number(assignment.Verification_Order) : 999999 }];
  }).sort((left, right) => left.order - right.order || left.assignment.Title.localeCompare(right.assignment.Title) || left.assignment.Assignment_ID.localeCompare(right.assignment.Assignment_ID));
  const roadmapItems = data.roadmapItems.filter(row => row.Roadmap_ID === certificate.Roadmap_ID && bool(row.Is_Active)).sort((left, right) => Number(left.Sort_Order || 999999) - Number(right.Sort_Order || 999999) || text(left.Topic_Title).localeCompare(text(right.Topic_Title)));
  return {
    status: "FOUND",
    certificate: {
      studentName: text(certificate.Student_Name_On_Certificate) || student.Name,
      certificateName: certificate.Certificate_Name,
      issueDate: formatCertificateDate(certificate.Issue_Date),
      status,
      revokedAt: status === "REVOKED" ? formatCertificateDate(certificate.Revoked_At) : undefined,
    },
    roadmapTopics: roadmapItems.map(row => row.Topic_Title),
    tasks: completed.filter(item => item.assignment.Assignment_Type === "TASK").map(item => item.assignment.Title),
    projects: completed.filter(item => item.assignment.Assignment_Type === "PROJECT").map(item => {
      const grade = Number(item.result.Grade);
      const max = Number(item.assignment.Max_Grade);
      return { title: item.assignment.Title, result: item.result.Submission_Status === "GRADED" && Number.isFinite(grade) && Number.isFinite(max) && max > 0 ? `${Math.round((grade / max) * 1000) / 10}%` : "Submitted" };
    }),
  };
}

const fixture = {
  certificates: [{ Verification_Token: "tok_1", Certificate_ID: "CERT_1", Academy_Student_ID: "TT_1", Enrollment_ID: "ENR_1", Batch_ID: "BATCH_1", Roadmap_ID: "RDM_OLD", Certificate_Name: "Advanced Data Science & AI", Student_Name_On_Certificate: "Omar Diefallah", Issue_Date: 46258, Certificate_Status: "ISSUED" }],
  students: [{ Academy_Student_ID: "TT_1", Name: "Live Name", Email: "private@example.com", Phone: "01000000000" }],
  enrollments: [{ Enrollment_ID: "ENR_1", Group_ID: "GRP_1" }],
  assignments: [
    { Assignment_ID: "A_TASK", Batch_ID: "BATCH_1", Assignment_Type: "TASK", Title: "Public Task", Is_Active: "TRUE", Show_On_Verification: "TRUE", Verification_Order: "2" },
    { Assignment_ID: "A_PROJECT", Batch_ID: "BATCH_1", Assignment_Type: "PROJECT", Title: "Public Project", Is_Active: "TRUE", Show_On_Verification: "TRUE", Verification_Order: "1", Max_Grade: "50" },
    { Assignment_ID: "A_HIDDEN", Batch_ID: "BATCH_1", Assignment_Type: "TASK", Title: "Hidden Task", Is_Active: "TRUE", Show_On_Verification: "FALSE" },
    { Assignment_ID: "A_OTHER_GROUP", Batch_ID: "BATCH_1", Assignment_Type: "TASK", Title: "Other Group Task", Is_Active: "TRUE", Show_On_Verification: "TRUE" },
  ],
  assignmentGroups: [
    { Assignment_ID: "A_TASK", Group_ID: "GRP_1", Is_Active: "TRUE" },
    { Assignment_ID: "A_PROJECT", Group_ID: "GRP_1", Is_Active: "TRUE" },
    { Assignment_ID: "A_HIDDEN", Group_ID: "GRP_1", Is_Active: "TRUE" },
    { Assignment_ID: "A_OTHER_GROUP", Group_ID: "GRP_2", Is_Active: "TRUE" },
  ],
  assignmentResults: [
    { Assignment_ID: "A_TASK", Enrollment_ID: "ENR_1", Submission_Status: "SUBMITTED", Grade: "100" },
    { Assignment_ID: "A_PROJECT", Enrollment_ID: "ENR_1", Submission_Status: "GRADED", Grade: "44" },
  ],
  roadmapItems: [
    { Roadmap_ID: "RDM_OLD", Section_Name: "Snapshot Roadmap", Topic_Title: "Old Roadmap Topic", Sort_Order: "1", Is_Active: "TRUE" },
    { Roadmap_ID: "RDM_CURRENT", Section_Name: "Current Mapping", Topic_Title: "Wrong Current Topic", Sort_Order: "1", Is_Active: "TRUE" },
  ],
};

assert(formatCertificateDate(46258) === "24 Aug 2026", "Numeric serial date formats");
assert(formatCertificateDate("46258") === "24 Aug 2026", "Numeric string serial date formats");
assert(formatCertificateDate("2026-08-24").includes("24 Aug 2026"), "ISO date formats");
assert(verifyByToken("invalid", fixture).status === "NOT_FOUND", "Invalid token not found");
assert(verifyByToken("tok_1", { ...fixture, certificates: [...fixture.certificates, { ...fixture.certificates[0], Certificate_ID: "CERT_DUP" }] }).status === "CONFIGURATION_ERROR", "Duplicate token fails safely");
assert(verifyByToken("tok_1", { ...fixture, rateLimited: true }).status === "RATE_LIMITED", "Rate limit is temporary unavailable, not not-found");
const verified = verifyByToken("tok_1", fixture);
assert(verified.status === "FOUND", "Valid token resolves");
assert(verified.certificate.studentName === "Omar Diefallah", "Snapshot student name is primary");
assert(verified.certificate.issueDate === "24 Aug 2026", "Verification date is human readable");
assert(verified.roadmapTopics.includes("Old Roadmap Topic") && !verified.roadmapTopics.includes("Wrong Current Topic"), "Certificate.Roadmap_ID snapshot controls roadmap");
assert(verified.tasks.includes("Public Task") && !verified.tasks.includes("Hidden Task") && !verified.tasks.includes("Other Group Task"), "Only public applicable completed tasks show");
assert(verified.projects[0].result === "88%", "Graded project displays percentage");
assert(!JSON.stringify(verified).includes("private@example.com") && !JSON.stringify(verified).includes("01000000000"), "Private email and phone are not exposed");
const revoked = verifyByToken("tok_1", { ...fixture, certificates: [{ ...fixture.certificates[0], Certificate_Status: "REVOKED", Revoked_At: "46259" }] });
assert(revoked.certificate.status === "REVOKED" && revoked.certificate.revokedAt === "25 Aug 2026", "Revoked certificate fixture displays revoked state and formatted date");

console.log(JSON.stringify({ ok: true, productionWrites: 0 }, null, 2));
