"use client";

import { CheckCircle2, Eye, FileCheck2, FileSpreadsheet, Plus, RefreshCw, RotateCcw, Save, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { Button, Card, EmptyState, Field, LoadingState, PageHeader, SearchInput, StatusBadge, Tabs } from "@/components/ui/primitives";
import type { CertificateApprovalStatus, CertificateReadinessRow, CertificatesData } from "@/types/tasks-grades";
import { extractGoogleDriveFileId, googleDrivePreviewUrl } from "@/lib/drive-links";

const tabs = ["Certificate Readiness", "Issued Certificates", "Delivered Certificates", "Roadmaps"];
const decisions: CertificateApprovalStatus[] = ["PENDING", "APPROVED", "NOT_APPROVED"];
type CertificateFilterStatus = "ISSUED" | "NOT_ISSUED" | "REVOKED";
const certificateFilterStatuses: CertificateFilterStatus[] = ["ISSUED", "NOT_ISSUED", "REVOKED"];
const issuedCertificateExportColumns = ["Student_Name", "Certificate_ID", "Verification_Status", "Certificate_Name", "Issue_Date", "University", "College", "University_Student_ID", "Track", "Credit_Hours", "Delivery_Mode", "Roadmap_Name", "Roadmap_Version", "Learning_Roadmap", "Completed_Tasks", "Projects", "Verification_URL", "QR_Code_Value"] as const;

function dataUrl(batchId: string, groupId: string) {
  const params = new URLSearchParams();
  if (batchId) params.set("batchId", batchId);
  if (groupId) params.set("groupId", groupId);
  return `/api/certificates${params.size ? `?${params}` : ""}`;
}

export function CertificatesPage() {
  const [active, setActive] = useState(tabs[0]);
  const [batchId, setBatchId] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedUniversities, setSelectedUniversities] = useState<string[]>([]);
  const [selectedApprovalStatuses, setSelectedApprovalStatuses] = useState<CertificateApprovalStatus[]>([]);
  const [selectedCertificateStatuses, setSelectedCertificateStatuses] = useState<CertificateFilterStatus[]>([]);
  const [readinessSearch, setReadinessSearch] = useState("");
  const [data, setData] = useState<CertificatesData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [readinessDirty, setReadinessDirty] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await apiFetch<{ data: CertificatesData }>(dataUrl(batchId, ""));
      setData(response.data);
    } catch (reason) {
      setError(formatClientApiError(reason));
    } finally {
      setLoading(false);
    }
  }, [batchId]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  const groupsForBatch = useMemo(() => (data?.groups ?? []).filter(group => !batchId || group.batchId === batchId), [data?.groups, batchId]);
  const universityOptions = useMemo(() => universityFilterOptions((data?.readinessRows ?? []).filter(row => !selectedGroupIds.length || selectedGroupIds.includes(row.groupId))), [data?.readinessRows, selectedGroupIds]);
  const canReplaceReadinessRows = () => !readinessDirty || window.confirm("You have unsaved certificate decision changes. Discard changes and continue?");
  return <><PageHeader eyebrow="Internal Operations" title="Certificates" description="Manage certificate readiness, issued certificates, and learning roadmaps."/><Card className="overflow-hidden"><Tabs tabs={tabs} active={active} onChange={setActive}/><div className="border-b bg-slate-50/70 p-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><SelectField labelText="Batch" placeholder="Select Batch" value={batchId} onChange={value => { if (!canReplaceReadinessRows()) return; setReadinessDirty(false); setBatchId(value); setSelectedGroupIds([]); setSelectedUniversities([]); setSelectedApprovalStatuses([]); setSelectedCertificateStatuses([]); setReadinessSearch(""); }} options={(data?.batches ?? []).map(batch => ({ value: batch.batchId, label: `${batch.batchName} (${batch.batchId})` }))}/><MultiSelectField labelText="Groups" allLabel="All Groups" disabled={!batchId} values={selectedGroupIds} onChange={values => { setSelectedGroupIds(values); setSelectedUniversities([]); }} options={groupsForBatch.map(group => ({ value: group.groupId, label: group.groupName }))} searchable/><MultiSelectField labelText="Universities" allLabel="All Universities" values={selectedUniversities} onChange={setSelectedUniversities} options={universityOptions} searchable/><MultiSelectField labelText="Approval Status" allLabel="All Approval Statuses" values={selectedApprovalStatuses} onChange={values => setSelectedApprovalStatuses(values as CertificateApprovalStatus[])} options={decisions.map(decision => ({ value: decision, label: label(decision) }))}/><MultiSelectField labelText="Certificate Status" allLabel="All Certificate Statuses" values={selectedCertificateStatuses} onChange={values => setSelectedCertificateStatuses(values as CertificateFilterStatus[])} options={certificateFilterStatuses.map(status => ({ value: status, label: certificateFilterStatusLabel(status) }))}/><div className="flex flex-wrap items-end gap-2"><Button variant="secondary" onClick={() => { setSelectedGroupIds([]); setSelectedUniversities([]); setSelectedApprovalStatuses([]); setSelectedCertificateStatuses([]); setReadinessSearch(""); }} className="self-end">Reset Filters</Button><Button variant="ghost" onClick={() => { if (!canReplaceReadinessRows()) return; setReadinessDirty(false); void load(); }} className="self-end"><RefreshCw size={14}/>Refresh</Button></div></div></div>{loading ? <LoadingState/> : error ? <InlineError message={error}/> : !data ? <EmptyState/> : !data.schemaReady ? <SchemaWarning/> : <div className="p-4">{active === "Certificate Readiness" && <ReadinessTab rows={data.readinessRows} search={readinessSearch} selectedGroupIds={selectedGroupIds} selectedUniversities={selectedUniversities} selectedApprovalStatuses={selectedApprovalStatuses} selectedCertificateStatuses={selectedCertificateStatuses} onSearchChange={setReadinessSearch} onSaved={load} onDirtyChange={setReadinessDirty}/>} {active === "Issued Certificates" && <IssuedTab certificates={data.certificates} readinessRows={data.readinessRows} selectedGroupIds={selectedGroupIds} selectedUniversities={selectedUniversities} selectedApprovalStatuses={selectedApprovalStatuses} selectedCertificateStatuses={selectedCertificateStatuses} deliveryReady={data.certificateDeliveryFields.ready} missingDeliveryHeaders={data.certificateDeliveryFields.missing} onSaved={load}/>} {active === "Delivered Certificates" && <DeliveredTab certificates={data.certificates} deliveryReady={data.certificateDeliveryFields.ready} missingDeliveryHeaders={data.certificateDeliveryFields.missing} onSaved={load}/>} {active === "Roadmaps" && <RoadmapsTab data={data} onSaved={load}/>}</div>}</Card></>;
}

