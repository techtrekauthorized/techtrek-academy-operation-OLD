"use client";

import { Clipboard, FileSpreadsheet, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { Button, Card, EmptyState, ErrorState, KpiCard, PageHeader, SearchInput, StatusBadge, cn } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/overlays";
import type { GroupRosterGroup, GroupRostersData, GroupRosterStudent } from "@/types/group-rosters";
import { packageHoursLabel, readableEnum, safeDisplayText } from "@/lib/display";

const LEVEL_LABELS: Record<string, string> = { BOTH_LEVELS: "Both Levels", LEVEL_1: "Level 1", LEVEL_2: "Level 2" };
const ATTENDANCE_LABELS: Record<string, string> = { ONLINE: "Online", OFFLINE: "Offline" };

const readable = (value: string) => LEVEL_LABELS[value.trim()] ?? ATTENDANCE_LABELS[value.trim()] ?? readableEnum(value);
const packageHours = (student: GroupRosterStudent) => packageHoursLabel(student.packageLabel, student.creditHours || "");

export function GroupRostersPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<GroupRostersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [filters, setFilters] = useState({ deliveryTrack: "", batch: "", status: "", levelSelection: "", attendance: "", groupSearch: "" });
  const [studentSearch, setStudentSearch] = useState("");
  const [whatsAppFilter, setWhatsAppFilter] = useState<"all" | "entered" | "missing">("all");
  const [studentUniversityFilter, setStudentUniversityFilter] = useState("");
  const [savingEnrollmentId, setSavingEnrollmentId] = useState("");
  const selectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    setStudentUniversityFilter("");
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await apiFetch<{ rosters: GroupRostersData }>("/api/group-rosters");
        if (!active) return;
        setData(response.rosters);
        setSelectedGroupId(response.rosters.groups[0]?.id ?? "");
      } catch (reason) {
        if (active) setError(formatClientApiError(reason));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const groups = useMemo(() => data?.groups ?? [], [data]);
  const filteredGroups = useMemo(() => groups.filter(group => {
    const query = filters.groupSearch.trim().toLowerCase();
    return (!filters.deliveryTrack || group.deliveryTrackId === filters.deliveryTrack)
      && (!filters.batch || group.batchId === filters.batch)
      && (!filters.status || group.status === filters.status)
      && (!filters.levelSelection || group.levelSelection === filters.levelSelection)
      && (!filters.attendance || group.level1AttendanceMode === filters.attendance || group.level2AttendanceMode === filters.attendance)
      && (!query || group.name.toLowerCase().includes(query));
  }), [groups, filters]);
  const selectedGroup = filteredGroups.find(group => group.id === selectedGroupId) ?? filteredGroups[0];
  const studentUniversityOptions = useMemo(() => uniqueOptions((selectedGroup?.students ?? []).map(student => {
    const university = rosterUniversityValue(student.studentUniversity);
    return { value: university, label: university };
  })), [selectedGroup]);
  const activeStudentUniversityFilter = studentUniversityOptions.some(option => option.value === studentUniversityFilter) ? studentUniversityFilter : "";
  const visibleStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    return (selectedGroup?.students ?? []).filter(student => {
      const matchesSearch = !query || [student.studentName, student.phone, student.email, student.academyStudentId, student.enrollmentId].some(value => value.toLowerCase().includes(query));
      const matchesWhatsApp = whatsAppFilter === "all" || (whatsAppFilter === "entered" ? student.enteredWhatsAppGroup : !student.enteredWhatsAppGroup);
      const matchesUniversity = !activeStudentUniversityFilter || rosterUniversityValue(student.studentUniversity) === activeStudentUniversityFilter;
      return matchesSearch && matchesWhatsApp && matchesUniversity;
    });
  }, [selectedGroup, studentSearch, whatsAppFilter, activeStudentUniversityFilter]);

  const updateWhatsApp = async (student: GroupRosterStudent, entered: boolean) => {
    if (!selectedGroup) return;
    setSavingEnrollmentId(student.enrollmentId);
    setData(current => current ? patchLocalStatus(current, selectedGroup.id, student.enrollmentId, entered) : current);
    try {
      await apiFetch("/api/group-rosters", { method: "PATCH", body: JSON.stringify({ enrollmentId: student.enrollmentId, groupId: selectedGroup.id, entered }) });
      showToast(entered ? "Marked as entered WhatsApp group." : "Marked as not entered WhatsApp group.");
    } catch (reason) {
      setData(current => current ? patchLocalStatus(current, selectedGroup.id, student.enrollmentId, student.enteredWhatsAppGroup) : current);
      showToast(formatClientApiError(reason));
    } finally {
      setSavingEnrollmentId("");
    }
  };

  const copyPhones = async (withNames = false) => {
    const text = visibleStudents.map(student => withNames ? `${student.studentName} - ${student.phone}` : student.phone).filter(value => value.trim()).join("\n");
    await navigator.clipboard.writeText(text);
    showToast(withNames ? "Name + phone list copied." : "Phone list copied.");
  };
  const exportExcel = () => {
    if (!selectedGroup || !visibleStudents.length) {
      showToast("No filtered students available to export.");
      return;
    }
    exportRosterExcel(selectedGroup, visibleStudents);
    showToast("Excel roster exported.");
  };

  return <>
    <PageHeader eyebrow="Operations" title="Group Rosters" description="View operational groups, student counts, and WhatsApp group entry status."/>
    {loading ? <Card className="p-5"><div className="h-4 w-1/3 animate-pulse rounded bg-slate-200"/><div className="mt-4 h-28 animate-pulse rounded bg-slate-100"/></Card> : error ? <><ErrorState/><p className="text-sm text-red-700">{error}</p></> : !data ? null : <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Total Groups" value={String(data.summary.totalGroups)}/><KpiCard label="Total Placed Students" value={String(data.summary.totalPlacedStudents)}/><KpiCard label="Entered WhatsApp" value={String(data.summary.enteredWhatsApp)} icon={<MessageCircle size={17}/>}/><KpiCard label="Not Entered WhatsApp" value={String(data.summary.notEnteredWhatsApp)}/></div>
      <Card className="overflow-hidden">
        <header className="border-b bg-slate-50 px-4 py-3"><h2 className="heading text-base font-bold">Operational Groups</h2><p className="mt-0.5 text-xs text-slate-500">Select a group to review its exact roster.</p></header>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-2 xl:grid-cols-6">
          <Filter label="Delivery Track" value={filters.deliveryTrack} onChange={deliveryTrack => setFilters(current => ({ ...current, deliveryTrack }))} options={uniqueOptions(groups.map(group => ({ value: group.deliveryTrackId, label: group.deliveryTrackName })))}/>
          <Filter label="Batch" value={filters.batch} onChange={batch => setFilters(current => ({ ...current, batch }))} options={uniqueOptions(groups.map(group => ({ value: group.batchId, label: group.batchName })))}/>
          <Filter label="Group Status" value={filters.status} onChange={status => setFilters(current => ({ ...current, status }))} options={uniqueOptions(groups.map(group => ({ value: group.status, label: readable(group.status) })))}/>
          <Filter label="Level Selection" value={filters.levelSelection} onChange={levelSelection => setFilters(current => ({ ...current, levelSelection }))} options={uniqueOptions(groups.map(group => ({ value: group.levelSelection, label: readable(group.levelSelection) })))}/>
          <Filter label="Attendance Mode" value={filters.attendance} onChange={attendance => setFilters(current => ({ ...current, attendance }))} options={[{ value: "ONLINE", label: "Online" }, { value: "OFFLINE", label: "Offline" }]}/>
          <SearchInput value={filters.groupSearch} onChange={groupSearch => setFilters(current => ({ ...current, groupSearch }))} placeholder="Search Group Name"/>
        </div>
        {!groups.length ? <EmptyState title="No operational groups have been created yet." detail="Groups will appear here after they are configured."/> : !filteredGroups.length ? <EmptyState title="No Groups match these filters" detail="Clear or adjust the selected filters."/> : <GroupsTable groups={filteredGroups} selectedGroupId={selectedGroup?.id ?? ""} onSelect={selectGroup}/>}
      </Card>
      {selectedGroup ? <RosterSection group={selectedGroup} students={visibleStudents} studentSearch={studentSearch} whatsAppFilter={whatsAppFilter} studentUniversityFilter={activeStudentUniversityFilter} studentUniversityOptions={studentUniversityOptions} savingEnrollmentId={savingEnrollmentId} onSearch={setStudentSearch} onWhatsAppFilter={setWhatsAppFilter} onStudentUniversityFilter={setStudentUniversityFilter} onToggle={updateWhatsApp} onCopyPhones={copyPhones} onExportExcel={exportExcel}/> : null}
    </div>}
  </>;
}

