"use client";

import { BookOpenCheck, CheckCircle2, Edit2, Eye, Plus, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { Breadcrumbs, Button, Card, EmptyState, Field, LoadingState, PageHeader, SearchInput, StatusBadge, Tabs, cn } from "@/components/ui/primitives";
import type { AssignmentInput, AssignmentResultInput, CertificateApprovalStatus, CertificateReadinessRow, GradebookRow, SubmissionStatus, TasksGradesAssignment, TasksGradesData } from "@/types/tasks-grades";

const tabs = ["Assignments", "Gradebook"];
const assignmentTypes = ["", "TASK", "PROJECT"];
const statusOptions: SubmissionStatus[] = ["NOT_SUBMITTED", "SUBMITTED", "GRADED"];
const decisions: CertificateApprovalStatus[] = ["PENDING", "APPROVED", "NOT_APPROVED"];

const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
const formatDateTime = (value: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

function dataUrl(batchId: string, assignmentId: string) {
  const params = new URLSearchParams();
  if (batchId) params.set("batchId", batchId);
  if (assignmentId) params.set("assignmentId", assignmentId);
  return `/api/academic-records${params.size ? `?${params}` : ""}`;
}

export function AcademicRecordsPage() {
  const [active, setActive] = useState(tabs[0]);
  const [batchId, setBatchId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [data, setData] = useState<TasksGradesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assignmentDialog, setAssignmentDialog] = useState<TasksGradesAssignment | "new" | null>(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await apiFetch<{ data: TasksGradesData }>(dataUrl(batchId, assignmentId));
      setData(response.data);
    } catch (requestError) {
      setError(formatClientApiError(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiFetch<{ data: TasksGradesData }>(dataUrl(batchId, assignmentId));
        if (!cancelled) {
          setData(response.data);
          setError("");
        }
      } catch (requestError) {
        if (!cancelled) setError(formatClientApiError(requestError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [batchId, assignmentId]);

  const assignments = data?.assignments ?? [];
  const selectedBatchGroups = (data?.groups ?? []).filter(group => !batchId || group.batchId === batchId);
  const assignmentsForBatch = assignments.filter(assignment => (!batchId || assignment.batchId === batchId) && (active !== "Gradebook" || assignment.isActive));

  return <><PageHeader eyebrow="Internal Operations" title="Tasks & Grades" description="Manage assignments and student gradebook entries." actions={<Button onClick={() => setAssignmentDialog("new")}><Plus size={15}/>Add Assignment</Button>}/><Card className="overflow-hidden"><Tabs tabs={tabs} active={active} onChange={setActive}/><div className="border-b bg-slate-50/70 p-4"><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5"><SelectField labelText="Batch" value={batchId} onChange={value => { setBatchId(value); setAssignmentId(""); }} options={(data?.batches ?? []).map(batch => ({ value: batch.batchId, label: `${batch.batchName} (${batch.batchId})` }))}/>{active === "Gradebook" && <SelectField labelText="Assignment" value={assignmentId} onChange={setAssignmentId} disabled={!batchId} options={assignmentsForBatch.map(assignment => ({ value: assignment.assignmentId, label: `${assignment.title} (${assignment.assignmentType})` }))}/>}<Button variant="secondary" onClick={() => { setBatchId(""); setAssignmentId(""); }} className="self-end">Reset Filters</Button></div></div>{loading ? <LoadingState/> : error ? <InlineError message={error}/> : !data ? <EmptyState/> : !data.schemaReady ? <SchemaWarning/> : <div className="p-4">{active === "Assignments" && <AssignmentsTab batchId={batchId} assignments={assignments} groups={selectedBatchGroups} onEdit={setAssignmentDialog}/>} {active === "Gradebook" && <GradebookTab batchId={batchId} assignmentId={assignmentId} assignment={assignments.find(item => item.assignmentId === assignmentId)} rows={data.gradebookRows} onSaved={load}/>}</div>}</Card>{assignmentDialog && data && <AssignmentDialog initial={assignmentDialog === "new" ? null : assignmentDialog} batches={data.batches} groups={data.groups} defaultBatchId={batchId} onClose={() => setAssignmentDialog(null)} onSaved={() => { setAssignmentDialog(null); void load(); }}/>}</>;
}

function SchemaWarning() {
  return <div className="p-5"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><div className="font-bold">Tasks & Grades storage is not configured yet.</div><p className="mt-1 text-xs">The module code is ready, but the required Google Sheets schema must be applied: Assignments, Assignment_Groups, Assignment_Results, and Certificate_Eligibility.</p></div></div>;
}

function InlineError({ message }: { message: string }) {
  return <div className="m-5 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>;
}

function SelectField({ labelText, value, onChange, options, disabled = false, placeholder }: { labelText: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean; placeholder?: string }) {
  return <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">{labelText}</span><select value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"><option value="">{placeholder ?? `All ${labelText}`}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function AssignmentsTab({ batchId, assignments, groups, onEdit }: { batchId: string; assignments: TasksGradesAssignment[]; groups: TasksGradesData["groups"]; onEdit: (assignment: TasksGradesAssignment) => void }) {
  const [type, setType] = useState("");
  const [groupId, setGroupId] = useState("");
  const [required, setRequired] = useState("");
  const [active, setActive] = useState("");
  const [search, setSearch] = useState("");
  const filtered = assignments.filter(assignment => (!batchId || assignment.batchId === batchId) && (!type || assignment.assignmentType === type) && (!groupId || assignment.groupIds.includes(groupId)) && (!required || String(assignment.requiredForCertificate) === required) && (!active || String(assignment.isActive) === active) && (!search.trim() || `${assignment.assignmentId} ${assignment.title}`.toLowerCase().includes(search.trim().toLowerCase())));
  return <div className="space-y-4">{!batchId && <EmptyState title="Select a batch to manage assignments." detail="Batch is the primary Tasks & Grades filter."/>}<div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><SelectField labelText="Assignment Type" value={type} onChange={setType} options={assignmentTypes.filter(Boolean).map(value => ({ value, label: label(value) }))}/><SelectField labelText="Group" value={groupId} onChange={setGroupId} options={groups.map(group => ({ value: group.groupId, label: group.groupName }))}/><SelectField labelText="Required" value={required} onChange={setRequired} options={[{ value: "true", label: "Required" }, { value: "false", label: "Optional" }]}/><SelectField labelText="Active Status" value={active} onChange={setActive} options={[{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }]}/><SearchInput className="xl:col-span-2" value={search} onChange={setSearch} placeholder="Search by title or Assignment ID"/></div>{batchId && !filtered.length ? <EmptyState title="No tasks or projects have been created for this batch."/> : <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[1260px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">{["Assignment ID", "Type", "Title", "Batch", "Groups", "Level", "Max Grade", "Required", "Verification", "Status", "Actions"].map(column => <th key={column} className="px-3 py-2.5 font-bold">{column}</th>)}</tr></thead><tbody>{filtered.map(assignment => <tr key={assignment.assignmentId} className="border-b last:border-0 align-top"><td className="px-3 py-3 font-mono text-xs">{assignment.assignmentId}</td><td className="px-3 py-3"><StatusBadge tone={assignment.assignmentType === "PROJECT" ? "info" : "neutral"}>{assignment.assignmentType}</StatusBadge></td><td className="px-3 py-3 font-semibold">{assignment.title}</td><td className="px-3 py-3">{assignment.batchId}</td><td className="max-w-sm px-3 py-3"><div className="flex flex-col items-start gap-1.5">{assignment.groupNames.length ? assignment.groupNames.map(groupName => <span key={groupName} className="w-full max-w-full whitespace-normal break-words rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold leading-snug text-slate-700">{groupName}</span>) : <span className="text-slate-500">—</span>}</div></td><td className="px-3 py-3">{assignment.levelCode || "—"}</td><td className="px-3 py-3">{assignment.maxGrade ?? "—"}</td><td className="px-3 py-3"><StatusBadge tone={assignment.requiredForCertificate ? "warning" : "neutral"}>{assignment.requiredForCertificate ? "Required" : "Optional"}</StatusBadge></td><td className="px-3 py-3"><div className="flex flex-col items-start gap-1"><StatusBadge tone={assignment.showOnVerification ? "success" : "neutral"}>{assignment.showOnVerification ? "Shown" : "Hidden"}</StatusBadge><span className="text-[11px] text-slate-500">Order {assignment.verificationOrder ?? "—"}</span></div></td><td className="px-3 py-3"><StatusBadge>{assignment.isActive ? "Active" : "Inactive"}</StatusBadge></td><td className="px-3 py-3"><Button size="sm" variant="secondary" onClick={() => onEdit(assignment)}><Edit2 size={13}/>Edit</Button></td></tr>)}</tbody></table></div>}</div>;
}

function GradebookTab({ batchId, assignmentId, assignment, rows, onSaved }: { batchId: string; assignmentId: string; assignment?: TasksGradesAssignment; rows: GradebookRow[]; onSaved: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, AssignmentResultInput>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ assignmentId: "", search: "", status: "", university: "", groupId: "" });
  const activeFilters = filters.assignmentId === assignmentId ? filters : { assignmentId, search: "", status: "", university: "", groupId: "" };
  const setFilter = (patch: Partial<typeof filters>) => setFilters(current => ({ ...(current.assignmentId === assignmentId ? current : { assignmentId, search: "", status: "", university: "", groupId: "" }), ...patch, assignmentId }));
  const update = (row: GradebookRow, patch: Partial<AssignmentResultInput>) => setDrafts(current => {
    const existing = current[row.enrollmentId]?.assignmentId === assignmentId ? current[row.enrollmentId] : undefined;
    return { ...current, [row.enrollmentId]: { assignmentId: existing?.assignmentId ?? assignmentId, enrollmentId: existing?.enrollmentId ?? row.enrollmentId, submissionStatus: existing?.submissionStatus ?? row.submissionStatus, grade: existing?.grade ?? row.grade, notes: existing?.notes ?? row.notes, ...patch } };
  });
  const updateGrade = (row: GradebookRow, rawGrade: string) => {
    const grade = rawGrade === "" ? null : Number(rawGrade);
    update(row, { grade, submissionStatus: grade === null ? "NOT_SUBMITTED" : "GRADED" });
  };
  const activeDrafts = Object.fromEntries(Object.entries(drafts).filter(([, value]) => value.assignmentId === assignmentId));
  const merged = (row: GradebookRow) => ({ submissionStatus: activeDrafts[row.enrollmentId]?.submissionStatus ?? row.submissionStatus, grade: activeDrafts[row.enrollmentId]?.grade ?? row.grade, notes: activeDrafts[row.enrollmentId]?.notes ?? row.notes });
  const universityOptions = [...new Set(rows.map(row => row.university).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const groupOptions = [...new Map(rows.flatMap(row => row.groupId && row.groupName ? [[row.groupId, row.groupName] as const] : [])).entries()].sort((left, right) => left[1].localeCompare(right[1]) || left[0].localeCompare(right[0]));
  const filteredRows = rows.filter(row => {
    const value = merged(row);
    return (!activeFilters.university || row.university === activeFilters.university) && (!activeFilters.groupId || row.groupId === activeFilters.groupId) && (!activeFilters.status || value.submissionStatus === activeFilters.status) && (!activeFilters.search.trim() || `${row.studentName} ${row.academyStudentId} ${row.universityStudentId} ${row.studentEmail}`.toLowerCase().includes(activeFilters.search.trim().toLowerCase()));
  });
  const clearLocalFilters = () => setFilters(current => ({ ...current, assignmentId, search: "", university: "", groupId: "", status: "" }));
  const save = async () => {
    setSaving(true); setError("");
    try {
      await apiFetch("/api/academic-records", { method: "POST", body: JSON.stringify({ action: "save-results", assignmentId, results: Object.values(activeDrafts) }) });
      setDrafts({}); onSaved();
    } catch (requestError) { setError(formatClientApiError(requestError)); }
    finally { setSaving(false); }
  };
  if (!batchId) return <EmptyState title="Select a batch first."/>;
  if (!assignmentId) return <EmptyState title="Select an assignment to view student submissions and grades."/>;
  if (assignment && !assignment.groupIds.length) return <EmptyState title="This assignment is not mapped to any active groups."/>;
  if (!rows.length) return <EmptyState title="No enrolled students are mapped to this assignment."/>;
  return <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="text-sm text-slate-600"><strong>{assignment?.title}</strong> · Max Grade: {assignment?.maxGrade ?? "—"}</div><Button disabled={!Object.keys(activeDrafts).length || saving} onClick={save}><Save size={14}/>{saving ? "Saving..." : `Save Changes (${Object.keys(activeDrafts).length})`}</Button></div><div className="rounded border border-slate-200 bg-slate-50/70 p-3"><div className="grid gap-3 lg:grid-cols-4"><div className="lg:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Search Students</span><SearchInput value={activeFilters.search} onChange={value => setFilter({ search: value })} placeholder="Search students"/></div><SelectField labelText="University" placeholder="All Universities" value={activeFilters.university} onChange={value => setFilter({ university: value })} options={universityOptions.map(value => ({ value, label: value }))}/><SelectField labelText="Status" placeholder="All Status" value={activeFilters.status} onChange={value => setFilter({ status: value })} options={statusOptions.map(option => ({ value: option, label: label(option) }))}/><div className="lg:col-span-3"><SelectField labelText="Group" placeholder="All Groups" value={activeFilters.groupId} onChange={value => setFilter({ groupId: value })} options={groupOptions.map(([value, name]) => ({ value, label: name }))}/></div><div className="flex items-end"><Button variant="secondary" className="w-full" disabled={!activeFilters.search && !activeFilters.university && !activeFilters.groupId && !activeFilters.status} onClick={clearLocalFilters}>Clear Filters</Button></div></div></div>{error && <InlineError message={error}/>} {!filteredRows.length ? <EmptyState title="No students match the selected filters."/> : <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[1560px] table-fixed text-sm"><thead><tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">{["Student", "Student Email", "University ID", "University", "Group", "Status", "Grade", "Max Grade", "Notes", "Last Updated"].map(column => <th key={column} className="px-3 py-3 font-semibold">{column}</th>)}</tr></thead><tbody>{filteredRows.map(row => { const value = merged(row); const dirty = Boolean(activeDrafts[row.enrollmentId]); return <tr key={row.enrollmentId} className={cn("border-b align-middle last:border-0", dirty && "bg-amber-50/40")}><td className="w-[230px] px-3 py-3"><div dir="auto" className="whitespace-normal break-words text-sm font-semibold leading-snug text-slate-900">{row.studentName}</div><div className="mt-1 whitespace-nowrap font-mono text-[11px] text-slate-500">{row.academyStudentId}</div></td><td className="w-[230px] px-3 py-3 text-xs lowercase text-slate-600"><span className="block truncate" title={row.studentEmail}>{row.studentEmail || "—"}</span></td><td className="w-[130px] whitespace-nowrap px-3 py-3 text-sm text-slate-700">{row.universityStudentId || "—"}</td><td className="w-[210px] px-3 py-3 text-sm leading-snug text-slate-700">{row.university || "—"}</td><td className="w-[320px] px-3 py-3 text-sm leading-snug text-slate-700">{row.groupName}</td><td className="w-[135px] px-3 py-3"><div className="flex flex-col items-start gap-1">{dirty && <StatusBadge tone="warning">Unsaved</StatusBadge>}<StatusBadge tone={value.submissionStatus === "GRADED" ? "success" : value.submissionStatus === "SUBMITTED" ? "info" : "neutral"}>{label(value.submissionStatus)}</StatusBadge></div></td><td className="w-[110px] px-3 py-3"><input aria-label={`Grade for ${row.studentName}`} type="number" min="0" max={row.maxGrade ?? undefined} value={value.grade ?? ""} onChange={event => updateGrade(row, event.target.value)} className="h-9 w-24 rounded border border-slate-300 bg-white px-2 text-sm focus:border-red-500"/></td><td className="w-[100px] px-3 py-3 text-sm font-semibold text-slate-700">{row.maxGrade ?? "—"}</td><td className="w-[230px] px-3 py-3"><input value={value.notes ?? ""} onChange={event => update(row, { notes: event.target.value })} className="h-9 w-full rounded border border-slate-300 px-2 text-xs focus:border-red-500"/></td><td className="w-[160px] px-3 py-3 text-xs text-slate-500">{formatDateTime(row.lastUpdated)}</td></tr>; })}</tbody></table></div>}</div>;
}

function ReadinessTab({ batchId, rows, onDetails, onSaved }: { batchId: string; rows: CertificateReadinessRow[]; onDetails: (row: CertificateReadinessRow) => void; onSaved: () => void }) {
  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState("");
  const [readiness, setReadiness] = useState("");
  const [university, setUniversity] = useState("");
  const [college, setCollege] = useState("");
  const [groupId, setGroupId] = useState("");
  const [hours, setHours] = useState("");
  const [mode, setMode] = useState("");
  const universities = [...new Set(rows.map(row => row.university).filter(Boolean))].sort();
  const colleges = [...new Set(rows.map(row => row.college).filter(Boolean))].sort();
  const groups = [...new Map(rows.map(row => [row.groupId, row.groupName])).entries()].sort((left, right) => left[1].localeCompare(right[1]));
  const hourOptions = [...new Set(rows.map(row => String(row.creditHours)).filter(Boolean))].sort((left, right) => Number(left) - Number(right));
  const modes = [...new Set(rows.map(row => row.deliveryMode).filter(Boolean))].sort();
  const filtered = rows.filter(row => (!decision || row.certificateDecision === decision) && (!readiness || row.automaticReadiness === readiness) && (!university || row.university === university) && (!college || row.college === college) && (!groupId || row.groupId === groupId) && (!hours || String(row.creditHours) === hours) && (!mode || row.deliveryMode === mode) && (!search.trim() || `${row.studentName} ${row.academyStudentId} ${row.universityStudentId}`.toLowerCase().includes(search.trim().toLowerCase())));
  if (!batchId) return <EmptyState title="Select a batch to review certificate readiness."/>;
  if (!rows.length) return <EmptyState title="No certificate-required tasks or projects are configured for this batch." detail="Readiness remains NOT CONFIGURED until applicable required assignments exist."/>;
  return <div className="space-y-4"><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4"><SearchInput value={search} onChange={setSearch} placeholder="Search students"/><SelectField labelText="University" value={university} onChange={setUniversity} options={universities.map(value => ({ value, label: value }))}/><SelectField labelText="College" value={college} onChange={setCollege} options={colleges.map(value => ({ value, label: value }))}/><SelectField labelText="Group" value={groupId} onChange={setGroupId} options={groups.map(([value, name]) => ({ value, label: name }))}/><SelectField labelText="Credit Hours" value={hours} onChange={setHours} options={hourOptions.map(value => ({ value, label: `${value}H` }))}/><SelectField labelText="Delivery Mode" value={mode} onChange={setMode} options={modes.map(value => ({ value, label: label(value) }))}/><SelectField labelText="Automatic Readiness" value={readiness} onChange={setReadiness} options={["READY", "NOT_READY", "NOT_CONFIGURED"].map(value => ({ value, label: label(value) }))}/><SelectField labelText="Certificate Decision" value={decision} onChange={setDecision} options={decisions.map(value => ({ value, label: label(value) }))}/></div><div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[1280px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">{["Student", "University", "College", "Group", "Credit Hours", "Delivery Mode", "Tasks", "Projects", "Missing", "Average Grade", "Readiness", "Certificate Decision", "Actions"].map(column => <th key={column} className="px-3 py-2.5 font-bold">{column}</th>)}</tr></thead><tbody>{filtered.map(row => <tr key={row.enrollmentId} className="border-b last:border-0"><td className="px-3 py-3"><div className="font-semibold">{row.studentName}</div><div className="font-mono text-[11px] text-slate-500">{row.academyStudentId}</div></td><td className="px-3 py-3">{row.university || "—"}</td><td className="px-3 py-3">{row.college || "—"}</td><td className="px-3 py-3">{row.groupName}</td><td className="px-3 py-3">{row.creditHours}H</td><td className="px-3 py-3">{label(row.deliveryMode)}</td><td className="px-3 py-3">{row.submittedTasks}/{row.requiredTasks}</td><td className="px-3 py-3">{row.submittedProjects}/{row.requiredProjects}</td><td className="px-3 py-3">{row.missingRequiredAssignments}</td><td className="px-3 py-3">{row.averageGradePercentage === null ? "—" : `${row.averageGradePercentage}%`}</td><td className="px-3 py-3"><StatusBadge tone={row.automaticReadiness === "READY" ? "success" : row.automaticReadiness === "NOT_READY" ? "danger" : "neutral"}>{label(row.automaticReadiness)}</StatusBadge></td><td className="px-3 py-3"><StatusBadge tone={row.certificateDecision === "APPROVED" ? "success" : row.certificateDecision === "NOT_APPROVED" ? "danger" : "warning"}>{label(row.certificateDecision)}</StatusBadge></td><td className="px-3 py-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => onDetails(row)}><Eye size={13}/>View Details</Button><DecisionButton row={row} decision="APPROVED" onSaved={onSaved}/><DecisionButton row={row} decision="NOT_APPROVED" onSaved={onSaved}/><DecisionButton row={row} decision="PENDING" onSaved={onSaved}/></div></td></tr>)}</tbody></table></div></div>;
}

function DecisionButton({ row, decision, onSaved }: { row: CertificateReadinessRow; decision: CertificateApprovalStatus; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const text = decision === "APPROVED" ? "Approve" : decision === "NOT_APPROVED" ? "Not Approved" : "Reset";
  const submit = async () => {
    const warning = decision === "APPROVED" && row.automaticReadiness === "NOT_READY" ? "\n\nThis student still has required assignments that are not submitted." : "";
    if (!window.confirm(`${text} certificate decision for ${row.studentName}?\n\nTasks: ${row.submittedTasks}/${row.requiredTasks}\nProjects: ${row.submittedProjects}/${row.requiredProjects}\nMissing: ${row.missingRequiredAssignments}\nCurrent readiness: ${label(row.automaticReadiness)}\nCurrent decision: ${label(row.certificateDecision)}\nNew decision: ${label(decision)}${warning}`)) return;
    setSaving(true);
    try {
      await apiFetch("/api/academic-records", { method: "POST", body: JSON.stringify({ action: "set-certificate-decision", enrollmentId: row.enrollmentId, decision }) });
      onSaved();
    } finally { setSaving(false); }
  };
  return <Button size="sm" variant={decision === "APPROVED" ? "primary" : "secondary"} disabled={saving || row.certificateDecision === decision} onClick={submit}>{text}</Button>;
}

function AssignmentDialog({ initial, batches, groups, defaultBatchId, onClose, onSaved }: { initial: TasksGradesAssignment | null; batches: TasksGradesData["batches"]; groups: TasksGradesData["groups"]; defaultBatchId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<AssignmentInput>({ assignmentId: initial?.assignmentId, batchId: initial?.batchId ?? defaultBatchId, assignmentType: initial?.assignmentType ?? "TASK", title: initial?.title ?? "", description: initial?.description ?? "", levelCode: initial?.levelCode ?? "", maxGrade: initial?.maxGrade ?? null, requiredForCertificate: initial?.requiredForCertificate ?? false, showOnVerification: initial?.showOnVerification ?? false, verificationOrder: initial?.verificationOrder ?? null, isActive: initial?.isActive ?? true, groupIds: initial?.groupIds ?? [], notes: initial?.notes ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const groupOptions = groups.filter(group => group.batchId === form.batchId);
  const toggleGroup = (groupId: string) => setForm(current => ({ ...current, groupIds: current.groupIds.includes(groupId) ? current.groupIds.filter(id => id !== groupId) : [...current.groupIds, groupId] }));
  const save = async () => {
    setSaving(true); setError("");
    try {
      await apiFetch("/api/academic-records", { method: "POST", body: JSON.stringify({ action: "save-assignment", ...form }) });
      onSaved();
    } catch (requestError) { setError(formatClientApiError(requestError)); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[90] bg-slate-950/40 p-4" role="dialog" aria-modal="true"><div className="mx-auto max-h-[92vh] max-w-3xl overflow-auto rounded-lg bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-4"><h2 className="heading text-lg font-bold">{initial ? "Edit Assignment" : "Add Assignment"}</h2><button aria-label="Close" onClick={onClose}><X size={18}/></button></div><div className="space-y-4 p-4"><div className="grid gap-4 md:grid-cols-2"><SelectField labelText="Batch" value={form.batchId} onChange={value => setForm(current => ({ ...current, batchId: value, groupIds: [] }))} options={batches.map(batch => ({ value: batch.batchId, label: batch.batchName }))}/><SelectField labelText="Type" value={form.assignmentType} onChange={value => setForm(current => ({ ...current, assignmentType: value as "TASK" | "PROJECT" }))} options={[{ value: "TASK", label: "Task" }, { value: "PROJECT", label: "Project" }]}/><Field label="Title" value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} required/><Field label="Level" value={form.levelCode} onChange={event => setForm(current => ({ ...current, levelCode: event.target.value }))}/><Field label="Max Grade" type="number" min="0" value={form.maxGrade ?? ""} onChange={event => setForm(current => ({ ...current, maxGrade: event.target.value ? Number(event.target.value) : null }))}/><Field label="Verification Order" type="number" min="0" value={form.verificationOrder ?? ""} onChange={event => setForm(current => ({ ...current, verificationOrder: event.target.value ? Number(event.target.value) : null }))}/><Field className="md:col-span-2" label="Description" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))}/></div><div className="grid gap-3 md:grid-cols-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requiredForCertificate} onChange={event => setForm(current => ({ ...current, requiredForCertificate: event.target.checked }))}/>Required for Certificate</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.showOnVerification} onChange={event => setForm(current => ({ ...current, showOnVerification: event.target.checked }))}/>Show on Verification</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={event => setForm(current => ({ ...current, isActive: event.target.checked }))}/>Active</label></div><section><div className="mb-2 text-xs font-semibold text-slate-700">Groups *</div><div className="grid max-h-44 gap-2 overflow-auto rounded border border-slate-200 p-3 md:grid-cols-2">{groupOptions.map(group => <label key={group.groupId} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"><input type="checkbox" checked={form.groupIds.includes(group.groupId)} onChange={() => toggleGroup(group.groupId)}/>{group.groupName}</label>)}</div></section><label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Notes</span><textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} rows={3} className="w-full rounded border border-slate-300 px-3 py-2 text-sm"/></label>{error && <InlineError message={error}/>}<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={save}><CheckCircle2 size={14}/>{saving ? "Saving..." : "Save Assignment"}</Button></div></div></div></div>;
}

function ReadinessDetails({ row, onClose }: { row: CertificateReadinessRow; onClose: () => void }) {
  return <div className="fixed inset-0 z-[90] bg-slate-950/40 p-4" role="dialog" aria-modal="true"><div className="ms-auto flex max-h-[92vh] w-full max-w-2xl flex-col overflow-auto rounded-lg bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-4"><h2 className="heading text-lg font-bold">Certificate Readiness Details</h2><button aria-label="Close" onClick={onClose}><X size={18}/></button></div><div className="space-y-5 p-4"><div className="grid gap-3 text-sm md:grid-cols-2"><Info labelText="Student" value={row.studentName}/><Info labelText="Student IDs" value={`${row.academyStudentId} · ${row.universityStudentId || "—"}`}/><Info labelText="University" value={row.university || "—"}/><Info labelText="College" value={row.college || "—"}/><Info labelText="Group" value={row.groupName}/><Info labelText="Track / Hours / Mode" value={`${row.track} · ${row.creditHours}H · ${label(row.deliveryMode)}`}/></div><AssignmentDetails title="Required Tasks" rows={row.requiredTaskDetails}/><AssignmentDetails title="Required Projects" rows={row.requiredProjectDetails}/></div></div></div>;
}

function AssignmentDetails({ title, rows }: { title: string; rows: CertificateReadinessRow["requiredTaskDetails"] }) {
  return <section><h3 className="mb-2 text-sm font-bold text-slate-900">{title}</h3>{!rows.length ? <div className="rounded border border-slate-200 p-3 text-xs text-slate-500">No applicable required items.</div> : <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">{["Title", "Status", "Grade", "Max Grade"].map(column => <th key={column} className="px-3 py-2 font-bold">{column}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.assignmentId} className={cn("border-b last:border-0", row.submissionStatus === "NOT_SUBMITTED" && "bg-red-50/50")}><td className="px-3 py-2 font-semibold">{row.title}</td><td className="px-3 py-2"><StatusBadge tone={row.submissionStatus === "NOT_SUBMITTED" ? "danger" : "success"}>{label(row.submissionStatus)}</StatusBadge></td><td className="px-3 py-2">{row.grade ?? "—"}</td><td className="px-3 py-2">{row.maxGrade ?? "—"}</td></tr>)}</tbody></table></div>}</section>;
}

function Info({ labelText, value }: { labelText: string; value: string }) {
  return <div><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{labelText}</div><div className="mt-1 font-semibold text-slate-800">{value}</div></div>;
}

export function GroupAcademicPage({ groupId }: { groupId: string }) {
  return <><Breadcrumbs items={[{ label: "Tasks & Grades", href: "/academic-records" }, { label: "Group Grades Sheet" }]}/><PageHeader title="Group Grades Sheet" description="Use the main Tasks & Grades module to select a Batch and Assignment before editing gradebook rows."/><Card className="p-6"><div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-red-50 text-red-700"><BookOpenCheck size={18}/></div><EmptyState title="Group-specific grade sheets are managed through /academic-records" detail={`Requested group reference: ${decodeURIComponent(groupId)}`}/></Card></>;
}
