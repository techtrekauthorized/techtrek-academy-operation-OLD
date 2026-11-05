"use client";

import { useMemo, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { Modal, useToast } from "@/components/ui/overlays";
import { Button, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { safeDisplayText } from "@/lib/display";
import type { TrainingOperationsData } from "@/types/operations";

type Track = TrainingOperationsData["deliveryTracks"][number];
type Level = TrainingOperationsData["deliveryTrackLevels"][number];
type Mapping = TrainingOperationsData["offeringMappings"][number];
type Editor = { kind: "track"; row?: Track } | { kind: "level"; row?: Level } | { kind: "mapping"; row?: Mapping };

export function DeliverySetupWorkspace({ data, onRefresh }: { data: TrainingOperationsData; onRefresh: () => Promise<void> }) {
  const { showToast } = useToast();
  const [selectedTrackId, setSelectedTrackId] = useState(data.deliveryTracks[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedId = data.deliveryTracks.some(track => track.id === selectedTrackId) ? selectedTrackId : data.deliveryTracks[0]?.id ?? "";
  const levels = data.deliveryTrackLevels.filter(level => level.deliveryTrackId === selectedId).sort((left, right) => left.sortOrder - right.sortOrder);
  const filteredMappings = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data.offeringMappings;
    return data.offeringMappings.filter(row => `${row.offeringId} ${row.soldTrack} ${row.programScope} ${row.packageLabel} ${row.exactHours} ${row.deliveryTrackName} ${row.notes}`.toLowerCase().includes(query));
  }, [data.offeringMappings, search]);

  const close = () => { if (!saving) { setEditor(undefined); setError(""); } };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || saving) return;
    const form = new FormData(event.currentTarget);
    const isActive = form.get("isActive") === "on";
    let payload: Record<string, unknown>;
    if (editor.kind === "track") payload = { action: editor.row ? "update-track" : "create-track", ...(editor.row ? { id: editor.row.id } : {}), name: form.get("name"), curriculumHours: form.get("curriculumHours"), isActive, notes: form.get("notes") };
    else if (editor.kind === "level") payload = { action: editor.row ? "update-level" : "create-level", ...(editor.row ? { id: editor.row.id } : { deliveryTrackId: selectedId, levelCode: form.get("levelCode") }), levelName: form.get("levelName"), curriculumHours: form.get("curriculumHours"), isActive, notes: form.get("notes") };
    else payload = { action: editor.row ? "update-mapping" : "create-mapping", offeringId: editor.row?.offeringId ?? form.get("offeringId"), deliveryTrackId: form.get("deliveryTrackId"), isActive, notes: form.get("notes") };
    setSaving(true); setError("");
    try {
      const response = await apiFetch<{ result: { message: string; record?: unknown } }>("/api/training-operations/delivery-setup", { method: "POST", body: JSON.stringify(payload) });
      await onRefresh();
      setEditor(undefined);
      showToast(response.result.message);
    } catch (reason) { setError(formatClientApiError(reason)); }
    finally { setSaving(false); }
  };

  const activeTracks = data.deliveryTracks.filter(track => track.isActive && track.id.trim());
  return <div className="space-y-6">
    <SetupSection title="Delivery Tracks" description="Operational curriculum tracks used for delivery planning." action={data.canManageDeliverySetup && <Button size="sm" onClick={() => setEditor({ kind: "track" })}><Plus size={14}/>Add Delivery Track</Button>}>
      {!data.deliveryTracks.length ? <EmptyState title="No Delivery Tracks configured" detail="An administrator can add the first operational Delivery Track."/> : <Table headers={["Delivery Track Name", "Curriculum Hours", "Active Status", "Notes", ...(data.canManageDeliverySetup ? ["Actions"] : [])]}>{data.deliveryTracks.map(row => <tr key={row.clientKey} className="border-b border-slate-100 last:border-0"><Cell><strong>{row.name}</strong><div className="font-mono text-[10px] text-slate-400">{row.id}</div></Cell><Cell>{row.curriculumHours}</Cell><Cell><StatusBadge>{row.isActive ? "Active" : "Inactive"}</StatusBadge></Cell><Cell wrap>{row.notes || "—"}</Cell>{data.canManageDeliverySetup && <Cell><Button size="sm" variant="secondary" onClick={() => setEditor({ kind: "track", row })}><Pencil size={13}/>Edit</Button></Cell>}</tr>)}</Table>}
    </SetupSection>

    <SetupSection title="Track Levels" description="Level 1 and Level 2 curriculum structure for the selected Delivery Track." action={data.canManageDeliverySetup && selectedId && <Button size="sm" onClick={() => setEditor({ kind: "level" })}><Plus size={14}/>Add Level</Button>}>
      {!data.deliveryTracks.length ? <EmptyState title="Delivery Track required" detail="Add a Delivery Track before configuring its levels."/> : <><label className="block border-b border-slate-200 bg-slate-50 p-4"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Delivery Track</span><select className="h-10 w-full max-w-md rounded border border-slate-300 bg-white px-3 text-sm" value={selectedId} onChange={event => setSelectedTrackId(event.target.value)}>{data.deliveryTracks.map(track => <option key={track.clientKey} value={track.id}>{track.name}</option>)}</select></label>{!levels.length ? <EmptyState title="No levels configured for this Delivery Track" detail="An administrator can add Level 1 or Level 2."/> : <Table headers={["Level Code", "Level Name", "Curriculum Hours", "Sort Order", "Active Status", "Notes", ...(data.canManageDeliverySetup ? ["Actions"] : [])]}>{levels.map(row => <tr key={row.clientKey} className="border-b border-slate-100 last:border-0"><Cell><StatusBadge>{row.levelCode.replace("_", " ")}</StatusBadge></Cell><Cell><strong>{row.levelName}</strong><div className="font-mono text-[10px] text-slate-400">{row.id}</div></Cell><Cell>{row.curriculumHours}</Cell><Cell>{row.sortOrder}</Cell><Cell><StatusBadge>{row.isActive ? "Active" : "Inactive"}</StatusBadge></Cell><Cell wrap>{row.notes || "—"}</Cell>{data.canManageDeliverySetup && <Cell><Button size="sm" variant="secondary" onClick={() => setEditor({ kind: "level", row })}><Pencil size={13}/>Edit</Button></Cell>}</tr>)}</Table>}</>}
    </SetupSection>

    <SetupSection title="Offering Mappings" description="Connect sold offerings to operational Delivery Tracks without changing registration or pricing." action={data.canManageDeliverySetup && <Button size="sm" disabled={!activeTracks.length || !data.offerings.length} onClick={() => setEditor({ kind: "mapping" })}><Plus size={14}/>Map Offering</Button>}>
      <label className="relative block border-b border-slate-200 p-4"><span className="sr-only">Search offering mappings</span><Search size={15} className="absolute left-7 top-1/2 -translate-y-1/2 text-slate-400"/><input className="h-10 w-full max-w-md rounded border border-slate-300 pl-9 pr-3 text-sm" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search offering, scope, package, or Delivery Track..."/></label>
      {!data.offeringMappings.length ? <EmptyState title="No Offering mappings configured" detail="An administrator can map a live sold Offering to an active Delivery Track."/> : !filteredMappings.length ? <EmptyState title="No matching Offering mappings" detail="Try a different search term."/> : <Table headers={["Offering ID", "Sold Track", "Program Scope / University", "Package Label", "Exact Hours", "Delivery Track", "Active Status", "Notes", ...(data.canManageDeliverySetup ? ["Actions"] : [])]}>{filteredMappings.map(row => <tr key={row.clientKey} className="border-b border-slate-100 last:border-0"><Cell><span className="font-mono text-xs">{row.offeringId}</span></Cell><Cell><strong>{row.soldTrack}</strong></Cell><Cell>{row.programScope}</Cell><Cell>{row.packageLabel}</Cell><Cell>{row.exactHours || "—"}</Cell><Cell>{row.deliveryTrackName}</Cell><Cell><StatusBadge>{row.isActive ? "Active" : "Inactive"}</StatusBadge></Cell><Cell wrap>{row.notes || "—"}</Cell>{data.canManageDeliverySetup && <Cell>{row.isActive ? <Button size="sm" variant="secondary" onClick={() => setEditor({ kind: "mapping", row })}><Pencil size={13}/>Edit Mapping</Button> : <span className="text-xs text-slate-400">Inactive</span>}</Cell>}</tr>)}</Table>}
    </SetupSection>

    <EditorModal editor={editor} activeTracks={activeTracks} offerings={data.offerings} selectedTrackId={selectedId} saving={saving} error={error} onClose={close} onSubmit={submit}/>
  </div>;
}

