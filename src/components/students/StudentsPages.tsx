"use client";

import { Award, CheckCircle2, Clock, Download, FileSpreadsheet, ReceiptText, Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { DELIVERY_MODE_OPTIONS, deliveryModeLabel, normalizeDeliveryMode } from "@/lib/delivery-mode";
import type { EnrollmentDto, OfferingDto, OperationalTrainingDetailsDto, PaymentDto, RegistryRowDto, StudentAcademicProfileDto, StudentAcademicWorkRow, StudentDto, StudentIssuedCertificateDto } from "@/types/google";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { FilterPanelHeader, MultiSelectFilter, SelectedFilterChips, type MultiSelectFilterDefinition } from "@/components/ui/MultiSelectFilters";
import { useToast } from "@/components/ui/overlays";
import { Breadcrumbs, Button, Card, EmptyState, ErrorState, Field, KpiCard, LinkButton, LoadingState, PageHeader, SearchInput, Select, StatusBadge, Tabs } from "@/components/ui/primitives";
import { useAuth } from "@/components/auth/AuthProvider";
import { StudentPersonalDataEditor } from "@/components/students/StudentPersonalDataEditor";
import { ChangeTrackEditor } from "@/components/students/ChangeTrackEditor";
import { DeleteStudentModal } from "@/components/students/DeleteStudentModal";
import { StudentProfileHeader } from "@/components/students/StudentProfileHeader";
import { packageHoursLabel, readableEnum, safeDisplayText } from "@/lib/display";
import type { StudentAttendanceHistory } from "@/types/attendance";

const money = (value: number) => new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(value);
const filterText = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const optionText = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");
type RegistryFilterKey = "programScope" | "studentUniversity" | "college" | "track" | "exactHours" | "paymentStatus" | "deliveryMode" | "enrollmentStatus" | "certificateStatus" | "certificateDelivery" | "trainingFormStatus";
type RegistryFilters = Record<RegistryFilterKey, string[]>;
type StudentProfileResponse = { student: StudentDto; enrollments: EnrollmentDto[]; payments: PaymentDto[]; operationalDetails: OperationalTrainingDetailsDto[]; attendanceHistory: StudentAttendanceHistory[]; academicProfile: StudentAcademicProfileDto };
const emptyRegistryFilters: RegistryFilters = { programScope: [], studentUniversity: [], college: [], track: [], exactHours: [], paymentStatus: [], deliveryMode: [], enrollmentStatus: [], certificateStatus: [], certificateDelivery: [], trainingFormStatus: [] };
const optionList = (values: Array<string | number | null | undefined>, formatLabel?: (value: string) => string) => {
  const options = new Map<string, string>();
  for (const value of values) {
    const raw = optionText(value);
    if (!raw) continue;
    const key = filterText(raw);
    if (!options.has(key)) options.set(key, formatLabel ? formatLabel(raw) : raw);
  }
  return [...options.entries()].map(([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label));
};
const trackIdentity = (value: unknown) => filterText(value).replace(/[^a-z0-9]+/g, "");
const trackFilterValue = (row: RegistryRowDto) => `name:${trackIdentity(row.track)}`;
const trackFilterOptions = (rows: RegistryRowDto[]) => {
  const byName = new Map<string, string>();
  for (const row of rows) {
    const label = optionText(row.track);
    if (!label) continue;
    const nameKey = trackIdentity(label);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, label);
  }
  return [...byName.entries()].map(([key, label]) => ({ value: `name:${key}`, label })).sort((left, right) => left.label.localeCompare(right.label));
};
const filterMatchesAny = (value: unknown, selected: string[]) => !selected.length || selected.some(item => filterText(value) === filterText(item));
const trackMatchesAny = (row: RegistryRowDto, selected: string[]) => !selected.length || selected.includes(trackFilterValue(row)) || selected.includes(`name:${trackIdentity(row.track)}`);
const exactHoursValue = (value: number | string | null | undefined) => optionText(value);
const deliveryModeValue = (value: string) => normalizeDeliveryMode(value);
const registryFilterDefinitions = (rows: RegistryRowDto[], trackOptions: Array<{ value: string; label: string }>): Array<MultiSelectFilterDefinition<RegistryFilterKey>> => {
  const deliveryModes = DELIVERY_MODE_OPTIONS.filter(option => rows.some(row => normalizeDeliveryMode(row.deliveryMode) === option.value)).map(option => ({ value: option.value, label: deliveryModeLabel(option.value) }));
  return [
    { key: "programScope", label: "Program Scope", allLabel: "All Program Scopes", options: optionList(rows.map(row => row.programScope)) },
    { key: "studentUniversity", label: "Student University", allLabel: "All Student Universities", options: optionList(rows.map(row => row.university)) },
    { key: "college", label: "College", allLabel: "All Colleges", options: optionList(rows.map(row => row.college)) },
    { key: "track", label: "Track", allLabel: "All Tracks", options: trackOptions },
    { key: "exactHours", label: "Exact Hours", allLabel: "All Exact Hours", options: optionList(rows.map(row => row.exactHours), value => `${value}H`) },
    { key: "paymentStatus", label: "Payment Status", allLabel: "All Payment Statuses", options: optionList(rows.map(row => row.paymentStatus)) },
    { key: "deliveryMode", label: "Delivery Mode", allLabel: "All Delivery Modes", options: deliveryModes },
    { key: "enrollmentStatus", label: "Enrollment Status", allLabel: "All Enrollment Statuses", options: optionList(rows.map(row => row.enrollmentStatus)) },
    { key: "certificateStatus", label: "Certificate Status", allLabel: "All Certificate Statuses", options: certificateStatusOptions(rows) },
    { key: "certificateDelivery", label: "Certificate Delivery", allLabel: "All Delivery Statuses", options: [{ value: "DELIVERED", label: "Delivered" }, { value: "NOT_DELIVERED", label: "Not Delivered" }] },
    { key: "trainingFormStatus", label: "Training Form", allLabel: "All Training Forms", options: [{ value: "PUBLISHED", label: "Published" }, { value: "NOT_PUBLISHED", label: "Not Published" }] },
  ];
};
const certificateStatusOptions = (rows: RegistryRowDto[]) => [
  { value: "ISSUED", label: "Issued" },
  { value: "NOT_ISSUED", label: "Not Issued" },
  ...(rows.some(row => row.certificateStatus === "REVOKED") ? [{ value: "REVOKED", label: "Revoked" }] : []),
];
const EXPORT_COLUMNS: Array<{ header: string; getValue: (row: RegistryRowDto) => string | number }> = [
  { header: "Academy Student ID", getValue: row => row.academyStudentId },
  { header: "Student Name", getValue: row => row.studentName },
  { header: "Phone", getValue: row => row.phone },
  { header: "Email", getValue: row => row.email },
  { header: "Student University", getValue: row => row.university },
  { header: "College", getValue: row => row.college },
  { header: "Department", getValue: row => row.department },
  { header: "University Student ID", getValue: row => row.studentId },
  { header: "Enrollment ID", getValue: row => row.enrollmentId },
  { header: "Registration Date", getValue: row => row.registrationDate },
  { header: "Program Scope", getValue: row => row.programScope },
  { header: "Intake", getValue: row => row.intake },
  { header: "Track", getValue: row => row.track },
  { header: "Package Label", getValue: row => row.packageLabel },
  { header: "Credit Hours", getValue: row => row.exactHours },
  { header: "Delivery Mode", getValue: row => deliveryModeLabel(row.deliveryMode) },
  { header: "Level Selection", getValue: row => levelSelectionLabel(row.levelSelection ?? "") },
  { header: "Group Name", getValue: row => row.groupName },
  { header: "Enrollment Status", getValue: row => row.enrollmentStatus },
  { header: "Payment Status", getValue: row => row.paymentStatus },
  { header: "Certificate Status", getValue: row => row.certificateStatusLabel },
  { header: "Certificate Delivery", getValue: row => row.certificateDeliveryStatusLabel },
  { header: "Training Form", getValue: row => row.trainingFormStatusLabel },
];

export function StudentsPage() {
  const { user } = useAuth(); const { showToast } = useToast(); const [rows, setRows] = useState<RegistryRowDto[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [search, setSearch] = useState(""); const [filters, setFilters] = useState<RegistryFilters>(emptyRegistryFilters); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(20); const [exportingAcademic, setExportingAcademic] = useState(false);
  const loadRows = () => { setLoading(true); setError(""); apiFetch<{ rows: RegistryRowDto[] }>("/api/students").then(data => setRows(data.rows)).catch(reason => setError(reason instanceof Error ? reason.message : "Unable to load registry data")).finally(() => setLoading(false)); };
  useEffect(() => { let active = true; apiFetch<{ rows: RegistryRowDto[] }>("/api/students").then(data => { if (active) setRows(data.rows); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load registry data"); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const trackOptions = useMemo(() => trackFilterOptions(rows), [rows]);
  const filterDefinitions = useMemo(() => registryFilterDefinitions(rows, trackOptions), [rows, trackOptions]);
  const rowMatchesSearchAndBaseFilters = useCallback((row: RegistryRowDto) => {
    const needle = filterText(search); const matchesSearch = !needle || [row.studentName, row.academyStudentId, row.phone, row.studentId, row.enrollmentId].some(value => filterText(value).includes(needle));
    return matchesSearch && filterMatchesAny(row.programScope, filters.programScope) && filterMatchesAny(row.university, filters.studentUniversity) && filterMatchesAny(row.college, filters.college) && trackMatchesAny(row, filters.track) && filterMatchesAny(exactHoursValue(row.exactHours), filters.exactHours) && filterMatchesAny(row.paymentStatus, filters.paymentStatus) && (!filters.deliveryMode.length || filters.deliveryMode.includes(deliveryModeValue(row.deliveryMode))) && filterMatchesAny(row.enrollmentStatus, filters.enrollmentStatus);
  }, [filters, search]);
  const filtered = useMemo(() => rows.filter(row => {
    return rowMatchesSearchAndBaseFilters(row) && filterMatchesAny(row.certificateStatus, filters.certificateStatus) && filterMatchesAny(row.certificateDeliveryStatus, filters.certificateDelivery) && filterMatchesAny(row.trainingFormStatus, filters.trainingFormStatus);
  }), [rows, filters, rowMatchesSearchAndBaseFilters]);
  const certificateSummaryRows = useMemo(() => rows.filter(rowMatchesSearchAndBaseFilters), [rows, rowMatchesSearchAndBaseFilters]);
  const certificateSummary = useMemo(() => ({
    total: certificateSummaryRows.length,
    issued: certificateSummaryRows.filter(row => row.certificateStatus === "ISSUED").length,
    delivered: certificateSummaryRows.filter(row => row.certificateStatus === "ISSUED" && row.certificateDeliveryStatus === "DELIVERED").length,
    remaining: certificateSummaryRows.filter(row => row.certificateDeliveryStatus !== "DELIVERED").length,
  }), [certificateSummaryRows]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize)); const safePage = Math.min(page, totalPages); const startIndex = (safePage - 1) * pageSize; const pageRows = filtered.slice(startIndex, startIndex + pageSize); const showingStart = filtered.length ? startIndex + 1 : 0; const showingEnd = Math.min(startIndex + pageSize, filtered.length);
  const globalStudents = new Set(rows.map(row => row.academyStudentId)).size; const filteredStudents = new Set(filtered.map(row => row.academyStudentId)).size; const activeFilterCount = Object.values(filters).reduce((count, values) => count + values.length, 0); const hasActiveFilters = activeFilterCount > 0 || Boolean(search.trim());
  const setFilter = (key: RegistryFilterKey, value: string[]) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };
  const clearFilters = () => { setSearch(""); setFilters(emptyRegistryFilters); setPage(1); };
  const exportFilename = (extension: "csv" | "xlsx") => {
    const date = new Date().toISOString().slice(0, 10);
    const university = filters.studentUniversity[0] ? `${safeFilenamePart(filters.studentUniversity[0])}_` : "";
    return `students_export_${university}${date}.${extension}`;
  };
  const exportFilteredRows = (format: "csv" | "xlsx") => {
    if (!filtered.length) return showToast("No filtered records available to export.");
    const exportRows = buildExportRows(filtered);
    downloadBlob(format === "csv" ? csvBlob(exportRows) : createXlsxBlob(exportRows), exportFilename(format));
    showToast(`Exported ${filtered.length} filtered records.`);
  };
  const exportGradesAttendance = async () => {
    if (!filtered.length) return showToast("No students match the current filters.");
    setExportingAcademic(true);
    try {
      const response = await fetch("/api/students/grades-attendance-export", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentIds: filtered.map(row => row.enrollmentId) }),
      });
      if (response.status === 401) {
        window.location.replace("/login?reason=session-expired");
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(safeDisplayText(data.error || "Unable to export grades and attendance right now."));
      }
      const blob = await response.blob();
      downloadBlob(blob, downloadFilenameFromResponse(response) || `TechTrek_Grades_Attendance_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast(`Exported grades and attendance for ${filtered.length} filtered records.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to export grades and attendance right now.");
    } finally {
      setExportingAcademic(false);
    }
  };
  const columns: Column<RegistryRowDto>[] = [
    { key: "academy", header: "Academy Student ID", cell: row => <Link className="mono font-semibold text-red-700 hover:underline" href={`/students/${encodeURIComponent(row.academyStudentId)}`}>{row.academyStudentId}</Link> },
    { key: "name", header: "Student Name", cell: row => <strong>{row.studentName}</strong> }, { key: "phone", header: "Phone", cell: row => row.phone }, { key: "studentUniversity", header: "Student University", cell: row => row.university }, { key: "college", header: "College", cell: row => row.college },
    { key: "enrollment", header: "Enrollment ID", cell: row => <span className="mono font-semibold">{row.enrollmentId}</span> }, { key: "intake", header: "Intake", cell: row => row.intake }, { key: "track", header: "Track", cell: row => row.track }, { key: "package", header: "Package / Hours", cell: row => <span className="whitespace-nowrap">{packageHoursLabel(row.packageLabel, row.exactHours)}</span> }, { key: "deliveryMode", header: "Delivery Mode", cell: row => <StatusBadge>{deliveryModeLabel(row.deliveryMode)}</StatusBadge> },
    { key: "payment", header: "Payment Status", cell: row => <StatusBadge>{row.paymentStatus}</StatusBadge> }, { key: "status", header: "Enrollment Status", cell: row => <StatusBadge>{row.enrollmentStatus}</StatusBadge> },
    { key: "certificate", header: "Certificate", cell: row => <div className="flex min-w-32 flex-col items-start gap-1"><StatusBadge tone={certificateStatusTone(row.certificateStatus)}>{row.certificateStatusLabel}</StatusBadge><StatusBadge tone={row.certificateDeliveryStatus === "DELIVERED" ? "success" : "warning"}>{row.certificateDeliveryStatusLabel}</StatusBadge></div> },
    { key: "trainingForm", header: "Training Form", cell: row => <StatusBadge tone={row.trainingFormStatus === "PUBLISHED" ? "success" : "neutral"}>{row.trainingFormStatusLabel}</StatusBadge> },
    { key: "actions", header: "Actions", cell: row => <div className="flex min-w-48 flex-col items-start gap-1 text-xs font-semibold"><Link className="text-red-700 hover:underline" href={`/students/${encodeURIComponent(row.academyStudentId)}`}>View Profile</Link><Link className="text-slate-700 hover:text-red-700 hover:underline" href={`/students/${encodeURIComponent(row.academyStudentId)}?enrollment=${encodeURIComponent(row.enrollmentId)}`}>View Enrollment Details</Link>{user?.role !== "SALES" && <Link className="text-slate-700 hover:text-red-700 hover:underline" href={`/collections?studentId=${encodeURIComponent(row.academyStudentId)}&enrollmentId=${encodeURIComponent(row.enrollmentId)}`}>Record Payment</Link>}<Link className="text-slate-700 hover:text-red-700 hover:underline" href={`/students/${encodeURIComponent(row.academyStudentId)}?enrollment=${encodeURIComponent(row.enrollmentId)}&tab=payments`}>View Receipt History</Link></div> },
  ];
  return <><PageHeader eyebrow="Google Sheets | Live Data" title="Students & Enrollments Registry" description="Enrollment-based records joined from Students, Enrollments, and Payments_Receipts. Financial data is refreshed from Google Sheets." actions={<><LinkButton href="/students/new"><UserPlus size={15}/>Register Student / Enrollment</LinkButton>{user?.role !== "SALES" && <LinkButton href="/collections" variant="secondary"><ReceiptText size={15}/>Quick Collection</LinkButton>}<Button variant="secondary" onClick={() => exportFilteredRows("csv")}><Download size={14}/>Export CSV</Button><Button variant="secondary" onClick={() => exportFilteredRows("xlsx")}><FileSpreadsheet size={14}/>Export Excel</Button><Button variant="secondary" disabled={exportingAcademic || !filtered.length} onClick={exportGradesAttendance}><FileSpreadsheet size={14}/>{exportingAcademic ? "Preparing Export..." : `Export Grades & Attendance${filtered.length ? ` (${filtered.length})` : ""}`}</Button></>}/>
  <section aria-labelledby="global-overview"><div className="mb-3"><h2 id="global-overview" className="heading text-lg font-bold">Global Overview</h2><p className="text-xs text-slate-500">All current student and enrollment records</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Total Students" value={String(globalStudents)}/><KpiCard label="Total Enrollments" value={String(rows.length)}/><KpiCard label="Fully Paid" value={String(rows.filter(row => row.paymentStatus === "Fully Paid").length)}/><KpiCard label="Partially Paid" value={String(rows.filter(row => row.paymentStatus === "Partially Paid").length)}/></div></section>
  <section aria-labelledby="certificate-overview" className="mt-5"><div className="mb-3"><h2 id="certificate-overview" className="heading text-lg font-bold">Certificate Operations Summary</h2><p className="text-xs text-slate-500">Based on the current registry search and non-certificate filters</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><CertificateKpiCard label="Total Students" value={certificateSummary.total} detail="Matching enrollment records" tone="neutral" icon={<Award size={18}/>}/><CertificateKpiCard label="Certificates Issued" value={certificateSummary.issued} detail="Certificate_Status = Issued" tone="info" icon={<Award size={18}/>}/><CertificateKpiCard label="Certificates Delivered" value={certificateSummary.delivered} detail="Published to Student Portal" tone="success" icon={<CheckCircle2 size={18}/>}/><CertificateKpiCard label="Remaining" value={certificateSummary.remaining} detail="Certificates still pending delivery" tone="warning" icon={<Clock size={18}/>}/></div></section>
  <Card className="mt-5 overflow-visible"><div className="border-b bg-slate-50/70 p-4"><FilterPanelHeader title="Search & Filters" detail={<><strong className="text-slate-800">{filtered.length}</strong> matching records</>} activeCount={activeFilterCount} clearDisabled={!hasActiveFilters} onClear={clearFilters}/><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><SearchInput className="md:col-span-2" value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder="Student Name, Academy ID, Phone, Student ID, or Enrollment ID"/>{filterDefinitions.map(definition => <MultiSelectFilter key={definition.key} definition={definition} values={filters[definition.key]} onChange={values => setFilter(definition.key, values)}/>)}</div><SelectedFilterChips definitions={filterDefinitions} filters={filters} onChange={setFilter}/></div>
  <section aria-labelledby="filtered-results" className="border-b p-4"><div className="mb-3"><h2 id="filtered-results" className="heading text-base font-bold">Filtered Results</h2><p className="text-xs text-slate-500">Live summary based on your current search and filters</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Matching Enrollments" value={String(filtered.length)}/><KpiCard label="Unique Students in Results" value={String(filteredStudents)}/><KpiCard label="Fully Paid in Results" value={String(filtered.filter(row => row.paymentStatus === "Fully Paid").length)}/><KpiCard label="Partially Paid in Results" value={String(filtered.filter(row => row.paymentStatus === "Partially Paid").length)}/></div></section>
  {loading ? <LoadingState/> : error ? <div className="pb-5"><ErrorState/><div className="px-5"><p className="mb-3 text-xs text-red-700">{safeDisplayText(error)}</p><Button type="button" variant="secondary" onClick={loadRows}>Retry</Button></div></div> : filtered.length === 0 ? <EmptyState title="No matching enrollments" detail="Clear or adjust the current search and filters."/> : <><DataTable rows={pageRows} columns={columns} getKey={row => row.enrollmentId}/><div className="flex flex-col gap-3 border-t bg-white px-4 py-3 text-xs text-slate-600 lg:flex-row lg:items-center"><div className="flex items-center gap-2"><label htmlFor="registry-page-size" className="font-semibold">Rows per page</label><select id="registry-page-size" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-8 rounded border border-slate-300 bg-white px-2">{[20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></div><p className="lg:ms-auto">Showing {showingStart}-{showingEnd} of {filtered.length} records</p><p className="font-semibold">Page {safePage} of {totalPages}</p><div className="flex gap-1"><Button type="button" variant="secondary" disabled={safePage === 1} onClick={() => setPage(1)}>First</Button><Button type="button" variant="secondary" disabled={safePage === 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Previous</Button><Button type="button" variant="secondary" disabled={safePage === totalPages} onClick={() => setPage(current => Math.min(totalPages, current + 1))}>Next</Button><Button type="button" variant="secondary" disabled={safePage === totalPages} onClick={() => setPage(totalPages)}>Last</Button></div></div></>}</Card></>;
}

function buildExportRows(rows: RegistryRowDto[]) {
  return [EXPORT_COLUMNS.map(column => column.header), ...rows.map(row => EXPORT_COLUMNS.map(column => exportDisplayValue(column.getValue(row))))];
}

function exportDisplayValue(value: string | number) { return safeDisplayText(value); }

function CertificateKpiCard({ label, value, detail, tone, icon }: { label: string; value: number; detail: string; tone: "neutral" | "info" | "success" | "warning"; icon: React.ReactNode }) {
  const styles = {
    neutral: "border-slate-200 bg-white text-slate-700",
    info: "border-blue-200 bg-blue-50/60 text-blue-800",
    success: "border-emerald-200 bg-emerald-50/70 text-emerald-800",
    warning: "border-amber-200 bg-amber-50/70 text-amber-900",
  };
  const iconStyles = {
    neutral: "text-red-700",
    info: "text-blue-700",
    success: "text-emerald-700",
    warning: "text-amber-700",
  };
  return <Card className={`min-w-0 p-4 shadow-sm ${styles[tone]}`}><div className="mb-3 flex items-center justify-between gap-3"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span><span className={iconStyles[tone]}>{icon}</span></div><div className="heading text-3xl font-bold tracking-tight text-slate-950" data-ltr>{value}</div><p className="mt-1 text-xs text-slate-500">{detail}</p></Card>;
}

function certificateStatusTone(status: RegistryRowDto["certificateStatus"]) {
  if (status === "ISSUED") return "success";
  if (status === "REVOKED") return "danger";
  return "neutral";
}

function csvBlob(rows: string[][]) {
  const csv = rows.map(row => row.map((cell, index) => csvCell(cell, index)).join(",")).join("\r\n");
  return new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
}

function csvCell(value: string, index: number) {
  const preserveAsText = index === 2 || index === 7;
  const escaped = `${preserveAsText && value !== "-" ? "\t" : ""}${value}`.replaceAll("\"", "\"\"");
  return `"${escaped}"`;
}

function createXlsxBlob(rows: string[][]) {
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${EXPORT_COLUMNS.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.min(Math.max(column.header.length + 4, 14), 34)}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${cellRef(rowIndex + 1, columnIndex + 1)}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const files = [
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Students Export" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/worksheets/sheet1.xml", content: worksheet },
  ];
  return new Blob([zipStore(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadFilenameFromResponse(response: Response) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1]);
  const quoted = disposition.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const plain = disposition.match(/filename=([^;]+)/i);
  return plain?.[1]?.trim();
}

function safeFilenamePart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "filtered";
}

function cellRef(row: number, column: number) {
  let value = column; let name = "";
  while (value > 0) { value--; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26); }
  return `${name}${row}`;
}

function xmlEscape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
}

