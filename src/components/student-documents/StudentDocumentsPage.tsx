"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckSquare, Eye, RefreshCw, Send, XCircle } from "lucide-react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { extractGoogleDriveFileId, googleDrivePreviewUrl } from "@/lib/drive-links";
import { deliveryModeLabel } from "@/lib/delivery-mode";
import { safeDisplayText } from "@/lib/display";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, SearchInput, StatusBadge, Tabs } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/DataTable";
import type { StudentDocumentExistingRow, StudentDocumentPublishResultRow, StudentDocumentQueueRow, StudentDocumentsExistingData, StudentDocumentsFormData, StudentDocumentsQueueData } from "@/types/student-documents";

type QueueFilters = { search: string; university: string; track: string; batchId: string; groupId: string; status: string };
type ExistingFilters = { search: string; programScope: string; batchId: string; university: string; groupId: string; track: string; publishStatus: string; documentType: string };

const emptyQueueFilters: QueueFilters = { search: "", university: "", track: "", batchId: "", groupId: "", status: "" };
const emptyExistingFilters: ExistingFilters = { search: "", programScope: "", batchId: "", university: "", groupId: "", track: "", publishStatus: "", documentType: "" };

export function StudentDocumentsPage() {
  const [tab, setTab] = useState("Publish Documents");
  const [formData, setFormData] = useState<StudentDocumentsFormData>();
  const [queueData, setQueueData] = useState<StudentDocumentsQueueData>();
  const [existingData, setExistingData] = useState<StudentDocumentsExistingData>();
  const [loading, setLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(false);
  const [existingLoading, setExistingLoading] = useState(false);
  const [existingLoaded, setExistingLoaded] = useState(false);
  const [existingStale, setExistingStale] = useState(false);
  const [error, setError] = useState("");
  const [queueError, setQueueError] = useState("");
  const [existingError, setExistingError] = useState("");
  const [message, setMessage] = useState("");
  const [programScope, setProgramScope] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [queueFilters, setQueueFilters] = useState<QueueFilters>(emptyQueueFilters);
  const [existingFilters, setExistingFilters] = useState<ExistingFilters>(emptyExistingFilters);
  const [previewFileId, setPreviewFileId] = useState("");
  const [resultMessages, setResultMessages] = useState<Record<string, StudentDocumentPublishResultRow>>({});

  async function loadForm() {
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{ studentDocuments: StudentDocumentsFormData }>("/api/student-documents?mode=form");
      setFormData(result.studentDocuments);
    } catch (reason) {
      setError(formatClientApiError(reason));
    } finally {
      setLoading(false);
    }
  }

  async function loadQueue(nextProgramScope = programScope) {
    if (!nextProgramScope) {
      setQueueData(undefined);
      return;
    }
    setQueueLoading(true);
    setQueueError("");
    setMessage("");
    try {
      const result = await apiFetch<{ studentDocuments: StudentDocumentsQueueData }>(`/api/student-documents?mode=queue&programScope=${encodeURIComponent(nextProgramScope)}`);
      setQueueData(result.studentDocuments);
      setResultMessages({});
    } catch (reason) {
      setQueueError(formatClientApiError(reason));
    } finally {
      setQueueLoading(false);
    }
  }

  async function loadExisting({ force = false } = {}) {
    if (existingLoading || (existingLoaded && !existingStale && !force)) return;
    setExistingLoading(true);
    setExistingError("");
    try {
      const result = await apiFetch<{ studentDocuments: StudentDocumentsExistingData }>("/api/student-documents?mode=existing");
      setExistingData(result.studentDocuments);
      setExistingLoaded(true);
      setExistingStale(false);
    } catch (reason) {
      setExistingError(formatClientApiError(reason));
    } finally {
      setExistingLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    apiFetch<{ studentDocuments: StudentDocumentsFormData }>("/api/student-documents?mode=form")
      .then(result => { if (active) setFormData(result.studentDocuments); })
      .catch(reason => { if (active) setError(formatClientApiError(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const batches = formData?.batches ?? [];
  const groups = formData?.groups ?? [];
  const programScopes = formData?.programScopes ?? [];
  const queueRows = useMemo(() => queueData?.rows ?? [], [queueData]);
  const existing = useMemo(() => existingData?.documents ?? [], [existingData]);
  const hasDrafts = useMemo(() => Object.values(drafts).some(value => value.trim()) || selected.length > 0, [drafts, selected]);

  const filteredQueueRows = useMemo(() => queueRows.filter(row => {
    const query = queueFilters.search.trim().toLowerCase();
    const state = queueRowState(row, drafts[row.enrollmentId] ?? "");
    return (!queueFilters.university || row.university === queueFilters.university)
      && (!queueFilters.track || row.track === queueFilters.track)
      && (!queueFilters.batchId || row.batchId === queueFilters.batchId)
      && (!queueFilters.groupId || row.groupId === queueFilters.groupId)
      && (!queueFilters.status || state.status === queueFilters.status)
      && (!query || [row.studentName, row.universityStudentId, row.academyStudentId, row.enrollmentId].some(value => value.toLowerCase().includes(query)));
  }), [drafts, queueFilters, queueRows]);

  const filteredExisting = useMemo(() => existing.filter(row => {
    const query = existingFilters.search.trim().toLowerCase();
    return (!existingFilters.batchId || row.batchId === existingFilters.batchId)
      && (!existingFilters.programScope || row.programScope === existingFilters.programScope)
      && (!existingFilters.university || row.university === existingFilters.university)
      && (!existingFilters.groupId || row.groupId === existingFilters.groupId)
      && (!existingFilters.track || row.track === existingFilters.track)
      && (!existingFilters.publishStatus || row.publishStatus === existingFilters.publishStatus)
      && (!existingFilters.documentType || row.documentType === existingFilters.documentType)
      && (!query || [row.studentName, row.universityStudentId, row.academyStudentId, row.enrollmentId, row.studentDocumentId].some(value => value.toLowerCase().includes(query)));
  }), [existing, existingFilters]);

  function changeTab(next: string) {
    setTab(next);
    if (next === "Existing Documents") void loadExisting();
  }

  function changeProgramScope(next: string) {
    if (next === programScope) return;
    if (hasDrafts && !window.confirm("You have unpublished document links in this Program Scope. Changing Program Scope will clear the current draft. Continue?")) return;
    setProgramScope(next);
    setDrafts({});
    setSelected([]);
    setQueueFilters(emptyQueueFilters);
    setQueueData(undefined);
    setMessage("");
    setResultMessages({});
    if (next) void loadQueue(next);
  }

  function setDraft(enrollmentId: string, value: string) {
    setDrafts(current => ({ ...current, [enrollmentId]: value }));
    setResultMessages(current => {
      if (!current[enrollmentId]) return current;
      const next = { ...current };
      delete next[enrollmentId];
      return next;
    });
    setSelected(current => {
      const row = queueRows.find(item => item.enrollmentId === enrollmentId);
      if (!row || !queueRowReady(row, value)) return current.filter(id => id !== enrollmentId);
      return current;
    });
  }

  function toggleSelected(enrollmentId: string, checked: boolean) {
    setSelected(current => checked ? unique([...current, enrollmentId]) : current.filter(id => id !== enrollmentId));
  }

  function selectAllReady() {
    const ready = filteredQueueRows.filter(row => queueRowReady(row, drafts[row.enrollmentId] ?? "")).map(row => row.enrollmentId);
    setSelected(ready);
  }

  function clearDraftsAndFilters() {
    if (hasDrafts && !window.confirm("Clear draft links, selected rows, and filters? Published documents will not be changed.")) return;
    setDrafts({});
    setSelected([]);
    setQueueFilters(emptyQueueFilters);
    setResultMessages({});
    setMessage("");
  }

  async function publishSelected() {
    const payload = selected.flatMap(enrollmentId => {
      const row = queueRows.find(item => item.enrollmentId === enrollmentId);
      const driveUrl = drafts[enrollmentId] ?? "";
      return row && queueRowReady(row, driveUrl) ? [{ enrollmentId, driveUrl }] : [];
    });
    if (!payload.length) return;
    if (!window.confirm(`Publish ${payload.length} training forms to Student Portal?`)) return;
    setPublishing(true);
    setError("");
    setMessage("");
    try {
      const result = await apiFetch<{ result: { total: number; published: number; rows: StudentDocumentPublishResultRow[] } }>("/api/student-documents", { method: "POST", body: JSON.stringify({ action: "publish-selected", programScope, documents: payload }) });
      const resultMap = Object.fromEntries(result.result.rows.map(row => [row.enrollmentId, row]));
      const publishedIds = new Set(result.result.rows.filter(row => row.status === "PUBLISHED").map(row => row.enrollmentId));
      setResultMessages(resultMap);
      setDrafts(current => Object.fromEntries(Object.entries(current).filter(([enrollmentId]) => !publishedIds.has(enrollmentId))));
      setSelected(current => current.filter(enrollmentId => !publishedIds.has(enrollmentId)));
      setExistingStale(true);
      setMessage(`Published ${result.result.published} of ${result.result.total} selected documents.`);
      await loadQueue(programScope);
    } catch (reason) {
      setError(formatClientApiError(reason));
    } finally {
      setPublishing(false);
    }
  }

  async function setStatus(row: StudentDocumentExistingRow, publishStatus: "PUBLISHED" | "HIDDEN") {
    const verb = publishStatus === "PUBLISHED" ? "publish" : "unpublish";
    if (!window.confirm(`${verb[0].toUpperCase()}${verb.slice(1)} ${row.documentTitle}?`)) return;
    await apiFetch("/api/student-documents", { method: "POST", body: JSON.stringify({ action: "set-status", studentDocumentId: row.studentDocumentId, publishStatus }) });
    setExistingStale(true);
    await loadExisting({ force: true });
  }

  const queueColumns: Column<StudentDocumentQueueRow>[] = [
    { key: "publish", header: "Publish", cell: row => {
      const ready = queueRowReady(row, drafts[row.enrollmentId] ?? "");
      return <input type="checkbox" aria-label={`Select ${row.studentName}`} checked={selected.includes(row.enrollmentId)} disabled={!ready || publishing} onChange={event => toggleSelected(row.enrollmentId, event.target.checked)} className="size-4 accent-red-700"/>;
    } },
    { key: "student", header: "Student", className: "min-w-[240px]", cell: row => <div><strong>{safeDisplayText(row.studentName)}</strong><div className="text-xs text-slate-500">{safeDisplayText(row.universityStudentId)} · {safeDisplayText(row.academyStudentId)}</div><div className="text-[11px] text-slate-400">{safeDisplayText(row.enrollmentId)}</div></div> },
    { key: "university", header: "University", className: "min-w-[160px]", cell: row => safeDisplayText(row.university, "—") },
    { key: "track", header: "Track", className: "min-w-[160px]", cell: row => safeDisplayText(row.track, "—") },
    { key: "batch", header: "Batch", cell: row => safeDisplayText(row.batchName || row.batchId, "—") },
    { key: "group", header: "Group", className: "min-w-[180px]", cell: row => safeDisplayText(row.groupName || row.groupId, "—") },
    { key: "hours", header: "Credit Hours", cell: row => safeDisplayText(row.creditHours, "—") },
    { key: "mode", header: "Delivery Mode", cell: row => <StatusBadge>{deliveryModeLabel(row.deliveryMode)}</StatusBadge> },
    { key: "status", header: "Document Status", cell: row => {
      const state = queueRowState(row, drafts[row.enrollmentId] ?? "");
      return <div className="flex min-w-32 flex-col items-start gap-1"><StatusBadge tone={state.tone}>{state.label}</StatusBadge>{resultMessages[row.enrollmentId] ? <span className="text-[11px] text-slate-500">{safeDisplayText(resultMessages[row.enrollmentId].message)}</span> : null}</div>;
    } },
    { key: "drive", header: "Drive PDF", className: "min-w-[280px]", cell: row => {
      const disabled = row.existingStatus !== "NONE";
      return <input disabled={disabled} value={drafts[row.enrollmentId] ?? ""} onChange={event => setDraft(row.enrollmentId, event.target.value)} placeholder={disabled ? "Already published" : "Paste Google Drive PDF link"} className="h-9 w-full rounded border border-slate-300 bg-white px-3 text-xs disabled:bg-slate-100 disabled:text-slate-400"/>;
    } },
    { key: "preview", header: "Preview", cell: row => {
      const fileId = extractGoogleDriveFileId(drafts[row.enrollmentId] ?? "");
      return fileId ? <Button size="sm" variant="secondary" onClick={() => setPreviewFileId(fileId)}><Eye size={13}/>Preview</Button> : <span className="text-xs text-slate-400">—</span>;
    } },
  ];

  const existingColumns: Column<StudentDocumentExistingRow>[] = [
    { key: "student", header: "Student", className: "min-w-[220px]", cell: row => <div><strong>{safeDisplayText(row.studentName)}</strong><div className="text-xs text-slate-500">{safeDisplayText(row.universityStudentId)} | {safeDisplayText(row.academyStudentId)}</div></div> },
    { key: "programScope", header: "Program Scope", cell: row => safeDisplayText(row.programScope, "—") },
    { key: "university", header: "University", cell: row => safeDisplayText(row.university) },
    { key: "track", header: "Track", cell: row => safeDisplayText(row.track, "—") },
    { key: "batch", header: "Batch", cell: row => safeDisplayText(row.batchName || row.batchId) },
    { key: "group", header: "Group", className: "min-w-[180px]", cell: row => safeDisplayText(row.groupName || row.groupId) },
    { key: "type", header: "Document Type", cell: row => row.documentTypeLabel },
    { key: "title", header: "Title", className: "min-w-[220px]", cell: row => row.documentTitle },
    { key: "status", header: "Status", cell: row => <StatusBadge tone={row.publishStatus === "PUBLISHED" ? "success" : "neutral"}>{statusLabel(row.publishStatus)}</StatusBadge> },
    { key: "published", header: "Published At", cell: row => row.publishedAt || "—" },
    { key: "file", header: "File Status", cell: row => <StatusBadge tone={row.fileId ? "success" : "warning"}>{row.fileStatus}</StatusBadge> },
    { key: "actions", header: "Actions", cell: row => <div className="flex flex-wrap gap-2">{row.fileId ? <Button size="sm" variant="secondary" onClick={() => setPreviewFileId(row.fileId)}><Eye size={13}/>Preview</Button> : null}{row.publishStatus === "PUBLISHED" ? <Button size="sm" variant="danger" onClick={() => void setStatus(row, "HIDDEN")}>Unpublish</Button> : <Button size="sm" onClick={() => void setStatus(row, "PUBLISHED")}>Publish</Button>}</div> },
  ];

  if (loading) return <><PageHeader eyebrow="Student Documents" title="Student Documents" description="Distribute official student-specific documents through the Student Portal."/><Card><LoadingState/></Card></>;
  if (error && !formData) return <><PageHeader eyebrow="Student Documents" title="Student Documents"/><ErrorState/><Card className="p-3 text-sm text-red-700">{safeDisplayText(error)}</Card></>;

  return <><PageHeader eyebrow="Student Documents" title="Student Documents" description="Distribute official student-specific documents through the Student Portal." actions={<Button variant="secondary" onClick={() => tab === "Existing Documents" ? void loadExisting({ force: true }) : programScope ? void loadQueue(programScope) : void loadForm()}><RefreshCw size={14}/>Refresh</Button>}/>
    <Card className="overflow-hidden">
      <Tabs tabs={["Publish Documents", "Existing Documents"]} active={tab} onChange={changeTab}/>
      {tab === "Publish Documents" ? <div className="space-y-5 p-5">
        {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{safeDisplayText(error)}</div> : null}
        {message ? <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{safeDisplayText(message)}</div> : null}
        <section className="grid gap-4 lg:grid-cols-[minmax(260px,420px)_1fr]">
          <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Program Scope</span><select className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm" value={programScope} onChange={event => changeProgramScope(event.target.value)}><option value="">Select Program Scope</option>{programScopes.map(value => <option key={value} value={value}>{safeDisplayText(value)}</option>)}</select></label>
          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><strong className="block text-slate-800">Training Form defaults</strong>Type: Training Form · Provider: GoogleDrive · Publish Status: PUBLISHED · Active: TRUE</div>
        </section>
        {!programScope ? <EmptyState title="Select a Program Scope" detail="Choose a Program Scope to load its registered enrollment rows."/> : queueLoading ? <Card><LoadingState/></Card> : queueError ? <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">{safeDisplayText(queueError)}</div> : <section className="space-y-4">
          <div className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-5">
            <SearchInput className="md:col-span-2" value={queueFilters.search} onChange={search => setQueueFilters(current => ({ ...current, search }))} placeholder="Search student name, University ID, Academy ID, or Enrollment"/>
            <SelectFilter label="University" value={queueFilters.university} onChange={university => setQueueFilters(current => ({ ...current, university }))} options={unique(queueRows.map(row => row.university))}/>
            <SelectFilter label="Track" value={queueFilters.track} onChange={track => setQueueFilters(current => ({ ...current, track }))} options={unique(queueRows.map(row => row.track))}/>
            <SelectFilter label="Batch" value={queueFilters.batchId} onChange={batchId => setQueueFilters(current => ({ ...current, batchId }))} options={uniqueOptions(queueRows.map(row => ({ value: row.batchId, label: row.batchName || row.batchId })))}/>
            <SelectFilter label="Group" value={queueFilters.groupId} onChange={groupId => setQueueFilters(current => ({ ...current, groupId }))} options={uniqueOptions(queueRows.map(row => ({ value: row.groupId, label: row.groupName || row.groupId })))}/>
            <select className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" value={queueFilters.status} onChange={event => setQueueFilters(current => ({ ...current, status: event.target.value }))}><option value="">All Document Statuses</option><option value="NO_FILE">No File</option><option value="INVALID_LINK">Invalid Link</option><option value="READY">Ready</option><option value="PUBLISHED">Published</option><option value="ALREADY_EXISTS">Already Exists</option></select>
          </div>
          <div className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-3 lg:flex-row lg:items-center">
            <div className="text-sm font-semibold text-slate-700">{filteredQueueRows.length} of {queueRows.length} students in this Program Scope{selected.length ? ` · ${selected.length} selected` : ""}</div>
            <div className="flex flex-wrap gap-2 lg:ms-auto"><Button type="button" variant="secondary" onClick={selectAllReady}><CheckSquare size={14}/>Select All Ready</Button><Button type="button" variant="secondary" onClick={() => setSelected([])}><XCircle size={14}/>Clear Selection</Button><Button type="button" variant="ghost" onClick={clearDraftsAndFilters}>Clear Drafts & Filters</Button><Button type="button" disabled={!selected.length || publishing} onClick={() => void publishSelected()}><Send size={14}/>{publishing ? "Publishing..." : `Publish Selected (${selected.length})`}</Button></div>
          </div>
          {filteredQueueRows.length ? <DataTable rows={filteredQueueRows} columns={queueColumns} getKey={row => row.enrollmentId}/> : <EmptyState title="No students match the current filters." detail="Adjust filters or search terms."/>}
        </section>}
      </div> : <div>
        <div className="grid gap-3 border-b bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-8">
          <SearchInput className="md:col-span-2" value={existingFilters.search} onChange={search => setExistingFilters(current => ({ ...current, search }))} placeholder="Search student, ID, enrollment, or document ID"/>
          <select className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" value={existingFilters.programScope} onChange={event => setExistingFilters(current => ({ ...current, programScope: event.target.value }))}><option value="">All Program Scopes</option>{unique(existing.map(row => row.programScope)).map(value => <option key={value} value={value}>{value}</option>)}</select>
          <select className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" value={existingFilters.batchId} onChange={event => setExistingFilters(current => ({ ...current, batchId: event.target.value }))}><option value="">All Batches</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{batch.name}</option>)}</select>
          <select className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" value={existingFilters.groupId} onChange={event => setExistingFilters(current => ({ ...current, groupId: event.target.value }))}><option value="">All Groups</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
          <select className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" value={existingFilters.university} onChange={event => setExistingFilters(current => ({ ...current, university: event.target.value }))}><option value="">All Universities</option>{unique(existing.map(row => row.university)).map(value => <option key={value} value={value}>{value}</option>)}</select>
          <select className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" value={existingFilters.track} onChange={event => setExistingFilters(current => ({ ...current, track: event.target.value }))}><option value="">All Tracks</option>{unique(existing.map(row => row.track)).map(value => <option key={value} value={value}>{value}</option>)}</select>
          <select className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" value={existingFilters.publishStatus} onChange={event => setExistingFilters(current => ({ ...current, publishStatus: event.target.value }))}><option value="">All Publish Statuses</option><option value="PUBLISHED">Published</option><option value="HIDDEN">Hidden</option><option value="DRAFT">Draft</option></select>
        </div>
        <div className="flex justify-end border-b p-3"><Button variant="secondary" onClick={() => void loadExisting({ force: true })}><RefreshCw size={14}/>Refresh Existing</Button></div>
        {existingLoading ? <LoadingState/> : existingError ? <div className="p-4"><ErrorState/><p className="mt-2 text-sm text-red-700">{safeDisplayText(existingError)}</p></div> : filteredExisting.length ? <DataTable rows={filteredExisting} columns={existingColumns} getKey={row => row.studentDocumentId}/> : <EmptyState title="No documents found" detail="Publish documents or adjust filters."/>}
      </div>}
      {previewFileId ? <div className="border-t p-4"><div className="mb-2 flex items-center justify-between"><strong className="text-sm">Document Preview</strong><Button size="sm" variant="ghost" onClick={() => setPreviewFileId("")}>Close</Button></div><iframe className="h-[70vh] w-full rounded border bg-white" src={googleDrivePreviewUrl(previewFileId)} title="Student document preview" allow="fullscreen" allowFullScreen/></div> : null}
    </Card>
  </>;
}

function queueRowState(row: StudentDocumentQueueRow, draftUrl: string) {
  if (row.existingStatus === "PUBLISHED") return { status: "PUBLISHED", label: "Published", tone: "success" as const };
  if (row.existingStatus === "ALREADY_EXISTS") return { status: "ALREADY_EXISTS", label: "Already Exists", tone: "warning" as const };
  if (!draftUrl.trim()) return { status: "NO_FILE", label: "No File", tone: "neutral" as const };
  if (!extractGoogleDriveFileId(draftUrl)) return { status: "INVALID_LINK", label: "Invalid Drive Link", tone: "danger" as const };
  return { status: "READY", label: "Ready", tone: "success" as const };
}

function queueRowReady(row: StudentDocumentQueueRow, draftUrl: string) {
  return queueRowState(row, draftUrl).status === "READY";
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

function unique(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function uniqueOptions(values: Array<{ value: string; label: string }>) {
  const map = new Map<string, string>();
  for (const option of values) {
    if (!option.value.trim()) continue;
    if (!map.has(option.value)) map.set(option.value, option.label);
  }
  return [...map.entries()].map(([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label));
}

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] | Array<{ value: string; label: string }> }) {
  const normalized = options.map(option => typeof option === "string" ? { value: option, label: option } : option);
  return <label className="block"><span className="sr-only">{label}</span><select value={value} onChange={event => onChange(event.target.value)} aria-label={label} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm"><option value="">All {label}s</option>{normalized.map(option => <option key={option.value} value={option.value}>{safeDisplayText(option.label)}</option>)}</select></label>;
}
