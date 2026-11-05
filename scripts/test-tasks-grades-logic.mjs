import assert from "node:assert/strict";

const bool = value => typeof value === "boolean" ? value : ["true", "yes", "1", "active"].includes(String(value ?? "").trim().toLowerCase());
const status = value => ["NOT_SUBMITTED", "SUBMITTED", "GRADED"].includes(String(value ?? "").trim().toUpperCase()) ? String(value).trim().toUpperCase() : "NOT_SUBMITTED";
const decision = value => ["PENDING", "APPROVED", "NOT_APPROVED"].includes(String(value ?? "").trim().toUpperCase()) ? String(value).trim().toUpperCase() : "PENDING";
const derivedStatusForGradeInput = (rawGrade, existingStatus = "NOT_SUBMITTED") => rawGrade === "" ? "NOT_SUBMITTED" : Number.isFinite(Number(rawGrade)) ? "GRADED" : existingStatus;

function gradebook({ assignment, mappings, enrollments, students, groups, results }) {
  const mapped = new Set(mappings.filter(row => row.Assignment_ID === assignment.Assignment_ID && bool(row.Is_Active)).map(row => row.Group_ID));
  const studentsById = new Map(students.map(row => [row.Academy_Student_ID, row]));
  const groupsById = new Map(groups.map(row => [row.Group_ID, row]));
  const resultByEnrollment = new Map(results.filter(row => row.Assignment_ID === assignment.Assignment_ID).map(row => [row.Enrollment_ID, row]));
  const seen = new Set();
  return enrollments.flatMap(enrollment => {
    if (seen.has(enrollment.Enrollment_ID) || !mapped.has(enrollment.Group_ID)) return [];
    if (groupsById.get(enrollment.Group_ID)?.Batch_ID !== assignment.Batch_ID) return [];
    seen.add(enrollment.Enrollment_ID);
    const result = resultByEnrollment.get(enrollment.Enrollment_ID);
    const student = studentsById.get(enrollment.Academy_Student_ID);
    return [{ enrollmentId: enrollment.Enrollment_ID, academyStudentId: enrollment.Academy_Student_ID, studentName: student?.Student_Name ?? "", studentEmail: String(student?.Email ?? "").trim().toLowerCase(), groupId: enrollment.Group_ID, submissionStatus: result ? status(result.Submission_Status) : "NOT_SUBMITTED", grade: result?.Grade ? Number(result.Grade) : null }];
  });
}

function readiness({ batchId, assignments, mappings, enrollments, students, groups, results, eligibility }) {
  const groupsById = new Map(groups.map(row => [row.Group_ID, row]));
  const resultsByKey = new Map(results.map(row => [`${row.Assignment_ID}:${row.Enrollment_ID}`, row]));
  const eligibilityByEnrollment = new Map(eligibility.map(row => [row.Enrollment_ID, row]));
  const required = assignments.filter(row => row.Batch_ID === batchId && bool(row.Is_Active) && bool(row.Required_For_Certificate));
  const activeMappings = mappings.filter(row => bool(row.Is_Active));
  return enrollments.filter(row => groupsById.get(row.Group_ID)?.Batch_ID === batchId).map(enrollment => {
    const applicable = required.filter(assignment => activeMappings.some(mapping => mapping.Assignment_ID === assignment.Assignment_ID && mapping.Group_ID === enrollment.Group_ID));
    const details = applicable.map(assignment => ({ type: assignment.Assignment_Type, status: status(resultsByKey.get(`${assignment.Assignment_ID}:${enrollment.Enrollment_ID}`)?.Submission_Status), grade: Number(resultsByKey.get(`${assignment.Assignment_ID}:${enrollment.Enrollment_ID}`)?.Grade || 0), max: Number(assignment.Max_Grade || 0) }));
    const completed = item => item.status === "SUBMITTED" || item.status === "GRADED";
    const tasks = details.filter(item => item.type === "TASK");
    const projects = details.filter(item => item.type === "PROJECT");
    const missing = details.filter(item => !completed(item)).length;
    return {
      enrollmentId: enrollment.Enrollment_ID,
      student: students.find(row => row.Academy_Student_ID === enrollment.Academy_Student_ID)?.Student_Name,
      requiredTasks: tasks.length,
      submittedTasks: tasks.filter(completed).length,
      requiredProjects: projects.length,
      submittedProjects: projects.filter(completed).length,
      missing,
      readiness: details.length === 0 ? "NOT_CONFIGURED" : missing === 0 ? "READY" : "NOT_READY",
      decision: decision(eligibilityByEnrollment.get(enrollment.Enrollment_ID)?.Approval_Status),
    };
  });
}