function zipStore(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(6, 0, true); localView.setUint16(8, 0, true); localView.setUint16(10, 0, true); localView.setUint16(12, 0, true); localView.setUint32(14, crc, true); localView.setUint32(18, data.length, true); localView.setUint32(22, data.length, true); localView.setUint16(26, name.length, true); local.set(name, 30);
    chunks.push(local, data);
    const directory = new Uint8Array(46 + name.length);
    const directoryView = new DataView(directory.buffer);
    directoryView.setUint32(0, 0x02014b50, true); directoryView.setUint16(4, 20, true); directoryView.setUint16(6, 20, true); directoryView.setUint16(8, 0, true); directoryView.setUint16(10, 0, true); directoryView.setUint16(12, 0, true); directoryView.setUint16(14, 0, true); directoryView.setUint32(16, crc, true); directoryView.setUint32(20, data.length, true); directoryView.setUint32(24, data.length, true); directoryView.setUint16(28, name.length, true); directoryView.setUint32(42, offset, true); directory.set(name, 46);
    central.push(directory);
    offset += local.length + data.length;
  }
  const centralOffset = offset;
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, files.length, true); endView.setUint16(10, files.length, true); endView.setUint32(12, centralSize, true); endView.setUint32(16, centralOffset, true);
  return concatUint8([...chunks, ...central, end]);
}

