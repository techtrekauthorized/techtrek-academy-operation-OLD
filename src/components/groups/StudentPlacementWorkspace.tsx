"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Users } from "lucide-react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { Modal, useToast } from "@/components/ui/overlays";
import { Button, EmptyState, KpiCard, StatusBadge } from "@/components/ui/primitives";
import { safeDisplayText } from "@/lib/display";
import type { TrainingOperationsData } from "@/types/operations";

type Placement = TrainingOperationsData["placementQueue"][number];
type Group = TrainingOperationsData["groups"][number];

const readable = (value: string) => value ? value.toLowerCase().split("_").map(word => word[0]?.toUpperCase() + word.slice(1)).join(" ") : "-";
const normalizeLabel = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const idValue = (value: unknown) => String(value ?? "").trim();
const codeValue = (value: unknown) => String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
const isOpenStatus = (value: unknown) => ["PLANNED", "ACTIVE"].includes(codeValue(value));
const isKnownAttendanceRule = (value: unknown) => ["ONLINE_ONLY", "OFFLINE_ONLY", "ONLINE_OR_OFFLINE"].includes(codeValue(value));
const levelSelectionValue = (value: unknown) => {
  const normalized = codeValue(value);
  return ["BOTH_LEVELS", "LEVEL_1", "LEVEL_2"].includes(normalized) ? normalized : "";
};
const studentUniversityLabel = (value: string) => safeDisplayText(value, "-");