function upsertResult(rows, input) {
  if (input.grade !== null && input.grade !== undefined && (!Number.isFinite(input.grade) || input.grade < 0)) throw new Error("INVALID_GRADE");
  if (input.grade !== null && input.grade !== undefined && input.maxGrade !== null && input.grade > input.maxGrade) throw new Error("INVALID_GRADE");
  if (input.submissionStatus === "GRADED" && input.maxGrade !== null && (input.grade === null || input.grade === undefined)) throw new Error("INVALID_GRADE");
  const existing = rows.find(row => row.Assignment_ID === input.assignmentId && row.Enrollment_ID === input.enrollmentId);
  if (existing) Object.assign(existing, { Submission_Status: input.submissionStatus, Grade: input.grade ?? "" });
  else rows.push({ Assignment_Result_ID: `ASGR_${String(rows.length + 1).padStart(5, "0")}`, Assignment_ID: input.assignmentId, Enrollment_ID: input.enrollmentId, Submission_Status: input.submissionStatus, Grade: input.grade ?? "" });
}

function upsertEligibility(rows, input) {
  const existing = rows.find(row => row.Enrollment_ID === input.enrollmentId);
  if (existing) existing.Approval_Status = input.decision;
  else rows.push({ Certificate_Eligibility_ID: `CERTEL_${String(rows.length + 1).padStart(5, "0")}`, Enrollment_ID: input.enrollmentId, Approval_Status: input.decision });
}

assert.equal(bool("TRUE"), true);
assert.equal(bool("FALSE"), false);
assert.equal(bool("true"), true);
assert.equal(bool("false"), false);
assert.equal(bool(true), true);
assert.equal(bool(false), false);

const fixture = {
  students: [{ Academy_Student_ID: "STU_1", Student_Name: "Student One", Email: "STUDENT.ONE@Example.COM" }, { Academy_Student_ID: "STU_2", Student_Name: "Student Two", Email: "student.two@example.com" }, { Academy_Student_ID: "STU_3", Student_Name: "Student Three", Email: "" }],
  groups: [{ Group_ID: "GRP_A", Batch_ID: "BATCH_1" }, { Group_ID: "GRP_B", Batch_ID: "BATCH_1" }, { Group_ID: "GRP_X", Batch_ID: "BATCH_2" }],
  enrollments: [{ Enrollment_ID: "ENR_1", Academy_Student_ID: "STU_1", Group_ID: "GRP_A" }, { Enrollment_ID: "ENR_2", Academy_Student_ID: "STU_2", Group_ID: "GRP_A" }, { Enrollment_ID: "ENR_3", Academy_Student_ID: "STU_3", Group_ID: "GRP_X" }],
  assignments: [{ Assignment_ID: "ASG_TASK", Batch_ID: "BATCH_1", Assignment_Type: "TASK", Max_Grade: "100", Required_For_Certificate: "TRUE", Is_Active: "TRUE" }, { Assignment_ID: "ASG_PROJECT", Batch_ID: "BATCH_1", Assignment_Type: "PROJECT", Max_Grade: "50", Required_For_Certificate: "TRUE", Is_Active: "TRUE" }, { Assignment_ID: "ASG_OPTIONAL", Batch_ID: "BATCH_1", Assignment_Type: "TASK", Max_Grade: "", Required_For_Certificate: "FALSE", Is_Active: "TRUE" }],
  mappings: [{ Assignment_ID: "ASG_TASK", Group_ID: "GRP_A", Is_Active: "TRUE" }, { Assignment_ID: "ASG_PROJECT", Group_ID: "GRP_A", Is_Active: "TRUE" }, { Assignment_ID: "ASG_OPTIONAL", Group_ID: "GRP_A", Is_Active: "TRUE" }],
};