function concatUint8(chunks: Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(data: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of data) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

type OfferingsResponse = { offerings: OfferingDto[]; currentIntake: string; receiptNumberPreview: string };
const emptyStudent: Omit<StudentDto, "academyStudentId"> = { studentName: "", phone: "", email: "", university: "", college: "", department: "", studentId: "", studentStatus: "Active" };

export function NewStudentPage() {
  const router = useRouter(); const { showToast } = useToast(); const [meta, setMeta] = useState<OfferingsResponse>(); const [loadError, setLoadError] = useState(""); const [mode, setMode] = useState<"new" | "existing">("new"); const [student, setStudent] = useState(emptyStudent); const [selectedAcademyId, setSelectedAcademyId] = useState(""); const [search, setSearch] = useState(""); const [matches, setMatches] = useState<StudentDto[]>([]); const [scope, setScope] = useState<"UNIVERSITY_PROGRAM" | "INTENSIVE_DIPLOMA">("UNIVERSITY_PROGRAM"); const [offeringId, setOfferingId] = useState(""); const [discount, setDiscount] = useState(0); const [discountReason, setDiscountReason] = useState(""); const [paymentAmount, setPaymentAmount] = useState(0); const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10)); const [paymentMethod, setPaymentMethod] = useState("Cash"); const [receiverName, setReceiverName] = useState("Nadia Fawzy"); const [notes, setNotes] = useState(""); const [saving, setSaving] = useState(false); const [progress, setProgress] = useState(""); const [formError, setFormError] = useState("");
  useEffect(() => { apiFetch<OfferingsResponse>("/api/offerings").then(setMeta).catch(error => setLoadError(error.message)); }, []);
  const offerings = useMemo(() => (meta?.offerings ?? []).filter(item => item.offeringType === scope && (scope === "INTENSIVE_DIPLOMA" || item.university === student.university)), [meta, scope, student.university]);
  const offering = offerings.find(item => item.offeringId === offeringId); const finalPrice = Math.max(0, (offering?.price ?? 0) - discount); const remaining = Math.max(0, finalPrice - paymentAmount); const paymentType = paymentAmount > 0 ? paymentAmount === finalPrice ? "Full Payment" : "Deposit" : "ÃƒÆ’Ã‚¢Ãƒ¢Ã¢â‚¬Å¡Ã‚¬Ãƒ¢Ã¢â€š¬Ã‚"; const paymentStatus = paymentAmount > 0 ? remaining === 0 ? "Fully Paid" : "Partially Paid" : "ÃƒÆ’Ã‚¢Ãƒ¢Ã¢â‚¬Å¡Ã‚¬Ãƒ¢Ã¢â€š¬Ã‚";
  const updateStudentField = (key: keyof typeof student, value: string) => { if (mode === "existing" && ["studentName", "university", "studentId"].includes(key)) return; setStudent(current => ({ ...current, [key]: value })); };
  const searchExisting = async () => { setFormError(""); try { const data = await apiFetch<{ students: StudentDto[] }>(`/api/students/search?q=${encodeURIComponent(search)}`); setMatches(data.students); } catch (error) { setFormError(error instanceof Error ? error.message : "Search failed"); } };
  const chooseStudent = (value: StudentDto) => { setSelectedAcademyId(value.academyStudentId); setStudent({ studentName: value.studentName, phone: value.phone, email: value.email, university: value.university, college: value.college, department: value.department, studentId: value.studentId, studentStatus: value.studentStatus }); setMatches([]); };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!offering) return setFormError("Select an available program offering"); if (paymentAmount <= 0 || paymentAmount > finalPrice) return setFormError("Payment must be greater than zero and cannot exceed the final contract price"); setSaving(true); setFormError(""); setProgress("Validating student and offeringÃƒÆ’Ã‚¢Ãƒ¢Ã¢â‚¬Å¡Ã‚¬Ãƒâ€šÃ‚¦"); try { window.setTimeout(() => setProgress("Generating Google Docs receipt and PDFÃƒÆ’Ã‚¢Ãƒ¢Ã¢â‚¬Å¡Ã‚¬Ãƒâ€šÃ‚¦"), 400); const data = await apiFetch<{ result: { student: StudentDto; enrollment: EnrollmentDto; payment: { receiptNumber: string } } }>("/api/registrations", { method: "POST", body: JSON.stringify({ mode, academyStudentId: selectedAcademyId || undefined, student, offeringId: offering.offeringId, discount, discountReason, openingPaymentAmount: paymentAmount, paymentDate, paymentMethod, receiverName, notes }) }); showToast(`Registration completed. Receipt ${data.result.payment.receiptNumber} generated.`); router.push(`/students/${encodeURIComponent(data.result.student.academyStudentId)}`); } catch (error) { setFormError(formatClientApiError(error)); setProgress(""); } finally { setSaving(false); } };
  if (loadError) return <><PageHeader title="Register Student / Add Enrollment"/><Card><ErrorState/><p className="px-5 pb-5 text-xs text-red-700">{loadError}</p></Card></>;
  return <form onSubmit={submit}><Breadcrumbs items={[{ label: "Students & Enrollments", href: "/students" }, { label: "Register Student" }]}/><PageHeader eyebrow="Google Sheets ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ -  Live Registration" title="Register Student / Add Enrollment" description="Creates a real student when needed, enrollment, opening payment, and Google Docs receipt. Group and delivery mode remain unassigned."/><Card className="mb-5 p-5"><div className="mb-4 flex gap-2"><Button type="button" variant={mode === "new" ? "primary" : "secondary"} onClick={() => { setMode("new"); setSelectedAcademyId(""); setStudent(emptyStudent); }}>New Student + Enrollment</Button><Button type="button" variant={mode === "existing" ? "primary" : "secondary"} onClick={() => setMode("existing")}>Existing Student + Enrollment</Button></div><h2 className="heading text-lg font-bold">1. Find or Create Student</h2>{mode === "existing" && <div className="mt-4"><div className="flex gap-2"><SearchInput className="flex-1" value={search} onChange={setSearch} placeholder="Academy ID, Student ID, phone, or student name"/><Button type="button" variant="secondary" onClick={searchExisting}><Search size={15}/>Search</Button></div>{matches.length > 0 && <div className="mt-2 divide-y rounded border">{matches.map(match => <button type="button" className="flex w-full justify-between p-3 text-start hover:bg-red-50" key={match.academyStudentId} onClick={() => chooseStudent(match)}><span><strong>{match.studentName}</strong><small className="block text-slate-500">{match.phone} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ -  {match.studentId}</small></span><span className="mono text-red-700">{match.academyStudentId}</span></button>)}</div>}{selectedAcademyId && <p className="mt-2 text-xs font-semibold text-emerald-700">Selected: {selectedAcademyId}. This student row will be reused.</p>}</div>}<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Student Name" value={student.studentName} onChange={event => updateStudentField("studentName", event.target.value)} required/><Field label="Phone" value={student.phone} onChange={event => updateStudentField("phone", event.target.value)} required/><Field label="Email" type="email" value={student.email} onChange={event => updateStudentField("email", event.target.value)}/><Field label="Student University" value={student.university} onChange={event => updateStudentField("university", event.target.value)} required/><Field label="College" value={student.college} onChange={event => updateStudentField("college", event.target.value)} required/><Field label="Department" value={student.department} onChange={event => updateStudentField("department", event.target.value)}/><Field label="Student ID" value={student.studentId} onChange={event => updateStudentField("studentId", event.target.value)} required/><Select label="Student Status" value={student.studentStatus} onChange={value => updateStudentField("studentStatus", value)} options={["Active", "Inactive", "Suspended", "Completed", "Withdrawn"]}/></div></Card><Card className="mb-5 p-5"><h2 className="heading text-lg font-bold">2. Select Program Offering</h2><div className="mt-4 grid gap-3 md:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-semibold">Program Scope</span><select className="h-10 w-full rounded border px-3 text-sm" value={scope} onChange={event => setScope(event.target.value as typeof scope)}><option value="UNIVERSITY_PROGRAM">University Program</option><option value="INTENSIVE_DIPLOMA">Intensive Diploma</option></select></label><label className="block"><span className="mb-1.5 flex items-center gap-2 text-xs font-semibold">Offering {scope === "INTENSIVE_DIPLOMA" && <StatusBadge tone="warning">Intensive Diploma</StatusBadge>}</span><select required className="h-10 w-full rounded border px-3 text-sm" value={offeringId} onChange={event => setOfferingId(event.target.value)}><option value="">Select active Offering ID</option>{offerings.map(item => <option key={item.offeringId} value={item.offeringId}>{item.offeringId} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ -  {item.track} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ -  {item.packageLabel} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ -  {item.exactHours}H</option>)}</select></label></div>{offering ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Summary label="Program Scope" value={scope === "INTENSIVE_DIPLOMA" ? "Intensive Diploma" : offering.university}/><Summary label="Track" value={offering.track}/><Summary label="Package Label" value={offering.packageLabel}/><Summary label="Credit Hours" value={`${offering.exactHours}H`}/><Summary label="Duration Days" value={String(offering.durationDays)}/><Summary label="Catalogue Price" value={money(offering.price)}/></div> : <p className="mt-4 rounded border bg-slate-50 p-3 text-xs text-slate-500">Choose the studentÃƒÆ’Ã‚¢Ãƒ¢Ã¢â‚¬Å¡Ã‚¬Ãƒ¢Ã¢â‚¬Å¾Ã‚¢s real university first for a University Program. Intensive Diploma offerings are not filtered by student university.</p>}</Card><Card className="mb-5 p-5"><h2 className="heading text-lg font-bold">3. Contract, Payment & Receipt</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Discount" type="number" min="0" max={offering?.price ?? 0} value={discount} onChange={event => setDiscount(Number(event.target.value))}/><Field label="Discount Reason" value={discountReason} onChange={event => setDiscountReason(event.target.value)} required={discount > 0}/><Field label="Opening Payment Amount" type="number" min="0.01" max={finalPrice} step="0.01" value={paymentAmount || ""} onChange={event => setPaymentAmount(Number(event.target.value))} required/><Field label="Payment Date" type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)} required/><Select label="Payment Method" value={paymentMethod} onChange={setPaymentMethod} options={["Cash", "InstaPay", "Bank Transfer", "Card", "Wallet"]}/><Field label="Receiver Name" value={receiverName} onChange={event => setReceiverName(event.target.value)} required/><Field className="md:col-span-2" label="Notes" value={notes} onChange={event => setNotes(event.target.value)}/></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Summary label="Catalogue Price" value={money(offering?.price ?? 0)}/><Summary label="Discount" value={money(discount)}/><Summary label="Final Contract Price" value={money(finalPrice)}/><Summary label="This Payment Amount" value={money(paymentAmount)}/><Summary label="Total Paid After Payment" value={money(paymentAmount)}/><Summary label="Remaining After Payment" value={money(remaining)}/><Summary label="Payment Type / Status" value={`${paymentType} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ -  ${paymentStatus}`}/><Summary label="Receipt Number Preview" value={meta?.receiptNumberPreview ?? "LoadingÃƒÆ’Ã‚¢Ãƒ¢Ã¢â‚¬Å¡Ã‚¬Ãƒâ€šÃ‚¦"}/></div>{formError && <p role="alert" className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</p>}{progress && <p className="mt-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{progress}</p>}<div className="mt-5 flex justify-end gap-2"><LinkButton href="/students" variant="secondary">Cancel</LinkButton><Button type="submit" disabled={saving || !offering || (mode === "existing" && !selectedAcademyId)}><ReceiptText size={16}/>{saving ? "Saving & Generating ReceiptÃƒÆ’Ã‚¢Ãƒ¢Ã¢â‚¬Å¡Ã‚¬Ãƒâ€šÃ‚¦" : "Register & Generate Receipt"}</Button></div></Card></form>;
}

