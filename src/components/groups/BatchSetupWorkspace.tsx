"use client";

import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { Pencil, Plus } from "lucide-react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { Modal, useToast } from "@/components/ui/overlays";
import { Button, Card, EmptyState, KpiCard, StatusBadge } from "@/components/ui/primitives";
import { readableEnum, safeDisplayText } from "@/lib/display";
import type { TrainingOperationsData } from "@/types/operations";

type Batch = TrainingOperationsData["batches"][number];
type BatchLevel = TrainingOperationsData["batchLevels"][number];
type Editor = { kind: "batch"; row?: Batch } | { kind: "level"; row: BatchLevel };
const STATUSES = ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"];
const LOCATIONS = ["Alexandria", "Cairo"];
const ATTENDANCE_RULES = ["ONLINE_ONLY", "OFFLINE_ONLY", "ONLINE_OR_OFFLINE"];
const readable = (value: string) => readableEnum(value);

export function BatchSetupWorkspace({ data, onRefresh }: { data: TrainingOperationsData; onRefresh: () => Promise<void> }) {
  const { showToast } = useToast();
  const [selectedBatchId, setSelectedBatchId] = useState(data.batches[0]?.id ?? "");
  const [editor, setEditor] = useState<Editor>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedId = data.batches.some(batch => batch.id === selectedBatchId) ? selectedBatchId : data.batches[0]?.id ?? "";
  const selectedBatch = data.batches.find(batch => batch.id === selectedId);
  const levels = data.batchLevels.filter(level => level.batchId === selectedId);
  const activeTracks = data.deliveryTracks.filter(track => track.isActive);
  const summary = {
    total: data.batches.length,
    planned: data.batches.filter(batch => batch.status.trim().toUpperCase() === "PLANNED").length,
    active: data.batches.filter(batch => batch.status.trim().toUpperCase() === "ACTIVE").length,
    completed: data.batches.filter(batch => batch.status.trim().toUpperCase() === "COMPLETED").length,
    levels: data.batchLevels.length,
  };

  const close = () => { if (!saving) { setEditor(undefined); setError(""); } };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || saving) return;
    const form = new FormData(event.currentTarget);
    const payload = editor.kind === "batch"
      ? { action: editor.row ? "update-batch" : "create-batch", ...(editor.row ? { id: editor.row.id } : { deliveryTrackId: form.get("deliveryTrackId"), intake: form.get("intake") }), name: form.get("name"), startDate: form.get("startDate"), endDate: form.get("endDate"), status: form.get("status"), location: form.get("location"), notes: form.get("notes") }
      : { action: "update-batch-level", id: editor.row.id, levelName: form.get("levelName"), startDate: form.get("startDate"), endDate: form.get("endDate"), curriculumHours: form.get("curriculumHours"), plannedLiveHours: form.get("plannedLiveHours"), projectAssignmentHours: form.get("projectAssignmentHours"), sessionCount: form.get("sessionCount"), attendanceRule: form.get("attendanceRule"), status: form.get("status"), notes: form.get("notes") };
    setSaving(true); setError("");
    try {
      const response = await apiFetch<{ result: { message: string; batchId?: string } }>("/api/training-operations/batch-setup", { method: "POST", body: JSON.stringify(payload) });
      await onRefresh();
      if (response.result.batchId) setSelectedBatchId(response.result.batchId);
      setEditor(undefined);
      showToast(response.result.message);
    } catch (reason) { setError(formatClientApiError(reason)); }
    finally { setSaving(false); }
  };

  return <div className="space-y-5">
    {!data.batchLocationConfigured && <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Batches is missing required setup header: Batch_Location. Add Batch_Location to the Batches sheet before creating or editing Batch Location.</Card>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><KpiCard label="Total Batches" value={String(summary.total)}/><KpiCard label="Planned Batches" value={String(summary.planned)}/><KpiCard label="Active Batches" value={String(summary.active)}/><KpiCard label="Completed Batches" value={String(summary.completed)}/><KpiCard label="Total Batch Levels" value={String(summary.levels)}/></div>

    <section className="overflow-hidden rounded border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3"><div><h2 className="heading text-base font-bold">Batches</h2><p className="mt-0.5 text-xs text-slate-500">Live delivery batches and their generated level structure.</p></div>{data.canManageBatchSetup && <Button size="sm" disabled={!activeTracks.length} onClick={() => setEditor({ kind: "batch" })}><Plus size={14}/>Add Batch</Button>}</header>
      {!data.batches.length ? <EmptyState title="No Batches configured" detail={activeTracks.length ? "An administrator can create the first Batch from an active Delivery Track." : "Configure an active Delivery Track and its levels before creating a Batch."}/> : <Table headers={["Batch Name", "Batch Location", "Delivery Track", "Intake", "Start Date", "End Date", "Status", "Number of Levels", "Notes", "View", ...(data.canManageBatchSetup ? ["Actions"] : [])]}>{data.batches.map(row => <tr key={row.id} className={selectedId === row.id ? "border-b border-red-100 bg-red-50/40" : "border-b border-slate-100 last:border-0"}><Cell><strong>{row.name}</strong><div className="font-mono text-[10px] text-slate-400">{row.id}</div></Cell><Cell>{row.location}</Cell><Cell>{row.deliveryTrackName}</Cell><Cell>{row.intake}</Cell><Cell>{row.startDate}</Cell><Cell>{row.endDate}</Cell><Cell><StatusBadge>{readable(row.status)}</StatusBadge></Cell><Cell>{row.levelCount}</Cell><Cell wrap>{row.notes || "-"}</Cell><Cell><Button size="sm" variant="ghost" onClick={() => setSelectedBatchId(row.id)}>View Levels</Button></Cell>{data.canManageBatchSetup && <Cell><Button size="sm" variant="secondary" onClick={() => setEditor({ kind: "batch", row })}><Pencil size={13}/>Edit</Button></Cell>}</tr>)}</Table>}
    </section>

    <section className="overflow-hidden rounded border border-slate-200 bg-white">
      <header className="border-b bg-slate-50 px-4 py-3"><h2 className="heading text-base font-bold">Batch Detail</h2><p className="mt-0.5 text-xs text-slate-500">Operational planning values are managed independently for each Batch Level.</p></header>
      {!selectedBatch ? <EmptyState title="Select a Batch" detail="Choose a Batch to view its information and levels."/> : <><div className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-6"><Info label="Batch" value={selectedBatch.name}/><Info label="Batch Location" value={selectedBatch.location}/><Info label="Delivery Track" value={selectedBatch.deliveryTrackName}/><Info label="Intake" value={selectedBatch.intake}/><Info label="Date Range" value={`${selectedBatch.startDate} - ${selectedBatch.endDate}`}/><Info label="Status" value={readable(selectedBatch.status)}/></div>{!levels.length ? <EmptyState title="No Batch Levels found" detail="This Batch does not currently have linked Batch Level records."/> : <Table headers={["Level Code", "Level Name", "Start Date", "End Date", "Curriculum Hours", "Planned Live Hours", "Project / Assignment Hours", "Session Count", "Attendance Rule", "Status", "Notes", ...(data.canManageBatchSetup ? ["Actions"] : [])]}>{levels.map(row => <tr key={row.id} className="border-b border-slate-100 last:border-0"><Cell><StatusBadge>{readable(row.levelCode)}</StatusBadge></Cell><Cell><strong>{row.levelName}</strong><div className="font-mono text-[10px] text-slate-400">{row.id}</div></Cell><Cell>{row.startDate}</Cell><Cell>{row.endDate}</Cell><Cell>{row.curriculumHours}</Cell><Cell>{row.plannedLiveHours}</Cell><Cell>{row.projectAssignmentHours}</Cell><Cell>{row.sessionCount}</Cell><Cell><StatusBadge>{readable(row.attendanceRule)}</StatusBadge></Cell><Cell><StatusBadge>{readable(row.status)}</StatusBadge></Cell><Cell wrap>{row.notes || "-"}</Cell>{data.canManageBatchSetup && <Cell><Button size="sm" variant="secondary" onClick={() => setEditor({ kind: "level", row })}><Pencil size={13}/>Edit</Button></Cell>}</tr>)}</Table>}</>}
    </section>

    <BatchEditorModal editor={editor} activeTracks={activeTracks} currentIntake={data.currentIntake} saving={saving} error={error} onClose={close} onSubmit={submit}/>
  </div>;
}

function BatchEditorModal({ editor, activeTracks, currentIntake, saving, error, onClose, onSubmit }: { editor?: Editor; activeTracks: TrainingOperationsData["deliveryTracks"]; currentIntake: string; saving: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const title = !editor ? "" : editor.kind === "batch" ? `${editor.row ? "Edit" : "Add"} Batch` : "Edit Batch Level";
  return <Modal open={Boolean(editor)} onClose={onClose} title={title} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button form="batch-setup-form" type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button></>}>
    {editor && <form id="batch-setup-form" onSubmit={onSubmit} className="space-y-4">
      {editor.kind === "batch" && <><TextField name="name" label="Batch Name" required defaultValue={editor.row?.name}/>{editor.row ? <><ReadOnly label="Delivery Track" value={editor.row.deliveryTrackName}/><ReadOnly label="Intake" value={editor.row.intake}/></> : <><SelectField name="deliveryTrackId" label="Delivery Track" required options={activeTracks.map(track => ({ value: track.id, label: track.name }))}/><TextField name="intake" label="Intake" required defaultValue={currentIntake}/></>}<div className="grid gap-3 sm:grid-cols-2"><TextField name="startDate" label="Start Date" type="date" required defaultValue={editor.row?.startDate}/><TextField name="endDate" label="End Date" type="date" required defaultValue={editor.row?.endDate}/></div><SelectField name="status" label="Status" required defaultValue={editor.row?.status ?? "PLANNED"} options={STATUSES.map(value => ({ value, label: readable(value) }))}/><SelectField name="location" label="Batch Location" required defaultValue={editor.row?.location === "Unassigned Location" ? "" : editor.row?.location} options={LOCATIONS.map(value => ({ value, label: value }))}/><NotesField defaultValue={editor.row?.notes}/></>}
      {editor.kind === "level" && <><ReadOnly label="Batch" value={editor.row.batchName}/><ReadOnly label="Level Code" value={readable(editor.row.levelCode)}/><TextField name="levelName" label="Level Name" required defaultValue={editor.row.levelName}/><div className="grid gap-3 sm:grid-cols-2"><TextField name="startDate" label="Start Date" type="date" required defaultValue={editor.row.startDate}/><TextField name="endDate" label="End Date" type="date" required defaultValue={editor.row.endDate}/></div><TextField name="curriculumHours" label="Curriculum Hours" type="number" min="0.01" step="0.01" required defaultValue={editor.row.curriculumHours}/><div className="grid gap-3 sm:grid-cols-3"><TextField name="plannedLiveHours" label="Planned Live Hours" type="number" min="0" step="0.01" required defaultValue={editor.row.plannedLiveHours}/><TextField name="projectAssignmentHours" label="Project / Assignment Hours" type="number" min="0" step="0.01" required defaultValue={editor.row.projectAssignmentHours}/><TextField name="sessionCount" label="Session Count" type="number" min="0" step="1" required defaultValue={editor.row.sessionCount}/></div><SelectField name="attendanceRule" label="Attendance Rule" required defaultValue={editor.row.attendanceRule} options={ATTENDANCE_RULES.map(value => ({ value, label: readable(value) }))}/><SelectField name="status" label="Status" required defaultValue={editor.row.status} options={STATUSES.map(value => ({ value, label: readable(value) }))}/><NotesField defaultValue={editor.row.notes}/></>}
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </form>}
  </Modal>;
}

function Table({ headers, children }: { headers: string[]; children: ReactNode }) { return <div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[860px] border-collapse text-start"><thead><tr className="border-b border-slate-200">{headers.map(header => <th key={header} className="whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Cell({ children, wrap = false }: { children: ReactNode; wrap?: boolean }) { return <td className={wrap ? "max-w-xs whitespace-normal px-3 py-3 text-[13px] text-slate-700" : "whitespace-nowrap px-3 py-3 text-[13px] text-slate-700"}>{typeof children === "string" || typeof children === "number" ? safeDisplayText(children) : children}</td>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded border border-slate-200 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{safeDisplayText(label)}</div><div className="mt-1 text-sm font-semibold text-slate-800">{safeDisplayText(value)}</div></div>; }
function TextField(props: InputHTMLAttributes<HTMLInputElement> & { label: string }) { const { label, ...input } = props; return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}{input.required && <span className="text-red-700"> *</span>}</span><input {...input} className="h-10 w-full rounded border border-slate-300 px-3 text-sm focus:border-red-500"/></label>; }
function SelectField({ name, label, required, defaultValue = "", options }: { name: string; label: string; required?: boolean; defaultValue?: string; options: Array<{ value: string; label: string }> }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}{required && <span className="text-red-700"> *</span>}</span><select name={name} required={required} defaultValue={defaultValue} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm"><option value="">Select {label}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function NotesField({ defaultValue }: { defaultValue?: string }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Notes</span><textarea name="notes" defaultValue={defaultValue} rows={3} className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-red-500"/></label>; }
function ReadOnly({ label, value }: { label: string; value: string }) { return <div><div className="mb-1.5 text-xs font-semibold text-slate-700">{label}</div><div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{value}</div></div>; }