function EditorModal({ editor, activeTracks, offerings, selectedTrackId, saving, error, onClose, onSubmit }: { editor?: Editor; activeTracks: Track[]; offerings: TrainingOperationsData["offerings"]; selectedTrackId: string; saving: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const title = !editor ? "" : editor.kind === "track" ? `${editor.row ? "Edit" : "Add"} Delivery Track` : editor.kind === "level" ? `${editor.row ? "Edit" : "Add"} Track Level` : editor.row ? "Edit Offering Mapping" : "Map Offering";
  return <Modal open={Boolean(editor)} onClose={onClose} title={title} footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button form="delivery-setup-form" type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button></>}>
    {editor && <form id="delivery-setup-form" onSubmit={onSubmit} className="space-y-4">
      {editor.kind === "track" && <><TextField name="name" label="Delivery Track Name" required defaultValue={editor.row?.name}/><TextField name="curriculumHours" label="Curriculum Hours" type="number" min="0.01" step="0.01" required defaultValue={editor.row?.curriculumHours}/><ActiveField defaultChecked={editor.row?.isActive ?? true}/><NotesField defaultValue={editor.row?.notes}/></>}
      {editor.kind === "level" && <>{editor.row ? <ReadOnly label="Level Code" value={editor.row.levelCode.replace("_", " ")}/> : <SelectField name="levelCode" label="Level Code" required defaultValue="" options={[{ value: "LEVEL_1", label: "Level 1" }, { value: "LEVEL_2", label: "Level 2" }]}/>}<TextField name="levelName" label="Level Name" required defaultValue={editor.row?.levelName}/><TextField name="curriculumHours" label="Curriculum Hours" type="number" min="0.01" step="0.01" required defaultValue={editor.row?.curriculumHours}/>{editor.row && <ReadOnly label="Sort Order" value={String(editor.row.sortOrder)}/>}<ActiveField defaultChecked={editor.row?.isActive ?? true}/><NotesField defaultValue={editor.row?.notes}/></>}
      {editor.kind === "mapping" && <>{editor.row ? <ReadOnly label="Existing Offering" value={`${editor.row.offeringId}  -  ${editor.row.soldTrack}`}/> : <SelectField name="offeringId" label="Existing Offering" required defaultValue="" options={offerings.map(offering => ({ key: offering.clientKey, value: offering.offeringId, label: `${offering.offeringId}  -  ${offering.soldTrack}  -  ${offering.programScope}  -  ${offering.packageLabel}  -  ${offering.exactHours}H${offering.isActive ? "" : "  -  Inactive"}` }))}/>}<SelectField name="deliveryTrackId" label="Delivery Track" required defaultValue={editor.row?.deliveryTrackId ?? selectedTrackId} options={activeTracks.map(track => ({ key: track.clientKey, value: track.id, label: track.name }))}/><ActiveField defaultChecked={editor.row?.isActive ?? true}/><NotesField defaultValue={editor.row?.notes}/></>}
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </form>}
  </Modal>;
}

