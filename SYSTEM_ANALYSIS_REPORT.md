# TechTrek Academy Operations System — System Analysis Report

**Review scope:** Current `techtrek-academy-operations` Next.js frontend only  
**Review date:** 2 July 2026  
**Review mode:** Product, process, UX, frontend architecture, and database-readiness analysis; no implementation changes

# 1. Executive Summary

## Current product capability

The current frontend is a broad, staff-only academy operations prototype. It presents a coherent red-and-white internal operations shell and demonstrates the intended workflows for students, groups, schedules, attendance, academic records, collections, staff/payroll, expenses, profitability, certificates, permissions, settings, and spreadsheet imports.

The strongest parts are the information architecture, shared visual language, responsive shell, reusable table/card/badge primitives, and the breadth of operational concepts represented. The UI makes the planned product understandable to stakeholders and is useful as a schema-discovery artifact.

The application is not yet a transactional system. It has no backend, authentication, authorization enforcement, API routes, persistence, database, Google Sheets integration, real file parsing, receipt generation, payroll engine, or certificate generation. Most create/update actions either show a toast, change component-local React state until refresh, navigate to another route, or call a browser alert.

## What appears complete as a frontend prototype

- Global desktop/mobile application shell with 12 primary sidebar categories.
- Login mock and redirect to the operations dashboard.
- All 26 planned business route patterns render through the client-side route dispatcher.
- Responsive dashboard, dense tables, filters, tabs, cards, drawers, modals, confirmation dialog, toast, empty state, and horizontal table scrolling.
- Local student registry filtering and profile navigation.
- Student registration form layout and basic native constraint checks.
- Track/group overview, track detail, and an extensive group workspace.
- Schedule views and a create-session form that represents shared teaching.
- Quick attendance and roster editing in local state.
- Academic record editing in local state.
- Mock payment recording, receipt preview, ledger, and outstanding-balance views.
- Staff directory, staff profile, payroll review, and expense entry.
- Profitability, certificate eligibility, user/permission, settings, import-batch, and audit-log concepts.

## Mock/static-only areas

- All domain records come from `src/data/mock.ts` or inline arrays inside page components.
- KPI totals such as 1,482 students, 42 groups, and EGP 2.4M collections are hard-coded and do not reconcile with the seven students and six groups in mock data.
- Login accepts any browser-valid submission and does not validate credentials.
- Global search is a page-jump list; entered query text does not filter its links.
- Notifications and account controls do nothing.
- Generic row action menus from `DataTable` do nothing.
- Pagination controls do nothing.
- Several dropdowns use `value=""` and `onChange={() => undefined}`, so they are visual only.
- Receipt print/download, certificate issue/download, exports, document assets, staff creation, track/group creation, and edit actions are placeholders.
- Imported files are not parsed; only the selected filename is displayed.
- No state survives navigation or refresh unless it lives in the same mounted component.

## Missing before backend/database implementation

The product needs business decisions before a stable schema can be finalized, especially around enrollment history, intakes, student status, group transfer rules, session-to-group allocation, attendance finalization/editing, assessment structure, payment reversal/void/refund rules, receipt numbering, payroll calculation and approval, expense allocation, certificate policy versioning, and role permissions.

The frontend also needs an architectural transition from one catch-all client dispatcher to explicit App Router routes and server-aware data boundaries. Authentication, authorization, audit fields, idempotency, optimistic concurrency, backend validation, and source-of-truth rules must be designed before connecting forms to Google Sheets or another datastore.

## Main risks and inconsistencies

1. **Catch-all routing risk:** only `/login` and `/` have dedicated page modules. All business pages are selected by `usePathname()` in `OperationsRouter.tsx`. This prevents clean route-level metadata, loading/error boundaries, server rendering, route authorization, and modular data fetching.
2. **Invalid identifiers silently show another record:** unknown student, group, track, or staff IDs fall back to the first mock item rather than a not-found state. This would be dangerous with real records.
3. **Data denormalization:** `Student` directly contains track, group, package, total, paid, attendance, payment status, and certificate status. `Group` directly contains instructor names, mentor names, counts, collections, and profitability. These values should mostly be relationships or calculations.
4. **No enrollment entity:** a student can only have one current track/group/package. Transfers, re-enrollment, withdrawals, and historical cohorts cannot be represented.
5. **No intake entity despite UI references:** “Summer 2026,” intake metrics, and peak intake forecasting appear in UI but are not modeled.
6. **Finance source-of-truth conflict:** contract total and paid amount are stored on `Student`, while payments are stored separately. Balances can drift. Payments and adjustments should drive paid/remaining values.
7. **Receipt/payment coupling is underspecified:** `Payment.receipt` is a string, but receipt lifecycle, numbering, voiding, replacement, and printing are separate business concerns.
8. **Payroll source-of-truth conflict:** approved hours, accrued earnings, and paid amount are stored on each `Staff` mock, while payroll periods and lines are not modeled.
9. **Certificate rules are incorrect placeholders:** task completion and score eligibility are inferred from attendance percentages in `CertificatesPage`.
10. **Permission matrix is presentation-only:** checkboxes are uncontrolled and the six permission columns are too coarse for sensitive finance, payroll, user, and audit operations.
11. **Mixed data ownership:** many tables combine entity attributes, aggregates, statuses, and workflow fields with no distinction between stored and calculated data.
12. **Google Sheets concurrency risk:** spreadsheet rows alone will not safely enforce unique IDs, atomic payment/receipt creation, balance consistency, permission security, or audit immutability.
13. **Encoding artifacts:** source inspection shows mojibake such as `Â·`, `â†’`, `â€“`, `âœ“`, `âŒ˜`, and `Â©` in several files. These must be normalized before production content is accepted.
14. **Unused starter assets:** `public/` contains only unused default Next.js SVGs. The TechTrek mark is text/CSS, not a managed brand asset.

# 2. Project Architecture Overview

## Framework and routing

| Area | Current implementation | Assessment |
|---|---|---|
| Framework | Next.js 16.2.10, React 19.2.4, TypeScript 5 | Modern and suitable. |
| Router | App Router | Present, but not used idiomatically for business routes. |
| Styling | Tailwind CSS 4 plus `src/app/globals.css` | Coherent, responsive, desktop-first visual system. |
| Icons | `lucide-react` | Appropriate. |
| Root route | `src/app/page.tsx` redirects `/` to `/dashboard` | Correct convenience behavior. |
| Login route | Dedicated `src/app/login/page.tsx` | Appropriate separation, but mock-only. |
| Operations routes | `src/app/[...slug]/page.tsx` → `AppShell` → `OperationsRouter` | Functional prototype pattern; should be replaced with explicit route modules before backend integration. |
| Unknown routes | `OperationsRouter` returns an in-app “Page not found” card | Does not use Next.js `notFound()` or HTTP 404 semantics. |

## Main folder responsibilities

| Path | Responsibility | Notes |
|---|---|---|
| `src/app/` | Root layout, global CSS, root redirect, login, catch-all operations page | No route groups, nested layouts, loading states, error boundaries, or route-specific metadata. |
| `src/components/layout/` | `AppShell`, sidebar/topbar, and `OperationsRouter` | Navigation is centralized, but routing and rendering are tightly coupled in one client component. |
| `src/components/ui/` | Buttons, link buttons, badges, cards, headers, breadcrumbs, search/select/field, tabs, states, table, filters, overlays, toast | Good reuse foundation; many controls are intentionally simplistic. |
| `src/components/dashboard/` | Dashboard | One domain component. |
| `src/components/students/` | Registry, registration, profile, quick card, timeline | Three page components share one large `StudentsPages.tsx`. |
| `src/components/groups/` | Track/group control center, track detail, group detail, group summary | `GroupsPages.tsx` is large and contains 15+ business concerns. |
| `src/components/schedule/` | Master schedule, create session, session card | Conflict logic is hard-coded. |
| `src/components/attendance/` | Quick attendance, roster, status selector | State is not tied to a selected session. |
| `src/components/academic/` | Academic center and group record sheet | Assessment model is missing. |
| `src/components/collections/` | Quick collections, ledger, outstanding balances, receipt preview | Payment method/type selectors are partially nonfunctional. |
| `src/components/staff/` | Staff directory/profile, payroll, expenses | Separate business domains are bundled into one source file. |
| `src/components/admin/` | Profitability, certificates, users/permissions, settings, imports/audit | Unrelated sensitive domains share one large source file. |
| `src/data/mock.ts` | Typed mock students, groups, sessions, staff, payments, expenses, academic records; untyped reference/user/timeline arrays | Central prototype dataset; not a persistence abstraction. |
| `src/types/index.ts` | Eight domain/interface types | Missing most join/history/workflow entities. |
| `public/` | Default Next.js SVGs | No TechTrek production assets; existing files appear unused. |

## Shared layout components

### `AppShell`

- Fixed 260px desktop sidebar at `xl` and above.
- Mobile off-canvas sidebar controlled by local state.
- Sticky 64px topbar.
- `ToastProvider` wraps every operations page.
- Main content width capped at 1440px.
- Hard-coded signed-in user “Nadia Fawzy / Administrator.”

### Sidebar

- Twelve required primary navigation items.
- Expandable nested links for students, schedule, attendance, collections, staff/payroll/expenses, and settings/imports.
- Active state comes from `usePathname()`.
- Brand links to `/dashboard`.
- User card has a chevron but no menu or logout.

### Topbar

- Mobile navigation button.
- Search/command-palette trigger with Ctrl/Cmd+K.
- Page-jump overlay built from navigation items.
- Notification button with no behavior.
- Hard-coded “Admin Ops / System operational” identity/status.

## Shared UI components

| Component | Current purpose | Gaps before production |
|---|---|---|
| `Button`, `LinkButton` | Standard primary/secondary/ghost/danger actions | No loading convention, permission guard, tooltip, or analytics/audit contract. |
| `StatusBadge` | Infers tone by regex over displayed text | Status semantics should be explicit; regex can misclassify new/localized statuses. |
| `Card`, `KpiCard` | Consistent surfaces and KPI display | KPI source/date/as-of metadata is missing. |
| `PageHeader`, `Breadcrumbs` | Titles, descriptions, contextual actions/navigation | Not integrated with route metadata. |
| `SearchInput`, `Select`, `Field` | Simple controlled input primitives | No error text, schema validation, disabled/read-only consistency, or form-library integration. |
| `Tabs` | Local-state content switching | No URL/deep-link state; refresh always returns to first tab. |
| `DataTable` | Generic responsive table with optional selection and row click | Selection is not controlled; “select all” and action menu buttons do nothing; no sort, real pagination, column config, or bulk-action contract. |
| `FilterBar` | Layout wrapper and result count | No common query/filter model. |
| `Modal`, `Drawer` | Overlay patterns | Drawer stays mounted offscreen; no focus trap, Escape handling, or dirty-form protection. |
| `ConfirmDialog` | Confirmation pattern | Used only for attendance finalization. |
| `ToastProvider` | Single temporary success message | No severity, queue, persistent error, action, or accessible timing strategy. |
| Empty/loading/error/permission states | Basic placeholders | Exported but not used by route-level fetching because no data fetching exists. |

## Mock objects and types

### Declared TypeScript types

| Type | Fields |
|---|---|
| `Student` | `id`, `universityId`, `name`, `email`, `phone`, `university`, `college`, `track`, `group`, `package`, `mode`, `total`, `paid`, `attendance`, `paymentStatus`, `certificateStatus` |
| `Group` | `id`, `name`, `trackId`, `track`, `package`, `mode`, `instructor`, `mentors[]`, `students`, `capacity`, `attendance`, `collections`, `profitability`, `nextSession` |
| `Session` | `id`, `title`, `date`, `time`, `endTime`, `groups[]`, `track`, `instructor`, `mode`, `venue`, `status` |
| `Staff` | `id`, `name`, `initials`, `role`, `specialty`, `rate`, `approvedHours`, `accrued`, `paid`, `groups[]`, `status` |
| `Payment` | `id`, `studentId`, `student`, `date`, `type`, `method`, `amount`, `receipt`, `status` |
| `Expense` | `id`, `date`, `category`, `vendor`, `description`, `amount`, `linkedTo`, `status` |
| `AcademicRecord` | `studentId`, `student`, `task`, `completed`, `score`, `notes`, `updatedBy`, `updatedAt` |
| `AttendanceStatus` | `Present`, `Late`, `Absent`, `Excused` |
| `StatusTone` | `success`, `warning`, `danger`, `info`, `neutral` |

### Mock collections

- `students`: seven typed students.
- `groups`: six typed groups.
- `sessions`: five typed sessions, including one multi-group shared session.
- `staff`: six typed staff members.
- `payments`: four typed payment records.
- `expenses`: four typed expenses.
- `academicRecords`: six generated records based on the first six students.
- `universities`: six untyped strings.
- `tracks`: four untyped strings.
- `packages`: three untyped strings.
- `timeline`: four untyped activity objects.
- `users`: six untyped string arrays; this is especially fragile because indexes represent name/email/role/status.
- Additional inline arrays exist for dashboard activity, staff work hours/history, permission roles, settings categories, import batches, audit events, and group activity.

## Duplicated or unclear architecture

- Page components are grouped by broad domain source files instead of route modules; some files exceed 14 KB and contain multiple workflows.
- Student, group, and track data repeat human-readable names instead of stable foreign keys.
- Student profile, group detail, and domain centers duplicate payment, attendance, academic, certificate, and profitability views. Some duplication is appropriate as contextual summaries, but edit ownership is unclear.
- `/staff-payroll` title combines staff and payroll even though `/payroll` is a separate page.
- Group detail has both “Schedule” and “Sessions” tabs rendering the same component/data.
- Staff profile has both “Payroll History” and “Payment History” tabs rendering the same table.
- `/imports-audit` combines three materially different functions in tabs. This is acceptable for navigation but likely needs separate services/entities.
- No shared domain service or repository layer exists; page components import mock arrays directly.
- Business calculations are embedded in JSX and duplicated (`total - paid`, `accrued - paid`, arbitrary profitability constants).

# 3. Full Route Inventory

> “File Path” identifies the component that actually renders the route. Except for `/login` and `/`, all business routes enter through `src/app/[...slug]/page.tsx` and are selected in `src/components/layout/OperationsRouter.tsx`.

