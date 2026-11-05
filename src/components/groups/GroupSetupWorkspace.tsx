"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Pencil, Plus } from "lucide-react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { Modal, useToast } from "@/components/ui/overlays";
import { Button, EmptyState, KpiCard, StatusBadge } from "@/components/ui/primitives";
import { safeDisplayText } from "@/lib/display";
import type { TrainingOperationsData } from "@/types/operations";

type Group = TrainingOperationsData["groups"][number];
type GroupPayload = { name: string; batchId: string; levelSelection: string; level1AttendanceMode: string; level2AttendanceMode: string; capacity: string; status: string; notes: string };
const GROUP_STATUSES = ["PLANNED", "ACTIVE", "COMPLETED", "CLOSED", "CANCELLED"];
const LEVEL_SELECTIONS = ["BOTH_LEVELS", "LEVEL_1", "LEVEL_2"];
const readable = (value: string) => value ? value.toLowerCase().split("_").map(word => word[0]?.toUpperCase() + word.slice(1)).join(" ") : "â€”";

export function GroupSetupWorkspace({ data, onRefresh }: { data: TrainingOperationsData; onRefresh: () => Promise<void> }) {
  const { showToast } = useToast();
  const [filters, setFilters] = useState({ batch: "", level: "", status: "", attendance: "" });
  const [editor, setEditor] = useState<{ row?: Group }>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const filtered = useMemo(() => data.groups.filter(group => (!filters.batch || group.batchId === filters.batch) && (!filters.level || group.levelSelection === filters.level) && (!filters.status || group.status === filters.status) && (!filters.attendance || group.level1AttendanceMode === filters.attendance || group.level2AttendanceMode === filters.attendance)), [data.groups, filters]);
  const totalCapacity = data.groups.reduce((sum, group) => sum + group.capacity, 0);
  const assignedStudents = data.groups.reduce((sum, group) => sum + group.assignedStudentsCount, 0);
  const eligibleBatches = data.batches.filter(batch => !["CANCELLED", "COMPLETED"].includes(batch.status.trim().toUpperCase()));

  const close = () => { if (!saving) { setEditor(undefined); setError(""); } };
  const submit = async (payload: GroupPayload) => {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const response = await apiFetch<{ result: { message: string } }>("/api/training-operations/group-setup", { method: "POST", body: JSON.stringify({ action: editor?.row ? "update-group" : "create-group", ...(editor?.row ? { id: editor.row.id } : {}), ...payload }) });
      await onRefresh();
      setEditor(undefined);
      showToast(response.result.message);
    } catch (reason) { setError(formatClientApiError(reason)); }
    finally { setSaving(false); }
  };

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><KpiCard label="Total Groups" value={String(data.groups.length)}/><KpiCard label="Planned Groups" value={String(data.groups.filter(group => group.status === "PLANNED").length)}/><KpiCard label="Active Groups" value={String(data.groups.filter(group => group.status === "ACTIVE").length)}/><KpiCard label="Total Capacity" value={String(totalCapacity)}/><KpiCard label="Assigned Students" value={String(assignedStudents)}/></div>

    <section className="overflow-hidden rounded border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3"><div><h2 className="heading text-base font-bold">Operational Groups</h2><p className="mt-0.5 text-xs text-slate-500">Groups may contain eligible students from different universities when their operational setup matches.</p></div>{data.canManageGroups && <Button size="sm" disabled={!eligibleBatches.length} onClick={() => setEditor({})}><Plus size={14}/>Add Group</Button>}</header>
      <div className="grid gap-3 border-b p-4 sm:grid-cols-2 xl:grid-cols-4"><Filter label="Batch" value={filters.batch} onChange={batch => setFilters(current => ({ ...current, batch }))} options={data.batches.map(batch => ({ value: batch.id, label: batch.name }))}/><Filter label="Level Selection" value={filters.level} onChange={level => setFilters(current => ({ ...current, level }))} options={LEVEL_SELECTIONS.map(value => ({ value, label: readable(value) }))}/><Filter label="Status" value={filters.status} onChange={status => setFilters(current => ({ ...current, status }))} options={GROUP_STATUSES.map(value => ({ value, label: readable(value) }))}/><Filter label="Attendance Mode" value={filters.attendance} onChange={attendance => setFilters(current => ({ ...current, attendance }))} options={[{ value: "ONLINE", label: "Online" }, { value: "OFFLINE", label: "Offline" }]}/></div>
      {!data.groups.length ? <EmptyState title="No Groups configured" detail="Create a Group after eligible Batches and Batch Levels are ready."/> : !filtered.length ? <EmptyState title="No Groups match these filters" detail="Clear or adjust the selected filters."/> : <Table headers={["Group Name", "Batch", "Delivery Track", "Level Selection", "Level 1 Attendance", "Level 2 Attendance", "Capacity", "Assigned Students", "Status", "Notes", ...(data.canManageGroups ? ["Actions"] : [])]}>{filtered.map(row => <tr key={row.id} className="border-b border-slate-100 last:border-0"><Cell><strong>{row.name}</strong><div className="font-mono text-[10px] text-slate-400">{row.id}</div></Cell><Cell>{row.batchName}</Cell><Cell>{row.deliveryTrackName}</Cell><Cell><StatusBadge>{readable(row.levelSelection)}</StatusBadge></Cell><Cell>{readable(row.level1AttendanceMode)}</Cell><Cell>{readable(row.level2AttendanceMode)}</Cell><Cell>{row.capacity || "â€”"}</Cell><Cell>{row.assignedStudentsCount}</Cell><Cell><StatusBadge>{readable(row.status)}</StatusBadge></Cell><Cell wrap>{row.notes || "â€”"}</Cell>{data.canManageGroups && <Cell><Button size="sm" variant="secondary" onClick={() => setEditor({ row })}><Pencil size={13}/>Edit</Button></Cell>}</tr>)}</Table>}
    </section>

    {editor && <GroupEditor key={editor.row?.id ?? "new-group"} row={editor.row} batches={data.batches} batchLevels={data.batchLevels} saving={saving} error={error} onClose={close} onSubmit={submit}/>} 
  </div>;
}

