function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function text(value) {
  return String(value ?? "").trim();
}

function bool(value) {
  return ["true", "yes", "1", "active"].includes(text(value).toLowerCase());
}

function profile(student) {
  const certificateName = text(student?.Certificate_Name);
  const certificateEmail = text(student?.Certificate_Email).toLowerCase();
  const status = text(student?.Certificate_Profile_Status).toUpperCase() === "CONFIRMED" ? "CONFIRMED" : "NOT_CONFIRMED";
  return { status, certificateName, certificateEmail, complete: status === "CONFIRMED" && Boolean(certificateName) && Boolean(certificateEmail) };
}

function activeRoadmapsForEnrollment(enrollmentId, data) {
  const enrollment = data.enrollments.find(row => row.Enrollment_ID === enrollmentId);
  if (!enrollment) return { error: "ENROLLMENT_NOT_FOUND" };
  const group = data.groups.find(row => row.Group_ID === enrollment.Group_ID);
  if (!group) return { error: "GROUP_NOT_FOUND" };
  const active = data.batchRoadmaps.filter(row => row.Batch_ID === group.Batch_ID && row.Group_ID === group.Group_ID && bool(row.Is_Active));
  if (active.length === 0) return { error: "ROADMAP_GROUP_MAPPING_NOT_FOUND" };
  if (active.length > 1) return { error: "ROADMAP_GROUP_MAPPING_CONFLICT" };
  const roadmap = data.roadmaps.find(row => row.Roadmap_ID === active[0].Roadmap_ID);
  if (!roadmap || !bool(roadmap.Is_Active)) return { error: "ROADMAP_NOT_FOUND" };
  return { roadmapId: active[0].Roadmap_ID, batchId: group.Batch_ID, groupId: group.Group_ID };
}

function canIssue(enrollmentId, data) {
  const enrollment = data.enrollments.find(row => row.Enrollment_ID === enrollmentId);
  if (!enrollment) return { error: "ENROLLMENT_NOT_FOUND" };
  const student = data.students.find(row => row.Academy_Student_ID === enrollment.Academy_Student_ID);
  if (!student) return { error: "STUDENT_NOT_FOUND" };
  if (!profile(student).complete) return { error: "CERTIFICATE_PROFILE_NOT_CONFIRMED" };
  if (!data.certificateHeaders.includes("Student_Name_On_Certificate") || !data.certificateHeaders.includes("Certificate_Delivery_Email")) return { error: "CERTIFICATE_SNAPSHOT_SCHEMA_MISSING" };
  const readiness = data.readiness.find(row => row.Enrollment_ID === enrollmentId);
  if (!readiness || readiness.Automatic_Readiness !== "READY" || readiness.Approval_Status !== "APPROVED") return { error: "CERTIFICATE_NOT_APPROVED" };
  if (data.certificates.some(row => row.Enrollment_ID === enrollmentId && text(row.Certificate_Status).toUpperCase() === "ISSUED")) return { error: "CERTIFICATE_ALREADY_ISSUED" };
  return activeRoadmapsForEnrollment(enrollmentId, data);
}

function issue(enrollmentId, data) {
  const plan = canIssue(enrollmentId, data);
  if (plan.error) return plan;
  const enrollment = data.enrollments.find(row => row.Enrollment_ID === enrollmentId);
  const student = data.students.find(row => row.Academy_Student_ID === enrollment.Academy_Student_ID);
  const studentProfile = profile(student);
  return {
    record: {
      Certificate_ID: "CERT_000001",
      Enrollment_ID: enrollmentId,
      Academy_Student_ID: enrollment.Academy_Student_ID,
      Batch_ID: plan.batchId,
      Roadmap_ID: plan.roadmapId,
      Certificate_Status: "ISSUED",
      Student_Name_On_Certificate: studentProfile.certificateName,
      Certificate_Delivery_Email: studentProfile.certificateEmail,
    },
  };
}