| Route | Page Name | File Path | Main Purpose | Main Components | Status |
|---|---|---|---|---|---|
| `/` | Root Redirect | `src/app/page.tsx` | Redirect staff to the dashboard. | `redirect()` | Essential |
| `/login` | Administrative Login | `src/app/login/page.tsx` | Mock internal staff sign-in. | `Field`, `Button` | Keep but improve |
| `/dashboard` | Operations Dashboard | `src/components/dashboard/DashboardPage.tsx` | Cross-domain operational overview and exception routing. | `PageHeader`, `KpiCard`, `SessionCard`, tables/cards | Essential |
| `/students` | Students Master Registry | `src/components/students/StudentsPages.tsx` → `StudentsPage` | Search and monitor all students. | Filters, `DataTable`, KPI cards | Essential |
| `/students/new` | Register Student | `src/components/students/StudentsPages.tsx` → `NewStudentPage` | Create identity, enrollment, contract, and opening payment. | Form cards, fields, selects | Essential |
| `/students/[id]` | Student Profile | `src/components/students/StudentsPages.tsx` → `StudentProfilePage` | Consolidated student operational record. | Profile header, 7 tabs, tables, timeline | Essential |
| `/tracks-groups` | Tracks & Groups Control Center | `src/components/groups/GroupsPages.tsx` → `TracksGroupsPage` | Portfolio/group capacity and performance control. | KPI cards, track cards, group table | Essential |
| `/tracks-groups/[trackId]` | Track Detail | `src/components/groups/GroupsPages.tsx` → `TrackDetailPage` | Track-level groups, finance, and resources. | KPI cards, 3 tabs, group cards, chart | Keep but improve |
| `/groups/[groupId]` | Group Detail | `src/components/groups/GroupsPages.tsx` → `GroupDetailPage` | Main operational workspace for one cohort. | 11 tabs, tables, session/team cards | Essential |
| `/schedule` | Master Schedule | `src/components/schedule/SchedulePages.tsx` → `SchedulePage` | Coordinate sessions across groups/staff/venues. | Calendar/list controls, filters, session cards | Essential |
| `/schedule/new` | Create Session | `src/components/schedule/SchedulePages.tsx` → `NewSessionPage` | Create single- or multi-group teaching session. | Form, conflict card, summary | Essential |
| `/attendance` | Quick Attendance Desk | `src/components/attendance/AttendancePages.tsx` → `AttendancePage` | Mark one found student quickly. | Selectors, lookup, quick card, status buttons | Essential |
| `/attendance/roster` | Group Attendance Roster | `src/components/attendance/AttendancePages.tsx` → `AttendanceRosterPage` | Bulk mark/finalize a session roster. | Editable table, confirmation dialog | Essential |
| `/academic-records` | Academic Records Center | `src/components/academic/AcademicPages.tsx` → `AcademicRecordsPage` | Choose group/assessment for staff recording. | KPI cards, filters, group cards | Essential |
| `/academic-records/[groupId]` | Group Academic Record Sheet | `src/components/academic/AcademicPages.tsx` → `GroupAcademicPage` | Bulk edit task completion, score, and notes. | Editable table | Essential |
| `/collections` | Quick Collection Desk | `src/components/collections/CollectionsPages.tsx` → `CollectionsPage` | Find student, review balance, record payment, preview receipt. | Lookup, KPI cards, payment drawer, receipt modal | Essential |
| `/collections/ledger` | Payment Ledger & Receipt History | `src/components/collections/CollectionsPages.tsx` → `PaymentLedgerPage` | Search/reconcile all payments and receipts. | KPI cards, filters, table, receipt modal | Essential |
| `/collections/outstanding` | Outstanding Balances | `src/components/collections/CollectionsPages.tsx` → `OutstandingBalancesPage` | Collections follow-up queue. | KPI cards, filters, table | Keep but improve |
| `/staff-payroll` | Staff Directory & Payroll | `src/components/staff/StaffPages.tsx` → `StaffDirectoryPage` | Staff directory with current payroll snapshot. | KPI cards, filters, staff table | Keep but improve |
| `/staff-payroll/[staffId]` | Staff Profile | `src/components/staff/StaffPages.tsx` → `StaffProfilePage` | Assignment, hours, compensation, and payout history. | Profile header, 7 tabs, tables/cards | Essential |
| `/payroll` | Payroll | `src/components/staff/StaffPages.tsx` → `PayrollPage` | Review and approve payroll period lines. | Period selector, KPI cards, selectable table | Essential |
| `/expenses` | Expenses | `src/components/staff/StaffPages.tsx` → `ExpensesPage` | Enter, categorize, link, and approve operational costs. | KPI cards, filters, table, add drawer | Essential |
| `/profitability` | Profitability Dashboard | `src/components/admin/AdminPages.tsx` → `ProfitabilityPage` | Compare revenue, collections, cost, payroll, and margin. | Filters, KPI cards, static charts | Keep but improve |
| `/certificates` | Certificate Eligibility & Issuance | `src/components/admin/AdminPages.tsx` → `CertificatesPage` | Review eligibility and issue/download certificates. | KPI cards, filters, eligibility table | Essential |
| `/users-permissions` | Users & Permissions | `src/components/admin/AdminPages.tsx` → `UsersPermissionsPage` | Internal accounts and role matrix. | 2 tabs, user table, permission matrix, invite drawer | Essential |
| `/settings` | Settings Hub | `src/components/admin/AdminPages.tsx` → `SettingsPage` | Reference data and policy configuration. | 11 settings cards | Keep but improve |
| `/imports-audit` | Excel Import & Reconciliation | `src/components/admin/AdminPages.tsx` → `ImportsAuditPage` | Mock workbook mapping, batch history, and audit log. | 3 tabs, file input, mapping controls, tables | Keep but improve |
| Any other path | In-app Page Not Found | `src/components/layout/OperationsRouter.tsx` fallback | Return users to dashboard. | `PageHeader`, `Card`, `LinkButton` | Incomplete |

# 4. Page-by-Page Detailed Analysis

## Root Redirect

### Route and File
- Route: `/`
- Source file: `src/app/page.tsx`
- Parent layout: `src/app/layout.tsx`
- Related sidebar navigation item: None; redirects to Dashboard.

### Business Purpose
Provides a predictable application entry point and sends staff directly to the operational home page.

### Visible UI Structure
No visible UI; Next.js `redirect("/dashboard")` executes immediately.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| None | None | None | Pure navigation behavior. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Open `/` | Redirects to `/dashboard` | Check session; redirect unauthenticated users to `/login` and authenticated users to their authorized landing page. |

### Required Database Entities
None directly; future session lookup depends on Users, Sessions/Auth, Roles, and Permissions.

### Required API Endpoints
- `GET /api/auth/session` or equivalent server-side session check.

### Permissions
Public entry route; destination must depend on authentication and role.

### Issues or Questions
- Current redirect bypasses authentication entirely.
- Should some roles land on a narrower dashboard rather than the global operations dashboard?

## Administrative Login

### Route and File
- Route: `/login`
- Source file: `src/app/login/page.tsx`
- Parent layout: `src/app/layout.tsx`; intentionally outside `AppShell`.
- Related sidebar navigation item: None.

### Business Purpose
Allows authorized internal staff to enter the operations system. It correctly excludes public registration and MFA in the current prototype.

### Visible UI Structure
- TechTrek text/CSS brand mark.
- Administrative Login heading and staff-only explanation.
- Form fields: Email or username; Password; Remember me checkbox.
- Password show/hide button.
- Log In button with temporary “Signing in...” state.
- Frontend-only disclaimer and copyright footer.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Credential form | username/email, password, remember-device choice | User, Authentication Session | Default demo credentials are embedded in source and must not exist in production. |
| Footer | product/year | System configuration | Static text. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Show/hide password | Toggles input type locally | No API; retain accessible toggle. |
| Remember me | Uncontrolled checked checkbox | Set secure session duration; never store raw credentials. |
| Log In | Waits 450 ms and routes to `/dashboard` for any valid HTML form | Authenticate, rate-limit, record login audit, create secure session, load permissions, handle inactive/locked users. |

### Required Database Entities
Users, Roles, UserRoles, Permissions, RolePermissions, AuthenticationSessions, LoginAudit/FailedLoginAttempt.

### Required API Endpoints
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`

### Permissions
Page is public; successful access is limited to active internal user accounts.

### Issues or Questions
- No invalid-credential, locked-account, inactive-account, or network-error state.
- No forgot/reset password flow. If reset is handled by an administrator, state that explicitly.
- Demo password is visible in source/default input.
- No return URL after session expiration.
- Encoding artifacts affect copyright text.

## Operations Dashboard

### Route and File
- Route: `/dashboard`
- Source file: `src/components/dashboard/DashboardPage.tsx`
- Parent layout: `src/app/[...slug]/page.tsx` → `AppShell`
- Related sidebar navigation item: Dashboard.

### Business Purpose
Gives operations leadership an exception-oriented snapshot across enrollment, delivery, finance, attendance, payroll, profitability, and certificates, then routes them to the relevant workspace.

### Visible UI Structure
- Dated page header and Register student link.
- Eight KPI cards: Active students; Active groups; Collections MTD; Remaining balances; Operating expenses; Accrued payroll; Net profitability; Certificate queue.
- “Today’s sessions” card with four `SessionCard` records and Open schedule link.
- “Collections pulse” table.
- “Needs attention” cards/links for low attendance, outstanding balances, schedule conflict, and certificate queue.
- Recent activity card with four events.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| KPI cards | counts, currency totals, trends, margin | Students, Enrollments, Groups, Payments, Expenses, PayrollLines, Certificates | Most values are hard-coded and lack as-of timestamps. |
| Session cards | title, track, status, times, venue, groups, instructor | Sessions, SessionGroups, SessionStaff, Venues | Uses first four mock sessions, not date-filtered “today.” |
| Collections table | receipt, student, method, amount, status | Payments, Receipts, Students | Shows all four mock payments. |
| Attention list | exception type, summary count/amount | Derived operational alerts | Alert definitions are inline and static. |
| Activity list | action, subject/detail, relative time | AuditLog/ActivityEvent | Separate inline array, not the shared timeline. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Register student | Navigates to `/students/new` | Preserve permission check and optional return context. |
| Open schedule | Navigates to `/schedule` | Ideally prefilter to today. |
| View ledger | Navigates to `/collections/ledger` | Ideally prefilter to current month. |
| Attention links | Navigate to registry, outstanding, schedule, certificates | Carry the relevant exception filter in query parameters. |

### Required Database Entities
Students, Enrollments, Groups, Sessions, SessionGroups, AttendanceRecords, PaymentContracts/EnrollmentFinancials, Payments, Receipts, Expenses, PayrollPeriods, PayrollLines, Certificates, AuditLogs.

### Required API Endpoints
- `GET /api/dashboard/summary?date=...`
- `GET /api/sessions?date=...`
- `GET /api/payments?limit=...&period=...`
- `GET /api/alerts`
- `GET /api/audit-events?limit=...`

### Permissions
Admin and Operations Manager: full dashboard. Program Coordinator: academic/delivery subset. Finance Officer: finance subset. Attendance Officer: attendance/session subset. Auditor: read-only. Sensitive payroll/profitability cards should be hidden from roles without financial access.

### Issues or Questions
- Dashboard values conflict with mock collection sizes.
- No date range, branch, intake, or venue filter.
- “Today’s sessions” is not computed by date.
- Recent activity is not linked to entities.
- No refresh/as-of indicator.
- Low attendance link goes to unfiltered students registry.

## Students Master Registry

### Route and File
- Route: `/students`
- Source file: `src/components/students/StudentsPages.tsx` → `StudentsPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Students & Registration → Student Registry.

### Business Purpose
Provides a central searchable roster for staff to identify students and monitor current enrollment, finance, attendance, and certificate status.

### Visible UI Structure
- Page header with Export CSV and Register New Student.
- Four KPI cards: Total students, Fully paid, Outstanding, Avg. attendance.
- Search input: “Search ID, name, phone, university...”.
- Track filter, payment-status filter, Reset button, result count.
- Select-all and per-row checkboxes.
- Dense student table.
- Generic per-row action menu icon.
- Static Previous/Next pagination controls and “Showing X of 1,482” footer.
- Empty state when local filters return no rows.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| KPI cards | total students, fully paid count, outstanding amount, average attendance | Students, Enrollments, Payments, Attendance | Hard-coded. |
| Student table | Academy ID, University ID, name, university, track, group, package, mode, payment status, paid/total, attendance %, certificate status | Student + Enrollment + Group + Contract/Balance + Attendance Summary + Certificate | A denormalized cross-domain projection is appropriate for a read model, not for one table. |
| Financial progress bar | paid / total percentage | EnrollmentFinancialSummary | Must be calculated from contract/adjustments/payments. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Search | Filters every property of seven client-side students | Server-side indexed search across ID, university ID, normalized phone, name, email. |
| Filter track/status | Filters local arrays | Query paginated records; persist filters in URL. |
| Reset | Clears local filters | Clear query parameters. |
| Click row | Opens `/students/{id}` | Fetch exact student; return 404 if missing. |
| Export CSV | Browser alert | Generate permission-filtered export and audit it. |
| Select rows | Checkbox visuals only | Support explicit bulk actions or remove selection. |
| Previous/Next | No behavior | Cursor/page-based pagination. |
| Row action icon | No menu | Define actions: view, edit, transfer, change status, record payment; permission-gated. |

### Required Database Entities
Students, Universities, Colleges, Enrollments, Intakes, Tracks, Packages, Groups, PaymentContracts, Payments, AttendanceRecords, Certificates, StudentStatuses.

### Required API Endpoints
- `GET /api/students?q=&trackId=&paymentStatus=&page=`
- `GET /api/students/export?...`
- `PATCH /api/students/{id}/status`
- `GET /api/reference/tracks`

### Permissions
Admin and Operations Manager: full. Program Coordinator: academic and enrollment data. Finance Officer: financial columns/edit permissions. Attendance Officer: identity/attendance only. Auditor: read-only/export if approved.

### Issues or Questions
- No student lifecycle status: active, withdrawn, suspended, completed, cancelled.
- No intake filter, group filter, university filter, certificate filter, or balance range.
- No duplicate indicator.
- Pagination and bulk-selection controls are inert.
- Search over `Object.values(student)` is not a sustainable search contract.
- Financial and attendance summaries need clear as-of rules.

## Register Student

### Route and File
- Route: `/students/new`
- Source file: `src/components/students/StudentsPages.tsx` → `NewStudentPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Students & Registration → Register Student.

### Business Purpose
Combines student identity creation, initial enrollment/group assignment, contract setup, and opening payment/receipt creation.

### Visible UI Structure
- Breadcrumb: Students → Register Student.
- Header with Cancel.
- “Student Identity & Contact” card.
- “Enrollment & Track Configuration” card.
- “Financial Reconciliation” card.
- Frontend-only warning.
- Discard Changes and Register & Generate Receipt buttons.
- Validation error paragraph after submission attempt.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Identity form | auto Academy ID, full name, university ID, email, phone, university, college/faculty, emergency contact, national ID | Student, University, College, StudentContact, EmergencyContact | National ID needs encryption/access policy. Emergency contact should not be one unstructured field. |
| Enrollment form | track, package, group, delivery mode, enrollment date, program coordinator | Enrollment, Track, Package, Group, Intake, Staff | Intake is missing; mode may belong to group/enrollment, not both. |
| Finance form | contract total, opening payment, payment type, payment method | EnrollmentContract, Payment, Receipt, PaymentMethod | Contract and payment should be separate transactional writes in one atomic workflow. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Cancel | Navigates to `/students` | Warn if form is dirty. |
| Submit | Uses native `checkValidity`, shows toast, then routes to nonexistent `TT-240401` which falls back to first student | Validate duplicates/capacity/contract/payment; atomically create student, enrollment, contract, payment, receipt, and audit events; navigate to actual ID. |
| Discard | Navigates immediately | Confirm discard when dirty. |

### Required Database Entities
Students, StudentContacts/EmergencyContacts, Universities, Colleges, Tracks, Packages, Intakes, Groups, Enrollments, EnrollmentStatusHistory, Staff/Coordinators, FinancialContracts, Payments, Receipts, PaymentMethods, IDSequences, AuditLogs.

### Required API Endpoints
- `POST /api/students/check-duplicates`
- `POST /api/students`
- `POST /api/enrollments`
- `POST /api/payments` or one atomic `POST /api/registrations`
- `GET /api/groups?trackId=&packageId=&intakeId=&hasCapacity=true`
- `GET /api/reference/universities`, `/colleges`, `/tracks`, `/packages`, `/intakes`

### Permissions
Admin, Operations Manager, Program Coordinator can register. Finance Officer may confirm contract/payment fields. Attendance/Data Entry Officer should not set financial terms. Auditor is read-only.

### Issues or Questions
- No date of birth, gender (if operationally/legal required), address, preferred language, guardian fields, student status, source document references, or consent fields.
- No intake field despite group/intake concepts elsewhere.
- Group/track/package dependencies are not validated.
- No capacity or duplicate warning.
- Opening payment can exceed contract total in principle; `min=0` permits zero contract.
- No discount, scholarship, tax, currency, installment plan, due dates, sales/approval authority, or contract version.
- `noValidate` suppresses browser messages while only a generic error is shown.
- Coordinator is hard-coded and read-only.
- Registration and payment should not partially succeed.

## Student Profile

### Route and File
- Route: `/students/[id]`
- Source file: `src/components/students/StudentsPages.tsx` → `StudentProfilePage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Students & Registration.

### Business Purpose
Acts as the staff’s consolidated record for one student across identity, enrollment, attendance, academics, finance, certificates, and audit activity.

