export const ROLES = ["SALES", "COORDINATOR", "ADMIN", "MENTOR"] as const;
export type UserRole = typeof ROLES[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  SALES: "Sales",
  COORDINATOR: "Coordinator",
  ADMIN: "Administrator",
  MENTOR: "Mentor",
};

const SALES_ROUTES = ["/students"];
const MENTOR_ROUTES = [
  "/group-rosters",
  "/attendance",
  "/recorded-sessions",
  "/session-materials",
  "/resources",
  "/student-documents",
  "/academic-records",
  "/certificates",
];
const COORDINATOR_ROUTES = [
  ...SALES_ROUTES,
  "/student-placement",
  "/group-rosters",
  "/schedule",
  "/attendance",
  "/recorded-sessions",
  "/session-materials",
  "/resources",
  "/student-documents",
  "/academic-records",
  "/certificates",
  "/collections",
];

const ACTIVE_ADMIN_ROUTES = [
  "/dashboard",
  "/analysis",
  ...COORDINATOR_ROUTES,
  "/tracks-groups",
  "/groups",
  "/staff-payroll",
  "/payroll",
  "/expenses",
  "/profitability",
  "/settings",
];

export const ROUTES_BY_ROLE: Record<UserRole, readonly string[]> = {
  SALES: SALES_ROUTES,
  COORDINATOR: COORDINATOR_ROUTES,
  ADMIN: ACTIVE_ADMIN_ROUTES,
  MENTOR: MENTOR_ROUTES,
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && ROLES.includes(value as UserRole);
}

export function canAccessRoute(role: UserRole, pathname: string) {
  const normalized = pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return ROUTES_BY_ROLE[role].some(route => normalized === route || normalized.startsWith(`${route}/`));
}

export function getDefaultRouteForRole(role: UserRole) {
  if (role === "ADMIN") return "/dashboard";
  if (role === "MENTOR") return "/group-rosters";
  return "/students";
}
