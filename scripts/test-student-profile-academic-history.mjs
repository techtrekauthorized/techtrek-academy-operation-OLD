function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeStatus(value) {
  return ["SUBMITTED", "GRADED"].includes(String(value || "").trim().toUpperCase()) ? String(value).trim().toUpperCase() : "NOT_SUBMITTED";
}

function percentage(grade, maxGrade) {
  if (grade === "" || grade === null || grade === undefined) return null;
  const numericGrade = Number(grade);
  const numericMax = Number(maxGrade);
  if (!Number.isFinite(numericGrade) || !Number.isFinite(numericMax) || numericMax <= 0) return null;
  return Math.round((numericGrade / numericMax) * 1000) / 10;
}

function buildProfile({ student, enrollments, groups, batches, assignments, assignmentGroups, assignmentResults, eligibility, roadmaps, certificates }) {
  const activeGroupsByAssignment = new Map();
  for (const mapping of assignmentGroups.filter(row => row.Is_Active === "TRUE")) {
    activeGroupsByAssignment.set(mapping.Assignment_ID, [...(activeGroupsByAssignment.get(mapping.Assignment_ID) || []), mapping.Group_ID]);
  }
  const groupsById = new Map(groups.map(row => [row.Group_ID, row]));
  const batchesById = new Map(batches.map(row => [row.Batch_ID, row]));
  const resultsByKey = new Map(assignmentResults.map(row => [`${row.Assignment_ID}:${row.Enrollment_ID}`, row]));
  const work = enrollments.flatMap(enrollment => assignments.filter(assignment => (activeGroupsByAssignment.get(assignment.Assignment_ID) || []).includes(enrollment.Group_ID)).map(assignment => {
    const result = resultsByKey.get(`${assignment.Assignment_ID}:${enrollment.Enrollment_ID}`);
    const grade = result?.Grade === "" || result?.Grade === undefined ? null : Number(result.Grade);
    return {
      enrollmentId: enrollment.Enrollment_ID,
      type: assignment.Assignment_Type,
      title: assignment.Title,
      batchName: batchesById.get(assignment.Batch_ID)?.Batch_Name || assignment.Batch_ID,
      groupName: groupsById.get(enrollment.Group_ID)?.Group_Name || enrollment.Group_ID,
      status: result ? normalizeStatus(result.Submission_Status) : "NOT_SUBMITTED",
      grade,
      maxGrade: assignment.Max_Grade === "" ? null : Number(assignment.Max_Grade),
      percentage: percentage(result?.Grade, assignment.Max_Grade),
      requiredForCertificate: assignment.Required_For_Certificate === "TRUE",
    };
  }));
  const decisions = new Map(eligibility.map(row => [row.Enrollment_ID, row.Approval_Status]));
  const issued = certificates.filter(row => enrollments.some(enrollment => enrollment.Enrollment_ID === row.Enrollment_ID)).map(row => ({
    certificateId: row.Certificate_ID,
    status: row.Certificate_Status,
    roadmapName: roadmaps.find(roadmap => roadmap.Roadmap_ID === row.Roadmap_ID)?.Roadmap_Name || row.Roadmap_ID,
    verificationUrl: `/verify/certificate/${encodeURIComponent(row.Verification_Token)}`,
  }));
  return {
    certificateProfile: {
      status: student.Certificate_Profile_Status === "CONFIRMED" ? "CONFIRMED" : "NOT_CONFIRMED",
      certificateName: student.Certificate_Name || "",
      certificateEmail: String(student.Certificate_Email || "").toLowerCase(),
    },
    work,
    decisions,
    issued,
  };
}