### Visible UI Structure
- Breadcrumb and profile header with initials, certificate badge, Academy/University IDs, track/group/mode.
- Edit and Add Payment buttons.
- Seven tabs: Overview; Enrollment & Group; Attendance; Academic Records; Payments & Receipts; Certificate Status; Activity Timeline.
- Overview: contract/paid/remaining KPI cards, contact/education data, progress bars, recent timeline.
- Enrollment & Group: current track/group/package/mode/instructor/intake.
- Attendance: aggregate percent and eight session status cards.
- Academic Records table: Assessment, Task completed, Score, Notes, Last updated.
- Payments table: Date, Description, Method, Amount, Status, Receipt.
- Certificate checklist and Issue certificate button.
- Activity timeline.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Profile header | name, Academy ID, University ID, certificate status, current track/group/mode | Student, Enrollment, Certificate | Current enrollment should be selected from enrollment history. |
| Overview | email, phone, university, college, package, contract, paid, remaining, attendance, academic and finance progress | Student, Enrollment, FinancialSummary, AttendanceSummary, AcademicSummary | Academic completion is hard-coded to 86%. |
| Enrollment tab | track, group, package, mode, instructor, intake | Enrollment, Group, Track, Package, Intake, GroupStaff | “Summer 2026” is hard-coded. |
| Attendance tab | session number and status | Session, AttendanceRecord | Not tied to actual session IDs/dates. |
| Academic table | task/assessment, completion, score, notes, timestamp | Assessment, AcademicRecord | Filters to one mock record and lacks grader. |
| Payments table | payment and receipt details | Payment, Receipt | If no student payment exists, it displays unrelated payments via fallback. |
| Certificate checklist | five policy checks | CertificateEligibility, PolicyVersion | Current logic is inaccurate and partly based on finance only. |
| Timeline | action/detail/time | AuditLog/StudentActivity | Shared static timeline for every student. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Switch tab | Local state only | Optionally encode tab in URL; fetch scoped data lazily. |
| Edit | Toast only | Open validated edit form; record field-level audit. |
| Add Payment | Toast only | Open the same payment workflow used by Collections, scoped to student/enrollment. |
| Open receipt | Toast only | Fetch/preview immutable receipt. |
| Issue certificate | Toast; disabled only for `Blocked` | Recalculate policy, require permission/confirmation, generate certificate, store issuance audit. |

### Required Database Entities
Students, StudentStatusHistory, Enrollments, EnrollmentTransfers, Universities, Colleges, Groups, GroupStaff, Sessions, AttendanceRecords, Assessments, AcademicRecords, FinancialContracts, Payments, Receipts, Certificates, CertificateEligibilitySnapshots, AuditLogs.

### Required API Endpoints
- `GET /api/students/{id}`
- `PATCH /api/students/{id}`
- `GET /api/students/{id}/enrollments`
- `GET /api/students/{id}/attendance`
- `GET /api/students/{id}/academic-records`
- `GET /api/students/{id}/payments`
- `GET /api/students/{id}/certificate-eligibility`
- `GET /api/students/{id}/activity`

### Permissions
Identity/enrollment: Admin, Operations Manager, Program Coordinator. Finance: Admin, Finance Officer; other roles read-limited. Attendance: Coordinator and Attendance Officer. Academic: Coordinator/authorized academic staff. Certificate issue: Admin/Operations Manager or designated issuer. Auditor: read-only.

### Issues or Questions
- Invalid IDs show the first student instead of a 404.
- Add Payment duplicates Collections workflow but does not actually open it.
- No student status or transfer history.
- Payments fallback can expose another student’s transactions.
- Certificate checklist logic is not policy-driven.
- No receipt void/refund/adjustment history.
- No notes, documents, or internal flags policy.
- Tabs duplicate domain pages without defined edit ownership.

## Tracks & Groups Control Center

### Route and File
- Route: `/tracks-groups`
- Source file: `src/components/groups/GroupsPages.tsx` → `TracksGroupsPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Tracks & Groups.

### Business Purpose
Monitors the academy’s program portfolio, group capacity, delivery staffing, collections, attendance, and profitability.

### Visible UI Structure
- Add Group and Create New Track placeholder buttons.
- Four KPI cards: Active students, Active groups, Collections YTD, Forecast profit.
- Four track overview cards with group/student counts; each links to track detail.
- Group search, delivery-mode filter, Clear Filters, result count.
- Group table with row navigation.
- Three summary cards: Peak intake month, Resource allocation alert, System health.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Track cards | track name, group count, student count | Track + aggregated Groups/Enrollments | URL slug is generated from display name instead of stable route slug/ID. |
| Group table | group/name/code, track, delivery mode, students/capacity, instructor, mentor count, attendance, collections, profitability | Group, Enrollment, GroupStaff, AttendanceSummary, FinancialSummary | Aggregates are directly stored on mock Group. |
| Forecast/alert cards | intake month, forecast enrollments, capacity alert, system status | IntakeForecast, CapacityAlert, SystemHealth | No current model exists. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Add Group/Create Track | Browser alert | Open validated create workflow; enforce unique codes and permissions. |
| Click track card | Opens dynamic track route | Use stable `trackId` or slug from database. |
| Search/filter | Filters six mock groups | Server query with status/intake/track/capacity filters. |
| Click group row | Opens `/groups/{id}` | Fetch exact group or 404. |
| Clear filters | Clears local state | Clear URL query parameters. |

### Required Database Entities
Tracks, TrackVersions/Curricula, Packages, Intakes, Groups, GroupStatuses, Enrollments, Staff, GroupStaffAssignments, AttendanceRecords, Payments, Expenses, PayrollAllocations.

### Required API Endpoints
- `GET /api/tracks/summary`
- `POST /api/tracks`
- `GET /api/groups?...`
- `POST /api/groups`
- `GET /api/capacity-alerts`

### Permissions
Admin and Operations Manager: create/edit. Program Coordinator: create/edit academic group data. Finance Officer: view financial summaries only. Attendance Officer: view delivery/attendance. Auditor: read-only.

### Issues or Questions
- Track and group creation forms do not exist.
- Packages and intakes are not visible as first-class planning dimensions.
- No active/completed/cancelled group status or start/end dates.
- “System health” is decorative and unrelated to academy operations data.
- Forecasting is unmodeled and may be Phase 2.
- Group capacity should count active enrollments, not a stored integer.

## Track Detail

### Route and File
- Route: `/tracks-groups/[trackId]`
- Source file: `src/components/groups/GroupsPages.tsx` → `TrackDetailPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Tracks & Groups.

### Business Purpose
Provides a track-level rollup of active groups, learners, delivery quality, finances, and instructional assets.

### Visible UI Structure
- Breadcrumb.
- Edit Track and Create New Group placeholders.
- KPI cards: Active groups, Students, Collections, Direct cost, Attendance.
- Tabs: Groups Overview; Profitability & Financials; Syllabus & Assets.
- Group summary cards.
- Static Revenue vs. Direct Costs bar chart.
- Four asset rows with download buttons.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Header/KPIs | track name, group count, students, collections, direct cost, attendance | Track and aggregate read model | Direct cost and attendance are hard-coded. |
| Group cards | name, track, mode, enrollment/capacity, next session, attendance, margin | Group and aggregates | Links to group detail. |
| Finance chart | collections, payroll, expenses, profit | FinancialLedger/Allocation | Percent heights are static, not values. |
| Asset list | syllabus, delivery guide, lab checklist, rubric | TrackAsset/Document | No asset metadata or storage. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Edit Track/Create Group | Toast only | Open forms with version/status/effective-date handling. |
| Switch tabs | Local state | Load group, finance, or asset data; optionally deep-link tab. |
| Open group | Navigates through `GroupSummaryCard` | Fetch group. |
| Download asset | Toast only | Permission-check and download versioned file. |

### Required Database Entities
Tracks, TrackVersions, TrackAssets, Assessments/Rubrics, Groups, Enrollments, AttendanceRecords, Payments, Expenses, PayrollAllocations.

### Required API Endpoints
- `GET/PATCH /api/tracks/{trackId}`
- `GET /api/tracks/{trackId}/groups`
- `GET /api/tracks/{trackId}/profitability`
- `GET/POST /api/tracks/{trackId}/assets`

### Permissions
Track maintenance: Admin/Operations Manager/Program Coordinator. Financial tab: Admin/Operations Manager/Finance/Auditor read-only. Assets: academic coordinators manage; others read by role.

### Issues or Questions
- Route matching derives track name from substring; any unknown value defaults to Full-Stack Development.
- Syllabus/assets may be unnecessary in the first internal operations MVP unless staff need document governance.
- No package, intake, duration, active status, prerequisites, or effective curriculum version.
- Track-level profitability duplicates `/profitability`; keep only a contextual summary here.

## Group Detail

### Route and File
- Route: `/groups/[groupId]`
- Source file: `src/components/groups/GroupsPages.tsx` → `GroupDetailPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Tracks & Groups.

### Business Purpose
Serves as the main cross-functional workspace for operating a single cohort/group.

### Visible UI Structure
- Breadcrumb and group header with mode badge, track/package/lead.
- Edit and Enroll Student placeholders.
- Eleven tabs: Overview, Students, Schedule, Sessions, Attendance, Team, Collections Summary, Expenses, Profitability, Academic Records, Activity History.
- Overview KPI cards and enrolled-student/team cards.
- Students table; schedule/session cards; attendance selector; team cards.
- Collections, expenses, academic tables; profitability cards; activity feed.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Header/KPIs | group name/code, track, package, mode, instructor, enrollment/capacity, attendance, collections, margin, next session | Group + aggregate read model | Missing status/start/end/intake. |
| Students | name, ID, attendance, payment, certificate | Enrollment/Student summaries | Uses fallback students if group is empty. |
| Schedule/Sessions | session card fields | Sessions, SessionGroups, SessionStaff | Both tabs render identical logic. |
| Attendance | four status buttons | AttendanceRecord | No selected student/session; action is ambiguous. |
| Team | lead instructor and mentors | GroupStaffAssignment | Names rather than staff IDs. |
| Collections | receipt, student, date, amount, status | Payments/Receipts | Shows all payments, not filtered to group. |
| Expenses | date, category, vendor, amount, status | Expenses/ExpenseAllocations | Concatenation can duplicate records. |
| Profitability | revenue, payroll, other expenses, net profit | Financial allocation summary | Fixed cost constants. |
| Academic | student, assessment, completion, score, update | Assessments/AcademicRecords | Shows all academic records, not group-filtered. |
| Activity | event and relative time | AuditLog | Inline static events. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Edit group | Toast | Edit group settings/status/capacity/schedule with conflict checks. |
| Enroll student | Toast | Open existing-student enrollment/transfer workflow with capacity validation. |
| Open student | Navigates from Students tab | Fetch student. |
| Attendance status | Toast only, no subject/session | Remove from this tab or require selected session and roster. |
| Tab navigation | Local state | Contextual fetches and deep links. |

### Required Database Entities
Groups, GroupStatusHistory, Tracks, Packages, Intakes, Enrollments, EnrollmentTransfers, Staff, GroupStaffAssignments, Sessions, SessionGroups, SessionStaff, AttendanceRecords, Assessments, AcademicRecords, Payments, Receipts, Expenses, ExpenseAllocations, PayrollAllocations, AuditLogs.

### Required API Endpoints
- `GET/PATCH /api/groups/{groupId}`
- `GET /api/groups/{groupId}/students`
- `POST /api/groups/{groupId}/enrollments`
- `GET /api/groups/{groupId}/sessions`
- `GET /api/groups/{groupId}/team`
- `GET /api/groups/{groupId}/finance-summary`
- `GET /api/groups/{groupId}/activity`

### Permissions
Admin/Operations Manager: all. Program Coordinator: group, enrollment, schedule, team, academics. Attendance Officer: attendance. Finance Officer: collections/expenses/profitability. Auditor: read-only.

### Issues or Questions
- Invalid group IDs fall back to the first group.
- Schedule and Sessions tabs are duplicates and should merge.
- Quick attendance has no selected learner or session and should link to the roster instead.
- Collections and academic data are not scoped to group.
- Empty-group fallback creates false data.
- Group financial tabs duplicate domain pages; use read-only summaries plus links.
- Need group status, branch, intake, dates, timetable pattern, capacity policy, venue, and completion criteria.

## Master Schedule

### Route and File
- Route: `/schedule`
- Source file: `src/components/schedule/SchedulePages.tsx` → `SchedulePage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Schedule → Master Schedule.

### Business Purpose
Coordinates delivery across dates/times, groups, instructors, mentors, venues, online rooms, and shared sessions.

### Visible UI Structure
- New Session link.
- Previous, Today, Next controls and static date heading.
- Track and delivery-mode filters.
- Day/Week/Month/List controls.
- Grid calendar for Week and Month; cards for Day/List.
- Three summary cards: sessions this week, conflict alert, shared teaching count.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Session card | title, track, status, start/end, venue, groups, instructor | Session, SessionGroups, SessionStaff, Venue | Date is omitted from card in list mode. |
| Calendar | time slots and weekday labels | Session | Placement is generated by array arithmetic, not actual date/time. |
| Alerts | instructor conflict and shared-session counts | ConflictCheck, SessionGroups | Static. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Previous/Today/Next | No behavior | Change active period and query sessions. |
| View switch | Local state; Day and List are identical | Implement distinct day/week/month/list behavior. |
| Filters | Track/mode filter local mock cards | Add group, instructor, mentor, venue, status filters and URL state. |
| New Session | Opens `/schedule/new` | Create flow. |
| Session card | No detail/edit action | Open session detail drawer/page. |

### Required Database Entities
Sessions, SessionGroups, SessionStaff, Groups, Tracks, Staff, Venues, OnlineMeetingLinks, SessionStatusHistory, ConflictOverrides.

### Required API Endpoints
- `GET /api/sessions?from=&to=&trackId=&groupId=&staffId=&mode=&venueId=&status=`
- `GET /api/schedule/conflicts?...`
- `GET /api/sessions/{id}`

### Permissions
Admin/Operations Manager/Program Coordinator manage. Instructors/mentors are not system users per current scope, so staff assignment is managed internally. Attendance and finance roles may read relevant details. Auditor read-only.

### Issues or Questions
- Month view is the same five-day time grid as Week.
- No session detail/edit/cancel/reschedule flow.
- No venue/status/instructor/group filters despite product requirement.
- No timezone, recurrence, break, attendance lock, or cancellation reason.
- Conflict card does not link to the conflict.

## Create Session

### Route and File
- Route: `/schedule/new`
- Source file: `src/components/schedule/SchedulePages.tsx` → `NewSessionPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Schedule → Create Session.

### Business Purpose
Creates one instructional event, optionally shared across multiple groups, with assigned staff and hybrid/online access.

### Visible UI Structure
- Breadcrumb and Cancel.
- Session details card.
- Shared Teaching Session checkbox and group-linking card.
- Delivery & access card.
- Conflict warning card and session summary.
- Save Session button and local-state disclaimer.
- Fields: Session title, Track, Date, Start time, End time, Instructor, Mentor, linked group(s), Delivery mode, Venue, Online meeting link.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Session form | title, date, times, track, mode, venue, meeting URL | Session | Track can be derived from groups; storing both risks mismatch. |
| Staff fields | instructor and one mentor | SessionStaff | Real model should allow multiple staff and teaching roles. |
| Group linking | one or many groups | SessionGroups | Correct many-to-many concept. |
| Conflict card | conflicting staff/time assignment | ConflictCheck | Currently `instructor === "Mona Ibrahim"` only. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Toggle shared teaching | Switches group select to `multiple` | Validate compatible groups, track/package/session topic, and attendance credit rules. |
| Select values | Some state updates; many fields uncontrolled | Load dependent reference values and retain form model. |
| Save | Toast and navigate; no validation beyond required inputs | Validate time order, staff/venue/group conflicts, capacity, duplicate session, online URL; transactionally create session and joins. |

### Required Database Entities
Sessions, SessionGroups, SessionStaff, Staff, Groups, Tracks, Venues, OnlineMeetingLinks, ConflictOverrides, AuditLogs.

### Required API Endpoints
- `POST /api/sessions/validate`
- `POST /api/sessions`
- `GET /api/staff/availability?from=&to=`
- `GET /api/venues/availability?from=&to=`
- `GET /api/groups?trackId=`

### Permissions
Admin, Operations Manager, Program Coordinator create/edit. Others read only.

### Issues or Questions
- Track, instructor, mentor, mode, and group selects are not required.
- Multi-select includes a meaningless “Select...” option.
- Only one mentor can be chosen.
- Conflict cannot be overridden with reason/authority.
- No duration validation, recurrence, session type/topic/module, status, notes, capacity, or attendance-open policy.
- Initial state says Hybrid/Mona Ibrahim while controls visually start at blank, causing summary/control mismatch.

## Quick Attendance Desk

### Route and File
- Route: `/attendance`
- Source file: `src/components/attendance/AttendancePages.tsx` → `AttendancePage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Attendance → Quick Attendance.

### Business Purpose
Lets a data-entry staff member locate one learner and record attendance quickly for a selected session.