function patchLocalStatus(data: GroupRostersData, groupId: string, enrollmentId: string, entered: boolean): GroupRostersData {
  const groups = data.groups.map(group => {
    if (group.id !== groupId) return group;
    const students = group.students.map(student => student.enrollmentId === enrollmentId ? { ...student, enteredWhatsAppGroup: entered } : student);
    const enteredCount = students.filter(student => student.enteredWhatsAppGroup).length;
    return { ...group, students, whatsappEnteredCount: enteredCount, whatsappMissingCount: students.length - enteredCount };
  });
  const totalPlacedStudents = groups.reduce((sum, group) => sum + group.assignedStudentsCount, 0);
  const enteredWhatsApp = groups.reduce((sum, group) => sum + group.whatsappEnteredCount, 0);
  return { ...data, groups, summary: { ...data.summary, totalPlacedStudents, enteredWhatsApp, notEnteredWhatsApp: totalPlacedStudents - enteredWhatsApp } };
}

function GroupsTable({ groups, selectedGroupId, onSelect }: { groups: GroupRosterGroup[]; selectedGroupId: string; onSelect: (id: string) => void }) {
  return <div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[1100px] border-collapse text-start"><thead><tr className="border-b border-slate-200">{["Group Name", "Delivery Track", "Batch Name", "Level Selection", "Level 1 Attendance", "Level 2 Attendance", "Group Status", "Assigned", "Capacity", "WhatsApp Entered", "WhatsApp Missing"].map(header => <th key={header} className="whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{header}</th>)}</tr></thead><tbody>{groups.map(group => <tr key={group.id} onClick={() => onSelect(group.id)} className={cn("cursor-pointer border-b border-slate-100 last:border-0 hover:bg-red-50/40", selectedGroupId === group.id && "bg-red-50")}><Cell><strong>{group.name}</strong><div className="font-mono text-[10px] text-slate-400">{group.id}</div></Cell><Cell>{group.deliveryTrackName}</Cell><Cell>{group.batchName}</Cell><Cell><StatusBadge>{readable(group.levelSelection)}</StatusBadge></Cell><Cell>{readable(group.level1AttendanceMode)}</Cell><Cell>{readable(group.level2AttendanceMode)}</Cell><Cell><StatusBadge>{readable(group.status)}</StatusBadge></Cell><Cell>{group.assignedStudentsCount}</Cell><Cell>{group.capacity || "-"}</Cell><Cell>{group.whatsappEnteredCount}</Cell><Cell>{group.whatsappMissingCount}</Cell></tr>)}</tbody></table></div>;
}

