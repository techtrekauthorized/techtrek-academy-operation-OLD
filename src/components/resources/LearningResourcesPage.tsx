"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { extractGoogleDriveFileId } from "@/lib/drive-links";
import { safeDisplayText } from "@/lib/display";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, SearchInput, StatusBadge, Tabs } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/DataTable";
import type { LearningResourceDto, LearningResourcesData, LearningResourcesExistingData, LearningResourcesFormData } from "@/types/learning-resources";

type ResourceForm = {
  resourceId: string;
  batchId: string;
  relatedAttendanceSessionId: string;
  resourceTitle: string;
  resourceDescription: string;
  resourceType: "VIDEO";
  resourceCategory: string;
  provider: "GoogleDrive";
  videoUrl: string;
  videoId: string;
  publishStatus: "Draft" | "Published" | "Hidden";
  availableFrom: string;
  availableTo: string;
  isActive: boolean;
  notes: string;
  groupIds: string[];
};

const emptyForm: ResourceForm = { resourceId: "", batchId: "", relatedAttendanceSessionId: "", resourceTitle: "", resourceDescription: "", resourceType: "VIDEO", resourceCategory: "Revision", provider: "GoogleDrive", videoUrl: "", videoId: "", publishStatus: "Draft", availableFrom: "", availableTo: "", isActive: true, notes: "", groupIds: [] };
const categories = ["Revision", "Tutorial", "Reference", "Project Support", "Career", "Extra Practice", "Other"];
const publishStatuses = ["Draft", "Published", "Hidden"];

