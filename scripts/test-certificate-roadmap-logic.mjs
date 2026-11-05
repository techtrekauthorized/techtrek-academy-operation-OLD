function bool(value) {
  return ["true", "yes", "1", "active"].includes(String(value ?? "").trim().toLowerCase());
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateGroupAssignment({ batchId, groupId, roadmapId }, { batches, groups, roadmaps, batchRoadmaps }) {
  assert(batches.some(row => row.Batch_ID === batchId), "Batch exists");
  const group = groups.find(row => row.Group_ID === groupId);
  assert(group, "Group exists");
  assert(group.Batch_ID === batchId, "Group belongs to Batch");
  const roadmap = roadmaps.find(row => row.Roadmap_ID === roadmapId);
  assert(roadmap && bool(roadmap.Is_Active), "Roadmap active");
  const active = batchRoadmaps.filter(row => row.Batch_ID === batchId && row.Group_ID === groupId && bool(row.Is_Active));
  assert(active.length <= 1, "No duplicate active Batch+Group mapping");
  return active[0];
}

function reassignRoadmap(input, data) {
  const current = validateGroupAssignment(input, data);
  const updates = current && current.Roadmap_ID !== input.roadmapId ? [{ ...current, Is_Active: "FALSE" }] : [];
  const appends = !current || current.Roadmap_ID !== input.roadmapId ? [{ Batch_Roadmap_ID: "BRDM_00003", Batch_ID: input.batchId, Group_ID: input.groupId, Roadmap_ID: input.roadmapId, Is_Active: "TRUE" }] : [];
  const finalRows = data.batchRoadmaps.map(row => updates.find(update => update.Batch_Roadmap_ID === row.Batch_Roadmap_ID) ?? row).concat(appends);
  assert(finalRows.filter(row => row.Batch_ID === input.batchId && row.Group_ID === input.groupId && bool(row.Is_Active)).length === 1, "Reassignment leaves one active mapping");
  return finalRows;
}

function assignRoadmapToGroups(input, data) {
  assert(input.groupIds.length > 0, "Assign disabled with zero groups");
  const updates = [];
  const appends = [];
  let sequence = 10;
  let unchanged = 0;
  for (const groupId of input.groupIds) {
    const current = validateGroupAssignment({ ...input, groupId }, data);
    if (current?.Roadmap_ID === input.roadmapId) {
      unchanged++;
      continue;
    }
    if (current) updates.push({ ...current, Is_Active: "FALSE" });
    appends.push({ Batch_Roadmap_ID: `BRDM_${String(sequence++).padStart(5, "0")}`, Batch_ID: input.batchId, Group_ID: groupId, Roadmap_ID: input.roadmapId, Is_Active: "TRUE" });
  }
  const finalRows = data.batchRoadmaps.map(row => updates.find(update => update.Batch_Roadmap_ID === row.Batch_Roadmap_ID) ?? row).concat(appends);
  for (const groupId of input.groupIds) assert(finalRows.filter(row => row.Batch_ID === input.batchId && row.Group_ID === groupId && bool(row.Is_Active)).length === 1, "No duplicate active Batch+Group mappings after multi-assign");
  return { finalRows, appends, updates, unchanged };
}

function resolveRoadmapForIssuance(enrollmentId, data) {
  const enrollment = data.enrollments.find(row => row.Enrollment_ID === enrollmentId);
  assert(enrollment, "Enrollment exists");
  const group = data.groups.find(row => row.Group_ID === enrollment.Group_ID);
  assert(group, "Enrollment Group exists");
  const active = data.batchRoadmaps.filter(row => row.Batch_ID === group.Batch_ID && row.Group_ID === group.Group_ID && bool(row.Is_Active));
  if (active.length === 0) return { error: "ROADMAP_GROUP_MAPPING_NOT_FOUND" };
  if (active.length > 1) return { error: "ROADMAP_GROUP_MAPPING_CONFLICT" };
  return { roadmapId: active[0].Roadmap_ID };
}

const data = {
  batches: [{ Batch_ID: "BATCH_1" }],
  groups: [{ Group_ID: "GRP_60", Batch_ID: "BATCH_1" }, { Group_ID: "GRP_120", Batch_ID: "BATCH_1" }, { Group_ID: "GRP_OTHER", Batch_ID: "BATCH_2" }],
  roadmaps: [{ Roadmap_ID: "RDM_60", Is_Active: "TRUE" }, { Roadmap_ID: "RDM_120", Is_Active: "TRUE" }],
  enrollments: [{ Enrollment_ID: "ENR_60", Group_ID: "GRP_60" }, { Enrollment_ID: "ENR_120", Group_ID: "GRP_120" }],
  batchRoadmaps: [
    { Batch_Roadmap_ID: "BRDM_00001", Batch_ID: "BATCH_1", Group_ID: "GRP_60", Roadmap_ID: "RDM_60", Is_Active: "TRUE" },
    { Batch_Roadmap_ID: "BRDM_00002", Batch_ID: "BATCH_1", Group_ID: "GRP_120", Roadmap_ID: "RDM_120", Is_Active: "TRUE" },
  ],
};

assert(resolveRoadmapForIssuance("ENR_60", data).roadmapId === "RDM_60", "60H Group resolves 60H roadmap");
assert(resolveRoadmapForIssuance("ENR_120", data).roadmapId === "RDM_120", "120H Group resolves 120H roadmap");
assert(resolveRoadmapForIssuance("ENR_60", { ...data, batchRoadmaps: data.batchRoadmaps.filter(row => row.Group_ID !== "GRP_60") }).error === "ROADMAP_GROUP_MAPPING_NOT_FOUND", "Missing Group roadmap blocks issuance");
assert(resolveRoadmapForIssuance("ENR_60", { ...data, batchRoadmaps: [...data.batchRoadmaps, { Batch_Roadmap_ID: "BRDM_DUP", Batch_ID: "BATCH_1", Group_ID: "GRP_60", Roadmap_ID: "RDM_120", Is_Active: "TRUE" }] }).error === "ROADMAP_GROUP_MAPPING_CONFLICT", "Multiple active mappings block issuance");
let outsideRejected = false;
try { validateGroupAssignment({ batchId: "BATCH_1", groupId: "GRP_OTHER", roadmapId: "RDM_60" }, data); } catch { outsideRejected = true; }
assert(outsideRejected, "Group outside Batch rejected");
const reassigned = reassignRoadmap({ batchId: "BATCH_1", groupId: "GRP_60", roadmapId: "RDM_120" }, data);
assert(reassigned.find(row => row.Batch_Roadmap_ID === "BRDM_00001").Is_Active === "FALSE", "Old mapping deactivated");
assert(reassigned.some(row => row.Group_ID === "GRP_60" && row.Roadmap_ID === "RDM_120" && bool(row.Is_Active)), "New mapping active");
const multiData = { ...data, groups: [...data.groups, { Group_ID: "GRP_NEW", Batch_ID: "BATCH_1" }] };
const multiAssigned = assignRoadmapToGroups({ batchId: "BATCH_1", groupIds: ["GRP_60", "GRP_120", "GRP_NEW"], roadmapId: "RDM_120" }, multiData);
assert(multiAssigned.appends.length === 2, "Three selected Groups create independent mappings except idempotent existing same-Roadmap");
assert(multiAssigned.unchanged === 1, "Same Roadmap existing mapping is idempotent");
assert(multiAssigned.finalRows.some(row => row.Group_ID === "GRP_NEW" && row.Roadmap_ID === "RDM_120" && bool(row.Is_Active)), "New Group mapping created");
let partialInvalidRejected = false;
try { assignRoadmapToGroups({ batchId: "BATCH_1", groupIds: ["GRP_60", "GRP_OTHER"], roadmapId: "RDM_120" }, data); } catch { partialInvalidRejected = true; }
assert(partialInvalidRejected, "Partial invalid multi-group selection rejected before write plan success");

console.log(JSON.stringify({ ok: true, productionWrites: 0 }, null, 2));