### Visible UI Structure
- Open full roster and Mark Remaining as Present.
- Track, group, and session selectors.
- Search by Academy ID, University ID, phone, or name.
- `StudentQuickCard` with identity/contact/enrollment/attendance.
- Present, Late, Absent, Excused buttons.
- KPI cards: Present today, Late, Not marked.
- Recent attendance list and View All Logs button.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Selection controls | track, group, session | Track, Group, Session | Session selector is fixed to blank and does not update state. |
| Student card | student IDs/contact/university/group/payment status/attendance % | Student, Enrollment, AttendanceSummary | Payment status may be unnecessary for attendance staff. |
| Status selector | attendance status | AttendanceRecord | Should apply to selected session/enrollment. |
| Recent list | student, ID, status | AttendanceRecord | Static mapping, not recent actions. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Choose track/group/session | Track/group state changes but does not constrain other controls; session does nothing | Dependent selectors; require active session. |
| Search student | Picks first substring match; blank returns first student | Exact/ ranked lookup, duplicate-result list, eligibility validation. |
| Mark status | Local status + toast | Upsert attendance with timestamp/user/source; prevent wrong-session duplicate. |
| Mark remaining present | Toast only | Confirmation, bulk update unmarked roster, audit. |
| View logs | No behavior | Open attendance history/audit. |

### Required Database Entities
Sessions, SessionGroups, Enrollments, Students, AttendanceRecords, AttendanceEditHistory, AttendancePolicies, Users.

### Required API Endpoints
- `GET /api/attendance/context?sessionId=`
- `GET /api/students/lookup?q=&groupId=`
- `PUT /api/sessions/{sessionId}/attendance/{enrollmentId}`
- `POST /api/sessions/{sessionId}/attendance/mark-remaining`
- `GET /api/sessions/{sessionId}/attendance/activity`

### Permissions
Attendance/Data Entry Officer and Program Coordinator edit. Operations Manager/Admin override/finalize. Auditor read-only. Finance Officer should not edit.

### Issues or Questions
- Attendance can be marked without a session.
- Blank/failed search silently selects a student instead of showing no/multiple results.
- Payment status is exposed in an attendance workflow without clear need.
- No check-in time, lateness minutes, excuse reason, evidence, or note.
- No finalized/locked state or edit authority.

## Group Attendance Roster

### Route and File
- Route: `/attendance/roster`
- Source file: `src/components/attendance/AttendancePages.tsx` → `AttendanceRosterPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Attendance → Group Roster.

### Business Purpose
Records and finalizes attendance for all students assigned to one session/group.

### Visible UI Structure
- Breadcrumb and hard-coded session/group/date description.
- Mark all present and Save & Finalize.
- Roster table: Student, Academy ID, Present, Late, Absent, Excused, Notes.
- Radio buttons per student, notes inputs, summary counts.
- Draft warning and finalization confirmation dialog.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Context header | group, session title, date/time | Group, Session | Hard-coded, not route/query selected. |
| Roster | student, Academy ID, status, notes | Enrollment, AttendanceRecord | Uses every mock student, not group membership. |
| Summary | present/late/absent counts | AttendanceSummary | Excused count omitted. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Change status/note | Updates local status; notes are uncontrolled | Save draft changes with concurrency/version control. |
| Mark all present | Replaces all statuses locally | Confirm and apply only appropriate rows. |
| Save & Finalize | Confirmation then toast | Validate complete roster, persist, lock/finalize, write audit, update summaries. |

### Required Database Entities
Sessions, SessionGroups, Enrollments, Students, AttendanceRecords, AttendanceFinalizations, AttendanceEditHistory, Users.

### Required API Endpoints
- `GET /api/sessions/{sessionId}/attendance-roster`
- `PUT /api/sessions/{sessionId}/attendance-draft`
- `POST /api/sessions/{sessionId}/attendance-finalize`
- `POST /api/sessions/{sessionId}/attendance-reopen`

### Permissions
Attendance Officer/Program Coordinator edit draft. Operations Manager/Admin finalize/reopen. Auditor read-only.

### Issues or Questions
- Route lacks `sessionId`; it cannot identify a roster.
- Roster is not filtered to group.
- Notes are not included in local saved state.
- No “unmarked” status, check-in time, excuse reason, or edit history.
- Finalization policy and reopen authority are undefined.

## Academic Records Center

### Route and File
- Route: `/academic-records`
- Source file: `src/components/academic/AcademicPages.tsx` → `AcademicRecordsPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Academic Records.

### Business Purpose
Allows staff to select a group and assessment before entering learner task completion, scores, and notes.

### Visible UI Structure
- Three KPI cards: Active assessments, Awaiting updates, Completion rate.
- Search group/code.
- Track and assessment filters.
- Group cards with mode, student count, and Open record sheet link.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| KPIs | active assessment count, stale records, completion rate | Assessments, AcademicRecords | Hard-coded. |
| Group cards | group name/code, track, mode, student count | Group, Enrollments | Assessment filter does not affect route or data. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Search/filter | Search and track work locally; assessment selector does nothing | Query group-assessment work queue. |
| Open record sheet | Routes by group only | Include assessment ID in route/query to avoid ambiguity. |

### Required Database Entities
Groups, Tracks, Enrollments, Assessments, AssessmentAssignments/GroupAssessments, AcademicRecords, Users.

### Required API Endpoints
- `GET /api/academic-records/work-queue?trackId=&assessmentId=&q=`
- `GET /api/assessments?trackId=&groupId=`

### Permissions
Program Coordinator and authorized academic data-entry roles edit. Operations Manager/Admin supervise. Auditor read-only. Finance/attendance roles normally no access.

### Issues or Questions
- No assessment management page or source of assessment definitions.
- Assessment filter is inert.
- Route does not identify assessment.
- “Awaiting updates” needs a precise SLA/business rule.

## Group Academic Record Sheet

### Route and File
- Route: `/academic-records/[groupId]`
- Source file: `src/components/academic/AcademicPages.tsx` → `GroupAcademicPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Academic Records.

### Business Purpose
Bulk records task completion, numeric score, and notes for the students in a group/assessment.

### Visible UI Structure
- Breadcrumb and group/assessment description.
- Save changes button.
- Editable table: Student, Academy ID, Task completed, Score, Notes, Updated by, Last updated.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Record table | student identity, completion boolean, score, note, updater, timestamp | Enrollment, Assessment, AcademicRecord, User | All mock records are shown regardless of group. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Toggle completion/change score/note | Updates local array | Validate score scale and permissions; dirty-state tracking. |
| Save changes | Toast only | Bulk upsert with per-row validation/versioning and audit. |

### Required Database Entities
Groups, Enrollments, Students, Assessments, AcademicRecords, AcademicRecordHistory, Users.

### Required API Endpoints
- `GET /api/groups/{groupId}/assessments/{assessmentId}/records`
- `PUT /api/groups/{groupId}/assessments/{assessmentId}/records`
- `GET /api/academic-records/{id}/history`

### Permissions
Authorized coordinator/academic recorder edits; Operations Manager/Admin override; Auditor read-only.

### Issues or Questions
- No `assessmentId` in route.
- Invalid group ID falls back to first group.
- Records are not filtered by group membership.
- One `task` string and one score cannot represent multiple assessments or attempts.
- No absent/not-submitted/exempt status, score weighting, maximum score, rubric, grader, approval, or lock/finalization.

## Quick Collection Desk

### Route and File
- Route: `/collections`
- Source file: `src/components/collections/CollectionsPages.tsx` → `CollectionsPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Collections & Receipts → Quick Collection.

### Business Purpose
Allows a finance/data-entry user to locate a student, see the current contract/balance, record a payment, and generate/open a receipt.

### Visible UI Structure
- Links to Payment ledger and Outstanding balances.
- Student search and `StudentQuickCard`.
- Contract total, Paid to date, Remaining KPI cards.
- Recent payment table: Date, Type, Method, Amount, Receipt, Status.
- Record Payment button and drawer.
- Student history side card with receipt rows and View Full Statement.
- Payment drawer: student/current balance, Amount, payment type selector, Cash/InstaPay/Card method buttons, warning, Cancel, Record & Generate Receipt.
- Receipt Preview modal with Done and Print Receipt.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Student card | identity/contact/university/group/payment status/attendance | Student, Enrollment | Attendance is not needed for collections; financial contract/enrollment status is. |
| Financial KPIs | contract, paid, remaining, completion percentage | FinancialContract, PaymentLedger | Must be calculated from authoritative entries. |
| Payment history | date/type/method/amount/receipt/status | Payment, Receipt | Current concatenation can duplicate the same payment. |
| Receipt preview | receipt number, student, amount, method, recorded by | Receipt, Payment, User | Method is always displayed as InstaPay regardless of selected method. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Search student | First substring match; blank/default returns first student | Exact/ranked lookup, multiple results, status/contract checks. |
| Open receipt | Opens same generic receipt preview | Fetch selected immutable receipt and related payment. |
| Choose payment type/method | Type selector and method buttons do not update submitted values; record is always Installment/Cash | Controlled values, allowed-method rules, reference/transaction number. |
| Record payment | Adds local Payment, opens preview | Atomic payment + receipt number allocation + balance update + audit; idempotency required. |
| Print receipt | Toast only | Render/download/print an immutable receipt version. |

### Required Database Entities
Students, Enrollments, FinancialContracts, InstallmentPlans, Payments, PaymentAllocations, PaymentMethods, Receipts, ReceiptSequences, Users, AuditLogs.

### Required API Endpoints
- `GET /api/students/lookup?q=`
- `GET /api/enrollments/{id}/financial-summary`
- `GET /api/enrollments/{id}/payments`
- `POST /api/payments`
- `GET /api/receipts/{id}`
- `GET /api/receipts/{id}/document`

### Permissions
Finance Officer and Admin record payments. Operations Manager may view/approve exceptions. Program Coordinator may view limited status. Auditor read-only. Attendance/Data Entry role should not see or edit finance unless explicitly granted.

### Issues or Questions
- Default mock student is fully paid, yet drawer defaults amount 1,250 with max 0; form cannot validly submit.
- Search failure silently returns another student.
- No payment date, external reference, collector, notes, currency, allocation, installment due, or evidence.
- Payment and receipt must be atomic and idempotent.
- No reversal, refund, bounced/pending settlement, void receipt, or corrected receipt flow.
- Receipt history is not scoped to selected student in the side card.

## Payment Ledger & Receipt History

### Route and File
- Route: `/collections/ledger`
- Source file: `src/components/collections/CollectionsPages.tsx` → `PaymentLedgerPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Collections & Receipts → Payment Ledger.

### Business Purpose
Provides the authoritative operational list for searching, reviewing, and reconciling payments and receipts.

### Visible UI Structure
- Quick Collection Desk link.
- KPI cards: Collections this month, Transactions, Pending reconciliation.
- Search, status filter, payment-method filter, result count.
- Select-all/row checkboxes and table.
- Columns: Payment ID, Date, Student/Academy ID, Type, Method, Amount, Receipt, Status.
- Receipt Preview modal.
- Generic row action menu buttons.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| KPIs | monthly collected amount, transaction count, pending amount/count | Payment aggregate | Hard-coded. |
| Ledger | payment ID/date/student/type/method/amount/status and receipt | Payment, Receipt, Student, Enrollment | Core finance read model. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Search/status filter | Works locally | Server-side filters plus date range, student/group/intake, amount, collector, receipt state. |
| Method filter | No behavior | Apply query. |
| Select rows | No bulk behavior | Define reconciliation/export actions or remove selection. |
| Open receipt | Opens preview | Fetch exact receipt. |
| Row menu | No behavior | Define view, reconcile, reverse, refund, void/reissue receipt, audit history. |

### Required Database Entities
Payments, PaymentAllocations, PaymentMethods, Receipts, Students, Enrollments, Reconciliations, Reversals/Refunds, Users, AuditLogs.

### Required API Endpoints
- `GET /api/payments?...`
- `GET /api/payments/summary?...`
- `POST /api/payments/{id}/reconcile`
- `POST /api/payments/{id}/reverse`
- `POST /api/payments/{id}/refund`
- `GET /api/receipts/{id}`

### Permissions
Finance Officer/Admin manage; Operations Manager supervises; Auditor read-only including immutable audit trail. Other roles should receive restricted financial data.

### Issues or Questions
- No date range even though this is a ledger.
- Reconciliation status meaning is unclear: recorded vs pending vs reconciled.
- Payment status and receipt status are conflated.
- No external transaction reference or settlement account.
- Checkbox/menu controls are inert.

## Outstanding Balances

### Route and File
- Route: `/collections/outstanding`
- Source file: `src/components/collections/CollectionsPages.tsx` → `OutstandingBalancesPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Collections & Receipts → Outstanding Balances.

### Business Purpose
Creates a follow-up queue for unpaid contracts and records collection-contact status.

### Visible UI Structure
- Record payment link.
- KPI cards: Total outstanding, Overdue accounts, Due this week.
- Student/Academy ID search and follow-up-status filter.
- Table: Student, Phone, Group, Contract, Paid, Remaining, Payment status, Follow-up select.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| KPI/table balances | contract, paid, remaining, overdue/due | Contract, InstallmentSchedule, PaymentLedger | Due this week is hard-coded; no due-date model. |
| Follow-up | contact workflow status | CollectionFollowUp | Inline uncontrolled select with no persistence. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Search | Local student/ID search | Server query. |
| Follow-up filter | No behavior | Filter contact queue. |
| Change follow-up | Uncontrolled, no save | Create follow-up event with user/time/channel/outcome/next date. |
| Record payment | Opens generic collection desk, losing student context | Pass student/enrollment context. |

### Required Database Entities
FinancialContracts, InstallmentSchedules, Payments, Students, Enrollments, CollectionFollowUps, Users.

### Required API Endpoints
- `GET /api/collections/outstanding?...`
- `POST /api/enrollments/{id}/collection-follow-ups`
- `GET /api/enrollments/{id}/collection-follow-ups`

### Permissions
Finance Officer/Admin edit; Operations Manager supervises; Auditor read-only. Coordinators may see restricted balance/status if operationally needed.

### Issues or Questions
- No installment due dates, days overdue, promised payment date, last contact, next follow-up, or assigned collector.
- Payment status is derived from hard-coded Student values.
- Follow-up workflow needs a history, not one mutable field.
- Could remain a dedicated queue or become a filtered view of the ledger; keep if daily collections work justifies it.

## Staff Directory & Payroll

### Route and File
- Route: `/staff-payroll`
- Source file: `src/components/staff/StaffPages.tsx` → `StaffDirectoryPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Staff, Payroll & Expenses → Staff Directory.

### Business Purpose
Lists instructors, mentors, and coordinators with assignment and current payroll exposure.

### Visible UI Structure
- Export Report and Add Staff placeholders.
- KPI cards: Accrued payroll, Approved hours, Active staff, Remaining payout.
- Search, role filter, status filter, result count.
- Table: Staff member/role/specialty, Assigned groups, Approved hours, Rate, Accrued earnings, Remaining, Status.
- Generic row action menu.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Staff identity | name, ID, role, specialty, status | Staff, StaffRole | Initials are derived. |
| Assignments | group codes | GroupStaffAssignment | Mock stores codes directly. |
| Payroll snapshot | approved hours, rate, accrued, paid/remaining | WorkLog, CompensationPlan, PayrollLine, StaffPayout | Should be period-specific calculations. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Search/role filter | Works locally | Server query; status filter currently inert. |
| Open staff | Native `<a>` full navigation | Use Next Link and exact staff lookup. |
| Add staff | Toast only | Create staff identity/contact/role/compensation workflow. |
| Export | Toast only | Generate permission-filtered report and audit it. |

### Required Database Entities
Staff, StaffContacts, StaffRoles, StaffStatusHistory, GroupStaffAssignments, CompensationPlans, WorkLogs, PayrollPeriods, PayrollLines, StaffPayouts.

### Required API Endpoints
- `GET/POST /api/staff`
- `GET /api/staff/export`
- `GET /api/staff/payroll-summary?periodId=`

### Permissions
Admin/Operations Manager manage staff. Program Coordinator manages assignments, not pay. Finance/Payroll role manages financial fields. Auditor read-only. Attendance Officer limited directory access.

### Issues or Questions
- Page name mixes staff directory with payroll while a separate payroll page exists; rename to Staff Directory and keep only a restricted payroll summary.
- No staff email, phone, national/tax/payment details, employment/contract type, start/end dates, or branch.
- Rates and earnings are shown broadly without role-level privacy controls.
- Status filter/action menu are inert.

## Staff Profile

### Route and File
- Route: `/staff-payroll/[staffId]`
- Source file: `src/components/staff/StaffPages.tsx` → `StaffProfilePage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Staff, Payroll & Expenses → Staff Directory.

