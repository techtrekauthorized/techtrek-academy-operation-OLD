"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil, Plus } from "lucide-react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { Modal, useToast } from "@/components/ui/overlays";
import { Breadcrumbs, Button, Card, EmptyState, ErrorState, KpiCard, LinkButton, LoadingState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import type { TrainingOperationsData } from "@/types/operations";
import type { AttendanceScheduleData } from "@/types/attendance";
import { joinDisplay, readableEnum, safeDisplayText } from "@/lib/display";

type Session = TrainingOperationsData["sessions"][number];
type AttendanceScheduleEvent = AttendanceScheduleData["events"][number];
type StaffAssignment = TrainingOperationsData["staffAssignments"][number];
const SESSION_STATUSES = ["PLANNED", "COMPLETED", "CANCELLED", "RESCHEDULED"];
const cleanDisplay = safeDisplayText;
const emptyDisplay = safeDisplayText;
const readable = readableEnum;
const sessionTeamLabel = (label: string, team?: { staffName: string }) => `${label}: ${teamName(team)}`;
const monthTitle = (date: Date) => new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
const dateKey = (year: number, month: number, day: number) => { const date = new Date(year, month, day); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };

function useScheduleData() {
  const [data, setData] = useState<TrainingOperationsData>(); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setError(""); try { const response = await apiFetch<{ operations: TrainingOperationsData }>("/api/training-operations"); setData(response.operations); } catch (reason) { setError(formatClientApiError(reason)); } finally { setLoading(false); } }, []);
  useEffect(() => { let active = true; apiFetch<{ operations: TrainingOperationsData }>("/api/training-operations").then(response => { if (active) setData(response.operations); }).catch(reason => { if (active) setError(formatClientApiError(reason)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  return { data, loading, error, load };
}

function useAttendanceScheduleData() {
  const [data, setData] = useState<AttendanceScheduleData>(); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setError(""); try { const response = await apiFetch<{ schedule: AttendanceScheduleData }>("/api/schedule/attendance"); setData(response.schedule); } catch (reason) { setError(formatClientApiError(reason)); } finally { setLoading(false); } }, []);
  useEffect(() => { let active = true; apiFetch<{ schedule: AttendanceScheduleData }>("/api/schedule/attendance").then(response => { if (active) setData(response.schedule); }).catch(reason => { if (active) setError(formatClientApiError(reason)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  return { data, loading, error, load };
}

export function SchedulePage() {
  const { data, loading, error, load } = useAttendanceScheduleData();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const today = dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const [filters, setFilters] = useState({ dateView: "month", trackTitle: "", deliveryMode: "", levelCode: "", status: "", group: "", attendanceCode: "" });
  const [selected, setSelected] = useState<AttendanceScheduleEvent>();
  const [selectedDay, setSelectedDay] = useState("");
  const allEvents = data?.events ?? [];
  const filtered = useMemo(() => allEvents.filter(session => {
    const inMonth = session.date.startsWith(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`);
    return (filters.dateView === "all" || (filters.dateView === "today" ? session.date === today : inMonth))
      && (!filters.trackTitle || [session.track, session.title].includes(filters.trackTitle))
      && (!filters.deliveryMode || session.deliveryMode === filters.deliveryMode)
      && (!filters.levelCode || session.levelCode === filters.levelCode)
      && (!filters.status || session.status === filters.status)
      && (!filters.group || session.groupIds.includes(filters.group))
      && (!filters.attendanceCode || session.attendanceCode.toLowerCase().includes(filters.attendanceCode.toLowerCase()));
  }).sort((left, right) => left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime)), [allEvents, filters, month, today]);
  const calendarDays = buildCalendarDays(month);
  const daySessions = selectedDay ? filtered.filter(session => session.date === selectedDay) : [];
  const trackTitleOptions = uniqueOptions(allEvents.flatMap(session => [session.track, session.title]));
  const groupOptions = uniqueGroupOptions(allEvents);
  if (loading) return <LoadingState/>;
  if (error || !data) return <><ErrorState/><div className="flex justify-center"><Button variant="secondary" onClick={() => void load()}>Retry</Button></div></>;
  return <><PageHeader eyebrow="Attendance Schedule" title="Master Schedule" description="Live display from Attendance_Sessions and Attendance_Session_Groups." actions={data.canManageSessions && <LinkButton href="/schedule/new"><Plus size={15}/>Create Session</LinkButton>}/>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Visible Sessions" value={String(filtered.length)}/><KpiCard label="Today Sessions" value={String(data.events.filter(item => item.date === today).length)}/><KpiCard label="Completed Sessions" value={String(filtered.filter(item => item.status === "COMPLETED").length)}/><KpiCard label="Related Groups" value={String(new Set(filtered.flatMap(item => item.groupIds)).size)}/></div>
    <Card className="mt-5 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div className="flex items-center gap-2"><Button size="sm" variant="secondary" aria-label="Previous Month" onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft size={15}/></Button><Button size="sm" variant="secondary" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</Button><Button size="sm" variant="secondary" aria-label="Next Month" onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight size={15}/></Button></div><h2 className="heading text-lg font-bold">{monthTitle(month)}</h2></div>
      <div className="grid gap-3 border-b p-4 sm:grid-cols-2 xl:grid-cols-7"><Filter label="Date View" value={filters.dateView} onChange={dateView => setFilters(current => ({ ...current, dateView }))} options={[{ value: "month", label: "Visible Month" }, { value: "today", label: "Today" }, { value: "all", label: "All" }]}/><Filter label="Track or Title" value={filters.trackTitle} onChange={trackTitle => setFilters(current => ({ ...current, trackTitle }))} options={trackTitleOptions}/><Filter label="Delivery Mode" value={filters.deliveryMode} onChange={deliveryMode => setFilters(current => ({ ...current, deliveryMode }))} options={uniqueOptions(allEvents.map(session => session.deliveryMode))}/><Filter label="Level Code" value={filters.levelCode} onChange={levelCode => setFilters(current => ({ ...current, levelCode }))} options={uniqueOptions(allEvents.map(session => session.levelCode))}/><Filter label="Status" value={filters.status} onChange={status => setFilters(current => ({ ...current, status }))} options={uniqueOptions(allEvents.map(session => session.status))}/><Filter label="Group" value={filters.group} onChange={group => setFilters(current => ({ ...current, group }))} options={groupOptions}/><label><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Attendance Code</span><input value={filters.attendanceCode} onChange={event => setFilters(current => ({ ...current, attendanceCode: event.target.value }))} placeholder="Search code" className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm"/></label></div>
      {!data.events.length ? <EmptyState title="No attendance sessions have been scheduled yet." detail="Attendance_Sessions has no active rows yet."/> : !filtered.length ? <EmptyState title="No attendance sessions match this view" detail="Change the date view or adjust the schedule filters."/> : <><div className="hidden grid-cols-7 border-b bg-slate-50 md:grid">{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(day => <div key={day} className="border-e px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500 last:border-e-0">{day}</div>)}</div><div className="hidden grid-cols-7 md:grid">{calendarDays.map(day => { const sessions = day.inMonth ? filtered.filter(item => item.date === day.key) : []; return <div key={day.key} className={day.inMonth ? "min-h-32 border-b border-e p-2 last:border-e-0" : "min-h-32 border-b border-e bg-slate-50/70 p-2 text-slate-300"}><button className="mb-1 text-xs font-semibold" onClick={() => sessions.length && setSelectedDay(day.key)}>{day.day}</button><div className="space-y-1">{sessions.slice(0, 3).map(session => <button key={session.id} onClick={() => setSelected(session)} className={`block w-full rounded border px-2 py-1 text-start text-[10px] ${statusStyle(session.status)}`}><strong>{cleanDisplay(session.startTime)}</strong><span className="block truncate">{cleanDisplay(session.title || session.track || session.attendanceCode)}</span><span className="block truncate opacity-80">{joinDisplay(" | ", session.levelCode, session.deliveryMode)}</span><span className="block truncate font-mono opacity-80">Code: {cleanDisplay(session.attendanceCode)}</span></button>)}{sessions.length > 3 && <button className="text-[10px] font-bold text-red-700" onClick={() => setSelectedDay(day.key)}>+{sessions.length - 3} more</button>}</div></div>; })}</div><div className="divide-y md:hidden">{filtered.map(session => <button key={session.id} onClick={() => setSelected(session)} className="flex w-full items-start gap-3 p-4 text-start"><div className="w-16 shrink-0 rounded bg-slate-100 py-2 text-center"><strong className="block text-xs">{session.date === "Invalid date" ? "-" : session.date.slice(8)}</strong><span className="text-[9px] uppercase text-slate-500">{cleanDisplay(session.date)}</span></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{cleanDisplay(session.title || session.track || session.attendanceCode)}</strong><StatusBadge>{readable(session.status)}</StatusBadge></div><p className="mt-1 text-xs text-slate-500">{joinDisplay(" | ", `${cleanDisplay(session.startTime)} - ${cleanDisplay(session.endTime)}`, session.levelCode, session.deliveryMode, `S${cleanDisplay(session.sessionNumber)}`, `Code: ${cleanDisplay(session.attendanceCode)}`)}</p><p className="mt-1 text-xs text-slate-500">{joinDisplay(" | ", `${session.groupNames.length} groups`, session.groupNames.join(" | "), session.location)}</p></div></button>)}</div></>}
    </Card>
    <Modal open={Boolean(selectedDay)} onClose={() => setSelectedDay("")} title={selectedDay ? `Attendance Sessions | ${selectedDay}` : "Attendance Sessions"}>{daySessions.length ? <div className="space-y-2">{daySessions.map(session => <button key={session.id} onClick={() => { setSelectedDay(""); setSelected(session); }} className="w-full rounded border border-slate-200 p-3 text-start hover:border-red-300"><strong className="text-sm">{cleanDisplay(session.startTime)} - {cleanDisplay(session.title || session.track || session.attendanceCode)}</strong><p className="mt-1 text-xs text-slate-500">{joinDisplay(" | ", session.levelCode, session.deliveryMode, `Code: ${cleanDisplay(session.attendanceCode)}`)}</p><p className="mt-1 text-xs text-slate-500">{joinDisplay(" | ", `${session.groupNames.length} groups`, session.groupNames.join(" | "))}</p></button>)}</div> : <EmptyState title="No sessions"/>}</Modal>
    <AttendanceSessionDetails session={selected} onClose={() => setSelected(undefined)}/>
  </>;
}

function AttendanceSessionDetails({ session, onClose }: { session?: AttendanceScheduleEvent; onClose: () => void }) {
  return <Modal open={Boolean(session)} onClose={onClose} title="Attendance Session Details" footer={session && <Button variant="secondary" onClick={onClose}>Close</Button>}>{session && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Info label="Date" value={session.date || "Invalid date"}/><Info label="Time" value={`${cleanDisplay(session.startTime)} - ${cleanDisplay(session.endTime)}`}/><Info label="Session Number" value={session.sessionNumber}/><Info label="Session Title / Track" value={session.title || session.track}/><Info label="Level Code" value={session.levelCode}/><Info label="Delivery Mode" value={session.deliveryMode}/><Info label="Location" value={session.location}/><Info label="Instructor" value={session.instructor}/><Info label="Mentor" value={session.mentor}/><Info label="Attendance Code" value={session.attendanceCode}/><Info label="Status" value={readable(session.status)}/><Info label="Notes" value={session.notes}/></div><section className="rounded border border-slate-200 p-3"><h3 className="heading text-sm font-bold">Related Groups</h3>{session.groupNames.length ? <div className="mt-3 flex flex-wrap gap-2">{session.groupNames.map((name, index) => <span key={`${session.groupIds[index] || name}-${index}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">{cleanDisplay(name)}</span>)}</div> : <p className="mt-2 text-sm text-slate-500">No related groups mapped.</p>}</section></div>}</Modal>;
}

export function NewSessionPage() {
  const router = useRouter(); const { data, loading, error } = useScheduleData();
  if (loading) return <LoadingState/>;
  const hasEligibleBatch = data?.batches.some(batch => ["PLANNED", "ACTIVE"].includes(batch.status) && data.deliveryTracks.some(track => track.id === batch.deliveryTrackId && track.isActive) && data.batchLevels.some(level => level.batchId === batch.id && ["PLANNED", "ACTIVE"].includes(level.status)));
  return <><Breadcrumbs items={[{ label: "Schedule", href: "/schedule" }, { label: "Create Session" }]}/><PageHeader eyebrow="Session Planning" title="Create Session" description="Create a shared teaching session for one operational Batch Level."/><Card className="mb-5 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Create Session still uses the old Sessions module. Attendance schedule creation will be updated later.</Card>{error || !data ? <ErrorState/> : !hasEligibleBatch ? <Card><EmptyState title="No active or planned Batch is available." detail="Create a Batch and configure its Levels first."/></Card> : <Card className="p-5"><SessionForm data={data} submitLabel="Create Session" onSaved={() => router.push("/schedule")}/></Card>}</>;
}

export function SessionDetailPage({ sessionId }: { sessionId: string }) {
  const { data, loading, error, load } = useScheduleData(); const [editing, setEditing] = useState(false);
  if (loading) return <LoadingState/>;
  const session = data?.sessions.find(item => item.id === sessionId);
  return <><Breadcrumbs items={[{ label: "Schedule", href: "/schedule" }, { label: "Session Detail" }]}/><PageHeader title="Session Detail" description="Live session context from Google Sheets."/>{error ? <ErrorState/> : !data || !session ? <Card><EmptyState title="Session not found" detail="The requested Session reference is unavailable."/></Card> : <Card className="p-5"><SessionDetailContent session={session}/>{data.canManageSessions && <Button className="mt-5" onClick={() => setEditing(true)}><Pencil size={14}/>Edit Session</Button>}</Card>}<Modal open={editing} onClose={() => setEditing(false)} title="Edit Session">{data && session && <SessionForm data={data} initial={session} submitLabel="Save Session" onSaved={async () => { await load(); setEditing(false); }}/>}</Modal></>;
}

function SessionForm({ data, initial, submitLabel, onSaved }: { data: TrainingOperationsData; initial?: Session; submitLabel: string; onSaved: () => void | Promise<void> }) {
  const { showToast } = useToast();
  const [trackId, setTrackId] = useState(initial?.deliveryTrackId ?? "");
  const [batchId, setBatchId] = useState(initial?.batchId ?? "");
  const [levelId, setLevelId] = useState(initial?.batchLevelId ?? "");
  const [number, setNumber] = useState(initial ? String(initial.sessionNumber) : "");
  const [date, setDate] = useState(initial?.sessionDate ?? "");
  const [start, setStart] = useState(normalizeInputTime(initial?.startTime ?? ""));
  const [end, setEnd] = useState(normalizeInputTime(initial?.endTime ?? ""));
  const [title, setTitle] = useState(initial?.title ?? "");
  const [status, setStatus] = useState(initial?.status ?? "PLANNED");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [leadAssignmentId, setLeadAssignmentId] = useState(initial?.leadAssignmentId ?? "");
  const [assistantAssignmentId, setAssistantAssignmentId] = useState(initial?.assistantAssignmentId ?? "");
  const [mentorAssignmentId, setMentorAssignmentId] = useState(initial?.mentorAssignmentId ?? "");
  const [teamNotice, setTeamNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tracks = data.deliveryTracks.filter(track => track.isActive);
  const batches = data.batches.filter(batch => batch.deliveryTrackId === trackId && ["PLANNED", "ACTIVE"].includes(batch.status));
  const levels = data.batchLevels.filter(level => level.batchId === batchId && ["PLANNED", "ACTIVE"].includes(level.status));
  const selectedLevel = data.batchLevels.find(level => level.id === levelId);
  const activeStaffIds = new Set(data.staff.filter(staff => staff.isActive).map(staff => staff.id));
  const eligibleAssignments = data.staffAssignments.filter(assignment => assignment.isActive && assignment.batchId === batchId && activeStaffIds.has(assignment.staffId) && (!assignment.batchLevelId || assignment.batchLevelId === levelId));
  const leadOptions = eligibleAssignments.filter(assignment => ["INSTRUCTOR", "ASSISTANT"].includes(assignment.role) && ![assistantAssignmentId, mentorAssignmentId].includes(assignment.id));
  const assistantOptions = eligibleAssignments.filter(assignment => assignment.role === "ASSISTANT" && ![leadAssignmentId, mentorAssignmentId].includes(assignment.id));
  const mentorOptions = eligibleAssignments.filter(assignment => assignment.role === "MENTOR" && ![leadAssignmentId, assistantAssignmentId].includes(assignment.id));
  const duration = calculateDuration(start, end);
  const dateWarning = Boolean(date && selectedLevel && ((selectedLevel.startDate && date < selectedLevel.startDate) || (selectedLevel.endDate && date > selectedLevel.endDate)));

  const changeTrack = (value: string) => { setTrackId(value); setBatchId(""); setLevelId(""); setNumber(""); setLeadAssignmentId(""); setAssistantAssignmentId(""); setMentorAssignmentId(""); setTeamNotice(""); };
  const changeBatch = (value: string) => { setBatchId(value); setLevelId(""); setNumber(""); setLeadAssignmentId(""); setAssistantAssignmentId(""); setMentorAssignmentId(""); setTeamNotice(""); };
  const changeLevel = (value: string) => {
    setLevelId(value);
    const used = data.sessions.filter(session => session.batchLevelId === value && session.id !== initial?.id).map(session => session.sessionNumber);
    setNumber(String(Math.max(0, ...used) + 1));
    const eligibleForLevel = (assignmentId: string, roles: string[]) => !assignmentId || data.staffAssignments.some(assignment => assignment.id === assignmentId && assignment.isActive && assignment.batchId === batchId && activeStaffIds.has(assignment.staffId) && (!assignment.batchLevelId || assignment.batchLevelId === value) && roles.includes(assignment.role));
    const messages: string[] = [];
    if (!eligibleForLevel(leadAssignmentId, ["INSTRUCTOR", "ASSISTANT"])) { setLeadAssignmentId(""); messages.push("Lead Trainer was cleared because it is not eligible for this Batch Level."); }
    if (!eligibleForLevel(assistantAssignmentId, ["ASSISTANT"])) { setAssistantAssignmentId(""); messages.push("Assistant was cleared because it is not eligible for this Batch Level."); }
    if (!eligibleForLevel(mentorAssignmentId, ["MENTOR"])) { setMentorAssignmentId(""); messages.push("Mentor was cleared because it is not eligible for this Batch Level."); }
    setTeamNotice(messages.join(" "));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    try {
      const response = await apiFetch<{ result: { message: string } }>("/api/training-operations/session-setup", { method: "POST", body: JSON.stringify({ action: initial ? "update-session" : "create-session", ...(initial ? { id: initial.id } : {}), deliveryTrackId: trackId, batchId, batchLevelId: levelId, sessionNumber: number, sessionDate: date, startTime: start, endTime: end, title, status, notes, leadAssignmentId, assistantAssignmentId, mentorAssignmentId }) });
      showToast(response.result.message);
      await onSaved();
    } catch (reason) { setError(formatClientApiError(reason)); }
    finally { setSaving(false); }
  };

  return <form onSubmit={submit} className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><SelectField label="Delivery Track" value={trackId} onChange={changeTrack} options={tracks.map(track => ({ value: track.id, label: cleanDisplay(track.name) }))}/><SelectField label="Batch" value={batchId} onChange={changeBatch} disabled={!trackId} options={batches.map(batch => ({ value: batch.id, label: joinDisplay(" | ", batch.name, batch.intake) }))}/><SelectField label="Batch Level" value={levelId} onChange={changeLevel} disabled={!batchId} options={levels.map(level => ({ value: level.id, label: joinDisplay(" | ", level.levelName, readable(level.status)) }))}/><InputField label="Session Number" type="number" min="1" step="1" value={number} onChange={setNumber}/><InputField label="Session Date" type="date" value={date} onChange={setDate}/><InputField label="Start Time" type="time" value={start} onChange={setStart}/><InputField label="End Time" type="time" value={end} onChange={setEnd}/><ReadOnlyField label="Duration Hours" value={duration > 0 ? duration.toFixed(2) : "Select valid start and end times"}/><InputField label="Session Title" value={title} onChange={setTitle}/><SelectField label="Session Status" value={status} onChange={setStatus} options={SESSION_STATUSES.map(value => ({ value, label: readable(value) }))}/></div>{dateWarning && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">This date is outside the planned Batch Level range ({selectedLevel?.startDate} to {selectedLevel?.endDate}). You may still save it.</p>}<section className="rounded border border-slate-200 bg-slate-50/60 p-4"><div className="mb-3"><h3 className="heading text-sm font-bold text-slate-900">Session Team</h3><p className="mt-1 text-xs text-slate-500">Choose active Batch Staff Assignments for the selected Batch Level. Staff rates are not shown here.</p></div><div className="grid gap-4 md:grid-cols-3"><TeamSelect label="Lead Trainer" required={status !== "CANCELLED"} value={leadAssignmentId} onChange={setLeadAssignmentId} options={leadOptions} disabled={!levelId}/><TeamSelect label="Assistant" value={assistantAssignmentId} onChange={setAssistantAssignmentId} options={assistantOptions} disabled={!levelId}/><TeamSelect label="Mentor" value={mentorAssignmentId} onChange={setMentorAssignmentId} options={mentorOptions} disabled={!levelId}/></div>{levelId && !eligibleAssignments.length && <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">No eligible active staff assignments are configured for this Batch Level.</p>}{levelId && !assistantOptions.length && <p className="mt-3 text-xs text-slate-500">No active assistant assignment is available for this batch level.</p>}{levelId && !mentorOptions.length && <p className="mt-1 text-xs text-slate-500">No active mentor assignment is available for this batch level.</p>}{teamNotice && <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{teamNotice}</p>}</section><label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Notes</span><textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} className="w-full rounded border border-slate-300 px-3 py-2 text-sm"/></label>{error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div className="flex justify-end"><Button type="submit" disabled={saving}>{saving ? "Saving..." : submitLabel}</Button></div></form>;
}
function SessionDetails({ session, onClose, onEdit }: { session?: Session; onClose: () => void; onEdit: () => void }) { return <Modal open={Boolean(session)} onClose={onClose} title="Session Details" footer={session && <><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={onEdit}><Pencil size={14}/>Edit Session</Button></>}>{session && <SessionDetailContent session={session}/>}</Modal>; }
function SessionDetailContent({ session }: { session: Session }) {
  const hasTeam = Boolean(session.leadTrainer || session.assistant || session.mentor);
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Info label="Session Title" value={session.title}/><Info label="Session Date" value={session.sessionDate}/><Info label="Day Name" value={session.dayName}/><Info label="Time" value={`${cleanDisplay(session.startTime)} - ${cleanDisplay(session.endTime)}`}/><Info label="Duration Hours" value={String(session.durationHours)}/><Info label="Delivery Track" value={session.deliveryTrackName}/><Info label="Batch" value={session.batchName}/><Info label="Level" value={joinDisplay(" | ", session.levelName, readable(session.levelCode))}/><Info label="Session Number" value={String(session.sessionNumber)}/><Info label="Session Status" value={readable(session.status)}/><Info label="Attendance Rule" value={readable(session.attendanceRule)}/><Info label="Notes" value={emptyDisplay(session.notes)}/></div><section className="rounded border border-slate-200 p-3"><h3 className="heading text-sm font-bold">Session Team</h3>{hasTeam ? <div className="mt-3 grid gap-3 sm:grid-cols-3"><Info label="Lead Trainer" value={teamWithRole(session.leadTrainer)}/><Info label="Assistant" value={teamWithRole(session.assistant)}/><Info label="Mentor" value={teamWithRole(session.mentor)}/></div> : <p className="mt-2 text-sm text-slate-500">Session team not assigned yet.</p>}</section></div>;
}
function buildCalendarDays(month: Date) { const year = month.getFullYear(); const monthIndex = month.getMonth(); const firstWeekday = new Date(year, monthIndex, 1).getDay(); const daysInMonth = new Date(year, monthIndex + 1, 0).getDate(); const previousDays = new Date(year, monthIndex, 0).getDate(); return Array.from({ length: 42 }, (_, index) => { const dayOffset = index - firstWeekday + 1; if (dayOffset < 1) return { key: dateKey(year, monthIndex - 1, previousDays + dayOffset), day: previousDays + dayOffset, inMonth: false }; if (dayOffset > daysInMonth) return { key: dateKey(year, monthIndex + 1, dayOffset - daysInMonth), day: dayOffset - daysInMonth, inMonth: false }; return { key: dateKey(year, monthIndex, dayOffset), day: dayOffset, inMonth: true }; }); }
function calculateDuration(start: string, end: string) { const parse = (value: string) => { const [hours, minutes] = value.split(":").map(Number); return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0; }; const difference = parse(end) - parse(start); return difference > 0 ? difference / 60 : 0; }
function normalizeInputTime(value: string) { const match = /^(\d{2}):(\d{2})/.exec(value); return match ? `${match[1]}:${match[2]}` : ""; }
function teamName(team?: { staffName: string }) { return team?.staffName ? cleanDisplay(team.staffName) : "Not Assigned"; }
function teamWithRole(team?: { staffName: string; role: string }) { return team ? team.role ? `${cleanDisplay(team.staffName)} - ${readable(team.role)}` : cleanDisplay(team.staffName || "Unknown Staff") : "Not Assigned"; }
function statusStyle(status: string) { if (status === "COMPLETED") return "border-emerald-200 bg-emerald-50 text-emerald-800"; if (status === "CANCELLED") return "border-slate-200 bg-slate-100 text-slate-500 line-through"; if (status === "RESCHEDULED") return "border-amber-200 bg-amber-50 text-amber-800"; return "border-red-200 bg-red-50 text-red-800"; }
function uniqueOptions(values: string[]) { return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort().map(value => ({ value, label: cleanDisplay(value) })); }
function uniqueGroupOptions(events: AttendanceScheduleEvent[]) {
  const options = new Map<string, string>();
  for (const event of events) event.groupIds.forEach((id, index) => { if (id) options.set(id, event.groupNames[index] || id); });
  return [...options.entries()].sort((left, right) => left[1].localeCompare(right[1])).map(([value, label]) => ({ value, label: cleanDisplay(label) }));
}
function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) { return <label><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm"><option value="">All {label}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function TeamSelect({ label, value, onChange, options, required = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: StaffAssignment[]; required?: boolean; disabled?: boolean }) { return <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label} {required && <span className="text-red-700">*</span>}</span><select required={required} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"><option value="">{required ? `Select ${label}` : "Not Assigned"}</option>{options.map(option => <option key={option.id} value={option.id}>{cleanDisplay(option.staffName)} - {readable(option.role)}</option>)}</select></label>; }
function SelectField({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean }) { return <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label} <span className="text-red-700">*</span></span><select required value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"><option value="">Select {label}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function InputField({ label, value, onChange, type = "text", min, step }: { label: string; value: string; onChange: (value: string) => void; type?: string; min?: string; step?: string }) { return <label><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label} <span className="text-red-700">*</span></span><input required type={type} value={value} min={min} step={step} onChange={event => onChange(event.target.value)} className="h-10 w-full rounded border border-slate-300 px-3 text-sm"/></label>; }
function ReadOnlyField({ label, value }: { label: string; value: string }) { return <div><div className="mb-1.5 text-xs font-semibold text-slate-700">{label}</div><div className="min-h-10 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{value}</div></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded border border-slate-200 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-sm font-semibold text-slate-800">{emptyDisplay(value)}</div></div>; }
