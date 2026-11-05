"use client";

import { FileSpreadsheet, RefreshCw } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { safeDisplayText } from "@/lib/display";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/overlays";
import { Button, Card, EmptyState, ErrorState, KpiCard, LoadingState, PageHeader, SearchInput, Select, StatusBadge, Tabs } from "@/components/ui/primitives";
import { useAuth } from "@/components/auth/AuthProvider";
import type { AttendanceData, AttendanceFormResponseDto, AttendanceMatrixResponse, AttendanceMatrixStatus, AttendanceSessionDto, AttendanceSessionReviewRow, AttendanceSyncSummary, AttendanceValidatedDto } from "@/types/attendance";
import type { RecordedSessionDto, RecordedSessionsData, RecordedSessionsExistingData, RecordedSessionsFormData } from "@/types/recorded-sessions";

const tabs = ["Overview", "Attendance Sessions", "Form Responses", "Validation Review", "Session Review", "Attendance Matrix"];
const reviewFiltersInitial = { code: "", validation: "", attendance: "", university: "", group: "", date: "" };
const exportColumns: Array<{ header: string; getValue: (row: AttendanceSessionReviewRow) => string }> = [
  { header: "Student Name", getValue: row => row.studentName },
  { header: "Phone", getValue: row => row.phone },
  { header: "Email", getValue: row => row.email },
  { header: "Academy Student ID", getValue: row => row.academyStudentId },
  { header: "University Student ID", getValue: row => row.universityStudentId },
  { header: "Student University", getValue: row => row.studentUniversity },
  { header: "Group Name", getValue: row => row.groupName },
  { header: "Attendance Status", getValue: row => row.attendanceStatus },
  { header: "Validation Status", getValue: row => row.validationStatus },
  { header: "Attendance Code", getValue: row => row.attendanceCode },
];

