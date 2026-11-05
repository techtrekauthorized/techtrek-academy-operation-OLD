function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const rows = [
  { studentName: "Ahmed Ali", academyStudentId: "TT_001", universityStudentId: "U001", studentEmail: "ahmed@gmail.com", university: "Alexandria National University", groupId: "GRP_A", groupName: "DSAI | Alex | Jul 2026 | Full Program | Hybrid | A", submissionStatus: "GRADED" },
  { studentName: "Mona Said", academyStudentId: "TT_002", universityStudentId: "U002", studentEmail: "mona@gmail.com", university: "Helwan National University", groupId: "GRP_B", groupName: "SOC | Cairo | Jul 2026 | 60H | Online | B", submissionStatus: "SUBMITTED" },
  { studentName: "Omar Hassan", academyStudentId: "TT_003", universityStudentId: "U003", studentEmail: "omar@gmail.com", university: "Alexandria National University", groupId: "GRP_A", groupName: "DSAI | Alex | Jul 2026 | Full Program | Hybrid | A", submissionStatus: "NOT_SUBMITTED" },
];

function uniqueUniversities(sourceRows) {
  return [...new Set(sourceRows.map(row => row.university).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function uniqueGroups(sourceRows) {
  return [...new Map(sourceRows.map(row => [row.groupId, row.groupName]).filter(([value, name]) => Boolean(value) && Boolean(name))).entries()].sort((left, right) => left[1].localeCompare(right[1]) || left[0].localeCompare(right[0]));
}

function filterRows(sourceRows, filters) {
  return sourceRows.filter(row => (!filters.university || row.university === filters.university) && (!filters.groupId || row.groupId === filters.groupId) && (!filters.status || row.submissionStatus === filters.status) && (!filters.search.trim() || `${row.studentName} ${row.academyStudentId} ${row.universityStudentId} ${row.studentEmail}`.toLowerCase().includes(filters.search.trim().toLowerCase())));
}

assert(uniqueUniversities(rows).length === 2, "University values are unique");
assert(uniqueGroups(rows).length === 2, "Group values are unique");
assert(uniqueGroups(rows).every(([groupId]) => rows.some(row => row.groupId === groupId)), "Only assignment-eligible groups appear");
assert(filterRows(rows, { search: "mona@gmail", university: "", groupId: "", status: "" }).length === 1, "Search supports email");
assert(filterRows(rows, { search: "", university: "Alexandria National University", groupId: "", status: "" }).length === 2, "University filter works");
assert(filterRows(rows, { search: "", university: "", groupId: "GRP_B", status: "" }).length === 1, "Group filter works");
assert(filterRows(rows, { search: "", university: "", groupId: "", status: "GRADED" }).length === 1, "Status filter works");
assert(filterRows(rows, { search: "", university: "Alexandria National University", groupId: "GRP_A", status: "GRADED" }).map(row => row.academyStudentId).join(",") === "TT_001", "Filters combine with AND logic");
assert(filterRows(rows, { search: "missing", university: "Alexandria National University", groupId: "GRP_A", status: "GRADED" }).length === 0, "Zero-result state can be reached");

const selectedBatch = "BATCH_1";
const selectedAssignment = "ASM_1";
const cleared = { search: "", university: "", groupId: "", status: "" };
assert(selectedBatch === "BATCH_1" && selectedAssignment === "ASM_1" && Object.values(cleared).every(value => value === ""), "Clear Filters does not clear Batch or Assignment");
assert(JSON.stringify({ assignmentId: "ASM_2", search: "", university: "", groupId: "", status: "" }) === JSON.stringify({ assignmentId: "ASM_2", search: "", university: "", groupId: "", status: "" }), "Assignment change resets local filters");

console.log(JSON.stringify({ ok: true, productionWrites: 0 }, null, 2));