function RosterSection({ group, students, studentSearch, whatsAppFilter, studentUniversityFilter, studentUniversityOptions, savingEnrollmentId, onSearch, onWhatsAppFilter, onStudentUniversityFilter, onToggle, onCopyPhones, onExportExcel }: { group: GroupRosterGroup; students: GroupRosterStudent[]; studentSearch: string; whatsAppFilter: "all" | "entered" | "missing"; studentUniversityFilter: string; studentUniversityOptions: Array<{ value: string; label: string }>; savingEnrollmentId: string; onSearch: (value: string) => void; onWhatsAppFilter: (value: "all" | "entered" | "missing") => void; onStudentUniversityFilter: (value: string) => void; onToggle: (student: GroupRosterStudent, entered: boolean) => void; onCopyPhones: (withNames?: boolean) => void; onExportExcel: () => void }) {
  return <Card className="overflow-hidden">
    <header className="flex flex-col gap-3 border-b bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="heading text-lg font-bold">{group.name}</h2><p className="mt-1 text-xs text-slate-500">{group.batchName} | {group.deliveryTrackName} | {group.assignedStudentsCount}/{group.capacity || "-"} assigned | WhatsApp {group.whatsappEnteredCount} entered / {group.whatsappMissingCount} missing</p></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => void onCopyPhones()}><Clipboard size={14}/>Copy Phone List</Button><Button type="button" size="sm" variant="secondary" onClick={() => void onCopyPhones(true)}><Clipboard size={14}/>Copy Name + Phone List</Button><Button type="button" size="sm" variant="secondary" disabled={!students.length} onClick={onExportExcel}><FileSpreadsheet size={14}/>Export Excel</Button></div></header>
    <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_220px_240px]"><SearchInput value={studentSearch} onChange={onSearch} placeholder="Search students"/><label className="block"><span className="sr-only">WhatsApp filter</span><select value={whatsAppFilter} onChange={event => onWhatsAppFilter(event.target.value as "all" | "entered" | "missing")} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm"><option value="all">All</option><option value="entered">Entered WhatsApp</option><option value="missing">Not Entered WhatsApp</option></select></label><label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Student University</span><select value={studentUniversityFilter} onChange={event => onStudentUniversityFilter(event.target.value)} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm"><option value="">All Universities</option>{studentUniversityOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
    {!group.students.length ? <EmptyState title="No students are assigned to this group yet." detail="Placed students will appear in this roster."/> : !students.length ? <EmptyState title="No students match these filters" detail="Clear or adjust the roster search/filter."/> : <div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[1280px] border-collapse text-start"><thead><tr className="border-b border-slate-200">{["#", "Student Name", "Phone", "Email", "Academy Student ID", "Student University", "College", "Enrollment ID", "Sold Track", "Package / Hours", "Delivery Mode", "Level Selection", "Payment Status", "Entered WhatsApp Group"].map(header => <th key={header} className="whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{header}</th>)}</tr></thead><tbody>{students.map((student, index) => <tr key={student.enrollmentId} className="border-b border-slate-100 last:border-0"><Cell>{index + 1}</Cell><Cell><strong>{student.studentName}</strong></Cell><Cell>{student.phone || "-"}</Cell><Cell>{student.email || "-"}</Cell><Cell>{student.academyStudentId}</Cell><Cell>{rosterUniversityValue(student.studentUniversity)}</Cell><Cell>{student.college || "-"}</Cell><Cell>{student.enrollmentId}</Cell><Cell>{student.soldTrack || "-"}</Cell><Cell>{packageHours(student)}</Cell><Cell><StatusBadge>{student.deliveryMode}</StatusBadge></Cell><Cell>{readable(student.levelSelection)}</Cell><Cell><StatusBadge>{student.paymentStatus || "-"}</StatusBadge></Cell><Cell><label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={student.enteredWhatsAppGroup} disabled={savingEnrollmentId === student.enrollmentId} onChange={event => onToggle(student, event.target.checked)} className="size-4 rounded border-slate-300 text-red-700 focus:ring-red-600"/>{savingEnrollmentId === student.enrollmentId ? "Saving..." : student.enteredWhatsAppGroup ? "TRUE" : "FALSE"}</label></Cell></tr>)}</tbody></table></div>}
  </Card>;
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm"><option value="">All {label}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
function uniqueOptions(options: Array<{ value: string; label: string }>) {
  const seen = new Set<string>();
  return options.filter(option => {
    if (!option.value || seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}
function rosterUniversityValue(value: string) {
  return safeDisplayText(value, "Unknown University");
}
function exportRosterExcel(group: GroupRosterGroup, students: GroupRosterStudent[]) {
  const headers = ["Student Name", "Phone", "Email", "Academy Student ID", "Student University", "University Student ID"];
  const rows = students.map(student => [
    safeDisplayText(student.studentName),
    safeDisplayText(student.phone),
    safeDisplayText(student.email),
    safeDisplayText(student.academyStudentId),
    rosterUniversityValue(student.studentUniversity),
    safeDisplayText(student.universityStudentId),
  ]);
  const worksheetXml = buildWorksheetXml([headers, ...rows]);
  const filename = `Group_Roster_${safeFilename(group.name)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  downloadBlob(new Blob([createXlsxZip(worksheetXml)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}
function buildWorksheetXml(rows: string[][]) {
  const columnWidths = [28, 18, 30, 22, 32, 24].map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${columnName(columnIndex + 1)}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columnWidths}</cols><sheetData>${body}</sheetData></worksheet>`;
}
function createXlsxZip(worksheetXml: string) {
  return createZip([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Group Roster" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/worksheets/sheet1.xml", content: worksheetXml },
  ]);
}
function createZip(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const content = encoder.encode(file.content);
    const crc = crc32(content);
    const local = concatBytes(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(content.length), u32(content.length), u16(name.length), u16(0), name, content);
    chunks.push(local);
    central.push(concatBytes(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(content.length), u32(content.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name));
    offset += local.length;
  }
  const centralOffset = offset;
  const centralBytes = concatBytes(...central);
  const end = concatBytes(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralBytes.length), u32(centralOffset), u16(0));
  return concatBytes(...chunks, centralBytes, end);
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function u16(value: number) { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value, true); return bytes; }
function u32(value: number) { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); return bytes; }
function concatBytes(...arrays: Uint8Array[]) {
  const output = new Uint8Array(arrays.reduce((sum, item) => sum + item.length, 0));
  let offset = 0;
  for (const item of arrays) { output.set(item, offset); offset += item.length; }
  return output;
}
function columnName(index: number) {
  let value = index; let label = "";
  while (value > 0) { value--; label = String.fromCharCode(65 + value % 26) + label; value = Math.floor(value / 26); }
  return label;
}
function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function safeFilename(value: string) {
  return safeDisplayText(value, "Group").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "Group";
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
function Cell({ children }: { children: ReactNode }) { return <td className="whitespace-nowrap px-3 py-3 text-[13px] text-slate-700">{typeof children === "string" || typeof children === "number" ? safeDisplayText(children) : children}</td>; }