export function StudentPlacementWorkspace({ data, onRefresh }: { data: TrainingOperationsData; onRefresh: () => Promise<void> }) {
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [studentUniversity, setStudentUniversity] = useState("");
  const [selected, setSelected] = useState<Placement>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const studentUniversityOptions = useMemo(() => [...new Set(data.placementQueue.map(row => studentUniversityLabel(row.studentUniversity)))].sort(), [data.placementQueue]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.placementQueue.filter(row => {
      if (row.groupId) return false;
      return (!query || `${row.studentName} ${row.academyStudentId} ${row.enrollmentId} ${row.phone}`.toLowerCase().includes(query))
        && (!studentUniversity || studentUniversityLabel(row.studentUniversity) === studentUniversity);
    });
  }, [data.placementQueue, search, studentUniversity]);
  const summary = {
    unplaced: data.placementQueue.filter(row => !row.groupId).length,
    needs: data.placementQueue.filter(row => row.placementStatuses.includes("NEEDS_LEVEL_SELECTION")).length,
    ready: data.placementQueue.filter(row => row.placementStatuses.includes("READY_TO_PLACE") && !row.placementStatuses.includes("CONFIGURATION_REQUIRED")).length,
    placed: data.placementQueue.filter(row => Boolean(row.groupId)).length,
    configuration: data.placementQueue.filter(row => row.placementStatuses.includes("CONFIGURATION_REQUIRED")).length,
  };
  const save = async (levelSelection: string, groupId: string) => {
    if (!selected || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch<{ result: { message: string } }>("/api/training-operations/student-placement", { method: "POST", body: JSON.stringify({ enrollmentId: selected.enrollmentId, levelSelection, groupId }) });
      await onRefresh();
      setSelected(undefined);
      showToast(response.result.message);
    } catch (reason) {
      setError(formatClientApiError(reason));
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><KpiCard label="Unplaced Enrollments" value={String(summary.unplaced)}/><KpiCard label="Needs Level Selection" value={String(summary.needs)}/><KpiCard label="Ready to Place" value={String(summary.ready)}/><KpiCard label="Placed Enrollments" value={String(summary.placed)}/><KpiCard label="Configuration Required" value={String(summary.configuration)}/></div>
    <section className="overflow-hidden rounded border border-slate-200 bg-white">
      <header className="border-b bg-slate-50 px-4 py-3"><h2 className="heading text-base font-bold">Placement Queue</h2><p className="mt-0.5 text-xs text-slate-500">Each row is one live enrollment. Placed enrollments are hidden from this queue after placement.</p></header>
      <div className="grid gap-3 border-b p-4 md:grid-cols-2">
        <label>
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Search</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Student name, Academy ID, Enrollment ID, or phone" className="h-10 w-full rounded border border-slate-300 px-3 text-sm"/>
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Student University</span>
          <select value={studentUniversity} onChange={event => setStudentUniversity(event.target.value)} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm">
            <option value="">All Student Universities</option>
            {studentUniversityOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </div>
      {!data.placementQueue.length ? <EmptyState title="No enrollments available for placement" detail="The queue will populate from live Enrollments and Students records."/> : !filtered.length ? <EmptyState title="No enrollments match this view" detail="Adjust the search or Student University filter."/> : <Table headers={["Student", "Enrollment ID", "Sold Track", "Program Scope / University", "Package", "Hours", "Delivery Mode", "Current Level", "Current Group", "Placement Status", "Actions"]}>{filtered.map(row => <tr key={row.enrollmentId} className="border-b border-slate-100 last:border-0"><Cell><strong>{row.studentName}</strong><div className="font-mono text-[10px] text-slate-400">{row.academyStudentId}</div></Cell><Cell><span className="font-mono text-xs">{row.enrollmentId}</span></Cell><Cell>{row.soldTrack}</Cell><Cell>{row.programScope}</Cell><Cell>{row.packageLabel}</Cell><Cell>{row.creditHours}</Cell><Cell><StatusBadge>{readable(row.deliveryMode)}</StatusBadge></Cell><Cell>{readable(row.levelSelection)}</Cell><Cell>{row.currentGroupName || "-"}</Cell><Cell><div className="flex max-w-xs flex-wrap gap-1">{row.placementStatuses.map(status => <StatusBadge key={status} tone={status === "CONFIGURATION_REQUIRED" ? "warning" : status === "PLACED" ? "success" : undefined}>{readable(status)}</StatusBadge>)}</div>{row.configurationMessage && <div className="mt-1 max-w-xs text-[10px] text-amber-700">{row.configurationMessage}</div>}</Cell><Cell><Button size="sm" disabled={!canOpenPlacement(row)} onClick={() => { setError(""); setSelected(row); }}>{row.groupId ? "Update Placement" : "Place Student"}</Button></Cell></tr>)}</Table>}
    </section>
    {selected && <PlacementModal key={selected.enrollmentId} enrollment={selected} data={data} saving={saving} error={error} onClose={() => !saving && setSelected(undefined)} onConfirm={save}/>}
  </div>;
}

function PlacementModal({ enrollment, data, saving, error, onClose, onConfirm }: { enrollment: Placement; data: TrainingOperationsData; saving: boolean; error: string; onClose: () => void; onConfirm: (selection: string, groupId: string) => Promise<void> }) {
  const fullProgram = normalizeLabel(enrollment.packageLabel) === "full program";
  const initialLevelSelection = levelSelectionValue(enrollment.levelSelection);
  const [levelSelection, setLevelSelection] = useState(fullProgram ? "BOTH_LEVELS" : ["LEVEL_1", "LEVEL_2"].includes(initialLevelSelection) ? initialLevelSelection : "");
  const [batchId, setBatchId] = useState(data.groups.find(group => idValue(group.id) === idValue(enrollment.groupId))?.batchId ?? "");
  const [groupId, setGroupId] = useState(enrollment.groupId);
  const requiredLevelCodes = levelSelection === "BOTH_LEVELS" ? ["LEVEL_1", "LEVEL_2"] : levelSelection ? [levelSelection] : [];
  const eligibleBatches = data.batches.filter(batch => idValue(batch.deliveryTrackId) === idValue(enrollment.deliveryTrackId) && isOpenStatus(batch.status) && requiredLevelCodes.length > 0 && requiredLevelCodes.every(code => data.batchLevels.some(level => idValue(level.batchId) === idValue(batch.id) && codeValue(level.levelCode) === code && isOpenStatus(level.status) && isKnownAttendanceRule(level.attendanceRule))));
  const compatibleGroups = data.groups.filter(group => idValue(group.batchId) === idValue(batchId) && isOpenStatus(group.status) && levelSelectionValue(group.levelSelection) === levelSelection && groupCompliesWithBatchRules(group, data.batchLevels) && attendanceMatches(group, enrollment.deliveryMode, levelSelection) && (!group.capacity || group.assignedStudentsCount - (idValue(group.id) === idValue(enrollment.groupId) ? 1 : 0) < group.capacity));
  const selectedBatch = data.batches.find(batch => idValue(batch.id) === idValue(batchId));
  const selectedGroup = compatibleGroups.find(group => idValue(group.id) === idValue(groupId));
  const deliveryMode = codeValue(enrollment.deliveryMode);
  const hardBlock = !enrollment.deliveryTrackId ? "This offering has not been mapped to an operational Delivery Track yet." : !["ONLINE", "OFFLINE", "HYBRID"].includes(deliveryMode) ? "This enrollment requires a Delivery Mode before operational placement." : !fullProgram && deliveryMode === "HYBRID" ? "A single-level enrollment cannot be placed with Hybrid delivery mode." : "";
  const changeLevel = (value: string) => { setLevelSelection(value); setBatchId(""); setGroupId(""); };
  const changeBatch = (value: string) => { setBatchId(value); setGroupId(""); };
  return <Modal open onClose={onClose} title={enrollment.groupId ? "Update Placement" : "Place Student"} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving || Boolean(hardBlock) || !selectedGroup} onClick={() => void onConfirm(levelSelection, groupId)}>{saving ? "Saving..." : "Confirm Placement"}</Button></>}>
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{["Enrollment Context", "Delivery Track", "Batch", "Level Selection", "Compatible Group", "Confirm Placement"].map((step, index) => <span className="flex items-center gap-1" key={step}>{index > 0 && <ArrowRight size={11}/>}<span>{step}</span></span>)}</div>
      <section><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Enrollment Context</h3><div className="grid gap-2 sm:grid-cols-2"><Info label="Student" value={enrollment.studentName}/><Info label="Academy Student ID" value={enrollment.academyStudentId}/><Info label="Enrollment ID" value={enrollment.enrollmentId}/><Info label="Sold Track" value={enrollment.soldTrack}/><Info label="Offering ID" value={enrollment.offeringId}/><Info label="Package / Hours" value={`${enrollment.packageLabel}  -  ${enrollment.creditHours}H`}/><Info label="Delivery Mode" value={readable(enrollment.deliveryMode)}/><Info label="Current Placement" value={`${readable(enrollment.levelSelection)}  -  ${enrollment.currentGroupName || "Unplaced"}`}/></div></section>
      <section><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Resolved Delivery Track</h3><Info label="Delivery Track" value={enrollment.deliveryTrackName}/>{hardBlock && <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{hardBlock}</p>}</section>
      {!hardBlock && <><section><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Level Selection</h3>{fullProgram ? <Info label="Locked for Full Program" value="Both Levels"/> : <SelectField label="Level Selection" value={levelSelection} onChange={changeLevel} options={[{ value: "LEVEL_1", label: "Level 1" }, { value: "LEVEL_2", label: "Level 2" }]}/>}</section><section><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Eligible Batch</h3><SelectField label="Batch" value={batchId} onChange={changeBatch} disabled={!levelSelection} options={eligibleBatches.map(batch => ({ value: batch.id, label: `${batch.name}  -  ${batch.intake}  -  ${batch.startDate} to ${batch.endDate}  -  ${readable(batch.status)}` }))}/></section><section><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Compatible Group</h3>{batchId && !compatibleGroups.length ? <EmptyState title="No compatible active group is available for this enrollment." detail="Check Group capacity, level selection, and attendance configuration."/> : <div className="space-y-2">{compatibleGroups.map(group => <button type="button" key={group.id} onClick={() => setGroupId(group.id)} className={groupId === group.id ? "w-full rounded border border-red-500 bg-red-50 p-3 text-start" : "w-full rounded border border-slate-200 p-3 text-start hover:border-red-300"}><div className="flex items-center justify-between gap-3"><strong className="text-sm">{group.name}</strong><StatusBadge>{readable(group.status)}</StatusBadge></div><div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2"><span>Batch: {group.batchName}</span><span>Level: {readable(group.levelSelection)}</span><span>Level 1: {readable(group.level1AttendanceMode)}</span><span>Level 2: {readable(group.level2AttendanceMode)}</span><span className="flex items-center gap-1"><Users size={12}/>{group.assignedStudentsCount} / {group.capacity || "Unlimited"}</span></div></button>)}</div>}</section>{selectedGroup && selectedBatch && <section className="rounded border border-emerald-200 bg-emerald-50 p-4"><h3 className="text-sm font-bold text-emerald-900">Placement Summary</h3><div className="mt-3 grid gap-2 sm:grid-cols-2"><Info label="Student" value={enrollment.studentName}/><Info label="Enrollment ID" value={enrollment.enrollmentId}/><Info label="Delivery Track" value={enrollment.deliveryTrackName}/><Info label="Batch" value={selectedBatch.name}/><Info label="Level Selection" value={readable(levelSelection)}/><Info label="Group" value={selectedGroup.name}/><Info label="Level 1 Mode" value={readable(selectedGroup.level1AttendanceMode)}/><Info label="Level 2 Mode" value={readable(selectedGroup.level2AttendanceMode)}/></div></section>}</>}
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </div>
  </Modal>;
}

function canOpenPlacement(row: Placement) { const mode = codeValue(row.deliveryMode); return Boolean(idValue(row.deliveryTrackId)) && ["ONLINE", "OFFLINE", "HYBRID"].includes(mode) && !(normalizeLabel(row.packageLabel) !== "full program" && mode === "HYBRID"); }
function attendanceMatches(group: Group, deliveryMode: string, selection: string) { const mode = codeValue(deliveryMode); const level1Mode = codeValue(group.level1AttendanceMode); const level2Mode = codeValue(group.level2AttendanceMode); if (mode === "HYBRID") return selection === "BOTH_LEVELS" && level1Mode === "OFFLINE" && level2Mode === "ONLINE"; if (selection === "BOTH_LEVELS") return level1Mode === mode && level2Mode === mode; if (selection === "LEVEL_1") return level1Mode === mode; if (selection === "LEVEL_2") return level2Mode === mode; return false; }
function groupCompliesWithBatchRules(group: Group, levels: TrainingOperationsData["batchLevels"]) { const groupSelection = levelSelectionValue(group.levelSelection); const required = groupSelection === "BOTH_LEVELS" ? ["LEVEL_1", "LEVEL_2"] : groupSelection ? [groupSelection] : []; return required.length > 0 && required.every(code => { const level = levels.find(item => idValue(item.batchId) === idValue(group.batchId) && codeValue(item.levelCode) === code && isOpenStatus(item.status)); const mode = code === "LEVEL_1" ? codeValue(group.level1AttendanceMode) : codeValue(group.level2AttendanceMode); const rule = codeValue(level?.attendanceRule); return Boolean(level) && (rule === "ONLINE_OR_OFFLINE" ? ["ONLINE", "OFFLINE"].includes(mode) : rule === "ONLINE_ONLY" ? mode === "ONLINE" : rule === "OFFLINE_ONLY" && mode === "OFFLINE"); }); }
function SelectField({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{safeDisplayText(label)} <span className="text-red-700">*</span></span><select value={value} onChange={event => onChange(event.target.value)} disabled={disabled} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"><option value="">Select {safeDisplayText(label)}</option>{options.map(option => <option key={option.value} value={option.value}>{safeDisplayText(option.label)}</option>)}</select></label>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded border border-slate-200 bg-white p-2.5"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{safeDisplayText(label)}</div><div className="mt-1 text-xs font-semibold text-slate-800">{safeDisplayText(value)}</div></div>; }
function Table({ headers, children }: { headers: string[]; children: ReactNode }) { return <div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[1200px] border-collapse text-start"><thead><tr className="border-b border-slate-200">{headers.map(header => <th key={header} className="whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Cell({ children }: { children: ReactNode }) { return <td className="whitespace-nowrap px-3 py-3 text-[13px] text-slate-700">{typeof children === "string" || typeof children === "number" ? safeDisplayText(children) : children}</td>; }