### Business Purpose
Consolidates one staff member’s assignments, shared sessions, work hours, compensation plan, payroll, and payout history.

### Visible UI Structure
- Breadcrumb and profile header with status.
- Edit staff profile placeholder.
- Seven tabs: Overview, Assigned Groups, Shared Teaching Sessions, Work Hours, Compensation Plan, Payroll History, Payment History.
- KPI cards for hours/rate/accrued/remaining.
- Assignment summary, group cards, shared-session summary.
- Work-hour table and payroll/history tables.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Header/overview | identity, role, specialty, status, hours, rate, accrued, remaining | Staff, Role, CompensationPlan, PayrollSummary | Period is not shown in KPIs. |
| Assigned groups | group name/track/mode | GroupStaffAssignment | No assignment role/effective dates. |
| Shared sessions | summary count/group codes | SessionStaff | Static sentence, no table. |
| Work hours | date, session, hours, approval status | WorkLog/SessionStaff | Inline array. |
| Compensation | basis, rate, effective date | CompensationPlan | One simple hourly plan. |
| Payroll/payment history | period, gross, paid, status | PayrollLine, StaffPayout | Both tabs display the same table. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Edit profile | Toast only | Edit identity/status/contacts separately from compensation, with audits. |
| Switch tabs | Local state | Fetch authorized data; preserve tab URL. |

### Required Database Entities
Staff, StaffRoles, StaffStatusHistory, GroupStaffAssignments, SessionStaff, WorkLogs, WorkLogApprovals, CompensationPlans, PayrollPeriods, PayrollLines, StaffPayouts, AuditLogs.

### Required API Endpoints
- `GET/PATCH /api/staff/{id}`
- `GET /api/staff/{id}/assignments`
- `GET /api/staff/{id}/sessions`
- `GET /api/staff/{id}/work-logs`
- `GET/POST /api/staff/{id}/compensation-plans`
- `GET /api/staff/{id}/payroll-lines`
- `GET /api/staff/{id}/payouts`

### Permissions
Admin/Operations Manager manage identity/assignments. Finance/Payroll role manages compensation/payroll. Program Coordinator sees assignments/work status but not sensitive payouts. Staff are not portal users. Auditor read-only.

### Issues or Questions
- Invalid staff ID falls back to first staff member.
- Payroll History and Payment History are exact duplicates and must be separated or merged.
- Shared sessions need actual records.
- Work-hour approval ownership and source are unclear.
- Compensation needs effective-dated versions, possible per-session/per-group/fixed plans, bonuses/deductions, and currency.

## Payroll

### Route and File
- Route: `/payroll`
- Source file: `src/components/staff/StaffPages.tsx` → `PayrollPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Staff, Payroll & Expenses → Payroll.

### Business Purpose
Reviews payroll by period and approves staff earnings/payout obligations.

### Visible UI Structure
- Approve selected button.
- Payroll period selector and status badge.
- KPI cards: Gross payroll, Paid amount, Remaining, Staff entries.
- Selectable table: Staff member, Approved hours, Rate, Gross amount, Paid amount, Remaining amount, Status.
- Generic row action menus.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Period | month and process status | PayrollPeriod | Period values are hard-coded. |
| Payroll lines | staff, approved hours, rate, gross, paid, remaining, status | PayrollLine + WorkLogs + CompensationPlan + Payouts | Uses current fields on Staff for every selected period. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Change period | Only status badge changes | Load immutable/calculated lines for period. |
| Select rows | Visual only | Controlled selection. |
| Approve selected | Toast only | Validate work approvals, freeze calculation, approve lines with actor/time. |
| Row menu | No behavior | View calculation, adjust, hold, approve, record payout, audit. |

### Required Database Entities
PayrollPeriods, PayrollLines, WorkLogs, WorkLogApprovals, CompensationPlans, PayrollAdjustments, StaffPayouts, Staff, Users, AuditLogs.

### Required API Endpoints
- `GET/POST /api/payroll-periods`
- `POST /api/payroll-periods/{id}/calculate`
- `GET /api/payroll-periods/{id}/lines`
- `POST /api/payroll-periods/{id}/approve`
- `POST /api/payroll-lines/{id}/adjust`
- `POST /api/staff-payouts`

### Permissions
Finance/Payroll role prepares; Operations Manager/Admin approves; ideally maker-checker separation. Auditor read-only. Coordinators can approve source work logs only if authorized.

### Issues or Questions
- No payroll period entity/state machine.
- No payout recording UI despite Paid amount.
- No deductions, bonuses, adjustments, holds, approval comments, or bank/cash method.
- Historical period selection currently reuses current values.
- Need policy for shared session compensation and mentor/instructor rate differences.

## Expenses

### Route and File
- Route: `/expenses`
- Source file: `src/components/staff/StaffPages.tsx` → `ExpensesPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Staff, Payroll & Expenses → Expenses.

### Business Purpose
Records and classifies academy operating expenses, optionally allocating them to a group or session, then tracks approval.

### Visible UI Structure
- Add Expense button and drawer.
- KPI cards: Expenses MTD, Approved, Awaiting approval, Largest category.
- Search, category and status filters.
- Selectable table: Expense ID, Date, Category, Vendor/Description, Amount, Linked group/session, Approval status.
- Drawer fields: Expense category, Vendor, Description, Amount, Linked group/session; Cancel/Save Expense.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| KPI/table | date, category, vendor, description, amount, link, status | Expense, Vendor, ExpenseCategory, ExpenseAllocation | `linkedTo` is an ambiguous string. |
| Drawer | category/vendor/description/amount/group | Expense | Date is forced to current hard-coded date; session cannot actually be selected. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Search/filter | All controls are inert because values/handlers are fixed | Query and persist URL state. |
| Add expense | Adds local pending item | Validate category/vendor/date/amount/allocation; create draft/pending expense and audit. |
| Select/menu | No behavior | Define approve/reject/edit/void/export actions. |

### Required Database Entities
Expenses, ExpenseCategories, Vendors, ExpenseAllocations, Groups, Sessions, ExpenseApprovals, PaymentMethods/Accounts, Attachments, Users, AuditLogs.

### Required API Endpoints
- `GET/POST /api/expenses`
- `PATCH /api/expenses/{id}`
- `POST /api/expenses/{id}/submit`
- `POST /api/expenses/{id}/approve`
- `POST /api/expenses/{id}/reject`
- `GET /api/reference/expense-categories`, `/vendors`

### Permissions
Authorized staff create drafts; Finance Officer reviews; Operations Manager/Admin approves; maker-checker separation recommended. Auditor read-only.

### Issues or Questions
- Search/category/status filters do nothing.
- Missing expense date, payment date/method/account, receipt/invoice attachment, tax, currency, reference number, requester, approver, and rejection reason.
- “Linked group/session” only lists groups and uses one string; allocation may be split across groups/sessions/general overhead.
- No edit/approval actions in table.

## Profitability Dashboard

### Route and File
- Route: `/profitability`
- Source file: `src/components/admin/AdminPages.tsx` → `ProfitabilityPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Profitability.

### Business Purpose
Provides management accounting by comparing contracted revenue, collections, payroll, other expenses, profit, and margin by track/group/period.

### Visible UI Structure
- Track, group, and period filters.
- Six KPI cards: Revenue, Collections, Expenses, Payroll, Total cost, Profit/margin.
- Static Financial performance bar chart.
- Margin by track progress bars.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| KPIs/chart | revenue, collections, expenses, payroll, cost, profit, margin | FinancialContract, Payment, ExpenseAllocation, PayrollAllocation | All values are hard-coded. Revenue vs collections must be precisely defined. |
| Track margin | track and margin % | Track profitability read model | Static percentages. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Track filter | Changes local state but does not change metrics | Recalculate/query scoped report. |
| Group/period filters | No behavior | Apply reporting period and allocation scope. |

### Required Database Entities
Tracks, Groups, Enrollments, FinancialContracts, Payments, PaymentAllocations, Expenses, ExpenseAllocations, PayrollLines, PayrollAllocations, ReportingPeriods.

### Required API Endpoints
- `GET /api/profitability?from=&to=&trackId=&groupId=`
- `GET /api/profitability/by-track?...`
- `GET /api/profitability/drilldown?...`

### Permissions
Admin, Operations Manager, Finance Officer, Auditor read. Other roles should not see profit/payroll details.

### Issues or Questions
- Define revenue: contracted, recognized, invoiced, or collected.
- Define allocation of shared sessions, general overhead, staff time, refunds, and discounts.
- Collections are cash flow, not revenue; both should not be combined without clear accounting semantics.
- No drilldown or export.
- Filters are mostly inert.

## Certificate Eligibility & Issuance

### Route and File
- Route: `/certificates`
- Source file: `src/components/admin/AdminPages.tsx` → `CertificatesPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Certificates.

### Business Purpose
Queues students for certificate review, explains eligibility blockers, and issues/downloads certificates.

### Visible UI Structure
- Issue eligible bulk button.
- KPI cards: Eligible now, Awaiting group completion, Financially blocked, Issued this month.
- Student/Academy ID search and certificate-status filter.
- Table: Student, Attendance complete, Tasks complete, Score achieved, No balance, Group complete, Certificate status, Issue/download action.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Eligibility checks | five booleans and overall status | CertificateEligibilityResult, PolicyVersion | Current task/score checks incorrectly use attendance percentage. |
| Student/action | student identity and issuance state | Student, Enrollment, Certificate | Eligibility is enrollment/group-specific, not simply student-specific. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Search | Local | Server query. |
| Status filter | No behavior | Filter queue. |
| Issue one/bulk | Toast only | Recalculate eligibility atomically, require confirmation/authority, allocate certificate number, generate file, audit. |
| Download | Toast only | Download immutable certificate document. |

### Required Database Entities
Certificates, CertificateEligibilitySnapshots, CertificatePolicies, Enrollments, Groups, AttendanceRecords, Assessments, AcademicRecords, FinancialContracts, Payments, CertificateSequences, Users, AuditLogs.

### Required API Endpoints
- `GET /api/certificates/eligibility?...`
- `POST /api/certificates/issue`
- `POST /api/certificates/issue-bulk`
- `GET /api/certificates/{id}/document`
- `POST /api/certificates/{id}/revoke`

### Permissions
Designated certificate issuer, Operations Manager, or Admin issues/revokes. Coordinators review academic blockers. Finance confirms financial blockers. Auditor read-only.

### Issues or Questions
- Eligibility rules are technically incorrect placeholders.
- Filter does nothing.
- No certificate number, template/version, issue date, issuer, revocation/correction/reissue, or name-as-printed.
- Bulk issue needs preview and failure handling.
- Decide whether “no remaining balance” is mandatory or waivable.

## Users & Permissions

### Route and File
- Route: `/users-permissions`
- Source file: `src/components/admin/AdminPages.tsx` → `UsersPermissionsPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Users & Permissions.

### Business Purpose
Manages internal application accounts and assigns role-based access to operational domains.

### Visible UI Structure
- Invite Internal User button and drawer.
- Tabs: Internal Accounts; Role Permissions.
- User table: User/name/email, Role, Status, Last active.
- Permission matrix: Role against Students, Attendance, Finance, Payroll, Settings, Audit checkboxes.
- Invite fields: Full name, Work email, Role; Cancel/Send Invitation.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Accounts | name, email, role, status, last active | User, UserRole, Session/LoginAudit | Mock users are untyped arrays. |
| Permission matrix | role-to-domain booleans | Role, Permission, RolePermission | Too coarse; checkboxes are uncontrolled. |
| Invite form | name, email, role | UserInvitation, Role | No expiration or inviter. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Switch tab | Local state | Load account/permission data. |
| Change permission | UI checkbox only | Persist only with explicit Save/confirmation; prevent self-lockout and last-admin removal. |
| Invite user | Toast and close | Create expiring invitation, email/set-password flow, audit. |
| Row menu | No behavior | Deactivate, reactivate, resend invite, reset access, inspect audit. |

### Required Database Entities
Users, Roles, Permissions, UserRoles, RolePermissions, UserInvitations, AuthenticationSessions, LoginAudit, AuditLogs.

### Required API Endpoints
- `GET/POST /api/users`
- `PATCH /api/users/{id}`
- `POST /api/users/{id}/deactivate`
- `POST /api/user-invitations`
- `GET /api/roles`, `/permissions`
- `PUT /api/roles/{id}/permissions`

### Permissions
Admin only for role/permission changes. Operations Manager may manage non-admin invitations if policy allows. Auditor reads account/permission/audit state but cannot change it.

### Issues or Questions
- No authentication exists, so permissions are not enforced anywhere.
- Six domain permissions need action-level permissions such as view/create/edit/approve/export/void.
- No Save button for matrix, no custom user overrides, no multi-role policy.
- No deactivation, lockout, reset, session revocation, or last-admin protection.
- “Last active” is derived from array index rather than data.

## Settings Hub

### Route and File
- Route: `/settings`
- Source file: `src/components/admin/AdminPages.tsx` → `SettingsPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Settings, Imports & Audit Log → Settings.

### Business Purpose
Centralizes reference/master data and operational policy thresholds used by forms and calculations.

### Visible UI Structure
- Save Changes button.
- Eleven cards: Universities, Colleges, Tracks, Packages, Groups, Venues, Expense categories, Payment methods, ID numbering rules, Attendance thresholds, Academic score thresholds.
- Each card shows a count/detail, example chips, and Edit icon.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Reference cards | names/counts for universities, colleges, tracks, packages, groups, venues, categories, methods | Reference/master entities | Groups are operational entities and do not belong in generic settings CRUD. |
| Rule cards | ID patterns and thresholds | NumberingRule, AttendancePolicy, AcademicPolicy | Need effective dates/versioning. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Edit card | Toast only | Open specific CRUD/policy UI with validation and active/inactive handling. |
| Save Changes | Toast only | Generic save is inappropriate unless edits occur inline; use entity-specific saves. |

### Required Database Entities
Universities, Colleges, Tracks, Packages, Venues, ExpenseCategories, PaymentMethods, NumberingRules/Sequences, AttendancePolicies, AcademicPolicies. Groups should remain in Groups, not settings.

### Required API Endpoints
- CRUD `/api/reference/universities`, `/colleges`, `/venues`, `/expense-categories`, `/payment-methods`
- CRUD `/api/tracks`, `/packages`
- `GET/PUT /api/policies/attendance`, `/academic`, `/numbering`

### Permissions
Admin primarily. Operations Manager may manage operational references. Program Coordinator may manage academic references but not finance/numbering. Auditor read-only.

### Issues or Questions
- No actual editor or lifecycle behavior.
- Track/group management duplicates `/tracks-groups`; Groups should be removed from Settings.
- Package ownership/price/version is undefined.
- No branches/campuses, currencies, payment accounts, academic assessment types, certificate templates, or status reasons.
- Policies require versioning/effective dates to explain historical decisions.

## Excel Import & Reconciliation

### Route and File
- Route: `/imports-audit`
- Source file: `src/components/admin/AdminPages.tsx` → `ImportsAuditPage`
- Parent layout: `AppShell`
- Related sidebar navigation item: Settings, Imports & Audit Log → Imports & Audit Log.

### Business Purpose
Previews importing legacy Excel/CSV data, maps “All Receipts” columns, tracks import batches, and exposes operational audit events.

### Visible UI Structure
- Tabs: Excel Import, Import Batches, Audit Log.
- File input accepting `.xlsx,.csv`; selected filename state.
- All Receipts mapping rows: Student Code→Academy ID, Receipt No.→Receipt ID, Paid Amount→Payment amount, Payment Date→Transaction date, Method→Payment method; each can be ignored.
- Preview Reconciliation button disabled until file selection.
- Import batches table: Batch, File, Rows, Matched, Status.
- Audit log table: Time, Internal user, Action, Entity.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Upload/mapping | source file and column mappings | ImportBatch, ImportMapping | File contents are never parsed. |
| Batch table | ID, filename, counts, status | ImportBatch | Needs error/match counts and actor/timestamps. |
| Audit table | time, user, action, entity label | AuditLog | Needs entity type/ID, before/after, request metadata. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Select file | Stores filename only | Upload to controlled staging, virus/type/size validation, parse workbook without mutating production data. |
| Change mapping | Local uncontrolled select | Persist mapping template/batch configuration. |
| Preview | Toast only | Parse, normalize, match, detect duplicates/errors, produce review rows. |
| Review batch/audit | Tables only | Open batch/error/audit detail, approve/commit or reject import. |