function SetupSection({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) { return <section className="overflow-hidden rounded border border-slate-200 bg-white"><header className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3"><div><h2 className="heading text-base font-bold">{title}</h2><p className="mt-0.5 text-xs text-slate-500">{description}</p></div>{action}</header>{children}</section>; }
function Table({ headers, children }: { headers: string[]; children: ReactNode }) { return <div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[800px] border-collapse text-start"><thead><tr className="border-b border-slate-200">{headers.map(header => <th key={header} className="whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Cell({ children, wrap = false }: { children: ReactNode; wrap?: boolean }) { return <td className={wrap ? "max-w-xs whitespace-normal px-3 py-3 text-[13px] text-slate-700" : "whitespace-nowrap px-3 py-3 text-[13px] text-slate-700"}>{typeof children === "string" || typeof children === "number" ? safeDisplayText(children) : children}</td>; }
function TextField(props: InputHTMLAttributes<HTMLInputElement> & { label: string }) { const { label, ...input } = props; return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}{input.required && <span className="text-red-700"> *</span>}</span><input {...input} className="h-10 w-full rounded border border-slate-300 px-3 text-sm focus:border-red-500"/></label>; }
function NotesField({ defaultValue }: { defaultValue?: string }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Notes</span><textarea name="notes" defaultValue={defaultValue} rows={3} className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-red-500"/></label>; }
function ActiveField({ defaultChecked }: { defaultChecked: boolean }) { return <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input name="isActive" type="checkbox" defaultChecked={defaultChecked} className="size-4 accent-red-700"/>Is Active</label>; }
function SelectField({ name, label, required, defaultValue, options }: { name: string; label: string; required?: boolean; defaultValue: string; options: Array<{ key?: string; value: string; label: string }> }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{safeDisplayText(label)}{required && <span className="text-red-700"> *</span>}</span><select name={name} required={required} defaultValue={defaultValue} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm"><option value="">Select {safeDisplayText(label)}</option>{options.map(option => <option key={option.key ?? option.value} value={option.value}>{safeDisplayText(option.label)}</option>)}</select></label>; }
function ReadOnly({ label, value }: { label: string; value: string }) { return <div><div className="mb-1.5 text-xs font-semibold text-slate-700">{safeDisplayText(label)}</div><div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{safeDisplayText(value)}</div></div>; }