function GroupEditor({ row, batches, batchLevels, saving, error, onClose, onSubmit }: { row?: Group; batches: TrainingOperationsData["batches"]; batchLevels: TrainingOperationsData["batchLevels"]; saving: boolean; error: string; onClose: () => void; onSubmit: (payload: GroupPayload) => Promise<void> }) {
  const locked = Boolean(row && row.assignedStudentsCount > 0);
  const eligibleBatches = batches.filter(batch => !["CANCELLED", "COMPLETED"].includes(batch.status.trim().toUpperCase()));
  const currentBatch = row ? batches.find(batch => batch.id === row.batchId) : undefined;
  const selectableBatches = currentBatch && !eligibleBatches.some(batch => batch.id === currentBatch.id) ? [currentBatch, ...eligibleBatches] : eligibleBatches;
  const [name, setName] = useState(row?.name ?? "");
  const [batchId, setBatchId] = useState(row?.batchId ?? "");
  const [selection, setSelection] = useState(row?.levelSelection ?? "");
  const [level1Mode, setLevel1Mode] = useState(row?.level1AttendanceMode ?? "");
  const [level2Mode, setLevel2Mode] = useState(row?.level2AttendanceMode ?? "");
  const [capacity, setCapacity] = useState(row?.capacity ? String(row.capacity) : "");
  const [status, setStatus] = useState(row?.status ?? "PLANNED");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const batch = batches.find(item => item.id === batchId);
  const eligibleLevels = batchLevels.filter(level => level.batchId === batchId && ["PLANNED", "ACTIVE"].includes(level.status.trim().toUpperCase()));
  const level1 = eligibleLevels.find(level => level.levelCode === "LEVEL_1");
  const level2 = eligibleLevels.find(level => level.levelCode === "LEVEL_2");
  const level1Options = attendanceOptions(level1?.attendanceRule);
  const level2Options = attendanceOptions(level2?.attendanceRule);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void onSubmit({ name, batchId, levelSelection: selection, level1AttendanceMode: selection === "LEVEL_2" ? "" : level1Mode, level2AttendanceMode: selection === "LEVEL_1" ? "" : level2Mode, capacity, status, notes }); };
  const changeBatch = (value: string) => { setBatchId(value); setLevel1Mode(""); setLevel2Mode(""); };
  const changeSelection = (value: string) => { setSelection(value); if (value === "LEVEL_1") setLevel2Mode(""); if (value === "LEVEL_2") setLevel1Mode(""); };

  return <Modal open onClose={onClose} title={row ? "Edit Group" : "Add Group"} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button form="group-setup-form" type="submit" disabled={saving}>{saving ? "Saving..." : "Save Group"}</Button></>}>
    <form id="group-setup-form" onSubmit={submit} className="space-y-4">
      <TextField label="Group Name" value={name} onChange={setName} required/>
      {locked ? <ReadOnly label="Batch" value={row?.batchName ?? "Unknown Batch"}/> : <SelectField label="Batch" value={batchId} onChange={changeBatch} required options={selectableBatches.map(item => ({ value: item.id, label: item.name }))}/>} 
      {batch && <div className="rounded border border-red-100 bg-red-50/50 p-3 text-xs text-slate-700"><strong>{safeDisplayText(batch.name)}</strong><span className="mx-2 text-slate-300">|</span>{safeDisplayText(batch.deliveryTrackName)}<span className="mx-2 text-slate-300">|</span>{safeDisplayText(batch.intake)}</div>}
      {locked ? <ReadOnly label="Level Selection" value={readable(row?.levelSelection ?? "")}/> : <SelectField label="Level Selection" value={selection} onChange={changeSelection} required options={LEVEL_SELECTIONS.map(value => ({ value, label: readable(value) }))}/>} 
      {(selection === "BOTH_LEVELS" || selection === "LEVEL_1") && (locked ? <ReadOnly label="Level 1 Attendance Mode" value={readable(row?.level1AttendanceMode ?? "")}/> : <AttendanceField label="Level 1 Attendance Mode" level={level1} options={level1Options} value={level1Mode} onChange={setLevel1Mode}/>)}
      {(selection === "BOTH_LEVELS" || selection === "LEVEL_2") && (locked ? <ReadOnly label="Level 2 Attendance Mode" value={readable(row?.level2AttendanceMode ?? "")}/> : <AttendanceField label="Level 2 Attendance Mode" level={level2} options={level2Options} value={level2Mode} onChange={setLevel2Mode}/>)}
      {locked && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">This Group has assigned students. Batch, Level Selection, and attendance modes are locked.</p>}
      <TextField label="Capacity" type="number" min="1" step="1" value={capacity} onChange={setCapacity}/>
      <SelectField label="Status" value={status} onChange={setStatus} required options={GROUP_STATUSES.map(value => ({ value, label: readable(value) }))}/>
      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Notes</span><textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-red-500"/></label>
      <p className="text-xs leading-5 text-slate-500">Groups can include students from different universities or Intensive Diploma when their Batch, Levels, and attendance setup match.</p>
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </form>
  </Modal>;
}