### Required Database Entities
ImportBatches, ImportFiles, ImportMappings, ImportRows/StagingRows, ImportErrors, ReconciliationMatches, Payments, Receipts, Students, AuditLogs, Users.

### Required API Endpoints
- `POST /api/imports/upload`
- `POST /api/imports/{id}/parse`
- `PUT /api/imports/{id}/mapping`
- `GET /api/imports/{id}/preview`
- `POST /api/imports/{id}/commit`
- `GET /api/imports`, `/imports/{id}/errors`
- `GET /api/audit-logs?...`

### Permissions
Admin and designated Finance/Import Officer upload/commit receipt data. Operations Manager approves high-risk imports. Auditor reads batch and audit records. Other roles no access.

### Issues or Questions
- Import and Audit are separate concerns; tabs are acceptable navigation, but service/API boundaries must remain separate.
- No staging-row review, error detail, duplicate resolution, rollback, checksum, source-sheet selection, or commit approval.
- “All Receipts” matching keys and duplicate policy are undefined.
- File retention/privacy policy is undefined.
- Audit log must be append-only and not editable through Sheets.

## In-App Page Not Found

### Route and File
- Route: Any unmatched path handled by `[...slug]`
- Source file: `src/components/layout/OperationsRouter.tsx` fallback
- Parent layout: `AppShell`
- Related sidebar navigation item: None.

### Business Purpose
Gives staff a safe navigation recovery path.

### Visible UI Structure
- Page not found header/description.
- Return to Dashboard button.

### Data Displayed

| UI Element | Data Fields Shown | Likely Data Entity | Notes |
|---|---|---|---|
| Error state | Static message | None | Rendered as a normal 200 application page. |

### User Actions

| Action | Current UI Behavior | Future Backend Behavior Needed |
|---|---|---|
| Return to Dashboard | Navigates to `/dashboard` | No API. |

### Required Database Entities
None.

### Required API Endpoints
None.

### Permissions
Any authenticated user.

### Issues or Questions
- Should use explicit route modules and Next.js `not-found.tsx`/`notFound()` so invalid entities and routes return correct 404 semantics.
- Invalid entity IDs currently do not reach this state; they display the first mock record.

# 5. Navigation and User Flow Analysis

## Sidebar structure

1. Dashboard → `/dashboard`
2. Students & Registration → `/students`
   - Student Registry → `/students`
   - Register Student → `/students/new`
3. Tracks & Groups → `/tracks-groups`
4. Schedule → `/schedule`
   - Master Schedule → `/schedule`
   - Create Session → `/schedule/new`
5. Attendance → `/attendance`
   - Quick Attendance → `/attendance`
   - Group Roster → `/attendance/roster`
6. Academic Records → `/academic-records`
7. Collections & Receipts → `/collections`
   - Quick Collection → `/collections`
   - Payment Ledger → `/collections/ledger`
   - Outstanding Balances → `/collections/outstanding`
8. Staff, Payroll & Expenses → `/staff-payroll`
   - Staff Directory → `/staff-payroll`
   - Payroll → `/payroll`
   - Expenses → `/expenses`
9. Profitability → `/profitability`
10. Certificates → `/certificates`
11. Users & Permissions → `/users-permissions`
12. Settings, Imports & Audit Log → `/settings`
   - Settings → `/settings`
   - Imports & Audit Log → `/imports-audit`

The structure matches the requested information architecture. Two labels are overloaded: “Staff, Payroll & Expenses” is a navigation group but its parent opens Staff Directory, and “Settings, Imports & Audit Log” opens Settings while imports/audit are separate. This is acceptable if nested items remain visible, but the parent labels should not imply a combined page.

## Topbar actions

- Mobile “Open navigation” opens the off-canvas sidebar.
- Global search opens by click or Ctrl/Cmd+K.
- The search overlay lists all navigation entries, including duplicate parent/child destinations; entered text is not used to filter results.
- Notifications button has no route, panel, or action.
- User identity and sidebar user chevrons have no profile/session/logout menu.
- “System operational” is static and should either be removed or connected to real health/import/sync state.

## Breadcrumbs

Breadcrumbs exist on Register Student, Student Profile, Track Detail, Group Detail, Create Session, Attendance Roster, Group Academic Record, and Staff Profile. List/dashboard/administration pages generally have none. The component is reusable and links correctly, but breadcrumb labels and dynamic IDs rely on mock data/fallbacks.

## Other route links

- Dashboard links to registration, schedule, ledger, students, outstanding balances, and certificates.
- Student registry rows link to profiles.
- Student quick cards link to profiles.
- Track cards link to track detail; group rows/cards link to group detail.
- Group student rows link to student profiles.
- Academic group cards link to record sheets.
- Collections pages interlink quick collection, ledger, outstanding, profile, and receipts.
- Staff names link to staff profiles using a native `<a>`, which causes a full page request instead of Next client navigation.

## Dead links and missing destinations

There are no visible anchors whose `href` targets an unhandled planned route. However, these visible actions have no implemented workflow: notifications, user/account menu/logout, View All Logs, table row action menus, export/download buttons, staff/track/group edit/create actions, Add Payment from student profile, pagination, many filters, and session-card detail.

The following navigation destinations are structurally underspecified:

- `/attendance/roster` has no session/group identifier.
- `/academic-records/[groupId]` has no assessment identifier.
- `/collections` cannot receive/preserve a selected student from Outstanding or Student Profile.
- No session detail route/drawer exists.
- No receipt-specific route exists; only modals.
- No explicit track/package/intake/group create/edit route exists.

## Main operational flows

### 1. Register Student

- **Start page:** `/students` or Dashboard.
- **Steps:** Register New Student → enter identity/contact → choose track/package/group/mode → enter contract/opening payment → Register & Generate Receipt → intended profile.
- **Pages involved:** `/students`, `/students/new`, `/students/[id]`; logically `/collections`/receipt preview.
- **Data created/updated:** Student, contacts, Enrollment, Contract, Payment, Receipt, AuditLog.
- **Missing/issues:** duplicate check, intake, capacity, dependent dropdowns, discount/installment plan, atomic transaction, real returned ID, receipt policy, status history.

### 2. Assign Student to Group

- **Start page:** `/groups/[groupId]` Enroll Student or Student Profile Enrollment tab.
- **Steps:** select existing student/enrollment → validate track/package/intake/capacity → assign or transfer → confirm effective date.
- **Pages involved:** Group Detail and Student Profile.
- **Data created/updated:** Enrollment or EnrollmentGroupAssignment; transfer/status history.
- **Missing/issues:** no actual UI, no transfer distinction, no capacity check, no historical assignments, no conflict with current group.

### 3. Create Track / Package / Intake / Group

- **Start page:** `/tracks-groups` and `/settings`.
- **Steps:** create track and version → define package/price/duration → create intake → create group with dates/capacity/mode/venue/team.
- **Pages involved:** Control Center, Track Detail, Settings.
- **Data created/updated:** Track, TrackVersion, Package, Intake, Group, policies, staff assignments.
- **Missing/issues:** only Track/Group placeholder buttons exist; no Intake page/entity; package settings are display-only; ownership is duplicated between Settings and Control Center.

### 4. Create Shared Teaching Session

- **Start page:** `/schedule`.
- **Steps:** New Session → enter details → enable Shared Teaching Session → select multiple groups → assign staff/venue/mode/link → resolve conflict → save.
- **Pages involved:** `/schedule`, `/schedule/new`, Group/Staff contextual views.
- **Data created/updated:** Session, SessionGroups, SessionStaff, meeting/venue assignment, conflict override, audit.
- **Missing/issues:** true availability engine, multiple mentors, compatibility/attendance-credit rules, conflict override, recurrence and status.

### 5. Record Attendance

- **Start page:** `/attendance` for one learner or `/attendance/roster` for bulk.
- **Steps:** select session/group → locate student or open roster → mark status/note → save/finalize.
- **Pages involved:** Quick Attendance, Roster, Group Detail summary, Student Profile history.
- **Data created/updated:** AttendanceRecord, finalization, edit history, summary.
- **Missing/issues:** roster route context, no required session, no unmarked state, notes not saved locally, lock/reopen/edit policy.

### 6. Record Academic Score / Task Completion

- **Start page:** `/academic-records`.
- **Steps:** choose track/assessment/group → open record sheet → set completion/score/notes → save.
- **Pages involved:** Academic Center, Group Record Sheet, Student/Group summaries.
- **Data created/updated:** Assessment, GroupAssessment, AcademicRecord, history.
- **Missing/issues:** assessment ID/management, score scale/attempts, finalization, grader/approval, group filtering.

### 7. Record Payment

- **Start page:** `/collections`, Student Profile, or Outstanding Balances.
- **Steps:** find/select student enrollment → review contract/balance → enter amount/type/method/reference → record → issue receipt.
- **Pages involved:** Quick Collection, Ledger, Outstanding, Student Profile.
- **Data created/updated:** Payment, allocation, Receipt, contract summary, audit.
- **Missing/issues:** student context handoff, method/type controls, payment date/reference, idempotency, overpayment, reversal/refund/void, maker/approver policy.

### 8. Open or Generate Receipt

- **Start page:** Payment history/ledger/collection desk.
- **Steps:** select receipt → preview → print/download; generation follows payment record.
- **Pages involved:** Collections, Ledger, Student Profile.
- **Data created/updated:** Receipt and immutable rendered document/version.
- **Missing/issues:** preview often uses generic/default values; no receipt state, void/reissue, sequence or document storage.

### 9. Record Expense

- **Start page:** `/expenses`.
- **Steps:** Add Expense → category/vendor/description/amount/allocation → save pending → review → approve/reject → include in profitability.
- **Pages involved:** Expenses, Group Detail summary, Profitability.
- **Data created/updated:** Expense, allocations, attachment, approval, audit.
- **Missing/issues:** date/payment/account/document fields, split allocations, approval UI/state machine.

### 10. Run Payroll

- **Start page:** `/payroll` after work-hour approval.
- **Steps:** choose/open period → calculate lines from work/compensation → review/adjust → approve → record payouts → close period.
- **Pages involved:** Staff Profile Work Hours/Compensation, Payroll, Staff payout history.
- **Data created/updated:** PayrollPeriod, PayrollLines, adjustments, approvals, StaffPayouts.
- **Missing/issues:** calculation/period/payout workflows, maker-checker, adjustments, shared-session policy, historical immutability.

### 11. Review Profitability

- **Start page:** `/profitability` or track/group summaries.
- **Steps:** choose period/track/group → review revenue/collections/cost/profit → drill into payments/expenses/payroll allocations.
- **Pages involved:** Profitability, Track Detail, Group Detail, Ledger, Expenses, Payroll.
- **Data created/updated:** normally none; report reads allocated finance data.
- **Missing/issues:** accounting definitions, allocation rules, drilldown, report date basis.

### 12. Issue Certificate

- **Start page:** `/certificates` or Student Profile.
- **Steps:** review five eligibility conditions → resolve blockers → issue one/bulk → generate/download → optionally revoke/reissue.
- **Pages involved:** Certificates, Student Profile, Attendance, Academic, Collections.
- **Data created/updated:** Eligibility snapshot, Certificate, document, issuance/revocation audit.
- **Missing/issues:** correct rule engine, policy version, template/number, name confirmation, revoke/reissue, bulk failure handling.

### 13. Import All Receipts Excel Data

- **Start page:** `/imports-audit` Excel Import tab.
- **Steps:** upload → select sheet/map columns → parse/validate → match student/payment/receipt → review errors/duplicates → approve commit → reconcile → audit.
- **Pages involved:** Import, Import Batches, Audit Log, Payment Ledger.
- **Data created/updated:** ImportBatch/File/Rows/Matches/Errors; staged then committed Payments/Receipts; audit.
- **Missing/issues:** only filename/mapping shell exists; no parsing, staging, review, commit, rollback, checksum, or duplicate policy.

### 14. Create User and Assign Permission

- **Start page:** `/users-permissions`.
- **Steps:** Invite Internal User → enter name/email/role → send invitation → activate account → adjust role permissions if authorized.
- **Pages involved:** Users & Permissions, Login.
- **Data created/updated:** UserInvitation, User, UserRole, RolePermissions, auth session/audit.
- **Missing/issues:** no real invitation/auth, no permission persistence/enforcement, no deactivation/session revoke, permission granularity too broad.

# 6. Data Model Extraction From Current UI

The following is an entity inventory inferred from the current UI. It is not a final schema. “Seen” means directly represented in code/UI; “Implied” means required to make a visible workflow internally consistent.