const baseData = {
  certificateHeaders: ["Certificate_ID", "Verification_Token", "Academy_Student_ID", "Enrollment_ID", "Batch_ID", "Roadmap_ID", "Certificate_Name", "Issue_Date", "Certificate_Status", "Issued_By", "Issued_At", "Revoked_By", "Revoked_At", "Notes", "Student_Name_On_Certificate", "Certificate_Delivery_Email"],
  students: [{ Academy_Student_ID: "TT_001", Certificate_Name: "Omar Diefallah", Certificate_Email: "Omar@Example.COM", Certificate_Profile_Status: "CONFIRMED" }],
  enrollments: [{ Enrollment_ID: "ENR_001", Academy_Student_ID: "TT_001", Group_ID: "GRP_60" }],
  groups: [{ Group_ID: "GRP_60", Batch_ID: "BATCH_001" }],
  roadmaps: [{ Roadmap_ID: "RDM_60", Is_Active: "TRUE" }],
  batchRoadmaps: [{ Batch_Roadmap_ID: "BRDM_1", Batch_ID: "BATCH_001", Group_ID: "GRP_60", Roadmap_ID: "RDM_60", Is_Active: "TRUE" }],
  readiness: [{ Enrollment_ID: "ENR_001", Automatic_Readiness: "READY", Approval_Status: "APPROVED" }],
  certificates: [],
};

assert(canIssue("ENR_001", baseData).roadmapId === "RDM_60", "Issue resolves Roadmap by Batch+Group");
const issued = issue("ENR_001", baseData).record;
assert(issued.Student_Name_On_Certificate === "Omar Diefallah", "Certificate issue snapshots confirmed student name");
assert(issued.Certificate_Delivery_Email === "omar@example.com", "Certificate issue snapshots lowercase delivery email");
assert(canIssue("ENR_001", { ...baseData, students: [{ Academy_Student_ID: "TT_001", Certificate_Profile_Status: "" }] }).error === "CERTIFICATE_PROFILE_NOT_CONFIRMED", "Unconfirmed certificate profile blocks issuance");
assert(canIssue("ENR_001", { ...baseData, certificateHeaders: baseData.certificateHeaders.filter(header => header !== "Certificate_Delivery_Email") }).error === "CERTIFICATE_SNAPSHOT_SCHEMA_MISSING", "Missing snapshot headers block issuance");
assert(canIssue("ENR_001", { ...baseData, readiness: [{ Enrollment_ID: "ENR_001", Automatic_Readiness: "READY", Approval_Status: "PENDING" }] }).error === "CERTIFICATE_NOT_APPROVED", "Manual approval is still required");
assert(canIssue("ENR_001", { ...baseData, batchRoadmaps: [] }).error === "ROADMAP_GROUP_MAPPING_NOT_FOUND", "Missing Group Roadmap blocks issuance");
assert(canIssue("ENR_001", { ...baseData, batchRoadmaps: [...baseData.batchRoadmaps, { Batch_Roadmap_ID: "BRDM_2", Batch_ID: "BATCH_001", Group_ID: "GRP_60", Roadmap_ID: "RDM_60", Is_Active: "TRUE" }] }).error === "ROADMAP_GROUP_MAPPING_CONFLICT", "Multiple active Group Roadmaps block issuance");
assert(canIssue("ENR_001", { ...baseData, certificates: [{ Enrollment_ID: "ENR_001", Certificate_Status: "ISSUED" }] }).error === "CERTIFICATE_ALREADY_ISSUED", "Duplicate active issued certificate is blocked");
assert(canIssue("ENR_001", { ...baseData, certificates: [{ Enrollment_ID: "ENR_001", Certificate_Status: "REVOKED" }] }).roadmapId === "RDM_60", "Revoked certificate does not block a new active issue");

console.log(JSON.stringify({ ok: true, productionWrites: 0 }, null, 2));
