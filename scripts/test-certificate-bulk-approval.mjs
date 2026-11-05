function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const allowed = new Set(["PENDING", "APPROVED", "NOT_APPROVED"]);

function planBulkApproval(changes, rows) {
  const seen = new Set();
  const eligibilityByEnrollment = new Map(rows.map(row => [row.Enrollment_ID, row]));
  const appends = [];
  const updates = [];
  let next = 3;
  for (const change of changes) {
    assert(allowed.has(change.decision), "Invalid approval decision rejected");
    assert(!seen.has(change.enrollmentId), "Duplicate Enrollment_ID changes rejected");
    seen.add(change.enrollmentId);
    const existing = eligibilityByEnrollment.get(change.enrollmentId);
    const current = existing?.Approval_Status || "PENDING";
    if (current === change.decision) continue;
    if (!existing && change.decision === "PENDING") continue;
    const patch = { Enrollment_ID: change.enrollmentId, Approval_Status: change.decision };
    if (existing) updates.push({ id: existing.Certificate_Eligibility_ID, patch });
    else appends.push({ Certificate_Eligibility_ID: `CERTEL_${String(next++).padStart(5, "0")}`, ...patch });
  }
  const finalRows = rows.map(row => updates.find(update => update.id === row.Certificate_Eligibility_ID)?.patch ? { ...row, ...updates.find(update => update.id === row.Certificate_Eligibility_ID).patch } : row).concat(appends);
  const uniqueEnrollments = new Set(finalRows.map(row => row.Enrollment_ID));
  assert(uniqueEnrollments.size === finalRows.length, "No duplicate Certificate_Eligibility Enrollment_ID rows");
  return { appends, updates, finalRows };
}

const persisted = [
  { Certificate_Eligibility_ID: "CERTEL_00001", Enrollment_ID: "ENR_A", Approval_Status: "PENDING" },
  { Certificate_Eligibility_ID: "CERTEL_00002", Enrollment_ID: "ENR_B", Approval_Status: "APPROVED" },
];

const plan = planBulkApproval([
  { enrollmentId: "ENR_A", decision: "APPROVED" },
  { enrollmentId: "ENR_B", decision: "APPROVED" },
  { enrollmentId: "ENR_C", decision: "NOT_APPROVED" },
  { enrollmentId: "ENR_D", decision: "PENDING" },
], persisted);

assert(plan.updates.length === 1, "Only changed existing rows are updated");
assert(plan.appends.length === 1, "Only non-PENDING missing eligibility rows are created");
assert(plan.appends[0].Certificate_Eligibility_ID === "CERTEL_00003", "Bulk approval uses next safe prefixed ID, not row count");
assert(plan.finalRows.find(row => row.Enrollment_ID === "ENR_A").Approval_Status === "APPROVED", "Changed approval persists after save");
assert(!plan.finalRows.some(row => row.Enrollment_ID === "ENR_D"), "Missing PENDING decision does not create unnecessary physical row");

let duplicateRejected = false;
try {
  planBulkApproval([{ enrollmentId: "ENR_A", decision: "APPROVED" }, { enrollmentId: "ENR_A", decision: "NOT_APPROVED" }], persisted);
} catch {
  duplicateRejected = true;
}
assert(duplicateRejected, "Duplicate Enrollment_ID changes are rejected before writes");

console.log(JSON.stringify({ ok: true, productionWrites: 0 }, null, 2));
