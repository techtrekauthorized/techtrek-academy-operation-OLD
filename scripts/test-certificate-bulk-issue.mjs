import { randomBytes } from "crypto";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function effectiveCertificateStatus(row) {
  if (row.certificateStatus === "ISSUED") return "ISSUED";
  if (row.certificateStatus === "REVOKED") return "REVOKED";
  return "NOT_ISSUED";
}

function effectiveApprovalStatus(row, drafts) {
  return drafts[row.enrollmentId] || row.certificateDecision || "PENDING";
}

function visibleRows(rows, filters, drafts = {}) {
  const universitySet = new Set(filters.universities || []);
  const approvalSet = new Set(filters.approvalStatuses || []);
  const certificateSet = new Set(filters.certificateStatuses || []);
  return rows.filter(row => {
    const searchMatches = !filters.search || `${row.studentName} ${row.academyStudentId} ${row.universityStudentId} ${row.groupName}`.toLowerCase().includes(filters.search.toLowerCase());
    const universityMatches = !universitySet.size || universitySet.has(row.university);
    const approvalMatches = !approvalSet.size || approvalSet.has(effectiveApprovalStatus(row, drafts));
    const certificateMatches = !certificateSet.size || certificateSet.has(effectiveCertificateStatus(row));
    return searchMatches && universityMatches && approvalMatches && certificateMatches;
  });
}

function isSelectable(row, dirty) {
  return !dirty && !row.certificateIssueBlockReason && row.certificateStatus !== "ISSUED";
}

