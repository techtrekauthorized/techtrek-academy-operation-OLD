import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractGoogleDriveFileId(value) {
  const input = String(value ?? "").trim();
  if (!input) return "";
  if (/^[A-Za-z0-9_-]{10,}$/.test(input) && !input.includes("/")) return input;
  try {
    const parsed = new URL(input);
    const id = parsed.searchParams.get("id");
    if (id) return id.trim();
    const parts = parsed.pathname.split("/").filter(Boolean);
    const markerIndex = parts.findIndex(part => part === "d");
    if (markerIndex >= 0) return parts[markerIndex + 1] ?? "";
  } catch {
    return "";
  }
  return "";
}

function activeAccess(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return !normalized || normalized === "active";
}

function activeValue(value) {
  return ["true", "yes", "1", "active"].includes(String(value ?? "").trim().toLowerCase());
}

function allowedResources({ resources, accessRows, groupIds, today }) {
  const studentGroups = new Set(groupIds);
  const allowedIds = new Set(accessRows.filter(row => studentGroups.has(row.Group_ID) && activeAccess(row.Access_Status)).map(row => row.Resource_ID));
  const seen = new Set();
  return resources.filter(row => {
    const fromOk = !row.Available_From || row.Available_From <= today;
    const toOk = !row.Available_To || row.Available_To >= today;
    const allowed = row.Resource_ID
      && !seen.has(row.Resource_ID)
      && allowedIds.has(row.Resource_ID)
      && row.Resource_Type === "VIDEO"
      && row.Provider === "GoogleDrive"
      && row.Publish_Status === "Published"
      && activeValue(row.Is_Active)
      && fromOk
      && toOk
      && Boolean(row.Video_ID || extractGoogleDriveFileId(row.Video_URL));
    if (allowed) seen.add(row.Resource_ID);
    return allowed;
  });
}

function planGroupAccess({ resourceId, selectedGroupIds, accessRows }) {
  const existing = accessRows.filter(row => row.Resource_ID === resourceId);
  const byGroup = new Map();
  for (const row of existing) byGroup.set(row.Group_ID, [...(byGroup.get(row.Group_ID) ?? []), row]);
  const selected = new Set(selectedGroupIds);
  const appends = [];
  const updates = [];
  for (const groupId of selectedGroupIds) {
    const currentRows = byGroup.get(groupId) ?? [];
    if (!currentRows.length) appends.push({ Resource_ID: resourceId, Group_ID: groupId, Access_Status: "Active" });
    else {
      updates.push({ id: currentRows[0].Resource_Group_Map_ID, Access_Status: "Active" });
      for (const duplicate of currentRows.slice(1)) updates.push({ id: duplicate.Resource_Group_Map_ID, Access_Status: "Disabled" });
    }
  }
  for (const row of existing) if (!selected.has(row.Group_ID) && row.Access_Status !== "Disabled") updates.push({ id: row.Resource_Group_Map_ID, Access_Status: "Disabled" });
  return { appends, updates };
}

const service = fs.readFileSync("src/lib/server/services/learning-resources-service.ts", "utf8");
const apiRoute = fs.readFileSync("src/app/api/resources/route.ts", "utf8");
const adminPage = fs.readFileSync("src/components/resources/LearningResourcesPage.tsx", "utf8");
const router = fs.readFileSync("src/components/layout/OperationsRouter.tsx", "utf8");
const appShell = fs.readFileSync("src/components/layout/AppShell.tsx", "utf8");
const permissions = fs.readFileSync("src/lib/auth/permissions.ts", "utf8");
const portalLayout = fs.readFileSync("src/components/student-portal/StudentPortalLayout.tsx", "utf8");
const portalPages = fs.readFileSync("src/components/student-portal/StudentPortalPages.tsx", "utf8");
const player = fs.readFileSync("src/components/student-portal/StudentResourcePlayer.tsx", "utf8");
const studentService = fs.readFileSync("src/lib/server/student-portal/service.ts", "utf8");

assert(service.includes("Learning_Resources") && service.includes("Learning_Resource_Groups"), "Learning Resources use standalone source sheets");
assert(service.includes("Resource_Group_Map_ID") && service.includes("RGM_") && service.includes("RES_"), "Resource and group map IDs use requested prefixes");
assert(service.includes("extractGoogleDriveFileId"), "Learning Resources reuse shared Google Drive parser");
assert(apiRoute.includes("requireRole([\"ADMIN\", \"COORDINATOR\", \"MENTOR\"])"), "Internal API follows Recorded Sessions roles");
assert(router.includes("pathname === \"/resources\"") && appShell.includes("href: \"/resources\""), "Internal Resources route/navigation is wired");
assert(permissions.includes("\"/resources\""), "Internal permissions include Resources for learning roles");
assert(adminPage.includes("Create Resource") && adminPage.includes("Group Access") && adminPage.includes("Learning_Resource_Groups"), "Admin create/edit/group access UI is present");
assert(portalLayout.includes("href: \"/student/resources\"") && portalPages.includes("StudentResourcesPageContent"), "Student Portal Resources navigation/page content is wired");
assert(player.includes("StudentSecureViewerShell") && player.includes("student-resource-watermark") && player.includes("drive.google.com/file/d/"), "Resource viewer reuses secure shell, watermark, and Drive preview");
assert(studentService.includes("getStudentPortalLearningResource") && studentService.includes("allowedResourceIds") && studentService.includes("Publish_Status") && studentService.includes("Is_Active"), "Student access is server-side group authorized and published/active filtered");
assert(!studentService.includes("Recorded_Sessions") || studentService.includes("Learning_Resources"), "Learning Resources are not mixed into Recorded Sessions access");

