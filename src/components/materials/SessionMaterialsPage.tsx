"use client";

import { type FormEvent, useEffect, useState } from "react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { safeDisplayText } from "@/lib/display";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/overlays";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, SearchInput, Select, StatusBadge, Tabs } from "@/components/ui/primitives";
import type { SessionMaterialDto, SessionMaterialsData, SessionMaterialsExistingData, SessionMaterialsFormData } from "@/types/session-materials";

type MaterialForm = {
  materialId: string;
  batchId: string;
  attendanceSessionId: string;
  materialTitle: string;
  materialType: "PDF" | "Presentation" | "Doc" | "Sheet" | "Other";
  provider: "GoogleDrive";
  fileUrl: string;
  fileId: string;
  sessionNumber: string;
  levelCode: string;
  publishStatus: "Draft" | "Published" | "Hidden";
  availableFrom: string;
  availableTo: string;
  isActive: boolean;
  notes: string;
  groupIds: string[];
};

const emptyMaterialForm: MaterialForm = { materialId: "", batchId: "", attendanceSessionId: "", materialTitle: "", materialType: "PDF", provider: "GoogleDrive", fileUrl: "", fileId: "", sessionNumber: "", levelCode: "", publishStatus: "Draft", availableFrom: "", availableTo: "", isActive: true, notes: "", groupIds: [] };

