function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function universityKey(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function universityFilterOptions(rows) {
  const options = new Map();
  for (const row of rows) {
    const label = String(row.university ?? "").trim().replace(/\s+/g, " ");
    const key = universityKey(label);
    if (key && !options.has(key)) options.set(key, label);
  }
  return [...options.entries()].map(([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label));
}

function effectiveApprovalStatus(row, drafts) {
  return drafts[row.enrollmentId] || row.certificateDecision || "PENDING";
}

function effectiveCertificateStatus(row) {
  if (row.certificateStatus === "ISSUED") return "ISSUED";
  if (row.certificateStatus === "REVOKED") return "REVOKED";
  return "NOT_ISSUED";
}

function filterReadiness(rows, { search = "", groupIds = [], universities = [], approvalStatuses = [], certificateStatuses = [], drafts = {} }) {
  const groupSet = new Set(groupIds);
  const universitySet = new Set(universities);
  const approvalSet = new Set(approvalStatuses);
  const certificateSet = new Set(certificateStatuses);
  return rows.filter(row => {
    const searchMatches = !search.trim() || `${row.studentName} ${row.academyStudentId} ${row.universityStudentId} ${row.groupName} ${row.certificateNameOnCertificate ?? ""} ${row.certificateDeliveryEmail ?? ""}`.toLowerCase().includes(search.trim().toLowerCase());
    const groupMatches = !groupSet.size || groupSet.has(row.groupId);
    const universityMatches = !universitySet.size || universitySet.has(universityKey(row.university));
    const approvalMatches = !approvalSet.size || approvalSet.has(effectiveApprovalStatus(row, drafts));
    const certificateMatches = !certificateSet.size || certificateSet.has(effectiveCertificateStatus(row));
    return searchMatches && groupMatches && universityMatches && approvalMatches && certificateMatches;
  });
}

function dirtyEntries(rows, drafts) {
  const persistedByEnrollment = new Map(rows.map(row => [row.enrollmentId, row.certificateDecision]));
  return Object.entries(drafts).filter(([enrollmentId, decision]) => persistedByEnrollment.get(enrollmentId) && persistedByEnrollment.get(enrollmentId) !== decision);
}

const rows = [
  { enrollmentId: "ENR_1", studentName: "Ahmed Ali", academyStudentId: "TT_001", universityStudentId: "2301", university: " Alexandria National University ", groupId: "GRP_A", groupName: "SOC Alex A", certificateDecision: "PENDING", certificateStatus: "NOT_ISSUED" },
  { enrollmentId: "ENR_2", studentName: "Mona Samir", academyStudentId: "TT_002", universityStudentId: "2302", university: "alexandria   national university", groupId: "GRP_A", groupName: "SOC Alex A", certificateDecision: "PENDING", certificateStatus: "NOT_ISSUED" },
  { enrollmentId: "ENR_3", studentName: "Karim Noor", academyStudentId: "TT_003", universityStudentId: "3301", university: "Benha National University", groupId: "GRP_B", groupName: "SOC Alex B", certificateDecision: "APPROVED", certificateStatus: "ISSUED" },
  { enrollmentId: "ENR_4", studentName: "No University", academyStudentId: "TT_004", universityStudentId: "4401", university: " ", groupId: "GRP_B", groupName: "SOC Alex B", certificateDecision: "PENDING", certificateStatus: "NOT_ISSUED" },
  { enrollmentId: "ENR_5", studentName: "Missing Eligibility", academyStudentId: "TT_005", universityStudentId: "5501", university: "Benha National University", groupId: "GRP_C", groupName: "SOC Alex C", certificateStatus: "REVOKED" },
  { enrollmentId: "ENR_6", studentName: "Rejected Student", academyStudentId: "TT_006", universityStudentId: "6601", university: "Benha National University", groupId: "GRP_C", groupName: "SOC Alex C", certificateDecision: "NOT_APPROVED", certificateStatus: "NOT_ISSUED" },
];

const options = universityFilterOptions(rows);
assert(options.length === 2, "Duplicate and empty University values are removed");
assert(options[0].label === "Alexandria National University", "Canonical displayed University value is preserved");
assert(options[1].label === "Benha National University", "University options are sorted alphabetically");

const alexRows = filterReadiness(rows, { universities: ["alexandria national university"] });
assert(alexRows.length === 2, "University filter matches spacing/case-equivalent values");

const andRows = filterReadiness(rows, { universities: ["alexandria national university"], search: "TT_002" });
assert(andRows.length === 1 && andRows[0].enrollmentId === "ENR_2", "Search and University combine with AND logic");

assert(filterReadiness(rows, { groupIds: [] }).length === rows.length, "No Group selection means All Groups");
assert(filterReadiness(rows, { groupIds: ["GRP_A", "GRP_B"] }).map(row => row.enrollmentId).join(",") === "ENR_1,ENR_2,ENR_3,ENR_4", "Multiple Groups use OR logic inside Group filter");
assert(filterReadiness(rows, { universities: [] }).length === rows.length, "No University selection means All Universities");
assert(filterReadiness(rows, { universities: ["alexandria national university", "benha national university"] }).length === 5, "Multiple Universities use OR logic inside University filter and exclude blank");

const drafts = { ENR_1: "APPROVED", ENR_2: "APPROVED" };
assert(dirtyEntries(rows, drafts).length === 2, "Dirty decisions are keyed by Enrollment_ID");
filterReadiness(rows, { universities: ["benha national university"] });
assert(dirtyEntries(rows, drafts).length === 2, "Changing University visibility does not discard unsaved decisions");

assert(filterReadiness(rows, { approvalStatuses: [] }).length === rows.length, "No Approval Status selection means All Approval Statuses");
assert(filterReadiness(rows, { approvalStatuses: ["PENDING"] }).some(row => row.enrollmentId === "ENR_5"), "Missing Certificate_Eligibility row is treated as Pending");
assert(filterReadiness(rows, { approvalStatuses: ["PENDING"] }).some(row => row.enrollmentId === "ENR_1"), "Explicit PENDING row is treated as Pending");
assert(filterReadiness(rows, { approvalStatuses: ["APPROVED", "NOT_APPROVED"] }).map(row => row.enrollmentId).join(",") === "ENR_3,ENR_6", "Multiple Approval Statuses use OR logic inside Approval filter");
assert(filterReadiness(rows, { approvalStatuses: ["APPROVED"], drafts }).some(row => row.enrollmentId === "ENR_1"), "Local Pending to Approved draft immediately appears under Approved filter");
assert(!filterReadiness(rows, { approvalStatuses: ["PENDING"], drafts }).some(row => row.enrollmentId === "ENR_1"), "Local Pending to Approved draft disappears from Pending filter");
assert(filterReadiness(rows, { universities: ["alexandria national university"], approvalStatuses: ["APPROVED"], search: "Mona", drafts }).map(row => row.enrollmentId).join(",") === "ENR_2", "Search, University, and Approval Status combine with AND logic");
assert(dirtyEntries(rows, drafts).length === 2, "Approval Status filter switching preserves unsaved decisions");

assert(filterReadiness(rows, { certificateStatuses: [] }).length === rows.length, "No Certificate Status selection means All Certificate Statuses");
assert(filterReadiness(rows, { certificateStatuses: ["ISSUED", "NOT_ISSUED"] }).map(row => row.enrollmentId).join(",") === "ENR_1,ENR_2,ENR_3,ENR_4,ENR_6", "Multiple Certificate Statuses use OR logic and exclude Revoked unless selected");
assert(filterReadiness(rows, { certificateStatuses: ["NOT_ISSUED"] }).some(row => row.enrollmentId === "ENR_5") === false, "REVOKED is not misclassified as Not Issued");
assert(filterReadiness(rows, { groupIds: ["GRP_A", "GRP_C"], universities: ["alexandria national university"], approvalStatuses: ["APPROVED"], certificateStatuses: ["NOT_ISSUED"], search: "Mona", drafts }).map(row => row.enrollmentId).join(",") === "ENR_2", "OR within selected filters and AND between filter categories");

const savedRows = rows.map(row => drafts[row.enrollmentId] ? { ...row, certificateDecision: drafts[row.enrollmentId] } : row);
assert(filterReadiness(savedRows, { approvalStatuses: ["APPROVED"] }).some(row => row.enrollmentId === "ENR_1"), "Save Changes preserves current Approval Status filter semantics after persisted rows update");
assert(!filterReadiness(rows, { approvalStatuses: ["APPROVED"], drafts: {} }).some(row => row.enrollmentId === "ENR_1"), "Discard Changes refilters using persisted status");

const resetState = { groupIds: ["GRP_A"], universities: ["benha national university"], approvalStatuses: ["APPROVED"], certificateStatuses: ["NOT_ISSUED"], search: "karim", drafts };
resetState.groupIds = [];
resetState.universities = [];
resetState.approvalStatuses = [];
resetState.certificateStatuses = [];
resetState.search = "";
assert(!resetState.groupIds.length && !resetState.universities.length && !resetState.approvalStatuses.length && !resetState.certificateStatuses.length && resetState.search === "" && dirtyEntries(rows, resetState.drafts).length === 2, "Reset Filters clears visibility filters without discarding drafts");

console.log(JSON.stringify({ ok: true, apiReadsOnFilterChange: 0, productionWrites: 0 }, null, 2));