const profile = buildProfile({
  student: { Academy_Student_ID: "TT_001", Certificate_Name: "Omar Diefallah", Certificate_Email: "OMAR@EXAMPLE.COM", Certificate_Profile_Status: "CONFIRMED" },
  enrollments: [
    { Enrollment_ID: "ENR_1", Group_ID: "GRP_A" },
    { Enrollment_ID: "ENR_2", Group_ID: "GRP_B" },
  ],
  groups: [
    { Group_ID: "GRP_A", Batch_ID: "BATCH_1", Group_Name: "AI | Alex | Jul 2026 | 60H | Online | A" },
    { Group_ID: "GRP_B", Batch_ID: "BATCH_2", Group_Name: "SOC | Alex | Aug 2026 | 120H | Hybrid | B" },
  ],
  batches: [
    { Batch_ID: "BATCH_1", Batch_Name: "AI July 2026" },
    { Batch_ID: "BATCH_2", Batch_Name: "SOC August 2026" },
  ],
  assignments: [
    { Assignment_ID: "ASG_1", Batch_ID: "BATCH_1", Assignment_Type: "TASK", Title: "SQL Task", Max_Grade: "50", Required_For_Certificate: "TRUE" },
    { Assignment_ID: "ASG_2", Batch_ID: "BATCH_1", Assignment_Type: "PROJECT", Title: "Capstone", Max_Grade: "100", Required_For_Certificate: "TRUE" },
    { Assignment_ID: "ASG_3", Batch_ID: "BATCH_2", Assignment_Type: "TASK", Title: "Other Enrollment Task", Max_Grade: "", Required_For_Certificate: "FALSE" },
  ],
  assignmentGroups: [
    { Assignment_ID: "ASG_1", Group_ID: "GRP_A", Is_Active: "TRUE" },
    { Assignment_ID: "ASG_2", Group_ID: "GRP_A", Is_Active: "TRUE" },
    { Assignment_ID: "ASG_3", Group_ID: "GRP_B", Is_Active: "TRUE" },
  ],
  assignmentResults: [
    { Assignment_ID: "ASG_1", Enrollment_ID: "ENR_1", Submission_Status: "GRADED", Grade: "44" },
    { Assignment_ID: "ASG_2", Enrollment_ID: "ENR_1", Submission_Status: "SUBMITTED", Grade: "" },
  ],
  eligibility: [{ Enrollment_ID: "ENR_1", Approval_Status: "APPROVED" }],
  roadmaps: [{ Roadmap_ID: "RDM_1", Roadmap_Name: "AI 60H Roadmap" }],
  certificates: [{ Certificate_ID: "CERT_1", Enrollment_ID: "ENR_1", Roadmap_ID: "RDM_1", Certificate_Status: "ISSUED", Verification_Token: "tok_123" }],
});

assert(profile.certificateProfile.status === "CONFIRMED", "Certificate profile confirmed status displays");
assert(profile.certificateProfile.certificateEmail === "omar@example.com", "Certificate email displays lowercase internally");
assert(profile.work.filter(row => row.enrollmentId === "ENR_1").length === 2, "Enrollment 1 shows applicable Group assignments");
assert(profile.work.find(row => row.title === "SQL Task").percentage === 88, "Graded work percentage is calculated");
assert(profile.work.find(row => row.title === "Capstone").percentage === null, "Blank submitted grade does not become 0%");
assert(profile.work.find(row => row.title === "Other Enrollment Task").status === "NOT_SUBMITTED", "Applicable assignment without result displays Not Submitted");
assert(!profile.work.some(row => row.enrollmentId === "ENR_1" && row.title === "Other Enrollment Task"), "Assignments from another Group do not appear in selected enrollment work");
assert(profile.decisions.get("ENR_1") === "APPROVED", "Certificate decision joins by Enrollment_ID");
assert((profile.decisions.get("ENR_2") || "PENDING") === "PENDING", "Missing Certificate_Eligibility row means Pending");
assert(profile.issued[0].roadmapName === "AI 60H Roadmap", "Issued certificate resolves snapshot Roadmap_ID");
assert(profile.issued[0].verificationUrl === "/verify/certificate/tok_123", "Open Verification uses existing token route without exposing raw token in table text");

console.log(JSON.stringify({ ok: true, productionWrites: 0 }, null, 2));