| Entity | Why It Exists | Key Fields Seen in UI | Related Entities | Existing Page Usage |
|---|---|---|---|---|
| User | Internal account and actor identity | name, work email, status, last active | Roles, Invitations, AuditLogs, Sessions | Login, Users, audit/update labels |
| Role | Named internal responsibility | Admin, Operations Manager, Program Coordinator, Finance Officer, Attendance Officer, Auditor | Users, Permissions | Users & Permissions |
| Permission | Controls sensitive actions | Students, Attendance, Finance, Payroll, Settings, Audit domains | Roles | Permission matrix; action-level fields are missing |
| UserRole | Supports role assignment | user, role | User, Role | Implied by invite/account table |
| RolePermission | Maps role to allowed actions | role, permission, allowed | Role, Permission | Permission matrix |
| UserInvitation | Supports internal onboarding | name, email, role, status/expiry (implied) | User, Role | Invite drawer |
| AuthenticationSession | Keeps staff signed in | remember-me choice, user, expiry (implied) | User | Login/root routing; not modeled |
| Student | Person identity | Academy ID, University ID, name, email, phone, national ID | University, College, Enrollments, Contacts | Registry, registration, profile, lookup pages |
| StudentContact / EmergencyContact | Structured contact/emergency details | phone, email, emergency name/phone | Student | Registration/profile; current emergency data is one field |
| StudentStatusHistory | Tracks active/withdrawn/completed/suspended lifecycle | status, effective date, reason (recommended) | Student, Enrollment, User | Missing but required for registry/group operations |
| University | Reference institution | name | College, Student | Registration, registry, profile, Settings |
| College | Faculty/college within institution | name, university | University, Student | Registration, profile, Settings |
| Track | Program family | ID/slug, name, status | TrackVersion, Package, Group, Assessment | Tracks pages, schedule, student enrollment, Settings |
| TrackVersion / Curriculum | Versions syllabus and requirements | version, effective dates, syllabus assets | Track, Assessments, Groups | Track Syllabus & Assets; implied |
| TrackAsset | Staff-facing controlled document | title/type/file/version | TrackVersion | Track Detail; **postpone unless document governance is required** |
| Package | Commercial/delivery offering | name; implied price/duration/features | Track, Enrollment, Group, Contract | Registration, profile, groups, Settings |
| Intake | Cohort admission period | name such as Summer 2026, month, dates | Groups, Enrollments | Profile/forecast text; **missing type/data** |
| Group | Operational cohort | code, name, track, package, mode, capacity, next session | Intake, Track, Package, Enrollments, Sessions, Staff | Control center, group/track details, filters |
| GroupStatusHistory | Group lifecycle | planned/active/completed/cancelled, dates, reason | Group, User | Required for certificate/group completion and reporting |
| Enrollment | Student’s participation in a program/group | student, track, package, intake, group, mode, enrollment date, coordinator, status | Student, Group, Contract | Currently flattened into Student; critical missing entity |
| EnrollmentTransfer / GroupAssignmentHistory | Preserves group moves | from group, to group, dates, reason, approver | Enrollment, Group, User | Timeline says “Moved to FS-A-2024”; missing model |
| Staff | Instructor/mentor/coordinator identity | ID, name, role, specialty, status | Assignments, Compensation, WorkLogs | Staff directory/profile, schedule, registration coordinator |
| StaffRole / Specialty | Classifies staff | Instructor, Mentor, Coordinator, specialty | Staff | Staff pages and assignment selectors |
| GroupStaffAssignment | Assigns delivery team over time | group, staff, role, effective dates | Group, Staff | Group Team, staff Assigned Groups |
| Session | One scheduled event | ID, title, date, start/end, mode, venue, status, meeting link | Groups, Staff, Attendance | Schedule, create session, group/staff pages |
| SessionGroup | Enables shared teaching | session, group, attendance-credit/allocation rules | Session, Group | `Session.groups[]`; Create Shared Teaching Session |
| SessionStaff | Supports instructor/mentor assignment | session, staff, teaching role, hours | Session, Staff, WorkLog | Schedule/create session/staff shared sessions |
| Venue | Physical location | name | Session | Schedule/Create Session, Settings |
| ConflictOverride | Records authorized scheduling exception | conflict type, reason, approver | Session, Staff, Venue, Group | Conflict warning; implied |
| AttendanceRecord | One enrollment’s session attendance | session, enrollment/student, status, note, marked by/at | Session, Enrollment, User | Quick attendance, roster, student/group summaries |
| AttendanceFinalization | Locks a roster/version | session, finalized by/at, version | AttendanceRecords, User | Roster Save & Finalize; implied |
| AttendanceEditHistory | Audits changes/reopens | old/new status, reason, actor/time | AttendanceRecord, User | Missing but operationally required |
| AttendancePolicy | Defines thresholds and lateness | warning %, blocked %, late minutes, effective dates | Certificates, Enrollments | Settings and certificate rules |
| Assessment | Defines task/score requirement | title, type, max score, threshold, track/version | TrackVersion, GroupAssessment | Academic filter/record sheet; missing type |
| GroupAssessment | Assigns assessment to cohort | group, assessment, due date/status | Group, Assessment | Academic work queue; implied |
| AcademicRecord | Student assessment result | completion, score, notes, updated by/time | Enrollment, Assessment, User | Academic record sheet/profile/group |
| AcademicRecordHistory | Audits grade/task changes | old/new result, reason, actor/time | AcademicRecord, User | Missing but required for controlled records |
| AcademicPolicy | Defines score/certificate thresholds | pass/merit/distinction, effective dates | Assessments, Certificates | Settings |
| FinancialContract / EnrollmentFinancialTerms | Defines amount owed | enrollment, total, currency, discount, installment terms, status | Enrollment, PaymentSchedule | Student registration/profile/collections |
| InstallmentSchedule | Defines due amounts/dates | contract, due date, amount, status | Contract, Payments | Outstanding/Due this week; missing |
| Payment | Money received/reversed/refunded | ID, date, type, method, amount, status, reference, collector | Enrollment, Receipt, Reconciliation | Collections/ledger/profile/dashboard |
| PaymentAllocation | Allocates payment to contract/installment | payment, contract/installment, amount | Payment, Contract | Needed for re-enrollment/multiple contracts |
| PaymentMethod | Controlled tender type | Cash, InstaPay, Card, Bank transfer, active status | Payment | Settings, collection forms |
| Receipt | Legal/operational acknowledgement | number, payment, issued date/by, status, document version | Payment, User | Collection/ledger/profile/import |
| ReceiptSequence | Generates unique receipt numbers | prefix/year/next value | Receipt | ID numbering Settings; critical for concurrency |
| PaymentReconciliation | Matches imported/external receipt/payment | payment, batch/source, state, matched by/time | Payment, ImportBatch | Ledger statuses and import workflow |
| PaymentReversal / Refund | Corrects a payment without deletion | original payment, type, amount, reason, approval | Payment, Receipt, User | **Missing but must-have finance entity** |
| CollectionFollowUp | Tracks outstanding-balance work | enrollment, status, contact time/channel/outcome/next date/owner | Contract, Student, User | Outstanding Balances |
| Vendor | Reusable payee/supplier | name/contact/tax/reference | Expense | Expense form/table; currently a string |
| ExpenseCategory | Controlled classification | name, active status | Expense | Expenses and Settings |
| Expense | Cost record | ID, date, vendor, description, amount, status | Vendor, Category, Allocation, Approval | Expenses/group/profitability |
| ExpenseAllocation | Splits cost to group/session/overhead | expense, target type/ID, amount/percentage | Expense, Group, Session | `linkedTo`; needs polymorphic or explicit joins |
| ExpenseApproval | Workflow history | expense, decision, actor/time, reason | Expense, User | Pending/Approved/Rejected statuses; implied |
| Attachment | Stores invoice/receipt/supporting file metadata | entity type/ID, file, uploaded by/time | Expense, TrackAsset, ImportFile | Missing but expected for expenses/assets/imports |
| CompensationPlan | Effective staff pay rule | staff, basis, rate, currency, effective dates | Staff, PayrollLine | Staff profile |
| WorkLog | Payable work evidence | staff, session/date, hours, status | SessionStaff, CompensationPlan | Staff Work Hours |
| WorkLogApproval | Approval trail for payable work | work log, approver, decision/time | WorkLog, User | Approved Sessions/Hours; implied |
| PayrollPeriod | Payroll cycle/state | period dates, status, calculated/approved/closed times | PayrollLines | Payroll selector/status; missing type |
| PayrollLine | Calculated obligation per staff | period, staff, hours, rate, gross, adjustments, net, status | Staff, WorkLogs, Compensation | Payroll table/history |
| PayrollAdjustment | Bonus/deduction/manual correction | line, type, amount, reason, approver | PayrollLine, User | Missing but operationally necessary |
| StaffPayout | Money paid to staff | staff/line, date, amount, method, reference, status | PayrollLine, Staff | Paid/remaining and Payment History |
| PayrollAllocation | Assigns staff cost to groups/sessions | payroll line/work log, group/session, amount | PayrollLine, Group, Session | Profitability; implied |
| CertificatePolicy | Versioned eligibility rules | attendance, tasks, score, balance, group completion, waiver rules | Track/Package, Certificate | Settings/checklist; missing explicit entity |
| CertificateEligibilitySnapshot | Explains a decision at a point in time | enrollment, policy version, check results | Enrollment, Policy | Certificate queue; important for auditability |
| Certificate | Issued credential record | number, enrollment, printed name, template/version, issue/revoke dates, document | Student, Enrollment, User | Certificates/profile |
| ImportBatch | One controlled import attempt | ID, filename, type, status, counts, user/timestamps, checksum | ImportFile, Mapping, Rows | Import Batches |
| ImportFile | Uploaded source metadata | filename, size, hash, location | ImportBatch | Upload area; implied |
| ImportMapping | Source-to-target column choices | source column, target field, transform | ImportBatch | All Receipts mapping |
| ImportRow / StagingRow | Parsed but uncommitted data | row number, raw/normalized values, validation state | Batch, Error, Match | Missing review layer |
| ImportError | Validation/match problem | row, code, message, severity | ImportRow | Missing error review |
| ReconciliationMatch | Links staged row to existing/new entity | row, payment/receipt/student, confidence/decision | ImportRow, Payment, Receipt | Required for All Receipts reconciliation |
| AuditLog | Append-only actor/action/entity history | time, user, action, entity type/ID, before/after, request metadata | All mutable entities | Audit tab, timelines, activity cards |
| OperationalAlert | Exception queue item | type, severity, target, status | Multiple domains | Dashboard Needs attention; can be derived rather than stored initially |
| EnrollmentForecast | Forecasted intake count | intake/month, track, value, method | Intake/Track | Peak intake card; **postpone for MVP** |
| SystemHealth | Technical service status | service, state, time | None | Decorative card; **unnecessary as an academy database entity** |

# 7. Page Consolidation Recommendations

## Keep

- **Login:** required entry point; add real auth/error/session handling.
- **Dashboard:** valuable exception-oriented home page; make role-aware and data-driven.
- **Students Registry / Register Student / Student Profile:** all are core and represent distinct list/create/detail responsibilities.
- **Tracks & Groups Control Center / Track Detail / Group Detail:** retain hierarchy; clarify creation ownership and contextual summaries.
- **Master Schedule / Create Session:** core delivery workflows.
- **Quick Attendance / Attendance Roster:** retain both because single-student speed and bulk roster finalization are distinct modes; roster must be session-scoped.
- **Academic Records Center / Record Sheet:** core staff-only academic workflow; add assessment identity.
- **Quick Collection / Ledger:** retain both because fast transaction entry and finance review are distinct.
- **Outstanding Balances:** retain as a daily collections work queue if follow-up workflow/history is implemented.
- **Staff Directory / Staff Profile:** core people and assignment records.
- **Payroll / Expenses / Profitability:** distinct finance processes; keep each as a dedicated page.
- **Certificates:** distinct approval/issuance queue.
- **Users & Permissions:** required for an internal system.
- **Settings:** required, but split ownership by reference type.
- **Imports/Audit:** keep navigation destination; preserve separate internal services/tabs.

## Merge

1. **Group Detail “Schedule” + “Sessions” tabs → one “Sessions & Schedule” tab.** They currently render the same data/component. Provide calendar/list toggle inside one tab.
2. **Staff Profile “Payroll History” + “Payment History.”** Either merge as “Payroll & Payout History” with separate columns/subsections, or properly distinguish payroll obligations from actual payout transactions. Do not keep duplicate tables.
3. **Student Profile Add Payment + Quick Collection workflow.** Reuse one payment drawer/service. Student Profile should open it pre-scoped or deep-link to `/collections?studentId=...`.
4. **Student/Group contextual finance, attendance, academic, and profitability tabs with domain centers.** Keep read-only summaries and recent items in context, but route edits to authoritative workflows. This avoids competing write screens.
5. **Track profitability chart with global Profitability.** Keep only a track-filtered summary/drilldown, using the same report service and calculations.
6. **Group enrollment and Student enrollment/transfer workflow.** Use one enrollment editor invoked from either context, not separate implementations.
7. **Settings Track/Package cards with Tracks & Groups governance.** Track/package master data can be accessed from Settings, but actual creation/editing should use one domain workflow. Groups should be removed from Settings entirely.
8. **Import Batches and Audit Log navigation.** They may remain tabs for the MVP, but route/service separation should be possible (`/imports-audit?tab=...` or nested routes) for deep links and permissions.

## Remove or Postpone

- **Remove duplicate Group “Schedule” or “Sessions” tab.** No unique purpose currently.
- **Remove one duplicate Staff history tab** unless payout transactions are implemented separately.
- **Remove Groups card from Settings.** Group operations belong in Tracks & Groups.
- **Remove decorative “System Health” from business data/UI** unless real service-health monitoring is intentionally exposed to staff.
- **Postpone Intake forecasting/Peak Intake analytics** until historical enrollment data and forecasting ownership exist.
- **Postpone track asset/document management** if the MVP can link to controlled external files; do not build a file repository without clear requirements.
- **Postpone sophisticated profitability charts** until allocation/accounting rules are agreed. A correct numeric table is more valuable than incorrect charts.
- **Postpone custom per-user permission overrides** unless role-only RBAC proves insufficient; start with stable role/action permissions.
- **Do not add CRM/leads, public registration, student/instructor/mentor portals, assignment submission, quizzes, or public certificate verification.** They remain explicitly outside scope.

# 8. Missing Features and Pages

## Must Have Before Development

These need decisions and basic UX/schema coverage before connecting the UI to a database or Google Sheets:

- Explicit authentication/session/logout and enforced RBAC.
- Student lifecycle status with effective-date/reason history.
- Duplicate student detection using Academy ID, University ID, normalized phone/email, and national ID where legally allowed.
- A real Enrollment entity and enrollment history, including withdrawal, completion, re-enrollment, group transfer, and package/track changes.
- Intake definition and assignment; the UI already references intakes.
- Track/package/intake/group create/edit workflow with unique codes, statuses, dates, and capacity validation.
- Group transfer history and capacity validation.
- Session detail/edit/cancel/reschedule workflow.
- Server-side conflict validation for staff, group, venue, and online resources; documented override policy.
- Attendance records tied to `sessionId + enrollmentId`, including unmarked state, notes/reasons, finalize/lock/reopen, and edit history.
- Assessment definition/assignment before academic records can be stored reliably.
- Academic record history, score range/maximum, completion states, and finalization/approval policy.
- Financial contract/installment schedule model; paid/remaining must be calculated from a ledger.
- Payment idempotency, overpayment validation, external reference, collector, and payment allocation.
- Payment reversal/refund and receipt void/reissue workflows.
- Unique, concurrency-safe receipt numbering and immutable receipt document/version.
- Outstanding-balance follow-up history with owner/outcome/next date.
- Staff status/contact/contract information and effective-dated compensation plans.
- Work log/source approval and payroll period/line calculation workflow.
- Payroll approval and staff payout recording, with maker-checker rules.
- Expense date, supporting document, allocation, and approval/rejection workflow.
- Defined profitability/accounting rules and cost-allocation source of truth.
- Versioned certificate eligibility rules and auditable issue/revoke/reissue flow.
- Action-level permission matrix and append-only audit logging.
- Import staging, validation, duplicate/error review, approval, commit, and rollback plan.
- Consistent 404/not-found behavior for invalid record IDs.
- Backend validation and structured error states for every transactional form.
- Data backup/restore/export strategy even if Google Sheets is initially used.

No separate public page is required for most of these; many belong as drawers/tabs/modals in existing pages. Two new internal destinations are strongly justified:

1. **Session Detail** (`/schedule/[sessionId]` or drawer): edit/cancel, linked groups/staff, conflict resolution, attendance status, activity.
2. **Import Batch Detail/Review** (`/imports-audit/[batchId]`): row errors, matches, duplicate decisions, approve/commit/rollback.

## Important but Can Be Phase 2

- Student documents/attachments and document expiry tracking.
- Advanced group transfer approval and waitlist.
- Recurring session templates.
- Venue capacity/equipment management.
- Attendance QR/scanner support for staff use (not student portal).
- Multiple assessment attempts, rubric-level scoring, and moderation.
- Installment reminders and scheduled follow-up assignments.
- Split payment allocations across multiple enrollments/contracts.
- Refund approval and partial refund workflows.
- Vendor master data and expense budget controls.
- Payroll bonuses/deductions/holds and cost-center allocation tools.
- Certificate templates by track/package and batch generation.
- Saved filters, configurable exports, and scheduled internal reports.
- Role-specific dashboards.
- Google Sheets sync/reconciliation status dashboard if Sheets remains involved.

## Nice to Have Later

- Enrollment forecasting and intake capacity modeling.
- Advanced profitability trends and scenario planning.
- Staff utilization analysis.
- Configurable notification center.
- Global entity search beyond page jumps.
- Keyboard command palette with actions.
- Custom user-level permissions where role permissions are insufficient.
- Multi-branch/campus analytics if TechTrek expands beyond one operation.

# 9. Database Readiness Assessment

## Overall assessment

The UI is **ready for domain discovery but not ready for immediate schema implementation**. Stable concepts exist, but several critical transactions are flattened into summary fields or represented only as labels. Building tables directly from current TypeScript types would create data drift and make transfers, reversals, historical reporting, and audits difficult.

## Stable entities

- User, Role, Permission.
- Student, University, College.
- Track, Package, Intake, Group.
- Staff.
- Session, SessionGroup, SessionStaff.
- Enrollment.
- AttendanceRecord.
- Assessment, AcademicRecord.
- FinancialContract, Payment, Receipt.
- Expense.
- CompensationPlan, WorkLog, PayrollPeriod, PayrollLine, StaffPayout.
- Certificate.
- ImportBatch, ImportRow/Error/Match.
- AuditLog.

## Unstable or unclear entities

- Package: unclear whether global or track-specific; price/duration/version not defined.
- Intake: visible but not modeled; relationship to track/package/group unclear.
- Enrollment financial terms: one total vs discount/scholarship/installment plan/version.
- Session track: should be derived from linked groups or allowed to span tracks?
- Attendance finalization: session-wide vs group-specific for shared sessions.
- Assessment/task: one boolean and one score are insufficient; attempts/weights/max score unclear.
- Receipt: one-to-one with payment or one receipt can cover multiple payments/allocations?
- Payment type vs installment schedule semantics.
- Reconciliation status and external source.
- Work hours and approved sessions: source/approval authority unclear.
- Compensation basis: hourly only or per session/group/fixed/bonus.
- Profitability allocation model for shared sessions and overhead.
- Certificate eligibility and waiver policy.

## Fields needing clarification before schema design