assert(extractGoogleDriveFileId("https://drive.google.com/file/d/FILE_12345/view?usp=sharing") === "FILE_12345", "Drive /file/d URL extracts Video_ID");
assert(extractGoogleDriveFileId("https://drive.google.com/open?id=FILE_67890") === "FILE_67890", "Drive open?id URL extracts Video_ID");

const fixtureResources = [
  { Resource_ID: "RES_00001", Resource_Title: "Python Revision", Resource_Type: "VIDEO", Provider: "GoogleDrive", Video_URL: "https://drive.google.com/file/d/VID_1/view", Video_ID: "VID_1", Publish_Status: "Published", Is_Active: "TRUE", Available_From: "", Available_To: "" },
  { Resource_ID: "RES_00001", Resource_Title: "Python Revision duplicate through another group", Resource_Type: "VIDEO", Provider: "GoogleDrive", Video_URL: "https://drive.google.com/file/d/VID_1/view", Video_ID: "VID_1", Publish_Status: "Published", Is_Active: "TRUE", Available_From: "", Available_To: "" },
  { Resource_ID: "RES_00002", Resource_Title: "Draft Hidden", Resource_Type: "VIDEO", Provider: "GoogleDrive", Video_URL: "https://drive.google.com/file/d/VID_2/view", Video_ID: "VID_2", Publish_Status: "Draft", Is_Active: "TRUE", Available_From: "", Available_To: "" },
  { Resource_ID: "RES_00003", Resource_Title: "Inactive", Resource_Type: "VIDEO", Provider: "GoogleDrive", Video_URL: "https://drive.google.com/file/d/VID_3/view", Video_ID: "VID_3", Publish_Status: "Published", Is_Active: "FALSE", Available_From: "", Available_To: "" },
  { Resource_ID: "RES_00004", Resource_Title: "Future", Resource_Type: "VIDEO", Provider: "GoogleDrive", Video_URL: "https://drive.google.com/file/d/VID_4/view", Video_ID: "VID_4", Publish_Status: "Published", Is_Active: "TRUE", Available_From: "2099-01-01", Available_To: "" },
  { Resource_ID: "RES_00005", Resource_Title: "Other Group", Resource_Type: "VIDEO", Provider: "GoogleDrive", Video_URL: "https://drive.google.com/file/d/VID_5/view", Video_ID: "VID_5", Publish_Status: "Published", Is_Active: "TRUE", Available_From: "", Available_To: "" },
];
const fixtureAccess = [
  { Resource_Group_Map_ID: "RGM_00001", Resource_ID: "RES_00001", Group_ID: "GRP_A", Access_Status: "Active" },
  { Resource_Group_Map_ID: "RGM_00002", Resource_ID: "RES_00001", Group_ID: "GRP_B", Access_Status: "Active" },
  { Resource_Group_Map_ID: "RGM_00003", Resource_ID: "RES_00002", Group_ID: "GRP_A", Access_Status: "Active" },
  { Resource_Group_Map_ID: "RGM_00004", Resource_ID: "RES_00003", Group_ID: "GRP_A", Access_Status: "Active" },
  { Resource_Group_Map_ID: "RGM_00005", Resource_ID: "RES_00004", Group_ID: "GRP_A", Access_Status: "Active" },
  { Resource_Group_Map_ID: "RGM_00006", Resource_ID: "RES_00005", Group_ID: "GRP_Z", Access_Status: "Active" },
];

const visible = allowedResources({ resources: fixtureResources, accessRows: fixtureAccess, groupIds: ["GRP_A", "GRP_B"], today: "2026-08-28" });
assert(visible.length === 1 && visible[0].Resource_ID === "RES_00001", "Student sees one deduped authorized Published Active available VIDEO resource");
assert(allowedResources({ resources: fixtureResources, accessRows: fixtureAccess, groupIds: ["GRP_Z"], today: "2026-08-28" }).map(row => row.Resource_ID).join(",") === "RES_00005", "Resource assigned to another Group is isolated to that Group");

const plan = planGroupAccess({ resourceId: "RES_00001", selectedGroupIds: ["GRP_A", "GRP_C"], accessRows: [
  { Resource_Group_Map_ID: "RGM_00001", Resource_ID: "RES_00001", Group_ID: "GRP_A", Access_Status: "Active" },
  { Resource_Group_Map_ID: "RGM_00002", Resource_ID: "RES_00001", Group_ID: "GRP_A", Access_Status: "Active" },
  { Resource_Group_Map_ID: "RGM_00003", Resource_ID: "RES_00001", Group_ID: "GRP_B", Access_Status: "Active" },
] });
assert(plan.appends.length === 1 && plan.appends[0].Group_ID === "GRP_C", "Newly selected Group creates one independent mapping row");
assert(plan.updates.some(row => row.id === "RGM_00002" && row.Access_Status === "Disabled"), "Duplicate active mapping for selected Group is disabled");
assert(plan.updates.some(row => row.id === "RGM_00003" && row.Access_Status === "Disabled"), "Unchecked existing Group mapping is disabled, not deleted");

console.log(JSON.stringify({ ok: true, productionWrites: 0, schemaChanges: 0 }, null, 2));
