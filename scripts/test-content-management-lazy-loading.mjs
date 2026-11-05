import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const checks = [
  {
    label: "Recorded Sessions",
    component: "src/components/attendance/AttendancePages.tsx",
    route: "src/app/api/attendance/recorded-sessions/route.ts",
    service: "src/lib/server/services/recorded-sessions-service.ts",
    formUrl: "/api/attendance/recorded-sessions?mode=form",
    existingUrl: "/api/attendance/recorded-sessions?mode=existing",
    formService: "getRecordedSessionsFormData",
    existingService: "getRecordedSessionsExistingData",
    existingState: "Loading existing recordings...",
  },
  {
    label: "Session Materials",
    component: "src/components/materials/SessionMaterialsPage.tsx",
    route: "src/app/api/attendance/session-materials/route.ts",
    service: "src/lib/server/services/session-materials-service.ts",
    formUrl: "/api/attendance/session-materials?mode=form",
    existingUrl: "/api/attendance/session-materials?mode=existing",
    formService: "getSessionMaterialsFormData",
    existingService: "getSessionMaterialsExistingData",
    existingState: "Loading existing materials...",
  },
  {
    label: "Learning Resources",
    component: "src/components/resources/LearningResourcesPage.tsx",
    route: "src/app/api/resources/route.ts",
    service: "src/lib/server/services/learning-resources-service.ts",
    formUrl: "/api/resources?mode=form",
    existingUrl: "/api/resources?mode=existing",
    formService: "getLearningResourcesFormData",
    existingService: "getLearningResourcesExistingData",
    existingState: "Loading existing resources...",
  },
];

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const check of checks) {
  const component = read(check.component);
  const route = read(check.route);
  const service = read(check.service);

  assert(component.includes('useState("Add New")'), `${check.label}: Add New is not the default tab.`);
  assert(component.includes('tabs={["Add New", "Existing"]}'), `${check.label}: Add New/Existing tabs not found.`);
  assert(component.includes(check.formUrl), `${check.label}: initial form-mode API call not found.`);
  assert(component.includes(check.existingUrl), `${check.label}: existing-mode lazy API call not found.`);
  assert(component.includes('activeContentTab === "Existing"'), `${check.label}: Existing tab gate not found.`);
  assert(component.includes("existingLoaded") && component.includes("existingStale"), `${check.label}: cache/stale state not found.`);
  assert(component.includes("setExistingStale(true)"), `${check.label}: create/edit does not invalidate existing data.`);
  assert(component.includes(check.existingState), `${check.label}: first-load Existing loading text not found.`);

  assert(route.includes('searchParams.get("mode")'), `${check.label}: API mode switch not found.`);
  assert(route.includes(`mode === "form"`) && route.includes(check.formService), `${check.label}: form mode service not wired.`);
  assert(route.includes(`mode === "existing"`) && route.includes(check.existingService), `${check.label}: existing mode service not wired.`);

  assert(service.includes(`export async function ${check.formService}`), `${check.label}: form service split not exported.`);
  assert(service.includes(`export async function ${check.existingService}`), `${check.label}: existing service split not exported.`);
}

console.log("Content management lazy-loading checks passed.");