let results = [];
let gb = gradebook({ assignment: fixture.assignments[0], mappings: fixture.mappings, enrollments: fixture.enrollments, students: fixture.students, groups: fixture.groups, results });
assert.equal(gb.length, 2);
assert.equal(gb.every(row => row.submissionStatus === "NOT_SUBMITTED"), true);
assert.equal(gb[0].studentEmail, "student.one@example.com");
assert.equal(gb.filter(row => `${row.studentName} ${row.academyStudentId} ${row.studentEmail}`.toLowerCase().includes("student.two@example.com")).length, 1);
assert.equal(derivedStatusForGradeInput("85"), "GRADED");
assert.equal(derivedStatusForGradeInput("0"), "GRADED");
assert.equal(derivedStatusForGradeInput(""), "NOT_SUBMITTED");

let ready = readiness({ batchId: "BATCH_1", assignments: fixture.assignments, mappings: fixture.mappings, enrollments: fixture.enrollments, students: fixture.students, groups: fixture.groups, results, eligibility: [] });
assert.equal(ready.length, 2);
assert.equal(ready.every(row => row.readiness === "NOT_READY"), true);
assert.equal(ready.every(row => row.decision === "PENDING"), true);

upsertResult(results, { assignmentId: "ASG_TASK", enrollmentId: "ENR_1", submissionStatus: "SUBMITTED", grade: null, maxGrade: 100 });
assert.equal(results.length, 1);
upsertResult(results, { assignmentId: "ASG_TASK", enrollmentId: "ENR_1", submissionStatus: "GRADED", grade: 90, maxGrade: 100 });
assert.equal(results.length, 1);
upsertResult(results, { assignmentId: "ASG_TASK", enrollmentId: "ENR_2", submissionStatus: "GRADED", grade: 0, maxGrade: 100 });
assert.equal(results.find(row => row.Enrollment_ID === "ENR_2")?.Grade, 0);
upsertResult(results, { assignmentId: "ASG_TASK", enrollmentId: "ENR_2", submissionStatus: "NOT_SUBMITTED", grade: null, maxGrade: 100 });
assert.equal(results.find(row => row.Enrollment_ID === "ENR_2")?.Submission_Status, "NOT_SUBMITTED");
assert.equal(results.find(row => row.Enrollment_ID === "ENR_2")?.Grade, "");
assert.throws(() => upsertResult(results, { assignmentId: "ASG_TASK", enrollmentId: "ENR_1", submissionStatus: "GRADED", grade: 110, maxGrade: 100 }), /INVALID_GRADE/);
results.push({ Assignment_ID: "ASG_PROJECT", Enrollment_ID: "ENR_2", Submission_Status: "SUBMITTED", Grade: "" });
assert.equal(gradebook({ assignment: fixture.assignments[1], mappings: fixture.mappings, enrollments: fixture.enrollments, students: fixture.students, groups: fixture.groups, results }).find(row => row.enrollmentId === "ENR_2")?.submissionStatus, "SUBMITTED");

results.push({ Assignment_ID: "ASG_PROJECT", Enrollment_ID: "ENR_1", Submission_Status: "GRADED", Grade: "45" });
ready = readiness({ batchId: "BATCH_1", assignments: fixture.assignments, mappings: fixture.mappings, enrollments: fixture.enrollments, students: fixture.students, groups: fixture.groups, results, eligibility: [] });
assert.equal(ready.find(row => row.enrollmentId === "ENR_1")?.readiness, "READY");
assert.equal(ready.find(row => row.enrollmentId === "ENR_2")?.readiness, "NOT_READY");

let eligibility = [];
upsertEligibility(eligibility, { enrollmentId: "ENR_1", decision: "APPROVED" });
upsertEligibility(eligibility, { enrollmentId: "ENR_1", decision: "NOT_APPROVED" });
upsertEligibility(eligibility, { enrollmentId: "ENR_1", decision: "PENDING" });
assert.equal(eligibility.length, 1);
assert.equal(eligibility[0].Approval_Status, "PENDING");

console.log(JSON.stringify({ ok: true, productionWrites: 0 }, null, 2));