export function StudentProfilePage({ id }: { id: string }) {
  const { user } = useAuth(); const { showToast } = useToast(); const [data, setData] = useState<StudentProfileResponse>(); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [selectedId, setSelectedId] = useState(""); const [tab, setTab] = useState("Overview"); const [editOpen, setEditOpen] = useState(false); const [changeTrackOpen, setChangeTrackOpen] = useState(false); const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => { let active = true; apiFetch<StudentProfileResponse>(`/api/students/${encodeURIComponent(id)}`).then(result => { if (!active) return; setData(result); setSelectedId(result.enrollments[0]?.enrollmentId || ""); }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [id]);
  const selected = data?.enrollments.find(item => item.enrollmentId === selectedId) ?? data?.enrollments[0]; const payments = data?.payments.filter(item => item.enrollmentId === selected?.enrollmentId) ?? []; const operational = data?.operationalDetails.find(item => item.enrollmentId === selected?.enrollmentId); const attendanceHistory = data?.attendanceHistory.find(item => item.enrollmentId === selected?.enrollmentId);
  const refreshProfile = async () => { const result = await apiFetch<StudentProfileResponse>(`/api/students/${encodeURIComponent(id)}`); setData(result); setSelectedId(current => result.enrollments.some(item => item.enrollmentId === current) ? current : result.enrollments[0]?.enrollmentId ?? ""); };
  const updateEnrollmentStatus = async (status: string) => { const focusedId = document.activeElement?.getAttribute("aria-label")?.replace("Status for ", ""); const enrollmentId = focusedId || selected?.enrollmentId; if (!enrollmentId) return; try { await apiFetch(`/api/enrollments/${encodeURIComponent(enrollmentId)}`, { method: "PATCH", body: JSON.stringify({ enrollmentStatus: status }) }); setData(current => current ? { ...current, enrollments: current.enrollments.map(item => item.enrollmentId === enrollmentId ? { ...item, enrollmentStatus: status } : item) } : current); showToast("Enrollment status updated in Google Sheets."); } catch (error) { showToast(error instanceof Error ? error.message : "Update failed"); } };
  if (loading) return <Card><LoadingState/></Card>; if (error || !data) return <Card><ErrorState/><p className="px-5 pb-5 text-xs text-red-700">{error}</p></Card>;
  const tabs = ["Overview", "Enrollments", "Attendance", "Tasks & Projects", "Payments & Receipts", "Certificates", "Activity Timeline"];
  return <><Breadcrumbs items={[{ label: "Students & Enrollments", href: "/students" }, { label: data.student.studentName }]}/><Card className="mb-5 overflow-hidden"><div className="h-2 bg-red-700"/><StudentProfileHeader student={data.student} enrollments={data.enrollments} selected={selected} role={user?.role} onSelectEnrollment={setSelectedId} onEdit={() => setEditOpen(true)} onChangeTrack={() => setChangeTrackOpen(true)} onDelete={() => setDeleteOpen(true)}/><Tabs tabs={tabs} active={tab} onChange={setTab}/></Card>{!selected ? <Card><EmptyState title="No enrollments found" detail="Create an enrollment from the registration page."/></Card> : <>{tab === "Overview" && <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><Card className="p-4"><h2 className="heading text-base font-bold">Stable Personal Data</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2"><Info label="Phone" value={data.student.phone}/><Info label="Email" value={data.student.email}/><Info label="Student University" value={data.student.university}/><Info label="College" value={data.student.college}/><Info label="Department" value={data.student.department}/><Info label="Student Status" value={data.student.studentStatus}/></dl></Card><Card className="p-4"><h2 className="heading text-base font-bold">Selected Enrollment</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2"><Info label="Program Scope" value={selected.programScope}/><Info label="Intake" value={selected.intake}/><Info label="Track" value={selected.track}/><Info label="Package / Hours" value={formatPackageHours(selected.packageLabel, selected.exactHours)}/><Info label="Delivery Mode" value={deliveryModeLabel(selected.deliveryMode)}/><Info label="Catalogue Price" value={money(selected.cataloguePrice)}/><Info label="Final Contract" value={money(selected.finalContractPrice)}/><Info label="Remaining" value={money(selected.remaining)}/><Info label="Group Assignment" value={selected.groupId || "Unassigned"}/></dl><div className="mt-4 flex flex-wrap items-center gap-2"><StatusBadge>{selected.paymentStatus}</StatusBadge>{Math.max(0, selected.totalPaid - selected.finalContractPrice) > 0 && <span className="rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">Credit Due: {money(Math.max(0, selected.totalPaid - selected.finalContractPrice))}</span>}</div></Card>{operational && <div className="xl:col-span-2"><OperationalTrainingDetailsCard details={operational}/></div>}</div>}{tab === "Enrollments" && <Card><DataTable rows={data.enrollments} getKey={row => row.enrollmentId} columns={[{ key: "id", header: "Enrollment ID", cell: row => <span className="mono">{row.enrollmentId}</span> }, { key: "intake", header: "Intake", cell: row => row.intake }, { key: "scope", header: "Program Scope", cell: row => row.programScope }, { key: "track", header: "Track", cell: row => row.track }, { key: "package", header: "Package Label", cell: row => `${packageHoursLabel(row.packageLabel, row.exactHours)}` }, { key: "deliveryMode", header: "Delivery Mode", cell: row => <StatusBadge>{deliveryModeLabel(row.deliveryMode)}</StatusBadge> }, { key: "contract", header: "Final Contract Price", cell: row => money(row.finalContractPrice) }, { key: "paid", header: "Total Paid", cell: row => money(row.totalPaid) }, { key: "remaining", header: "Remaining", cell: row => money(row.remaining) }, { key: "payment", header: "Payment Status", cell: row => <StatusBadge>{row.paymentStatus}</StatusBadge> }, { key: "status", header: "Enrollment Status", cell: row => <select aria-label={`Status for ${row.enrollmentId}`} value={row.enrollmentStatus} onChange={event => { setSelectedId(row.enrollmentId); updateEnrollmentStatus(event.target.value); }} className="h-8 rounded border px-2"><option>Registered</option><option>Active</option><option>Completed</option><option>Withdrawn</option><option>Suspended</option><option>Cancelled</option></select> }]}/></Card>}{tab === "Attendance" && <StudentAttendanceCard history={attendanceHistory}/>} {tab === "Tasks & Projects" && <StudentAcademicWorkCard profile={data.academicProfile} enrollmentId={selected.enrollmentId}/>} {tab === "Payments & Receipts" && <ReceiptHistory payments={payments}/>} {tab === "Certificates" && <StudentCertificatesCard profile={data.academicProfile} enrollment={selected}/>} {tab === "Activity Timeline" && <Card><EmptyState title="Activity Timeline is not connected in this phase" detail="Operational history will appear here when the timeline module is connected."/></Card>}</>}{editOpen && <StudentPersonalDataEditor student={data.student} onClose={() => setEditOpen(false)} onSaved={student => setData(current => current ? { ...current, student } : current)}/>}{changeTrackOpen && selected && user?.role !== "SALES" && <ChangeTrackEditor student={data.student} enrollment={selected} onClose={() => setChangeTrackOpen(false)} onChanged={refreshProfile}/>}{deleteOpen && user?.role === "ADMIN" && <DeleteStudentModal academyStudentId={data.student.academyStudentId} onClose={() => setDeleteOpen(false)}/>}</>;
}

function StudentAttendanceCard({ history }: { history?: StudentAttendanceHistory }) {
  const columns: Column<StudentAttendanceHistory["rows"][number]>[] = [
    { key: "date", header: "Session Date", cell: row => safeDisplayText(row.sessionDate, "-") },
    { key: "time", header: "Time", cell: row => safeDisplayText(row.time, "-") },
    { key: "code", header: "Attendance Code", cell: row => <span className="font-mono text-xs">{safeDisplayText(row.attendanceCode, "-")}</span> },
    { key: "number", header: "Session Number", cell: row => safeDisplayText(row.sessionNumber, "-") },
    { key: "title", header: "Track / Session Title", cell: row => safeDisplayText(row.trackContext, "-") },
    { key: "group", header: "Group Name", cell: row => safeDisplayText(row.groupName, "-") },
    { key: "attendance", header: "Attendance Status", cell: row => <StatusBadge>{safeDisplayText(row.attendanceStatus, "-")}</StatusBadge> },
    { key: "validation", header: "Validation Status", cell: row => <StatusBadge>{safeDisplayText(row.validationStatus, "-")}</StatusBadge> },
    { key: "notes", header: "Notes", cell: row => safeDisplayText(row.notes, "-") }
  ];
  if (!history) return <Card><EmptyState title="No attendance history for this enrollment" detail="Attendance sessions will appear here after the selected enrollment is placed in attendance-enabled groups."/></Card>;
  return <Card className="overflow-hidden"><div className="border-b bg-slate-50 p-4"><h2 className="heading text-lg font-bold">Attendance History</h2><p className="text-xs text-slate-500">New Attendance system records for the currently selected enrollment.</p></div><div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6"><KpiCard label="Total Taken Sessions" value={String(history.totalTakenSessions)}/><KpiCard label="Present" value={String(history.present)}/><KpiCard label="Absent" value={String(history.absent)}/><KpiCard label="Excused" value={String(history.excused)}/><KpiCard label="Needs Review" value={String(history.needsReview)}/><KpiCard label="Attendance %" value={`${history.attendancePercent}%`}/></div>{history.rows.length ? <DataTable rows={history.rows} columns={columns} getKey={row => `${row.enrollmentId}-${row.attendanceCode}-${row.sessionDate}-${row.sessionNumber}`}/> : <EmptyState title="No taken attendance sessions found" detail="Past attendance sessions for this enrollment will appear here once configured."/>}</Card>;
}

function StudentAcademicWorkCard({ profile, enrollmentId }: { profile: StudentAcademicProfileDto; enrollmentId: string }) {
  const summary = profile.workSummary.find(row => row.enrollmentId === enrollmentId);
  const rows = profile.academicWork.filter(row => row.enrollmentId === enrollmentId);
  const columns: Column<StudentAcademicWorkRow>[] = [
    { key: "type", header: "Type", cell: row => <StatusBadge>{row.type === "TASK" ? "Task" : "Project"}</StatusBadge> },
    { key: "assignment", header: "Assignment", cell: row => <div className="min-w-56"><div className="font-semibold text-slate-900">{safeDisplayText(row.assignmentTitle, "-")}</div><div className="mt-1 text-xs text-slate-500">{safeDisplayText(row.assignmentId, "-")}</div></div> },
    { key: "batch", header: "Batch", cell: row => safeDisplayText(row.batchName, "-") },
    { key: "group", header: "Group", cell: row => <div className="min-w-64 whitespace-normal leading-snug">{safeDisplayText(row.groupName, "-")}</div> },
    { key: "level", header: "Level", cell: row => safeDisplayText(levelSelectionLabel(row.levelCode), "-") },
    { key: "status", header: "Status", cell: row => <StatusBadge tone={row.status === "GRADED" || row.status === "SUBMITTED" ? "success" : "neutral"}>{academicStatusLabel(row.status)}</StatusBadge> },
    { key: "grade", header: "Grade", cell: row => row.grade === null ? "-" : safeDisplayText(row.grade) },
    { key: "max", header: "Max Grade", cell: row => row.maxGrade === null ? "-" : safeDisplayText(row.maxGrade) },
    { key: "percent", header: "Percentage", cell: row => row.percentage === null ? "-" : `${row.percentage}%` },
    { key: "required", header: "Required for Certificate", cell: row => <StatusBadge tone={row.requiredForCertificate ? "warning" : "neutral"}>{row.requiredForCertificate ? "Required" : "Optional"}</StatusBadge> },
    { key: "gradedAt", header: "Graded At", cell: row => safeDisplayText(row.gradedAt, "-") },
  ];
  return <Card className="overflow-hidden"><div className="border-b bg-slate-50 p-4"><h2 className="heading text-lg font-bold">Tasks & Projects</h2><p className="text-xs text-slate-500">Applicable assignments for the selected enrollment. This profile view is read-only.</p></div><div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6"><KpiCard label="Total Applicable" value={String(summary?.totalApplicable ?? 0)}/><KpiCard label="Completed" value={String(summary?.completed ?? 0)}/><KpiCard label="Not Submitted" value={String(summary?.notSubmitted ?? 0)}/><KpiCard label="Tasks" value={String(summary?.tasks ?? 0)}/><KpiCard label="Projects" value={String(summary?.projects ?? 0)}/><KpiCard label="Average Grade %" value={summary?.averageGradePercentage === null || summary?.averageGradePercentage === undefined ? "-" : `${summary.averageGradePercentage}%`}/></div>{rows.length ? <DataTable rows={rows} columns={columns} getKey={row => `${row.enrollmentId}-${row.assignmentId}`}/> : <EmptyState title="No academic assignments are available for this enrollment." detail="Applicable Tasks and Projects will appear here once assignments are mapped to the student's Group."/>}</Card>;
}

function StudentCertificatesCard({ profile, enrollment }: { profile: StudentAcademicProfileDto; enrollment: EnrollmentDto }) {
  const readiness = profile.certificateReadiness.find(row => row.enrollmentId === enrollment.enrollmentId);
  const certificates = profile.issuedCertificates.filter(row => row.enrollmentId === enrollment.enrollmentId);
  return <div className="space-y-5"><Card className="p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="heading text-lg font-bold">Certificate Profile Information</h2><p className="text-xs text-slate-500">Student self-service certificate identity fields. Internal read-only view.</p></div><StatusBadge tone={profile.certificateProfile.status === "CONFIRMED" ? "success" : "neutral"}>{profile.certificateProfile.status === "CONFIRMED" ? "Confirmed" : "Not Confirmed"}</StatusBadge></div><dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Info label="Certificate Name" value={profile.certificateProfile.certificateName || "-"}/><Info label="Certificate Email" value={profile.certificateProfile.certificateEmail || "-"}/><Info label="Profile Status" value={profile.certificateProfile.status === "CONFIRMED" ? "Confirmed" : "Not Confirmed"}/><Info label="Confirmed At" value={profile.certificateProfile.confirmedAt || "-"}/></dl></Card><Card className="p-4"><div className="mb-4"><h2 className="heading text-lg font-bold">Certificate Readiness & Decision</h2><p className="text-xs text-slate-500">Uses the same readiness and Certificate_Eligibility decision rules as the Certificates module.</p></div>{readiness ? <><dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Info label="Batch" value={readiness.batchName}/><Info label="Group" value={readiness.groupName}/><Info label="Track" value={readiness.track}/><Info label="Credit Hours" value={`${readiness.creditHours} H`}/><Info label="Delivery Mode" value={deliveryModeLabel(readiness.deliveryMode)}/><Info label="Applicable Required Assignments" value={String(readiness.applicableRequiredAssignments)}/><Info label="Completed Required Assignments" value={String(readiness.completedRequiredAssignments)}/><Info label="Missing Required Assignments" value={String(readiness.missingRequiredAssignments)}/></dl><div className="mt-4 flex flex-wrap gap-2"><StatusBadge tone={readiness.readiness === "READY" ? "success" : readiness.readiness === "NOT_READY" ? "warning" : "neutral"}>{certificateReadinessLabel(readiness.readiness)}</StatusBadge><StatusBadge tone={readiness.certificateDecision === "APPROVED" ? "success" : readiness.certificateDecision === "NOT_APPROVED" ? "danger" : "warning"}>{certificateDecisionLabel(readiness.certificateDecision)}</StatusBadge></div></> : <EmptyState title="No certificate readiness is available for this enrollment." detail="Readiness will appear after the enrollment has a Group and academic configuration."/>}</Card><StudentIssuedCertificatesCard certificates={certificates}/></div>;
}

function StudentIssuedCertificatesCard({ certificates }: { certificates: StudentIssuedCertificateDto[] }) {
  const columns: Column<StudentIssuedCertificateDto>[] = [
    { key: "id", header: "Certificate ID", cell: row => <span className="mono font-semibold text-red-700">{safeDisplayText(row.certificateId, "-")}</span> },
    { key: "name", header: "Certificate Name", cell: row => safeDisplayText(row.certificateName, "-") },
    { key: "student", header: "Student Name on Certificate", cell: row => safeDisplayText(row.studentNameOnCertificate, "-") },
    { key: "roadmap", header: "Roadmap", cell: row => <div className="min-w-56"><div className="font-semibold">{safeDisplayText(row.roadmapName, "-")}</div>{row.roadmapVersion && <div className="text-xs text-slate-500">{safeDisplayText(row.roadmapVersion)}</div>}</div> },
    { key: "issue", header: "Issue Date", cell: row => safeDisplayText(row.issueDate, "-") },
    { key: "status", header: "Status", cell: row => <StatusBadge tone={row.status === "ISSUED" ? "success" : "danger"}>{row.status === "ISSUED" ? "Issued" : "Revoked"}</StatusBadge> },
    { key: "verify", header: "Verification", cell: row => row.verificationUrl ? <Link className="font-semibold text-red-700 hover:underline" href={row.verificationUrl} target="_blank">Open Verification</Link> : <span className="text-xs text-slate-500">Unavailable</span> },
  ];
  return <Card className="overflow-hidden"><div className="border-b bg-slate-50 p-4"><h2 className="heading text-lg font-bold">Issued Certificates</h2><p className="text-xs text-slate-500">Issued and revoked certificates for the selected enrollment. Roadmap is the certificate snapshot.</p></div>{certificates.length ? <DataTable rows={certificates} columns={columns} getKey={row => row.certificateId}/> : <EmptyState title="No certificate has been issued for this enrollment." detail="Issued certificates will appear here after the existing Certificates module issues them."/>}</Card>;
}

function academicStatusLabel(value: string) {
  return value === "SUBMITTED" ? "Submitted" : value === "GRADED" ? "Graded" : "Not Submitted";
}

function certificateReadinessLabel(value: string) {
  return value === "READY" ? "Ready" : value === "NOT_READY" ? "Not Ready" : "Not Configured";
}

function certificateDecisionLabel(value: string) {
  return value === "APPROVED" ? "Approved" : value === "NOT_APPROVED" ? "Not Approved" : "Pending";
}

export function ReceiptHistory({ payments }: { payments: PaymentDto[] }) { return <Card><div className="flex justify-between border-b p-4"><div><h2 className="heading text-lg font-bold">Receipt History</h2><p className="text-xs text-slate-500">Legacy links are preserved; Google Docs receipts open the official Drive PDF.</p></div></div><DataTable rows={payments} getKey={row => row.paymentId} columns={[{ key: "receipt", header: "Receipt Number", cell: row => <span className="mono font-semibold text-red-700">{row.receiptNumber}</span> }, { key: "date", header: "Payment Date", cell: row => row.paymentDate }, { key: "type", header: "Payment Type", cell: row => row.paymentType }, { key: "amount", header: "Payment Amount", cell: row => money(row.paymentAmount) }, { key: "method", header: "Payment Method", cell: row => row.paymentMethod }, { key: "paid", header: "Total Paid After Payment", cell: row => money(row.totalPaidAfterPayment) }, { key: "remaining", header: "Remaining After Payment", cell: row => money(row.remainingAfterPayment) }, { key: "status", header: "Receipt Status", cell: row => <StatusBadge>{row.receiptStatus}</StatusBadge> }, { key: "source", header: "Receipt Source", cell: row => <StatusBadge>{row.receiptSource}</StatusBadge> }, { key: "open", header: "Open Receipt", cell: row => row.receiptLink ? <a target="_blank" rel="noreferrer" href={row.receiptLink} className="font-semibold text-red-700">{row.receiptSource === "LEGACY" ? "Open Existing Receipt" : "Open Receipt"}</a> : "ÃƒÆ’Ã‚¢Ãƒ¢Ã¢â‚¬Å¡Ã‚¬Ãƒ¢Ã¢â€š¬Ã‚" }, { key: "download", header: "Download PDF", cell: row => row.receiptPdfFileId ? <a target="_blank" rel="noreferrer" href={`https://drive.google.com/uc?export=download&id=${encodeURIComponent(row.receiptPdfFileId)}`} className="font-semibold text-red-700">Download PDF</a> : row.receiptLink ? <a target="_blank" rel="noreferrer" href={row.receiptLink} className="font-semibold text-red-700">Open File</a> : "ÃƒÆ’Ã‚¢Ãƒ¢Ã¢â‚¬Å¡Ã‚¬Ãƒ¢Ã¢â€š¬Ã‚" }]}/></Card>; }
function OperationalTrainingDetailsCard({ details }: { details: OperationalTrainingDetailsDto }) {
  const showLevel1 = details.levelSelection === "BOTH_LEVELS" || details.levelSelection === "LEVEL_1";
  const showLevel2 = details.levelSelection === "BOTH_LEVELS" || details.levelSelection === "LEVEL_2";
  const placed = details.placementStatus === "PLACED";
  return <Card className="p-5"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="heading text-lg font-bold">Operational Training Details</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">{details.message}</p></div><StatusBadge tone={details.placementStatus === "PLACED" ? "success" : details.placementStatus === "CONFIGURATION_REQUIRED" ? "warning" : "neutral"}>{readableOperational(details.placementStatus)}</StatusBadge></div><section><h3 className="heading text-sm font-bold text-slate-900">Training Placement Summary</h3><dl className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><OperationalInfo label="Sold Track" value={details.soldTrack}/><OperationalInfo label="Delivery Track" value={details.deliveryTrackName || "Not Configured"} highlight={Boolean(details.deliveryTrackName)}/><OperationalInfo label="Level Selection" value={levelSelectionLabel(details.levelSelection)}/><OperationalInfo label="Registered Delivery Mode" value={deliveryModeLabel(details.registeredDeliveryMode)}/>{placed && <><OperationalInfo label="Batch Name" value={details.batchName}/><OperationalInfo label="Batch Intake" value={details.batchIntake}/><OperationalInfo label="Batch Start Date" value={details.batchStartDate}/><OperationalInfo label="Batch End Date" value={details.batchEndDate}/></>}</dl></section>{placed && <section className="mt-5 border-t border-slate-200 pt-4"><h3 className="heading text-sm font-bold text-slate-900">Group & Attendance Arrangement</h3><div className="mt-3 rounded-2xl border border-red-100 bg-red-50/40 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-wide text-red-700">Group</div><div className="heading mt-1 text-base font-bold text-slate-950">{details.groupName || "Assigned Group"}</div></div><StatusBadge>{readableOperational(details.groupStatus)}</StatusBadge></div><dl className="mt-4 grid gap-3 sm:grid-cols-2"><OperationalInfo label="Assigned Students / Capacity" value={`${details.assignedStudentsCount} / ${details.groupCapacity || "Open"}`}/></dl><div className="mt-4 space-y-2"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Attendance Arrangement</div>{showLevel1 && <AttendanceArrangementRow levelName={details.level1Name || "Level 1"} mode={details.level1AttendanceMode}/>} {showLevel2 && <AttendanceArrangementRow levelName={details.level2Name || "Level 2"} mode={details.level2AttendanceMode}/>}</div></div></section>}</Card>;
}
function OperationalInfo({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) { return <div className={highlight ? "rounded-xl border border-red-100 bg-red-50/50 p-3" : "rounded-xl border border-slate-100 bg-white p-3"}><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{safeDisplayText(value)}</dd></div>; }
function AttendanceArrangementRow({ levelName, mode }: { levelName: string; mode: string }) { return <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white bg-white px-3 py-2 text-sm"><span className="font-semibold text-slate-800">{levelName}</span><StatusBadge>{readableOperational(mode)}</StatusBadge></div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded border bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase text-slate-400">{safeDisplayText(label)}</div><div className="mt-1 text-sm font-bold">{safeDisplayText(value)}</div></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{displayValue(value)}</dd></div>; }
function displayValue(value: unknown) { return safeDisplayText(value); }
function formatPackageHours(packageLabel: string, exactHours: string | number) { return packageHoursLabel(packageLabel, exactHours); }
function levelSelectionLabel(value: string) { return value === "BOTH_LEVELS" ? "Both Levels" : value === "LEVEL_1" ? "Level 1" : value === "LEVEL_2" ? "Level 2" : "Not Selected Yet"; }
function readableOperational(value: string) { return readableEnum(value); }

