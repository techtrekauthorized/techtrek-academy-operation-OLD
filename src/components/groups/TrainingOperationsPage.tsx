"use client";

import { useEffect, useState, type ReactNode } from "react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import type { TrainingOperationsData } from "@/types/operations";
import { Card, EmptyState, ErrorState, KpiCard, LoadingState, PageHeader, StatusBadge, Tabs } from "@/components/ui/primitives";
import { DeliverySetupWorkspace } from "@/components/groups/DeliverySetupWorkspace";
import { BatchSetupWorkspace } from "@/components/groups/BatchSetupWorkspace";
import { GroupSetupWorkspace } from "@/components/groups/GroupSetupWorkspace";
import { StudentPlacementWorkspace } from "@/components/groups/StudentPlacementWorkspace";
import { StaffSetupWorkspace } from "@/components/groups/StaffSetupWorkspace";

const TABS = ["Overview", "Delivery Tracks", "Batches & Levels", "Groups", "Schedule", "Staff"];
const readable = (value: string) => value ? value.toLowerCase().split("_").map(word => word[0]?.toUpperCase() + word.slice(1)).join(" ") : "—";
const value = (input: string | number) => input === "" ? "—" : String(input);

export function TrainingOperationsPage() {
  const [activeTab, setActiveTab] = useState("Overview"); const [data, setData] = useState<TrainingOperationsData>(); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { let active = true; apiFetch<{ operations: TrainingOperationsData }>("/api/training-operations").then(result => { if (active) setData(result.operations); }).catch(reason => { if (active) setError(formatClientApiError(reason)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const refresh = async () => { const result = await apiFetch<{ operations: TrainingOperationsData }>("/api/training-operations"); setData(result.operations); };
  return <><PageHeader eyebrow="Academic Delivery  -  Live Google Sheets" title="Training Operations" description="Live delivery tracks, batches, groups, schedules, and staff configuration."/><Card className="overflow-hidden"><Tabs tabs={TABS} active={activeTab} onChange={setActiveTab}/>{loading ? <LoadingState/> : error || !data ? <><ErrorState/><p className="px-5 pb-5 text-sm text-red-700">{error}</p></> : <div className="p-5">{activeTab === "Overview" && <Overview data={data}/>} {activeTab === "Delivery Tracks" && <DeliverySetupWorkspace data={data} onRefresh={refresh}/>} {activeTab === "Batches & Levels" && <BatchSetupWorkspace data={data} onRefresh={refresh}/>} {activeTab === "Groups" && <GroupSetupWorkspace data={data} onRefresh={refresh}/>} {activeTab === "Schedule" && <ScheduleView data={data}/>} {activeTab === "Staff" && <StaffSetupWorkspace data={data} onRefresh={refresh}/>}</div>}</Card></>;
}

export function StudentPlacementPage() {
  const [data, setData] = useState<TrainingOperationsData>(); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { let active = true; apiFetch<{ operations: TrainingOperationsData }>("/api/training-operations").then(result => { if (active) setData(result.operations); }).catch(reason => { if (active) setError(formatClientApiError(reason)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const refresh = async () => { const result = await apiFetch<{ operations: TrainingOperationsData }>("/api/training-operations"); setData(result.operations); };
  return <><PageHeader eyebrow="Students & Enrollments" title="Student Placement" description="Assign existing enrollments to operational batches and groups."/><Card className="p-5">{loading ? <LoadingState/> : error || !data ? <><ErrorState/><p className="px-5 pb-5 text-sm text-red-700">{error}</p></> : <StudentPlacementWorkspace data={data} onRefresh={refresh}/>}</Card></>;
}

function Overview({ data }: { data: TrainingOperationsData }) {
  const readiness = [{ label: "Delivery Tracks", ready: data.deliveryTracks.length > 0 }, { label: "Batches", ready: data.batches.length > 0 }, { label: "Groups", ready: data.groups.length > 0 }, { label: "Schedule", ready: data.sessions.length > 0 }, { label: "Staff", ready: data.staff.length > 0 }];
  const noSetup = readiness.every(item => !item.ready);
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><KpiCard label="Delivery Tracks" value={String(data.summary.deliveryTracks)}/><KpiCard label="Offering Mappings" value={String(data.summary.offeringMappings)}/><KpiCard label="Batches" value={String(data.summary.batches)}/><KpiCard label="Groups" value={String(data.summary.groups)}/><KpiCard label="Scheduled Sessions" value={String(data.summary.scheduledSessions)}/><KpiCard label="Active Staff" value={String(data.summary.activeStaff)}/></div><section className="rounded border border-slate-200"><div className="border-b p-4"><h2 className="heading text-base font-bold">Operational Readiness</h2><p className="mt-1 text-xs text-slate-500">Live readiness based on operational Sheet rows.</p></div><div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">{readiness.map(item => <div key={item.label} className="rounded border border-slate-200 p-3"><div className="text-xs font-semibold text-slate-700">{item.label}</div><div className="mt-2"><StatusBadge tone={item.ready ? "success" : "neutral"}>{item.ready ? "Ready" : "Empty"}</StatusBadge></div></div>)}</div>{noSetup && <div className="border-t"><EmptyState title="No operational setup has been added yet." detail="Start by configuring Delivery Tracks and Batches in the next setup phase."/></div>}</section></div>;
}

function ScheduleView({ data }: { data: TrainingOperationsData }) { return <Section title="Sessions" empty={!data.sessions.length}><ReadOnlyTable rows={data.sessions} getKey={row => row.id} columns={[column<TrainingOperationsData["sessions"][number]>("Session Date", row => row.sessionDate), column<TrainingOperationsData["sessions"][number]>("Day", row => row.dayName), column<TrainingOperationsData["sessions"][number]>("Batch", row => row.batchName), column<TrainingOperationsData["sessions"][number]>("Level", row => row.levelName), column<TrainingOperationsData["sessions"][number]>("Session Number", row => value(row.sessionNumber)), column<TrainingOperationsData["sessions"][number]>("Start Time", row => row.startTime), column<TrainingOperationsData["sessions"][number]>("End Time", row => row.endTime), column<TrainingOperationsData["sessions"][number]>("Duration", row => `${row.durationHours} hrs`), column<TrainingOperationsData["sessions"][number]>("Session Title", row => row.title), column<TrainingOperationsData["sessions"][number]>("Session Status", row => <StatusBadge>{readable(row.status)}</StatusBadge>), column<TrainingOperationsData["sessions"][number]>("Notes", row => value(row.notes), true)]}/></Section>; }

type TableColumn<T> = { header: string; render: (row: T) => ReactNode; wrap?: boolean };
function column<T>(header: string, render: (row: T) => ReactNode, wrap = false): TableColumn<T> { return { header, render, wrap }; }
function Section({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) { return <section className="overflow-hidden rounded border border-slate-200"><div className="border-b bg-slate-50 px-4 py-3"><h2 className="heading text-base font-bold">{title}</h2></div>{empty ? <EmptyState title={`No ${title.toLowerCase()} found`} detail="This operational Sheet currently has no records."/> : children}</section>; }
function ReadOnlyTable<T>({ rows, columns, getKey }: { rows: T[]; columns: TableColumn<T>[]; getKey: (row: T) => string }) { return <div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-start"><thead><tr className="border-b border-slate-200 bg-white">{columns.map(item => <th key={item.header} className="whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{item.header}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={getKey(row)} className="border-b border-slate-100 text-[13px] last:border-0">{columns.map(item => <td key={item.header} className={item.wrap ? "max-w-xs whitespace-normal px-3 py-3 text-slate-700" : "whitespace-nowrap px-3 py-3 text-slate-700"}>{item.render(row)}</td>)}</tr>)}</tbody></table></div>; }