export function AttendancePage({ initialTab = tabs[0] }: { initialTab?: string } = {}) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [data, setData] = useState<AttendanceData>();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState(initialTab);
  const [reviewFilters, setReviewFilters] = useState(reviewFiltersInitial);
  const [reviewSearch, setReviewSearch] = useState("");
  const [selectedReviewBatchId, setSelectedReviewBatchId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [sessionStudentIdSearch, setSessionStudentIdSearch] = useState("");
  const debouncedSessionStudentIdSearch = useDebouncedValue(sessionStudentIdSearch, 250);
  const [sessionUniversity, setSessionUniversity] = useState("");
  const [sessionGroup, setSessionGroup] = useState("");
  const [sessionAttendanceStatus, setSessionAttendanceStatus] = useState("");
  const [sessionValidationStatus, setSessionValidationStatus] = useState("");
  const [manualSavingKey, setManualSavingKey] = useState("");
  const [syncSummary, setSyncSummary] = useState<AttendanceSyncSummary>();
  const canRunSync = user?.role === "ADMIN" || user?.role === "COORDINATOR";
  const canManualAttendanceAction = user?.role === "ADMIN" || user?.role === "COORDINATOR" || user?.role === "MENTOR";

  useEffect(() => {
    let active = true;
    apiFetch<{ attendance: AttendanceData }>("/api/attendance").then(result => {
      if (!active) return;
      setData(result.attendance);
    }).catch(reason => {
      if (active) setError(formatClientApiError(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const sync = async () => {
    if (syncing) return;
    if (!window.confirm("Sync Google Form responses into Attendance_Validated now?")) return;
    setSyncing(true);
    setError("");
    try {
      const result = await apiFetch<{ summary: AttendanceSyncSummary }>("/api/attendance/sync", { method: "POST" });
      setSyncSummary(result.summary);
      showToast(`Attendance sync complete. Already processed: ${result.summary.alreadyProcessed}. New processed: ${result.summary.newProcessed}. Valid present: ${result.summary.validPresent}. Needs review: ${result.summary.needsReview}.`);
      const refreshed = await apiFetch<{ attendance: AttendanceData }>("/api/attendance");
      setData(refreshed.attendance);
    } catch (reason) {
      setError(formatClientApiError(reason));
      showToast(formatClientApiError(reason));
    } finally {
      setSyncing(false);
    }
  };
  const refreshAttendance = async () => {
    const refreshed = await apiFetch<{ attendance: AttendanceData }>("/api/attendance");
    setData(refreshed.attendance);
  };
  const manualAction = async (row: AttendanceSessionReviewRow, action: "PRESENT" | "EXCUSED" | "NEEDS_REVIEW" | "REJECT") => {
    if (!selectedReview || manualSavingKey) return;
    const note = window.prompt("Optional note", "");
    if (note === null) return;
    const key = manualActionKey(row, action);
    setManualSavingKey(key);
    setError("");
    try {
      const response = await apiFetch<{ result: { message: string } }>("/api/attendance/manual-action", { method: "POST", body: JSON.stringify({ attendanceSessionId: selectedReview.sessionId, enrollmentId: row.enrollmentId, attendanceId: row.attendanceId, sourceResponseRow: row.sourceResponseRow, resolvedAcademyStudentId: row.academyStudentId, action, note: note ?? "" }) });
      showToast(response.result.message);
      await refreshAttendance();
    } catch (reason) {
      const message = formatClientApiError(reason);
      setError(message);
      showToast(message);
    } finally {
      setManualSavingKey("");
    }
  };

  const selectedReview = data?.sessionReviews.find(review => review.sessionId === selectedSessionId);
  const filteredSessionRows = useMemo(() => (selectedReview?.rows ?? []).filter(row => (!sessionUniversity || studentUniversityDisplay(row.studentUniversity) === sessionUniversity)
    && (!sessionGroup || row.groupName === sessionGroup)
    && (!sessionAttendanceStatus || row.attendanceStatus === sessionAttendanceStatus)
    && (!sessionValidationStatus || row.validationStatus === sessionValidationStatus)
    && (!debouncedSessionStudentIdSearch.trim() || row.universityStudentId.toLowerCase().includes(debouncedSessionStudentIdSearch.trim().toLowerCase()))), [debouncedSessionStudentIdSearch, selectedReview, sessionAttendanceStatus, sessionGroup, sessionUniversity, sessionValidationStatus]);
  const filteredSessionSummary = {
    expectedStudents: filteredSessionRows.length,
    presentStudents: filteredSessionRows.filter(row => row.attendanceStatus === "Present").length,
    needsReview: filteredSessionRows.filter(row => row.attendanceStatus === "Needs Review").length,
    absentStudents: filteredSessionRows.filter(row => row.attendanceStatus === "Absent").length,
    excusedStudents: filteredSessionRows.filter(row => row.attendanceStatus === "Excused").length,
  };
  const filteredValidated = useMemo(() => {
    const rows = data?.validated ?? [];
    const query = reviewSearch.trim().toLowerCase();
    return rows.filter(row => {
      const sourceDate = row.sourceTimestamp.slice(0, 10);
      return (!query || [row.studentName, row.inputUniversityStudentId, row.resolvedAcademyStudentId, row.enrollmentId, row.attendanceCode].some(value => value.toLowerCase().includes(query)))
        && (!reviewFilters.code || row.attendanceCode === reviewFilters.code)
        && (!reviewFilters.validation || row.validationStatus === reviewFilters.validation)
        && (!reviewFilters.attendance || row.attendanceStatus === reviewFilters.attendance)
        && (!reviewFilters.university || row.studentUniversity === reviewFilters.university)
        && (!reviewFilters.group || row.resolvedGroupName === reviewFilters.group)
        && (!reviewFilters.date || sourceDate === reviewFilters.date);
    });
  }, [data?.validated, reviewFilters, reviewSearch]);

  const exportSelectedSession = () => {
    if (!selectedReview || !filteredSessionRows.length) return showToast("No selected session rows available to export.");
    const rows = [exportColumns.map(column => column.header), ...filteredSessionRows.map(row => exportColumns.map(column => safeDisplayText(column.getValue(row), "-")))];
    downloadBlob(createXlsxBlob(rows), `attendance_session_${safeFilenamePart(selectedReview.attendanceCode || selectedReview.sessionId)}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast(`Exported ${filteredSessionRows.length} session review rows.`);
  };

  return <>
    <PageHeader eyebrow="Attendance" title="Attendance System" description="Sync Google Form responses, validate attendance, and review session results." actions={<>{canRunSync && <Button onClick={sync} disabled={syncing || loading}><RefreshCw size={14}/>{syncing ? "Syncing..." : "Sync Form Responses"}</Button>}<Button variant="secondary" onClick={exportSelectedSession} disabled={!filteredSessionRows.length}><FileSpreadsheet size={14}/>Export Excel</Button></>}/>
    {error && <div className="mb-5"><ErrorState/><Card className="p-3 text-sm text-red-700">{safeDisplayText(error)}</Card></div>}
    {syncSummary && <Card className="mb-5 p-4"><div className="mb-3"><h2 className="heading text-sm font-bold">Last Sync Summary</h2><p className="text-xs text-slate-500">Source rows are skipped only when already processed or missing required source fields.</p>{syncSummary.newResponsesArrivedDuringSync && <p className="mt-1 text-xs font-semibold text-amber-700">New responses arrived during sync and were processed in an additional pass.</p>}</div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><KpiCard label="Raw Responses" value={String(syncSummary.totalRawResponses)}/><KpiCard label="Already Processed" value={String(syncSummary.alreadyProcessed)}/><KpiCard label="New Processed" value={String(syncSummary.newProcessed)}/><KpiCard label="Valid Present" value={String(syncSummary.validPresent)}/><KpiCard label="Needs Review" value={String(syncSummary.needsReview)}/><KpiCard label="Duplicates" value={String(syncSummary.duplicates)}/><KpiCard label="Invalid Code" value={String(syncSummary.invalidCodes)}/><KpiCard label="Student Not Found" value={String(syncSummary.studentNotFound)}/><KpiCard label="Enrollment Not Found" value={String(syncSummary.enrollmentNotFound)}/><KpiCard label="Not Eligible" value={String(syncSummary.notEligible)}/><KpiCard label="Missing Timestamp" value={String(syncSummary.skippedMissingTimestamp)}/><KpiCard label="Missing Code" value={String(syncSummary.skippedMissingAttendanceCode)}/><KpiCard label="Missing Student ID" value={String(syncSummary.skippedMissingUniversityStudentId)}/><KpiCard label="Errors" value={String(syncSummary.errors)}/><KpiCard label="Last Source Row" value={safeDisplayText(syncSummary.lastProcessedSourceRow, "-")}/></div></Card>}
    {loading ? <Card><LoadingState/></Card> : !data ? <Card><EmptyState title="Attendance data is unavailable" detail="Refresh and try again."/></Card> : <div className="space-y-5">
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab}/>
      {activeTab === "Overview" && <OverviewTab data={data} onCopy={showToast}/>}
      {activeTab === "Attendance Sessions" && <AttendanceSessionsTab rows={data.sessions}/>}
      {activeTab === "Form Responses" && <FormResponsesTab rows={data.formResponses}/>}
      {activeTab === "Validation Review" && <ValidationReviewTab rows={filteredValidated} allRows={data.validated} filters={reviewFilters} search={reviewSearch} onSearch={setReviewSearch} onFilters={setReviewFilters}/>}
      {activeTab === "Session Review" && <SessionReviewTab data={data} selectedBatchId={selectedReviewBatchId} selectedSessionId={selectedSessionId} selected={selectedReview} rows={filteredSessionRows} summary={filteredSessionSummary} studentUniversity={sessionUniversity} group={sessionGroup} studentIdSearch={sessionStudentIdSearch} attendanceStatus={sessionAttendanceStatus} validationStatus={sessionValidationStatus} canManualAction={canManualAttendanceAction} manualSavingKey={manualSavingKey} onManualAction={manualAction} onSelectBatch={batchId => { setSelectedReviewBatchId(batchId); setSelectedSessionId(current => data.sessions.some(session => session.batchId === batchId && session.attendanceSessionId === current) ? current : ""); setSessionStudentIdSearch(""); setSessionUniversity(""); setSessionGroup(""); setSessionAttendanceStatus(""); setSessionValidationStatus(""); }} onSelectSession={setSelectedSessionId} onStudentUniversity={setSessionUniversity} onGroup={setSessionGroup} onStudentIdSearch={setSessionStudentIdSearch} onAttendanceStatus={setSessionAttendanceStatus} onValidationStatus={setSessionValidationStatus} onReset={() => { setSelectedReviewBatchId(""); setSelectedSessionId(""); setSessionStudentIdSearch(""); setSessionUniversity(""); setSessionGroup(""); setSessionAttendanceStatus(""); setSessionValidationStatus(""); }}/> }
      {activeTab === "Attendance Matrix" && <AttendanceMatrixContent/>}
    </div>}
  </>;
}

export function AttendanceRosterPage() {
  return <AttendancePage/>;
}

export function AttendanceMatrixPage() {
  return <><PageHeader eyebrow="Attendance" title="Attendance Matrix" description="Review each student's attendance across completed sessions in a selected Batch."/><AttendanceMatrixContent/></>;
}

function AttendanceMatrixContent() {
  const { showToast } = useToast();
  const [batchId, setBatchId] = useState("");
  const [attendanceSessionId, setAttendanceSessionId] = useState("");
  const [university, setUniversity] = useState("");
  const [groupId, setGroupId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState("");
  const [validationStatus, setValidationStatus] = useState("");
  const debouncedStudentId = useDebouncedValue(studentId, 250);
  const [data, setData] = useState<AttendanceMatrixResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const pageSize = 25;

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (batchId) params.set("batchId", batchId);
    if (attendanceSessionId) params.set("attendanceSessionId", attendanceSessionId);
    if (university) params.set("university", university);
    if (groupId) params.set("groupId", groupId);
    if (debouncedStudentId.trim()) params.set("studentId", debouncedStudentId.trim());
    if (attendanceStatus) params.set("attendanceStatus", attendanceStatus);
    if (validationStatus) params.set("validationStatus", validationStatus);
    apiFetch<{ matrix: AttendanceMatrixResponse }>(`/api/attendance/matrix?${params.toString()}`).then(result => {
      if (!active) return;
      setData(result.matrix);
      setPage(1);
    }).catch(reason => {
      if (active) setError(formatClientApiError(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [attendanceSessionId, attendanceStatus, batchId, debouncedStudentId, groupId, university, validationStatus]);

  const students = data?.students ?? [];
  const pageCount = Math.max(1, Math.ceil(students.length / pageSize));
  const visibleStudents = students.slice((page - 1) * pageSize, page * pageSize);
  const selectedPayload = [...selectedRecords].map(key => { const [selectedStudentId, selectedAttendanceSessionId] = key.split("::"); return { studentId: selectedStudentId, attendanceSessionId: selectedAttendanceSessionId }; });
  const reset = () => { setBatchId(""); setAttendanceSessionId(""); setUniversity(""); setGroupId(""); setStudentId(""); setAttendanceStatus(""); setValidationStatus(""); setSelectedRecords(new Set()); };
  const refresh = async () => {
    const params = new URLSearchParams();
    if (batchId) params.set("batchId", batchId);
    if (attendanceSessionId) params.set("attendanceSessionId", attendanceSessionId);
    if (university) params.set("university", university);
    if (groupId) params.set("groupId", groupId);
    if (debouncedStudentId.trim()) params.set("studentId", debouncedStudentId.trim());
    if (attendanceStatus) params.set("attendanceStatus", attendanceStatus);
    if (validationStatus) params.set("validationStatus", validationStatus);
    const result = await apiFetch<{ matrix: AttendanceMatrixResponse }>(`/api/attendance/matrix?${params.toString()}`);
    setData(result.matrix);
  };
  const markPresent = async (records: Array<{ studentId: string; attendanceSessionId: string }>, label: string) => {
    if (!records.length || saving) return;
    if (!window.confirm(label)) return;
    setSaving(true);
    setError("");
    try {
      const result = await apiFetch<{ result: { updated: number; alreadyPresent: number; message: string } }>("/api/attendance/matrix/mark-present", { method: "POST", body: JSON.stringify({ records, reason: "Manual attendance correction from Attendance Matrix" }) });
      showToast(result.result.message);
      setSelectedRecords(new Set());
      await refresh();
    } catch (reason) {
      setError(formatClientApiError(reason));
      showToast(formatClientApiError(reason));
    } finally {
      setSaving(false);
    }
  };
  const toggleRecord = (studentIdValue: string, sessionId: string) => {
    const key = `${studentIdValue}::${sessionId}`;
    setSelectedRecords(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  return <>
    {error && <div className="mb-5"><ErrorState/><Card className="p-3 text-sm text-red-700">{safeDisplayText(error)}</Card></div>}
    <Card className="mb-5 grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <BatchSelect batches={data?.filters.batches ?? []} value={batchId} onChange={value => { setBatchId(value); setAttendanceSessionId(""); setUniversity(""); setGroupId(""); setAttendanceStatus(""); setValidationStatus(""); setSelectedRecords(new Set()); }}/>
      <MatrixSessionSelect sessions={data?.sessions ?? []} value={attendanceSessionId} onChange={setAttendanceSessionId} disabled={!batchId}/>
      <AttendanceFilterField label="Student ID"><SearchInput value={studentId} onChange={setStudentId} placeholder="Search by Student ID" className="w-full min-w-0"/></AttendanceFilterField>
      <NativeSelectField label="Student University" value={university} disabled={!batchId} onChange={setUniversity} placeholder="All Student Universities" options={(data?.filters.universities ?? []).map(option => ({ value: option.id, label: option.name }))}/>
      <NativeSelectField label="Group" value={groupId} disabled={!batchId} onChange={setGroupId} placeholder="All Groups" options={(data?.filters.groups ?? []).map(option => ({ value: option.id, label: option.name }))}/>
      <NativeSelectField label="Attendance Status" value={attendanceStatus} disabled={!batchId} onChange={setAttendanceStatus} placeholder="All Attendance Statuses" options={["PRESENT", "ABSENT", "PENDING", "EXCUSED"].map(value => ({ value, label: readable(value) }))}/>
      <NativeSelectField label="Validation Status" value={validationStatus} disabled={!batchId} onChange={setValidationStatus} placeholder="All Validation Statuses" options={["Valid", "Manual Present", "Absent", "Manual Excused", "Duplicate", "Not Eligible For Session"].map(value => ({ value, label: value }))}/>
      <div className="flex items-end"><Button type="button" variant="secondary" className="w-full" onClick={reset}>Reset Filters</Button></div>
    </Card>
    {loading ? <Card><LoadingState/></Card> : !batchId ? <Card><EmptyState title="Select a batch to view student attendance." detail="The matrix loads after a Batch is selected."/></Card> : !data ? <Card><EmptyState title="Attendance matrix is unavailable" detail="Refresh and try again."/></Card> : !students.length ? <Card><EmptyState title={debouncedStudentId.trim() || university || groupId ? "No students match the current filters." : "No enrolled students were found for this batch."} detail="Adjust filters or choose another Batch."/></Card> : !data.sessions.length ? <Card><EmptyState title="No completed attendance sessions were found for this batch." detail="Future and content-only seminar sessions are excluded."/></Card> : <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><KpiCard label="Total Students" value={String(data.summary.totalStudents)}/><KpiCard label="Completed Sessions" value={String(data.summary.completedSessions)}/><KpiCard label="Present Records" value={String(data.summary.presentRecords)}/><KpiCard label="Absent Records" value={String(data.summary.absentRecords)}/><KpiCard label="Pending Records" value={String(data.summary.pendingRecords)}/><KpiCard label="Average Attendance" value={data.summary.averageAttendancePercentage === null ? "-" : `${data.summary.averageAttendancePercentage}%`}/></div>
      <Card className="p-3 text-xs text-slate-600"><span className="font-bold">Legend:</span> <span className="ms-2 text-emerald-700">P = Present</span> | <span className="text-red-700">A = Absent</span> | <span className="text-amber-700">Pending</span> | <span className="text-blue-700">E = Excused</span> | <span className="text-slate-400">- = Not Applicable</span> | <span className="text-red-800">checkbox = selected for correction</span></Card>
      {selectedRecords.size > 0 && <Card className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 border-red-200 bg-red-50 p-3"><span className="text-sm font-bold text-red-900">{selectedRecords.size} selected attendance records</span><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setSelectedRecords(new Set())}>Clear Selection</Button><Button type="button" disabled={saving} onClick={() => void markPresent(selectedPayload, `Mark ${selectedRecords.size} selected absent attendance records as Present?`)}>{saving ? "Saving..." : "Mark Selected Present"}</Button></div></Card>}
      <Card className="overflow-hidden"><div className="scrollbar-thin overflow-x-auto"><table className="min-w-[1200px] border-collapse text-start text-xs"><thead className="sticky top-0 z-10"><tr className="border-b bg-slate-50">{["Student ID", "Student Name", "Mobile", "University", "Group", "Package", "Mode", "Eligible", "Attended", "Absent", "Pending", "Attendance %"].map((header, index) => <th key={header} style={matrixStickyStyle(index)} className={`whitespace-nowrap px-3 py-2 font-bold uppercase tracking-wide text-slate-500 ${matrixStickyClass(index, "header")}`}>{header}</th>)}{data.sessions.map(session => <th key={session.attendanceSessionId} title={`${session.title} | ${session.attendanceSessionId} | ${session.date} ${session.startTime}`} className="whitespace-nowrap px-3 py-2 text-center font-bold text-slate-500"><span className="block">S{String(session.sessionNumber).padStart(2, "0")}</span><span className="block">{shortDate(session.date)}</span><span className="block">{session.startTime}</span><span className="block">{readable(session.deliveryMode)}</span></th>)}</tr></thead><tbody>{visibleStudents.map(student => <tr key={`${student.studentId}-${student.groupId}`} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/50">{[student.studentId, student.studentName, student.mobile, student.universityName, student.groupName, student.packageHours ? `${student.packageHours}H` : "-", student.attendanceMode, String(student.eligibleSessionsCount), String(student.presentCount), String(student.absentCount), String(student.pendingCount), student.attendancePercentage === null ? "-" : `${student.attendancePercentage}%`].map((value, index) => <td key={`${student.studentId}-${index}`} style={matrixStickyStyle(index)} className={`whitespace-nowrap px-3 py-2 ${matrixStickyClass(index, "cell")}`}>{safeDisplayText(value, "-")}</td>)}{data.sessions.map(session => <td key={session.attendanceSessionId} className="px-3 py-2 text-center"><MatrixStatusBadge status={student.sessionStatuses[session.attendanceSessionId] ?? "NOT_APPLICABLE"} selected={selectedRecords.has(`${student.studentId}::${session.attendanceSessionId}`)} onToggle={() => toggleRecord(student.studentId, session.attendanceSessionId)} onMarkPresent={() => void markPresent([{ studentId: student.studentId, attendanceSessionId: session.attendanceSessionId }], `Student ID: ${student.studentId}\nStudent Name: ${student.studentName}\nSession: S${session.sessionNumber}\nDate: ${session.date}\nTime: ${session.startTime}\nCurrent status: Absent\nNew status: Present`)} /></td>)}</tr>)}</tbody></table></div><div className="flex items-center justify-between border-t p-3 text-xs text-slate-500"><span>{students.length} students</span><div className="flex items-center gap-2"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Previous</Button><span>Page {page} of {pageCount}</span><Button size="sm" variant="secondary" disabled={page >= pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))}>Next</Button></div></div></Card>
    </div>}
  </>;
}

function OverviewTab({ data, onCopy }: { data: AttendanceData; onCopy: (message: string) => void }) {
  const today = localDateValue();
  const todaysSessions = data.sessions.filter(session => dateOnly(session.sessionDate) === today).sort((left, right) => left.startTime.localeCompare(right.startTime));
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard label="Total Attendance Sessions" value={String(data.overview.totalSessions)}/>
      <KpiCard label="Total Form Responses" value={String(data.overview.totalFormResponses)}/>
      <KpiCard label="Valid Present" value={String(data.overview.validPresent)}/>
      <KpiCard label="Needs Review" value={String(data.overview.needsReview)}/>
      <KpiCard label="Last Sync Time" value={safeDisplayText(data.overview.lastSyncTime, "-")}/>
    </div>
    <Card className="overflow-hidden">
      <div className="border-b bg-slate-50 px-4 py-3"><h2 className="heading text-base font-bold">Today&apos;s Attendance Sessions</h2><p className="text-xs text-slate-500">Copy today attendance codes for students.</p></div>
      {!todaysSessions.length ? <EmptyState title="No attendance sessions scheduled for today." detail="Today codes will appear here when Attendance_Sessions has a matching Session_Date."/> : <div className="divide-y divide-slate-100">{todaysSessions.map(session => <div key={session.attendanceSessionId} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div className="grid gap-1 text-sm md:grid-cols-6 md:items-center md:gap-4"><span className="font-semibold">{safeDisplayText(session.sessionDate, "-")}</span><span>{safeDisplayText(session.startTime, "-")}</span><span>{safeDisplayText(session.endTime, "-")}</span><span>{safeDisplayText(session.sessionTitle || session.trackContext, "-")}</span><span>{safeDisplayText(session.deliveryMode, "-")}</span><span className="font-mono text-xs font-bold text-red-700">{safeDisplayText(session.attendanceCode, "-")}</span></div><Button type="button" variant="secondary" size="sm" onClick={() => copyCode(session.attendanceCode, onCopy)}>Copy Code</Button></div>)}</div>}
    </Card>
  </div>;
}

function AttendanceSessionsTab({ rows }: { rows: AttendanceSessionDto[] }) {
  const [dateView, setDateView] = useState("all");
  const visibleRows = dateView === "today" ? rows.filter(row => dateOnly(row.sessionDate) === localDateValue()) : rows;
  const columns: Column<AttendanceSessionDto>[] = [
    { key: "id", header: "Attendance Session ID", cell: row => row.attendanceSessionId },
    { key: "code", header: "Attendance Code", cell: row => <span className="font-mono text-xs">{row.attendanceCode}</span> },
    { key: "date", header: "Session Date", cell: row => row.sessionDate },
    { key: "start", header: "Start Time", cell: row => row.startTime },
    { key: "end", header: "End Time", cell: row => row.endTime },
    { key: "number", header: "Session Number", cell: row => row.sessionNumber },
    { key: "context", header: "Track / Group Context", cell: row => row.trackContext },
    { key: "status", header: "Status", cell: row => <StatusBadge>{row.status}</StatusBadge> },
  ];
  return <Card className="overflow-hidden"><div className="border-b bg-slate-50 p-4"><label className="block max-w-xs"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Date View</span><select value={dateView} onChange={event => setDateView(event.target.value)} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm"><option value="all">All</option><option value="today">Today</option></select></label></div>{visibleRows.length ? <DataTable rows={visibleRows} columns={columns} getKey={row => row.attendanceSessionId}/> : <EmptyState title="No attendance sessions found" detail={dateView === "today" ? "No attendance sessions scheduled for today." : "Attendance_Sessions has no active table rows yet."}/>}</Card>;
}

function FormResponsesTab({ rows }: { rows: AttendanceFormResponseDto[] }) {
  const columns: Column<AttendanceFormResponseDto>[] = [
    { key: "timestamp", header: "Timestamp", cell: row => row.timestamp },
    { key: "code", header: "Attendance Code", cell: row => row.attendanceCode },
    { key: "studentId", header: "University Student ID", cell: row => row.universityStudentId },
    { key: "phone", header: "Phone", cell: row => row.phone },
    { key: "name", header: "Student Name", cell: row => row.studentName },
  ];
  return <Card>{rows.length ? <DataTable rows={rows} columns={columns} getKey={row => String(row.sourceResponseRow)}/> : <EmptyState title="No form responses found" detail="Attendance_Form_Responses has no raw rows yet."/>}</Card>;
}

function ValidationReviewTab({ rows, allRows, filters, search, onSearch, onFilters }: { rows: AttendanceValidatedDto[]; allRows: AttendanceValidatedDto[]; filters: typeof reviewFiltersInitial; search: string; onSearch: (value: string) => void; onFilters: (value: typeof reviewFiltersInitial) => void }) {
  const columns: Column<AttendanceValidatedDto>[] = [
    { key: "time", header: "Source Timestamp", cell: row => row.sourceTimestamp },
    { key: "code", header: "Attendance Code", cell: row => row.attendanceCode },
    { key: "name", header: "Student Name", cell: row => row.studentName },
    { key: "input", header: "Input University Student ID", cell: row => row.inputUniversityStudentId },
    { key: "academy", header: "Resolved Academy Student ID", cell: row => row.resolvedAcademyStudentId },
    { key: "enrollment", header: "Enrollment ID", cell: row => row.enrollmentId },
    { key: "group", header: "Resolved Group", cell: row => row.resolvedGroupName || row.resolvedGroupId },
    { key: "attendance", header: "Attendance Status", cell: row => <StatusBadge>{row.attendanceStatus}</StatusBadge> },
    { key: "validation", header: "Validation Status", cell: row => <StatusBadge>{row.validationStatus}</StatusBadge> },
    { key: "notes", header: "Notes", cell: row => row.notes },
  ];
  return <Card className="overflow-hidden">
    <div className="grid gap-3 border-b bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-6">
      <SearchInput value={search} onChange={onSearch} placeholder="Search validation rows"/>
      <Select label="Attendance Code" value={filters.code} onChange={code => onFilters({ ...filters, code })} options={unique(allRows.map(row => row.attendanceCode))}/>
      <Select label="Validation Status" value={filters.validation} onChange={validation => onFilters({ ...filters, validation })} options={unique(allRows.map(row => row.validationStatus))}/>
      <Select label="Attendance Status" value={filters.attendance} onChange={attendance => onFilters({ ...filters, attendance })} options={unique(allRows.map(row => row.attendanceStatus))}/>
      <StudentUniversitySelect value={filters.university} onChange={university => onFilters({ ...filters, university })} options={uniqueUniversities(allRows.map(row => row.studentUniversity))}/>
      <Select label="Group" value={filters.group} onChange={group => onFilters({ ...filters, group })} options={unique(allRows.map(row => row.resolvedGroupName))}/>
    </div>
    {rows.length ? <DataTable rows={rows} columns={columns} getKey={row => row.attendanceId}/> : <EmptyState title="No validation rows match this view" detail="Sync form responses or adjust the filters."/>}
  </Card>;
}

function SessionReviewTab({ data, selectedBatchId, selectedSessionId, selected, rows, summary, studentUniversity, group, studentIdSearch, attendanceStatus, validationStatus, canManualAction, manualSavingKey, onManualAction, onSelectBatch, onSelectSession, onStudentUniversity, onGroup, onStudentIdSearch, onAttendanceStatus, onValidationStatus, onReset }: { data: AttendanceData; selectedBatchId: string; selectedSessionId: string; selected?: AttendanceData["sessionReviews"][number]; rows: AttendanceSessionReviewRow[]; summary: { expectedStudents: number; presentStudents: number; needsReview: number; absentStudents: number; excusedStudents: number }; studentUniversity: string; group: string; studentIdSearch: string; attendanceStatus: string; validationStatus: string; canManualAction: boolean; manualSavingKey: string; onManualAction: (row: AttendanceSessionReviewRow, action: "PRESENT" | "EXCUSED" | "NEEDS_REVIEW" | "REJECT") => Promise<void>; onSelectBatch: (value: string) => void; onSelectSession: (value: string) => void; onStudentUniversity: (value: string) => void; onGroup: (value: string) => void; onStudentIdSearch: (value: string) => void; onAttendanceStatus: (value: string) => void; onValidationStatus: (value: string) => void; onReset: () => void }) {
  const sessionOptions = data.sessions.filter(session => session.batchId === selectedBatchId);
  const columns: Column<AttendanceSessionReviewRow>[] = [
    { key: "name", header: "Student Name", cell: row => row.studentName },
    { key: "phone", header: "Phone", cell: row => row.phone },
    { key: "email", header: "Email", cell: row => row.email },
    { key: "academy", header: "Academy Student ID", cell: row => row.academyStudentId },
    { key: "universityId", header: "University Student ID", cell: row => row.universityStudentId },
    { key: "university", header: "Student University", cell: row => row.studentUniversity },
    { key: "group", header: "Group Name", cell: row => row.groupName },
    { key: "attendance", header: "Attendance Status", cell: row => <StatusBadge>{row.attendanceStatus}</StatusBadge> },
    { key: "validation", header: "Validation Status", cell: row => <StatusBadge>{row.validationStatus}</StatusBadge> },
    { key: "manual", header: "Manual Actions", cell: row => canManualAction && ["Absent", "Needs Review"].includes(row.attendanceStatus) ? <ManualActionButtons row={row} savingKey={manualSavingKey} onManualAction={onManualAction}/> : "-" },
  ];
  return <div className="space-y-5">
    <Card className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <BatchSelect batches={data.batches} value={selectedBatchId} onChange={onSelectBatch}/>
      <SessionSelect sessions={sessionOptions} value={selectedSessionId} onChange={onSelectSession} disabled={!selectedBatchId}/>
      <AttendanceFilterField label="Student ID"><SearchInput value={studentIdSearch} onChange={onStudentIdSearch} placeholder="Search by Student ID" className="w-full min-w-0"/></AttendanceFilterField>
      <StudentUniversitySelect value={studentUniversity} onChange={onStudentUniversity} options={uniqueUniversities(selected?.rows.map(row => row.studentUniversity) ?? [])}/>
      <NativeSelectField label="Group" value={group} onChange={onGroup} placeholder="All Groups" options={unique(selected?.rows.map(row => row.groupName) ?? []).map(value => ({ value, label: value }))}/>
      <NativeSelectField label="Attendance Status" value={attendanceStatus} onChange={onAttendanceStatus} placeholder="All Attendance Statuses" options={unique(selected?.rows.map(row => row.attendanceStatus) ?? []).map(value => ({ value, label: value }))}/>
      <NativeSelectField label="Validation Status" value={validationStatus} onChange={onValidationStatus} placeholder="All Validation Statuses" options={unique(selected?.rows.map(row => row.validationStatus) ?? []).map(value => ({ value, label: value }))}/>
      <div className="flex items-end"><Button type="button" variant="secondary" className="w-full" onClick={onReset}>Reset Filters</Button></div>
    </Card>
    {!selectedBatchId || !selectedSessionId ? <Card><EmptyState title="Select a batch and attendance session to review attendance." detail="The review table loads after both filters are selected."/></Card> : <>
      {selected && <Card className="p-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Info label="Batch" value={selected.batchName || selected.batchId}/><Info label="Session" value={selected.sessionTitle || selected.trackContext}/><Info label="Date" value={selected.sessionDate}/><Info label="Time" value={`${safeDisplayText(selected.startTime, "-")} - ${safeDisplayText(selected.endTime, "-")}`}/><Info label="Delivery Mode" value={selected.deliveryMode}/><Info label="Mapped Students" value={String(selected.expectedStudents)}/><Info label="Present" value={String(selected.presentStudents)}/><Info label="Absent" value={String(selected.absentStudents)}/><Info label="Pending" value={String(selected.needsReview)}/></div></Card>}
      {selected && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><KpiCard label="Expected Students" value={String(summary.expectedStudents)}/><KpiCard label="Present Students" value={String(summary.presentStudents)}/><KpiCard label="Excused Students" value={String(summary.excusedStudents)}/><KpiCard label="Needs Review" value={String(summary.needsReview)}/><KpiCard label="Absent Students" value={String(summary.absentStudents)}/></div>}
      <Card>{rows.length ? <DataTable rows={rows} columns={columns} getKey={row => row.attendanceId || row.enrollmentId}/> : <EmptyState title={studentIdSearch.trim() ? "No student found for this Student ID in the selected session." : "No selected session roster"} detail="Adjust the current filters or select another session."/>}</Card>
    </>}
  </div>;
}

function ManualActionButtons({ row, savingKey, onManualAction }: { row: AttendanceSessionReviewRow; savingKey: string; onManualAction: (row: AttendanceSessionReviewRow, action: "PRESENT" | "EXCUSED" | "NEEDS_REVIEW" | "REJECT") => Promise<void> }) {
  const actions: Array<{ action: "PRESENT" | "EXCUSED" | "NEEDS_REVIEW" | "REJECT"; label: string }> = row.attendanceStatus === "Needs Review"
    ? [{ action: "PRESENT", label: "Mark Present" }, { action: "EXCUSED", label: "Mark Excused" }, { action: "REJECT", label: "Reject" }]
    : [{ action: "PRESENT", label: "Mark Present" }, { action: "EXCUSED", label: "Mark Excused" }, { action: "NEEDS_REVIEW", label: "Mark Needs Review" }];
  return <div className="flex flex-wrap gap-1">{actions.map(item => {
    const key = manualActionKey(row, item.action);
    return <Button key={item.action} size="sm" variant="secondary" disabled={Boolean(savingKey)} onClick={() => void onManualAction(row, item.action)}>{savingKey === key ? "Saving..." : item.label}</Button>;
  })}</div>;
}

function manualActionKey(row: AttendanceSessionReviewRow, action: string) {
  return `${row.attendanceId || row.enrollmentId || row.academyStudentId}-${action}`;
}

type RecordingForm = {
  recordingId: string;
  batchId: string;
  attendanceSessionId: string;
  recordingTitle: string;
  provider: "GoogleDrive";
  videoUrl: string;
  videoId: string;
  sessionNumber: string;
  levelCode: string;
  publishStatus: "Draft" | "Published" | "Hidden";
  availableFrom: string;
  availableTo: string;
  isActive: boolean;
  notes: string;
  groupIds: string[];
};

const emptyRecordingForm: RecordingForm = { recordingId: "", batchId: "", attendanceSessionId: "", recordingTitle: "", provider: "GoogleDrive", videoUrl: "", videoId: "", sessionNumber: "", levelCode: "", publishStatus: "Draft", availableFrom: "", availableTo: "", isActive: true, notes: "", groupIds: [] };

export function RecordedSessionsPage() {
  const { showToast } = useToast();
  const [activeContentTab, setActiveContentTab] = useState("Add New");
  const [formData, setFormData] = useState<RecordedSessionsFormData>();
  const [existingData, setExistingData] = useState<RecordedSessionsExistingData>();
  const [loading, setLoading] = useState(true);
  const [existingLoading, setExistingLoading] = useState(false);
  const [existingLoaded, setExistingLoaded] = useState(false);
  const [existingStale, setExistingStale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existingError, setExistingError] = useState("");
  const [form, setForm] = useState<RecordingForm>(emptyRecordingForm);
  const [filters, setFilters] = useState({ batchId: "", groupId: "", publishStatus: "", levelCode: "", search: "" });

  const loadExistingData = async ({ force = false } = {}) => {
    if (existingLoading || (existingLoaded && !existingStale && !force)) return;
    setExistingLoading(true);
    setExistingError("");
    try {
      const result = await apiFetch<{ recordedSessions: RecordedSessionsExistingData }>("/api/attendance/recorded-sessions?mode=existing");
      setExistingData(result.recordedSessions);
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
    apiFetch<{ recordedSessions: RecordedSessionsFormData }>("/api/attendance/recorded-sessions?mode=form").then(result => {
      if (active) setFormData(result.recordedSessions);
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
  const recordings = existingData?.recordings ?? [];
  const selectedSession = sessions.find(session => session.id === form.attendanceSessionId);
  const filteredSessionOptions = sessions.filter(session => !form.batchId || session.batchId === form.batchId);
  const groupOptions = groups.filter(group => !form.batchId || group.batchId === form.batchId);
  const filteredRecordings = recordings.filter(recording => {
    const session = sessions.find(item => item.id === recording.attendanceSessionId);
    const query = filters.search.trim().toLowerCase();
    return (!filters.batchId || session?.batchId === filters.batchId)
      && (!filters.groupId || recording.groupIds.includes(filters.groupId))
      && (!filters.publishStatus || recording.publishStatus === filters.publishStatus)
      && (!filters.levelCode || recording.levelCode === filters.levelCode)
      && (!query || [recording.recordingTitle, recording.videoId, recording.attendanceCode, recording.attendanceSessionId].some(value => value.toLowerCase().includes(query)));
  });

  const columns: Column<RecordedSessionDto>[] = [
    { key: "id", header: "Recording ID", cell: row => <span className="font-mono text-xs">{row.id}</span> },
    { key: "title", header: "Recording Title", cell: row => row.recordingTitle },
    { key: "session", header: "Attendance Session ID", cell: row => row.attendanceSessionId },
    { key: "number", header: "Session Number", cell: row => row.sessionNumber },
    { key: "level", header: "Level Code", cell: row => row.levelCode },
    { key: "provider", header: "Provider", cell: row => row.provider },
    { key: "publish", header: "Publish Status", cell: row => <StatusBadge>{row.publishStatus}</StatusBadge> },
    { key: "active", header: "Is Active", cell: row => <StatusBadge>{row.isActive}</StatusBadge> },
    { key: "from", header: "Available From", cell: row => row.availableFrom },
    { key: "to", header: "Available To", cell: row => row.availableTo },
    { key: "groups", header: "Access Groups Count", cell: row => String(row.accessGroupsCount) },
    { key: "edit", header: "Edit", cell: row => <Button size="sm" variant="secondary" onClick={() => editRecording(row)}>Edit</Button> },
  ];

  function updateForm(patch: Partial<RecordingForm>) {
    setForm(current => ({ ...current, ...patch }));
  }

  function chooseSession(attendanceSessionId: string) {
    const session = sessions.find(item => item.id === attendanceSessionId);
    updateForm({
      attendanceSessionId,
      batchId: session?.batchId || form.batchId,
      sessionNumber: session?.sessionNumber || form.sessionNumber,
      levelCode: session?.levelCode || form.levelCode,
      recordingTitle: form.recordingTitle || (session ? `${session.track || session.sessionTitle || session.attendanceCode} - Session ${session.sessionNumber || ""} Recording`.replace(/\s+/g, " ").trim() : ""),
    });
  }

  function editRecording(row: RecordedSessionDto) {
    const session = sessions.find(item => item.id === row.attendanceSessionId);
    setForm({ recordingId: row.id, batchId: session?.batchId || "", attendanceSessionId: row.attendanceSessionId, recordingTitle: row.recordingTitle, provider: normalizeProvider(), videoUrl: row.videoUrl, videoId: row.provider === "GoogleDrive" ? row.videoId : "", sessionNumber: row.sessionNumber, levelCode: row.levelCode, publishStatus: normalizePublishStatus(row.publishStatus), availableFrom: row.availableFrom, availableTo: row.availableTo, isActive: row.isActive.trim().toLowerCase() !== "false", notes: row.notes, groupIds: row.groupIds });
    setActiveContentTab("Add New");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const videoId = form.videoId.trim() || extractVideoId(form.provider, form.videoUrl);
      const result = await apiFetch<{ result: { message: string; recordingId: string } }>("/api/attendance/recorded-sessions", { method: "POST", body: JSON.stringify({ ...form, videoId }) });
      showToast(result.result.message);
      setForm(emptyRecordingForm);
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

  if (loading) return <><PageHeader eyebrow="Recorded Sessions" title="Recorded Sessions" description="Manage recorded session video rows and group access."/><Card><LoadingState/></Card></>;
  if (error && !formData) return <><PageHeader eyebrow="Recorded Sessions" title="Recorded Sessions" description="Manage recorded session video rows and group access."/><ErrorState/><Card className="p-3 text-sm text-red-700">{safeDisplayText(error)}</Card></>;
  return <><PageHeader eyebrow="Recorded Sessions" title="Recorded Sessions" description="Manage recorded session video rows and group access."/><div className="space-y-5">
    {error && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-800">{safeDisplayText(error)}</Card>}
    <Card className="overflow-hidden">
      <Tabs tabs={["Add New", "Existing"]} active={activeContentTab} onChange={changeContentTab}/>
      {activeContentTab === "Add New" ? <div className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="heading text-lg font-bold">{form.recordingId ? "Edit Recording" : "Create Recording"}</h2><p className="text-xs text-slate-500">Video access is controlled only by Recorded_Session_Groups.</p></div>{form.recordingId && <Button type="button" variant="secondary" onClick={() => setForm(emptyRecordingForm)}>New Recording</Button>}</div>
      <form className="space-y-5" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <LabeledNativeSelect label="Batch" value={form.batchId} onChange={batchId => updateForm({ batchId, attendanceSessionId: "", groupIds: [] })} required options={batches.map(batch => ({ value: batch.id, label: batchLabel(batch) }))}/>
          <LabeledNativeSelect label="Attendance Session" value={form.attendanceSessionId} onChange={chooseSession} required options={filteredSessionOptions.map(session => ({ value: session.id, label: recordedSessionLabel(session) }))}/>
          <TextField label="Recording Title" value={form.recordingTitle} onChange={recordingTitle => updateForm({ recordingTitle })} required/>
          <LabeledNativeSelect label="Provider" value={form.provider} onChange={() => updateForm({ provider: "GoogleDrive", videoId: form.videoUrl ? extractVideoId("GoogleDrive", form.videoUrl) : form.videoId })} required options={[{ value: "GoogleDrive", label: "GoogleDrive" }]}/>
          <TextField label="Video URL" value={form.videoUrl} onChange={videoUrl => updateForm({ videoUrl, videoId: form.videoId || extractVideoId(form.provider, videoUrl) })} required hint="Paste a Google Drive video file link. The video will be embedded using Drive preview."/>
          <TextField label="Video ID" value={form.videoId} onChange={videoId => updateForm({ videoId })} required hint={!form.videoId && form.videoUrl ? "Video ID could not be extracted. Enter it manually." : ""}/>
          <TextField label="Session Number" value={form.sessionNumber} onChange={sessionNumber => updateForm({ sessionNumber })}/>
          <TextField label="Level Code" value={form.levelCode} onChange={levelCode => updateForm({ levelCode })}/>
          <LabeledNativeSelect label="Publish Status" value={form.publishStatus} onChange={publishStatus => updateForm({ publishStatus: normalizePublishStatus(publishStatus) })} required options={["Draft", "Published", "Hidden"].map(value => ({ value, label: value }))}/>
          <TextField label="Available From" type="date" value={form.availableFrom} onChange={availableFrom => updateForm({ availableFrom })}/>
          <TextField label="Available To" type="date" value={form.availableTo} onChange={availableTo => updateForm({ availableTo })}/>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Is Active</span><select className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm" value={form.isActive ? "TRUE" : "FALSE"} onChange={event => updateForm({ isActive: event.target.value === "TRUE" })}><option value="TRUE">TRUE</option><option value="FALSE">FALSE</option></select></label>
          <TextField label="Notes" value={form.notes} onChange={notes => updateForm({ notes })}/>
        </div>
        <section className="rounded border border-slate-200">
          <div className="border-b bg-slate-50 p-4"><h3 className="heading text-sm font-bold">Group Access</h3><p className="text-xs text-slate-500">Select groups allowed to watch this recording. Unchecked existing groups are disabled on save.</p></div>
          {!form.batchId ? <EmptyState title="Select a Batch first" detail="Groups are filtered by Groups.Batch_ID."/> : !groupOptions.length ? <EmptyState title="No groups found for this batch" detail="Create operational groups before assigning recording access."/> : <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{groupOptions.map(group => <label key={group.id} className="flex cursor-pointer gap-3 rounded border border-slate-200 p-3 hover:bg-slate-50"><input type="checkbox" className="mt-1 accent-red-700" checked={form.groupIds.includes(group.id)} onChange={event => updateForm({ groupIds: event.target.checked ? [...form.groupIds, group.id] : form.groupIds.filter(id => id !== group.id) })}/><span className="min-w-0 text-sm"><strong className="block">{safeDisplayText(group.name, "-")}</strong><span className="mt-1 block text-xs text-slate-500">{safeDisplayText(group.levelSelection, "-")} | L1 {safeDisplayText(group.level1AttendanceMode, "-")} | L2 {safeDisplayText(group.level2AttendanceMode, "-")}</span><span className="mt-1 block text-xs text-slate-500">Capacity {safeDisplayText(group.capacity, "-")} | {safeDisplayText(group.status, "-")}</span></span></label>)}</div>}
        </section>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setForm(emptyRecordingForm)}>Clear</Button><Button type="submit" disabled={saving || !form.batchId || !form.attendanceSessionId}>{saving ? "Saving..." : form.recordingId ? "Update Recording" : "Create Recording"}</Button></div>
      </form>
      {selectedSession && <p className="mt-4 rounded border bg-slate-50 p-3 text-xs text-slate-600">Selected session: {recordedSessionLabel(selectedSession)}</p>}
      </div> : <div>
      <div className="border-b bg-slate-50 p-4"><h2 className="heading text-lg font-bold">Existing Recordings</h2><p className="text-xs text-slate-500">Manage rows from Recorded_Sessions and group access from Recorded_Session_Groups.</p></div>
      <div className="grid gap-3 border-b p-4 md:grid-cols-2 xl:grid-cols-5">
        <SearchInput value={filters.search} onChange={search => setFilters(current => ({ ...current, search }))} placeholder="Search title, video id, or code"/>
        <select aria-label="Batch filter" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" value={filters.batchId} onChange={event => setFilters(current => ({ ...current, batchId: event.target.value }))}><option value="">All Batches</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{batchLabel(batch)}</option>)}</select>
        <select aria-label="Group filter" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" value={filters.groupId} onChange={event => setFilters(current => ({ ...current, groupId: event.target.value }))}><option value="">All Groups</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
        <Select label="Publish Status" value={filters.publishStatus} onChange={publishStatus => setFilters(current => ({ ...current, publishStatus }))} options={["Draft", "Published", "Hidden"]}/>
        <Select label="Level Code" value={filters.levelCode} onChange={levelCode => setFilters(current => ({ ...current, levelCode }))} options={unique(recordings.map(row => row.levelCode))}/>
      </div>
      <div className="flex justify-end border-b p-3"><Button variant="secondary" onClick={() => void loadExistingData({ force: true })}><RefreshCw size={14}/>Refresh Existing</Button></div>
      {existingLoading ? <div><LoadingState/><p className="px-5 pb-5 text-center text-xs text-slate-500">Loading existing recordings...</p></div> : existingError ? <div className="p-4"><ErrorState/><p className="mt-2 text-sm text-red-700">{safeDisplayText(existingError)}</p><Button className="mt-3" variant="secondary" onClick={() => void loadExistingData({ force: true })}>Retry</Button></div> : filteredRecordings.length ? <DataTable rows={filteredRecordings} columns={columns} getKey={row => row.id}/> : <EmptyState title="No recordings found" detail="Create a recording row after selecting an attendance session."/>}
      </div>}
    </Card>
  </div></>;
}

function TextField({ label, value, onChange, required, type = "text", hint }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; hint?: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}{required && <span className="text-red-700"> *</span>}</span><input type={type} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm" value={value} onChange={event => onChange(event.target.value)} required={required}/>{hint && <span className="mt-1 block text-[11px] text-amber-700">{safeDisplayText(hint)}</span>}</label>;
}

function LabeledNativeSelect({ label, value, onChange, options, required }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; required?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}{required && <span className="text-red-700"> *</span>}</span><select className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm" value={value} onChange={event => onChange(event.target.value)} required={required}><option value="">Select {label}</option>{options.map(option => <option key={option.value} value={option.value}>{safeDisplayText(option.label, "-")}</option>)}</select></label>;
}

function batchLabel(batch: RecordedSessionsData["batches"][number]) {
  return `${safeDisplayText(batch.name, "-")} | ${safeDisplayText(batch.location || "Unassigned Location", "-")}`;
}

function recordedSessionLabel(session: RecordedSessionsData["sessions"][number]) {
  const title = safeDisplayText(session.sessionTitle || session.track || session.attendanceCode || session.id, "-");
  return `${safeDisplayText(session.sessionDate, "-")} | ${safeDisplayText(session.startTime, "-")}-${safeDisplayText(session.endTime, "-")} | S${safeDisplayText(session.sessionNumber, "-")} | ${title} | Code: ${safeDisplayText(session.attendanceCode, "-")}`;
}

function extractVideoId(_provider: RecordingForm["provider"], url: string) {
  return extractGoogleDriveFileId(url);
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

function normalizeProvider(): RecordingForm["provider"] {
  return "GoogleDrive";
}

function normalizePublishStatus(value: string): RecordingForm["publishStatus"] {
  return value === "Published" || value === "Hidden" ? value : "Draft";
}

function AttendanceFilterField({ label, children, helperText, disabled = false, error, className = "" }: { label: string; children: ReactNode; helperText?: string; disabled?: boolean; error?: string; className?: string }) {
  return <label className={`block min-w-0 ${disabled ? "opacity-70" : ""} ${className}`}>
    <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
    {children}
    {helperText && <span className="mt-1 block text-[11px] text-slate-500">{safeDisplayText(helperText)}</span>}
    {error && <span className="mt-1 block text-[11px] text-red-700">{safeDisplayText(error)}</span>}
  </label>;
}

const attendanceFilterControlClass = "h-10 w-full min-w-0 rounded border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100 disabled:bg-slate-100 disabled:text-slate-400";

function NativeSelectField({ label, value, onChange, options, placeholder, disabled = false, className = "" }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder: string; disabled?: boolean; className?: string }) {
  return <AttendanceFilterField label={label} disabled={disabled} className={className}>
    <select aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className={attendanceFilterControlClass}>
      <option value="">{placeholder}</option>
      {options.map(option => <option key={option.value} value={option.value}>{safeDisplayText(option.label, "-")}</option>)}
    </select>
  </AttendanceFilterField>;
}

function BatchSelect({ batches, value, onChange }: { batches: AttendanceData["batches"]; value: string; onChange: (value: string) => void }) {
  return <NativeSelectField label="Batch" value={value} onChange={onChange} placeholder="Select Batch" options={batches.map(batch => ({ value: batch.batchId, label: `${safeDisplayText(batch.batchName, "-")} | ${batch.batchId}` }))}/>;
}

function SessionSelect({ sessions, value, onChange, disabled = false }: { sessions: AttendanceSessionDto[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <NativeSelectField label="Attendance Session" value={value} onChange={onChange} disabled={disabled} className="xl:col-span-2" placeholder={disabled ? "Select Batch first" : "Select Attendance Session"} options={sessions.map(session => ({ value: session.attendanceSessionId, label: sessionOptionLabel(session) }))}/>;
}

function MatrixSessionSelect({ sessions, value, onChange, disabled = false }: { sessions: AttendanceMatrixResponse["sessions"]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <NativeSelectField label="Attendance Session" value={value} onChange={onChange} disabled={disabled} className="xl:col-span-2" placeholder={disabled ? "Select Batch first" : "All Completed Sessions"} options={sessions.map(session => ({ value: session.attendanceSessionId, label: `Session ${safeDisplayText(String(session.sessionNumber), "-")} | ${safeDisplayText(session.date, "-")} | ${safeDisplayText(session.startTime, "-")} | ${safeDisplayText(session.deliveryMode, "-")}` }))}/>;
}

function matrixStickyStyle(index: number) {
  if (index === 0) return { left: 0, minWidth: "9rem", width: "9rem", maxWidth: "9rem" };
  if (index === 1) return { left: "9rem", minWidth: "14rem", width: "14rem", maxWidth: "14rem" };
  return undefined;
}

function matrixStickyClass(index: number, kind: "header" | "cell") {
  if (index === 0) return kind === "header" ? "sticky z-30 bg-slate-50" : "sticky z-20 bg-inherit font-semibold";
  if (index === 1) return kind === "header" ? "sticky z-30 bg-slate-50 shadow-[4px_0_8px_-8px_rgba(15,23,42,0.35)]" : "sticky z-20 bg-inherit font-semibold shadow-[4px_0_8px_-8px_rgba(15,23,42,0.35)]";
  return "text-slate-700";
}

function StudentUniversitySelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return <NativeSelectField label="Student University" value={value} onChange={onChange} placeholder="All Student Universities" options={options.map(option => ({ value: option, label: option }))}/>;
}

function sessionOptionLabel(session: AttendanceSessionDto) {
  const title = safeDisplayText(session.trackContext || session.sessionTitle || session.attendanceCode || session.attendanceSessionId, "-");
  const delivery = safeDisplayText(session.deliveryMode, "-");
  const number = safeDisplayText(session.sessionNumber, "-");
  const extra = isExtraSession(session) ? " | Extra" : "";
  return `Session ${number} | ${safeDisplayText(session.sessionDate, "-")} | ${safeDisplayText(session.startTime, "-")} | ${delivery}${extra} | ${title}`;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{safeDisplayText(value, "-")}</dd></div>;
}

function isExtraSession(session: Pick<AttendanceSessionDto, "sessionNumber" | "durationHours" | "isExtraSession" | "sessionTitle">) {
  return Number(session.sessionNumber) === 0 || session.isExtraSession.trim().toLowerCase() === "true" || session.sessionTitle.toLowerCase().includes("seminar");
}

function MatrixStatusBadge({ status, selected = false, onToggle, onMarkPresent }: { status: AttendanceMatrixStatus; selected?: boolean; onToggle?: () => void; onMarkPresent?: () => void }) {
  const map: Record<AttendanceMatrixStatus, { label: string; className: string; title: string }> = {
    PRESENT: { label: "P", title: "Present", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    ABSENT: { label: "A", title: "Absent", className: "bg-red-50 text-red-700 border-red-200" },
    PENDING: { label: "Pending", title: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200" },
    EXCUSED: { label: "E", title: "Excused", className: "bg-blue-50 text-blue-700 border-blue-200" },
    NOT_APPLICABLE: { label: "-", title: "Not applicable", className: "bg-slate-50 text-slate-400 border-slate-200" },
  };
  const item = map[status];
  if (status === "ABSENT" && onToggle && onMarkPresent) {
    return <span className="inline-flex items-center gap-1">
      <button type="button" title={selected ? "Selected for correction" : "Select absent record for correction"} aria-label={selected ? "Selected absent record for correction" : "Select absent record for correction"} onClick={onToggle} className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-[11px] font-bold ${selected ? "border-red-500 bg-red-700 text-white" : item.className}`}>{selected ? "✓" : item.label}</button>
      <button type="button" title="Mark Present" aria-label="Mark absent record present" onClick={onMarkPresent} className="rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50">Mark</button>
    </span>;
  }
  return <span title={item.title} aria-label={item.title} className={`inline-flex min-w-7 justify-center rounded-full border px-2 py-1 text-[11px] font-bold ${item.className}`}>{item.label}</span>;
}

function shortDate(value: string) {
  const parts = value.split("-");
  if (parts.length !== 3) return safeDisplayText(value, "-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parts[2]} ${months[Number(parts[1]) - 1] ?? parts[1]}`;
}

function readable(value: string) {
  return safeDisplayText(value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()), "-");
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [delayMs, value]);
  return debounced;
}

function copyCode(code: string, onCopy: (message: string) => void) {
  const value = code.trim();
  if (!value) return onCopy("No attendance code available to copy.");
  navigator.clipboard?.writeText(value).then(() => onCopy("Attendance code copied."), () => onCopy("Could not copy attendance code."));
}

function localDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOnly(value: string) {
  return value.trim().slice(0, 10);
}

function studentUniversityDisplay(value: string) {
  return safeDisplayText(value, "-");
}

function uniqueUniversities(values: string[]) {
  return [...new Set(values.map(studentUniversityDisplay))].sort();
}

function unique(values: string[]) {
  return [...new Set(values.map(value => safeDisplayText(value, "-")).filter(value => value !== "-"))].sort();
}

function safeFilenamePart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "attendance";
}

function createXlsxBlob(rows: string[][]) {
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${cellRef(rowIndex + 1, columnIndex + 1)}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const files = [
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Attendance Export" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/worksheets/sheet1.xml", content: worksheet },
  ];
  return new Blob([zipStore(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function cellRef(row: number, column: number) {
  let value = column; let name = "";
  while (value > 0) { value--; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26); }
  return `${name}${row}`;
}

function xmlEscape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
}

function zipStore(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(6, 0, true); localView.setUint16(8, 0, true); localView.setUint16(10, 0, true); localView.setUint16(12, 0, true); localView.setUint32(14, crc, true); localView.setUint32(18, data.length, true); localView.setUint32(22, data.length, true); localView.setUint16(26, name.length, true); local.set(name, 30);
    chunks.push(local, data);
    const directory = new Uint8Array(46 + name.length);
    const directoryView = new DataView(directory.buffer);
    directoryView.setUint32(0, 0x02014b50, true); directoryView.setUint16(4, 20, true); directoryView.setUint16(6, 20, true); directoryView.setUint16(8, 0, true); directoryView.setUint16(10, 0, true); directoryView.setUint16(12, 0, true); directoryView.setUint16(14, 0, true); directoryView.setUint32(16, crc, true); directoryView.setUint32(20, data.length, true); directoryView.setUint32(24, data.length, true); directoryView.setUint16(28, name.length, true); directoryView.setUint32(42, offset, true); directory.set(name, 46);
    central.push(directory);
    offset += local.length + data.length;
  }
  const centralOffset = offset;
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, files.length, true); endView.setUint16(10, files.length, true); endView.setUint32(12, centralSize, true); endView.setUint32(16, centralOffset, true);
  return concatUint8([...chunks, ...central, end]);
}

function concatUint8(chunks: Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(data: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of data) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
