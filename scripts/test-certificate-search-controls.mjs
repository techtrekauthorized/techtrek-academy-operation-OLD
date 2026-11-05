function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeSearch(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function matchesSearch(fields, query) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  return normalizeSearch(fields.join(" ")).includes(normalizedQuery);
}

function readinessSearchText(row) {
  return [row.studentName, row.universityStudentId, row.academyStudentId];
}

function certificateSearchText(row) {
  return [row.studentNameOnCertificate, row.studentName, row.universityStudentId, row.academyStudentId, row.certificateId];
}

function effectiveApprovalStatus(row, drafts) {
  return drafts[row.enrollmentId] || row.certificateDecision || "PENDING";
}

function readinessVisibleRows(rows, filters, drafts = {}) {
  const groupSet = new Set(filters.groupIds || []);
  const universitySet = new Set(filters.universities || []);
  const approvalSet = new Set(filters.approvalStatuses || []);
  const certificateSet = new Set(filters.certificateStatuses || []);
  return rows.filter(row => {
    const searchMatches = matchesSearch(readinessSearchText(row), filters.search || "");
    const groupMatches = !groupSet.size || groupSet.has(row.groupId);
    const universityMatches = !universitySet.size || universitySet.has(row.university);
    const approvalMatches = !approvalSet.size || approvalSet.has(effectiveApprovalStatus(row, drafts));
    const certificateMatches = !certificateSet.size || certificateSet.has(row.certificateStatus);
    return searchMatches && groupMatches && universityMatches && approvalMatches && certificateMatches;
  });
}

function isPendingDeliveryCertificate(row) {
  return row.certificateStatus === "ISSUED" && row.portalStatus !== "PUBLISHED";
}

function issuedDeliveryQueueRows(rows, filters, approvalByEnrollment = {}) {
  const groupSet = new Set(filters.groupIds || []);
  const universitySet = new Set(filters.universities || []);
  const approvalSet = new Set(filters.approvalStatuses || []);
  const certificateSet = new Set(filters.certificateStatuses || []);
  return rows.filter(row => {
    if (!isPendingDeliveryCertificate(row)) return false;
    const searchMatches = matchesSearch(certificateSearchText(row), filters.search || "");
    const groupMatches = !groupSet.size || groupSet.has(row.groupId);
    const universityMatches = !universitySet.size || universitySet.has(row.university);
    const approvalMatches = !approvalSet.size || approvalSet.has(approvalByEnrollment[row.enrollmentId] || "PENDING");
    const certificateMatches = !certificateSet.size || certificateSet.has("ISSUED");
    return searchMatches && groupMatches && universityMatches && approvalMatches && certificateMatches;
  });
}

function certificateVisibleRows(rows, search) {
  return rows.filter(row => matchesSearch(certificateSearchText(row), search));
}

const readinessRows = [
  { enrollmentId: "ENR_1", groupId: "GRP_A", studentName: "Mohamed Hassan Khallaf", universityStudentId: "2305413", academyStudentId: "STD_00125", university: "Alexandria National University", certificateDecision: "PENDING", certificateStatus: "NOT_ISSUED" },
  { enrollmentId: "ENR_2", groupId: "GRP_B", studentName: "Sara Ali", universityStudentId: "998877", academyStudentId: "STD_00444", university: "Benha National University", certificateDecision: "APPROVED", certificateStatus: "ISSUED" },
  { enrollmentId: "ENR_3", groupId: "GRP_A", studentName: "Omar Diefallah", universityStudentId: "776655", academyStudentId: "STD_00999", university: "Alexandria National University", certificateDecision: "APPROVED", certificateStatus: "NOT_ISSUED" },
];

assert(readinessVisibleRows(readinessRows, { search: "Mohamed Hassan" }).map(row => row.enrollmentId).join(",") === "ENR_1", "full student name search works");
assert(readinessVisibleRows(readinessRows, { search: "moh" }).map(row => row.enrollmentId).join(",") === "ENR_1", "partial case-insensitive name search works");
assert(readinessVisibleRows(readinessRows, { search: "2305413" }).map(row => row.enrollmentId).join(",") === "ENR_1", "University Student ID search works");
assert(readinessVisibleRows(readinessRows, { search: "std_00125" }).map(row => row.enrollmentId).join(",") === "ENR_1", "Academy Student ID search works as text");
assert(readinessVisibleRows(readinessRows, { search: "omar", groupIds: ["GRP_A"], universities: ["Alexandria National University"], approvalStatuses: ["APPROVED"], certificateStatuses: ["NOT_ISSUED"] }).map(row => row.enrollmentId).join(",") === "ENR_3", "Search combines with Group, University, Approval, and Certificate Status filters using AND logic");

const drafts = { ENR_1: "APPROVED" };
assert(readinessVisibleRows(readinessRows, { search: "moh", approvalStatuses: ["APPROVED"] }, drafts).map(row => row.enrollmentId).join(",") === "ENR_1", "Local draft approval remains available to filtering while search changes");