function SelectField({ labelText, value, onChange, options, disabled = false, placeholder }: { labelText: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean; placeholder?: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{labelText}</span><select disabled={disabled} value={value} onChange={event => onChange(event.target.value)} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"><option value="">{placeholder ?? `All ${labelText}s`}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function MultiSelectField({ labelText, allLabel, values, onChange, options, disabled = false, searchable = false }: { labelText: string; allLabel: string; values: string[]; onChange: (values: string[]) => void; options: Array<{ value: string; label: string }>; disabled?: boolean; searchable?: boolean }) {
  const [query, setQuery] = useState("");
  const selected = new Set(values);
  const visibleOptions = options.filter(option => !query.trim() || option.label.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (value: string) => onChange(selected.has(value) ? values.filter(item => item !== value) : [...values, value]);
  return <div><span className="mb-1.5 block text-xs font-semibold text-slate-700">{labelText}</span><details className="relative"><summary aria-label={labelText} className={`flex min-h-10 cursor-pointer list-none items-center justify-between rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 [&::-webkit-details-marker]:hidden ${disabled ? "pointer-events-none bg-slate-100 text-slate-400" : ""}`}><span>{disabled ? "Select Batch first" : values.length ? `${values.length} selected` : allLabel}</span><span className="ms-2 text-[10px] text-slate-400">v</span></summary><div className="absolute start-0 top-11 z-50 max-h-96 w-[min(36rem,calc(100vw-3rem))] overflow-y-auto rounded border border-slate-200 bg-white p-2 shadow-xl">{searchable && <input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${labelText.toLowerCase()}`} className="mb-2 h-9 w-full rounded border border-slate-300 px-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"/>}<div className="mb-1 flex flex-wrap items-center justify-between gap-2 border-b px-2 pb-2"><strong className="text-xs">{labelText}</strong><div className="flex gap-2"><button type="button" disabled={!options.length || values.length === options.length} onClick={() => onChange(options.map(option => option.value))} className="text-[11px] font-semibold text-red-700 disabled:text-slate-300">Select All</button><button type="button" disabled={!values.length} onClick={() => onChange([])} className="text-[11px] font-semibold text-red-700 disabled:text-slate-300">Clear All</button></div></div>{visibleOptions.length ? visibleOptions.map(option => <label key={option.value} className="flex cursor-pointer items-start gap-2 rounded px-2 py-2 text-xs hover:bg-slate-50"><input type="checkbox" checked={selected.has(option.value)} onChange={() => toggle(option.value)} className="mt-0.5 shrink-0 accent-red-700"/><span className="whitespace-normal leading-snug">{option.label}</span></label>) : <p className="px-2 py-3 text-xs text-slate-500">No options match.</p>}</div></details></div>;
}

function SearchWithHelper({ value, onChange, placeholder, helper }: { value: string; onChange: (value: string) => void; placeholder: string; helper: string }) {
  return <div className="w-full max-w-xl"><SearchInput value={value} onChange={onChange} placeholder={placeholder}/><p className="mt-1.5 text-xs text-slate-500">{helper}</p></div>;
}

function normalizeSearch(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function matchesSearch(fields: unknown[], query: string) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  return normalizeSearch(fields.join(" ")).includes(normalizedQuery);
}

function readinessSearchText(row: CertificateReadinessRow) {
  return [row.studentName, row.universityStudentId, row.academyStudentId];
}

function certificateSearchText(row: CertificatesData["certificates"][number]) {
  return [row.studentNameOnCertificate, row.studentName, row.universityStudentId, row.academyStudentId, row.certificateId];
}

function SchemaWarning() {
  return <div className="p-5"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><div className="font-bold">Certificates storage is not configured yet.</div><p className="mt-1 text-xs">Required sheets: Assignments, Assignment_Groups, Assignment_Results, Certificate_Eligibility, Learning_Roadmaps, Learning_Roadmap_Items, Batch_Roadmaps, and Certificates.</p></div></div>;
}

function InlineError({ message }: { message: string }) {
  return <div className="m-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</div>;
}

function ReadinessTab({ rows, search, selectedGroupIds, selectedUniversities, selectedApprovalStatuses, selectedCertificateStatuses, onSearchChange, onSaved, onDirtyChange }: { rows: CertificateReadinessRow[]; search: string; selectedGroupIds: string[]; selectedUniversities: string[]; selectedApprovalStatuses: CertificateApprovalStatus[]; selectedCertificateStatuses: CertificateFilterStatus[]; onSearchChange: (value: string) => void; onSaved: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const [drafts, setDrafts] = useState<Record<string, CertificateApprovalStatus>>({});
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [issueMessage, setIssueMessage] = useState("");
  const persistedByEnrollment = useMemo(() => new Map(rows.map(row => [row.enrollmentId, row.certificateDecision])), [rows]);
  const dirtyEntries = Object.entries(drafts).filter(([enrollmentId, decision]) => persistedByEnrollment.get(enrollmentId) && persistedByEnrollment.get(enrollmentId) !== decision);
  useEffect(() => { onDirtyChange(dirtyEntries.length > 0); }, [dirtyEntries.length, onDirtyChange]);
  const groupSet = useMemo(() => new Set(selectedGroupIds), [selectedGroupIds]);
  const universitySet = useMemo(() => new Set(selectedUniversities), [selectedUniversities]);
  const approvalSet = useMemo(() => new Set(selectedApprovalStatuses), [selectedApprovalStatuses]);
  const certificateSet = useMemo(() => new Set(selectedCertificateStatuses), [selectedCertificateStatuses]);
  const filtered = rows.filter(row => {
    const searchMatches = matchesSearch(readinessSearchText(row), search);
    const groupMatches = !groupSet.size || groupSet.has(row.groupId);
    const universityMatches = !universitySet.size || universitySet.has(universityKey(row.university));
    const approvalMatches = !approvalSet.size || approvalSet.has(effectiveApprovalStatus(row, drafts));
    const certificateMatches = !certificateSet.size || certificateSet.has(effectiveCertificateStatus(row));
    return searchMatches && groupMatches && universityMatches && approvalMatches && certificateMatches;
  });
  const selectableRows = filtered.filter(row => isIssueSelectable(row, (drafts[row.enrollmentId] ?? row.certificateDecision) !== row.certificateDecision));
  const selectedSet = new Set(selectedIssueIds);
  const selectedVisibleIssueIds = selectedIssueIds.filter(id => selectableRows.some(row => row.enrollmentId === id));
  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/academic-records", { method: "POST", body: JSON.stringify({ action: "set-certificate-decisions-bulk", changes: dirtyEntries.map(([enrollmentId, decision]) => ({ enrollmentId, decision })) }) });
      setDrafts({});
      onDirtyChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };
  const discard = () => {
    if (dirtyEntries.length > 3 && !window.confirm(`Discard ${dirtyEntries.length} unsaved certificate decision changes?`)) return;
    setDrafts({});
    onDirtyChange(false);
  };
  const selectAllEligible = () => setSelectedIssueIds(selectableRows.map(row => row.enrollmentId));
  const clearIssueSelection = () => setSelectedIssueIds([]);
  const toggleIssueSelection = (enrollmentId: string) => setSelectedIssueIds(current => current.includes(enrollmentId) ? current.filter(value => value !== enrollmentId) : [...current, enrollmentId]);
  const issueSelected = async () => {
    const enrollmentIds = selectedVisibleIssueIds;
    if (!enrollmentIds.length) return;
    if (!window.confirm(`Issue ${enrollmentIds.length} Certificate${enrollmentIds.length === 1 ? "" : "s"}?\n\nThis will generate Certificate IDs, Verification Tokens, Roadmap snapshots, and certificate profile snapshots.`)) return;
    setIssuing(true); setIssueMessage("");
    try {
      const response = await apiFetch<{ result: { issued: number; alreadyIssued: number; failed: number; results: Array<{ enrollmentId: string; status: string; message?: string }> } }>("/api/certificates", { method: "POST", body: JSON.stringify({ action: "issue-certificates-bulk", enrollmentIds }) });
      const failedMessages = response.result.results.filter(result => result.status !== "ISSUED").slice(0, 3).map(result => `${result.enrollmentId}: ${result.message ?? result.status}`).join(" | ");
      setIssueMessage(`Issued ${response.result.issued}. Already issued ${response.result.alreadyIssued}. Failed ${response.result.failed}.${failedMessages ? ` ${failedMessages}` : ""}`);
      setSelectedIssueIds(current => current.filter(id => !response.result.results.some(result => result.enrollmentId === id && result.status === "ISSUED")));
      onSaved();
    } finally {
      setIssuing(false);
    }
  };
  return <div className="space-y-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><SearchWithHelper value={search} onChange={onSearchChange} placeholder="Search students..." helper="Search by student name, university ID, or academy ID"/><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-500">{filtered.length} student{filtered.length === 1 ? "" : "s"}</span>{dirtyEntries.length ? <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{dirtyEntries.length} Unsaved Changes</span> : null}<Button variant="secondary" disabled={!dirtyEntries.length || saving} onClick={discard}>Discard Changes</Button><Button disabled={!dirtyEntries.length || saving} onClick={() => void save()}><Save size={14}/>{saving ? "Saving..." : `Save Changes${dirtyEntries.length ? ` (${dirtyEntries.length})` : ""}`}</Button><Button variant="secondary" disabled={!selectableRows.length || issuing} onClick={selectAllEligible}>Select All Eligible</Button><Button variant="ghost" disabled={!selectedVisibleIssueIds.length || issuing} onClick={clearIssueSelection}>Clear Selection</Button><Button disabled={!selectedVisibleIssueIds.length || issuing} onClick={() => void issueSelected()}><FileCheck2 size={14}/>{issuing ? "Issuing..." : `Issue Selected${selectedVisibleIssueIds.length ? ` (${selectedVisibleIssueIds.length})` : ""}`}</Button></div></div>{issueMessage && <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-800">{issueMessage}</div>}{!filtered.length ? <EmptyState title="No students match the current filters."/> : <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[1880px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">{["Issue", "Student", "Phone", "University", "Group", "Certificate Information", "Roadmap", "Tasks", "Projects", "Missing", "Average Grade", "Readiness", "Approval", "Certificate", "Actions"].map(column => <th key={column} className="px-3 py-2.5 font-bold">{column}</th>)}</tr></thead><tbody>{filtered.map(row => { const draftDecision = drafts[row.enrollmentId] ?? row.certificateDecision; const dirty = draftDecision !== row.certificateDecision; const selectable = isIssueSelectable(row, dirty); const issueReason = dirty ? "Save certificate decision first." : row.certificateIssueBlockReason || ""; return <tr key={row.enrollmentId} className={`border-b align-top last:border-0 ${dirty ? "bg-amber-50/40" : ""}`}><td className="px-3 py-3"><input aria-label={`Select ${row.studentName} for certificate issue`} type="checkbox" disabled={!selectable || issuing} checked={selectedSet.has(row.enrollmentId)} onChange={() => toggleIssueSelection(row.enrollmentId)} className="h-4 w-4 accent-red-700"/>{!selectable && issueReason ? <p className="mt-1 max-w-32 text-[10px] leading-snug text-slate-500">{issueReason}</p> : null}</td><td className="px-3 py-3"><div className="font-semibold">{row.studentName}</div><div className="font-mono text-[11px] text-slate-500">{row.academyStudentId}</div></td><td className="min-w-[130px] whitespace-nowrap px-3 py-3 font-mono">{row.phone?.trim() || "-"}</td><td className="px-3 py-3">{row.university || "—"}</td><td className="min-w-[220px] whitespace-normal px-3 py-3">{row.groupName}</td><td className="min-w-[230px] px-3 py-3"><CertificateProfileCell row={row}/></td><td className="min-w-[220px] px-3 py-3"><RoadmapCell row={row}/></td><td className="px-3 py-3">{row.submittedTasks}/{row.requiredTasks}</td><td className="px-3 py-3">{row.submittedProjects}/{row.requiredProjects}</td><td className="px-3 py-3">{row.missingRequiredAssignments}</td><td className="px-3 py-3">{row.averageGradePercentage === null ? "—" : `${row.averageGradePercentage}%`}</td><td className="px-3 py-3"><StatusBadge tone={row.automaticReadiness === "READY" ? "success" : row.automaticReadiness === "NOT_READY" ? "danger" : "neutral"}>{label(row.automaticReadiness)}</StatusBadge></td><td className="px-3 py-3"><div className="flex flex-col items-start gap-1"><DecisionSelect row={row} value={draftDecision} disabled={saving || issuing} onChange={decision => setDrafts(current => ({ ...current, [row.enrollmentId]: decision }))}/>{dirty && <StatusBadge tone="warning">Unsaved</StatusBadge>}</div></td><td className="px-3 py-3"><StatusBadge tone={row.certificateStatus === "ISSUED" ? "success" : row.certificateStatus === "REVOKED" ? "danger" : "neutral"}>{row.certificateStatus ?? "NOT_ISSUED"}</StatusBadge></td><td className="min-w-[210px] px-3 py-3"><div className="flex flex-wrap gap-2"><IssueButton row={row} onSaved={onSaved} unsavedDecision={dirty}/></div>{dirty ? <p className="mt-1.5 text-[11px] leading-snug text-amber-700">Save certificate decision first.</p> : row.certificateIssueBlockReason ? <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{row.certificateIssueBlockReason}</p> : null}</td></tr>; })}</tbody></table></div>}</div>;
}

function effectiveApprovalStatus(row: CertificateReadinessRow, drafts: Record<string, CertificateApprovalStatus>) {
  return drafts[row.enrollmentId] ?? row.certificateDecision ?? "PENDING";
}

function effectiveCertificateStatus(row: CertificateReadinessRow): CertificateFilterStatus {
  if (row.certificateStatus === "ISSUED") return "ISSUED";
  if (row.certificateStatus === "REVOKED") return "REVOKED";
  return "NOT_ISSUED";
}

function certificateFilterStatusLabel(status: CertificateFilterStatus) {
  return status === "ISSUED" ? "Issued" : status === "REVOKED" ? "Revoked" : "Not Issued";
}

function isIssueSelectable(row: CertificateReadinessRow, dirty: boolean) {
  return !dirty && !row.certificateIssueBlockReason && row.certificateStatus !== "ISSUED";
}

function universityKey(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function universityFilterOptions(rows: CertificateReadinessRow[]) {
  const options = new Map<string, string>();
  for (const row of rows) {
    const label = String(row.university ?? "").trim().replace(/\s+/g, " ");
    const key = universityKey(label);
    if (key && !options.has(key)) options.set(key, label);
  }
  return [...options.entries()].map(([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label));
}

function CertificateProfileCell({ row }: { row: CertificateReadinessRow }) {
  const confirmed = row.certificateProfileStatus === "CONFIRMED";
  return <div className="space-y-1"><StatusBadge tone={confirmed ? "success" : "warning"}>{confirmed ? "Confirmed" : "Not Confirmed"}</StatusBadge>{confirmed ? <><div className="font-semibold leading-snug">{row.certificateNameOnCertificate || "—"}</div><div className="break-all text-xs text-slate-500">{row.certificateDeliveryEmail || "—"}</div></> : <p className="text-xs text-slate-500">Student has not confirmed certificate identity details.</p>}</div>;
}

function RoadmapCell({ row }: { row: CertificateReadinessRow }) {
  const tone = row.roadmapStatus === "ASSIGNED" ? "success" : row.roadmapStatus === "CONFLICT" || row.roadmapStatus === "INACTIVE" ? "danger" : "warning";
  return <div className="space-y-1"><StatusBadge tone={tone}>{label(row.roadmapStatus ?? "NOT_ASSIGNED")}</StatusBadge>{row.roadmapName ? <div className="font-semibold leading-snug">{row.roadmapName}<div className="text-xs font-normal text-slate-500">{row.roadmapVersion || "—"}</div></div> : <p className="text-xs text-slate-500">No active roadmap assigned to this Group.</p>}</div>;
}

function DecisionSelect({ row, value, disabled, onChange }: { row: CertificateReadinessRow; value: CertificateApprovalStatus; disabled: boolean; onChange: (decision: CertificateApprovalStatus) => void }) {
  return <select aria-label={`Certificate decision for ${row.academyStudentId}`} disabled={disabled} value={value} onChange={event => onChange(event.target.value as CertificateApprovalStatus)} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold">{decisions.map(decision => <option key={decision} value={decision}>{label(decision)}</option>)}</select>;
}

function IssueButton({ row, onSaved, unsavedDecision = false }: { row: CertificateReadinessRow; onSaved: () => void; unsavedDecision?: boolean }) {
  const [saving, setSaving] = useState(false);
  const disabled = Boolean(row.certificateIssueBlockReason) || unsavedDecision;
  const issue = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/certificates", { method: "POST", body: JSON.stringify({ action: "issue-certificate", enrollmentId: row.enrollmentId }) });
      onSaved();
    } finally { setSaving(false); }
  };
  return <Button size="sm" disabled={disabled || saving} title={unsavedDecision ? "Save certificate decision first." : row.certificateIssueBlockReason || "Issue certificate"} onClick={() => void issue()}><FileCheck2 size={13}/>{saving ? "Issuing..." : "Issue Certificate"}</Button>;
}

function IssuedTab({ certificates, readinessRows, selectedGroupIds, selectedUniversities, selectedApprovalStatuses, selectedCertificateStatuses, deliveryReady, missingDeliveryHeaders, onSaved }: { certificates: CertificatesData["certificates"]; readinessRows: CertificateReadinessRow[]; selectedGroupIds: string[]; selectedUniversities: string[]; selectedApprovalStatuses: CertificateApprovalStatus[]; selectedCertificateStatuses: CertificateFilterStatus[]; deliveryReady: boolean; missingDeliveryHeaders: string[]; onSaved: () => void }) {
  const [exporting, setExporting] = useState(false);
  const [draftLinks, setDraftLinks] = useState<Record<string, string>>({});
  const [selectedPublishIds, setSelectedPublishIds] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [search, setSearch] = useState("");
  const approvalByEnrollment = useMemo(() => new Map(readinessRows.map(row => [row.enrollmentId, row.certificateDecision])), [readinessRows]);
  const groupSet = useMemo(() => new Set(selectedGroupIds), [selectedGroupIds]);
  const universitySet = useMemo(() => new Set(selectedUniversities), [selectedUniversities]);
  const approvalSet = useMemo(() => new Set(selectedApprovalStatuses), [selectedApprovalStatuses]);
  const certificateSet = useMemo(() => new Set(selectedCertificateStatuses), [selectedCertificateStatuses]);
  const allQueue = certificates.filter(isPendingDeliveryCertificate);
  const queue = allQueue.filter(row => {
    const searchMatches = matchesSearch(certificateSearchText(row), search);
    const groupMatches = !groupSet.size || groupSet.has(row.groupId);
    const universityMatches = !universitySet.size || universitySet.has(universityKey(row.university));
    const approvalMatches = !approvalSet.size || approvalSet.has(approvalByEnrollment.get(row.enrollmentId) ?? "PENDING");
    const certificateMatches = !certificateSet.size || certificateSet.has("ISSUED");
    return searchMatches && groupMatches && universityMatches && approvalMatches && certificateMatches;
  });
  const selectedSet = new Set(selectedPublishIds);
  const readyRows = queue.filter(row => deliveryFileId(row, draftLinks));
  const selectedReadyIds = selectedPublishIds.filter(id => readyRows.some(row => row.certificateId === id));
  const exportExcel = () => {
    if (!queue.length) {
      window.alert("No certificates match the current filters.");
      return;
    }
    setExporting(true);
    try {
      const rows = [issuedCertificateExportColumns.map(String), ...queue.map(exportCertificateRow)];
      downloadBlob(createCertificatesXlsxBlob(rows), `TechTrek_Issued_Certificates_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  };
  const bulkPaste = (value: string) => {
    const ids = new Set(allQueue.map(row => row.certificateId));
    const updates: Record<string, string> = {};
    let matched = 0; let unknown = 0; let invalid = 0;
    for (const line of value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)) {
      const [certificateId, ...rest] = line.includes("\t") ? line.split("\t") : line.split("|");
      const id = certificateId.trim();
      const url = rest.join("|").trim();
      if (!ids.has(id)) { unknown++; continue; }
      if (!extractGoogleDriveFileId(url)) { invalid++; continue; }
      updates[id] = url;
      matched++;
    }
    setDraftLinks(current => ({ ...current, ...updates }));
    setMessage(`Bulk paste processed: ${matched} matched, ${unknown} unknown Certificate_ID, ${invalid} invalid Drive link.`);
  };
  const publishSelected = async () => {
    const rows = queue.filter(row => selectedReadyIds.includes(row.certificateId));
    if (!rows.length || !deliveryReady) return;
    if (!window.confirm(`Publish ${rows.length} certificate${rows.length === 1 ? "" : "s"} to Student Portal?`)) return;
    setPublishing(true); setMessage("");
    try {
      const response = await apiFetch<{ result: { published: number; alreadyPublished: number; failed: number; results: Array<{ certificateId: string; status: string; message?: string }> } }>("/api/certificates", { method: "POST", body: JSON.stringify({ action: "publish-certificates-bulk", certificates: rows.map(row => ({ certificateId: row.certificateId, driveUrl: draftLinks[row.certificateId] ?? "" })) }) });
      const failedMessages = response.result.results.filter(result => result.status === "FAILED").slice(0, 3).map(result => `${result.certificateId}: ${result.message ?? "Failed"}`).join(" | ");
      setMessage(`Certificates published: ${response.result.published}. Already published: ${response.result.alreadyPublished}. Failed: ${response.result.failed}.${failedMessages ? ` ${failedMessages}` : ""}`);
      setSelectedPublishIds(current => current.filter(id => !response.result.results.some(result => result.certificateId === id && result.status === "PUBLISHED")));
      onSaved();
    } finally { setPublishing(false); }
  };
  return <div className="space-y-4">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><SearchWithHelper value={search} onChange={setSearch} placeholder="Search students..." helper="Search by student name, university ID, academy ID, or certificate ID"/><div className="flex flex-wrap items-center gap-2"><div className="text-sm text-slate-600"><strong>{queue.length}</strong> issued certificate{queue.length === 1 ? "" : "s"} awaiting Student Portal delivery.</div><Button variant="secondary" disabled={exporting || !queue.length} onClick={exportExcel}><FileSpreadsheet size={14}/>{exporting ? "Exporting..." : `Export Excel (${queue.length})`}</Button><Button variant="secondary" disabled={!deliveryReady || !readyRows.length || publishing} onClick={() => setSelectedPublishIds(readyRows.map(row => row.certificateId))}>Select All Ready</Button><Button variant="ghost" disabled={!selectedPublishIds.length || publishing} onClick={() => setSelectedPublishIds([])}>Clear Selection</Button><Button disabled={!deliveryReady || !selectedReadyIds.length || publishing} onClick={() => void publishSelected()}><Send size={14}/>{publishing ? "Publishing..." : `Publish Selected${selectedReadyIds.length ? ` (${selectedReadyIds.length})` : ""}`}</Button></div></div>
    {!deliveryReady && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><strong>Certificate delivery fields are not configured.</strong><br/>Missing Certificates headers: {missingDeliveryHeaders.join(", ")}</div>}
    <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Bulk paste Certificate_ID + Google Drive URL</span><textarea disabled={!deliveryReady} rows={3} placeholder={"CERT_000001\tGoogle Drive PDF URL\nCERT_000002 | Google Drive PDF URL"} onChange={event => bulkPaste(event.target.value)} className="w-full rounded border border-slate-300 p-3 font-mono text-xs disabled:bg-slate-100"/></label>
    {message && <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-800">{message}</div>}
    {!queue.length ? <EmptyState title="No issued certificates are waiting for delivery."/> : <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[1620px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">{["Publish", "Certificate ID", "Student", "Certificate Snapshot", "Batch", "Group", "Issue Date", "Drive PDF", "Preview", "Verification", "Certificate"].map(column => <th key={column} className="px-3 py-2.5 font-bold">{column}</th>)}</tr></thead><tbody>{queue.map(row => { const fileId = deliveryFileId(row, draftLinks); return <tr key={row.certificateId} className="border-b align-top last:border-0"><td className="px-3 py-3"><input aria-label={`Select ${row.certificateId} for portal publish`} type="checkbox" disabled={!deliveryReady || !fileId || publishing} checked={selectedSet.has(row.certificateId)} onChange={() => setSelectedPublishIds(current => current.includes(row.certificateId) ? current.filter(id => id !== row.certificateId) : [...current, row.certificateId])} className="h-4 w-4 accent-red-700"/></td><td className="px-3 py-3 font-mono text-xs">{row.certificateId}</td><td className="px-3 py-3"><div className="font-semibold">{row.studentName}</div><div className="text-xs text-slate-500">{row.universityStudentId}</div></td><td className="min-w-[220px] px-3 py-3"><div className="font-semibold">{row.studentNameOnCertificate || "—"}</div><div className="break-all text-xs text-slate-500">{row.certificateDeliveryEmail || "—"}</div></td><td className="px-3 py-3">{row.batchId}</td><td className="min-w-[240px] whitespace-normal px-3 py-3">{row.groupName || "—"}</td><td className="px-3 py-3">{row.issueDate}</td><td className="min-w-[300px] px-3 py-3"><input value={draftLinks[row.certificateId] ?? ""} disabled={!deliveryReady || publishing} onChange={event => setDraftLinks(current => ({ ...current, [row.certificateId]: event.target.value }))} placeholder="Paste Google Drive PDF link" className="h-9 w-full rounded border border-slate-300 px-2 text-xs disabled:bg-slate-100"/><div className="mt-1 text-[11px] font-semibold text-slate-500">{fileId ? "Ready to publish" : "Paste a valid Drive file link"}</div></td><td className="px-3 py-3">{fileId ? <Button size="sm" variant="secondary" onClick={() => setPreviewId(previewId === fileId ? "" : fileId)}><Eye size={13}/>Preview</Button> : "—"}</td><td className="px-3 py-3">{row.verificationToken ? <a className="text-xs font-semibold text-red-700 underline" href={`/verify/certificate/${encodeURIComponent(row.verificationToken)}`} target="_blank" rel="noreferrer">Open Verification</a> : <span className="text-xs font-semibold text-amber-700">Verification unavailable</span>}</td><td className="px-3 py-3"><RevokeButton certificateId={row.certificateId} disabled={row.certificateStatus === "REVOKED"} onSaved={onSaved}/></td></tr>; })}</tbody></table></div>}
    {previewId && <div className="overflow-hidden rounded border border-slate-200 bg-white"><div className="flex items-center justify-between border-b bg-slate-50 p-3"><strong className="text-sm">Certificate PDF Preview</strong><Button size="sm" variant="ghost" onClick={() => setPreviewId("")}>Close Preview</Button></div><iframe className="h-[70vh] w-full" src={googleDrivePreviewUrl(previewId)} title="Certificate PDF preview" allow="fullscreen" allowFullScreen/></div>}
  </div>;
}

function deliveryFileId(row: CertificatesData["certificates"][number], drafts: Record<string, string>) {
  return extractGoogleDriveFileId(drafts[row.certificateId] ?? "") || row.certificateFileId;
}

function isPendingDeliveryCertificate(row: CertificatesData["certificates"][number]) {
  return row.certificateStatus === "ISSUED" && row.portalStatus !== "PUBLISHED";
}

function DeliveredTab({ certificates, deliveryReady, missingDeliveryHeaders, onSaved }: { certificates: CertificatesData["certificates"]; deliveryReady: boolean; missingDeliveryHeaders: string[]; onSaved: () => void }) {
  const [search, setSearch] = useState("");
  const delivered = certificates.filter(row => row.certificateStatus === "ISSUED" && row.portalStatus === "PUBLISHED" && matchesSearch(certificateSearchText(row), search));
  const [previewId, setPreviewId] = useState("");
  return <div className="space-y-4">{!deliveryReady && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><strong>Certificate delivery fields are not configured.</strong><br/>Missing Certificates headers: {missingDeliveryHeaders.join(", ")}</div>}<div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><SearchWithHelper value={search} onChange={setSearch} placeholder="Search students..." helper="Search by student name, university ID, academy ID, or certificate ID"/><div className="text-sm text-slate-600"><strong>{delivered.length}</strong> delivered certificate{delivered.length === 1 ? "" : "s"} published to Student Portal.</div></div>{!delivered.length ? <EmptyState title="No delivered certificates yet."/> : <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[1320px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">{["Certificate ID", "Student", "Certificate", "Group", "Issue Date", "Published", "Status", "Actions"].map(column => <th key={column} className="px-3 py-2.5 font-bold">{column}</th>)}</tr></thead><tbody>{delivered.map(row => <tr key={row.certificateId} className="border-b align-top last:border-0"><td className="px-3 py-3 font-mono text-xs">{row.certificateId}</td><td className="px-3 py-3"><div className="font-semibold">{row.studentNameOnCertificate || row.studentName}</div><div className="text-xs text-slate-500">{row.universityStudentId}</div></td><td className="px-3 py-3">{row.certificateName}</td><td className="min-w-[240px] whitespace-normal px-3 py-3">{row.groupName || "—"}</td><td className="px-3 py-3">{row.issueDate}</td><td className="px-3 py-3"><div>{row.publishedAt || "—"}</div><div className="text-xs text-slate-500">{row.certificateFileName || row.certificateFileId || "—"}</div></td><td className="px-3 py-3"><StatusBadge tone="success">Published</StatusBadge></td><td className="px-3 py-3"><div className="flex flex-wrap gap-2">{row.certificateFileId ? <Button size="sm" variant="secondary" onClick={() => setPreviewId(row.certificateFileId)}><Eye size={13}/>View Certificate</Button> : null}{row.verificationToken ? <a className="inline-flex h-8 items-center rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50" href={`/verify/certificate/${encodeURIComponent(row.verificationToken)}`} target="_blank" rel="noreferrer">Open Verification</a> : null}<UnpublishButton certificateId={row.certificateId} disabled={!deliveryReady} onSaved={onSaved}/></div></td></tr>)}</tbody></table></div>}{previewId && <div className="overflow-hidden rounded border border-slate-200 bg-white"><div className="flex items-center justify-between border-b bg-slate-50 p-3"><strong className="text-sm">Delivered Certificate Preview</strong><Button size="sm" variant="ghost" onClick={() => setPreviewId("")}>Close Preview</Button></div><iframe className="h-[70vh] w-full" src={googleDrivePreviewUrl(previewId)} title="Delivered certificate preview" allow="fullscreen" allowFullScreen/></div>}</div>;
}

function UnpublishButton({ certificateId, disabled, onSaved }: { certificateId: string; disabled: boolean; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  return <Button size="sm" variant="danger" disabled={disabled || saving} onClick={async () => { if (!window.confirm("Unpublish this certificate from the Student Portal? The certificate remains issued and the file metadata is preserved.")) return; setSaving(true); try { await apiFetch("/api/certificates", { method: "POST", body: JSON.stringify({ action: "unpublish-certificate", certificateId }) }); onSaved(); } finally { setSaving(false); } }}>{saving ? "Unpublishing..." : "Unpublish"}</Button>;
}

function RevokeButton({ certificateId, disabled, onSaved }: { certificateId: string; disabled: boolean; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  return <Button size="sm" variant="danger" disabled={disabled || saving} onClick={async () => { setSaving(true); try { await apiFetch("/api/certificates", { method: "POST", body: JSON.stringify({ action: "revoke-certificate", certificateId }) }); onSaved(); } finally { setSaving(false); } }}><RotateCcw size={13}/>Revoke</Button>;
}

function RoadmapsTab({ data, onSaved }: { data: CertificatesData; onSaved: () => void }) {
  return <div className="grid gap-4 xl:grid-cols-[1fr_1fr]"><RoadmapForm data={data} onSaved={onSaved}/><BatchRoadmapForm data={data} onSaved={onSaved}/><CurrentMappings data={data}/><Card className="p-4 xl:col-span-2"><h2 className="heading mb-3 text-base font-bold">Learning Roadmaps</h2>{!data.roadmaps.length ? <EmptyState title="No roadmaps yet."/> : <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[1080px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">{["Roadmap Name", "Track", "Credit Hours", "Version", "Topics", "Active Status", "Groups Assigned", "Actions"].map(column => <th key={column} className="px-3 py-2.5 font-bold">{column}</th>)}</tr></thead><tbody>{data.roadmaps.map(roadmap => { const track = data.tracks.find(item => item.trackId === roadmap.trackId); const mappings = data.batchRoadmaps.filter(mapping => mapping.roadmapId === roadmap.roadmapId && mapping.isActive); return <RoadmapRow key={roadmap.roadmapId} roadmap={roadmap} trackName={track?.trackName ?? roadmap.trackId} mappings={mappings} items={data.roadmapItems.filter(item => item.roadmapId === roadmap.roadmapId)} onSaved={onSaved}/>; })}</tbody></table></div>}</Card></div>;
}

function RoadmapForm({ data, onSaved }: { data: CertificatesData; onSaved: () => void }) {
  const [name, setName] = useState(""); const [trackId, setTrackId] = useState(""); const [hours, setHours] = useState(0); const [version, setVersion] = useState("v1"); const [isActive, setIsActive] = useState(true); const [notes, setNotes] = useState(""); const [saving, setSaving] = useState(false);
  return <Card className="p-4"><h2 className="heading mb-3 text-base font-bold">Add Roadmap</h2><div className="grid gap-3 md:grid-cols-2"><Field label="Roadmap Name" value={name} onChange={event => setName(event.target.value)}/><SelectField labelText="Track" placeholder="Select Track" value={trackId} onChange={setTrackId} options={data.tracks.filter(track => track.isActive).map(track => ({ value: track.trackId, label: track.label }))}/><Field label="Credit Hours" type="number" min="0" value={hours} onChange={event => setHours(Number(event.target.value))}/><Field label="Version" value={version} onChange={event => setVersion(event.target.value)}/><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)}/>Active</label><Field label="Notes" value={notes} onChange={event => setNotes(event.target.value)}/></div>{!data.tracks.length && <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">No canonical Tracks are available.</p>}<Button className="mt-3" disabled={!name.trim() || !trackId || saving} onClick={async () => { setSaving(true); try { await apiFetch("/api/certificates", { method: "POST", body: JSON.stringify({ action: "save-roadmap", roadmapName: name, trackId, creditHours: hours, version, isActive, notes }) }); setName(""); setTrackId(""); setHours(0); setVersion("v1"); setIsActive(true); setNotes(""); onSaved(); } finally { setSaving(false); } }}><Plus size={14}/>{saving ? "Saving..." : "Save Roadmap"}</Button></Card>;
}

function RoadmapRow({ roadmap, trackName, mappings, items, onSaved }: { roadmap: CertificatesData["roadmaps"][number]; trackName: string; mappings: CertificatesData["batchRoadmaps"]; items: CertificatesData["roadmapItems"]; onSaved: () => void }) {
  const [manage, setManage] = useState(false);
  return <tr className="border-b align-top last:border-0"><td className="px-3 py-3 font-semibold">{roadmap.roadmapName}<div className="font-mono text-[11px] text-slate-500">{roadmap.roadmapId}</div></td><td className="px-3 py-3">{trackName || "—"}</td><td className="px-3 py-3">{roadmap.creditHours}H</td><td className="px-3 py-3">{roadmap.version || "—"}</td><td className="px-3 py-3">{roadmap.topicCount}</td><td className="px-3 py-3"><StatusBadge tone={roadmap.isActive ? "success" : "neutral"}>{roadmap.isActive ? "Active" : "Inactive"}</StatusBadge></td><td className="px-3 py-3"><div className="flex flex-col items-start gap-1.5">{mappings.length ? mappings.map(mapping => <span key={mapping.batchRoadmapId} className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold leading-snug text-slate-700">{mapping.batchId} / {mapping.groupName}</span>) : <span className="text-xs text-slate-500">No active group mappings</span>}</div></td><td className="px-3 py-3"><div className="flex flex-col items-start gap-2"><Button size="sm" variant="secondary" disabled>Edit</Button><Button size="sm" onClick={() => setManage(current => !current)}>Manage Topics</Button></div>{manage && <RoadmapTopicsPanel roadmapId={roadmap.roadmapId} items={items} onSaved={onSaved}/>}</td></tr>;
}

function BatchRoadmapForm({ data, onSaved }: { data: CertificatesData; onSaved: () => void }) {
  const [batchId, setBatchId] = useState(""); const [groupIds, setGroupIds] = useState<string[]>([]); const [roadmapId, setRoadmapId] = useState(""); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  const groups = data.groups.filter(group => group.batchId === batchId);
  const selectedRoadmap = data.roadmaps.find(roadmap => roadmap.roadmapId === roadmapId);
  const selectedGroups = groups.filter(group => groupIds.includes(group.groupId));
  const currentMappings = selectedGroups.map(group => ({ group, mapping: data.batchRoadmaps.find(mapping => mapping.batchId === batchId && mapping.groupId === group.groupId && mapping.isActive) }));
  const sameRoadmapMappings = currentMappings.filter(item => item.mapping?.roadmapId === roadmapId);
  const conflictingMappings = currentMappings.filter(item => item.mapping && item.mapping.roadmapId !== roadmapId);
  const unmappedCount = currentMappings.filter(item => !item.mapping).length;
  const submit = async () => {
    setMessage("");
    if (conflictingMappings.length && !window.confirm(`Replace active Roadmaps for ${conflictingMappings.length} Group(s)?\n\n${conflictingMappings.map(item => `${item.group.groupName}\nCurrent: ${item.mapping?.roadmapName}\nNew: ${selectedRoadmap?.roadmapName ?? roadmapId}`).join("\n\n")}\n\nOld mappings will be deactivated and preserved as history.`)) return;
    setSaving(true);
    try {
      const response = await apiFetch<{ result: { created: number; reassigned: number; unchanged: number; totalSelected: number } }>("/api/certificates", { method: "POST", body: JSON.stringify({ action: "assign-roadmap", batchId, groupIds, roadmapId }) });
      setMessage(`Roadmap assigned successfully: ${response.result.created + response.result.reassigned} groups updated, ${response.result.unchanged} already assigned.`);
      setGroupIds([]);
      setRoadmapId("");
      onSaved();
    } finally { setSaving(false); }
  };
  return <Card className="p-4"><h2 className="heading mb-3 text-base font-bold">Assign Roadmap to Groups</h2><div className="space-y-3"><SelectField labelText="Batch" placeholder="Select Batch" value={batchId} onChange={value => { setBatchId(value); setGroupIds([]); setMessage(""); }} options={data.batches.map(batch => ({ value: batch.batchId, label: batch.batchName }))}/><GroupMultiSelect groups={groups} selectedGroupIds={groupIds} disabled={!batchId} onChange={setGroupIds}/><SelectField labelText="Roadmap" placeholder="Select Roadmap" value={roadmapId} onChange={value => { setRoadmapId(value); setMessage(""); }} options={data.roadmaps.map(roadmap => ({ value: roadmap.roadmapId, label: `${roadmap.roadmapName} — ${roadmap.creditHours}H — ${roadmap.version || "v1"}` }))}/></div>{message ? <p className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{message}</p> : !data.roadmaps.length ? <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">No roadmaps are available. Create a roadmap first.</p> : batchId && !groups.length ? <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">No groups were found for this batch.</p> : groupIds.length && roadmapId ? <RoadmapAssignmentPreview unmappedCount={unmappedCount} sameCount={sameRoadmapMappings.length} conflicts={conflictingMappings} newRoadmapName={selectedRoadmap?.roadmapName ?? roadmapId}/> : groupIds.length ? <p className="mt-3 text-xs text-slate-500">Select a roadmap for the selected groups.</p> : batchId ? <p className="mt-3 text-xs text-slate-500">Select one or more groups to assign their roadmap.</p> : <p className="mt-3 text-xs text-slate-500">Select a batch first.</p>}<Button className="mt-3 w-full sm:w-auto" disabled={!batchId || !groupIds.length || !roadmapId || saving} onClick={() => void submit()}><CheckCircle2 size={14}/>{saving ? "Assigning..." : "Assign Roadmap"}</Button></Card>;
}

function GroupMultiSelect({ groups, selectedGroupIds, disabled, onChange }: { groups: CertificatesData["groups"]; selectedGroupIds: string[]; disabled: boolean; onChange: (groupIds: string[]) => void }) {
  const selectedGroups = groups.filter(group => selectedGroupIds.includes(group.groupId));
  const toggle = (groupId: string) => onChange(selectedGroupIds.includes(groupId) ? selectedGroupIds.filter(value => value !== groupId) : [...selectedGroupIds, groupId]);
  return <div><span className="mb-1.5 block text-xs font-semibold text-slate-700">Groups</span><details className="group relative"><summary aria-label="Select Groups" className={`flex min-h-10 cursor-pointer list-none items-center justify-between rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 [&::-webkit-details-marker]:hidden ${disabled ? "pointer-events-none bg-slate-100 text-slate-400" : ""}`}><span>{disabled ? "Select Batch first" : selectedGroupIds.length ? `${selectedGroupIds.length} group${selectedGroupIds.length === 1 ? "" : "s"} selected` : "Select Groups"}</span><span className="ms-2 text-[10px] text-slate-400">v</span></summary><div className="absolute start-0 top-11 z-50 max-h-80 w-full overflow-y-auto rounded border border-slate-200 bg-white p-2 shadow-xl"><div className="mb-1 flex items-center justify-between border-b px-2 pb-2"><strong className="text-xs">Groups</strong><button type="button" disabled={!selectedGroupIds.length} onClick={() => onChange([])} className="text-[11px] font-semibold text-red-700 disabled:text-slate-300">Clear</button></div>{groups.length ? groups.map(group => <label key={group.groupId} className="flex cursor-pointer items-start gap-2 rounded px-2 py-2 text-xs hover:bg-slate-50"><input type="checkbox" checked={selectedGroupIds.includes(group.groupId)} onChange={() => toggle(group.groupId)} className="mt-0.5 shrink-0 accent-red-700"/><span className="whitespace-normal leading-snug">{group.groupName}</span></label>) : <p className="px-2 py-3 text-xs text-slate-500">No groups were found for this batch.</p>}</div></details><div className="mt-2 space-y-1.5" aria-live="polite">{selectedGroups.length ? selectedGroups.map(group => <div key={group.groupId} className="flex items-start justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold leading-snug text-slate-700"><span className="min-w-0 whitespace-normal">{group.groupName}</span><button type="button" aria-label={`Remove ${group.groupName}`} onClick={() => onChange(selectedGroupIds.filter(value => value !== group.groupId))} className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-white hover:text-red-700"><X size={14}/></button></div>) : <p className="text-xs text-slate-500">Selected Groups will appear here with full readable names.</p>}</div></div>;
}

function RoadmapAssignmentPreview({ unmappedCount, sameCount, conflicts, newRoadmapName }: { unmappedCount: number; sameCount: number; conflicts: Array<{ group: CertificatesData["groups"][number]; mapping: CertificatesData["batchRoadmaps"][number] | undefined }>; newRoadmapName: string }) {
  return <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><div className="font-bold">Assignment preview</div><p className="mt-1">{unmappedCount} Groups have no Roadmap. {sameCount} Groups already use this Roadmap. {conflicts.length} Groups currently use another Roadmap.</p>{conflicts.length ? <div className="mt-2 space-y-1.5"><div className="font-semibold">Confirmation required before replacing:</div>{conflicts.map(item => <div key={item.group.groupId} className="rounded border border-blue-100 bg-white/80 p-2"><div className="font-semibold">{item.group.groupName}</div><div className="text-slate-600">Current: {item.mapping?.roadmapName} · New: {newRoadmapName}</div></div>)}</div> : null}</div>;
}

function CurrentMappings({ data }: { data: CertificatesData }) {
  const active = data.batchRoadmaps.filter(mapping => mapping.isActive);
  return <Card className="p-4 xl:col-span-2"><h2 className="heading mb-3 text-base font-bold">Current Group Roadmap Mappings</h2>{!active.length ? <EmptyState title="No group-roadmap mappings have been created yet."/> : <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">{["Batch", "Group", "Roadmap", "Hours", "Version", "Status", "Actions"].map(column => <th key={column} className="px-3 py-2.5 font-bold">{column}</th>)}</tr></thead><tbody>{active.map(mapping => { const roadmap = data.roadmaps.find(item => item.roadmapId === mapping.roadmapId); const batch = data.batches.find(item => item.batchId === mapping.batchId); return <tr key={mapping.batchRoadmapId} className="border-b align-top last:border-0"><td className="px-3 py-3">{batch?.batchName ?? mapping.batchId}</td><td className="min-w-[280px] whitespace-normal px-3 py-3 font-semibold">{mapping.groupName}</td><td className="px-3 py-3">{mapping.roadmapName}</td><td className="px-3 py-3">{roadmap?.creditHours ?? "—"}</td><td className="px-3 py-3">{roadmap?.version ?? "—"}</td><td className="px-3 py-3"><StatusBadge tone="success">Active</StatusBadge></td><td className="px-3 py-3 text-xs text-slate-500">Use Assign Roadmap to Group to change</td></tr>; })}</tbody></table></div>}</Card>;
}

function RoadmapTopicsPanel({ roadmapId, items, onSaved }: { roadmapId: string; items: CertificatesData["roadmapItems"]; onSaved: () => void }) {
  const [editing, setEditing] = useState<CertificatesData["roadmapItems"][number] | null>(null);
  return <div className="mt-3 w-[360px] max-w-[80vw] rounded border border-slate-200 bg-slate-50 p-3"><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Topics</h3>{items.length ? <div className="mb-3 space-y-2">{items.map(item => <div key={item.roadmapItemId} className="rounded border bg-white p-2 text-xs"><div className="font-semibold">{item.topicTitle}</div><div className="text-slate-500">{item.sectionName} · Order {item.sortOrder ?? "—"} · {item.isActive ? "Active" : "Inactive"}</div><div className="mt-2 flex gap-2"><Button size="sm" variant="secondary" onClick={() => setEditing(item)}>Edit Topic</Button><Button size="sm" variant="danger" disabled={!item.isActive} onClick={async () => { await apiFetch("/api/certificates", { method: "POST", body: JSON.stringify({ action: "save-roadmap-item", roadmapItemId: item.roadmapItemId, roadmapId, sectionName: item.sectionName, topicTitle: item.topicTitle, sortOrder: item.sortOrder, isActive: false, notes: item.notes }) }); onSaved(); }}>Deactivate Topic</Button></div></div>)}</div> : <p className="mb-3 text-xs text-slate-500">No topics yet.</p>}<RoadmapItemForm key={editing?.roadmapItemId ?? "new-topic"} roadmapId={roadmapId} initial={editing} onDone={() => setEditing(null)} onSaved={onSaved}/></div>;
}

function RoadmapItemForm({ roadmapId, initial, onDone, onSaved }: { roadmapId: string; initial: CertificatesData["roadmapItems"][number] | null; onDone: () => void; onSaved: () => void }) {
  const [topic, setTopic] = useState(initial?.topicTitle ?? ""); const [section, setSection] = useState(initial?.sectionName ?? "Learning Topics"); const [sortOrder, setSortOrder] = useState<number | null>(initial?.sortOrder ?? null); const [isActive, setIsActive] = useState(initial?.isActive ?? true); const [notes, setNotes] = useState(initial?.notes ?? ""); const [saving, setSaving] = useState(false);
  return <div className="border-t pt-3"><div className="grid gap-2"><Field label="Section Name" value={section} onChange={event => setSection(event.target.value)}/><Field label="Topic Title" value={topic} onChange={event => setTopic(event.target.value)}/><Field label="Sort Order" type="number" min="0" value={sortOrder ?? ""} onChange={event => setSortOrder(event.target.value ? Number(event.target.value) : null)}/><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)}/>Active</label><Field label="Notes" value={notes} onChange={event => setNotes(event.target.value)}/></div><div className="mt-2 flex gap-2"><Button size="sm" variant="secondary" disabled={!topic.trim() || saving} onClick={async () => { setSaving(true); try { await apiFetch("/api/certificates", { method: "POST", body: JSON.stringify({ action: "save-roadmap-item", roadmapItemId: initial?.roadmapItemId, roadmapId, sectionName: section, topicTitle: topic, sortOrder, isActive, notes }) }); if (!initial) { setTopic(""); setNotes(""); setSortOrder(null); } onDone(); onSaved(); } finally { setSaving(false); } }}><Save size={13}/>{initial ? "Edit Topic" : "Add Topic"}</Button>{initial && <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>}</div></div>;
}

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

function exportCertificateRow(row: CertificatesData["certificates"][number]) {
  return [
    row.studentNameOnCertificate || row.studentName || "—",
    row.certificateId,
    row.certificateStatus === "ISSUED" ? "Verified" : "Revoked",
    row.certificateName || "—",
    row.issueDate || "—",
    row.university || "—",
    row.college || "—",
    row.universityStudentId || "—",
    row.track || "—",
    `${row.creditHours} H`,
    row.deliveryMode || "—",
    row.roadmapName || "—",
    row.roadmapVersion || "—",
    row.learningRoadmap || "—",
    row.completedTasks || "—",
    row.projects || "—",
    row.verificationUrl || "—",
    row.qrCodeValue || "—",
  ];
}

function createCertificatesXlsxBlob(rows: string[][]) {
  const widths = [28, 18, 20, 38, 16, 32, 28, 22, 32, 14, 18, 34, 18, 48, 36, 38, 48, 48];
  const wrapColumns = new Set([14, 15, 16]);
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${cellRef(rowIndex + 1, columnIndex + 1)}" t="inlineStr"${wrapColumns.has(columnIndex + 1) ? " s=\"1\"" : ""}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  return new Blob([zipStore([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Certificates" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>` },
    { name: "xl/worksheets/sheet1.xml", content: worksheet },
  ])], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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

function cellRef(row: number, column: number) {
  let value = column;
  let name = "";
  while (value > 0) {
    value--;
    name = String.fromCharCode(65 + value % 26) + name;
    value = Math.floor(value / 26);
  }
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
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
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