- Student uniqueness and required personal/contact fields.
- Academy ID and receipt numbering format, reset scope, and concurrency authority.
- Student/enrollment/group status values and transition rules.
- Group dates, branch, venue, capacity, completion status, and waitlist.
- Contract price, discount, currency, installment schedule, due-date/grace policy.
- Payment effective date, settlement date, reference, account, reversal/refund status.
- Attendance late threshold, excuse reasons, absent defaults, finalization and correction.
- Assessment maximum score, pass threshold, completion vs submission, attempts and approvals.
- Staff compensation basis and effective dates.
- Payroll period state machine, adjustments, payout allocation.
- Expense allocation and approval thresholds.
- Certificate number/template/name/revocation/waiver fields.
- Audit retention and sensitive before/after field masking.

## Fields that should be calculated rather than stored as authoritative values

- Student `paid`, `remaining`, `paymentStatus`.
- Student `attendance` percentage.
- Student `certificateStatus`/eligibility, except issued/revoked lifecycle state.
- Group `students` count and available capacity.
- Group `attendance` percentage.
- Group `collections`, `profitability`, and `nextSession`.
- Staff `approvedHours`, `accrued`, `paid`, and remaining amount outside period-specific snapshots.
- Dashboard KPI values.
- Profit and margin.

Calculated values may be cached/materialized for performance, but the ledger/history tables must remain authoritative.

## Required unique identifiers

- Internal immutable IDs for every entity (UUID/ULID or equivalent).
- Human-readable unique Academy ID, group code, session code if displayed, staff code, payment ID, expense ID, payroll period code, certificate number, import batch code.
- Receipt number must be uniquely allocated under concurrency and never reused.
- Student University ID may only be unique within a university, not globally; confirm.
- Unique attendance constraint: normally `(session_id, enrollment_id)`.
- Unique academic record constraint: likely `(assessment_id, enrollment_id, attempt_no)`.
- Unique payroll line constraint: `(payroll_period_id, staff_id)` unless multiple line categories are used.

## Required relationships

### One-to-many

- University → Colleges; Student → Enrollments; Track → TrackVersions/Groups/Assessments; Intake → Groups/Enrollments.
- Enrollment → contracts/installments/payments/attendance/academic results/certificates.
- Session → attendance records; PayrollPeriod → PayrollLines; ImportBatch → ImportRows.

### Many-to-many

- Users ↔ Roles (optional initially) and Roles ↔ Permissions.
- Sessions ↔ Groups through SessionGroups.
- Sessions ↔ Staff through SessionStaff.
- Groups ↔ Staff through effective-dated GroupStaffAssignments.
- Payments ↔ Contracts/installments through PaymentAllocations where one payment can cover multiple obligations.
- Expenses ↔ groups/sessions/cost centers through ExpenseAllocations.
- PayrollLines/WorkLogs ↔ groups/sessions through PayrollAllocations.

## Recommended sources of truth

- **Payments/balances:** immutable payment and adjustment ledger plus contract/installment obligations. Never manually store `student.paid` as the source of truth.
- **Receipts:** receipt record created atomically from an accepted payment; immutable rendered version; void/reissue recorded as new lifecycle events, never delete.
- **Attendance:** one record per session/enrollment plus finalization and edit history; percentage derived from policy-weighted records.
- **Academic records:** assessment definitions plus versioned/attempted student results and history.
- **Payroll:** approved WorkLogs + effective CompensationPlans generate frozen PayrollLines; StaffPayouts reduce payable balance.
- **Expenses:** approved Expense records and allocations; never infer from free-text group codes.
- **Profitability:** derived report from contracts/recognized revenue policy, payments, approved expenses, and payroll allocations.
- **Certificates:** issued Certificate is authoritative; eligibility is recalculated and snapshot at issue time using a versioned policy.

## Risks of Google Sheets as the MVP database

Google Sheets can work as a temporary administrative staging/reporting tool but is risky as the primary transactional database:

- No reliable multi-row transaction for student + enrollment + contract + payment + receipt.
- Race conditions for Academy IDs and receipt numbers.
- Weak uniqueness and referential-integrity enforcement.
- Concurrent edits can overwrite records and create balance drift.
- Difficult immutable audit log and row-level security.
- Sensitive student/payroll data may be overexposed through sheet sharing.
- Formula/manual edits can corrupt calculated fields.
- API quotas, latency, partial failures, and eventual synchronization concerns.
- Complex joins and histories become fragile across tabs.
- Hard to implement idempotent imports/payment recording and reversal semantics.
- Backup/version history is not a substitute for tested restore and transaction logs.

If Sheets is required initially, place a server-side service/API in front of it. Use immutable internal IDs, protected ranges, append-only ledgers, explicit schema/version columns, optimistic revision checks, idempotency keys, centralized sequence allocation, service-account permissions, audit events in a separate append-only store/tab, and scheduled snapshots. Do not let the browser write to Sheets directly.

# 10. Questions for Product Owner

## Students and Enrollment

1. What makes a student unique: Academy ID, national ID, university + University ID, phone, email, or a combination?
2. Is University ID unique only within a university?
3. Which personal fields are mandatory, and who may view national ID/emergency contacts?
4. What student statuses are required, and what transitions/reasons/approvals apply?
5. Can one student have multiple simultaneous or historical enrollments?
6. Is an enrollment tied to Track + Package + Intake + Group, and can any of those change after registration?
7. Does changing group create a transfer history, or overwrite the enrollment’s group?
8. Can students re-enroll in another track/package after completion or withdrawal?
9. Who can register, edit, withdraw, suspend, complete, or transfer a student?
10. What duplicate warning can be overridden, by whom, and with what reason?
11. What are the precise definitions of Track, Package, Intake, and Group?
12. Is delivery mode a property of Group, Enrollment, Session, or all three with override rules?

## Groups and Hybrid Sessions

13. What group statuses and dates are required: planned, enrollment-open, active, completed, cancelled?
14. Is capacity a hard limit, warning, or overridable? Who can override it?
15. Can one group change instructor/mentor/venue over time?
16. Can a shared session link groups from different tracks/packages/intakes?
17. For a shared session, is attendance finalized once for the session or separately per group?
18. How are teaching hours/cost divided across groups in a shared session?
19. Are sessions recurring, and should recurrence generate individual session records?
20. Which conflicts block saving: instructor, mentor, group, venue, online room? Can they be overridden?
21. What session statuses/reasons are needed for cancelled, rescheduled, completed, and no-show sessions?
22. Is a session tied to a curriculum module/topic or only a free-text title?

## Attendance

23. What statuses are allowed beyond Present/Late/Absent/Excused, including Unmarked or Cancelled Session?
24. Is lateness automatic from check-in time or manually chosen? What threshold applies?
25. Are excuse reason/evidence and notes required?
26. Who can mark, finalize, reopen, and correct attendance?
27. Does finalization lock the whole session, each group, or individual rows?
28. How is attendance percentage calculated: count, weighted status, cancelled sessions, excused absences?
29. Which attendance threshold blocks certificates, and can it be waived?
30. How long can attendance remain editable, and what audit history is required?

## Academic Records

31. What assessment types exist: task completion, numeric score, pass/fail, attendance/participation, project?
32. Are assessments defined per track version, package, group, or session?
33. What are max score, pass thresholds, weights, attempts, and missing/exempt statuses?
34. Is “Task Completed” independent from score?
35. Who records, reviews, approves, locks, or corrects results?
36. Are notes internal only, and do they contain sensitive information?
37. Does a certificate require every assessment or a weighted aggregate?

## Finance and Receipts

38. Is the amount owed defined per enrollment contract, package price, negotiated discount, scholarship, or manual override?
39. Which currencies are supported, and are taxes/fees relevant?
40. Is there a formal installment schedule with due dates and grace periods?
41. Can one payment cover multiple enrollments/installments, or can multiple payments share one receipt?
42. What payment states are needed: pending settlement, recorded, reconciled, reversed, refunded, failed?
43. Which methods require an external transaction/reference number or proof attachment?
44. Can staff backdate a payment, and which date drives accounting and receipts?
45. How are overpayments, partial refunds, and payment transfers handled?
46. Is receipt numbering global, annual, branch-specific, or method-specific?
47. Can a receipt be voided, corrected, or reissued? Must the original remain accessible?
48. Who can record, reconcile, reverse, refund, void, and export financial records?
49. What does “reconciled” mean, and against which external source?
50. What is the required follow-up workflow for outstanding balances?

## Staff and Payroll

51. Are Instructor/Mentor/Coordinator staff roles mutually exclusive or can one person hold several?
52. Are staff application users, or only records managed by internal operations staff?
53. Which compensation bases exist: hourly, per session, per student, fixed monthly, milestone, bonus?
54. Can rates differ by track, group, session type, or role and change over time?
55. What creates payable work: scheduled session, completed session, attendance finalized, or approved work log?
56. Who approves staff hours and who approves payroll?
57. Is maker-checker separation required between payroll preparation, approval, and payout?
58. Which bonuses, deductions, advances, or holds must be supported?
59. How are shared-session hours and costs divided?
60. What payout methods/references/documents are required?
61. When is a payroll period locked, reopened, or corrected?

## Expenses and Profitability

62. Who may create, submit, approve, reject, pay, edit, or void an expense?
63. Which expense values require approval thresholds or multiple approvers?
64. Are vendor master data, invoices, taxes, payment accounts, and attachments required?
65. Can one expense be split across groups, sessions, tracks, branches, or general overhead?
66. What is “revenue” for profitability: contracted, recognized, invoiced, or collected cash?
67. Should discounts, refunds, bad debt, and unpaid contracts reduce revenue or collections?
68. How should general overhead and shared teaching payroll be allocated?
69. Which reporting periods and drilldowns are required?

## Certificates

70. Is eligibility evaluated per enrollment, group completion, or student overall?
71. What exact attendance, assessment, score, finance, and completion rules apply by track/package?
72. Can any requirement be waived, by whom, and with what documented reason?
73. Is zero balance always mandatory?
74. What certificate numbering, printed-name, template, language, and issue-date rules apply?
75. Can certificates be revoked, corrected, or reissued?
76. Who is allowed to issue individually or in bulk?

## Permissions and Audit

77. Is role-only RBAC sufficient, or are per-user overrides required?
78. For each domain, which actions need separate permissions: view, create, edit, delete/void, approve, export?
79. Which fields are sensitive by role: national ID, phone/email, contract amount, payroll rate, profit?
80. Can Operations Managers create Admin users or change role permissions?
81. Should the system prevent the last Admin from being disabled or losing permission?
82. Which audit events and before/after values must be retained, and for how long?
83. Must auditors be able to export logs, and should exports themselves be audited?

## Google Sheets Integration

84. Is Google Sheets intended as the primary transactional store, an import/export bridge, or a reporting mirror?
85. Which existing workbooks/tabs are authoritative today, especially “All Receipts”?
86. Who manually edits those sheets, and can that continue after the app launches?
87. What stable unique key exists in each sheet for students, enrollments, payments, and receipts?
88. How should duplicate or conflicting rows be resolved?
89. Must synchronization be one-way or two-way, and what is the conflict policy?
90. What latency is acceptable between app actions and sheet visibility?
91. How should receipt numbers be safely allocated when multiple staff record payments concurrently?
92. What are the expected row volumes and API quota constraints?
93. What sheet-sharing/security rules exist for student and payroll data?
94. What is the backup, restore, rollback, and disaster-recovery process?
95. Can an append-only database/service be used for audit and financial ledgers even if reference data remains in Sheets?

# 11. Final Recommended MVP Scope

## Pages to keep

1. `/login`
2. `/dashboard`
3. `/students`
4. `/students/new`
5. `/students/[id]`
6. `/tracks-groups`
7. `/tracks-groups/[trackId]`
8. `/groups/[groupId]`
9. `/schedule`
10. `/schedule/new`
11. New recommended Session Detail route/drawer
12. `/attendance`
13. `/attendance/roster` revised to identify a session
14. `/academic-records`
15. `/academic-records/[groupId]` revised to identify an assessment
16. `/collections`
17. `/collections/ledger`
18. `/collections/outstanding`
19. `/staff-payroll` renamed Staff Directory
20. `/staff-payroll/[staffId]`
21. `/payroll`
22. `/expenses`
23. `/profitability`
24. `/certificates`
25. `/users-permissions`
26. `/settings`
27. `/imports-audit`
28. New recommended Import Batch Detail/Review route

## Pages/tabs to merge

- Group Schedule + Sessions → Sessions & Schedule.
- Staff Payroll History + Payment History → one clearly separated Payroll & Payout area, or two genuinely distinct datasets.
- Student Add Payment and Quick Collection → shared payment workflow.
- Contextual attendance/academic/finance/profitability tabs → read-only summaries linked to domain write workflows.
- Track/group/package editing entry points in Settings and Control Center → one domain implementation.

## Pages/features to remove or postpone

- Remove duplicate group/staff tabs.
- Remove Groups from Settings.
- Remove decorative System Health business card unless backed by real monitoring.
- Postpone forecasting, advanced charting, track file repository, custom user permission overrides, and nonessential notification features.
- Continue excluding CRM/leads, portals, public LMS/registration/certificate verification, assignment submission, and quizzes.

## Core database tables required

### Identity and access

- `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `user_invitations`, `auth_sessions`, `audit_logs`.

### Students and delivery

- `students`, `student_contacts`, `student_status_history`, `universities`, `colleges`, `tracks`, `track_versions`, `packages`, `intakes`, `groups`, `group_status_history`, `enrollments`, `enrollment_transfer_history`.
- `staff`, `staff_roles`, `staff_status_history`, `group_staff_assignments`.
- `sessions`, `session_groups`, `session_staff`, `venues`, `conflict_overrides`.

### Attendance and academics

- `attendance_records`, `attendance_finalizations`, `attendance_edit_history`, `attendance_policies`.
- `assessments`, `group_assessments`, `academic_records`, `academic_record_history`, `academic_policies`.

### Finance

- `financial_contracts`, `installment_schedules`, `payment_methods`, `payments`, `payment_allocations`, `payment_adjustments`/`refunds`, `receipts`, `receipt_sequences`, `payment_reconciliations`, `collection_follow_ups`.
- `vendors`, `expense_categories`, `expenses`, `expense_allocations`, `expense_approvals`, `attachments`.
- `compensation_plans`, `work_logs`, `work_log_approvals`, `payroll_periods`, `payroll_lines`, `payroll_adjustments`, `staff_payouts`, `payroll_allocations`.

### Completion and import

- `certificate_policies`, `certificate_eligibility_snapshots`, `certificates`, `certificate_sequences`.
- `import_batches`, `import_files`, `import_mappings`, `import_rows`, `import_errors`, `reconciliation_matches`.

## Suggested implementation order

1. **Resolve product questions and statuses:** finalize terminology, IDs, state machines, permission actions, and source-of-truth rules.
2. **Refactor route architecture before data work:** explicit App Router route modules, route-level loading/error/not-found, authenticated layout, permission guards. Preserve current UI; do not redesign.
3. **Implement identity/access/audit foundations:** Users, roles, permissions, sessions, append-only audit service.
4. **Implement reference and core delivery data:** universities, colleges, tracks, packages, intakes, groups, staff, assignments.
5. **Implement Students + Enrollments:** registry, registration, profile, statuses, duplicate/capacity checks, transfer history.
6. **Implement Sessions:** schedule, shared teaching joins, availability/conflict engine, session detail/edit.
7. **Implement Attendance:** session roster source of truth, draft/finalize/reopen/edit history, summaries.
8. **Implement Assessments and Academic Records:** assessment definitions, group assignment, bulk recording/history.
9. **Implement Finance ledger:** contracts/installments, payments, receipt sequences/documents, reversal/refund, outstanding follow-up. This must precede profitability and certificate finance checks.
10. **Implement Expenses and Payroll:** approval state machines, compensation/work logs, payroll periods/lines/payouts and allocations.
11. **Implement Profitability:** only after revenue/cost/allocation rules and ledgers are authoritative.
12. **Implement Certificates:** versioned eligibility engine, issue/revoke/reissue, immutable documents.
13. **Implement imports/reconciliation:** staging and review against stable target entities; never import directly into live ledgers.
14. **Add exports, saved filters, role dashboards, forecasting, and advanced analytics after transactional integrity is proven.**

The practical MVP should optimize for correctness, auditability, and fast internal workflows—not breadth of charts. The current frontend is a strong visual requirements prototype, but its mock summary types must not become the database schema without the normalization and business clarifications described above.