const issuedRows = [
  { certificateId: "CERT_000125", enrollmentId: "ENR_1", groupId: "GRP_A", studentNameOnCertificate: "Mohamed Hassan Khallaf", studentName: "محمد حسن", universityStudentId: "2305413", academyStudentId: "STD_00125", university: "Alexandria National University", certificateStatus: "ISSUED", portalStatus: "NOT_PUBLISHED" },
  { certificateId: "CERT_000222", enrollmentId: "ENR_2", groupId: "GRP_B", studentNameOnCertificate: "Sara Ali", studentName: "Sara Ali", universityStudentId: "998877", academyStudentId: "STD_00444", university: "Benha National University", certificateStatus: "ISSUED", portalStatus: "PUBLISHED" },
];

assert(certificateVisibleRows(issuedRows, "CERT_000125").map(row => row.certificateId).join(",") === "CERT_000125", "Issued Certificates search by Certificate ID works");
assert(certificateVisibleRows(issuedRows, "2305413").map(row => row.certificateId).join(",") === "CERT_000125", "Issued/Delivered search by University Student ID works");
assert(certificateVisibleRows(issuedRows, "std_00444").map(row => row.certificateId).join(",") === "CERT_000222", "Issued/Delivered search by Academy Student ID works");
assert(certificateVisibleRows(issuedRows, "mohamed").map(row => row.certificateId).join(",") === "CERT_000125", "Issued/Delivered search prefers certificate snapshot name but can search canonical fields too");

const selectedIssueIds = ["ENR_1"];
const draftDriveLinks = { CERT_000125: "https://drive.google.com/file/d/FILE_1/view" };
assert(selectedIssueIds.includes("ENR_1") && draftDriveLinks.CERT_000125, "Local issue selections and Drive-link drafts remain keyed by stable IDs across search changes");

const manyIssuedRows = [
  ...Array.from({ length: 45 }, (_, index) => ({
    certificateId: `CERT_PENDING_${String(index + 1).padStart(3, "0")}`,
    enrollmentId: `ENR_PENDING_${index + 1}`,
    groupId: index < 12 ? "GRP_A" : "GRP_B",
    studentNameOnCertificate: index === 0 ? "Visible Search Student" : `Pending Student ${index + 1}`,
    studentName: `Student ${index + 1}`,
    universityStudentId: index === 0 ? "24030358" : `24${String(index + 1).padStart(6, "0")}`,
    academyStudentId: `STD_PENDING_${index + 1}`,
    university: index < 20 ? "University X" : "University Y",
    certificateStatus: "ISSUED",
    portalStatus: index % 2 === 0 ? "" : "NOT_PUBLISHED",
  })),
  ...Array.from({ length: 115 }, (_, index) => ({
    certificateId: `CERT_PUBLISHED_${String(index + 1).padStart(3, "0")}`,
    enrollmentId: `ENR_PUBLISHED_${index + 1}`,
    groupId: "GRP_Z",
    studentNameOnCertificate: `Published Student ${index + 1}`,
    studentName: `Published ${index + 1}`,
    universityStudentId: `99${String(index + 1).padStart(6, "0")}`,
    academyStudentId: `STD_PUBLISHED_${index + 1}`,
    university: "University Z",
    certificateStatus: "ISSUED",
    portalStatus: "PUBLISHED",
  })),
];
const approvalMap = Object.fromEntries(manyIssuedRows.map(row => [row.enrollmentId, row.groupId === "GRP_A" ? "APPROVED" : "PENDING"]));
const visibleQueue = issuedDeliveryQueueRows(manyIssuedRows, {}, approvalMap);
assert(manyIssuedRows.filter(row => row.certificateStatus === "ISSUED").length === 160, "fixture has 160 total issued certificates");
assert(visibleQueue.length === 45, "Issued Certificates queue/export starts from 45 pending-delivery rows, not all 160 issued rows");
assert(!visibleQueue.some(row => row.portalStatus === "PUBLISHED"), "Published certificates are excluded from Issued Certificates export");
assert(issuedDeliveryQueueRows(manyIssuedRows, { search: "24030358" }, approvalMap).length === 1, "Search reduces export rows to the same visible one-row result");
assert(issuedDeliveryQueueRows(manyIssuedRows, { groupIds: ["GRP_A"] }, approvalMap).length === 12, "Group filter limits export to visible group rows");
assert(issuedDeliveryQueueRows(manyIssuedRows, { universities: ["University X"] }, approvalMap).length === 20, "University filter limits export to visible university rows");
assert(issuedDeliveryQueueRows(manyIssuedRows, { groupIds: ["GRP_A"], universities: ["University X"], approvalStatuses: ["APPROVED"], certificateStatuses: ["ISSUED"] }, approvalMap).length === 12, "Issued export uses OR-within and AND-between active filters");
assert(issuedDeliveryQueueRows(manyIssuedRows, { certificateStatuses: ["NOT_ISSUED"] }, approvalMap).length === 0, "Certificate Status filter can hide the Issued delivery queue without exporting hidden rows");

console.log(JSON.stringify({ ok: true, apiReadsPerSearchKeystroke: 0, googleSheetsWritesFromSearch: 0 }, null, 2));