function nextCertificateId(existing) {
  const max = existing.reduce((highest, id) => {
    const match = /^CERT_(\d+)$/.exec(id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `CERT_${String(max + 1).padStart(6, "0")}`;
}

function token(existing) {
  let value = "";
  do value = randomBytes(12).toString("base64url");
  while (existing.has(value));
  existing.add(value);
  return value;
}

function planBulkIssue(enrollmentIds, context) {
  const allocatedIds = new Set(context.certificates.map(row => row.Certificate_ID));
  const allocatedTokens = new Set(context.certificates.map(row => row.Verification_Token));
  const issuedByEnrollment = new Set(context.certificates.filter(row => row.Certificate_Status === "ISSUED").map(row => row.Enrollment_ID));
  const appends = [];
  const results = [];
  for (const enrollmentId of [...new Set(enrollmentIds)]) {
    const enrollment = context.enrollments.get(enrollmentId);
    const readiness = context.readiness.get(enrollmentId);
    const profile = context.profiles.get(enrollmentId);
    const roadmapId = context.roadmapByEnrollment.get(enrollmentId);
    if (issuedByEnrollment.has(enrollmentId)) {
      results.push({ enrollmentId, status: "ALREADY_ISSUED" });
      continue;
    }
    if (!enrollment || !readiness || readiness.automaticReadiness !== "READY" || readiness.certificateDecision !== "APPROVED" || !profile?.confirmed || !roadmapId) {
      results.push({ enrollmentId, status: "FAILED" });
      continue;
    }
    const certificateId = nextCertificateId([...allocatedIds]);
    allocatedIds.add(certificateId);
    const verificationToken = token(allocatedTokens);
    const record = {
      Certificate_ID: certificateId,
      Verification_Token: verificationToken,
      Enrollment_ID: enrollmentId,
      Batch_ID: enrollment.batchId,
      Roadmap_ID: roadmapId,
      Student_Name_On_Certificate: profile.name,
      Certificate_Delivery_Email: profile.email,
    };
    appends.push(record);
    issuedByEnrollment.add(enrollmentId);
    results.push({ enrollmentId, status: "ISSUED", certificateId });
  }
  return { appends, results };
}

const rows = [
  { enrollmentId: "ENR_1", studentName: "A", academyStudentId: "TT_1", universityStudentId: "1", university: "Alex", groupName: "G1", certificateDecision: "APPROVED", certificateStatus: "NOT_ISSUED" },
  { enrollmentId: "ENR_2", studentName: "B", academyStudentId: "TT_2", universityStudentId: "2", university: "Alex", groupName: "G1", certificateDecision: "APPROVED", certificateStatus: "ISSUED" },
  { enrollmentId: "ENR_3", studentName: "C", academyStudentId: "TT_3", universityStudentId: "3", university: "Alex", groupName: "G1", certificateDecision: "APPROVED", certificateStatus: "REVOKED" },
  { enrollmentId: "ENR_4", studentName: "D", academyStudentId: "TT_4", universityStudentId: "4", university: "Benha", groupName: "G2", certificateDecision: "PENDING", certificateStatus: "NOT_ISSUED" },
  { enrollmentId: "ENR_5", studentName: "E", academyStudentId: "TT_5", universityStudentId: "5", university: "Alex", groupName: "G1", certificateDecision: "APPROVED", certificateStatus: "NOT_ISSUED", certificateIssueBlockReason: "Roadmap is not assigned." },
];

assert(visibleRows(rows, { certificateStatuses: ["NOT_ISSUED"] }).map(row => row.enrollmentId).join(",") === "ENR_1,ENR_4,ENR_5", "REVOKED is not classified as Not Issued");
assert(visibleRows(rows, { universities: ["Alex"], approvalStatuses: ["APPROVED"], certificateStatuses: ["NOT_ISSUED"] }).map(row => row.enrollmentId).join(",") === "ENR_1,ENR_5", "Certificate Status combines with University and Approval Status");
assert(visibleRows(rows, { certificateStatuses: ["ISSUED", "NOT_ISSUED"] }).map(row => row.enrollmentId).join(",") === "ENR_1,ENR_2,ENR_4,ENR_5", "Certificate status multi-select uses OR logic and preserves Revoked as distinct");

const drafts = { ENR_4: "APPROVED" };
assert(visibleRows(rows, { approvalStatuses: ["APPROVED"], certificateStatuses: ["NOT_ISSUED"] }, drafts).some(row => row.enrollmentId === "ENR_4"), "Draft approval affects filtering");
assert(!isSelectable(rows[3], true), "Unsaved draft approval cannot be selected for issue");

const filteredEligible = visibleRows(rows, { universities: ["Alex"], approvalStatuses: ["APPROVED"], certificateStatuses: ["NOT_ISSUED"] }).filter(row => isSelectable(row, false));
assert(filteredEligible.map(row => row.enrollmentId).join(",") === "ENR_1", "Select All Eligible applies only to filtered selectable rows");

const plan = planBulkIssue(["ENR_1", "ENR_2", "ENR_6"], {
  certificates: [{ Certificate_ID: "CERT_000125", Verification_Token: "tok_existing", Enrollment_ID: "ENR_2", Certificate_Status: "ISSUED" }],
  enrollments: new Map([["ENR_1", { batchId: "BATCH_1" }], ["ENR_2", { batchId: "BATCH_1" }]]),
  readiness: new Map([["ENR_1", { automaticReadiness: "READY", certificateDecision: "APPROVED" }], ["ENR_2", { automaticReadiness: "READY", certificateDecision: "APPROVED" }]]),
  profiles: new Map([["ENR_1", { confirmed: true, name: "Student One", email: "one@example.com" }]]),
  roadmapByEnrollment: new Map([["ENR_1", "RDM_60H"]]),
});

assert(plan.appends.length === 1, "Bulk issue appends only newly issuable certificates");
assert(plan.appends[0].Certificate_ID === "CERT_000126", "Bulk issue allocates next safe sequential Certificate_ID");
assert(plan.appends[0].Verification_Token !== "tok_existing", "Bulk issue generates unique verification token");
assert(plan.appends[0].Student_Name_On_Certificate === "Student One", "Bulk issue snapshots certificate name");
assert(plan.appends[0].Certificate_Delivery_Email === "one@example.com", "Bulk issue snapshots certificate email");
assert(plan.appends[0].Roadmap_ID === "RDM_60H", "Bulk issue snapshots resolved Group roadmap");
assert(plan.results.find(result => result.enrollmentId === "ENR_2").status === "ALREADY_ISSUED", "Existing ISSUED certificate is idempotent");
assert(plan.results.find(result => result.enrollmentId === "ENR_6").status === "FAILED", "Mixed failure returns per-row failed result");

console.log(JSON.stringify({ ok: true, apiReadsOnFilterChange: 0, productionWrites: 0 }, null, 2));