function attendanceOptions(rule?: string) { const normalized = rule?.trim().toUpperCase(); if (normalized === "ONLINE_ONLY") return [{ value: "ONLINE", label: "Online" }]; if (normalized === "OFFLINE_ONLY") return [{ value: "OFFLINE", label: "Offline" }]; if (normalized === "ONLINE_OR_OFFLINE") return [{ value: "ONLINE", label: "Online" }, { value: "OFFLINE", label: "Offline" }]; return []; }
function AttendanceField({ label, level, options, value, onChange }: { label: string; level?: TrainingOperationsData["batchLevels"][number]; options: Array<{ value: string; label: string }>; value: string; onChange: (value: string) => void }) { return <div><SelectField label={label} value={value} onChange={onChange} required options={options}/><p className={options.length ? "mt-1 text-[11px] text-slate-500" : "mt-1 text-[11px] text-red-700"}>{level ? options.length ? `Rule: ${readable(level.attendanceRule)}` : "This Batch Level has a missing or invalid Attendance Rule." : "This Batch does not have the required active or planned level."}</p></div>; }
function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) { return <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm"><option value="">All {label}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function SelectField({ label, value, onChange, required, options }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; options: Array<{ value: string; label: string }> }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{safeDisplayText(label)}{required && <span className="text-red-700"> *</span>}</span><select value={value} onChange={event => onChange(event.target.value)} required={required} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm"><option value="">Select {safeDisplayText(label)}</option>{options.map(option => <option key={option.value} value={option.value}>{safeDisplayText(option.label)}</option>)}</select></label>; }
function TextField({ label, value, onChange, required, type = "text", min, step }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; min?: string; step?: string }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}{required && <span className="text-red-700"> *</span>}</span><input type={type} value={value} onChange={event => onChange(event.target.value)} required={required} min={min} step={step} className="h-10 w-full rounded border border-slate-300 px-3 text-sm focus:border-red-500"/></label>; }
function ReadOnly({ label, value }: { label: string; value: string }) { return <div><div className="mb-1.5 text-xs font-semibold text-slate-700">{safeDisplayText(label)}</div><div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{safeDisplayText(value)}</div></div>; }
function Table({ headers, children }: { headers: string[]; children: ReactNode }) { return <div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[980px] border-collapse text-start"><thead><tr className="border-b border-slate-200">{headers.map(header => <th key={header} className="whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Cell({ children, wrap = false }: { children: ReactNode; wrap?: boolean }) { return <td className={wrap ? "max-w-xs whitespace-normal px-3 py-3 text-[13px] text-slate-700" : "whitespace-nowrap px-3 py-3 text-[13px] text-slate-700"}>{typeof children === "string" || typeof children === "number" ? safeDisplayText(children) : children}</td>; }