export function SessionMaterialsPage() {
  const { showToast } = useToast();
  const [activeContentTab, setActiveContentTab] = useState("Add New");
  const [formData, setFormData] = useState<SessionMaterialsFormData>();
  const [existingData, setExistingData] = useState<SessionMaterialsExistingData>();
  const [loading, setLoading] = useState(true);
  const [existingLoading, setExistingLoading] = useState(false);
  const [existingLoaded, setExistingLoaded] = useState(false);
  const [existingStale, setExistingStale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existingError, setExistingError] = useState("");
  const [form, setForm] = useState<MaterialForm>(emptyMaterialForm);
  const [filters, setFilters] = useState({ batchId: "", groupId: "", publishStatus: "", levelCode: "", materialType: "", search: "" });

  const loadExistingData = async ({ force = false } = {}) => {
    if (existingLoading || (existingLoaded && !existingStale && !force)) return;
    setExistingLoading(true);
    setExistingError("");
    try {
      const result = await apiFetch<{ sessionMaterials: SessionMaterialsExistingData }>("/api/attendance/session-materials?mode=existing");
      setExistingData(result.sessionMaterials);
      setExistingLoaded(true);
      setExistingStale(false);
    } catch (reason) {
      setExistingError(formatClientApiError(reason));
    } finally {
      setExistingLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    apiFetch<{ sessionMaterials: SessionMaterialsFormData }>("/api/attendance/session-materials?mode=form").then(result => {
      if (active) setFormData(result.sessionMaterials);
    }).catch(reason => {
      if (active) setError(formatClientApiError(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  function changeContentTab(tab: string) {
    setActiveContentTab(tab);
    if (tab === "Existing") queueMicrotask(() => void loadExistingData());
  }

  const sessions = formData?.sessions ?? [];
  const batches = formData?.batches ?? [];
  const groups = formData?.groups ?? [];
  const materials = existingData?.materials ?? [];
  const selectedSession = sessions.find(session => session.id === form.attendanceSessionId);
  const filteredSessionOptions = sessions.filter(session => !form.batchId || session.batchId === form.batchId);
  const groupOptions = groups.filter(group => !form.batchId || group.batchId === form.batchId);
  const filteredMaterials = materials.filter(material => {
    const session = sessions.find(item => item.id === material.attendanceSessionId);
    const query = filters.search.trim().toLowerCase();
    return (!filters.batchId || session?.batchId === filters.batchId)
      && (!filters.groupId || material.groupIds.includes(filters.groupId))
      && (!filters.publishStatus || material.publishStatus === filters.publishStatus)
      && (!filters.levelCode || material.levelCode === filters.levelCode)
      && (!filters.materialType || material.materialType === filters.materialType)
      && (!query || [material.materialTitle, material.fileId, material.attendanceCode, material.attendanceSessionId].some(value => value.toLowerCase().includes(query)));
  });

  const columns: Column<SessionMaterialDto>[] = [
    { key: "id", header: "Material ID", cell: row => <span className="font-mono text-xs">{safeDisplayText(row.id, "-")}</span> },
    { key: "title", header: "Material Title", cell: row => safeDisplayText(row.materialTitle, "-") },
    { key: "session", header: "Attendance Session ID", cell: row => safeDisplayText(row.attendanceSessionId, "-") },
    { key: "number", header: "Session Number", cell: row => safeDisplayText(row.sessionNumber, "-") },
    { key: "level", header: "Level Code", cell: row => safeDisplayText(row.levelCode, "-") },
    { key: "type", header: "Material Type", cell: row => safeDisplayText(row.materialType, "-") },
    { key: "provider", header: "Provider", cell: row => safeDisplayText(row.provider, "-") },
    { key: "publish", header: "Publish Status", cell: row => <StatusBadge>{row.publishStatus}</StatusBadge> },
    { key: "active", header: "Is Active", cell: row => <StatusBadge>{row.isActive}</StatusBadge> },
    { key: "from", header: "Available From", cell: row => safeDisplayText(row.availableFrom, "-") },
    { key: "to", header: "Available To", cell: row => safeDisplayText(row.availableTo, "-") },
    { key: "groups", header: "Access Groups Count", cell: row => String(row.accessGroupsCount) },
    { key: "edit", header: "Edit", cell: row => <Button size="sm" variant="secondary" onClick={() => editMaterial(row)}>Edit</Button> },
  ];

  function updateForm(patch: Partial<MaterialForm>) {
    setForm(current => ({ ...current, ...patch }));
  }

  function chooseSession(attendanceSessionId: string) {
    const session = sessions.find(item => item.id === attendanceSessionId);
    updateForm({
      attendanceSessionId,
      batchId: session?.batchId || form.batchId,
      sessionNumber: session?.sessionNumber || form.sessionNumber,
      levelCode: session?.levelCode || form.levelCode,
      materialTitle: form.materialTitle || (session ? `${session.track || session.sessionTitle || session.attendanceCode} - Session ${session.sessionNumber || ""} Material`.replace(/\s+/g, " ").trim() : ""),
    });
  }

  function editMaterial(row: SessionMaterialDto) {
    const session = sessions.find(item => item.id === row.attendanceSessionId);
    setForm({ materialId: row.id, batchId: session?.batchId || "", attendanceSessionId: row.attendanceSessionId, materialTitle: row.materialTitle, materialType: normalizeMaterialType(row.materialType), provider: "GoogleDrive", fileUrl: row.fileUrl, fileId: row.fileId, sessionNumber: row.sessionNumber, levelCode: row.levelCode, publishStatus: normalizePublishStatus(row.publishStatus), availableFrom: row.availableFrom, availableTo: row.availableTo, isActive: row.isActive.trim().toLowerCase() !== "false", notes: row.notes, groupIds: row.groupIds });
    setActiveContentTab("Add New");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const fileId = form.fileId.trim() || extractGoogleDriveFileId(form.fileUrl);
      const result = await apiFetch<{ result: { message: string; materialId: string } }>("/api/attendance/session-materials", { method: "POST", body: JSON.stringify({ ...form, provider: "GoogleDrive", fileId }) });
      showToast(result.result.message);
      setForm(emptyMaterialForm);
      setExistingStale(true);
      if (activeContentTab === "Existing") await loadExistingData({ force: true });
    } catch (reason) {
      const message = formatClientApiError(reason);
      setError(message);
      showToast(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <><PageHeader eyebrow="Session Materials" title="Session Materials" description="Manage Google Drive session material rows and group access."/><Card><LoadingState/></Card></>;
  if (error && !formData) return <><PageHeader eyebrow="Session Materials" title="Session Materials" description="Manage Google Drive session material rows and group access."/><ErrorState/><Card className="p-3 text-sm text-red-700">{safeDisplayText(error)}</Card></>;
  return <><PageHeader eyebrow="Session Materials" title="Session Materials" description="Manage Google Drive session material rows and group access."/><div className="space-y-5">
    {error && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-800">{safeDisplayText(error)}</Card>}
    <Card className="overflow-hidden">
      <Tabs tabs={["Add New", "Existing"]} active={activeContentTab} onChange={changeContentTab}/>
      {activeContentTab === "Add New" ? <div className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="heading text-lg font-bold">{form.materialId ? "Edit Material" : "Create Material"}</h2><p className="text-xs text-slate-500">Material access is controlled only by Session_Material_Groups.</p></div>{form.materialId && <Button type="button" variant="secondary" onClick={() => setForm(emptyMaterialForm)}>New Material</Button>}</div>
      <form className="space-y-5" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MaterialNativeSelect label="Batch" value={form.batchId} onChange={batchId => updateForm({ batchId, attendanceSessionId: "", groupIds: [] })} required options={batches.map(batch => ({ value: batch.id, label: materialBatchLabel(batch) }))}/>
          <MaterialNativeSelect label="Attendance Session" value={form.attendanceSessionId} onChange={chooseSession} required options={filteredSessionOptions.map(session => ({ value: session.id, label: materialSessionLabel(session) }))}/>
          <MaterialTextField label="Material Title" value={form.materialTitle} onChange={materialTitle => updateForm({ materialTitle })} required/>
          <MaterialNativeSelect label="Material Type" value={form.materialType} onChange={materialType => updateForm({ materialType: normalizeMaterialType(materialType) })} required options={["PDF", "Presentation", "Doc", "Sheet", "Other"].map(value => ({ value, label: value }))}/>
          <MaterialNativeSelect label="Provider" value={form.provider} onChange={() => updateForm({ provider: "GoogleDrive", fileId: form.fileUrl ? extractGoogleDriveFileId(form.fileUrl) : form.fileId })} required options={[{ value: "GoogleDrive", label: "GoogleDrive" }]}/>
          <MaterialTextField label="File URL" value={form.fileUrl} onChange={fileUrl => updateForm({ fileUrl, fileId: form.fileId || extractGoogleDriveFileId(fileUrl) })} required hint="Paste a Google Drive file link."/>
          <MaterialTextField label="File ID" value={form.fileId} onChange={fileId => updateForm({ fileId })} required hint={!form.fileId && form.fileUrl ? "File ID could not be extracted. Enter it manually." : ""}/>
          <MaterialTextField label="Session Number" value={form.sessionNumber} onChange={sessionNumber => updateForm({ sessionNumber })}/>
          <MaterialTextField label="Level Code" value={form.levelCode} onChange={levelCode => updateForm({ levelCode })}/>
          <MaterialNativeSelect label="Publish Status" value={form.publishStatus} onChange={publishStatus => updateForm({ publishStatus: normalizePublishStatus(publishStatus) })} required options={["Draft", "Published", "Hidden"].map(value => ({ value, label: value }))}/>
          <MaterialTextField label="Available From" type="date" value={form.availableFrom} onChange={availableFrom => updateForm({ availableFrom })}/>
          <MaterialTextField label="Available To" type="date" value={form.availableTo} onChange={availableTo => updateForm({ availableTo })}/>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Is Active</span><select className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm" value={form.isActive ? "TRUE" : "FALSE"} onChange={event => updateForm({ isActive: event.target.value === "TRUE" })}><option value="TRUE">TRUE</option><option value="FALSE">FALSE</option></select></label>
          <MaterialTextField label="Notes" value={form.notes} onChange={notes => updateForm({ notes })}/>
        </div>
        <section className="rounded border border-slate-200">
          <div className="border-b bg-slate-50 p-4"><h3 className="heading text-sm font-bold">Group Access</h3><p className="text-xs text-slate-500">Select groups allowed to view this material. Unchecked existing groups are disabled on save.</p></div>
          {!form.batchId ? <EmptyState title="Select a Batch first" detail="Groups are filtered by Groups.Batch_ID."/> : !groupOptions.length ? <EmptyState title="No groups found for this batch" detail="Create operational groups before assigning material access."/> : <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{groupOptions.map(group => <label key={group.id} className="flex cursor-pointer gap-3 rounded border border-slate-200 p-3 hover:bg-slate-50"><input type="checkbox" className="mt-1 accent-red-700" checked={form.groupIds.includes(group.id)} onChange={event => updateForm({ groupIds: event.target.checked ? [...form.groupIds, group.id] : form.groupIds.filter(id => id !== group.id) })}/><span className="min-w-0 text-sm"><strong className="block">{safeDisplayText(group.name, "-")}</strong><span className="mt-1 block text-xs text-slate-500">{safeDisplayText(group.levelSelection, "-")} | L1 {safeDisplayText(group.level1AttendanceMode, "-")} | L2 {safeDisplayText(group.level2AttendanceMode, "-")}</span><span className="mt-1 block text-xs text-slate-500">Capacity {safeDisplayText(group.capacity, "-")} | {safeDisplayText(group.status, "-")}</span></span></label>)}</div>}
        </section>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setForm(emptyMaterialForm)}>Clear</Button><Button type="submit" disabled={saving || !form.batchId || !form.attendanceSessionId}>{saving ? "Saving..." : form.materialId ? "Update Material" : "Create Material"}</Button></div>
      </form>
      {selectedSession && <p className="mt-4 rounded border bg-slate-50 p-3 text-xs text-slate-600">Selected session: {materialSessionLabel(selectedSession)}</p>}
      </div> : <div>
      <div className="border-b bg-slate-50 p-4"><h2 className="heading text-lg font-bold">Existing Materials</h2><p className="text-xs text-slate-500">Manage rows from Session_Materials and group access from Session_Material_Groups.</p></div>
      <div className="grid gap-3 border-b p-4 md:grid-cols-2 xl:grid-cols-6">
        <SearchInput value={filters.search} onChange={search => setFilters(current => ({ ...current, search }))} placeholder="Search title, file id, or code"/>
        <select aria-label="Batch filter" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" value={filters.batchId} onChange={event => setFilters(current => ({ ...current, batchId: event.target.value }))}><option value="">All Batches</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{materialBatchLabel(batch)}</option>)}</select>
        <select aria-label="Group filter" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" value={filters.groupId} onChange={event => setFilters(current => ({ ...current, groupId: event.target.value }))}><option value="">All Groups</option>{groups.map(group => <option key={group.id} value={group.id}>{safeDisplayText(group.name, "-")}</option>)}</select>
        <Select label="Publish Status" value={filters.publishStatus} onChange={publishStatus => setFilters(current => ({ ...current, publishStatus }))} options={["Draft", "Published", "Hidden"]}/>
        <Select label="Level Code" value={filters.levelCode} onChange={levelCode => setFilters(current => ({ ...current, levelCode }))} options={uniqueValues(materials.map(row => row.levelCode))}/>
        <Select label="Material Type" value={filters.materialType} onChange={materialType => setFilters(current => ({ ...current, materialType }))} options={["PDF", "Presentation", "Doc", "Sheet", "Other"]}/>
      </div>
      <div className="flex justify-end border-b p-3"><Button variant="secondary" onClick={() => void loadExistingData({ force: true })}>Refresh Existing</Button></div>
      {existingLoading ? <div><LoadingState/><p className="px-5 pb-5 text-center text-xs text-slate-500">Loading existing materials...</p></div> : existingError ? <div className="p-4"><ErrorState/><p className="mt-2 text-sm text-red-700">{safeDisplayText(existingError)}</p><Button className="mt-3" variant="secondary" onClick={() => void loadExistingData({ force: true })}>Retry</Button></div> : filteredMaterials.length ? <DataTable rows={filteredMaterials} columns={columns} getKey={row => row.id}/> : <EmptyState title="No materials found" detail="Create a material row after selecting an attendance session."/>}
      </div>}
    </Card>
  </div></>;
}

function MaterialTextField({ label, value, onChange, required, type = "text", hint }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; hint?: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}{required && <span className="text-red-700"> *</span>}</span><input type={type} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm" value={value} onChange={event => onChange(event.target.value)} required={required}/>{hint && <span className="mt-1 block text-[11px] text-amber-700">{safeDisplayText(hint)}</span>}</label>;
}

function MaterialNativeSelect({ label, value, onChange, options, required }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; required?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}{required && <span className="text-red-700"> *</span>}</span><select className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm" value={value} onChange={event => onChange(event.target.value)} required={required}><option value="">Select {label}</option>{options.map(option => <option key={option.value} value={option.value}>{safeDisplayText(option.label, "-")}</option>)}</select></label>;
}

function materialBatchLabel(batch: SessionMaterialsData["batches"][number]) {
  return `${safeDisplayText(batch.name, "-")} | ${safeDisplayText(batch.location || "Unassigned Location", "-")}`;
}

function materialSessionLabel(session: SessionMaterialsData["sessions"][number]) {
  const title = safeDisplayText(session.sessionTitle || session.track || session.attendanceCode || session.id, "-");
  return `${safeDisplayText(session.sessionDate, "-")} | ${safeDisplayText(session.startTime, "-")}-${safeDisplayText(session.endTime, "-")} | S${safeDisplayText(session.sessionNumber, "-")} | ${title} | Code: ${safeDisplayText(session.attendanceCode, "-")}`;
}

function extractGoogleDriveFileId(url: string) {
  const text = url.trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
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

function normalizeMaterialType(value: string): MaterialForm["materialType"] {
  if (value === "Presentation" || value === "Doc" || value === "Sheet" || value === "Other") return value;
  return "PDF";
}

function normalizePublishStatus(value: string): MaterialForm["publishStatus"] {
  return value === "Published" || value === "Hidden" ? value : "Draft";
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort();
}