export function LearningResourcesPage() {
  const [activeContentTab, setActiveContentTab] = useState("Add New");
  const [formData, setFormData] = useState<LearningResourcesFormData>();
  const [existingData, setExistingData] = useState<LearningResourcesExistingData>();
  const [loading, setLoading] = useState(true);
  const [existingLoading, setExistingLoading] = useState(false);
  const [existingLoaded, setExistingLoaded] = useState(false);
  const [existingStale, setExistingStale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existingError, setExistingError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<ResourceForm>(emptyForm);
  const [filters, setFilters] = useState({ search: "", batchId: "", groupId: "", category: "", publishStatus: "" });

  const loadFormData = async () => {
    setLoading(true); setError("");
    try {
      const result = await apiFetch<{ learningResources: LearningResourcesFormData }>("/api/resources?mode=form");
      setFormData(result.learningResources);
    } catch (reason) {
      setError(formatClientApiError(reason));
    } finally {
      setLoading(false);
    }
  };

  const loadExistingData = async ({ force = false } = {}) => {
    if (existingLoading || (existingLoaded && !existingStale && !force)) return;
    setExistingLoading(true); setExistingError("");
    try {
      const result = await apiFetch<{ learningResources: LearningResourcesExistingData }>("/api/resources?mode=existing");
      setExistingData(result.learningResources);
      setExistingLoaded(true);
      setExistingStale(false);
    } catch (reason) {
      setExistingError(formatClientApiError(reason));
    } finally {
      setExistingLoading(false);
    }
  };

  useEffect(() => { queueMicrotask(() => void loadFormData()); }, []);

  function changeContentTab(tab: string) {
    setActiveContentTab(tab);
    if (tab === "Existing") queueMicrotask(() => void loadExistingData());
  }

  const batches = formData?.batches ?? [];
  const groups = formData?.groups ?? [];
  const sessions = formData?.sessions ?? [];
  const resources = useMemo(() => existingData?.resources ?? [], [existingData?.resources]);
  const formGroups = groups.filter(group => group.batchId === form.batchId);
  const formSessions = sessions.filter(session => session.batchId === form.batchId);
  const filteredResources = useMemo(() => resources.filter(resource => {
    const query = filters.search.trim().toLowerCase();
    return (!filters.batchId || resource.batchId === filters.batchId)
      && (!filters.groupId || resource.groupIds.includes(filters.groupId))
      && (!filters.category || resource.resourceCategory === filters.category)
      && (!filters.publishStatus || resource.publishStatus === filters.publishStatus)
      && (!query || [resource.resourceTitle, resource.resourceDescription].some(value => value.toLowerCase().includes(query)));
  }), [filters, resources]);

  function updateForm(patch: Partial<ResourceForm>) {
    setForm(current => ({ ...current, ...patch }));
  }

  function editResource(resource: LearningResourceDto) {
    setForm({
      resourceId: resource.id,
      batchId: resource.batchId,
      relatedAttendanceSessionId: resource.relatedAttendanceSessionId,
      resourceTitle: resource.resourceTitle,
      resourceDescription: resource.resourceDescription,
      resourceType: "VIDEO",
      resourceCategory: categories.includes(resource.resourceCategory) ? resource.resourceCategory : "Other",
      provider: "GoogleDrive",
      videoUrl: resource.videoUrl,
      videoId: resource.videoId,
      publishStatus: resource.publishStatus,
      availableFrom: resource.availableFrom,
      availableTo: resource.availableTo,
      isActive: resource.isActive,
      notes: resource.notes,
      groupIds: resource.groupIds,
    });
    setMessage("");
    setActiveContentTab("Add New");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const videoId = form.videoId.trim() || extractGoogleDriveFileId(form.videoUrl);
      const result = await apiFetch<{ result: { message: string; resourceId: string } }>("/api/resources", { method: "POST", body: JSON.stringify({ ...form, videoId }) });
      setMessage(result.result.message);
      setForm(emptyForm);
      setExistingStale(true);
      if (activeContentTab === "Existing") await loadExistingData({ force: true });
    } catch (reason) {
      setError(formatClientApiError(reason));
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<LearningResourceDto>[] = [
    { key: "title", header: "Resource Title", className: "min-w-[220px] whitespace-normal", cell: row => <div><strong>{row.resourceTitle}</strong><div className="mt-1 text-xs text-slate-500">{row.resourceDescription || "—"}</div></div> },
    { key: "category", header: "Category", cell: row => <StatusBadge>{row.resourceCategory}</StatusBadge> },
    { key: "batch", header: "Batch", cell: row => row.batchName || row.batchId },
    { key: "session", header: "Related Session", className: "min-w-[220px] whitespace-normal", cell: row => row.relatedSessionLabel || "—" },
    { key: "provider", header: "Provider", cell: row => row.provider },
    { key: "publish", header: "Publish Status", cell: row => <StatusBadge>{row.publishStatus}</StatusBadge> },
    { key: "active", header: "Is Active", cell: row => <StatusBadge tone={row.isActive ? "success" : "neutral"}>{row.isActive ? "TRUE" : "FALSE"}</StatusBadge> },
    { key: "from", header: "Available From", cell: row => row.availableFrom || "—" },
    { key: "to", header: "Available To", cell: row => row.availableTo || "—" },
    { key: "groups", header: "Active Groups Count", cell: row => String(row.activeGroupsCount) },
    { key: "edit", header: "Edit", cell: row => <Button size="sm" variant="secondary" onClick={() => editResource(row)}>Edit</Button> },
  ];

  if (loading) return <><PageHeader eyebrow="Learning Content" title="Learning Resources" description="Publish supplemental Google Drive video resources to selected Groups."/><Card><LoadingState/></Card></>;
  if (error && !formData) return <><PageHeader eyebrow="Learning Content" title="Learning Resources" description="Publish supplemental Google Drive video resources to selected Groups."/><ErrorState/><Card className="p-3 text-sm text-red-700">{safeDisplayText(error)}</Card></>;

  return <><PageHeader eyebrow="Learning Content" title="Learning Resources" description="Standalone supplemental video resources. Official Recorded Sessions and Session Materials remain separate." actions={<Button variant="secondary" onClick={() => activeContentTab === "Existing" ? void loadExistingData({ force: true }) : void loadFormData()}><RefreshCw size={14}/>Refresh</Button>}/><div className="space-y-5">
    {error && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-800">{safeDisplayText(error)}</Card>}
    {message && <Card className="border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{safeDisplayText(message)}</Card>}
    <Card className="overflow-hidden">
      <Tabs tabs={["Add New", "Existing"]} active={activeContentTab} onChange={changeContentTab}/>
      {activeContentTab === "Add New" ? <div className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="heading text-lg font-bold">{form.resourceId ? "Edit Resource" : "Create Resource"}</h2><p className="text-xs text-slate-500">Video access is controlled only by Learning_Resource_Groups.</p></div>{form.resourceId && <Button type="button" variant="secondary" onClick={() => setForm(emptyForm)}>New Resource</Button>}</div>
      <form className="space-y-5" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <NativeSelect label="Batch" value={form.batchId} onChange={batchId => updateForm({ batchId, relatedAttendanceSessionId: "", groupIds: [] })} required options={batches.map(batch => ({ value: batch.id, label: `${batch.name} | ${batch.location || "Unassigned Location"}` }))}/>
          <TextField label="Resource Title" value={form.resourceTitle} onChange={resourceTitle => updateForm({ resourceTitle })} required/>
          <NativeSelect label="Resource Category" value={form.resourceCategory} onChange={resourceCategory => updateForm({ resourceCategory })} required options={categories.map(value => ({ value, label: value }))}/>
          <NativeSelect label="Related Attendance Session" value={form.relatedAttendanceSessionId} onChange={relatedAttendanceSessionId => updateForm({ relatedAttendanceSessionId })} options={formSessions.map(session => ({ value: session.id, label: sessionOptionLabel(session) }))}/>
          <NativeSelect label="Provider" value={form.provider} onChange={() => updateForm({ provider: "GoogleDrive", videoId: form.videoUrl ? extractGoogleDriveFileId(form.videoUrl) : form.videoId })} required options={[{ value: "GoogleDrive", label: "GoogleDrive" }]}/>
          <NativeSelect label="Resource Type" value={form.resourceType} onChange={() => updateForm({ resourceType: "VIDEO" })} required options={[{ value: "VIDEO", label: "VIDEO" }]}/>
          <TextField label="Video URL" value={form.videoUrl} onChange={videoUrl => updateForm({ videoUrl, videoId: form.videoId || extractGoogleDriveFileId(videoUrl) })} required hint="Paste a Google Drive video file link. The Video ID is extracted locally."/>
          <TextField label="Video ID" value={form.videoId} onChange={videoId => updateForm({ videoId })} required hint={!form.videoId && form.videoUrl ? "Video ID could not be extracted. Enter it manually." : ""}/>
          <NativeSelect label="Publish Status" value={form.publishStatus} onChange={publishStatus => updateForm({ publishStatus: publishStatus as ResourceForm["publishStatus"] })} required options={publishStatuses.map(value => ({ value, label: value }))}/>
          <TextField label="Available From" type="date" value={form.availableFrom} onChange={availableFrom => updateForm({ availableFrom })}/>
          <TextField label="Available To" type="date" value={form.availableTo} onChange={availableTo => updateForm({ availableTo })}/>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Is Active</span><select className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm" value={form.isActive ? "TRUE" : "FALSE"} onChange={event => updateForm({ isActive: event.target.value === "TRUE" })}><option value="TRUE">TRUE</option><option value="FALSE">FALSE</option></select></label>
          <TextArea label="Description" value={form.resourceDescription} onChange={resourceDescription => updateForm({ resourceDescription })}/>
          <TextArea label="Notes" value={form.notes} onChange={notes => updateForm({ notes })}/>
        </div>
        <section className="rounded border border-slate-200">
          <div className="border-b bg-slate-50 p-4"><h3 className="heading text-sm font-bold">Group Access</h3><p className="text-xs text-slate-500">Select Groups allowed to watch this Resource. Unchecked existing mappings are disabled on save.</p></div>
          {!form.batchId ? <EmptyState title="Select a Batch first" detail="Groups are filtered by Groups.Batch_ID."/> : !formGroups.length ? <EmptyState title="No groups found for this Batch" detail="Create Groups before assigning Resource access."/> : <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{formGroups.map(group => <label key={group.id} className="flex cursor-pointer gap-3 rounded border border-slate-200 p-3 hover:bg-slate-50"><input type="checkbox" className="mt-1 accent-red-700" checked={form.groupIds.includes(group.id)} onChange={event => updateForm({ groupIds: event.target.checked ? [...form.groupIds, group.id] : form.groupIds.filter(id => id !== group.id) })}/><span className="min-w-0 text-sm"><strong className="block">{safeDisplayText(group.name, "-")}</strong><span className="mt-1 block text-xs text-slate-500">{safeDisplayText(group.levelSelection, "-")} | L1 {safeDisplayText(group.level1AttendanceMode, "-")} | L2 {safeDisplayText(group.level2AttendanceMode, "-")}</span><span className="mt-1 block text-xs text-slate-500">Capacity {safeDisplayText(group.capacity, "-")} | {safeDisplayText(group.status, "-")}</span></span></label>)}</div>}
        </section>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setForm(emptyForm)}>Clear</Button><Button type="submit" disabled={saving || !form.batchId || !form.resourceTitle.trim() || !form.videoUrl.trim() || !form.groupIds.length}><Save size={14}/>{saving ? "Saving..." : form.resourceId ? "Update Resource" : "Create Resource"}</Button></div>
      </form>
      </div> : <div>
      <div className="border-b bg-slate-50 p-4"><h2 className="heading text-lg font-bold">Existing Resources</h2><p className="text-xs text-slate-500">Rows from Learning_Resources with group access from Learning_Resource_Groups.</p></div>
      <div className="grid gap-3 border-b p-4 md:grid-cols-2 xl:grid-cols-5">
        <SearchInput value={filters.search} onChange={search => setFilters(current => ({ ...current, search }))} placeholder="Search title or description"/>
        <select aria-label="Batch filter" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" value={filters.batchId} onChange={event => setFilters(current => ({ ...current, batchId: event.target.value }))}><option value="">All Batches</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{safeDisplayText(batch.name)}</option>)}</select>
        <select aria-label="Group filter" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" value={filters.groupId} onChange={event => setFilters(current => ({ ...current, groupId: event.target.value }))}><option value="">All Groups</option>{groups.map(group => <option key={group.id} value={group.id}>{safeDisplayText(group.name)}</option>)}</select>
        <select aria-label="Category filter" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" value={filters.category} onChange={event => setFilters(current => ({ ...current, category: event.target.value }))}><option value="">All Categories</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select>
        <select aria-label="Publish Status filter" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" value={filters.publishStatus} onChange={event => setFilters(current => ({ ...current, publishStatus: event.target.value }))}><option value="">All Publish Statuses</option>{publishStatuses.map(status => <option key={status} value={status}>{status}</option>)}</select>
      </div>
      <div className="flex justify-end border-b p-3"><Button variant="secondary" onClick={() => void loadExistingData({ force: true })}><RefreshCw size={14}/>Refresh Existing</Button></div>
      {existingLoading ? <div><LoadingState/><p className="px-5 pb-5 text-center text-xs text-slate-500">Loading existing resources...</p></div> : existingError ? <div className="p-4"><ErrorState/><p className="mt-2 text-sm text-red-700">{safeDisplayText(existingError)}</p><Button className="mt-3" variant="secondary" onClick={() => void loadExistingData({ force: true })}>Retry</Button></div> : filteredResources.length ? <DataTable rows={filteredResources} columns={columns} getKey={row => row.id}/> : <EmptyState title="No learning resources found" detail="Create a Resource or adjust the current filters."/>}
      </div>}
    </Card>
  </div></>;
}

function TextField({ label, value, onChange, required, type = "text", hint }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; hint?: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}{required && <span className="text-red-700"> *</span>}</span><input type={type} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm" value={value} onChange={event => onChange(event.target.value)} required={required}/>{hint && <span className="mt-1 block text-[11px] text-amber-700">{safeDisplayText(hint)}</span>}</label>;
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span><textarea rows={3} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm" value={value} onChange={event => onChange(event.target.value)}/></label>;
}

function NativeSelect({ label, value, onChange, options, required }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; required?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}{required && <span className="text-red-700"> *</span>}</span><select className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm" value={value} onChange={event => onChange(event.target.value)} required={required}><option value="">Select {label}</option>{options.map(option => <option key={option.value} value={option.value}>{safeDisplayText(option.label, "-")}</option>)}</select></label>;
}

function sessionOptionLabel(session: LearningResourcesData["sessions"][number]) {
  const title = safeDisplayText(session.sessionTitle || session.track || session.attendanceCode || session.id, "-");
  return `${safeDisplayText(session.sessionDate, "-")} | S${safeDisplayText(session.sessionNumber, "-")} | ${title}`;
}
