"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { FileSpreadsheet } from "lucide-react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { Button, Card, EmptyState, ErrorState, KpiCard, LoadingState, PageHeader, Select } from "@/components/ui/primitives";
import { PrivacyReveal } from "@/components/ui/PrivacyReveal";
import { Modal } from "@/components/ui/overlays";
import { safeDisplayText } from "@/lib/display";
import type { AnalysisBatchRow, AnalysisData, AnalysisLocationRow, AnalysisSummary } from "@/types/analysis";

const money = (value: number) => new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(value);
const blank = (value: string) => safeDisplayText(value, "-");

export function AnalysisPage() {
  const [data, setData] = useState<AnalysisData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ location: "", batch: "", track: "", paymentStatus: "", studentUniversity: "", group: "" });
  const [selectedBatch, setSelectedBatch] = useState<AnalysisBatchRow>();
  useEffect(() => { let active = true; apiFetch<{ analysis: AnalysisData }>("/api/analysis").then(result => { if (active) setData(result.analysis); }).catch(reason => { if (active) setError(formatClientApiError(reason)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const filteredFacts = useMemo(() => data ? data.enrollmentFacts.filter(row => (!filters.location || row.batchLocation === filters.location) && (!filters.batch || row.batchName === filters.batch) && (!filters.track || row.deliveryTrack === filters.track) && (!filters.paymentStatus || row.paymentStatus === filters.paymentStatus) && (!filters.studentUniversity || row.studentUniversity === filters.studentUniversity) && (!filters.group || row.groupName === filters.group)) : [], [data, filters]);
  const filteredBatchRows = useMemo(() => data ? buildBatchRows(data, filteredFacts, filters) : [], [data, filteredFacts, filters]);
  const filteredLocationRows = useMemo(() => data ? buildLocationRows(data, filteredFacts, filteredBatchRows) : [], [data, filteredFacts, filteredBatchRows]);
  const filteredSummary = useMemo(() => summarizeFacts(filteredFacts, filteredBatchRows, new Set(filteredBatchRows.map(row => row.batchId).filter(Boolean))), [filteredFacts, filteredBatchRows]);
  const selectedBreakdown = useMemo(() => selectedBatch ? buildUniversityBreakdown(selectedBatch, filteredFacts) : undefined, [filteredFacts, selectedBatch]);
  const exportRows = () => {
    const rows = [["Batch Name", "Batch Location", "Student Count", "Enrollment Count", "Expected Revenue", "Collected", "Remaining", "Fully Paid", "With Remaining"], ...filteredBatchRows.map(row => [row.batchName, row.batchLocation, String(row.studentCount), String(row.enrollmentCount), String(row.expectedRevenue), String(row.collected), String(row.remaining), String(row.fullyPaidCount), String(row.withRemainingCount)])];
    downloadBlob(createXlsxBlob(rows), `analysis_batch_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  return <PrivacyReveal viewLabel="View Analysis" hideLabel="Hide Analysis" viewAriaLabel="View analysis data" hideAriaLabel="Hide analysis data" hiddenMessage="Analysis data is hidden" showVisibleControl={false} onHide={() => setSelectedBatch(undefined)}>
    {(_analysisVisible, { hideButton }) => {
      const content = loading ? <LoadingState/> : error || !data ? <><PageHeader title="Analysis"/><ErrorState/><Card className="p-3 text-sm text-red-700">{blank(error)}</Card></> : <><PageHeader eyebrow="Admin Only" title="Analysis" description="Financial and student analysis by Batch and Batch Location." actions={<>{hideButton}<Button variant="secondary" disabled={!filteredBatchRows.length} onClick={exportRows}><FileSpreadsheet size={14}/>Export Excel</Button></>}/>
    {data.configurationWarning && <Card className="mb-5 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{data.configurationWarning}</Card>}
    <Card className="mb-5 p-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Select label="Batch Location" value={filters.location} onChange={location => setFilters(current => ({ ...current, location, batch: "" }))} options={data.filters.batchLocations}/><Select label="Batch" value={filters.batch} onChange={batch => setFilters(current => ({ ...current, batch }))} options={data.filters.batches.filter(batch => !filters.location || data.batchRows.find(row => row.batchId === batch.id)?.batchLocation === filters.location).map(batch => batch.name)}/><Select label="Track" value={filters.track} onChange={track => setFilters(current => ({ ...current, track }))} options={data.filters.tracks}/><Select label="Payment Status" value={filters.paymentStatus} onChange={paymentStatus => setFilters(current => ({ ...current, paymentStatus }))} options={data.filters.paymentStatuses}/><Select label="Student University" value={filters.studentUniversity} onChange={studentUniversity => setFilters(current => ({ ...current, studentUniversity }))} options={data.filters.studentUniversities}/><Select label="Group" value={filters.group} onChange={group => setFilters(current => ({ ...current, group }))} options={data.filters.groups.map(group => group.name)}/></div></Card>
    <SummaryCards summary={filteredSummary}/>
    <div className="mt-5 space-y-5"><LocationTable rows={filteredLocationRows}/><AnalysisTable rows={filteredBatchRows} onViewDetails={setSelectedBatch}/></div>
    {data.unassigned.enrollmentCount > 0 && <Card className="mt-5 p-4"><h2 className="heading text-base font-bold">Unassigned Batch</h2><p className="mt-1 text-sm text-slate-500">Enrollments with blank Group_ID or missing group are not included in a specific batch.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><KpiCard label="Expected Revenue" value={money(data.unassigned.expectedRevenue)}/><KpiCard label="Collected" value={money(data.unassigned.collected)}/><KpiCard label="Remaining" value={money(data.unassigned.remaining)}/><KpiCard label="Students" value={String(data.unassigned.studentCount)}/><KpiCard label="Enrollments" value={String(data.unassigned.enrollmentCount)}/></div></Card>}
    {selectedBatch && selectedBreakdown && <BatchUniversityBreakdownModal batch={selectedBatch} breakdown={selectedBreakdown} onClose={() => setSelectedBatch(undefined)}/>}
  </>;
      return content;
    }}
  </PrivacyReveal>;
}

function SummaryCards({ summary }: { summary: AnalysisSummary }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><KpiCard label="Total Expected Revenue" value={money(summary.expectedRevenue)}/><KpiCard label="Total Collected" value={money(summary.collected)}/><KpiCard label="Total Remaining" value={money(summary.remaining)}/><KpiCard label="Total Students" value={String(summary.studentCount)}/><KpiCard label="Total Enrollments" value={String(summary.enrollmentCount)}/><KpiCard label="Total Batches" value={String(summary.batchCount)}/></div>;
}

function AnalysisTable({ rows, onViewDetails }: { rows: AnalysisBatchRow[]; onViewDetails: (row: AnalysisBatchRow) => void }) {
  if (!rows.length) return <Card><EmptyState title="No batch analysis rows match these filters" detail="Adjust filters to show batch analysis."/></Card>;
  return <Card className="overflow-hidden"><Header title="Batch Analysis"/><Table headers={["Batch Name", "Batch Location", "Delivery Track", "Groups Count", "Student Count", "Enrollment Count", "Expected Revenue", "Collected", "Remaining", "Fully Paid", "With Remaining", "Actions"]}>{rows.map(row => <tr key={row.batchId || row.batchName} className="border-b border-slate-100 last:border-0"><Cell>{blank(row.batchName)}</Cell><Cell>{blank(row.batchLocation)}</Cell><Cell>{blank(row.deliveryTrack)}</Cell><Cell>{row.groupsCount}</Cell><Cell>{row.studentCount}</Cell><Cell>{row.enrollmentCount}</Cell><Cell>{money(row.expectedRevenue)}</Cell><Cell>{money(row.collected)}</Cell><Cell>{money(row.remaining)}</Cell><Cell>{row.fullyPaidCount}</Cell><Cell>{row.withRemainingCount}</Cell><Cell><Button type="button" size="sm" variant="secondary" aria-label={`View details for ${blank(row.batchName)}`} onClick={() => onViewDetails(row)}>View Details</Button></Cell></tr>)}</Table></Card>;
}

type BatchUniversityBreakdown = {
  totalUniqueStudents: number;
  universitiesRepresented: number;
  largestUniversity: string | null;
  largestUniversityStudentCount: number;
  unresolvedStudentRecords: number;
  reconciliationPassed: boolean;
  rows: Array<{ university: string; studentCount: number; percentage: number }>;
};

function BatchUniversityBreakdownModal({ batch, breakdown, onClose }: { batch: AnalysisBatchRow; breakdown: BatchUniversityBreakdown; onClose: () => void }) {
  return <Modal open onClose={onClose} title={`University Breakdown - ${blank(batch.batchName)}`} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
    <div className="space-y-5">
      <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <div className="font-semibold text-slate-900">{blank(batch.batchName)}</div>
        <div className="mt-1 grid gap-1 text-xs sm:grid-cols-2">
          <span>Batch ID: <strong>{blank(batch.batchId)}</strong></span>
          <span>Track: <strong>{blank(batch.deliveryTrack)}</strong></span>
          <span>Location: <strong>{blank(batch.batchLocation)}</strong></span>
          <span>Visible Student Count: <strong>{batch.studentCount}</strong></span>
        </div>
      </div>
      {!breakdown.reconciliationPassed ? <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <div className="font-bold">BATCH_BREAKDOWN_RECONCILIATION_FAILED</div>
        <div className="mt-1">Batch_ID: {blank(batch.batchId)} | Visible count: {batch.studentCount} | Breakdown count: {breakdown.totalUniqueStudents} | Unresolved records: {breakdown.unresolvedStudentRecords}</div>
      </Card> : <>
        <div className="grid gap-3 sm:grid-cols-2">
          <KpiCard label="Total Unique Students" value={String(breakdown.totalUniqueStudents)}/>
          <KpiCard label="Universities Represented" value={String(breakdown.universitiesRepresented)}/>
          <KpiCard label="Largest University" value={breakdown.largestUniversity ?? "-"}/>
          <KpiCard label="Largest University Student Count" value={String(breakdown.largestUniversityStudentCount)}/>
        </div>
        {!breakdown.rows.length ? <Card><EmptyState title="No students were found for this batch using the current filters." detail="Adjust filters to view a breakdown."/></Card> : <div className="overflow-x-auto rounded border border-slate-200">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="border-b bg-slate-50"><th className="px-3 py-2 text-start text-[11px] font-bold uppercase tracking-wide text-slate-500">University</th><th className="px-3 py-2 text-end text-[11px] font-bold uppercase tracking-wide text-slate-500">Student Count</th><th className="px-3 py-2 text-end text-[11px] font-bold uppercase tracking-wide text-slate-500">Percentage of Batch</th></tr></thead>
            <tbody>{breakdown.rows.map(row => <tr key={row.university} className="border-b last:border-0"><td className="px-3 py-3"><div className="font-semibold text-slate-800">{blank(row.university)}</div><div className="mt-2 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-red-700" style={{ width: `${Math.min(100, Math.max(0, row.percentage))}%` }}/></div></td><td className="px-3 py-3 text-end font-bold text-slate-800">{row.studentCount}</td><td className="px-3 py-3 text-end">{row.percentage}%</td></tr>)}</tbody>
          </table>
        </div>}
      </>}
    </div>
  </Modal>;
}

function LocationTable({ rows }: { rows: AnalysisLocationRow[] }) {
  return <Card className="overflow-hidden"><Header title="Location Analysis"/><Table headers={["Batch Location", "Batch Count", "Groups Count", "Student Count", "Enrollment Count", "Expected Revenue", "Collected", "Remaining"]}>{rows.map(row => <tr key={row.batchLocation} className="border-b border-slate-100 last:border-0"><Cell>{blank(row.batchLocation)}</Cell><Cell>{row.batchCount}</Cell><Cell>{row.groupsCount}</Cell><Cell>{row.studentCount}</Cell><Cell>{row.enrollmentCount}</Cell><Cell>{money(row.expectedRevenue)}</Cell><Cell>{money(row.collected)}</Cell><Cell>{money(row.remaining)}</Cell></tr>)}</Table></Card>;
}

function buildBatchRows(data: AnalysisData, facts: AnalysisData["enrollmentFacts"], filters: { location: string; batch: string; track: string; paymentStatus: string; studentUniversity: string; group: string }) {
  const factFiltered = Boolean(filters.paymentStatus || filters.studentUniversity || filters.group);
  return data.batchRows.filter(row => (!filters.location || row.batchLocation === filters.location) && (!filters.batch || row.batchName === filters.batch) && (!filters.track || row.deliveryTrack === filters.track)).map(row => ({ ...row, ...summarizeFacts(facts.filter(fact => fact.batchId === row.batchId), [row], new Set([row.batchId])), groupsCount: row.groupsCount })).filter(row => !factFiltered || row.enrollmentCount > 0);
}

function buildLocationRows(data: AnalysisData, facts: AnalysisData["enrollmentFacts"], rows: AnalysisBatchRow[]): AnalysisLocationRow[] {
  return data.filters.batchLocations.map(location => {
    const locationRows = rows.filter(row => row.batchLocation === location);
    const locationFacts = facts.filter(row => row.batchLocation === location);
    const summary = summarizeFacts(locationFacts, locationRows, new Set(locationRows.map(row => row.batchId).filter(Boolean)));
    return { batchLocation: location, ...summary, groupsCount: new Set(locationFacts.map(row => row.groupId).filter(Boolean)).size || locationRows.reduce((total, row) => total + row.groupsCount, 0) };
  });
}

function buildUniversityBreakdown(batch: AnalysisBatchRow, facts: AnalysisData["enrollmentFacts"]): BatchUniversityBreakdown {
  const studentUniversities = new Map<string, string>();
  const canonicalUniversities = new Map<string, string>();
  let unresolvedStudentRecords = 0;
  for (const fact of facts.filter(row => row.batchId === batch.batchId)) {
    const academyStudentId = fact.academyStudentId.trim();
    if (!academyStudentId) {
      unresolvedStudentRecords++;
      continue;
    }
    if (studentUniversities.has(academyStudentId)) continue;
    const university = canonicalUniversity(fact.studentUniversity, canonicalUniversities);
    studentUniversities.set(academyStudentId, university);
  }
  const counts = new Map<string, number>();
  for (const university of studentUniversities.values()) counts.set(university, (counts.get(university) ?? 0) + 1);
  const totalUniqueStudents = studentUniversities.size;
  const rows = [...counts.entries()].map(([university, studentCount]) => ({
    university,
    studentCount,
    percentage: totalUniqueStudents ? Math.round(studentCount / totalUniqueStudents * 1000) / 10 : 0,
  })).sort((left, right) => right.studentCount - left.studentCount || left.university.localeCompare(right.university));
  const largest = rows[0];
  return {
    totalUniqueStudents,
    universitiesRepresented: rows.length,
    largestUniversity: largest?.university ?? null,
    largestUniversityStudentCount: largest?.studentCount ?? 0,
    unresolvedStudentRecords,
    reconciliationPassed: totalUniqueStudents === batch.studentCount,
    rows,
  };
}

function canonicalUniversity(value: string, known: Map<string, string>) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return "University Not Specified";
  const key = normalized.toLowerCase();
  const existing = known.get(key);
  if (existing) return existing;
  known.set(key, normalized);
  return normalized;
}

function summarizeFacts(facts: AnalysisData["enrollmentFacts"], rows: AnalysisBatchRow[], batchIds: Set<string>): AnalysisSummary {
  const students = new Set(facts.map(row => row.academyStudentId).filter(Boolean));
  return { expectedRevenue: sum(facts, "expectedRevenue"), collected: sum(facts, "collected"), remaining: sum(facts, "remaining"), studentCount: students.size, enrollmentCount: facts.length, batchCount: batchIds.size, groupsCount: new Set(facts.map(row => row.groupId).filter(Boolean)).size || rows.reduce((total, row) => total + row.groupsCount, 0), fullyPaidCount: facts.filter(row => row.remaining <= 0 || row.paymentStatus.trim().toLowerCase() === "fully paid").length, withRemainingCount: facts.filter(row => row.remaining > 0 && row.paymentStatus.trim().toLowerCase() !== "fully paid").length };
}

function sum<T extends Record<string, unknown>>(rows: T[], key: keyof T) { return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0); }
function Header({ title }: { title: string }) { return <div className="border-b bg-slate-50 px-4 py-3"><h2 className="heading text-base font-bold">{title}</h2></div>; }
function Table({ headers, children }: { headers: string[]; children: ReactNode }) { return <div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[980px] border-collapse text-start text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50">{headers.map(header => <th key={header} className="px-3 py-2 text-start text-[11px] font-bold uppercase tracking-wide text-slate-500">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Cell({ children }: { children: ReactNode }) { return <td className="px-3 py-2 align-top text-slate-700">{children}</td>; }

function createXlsxBlob(rows: string[][]) {
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${columnName(columnIndex + 1)}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  return new Blob([createZip([{ name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` }, { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` }, { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Batch Analysis" sheetId="1" r:id="rId1"/></sheets></workbook>` }, { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` }, { name: "xl/worksheets/sheet1.xml", content: worksheet }])], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); }
function createZip(files: Array<{ name: string; content: string }>) { const encoder = new TextEncoder(); const chunks: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0; for (const file of files) { const name = encoder.encode(file.name); const content = encoder.encode(file.content); const crc = crc32(content); const local = concatBytes(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(content.length), u32(content.length), u16(name.length), u16(0), name, content); chunks.push(local); central.push(concatBytes(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(content.length), u32(content.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name)); offset += local.length; } const centralOffset = offset; const centralBytes = concatBytes(...central); const end = concatBytes(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralBytes.length), u32(centralOffset), u16(0)); return concatBytes(...chunks, centralBytes, end); }
function crc32(bytes: Uint8Array) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function u16(value: number) { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value, true); return bytes; }
function u32(value: number) { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); return bytes; }
function concatBytes(...arrays: Uint8Array[]) { const output = new Uint8Array(arrays.reduce((total, item) => total + item.length, 0)); let offset = 0; for (const item of arrays) { output.set(item, offset); offset += item.length; } return output; }
function columnName(index: number) { let value = index; let label = ""; while (value > 0) { value--; label = String.fromCharCode(65 + value % 26) + label; value = Math.floor(value / 26); } return label; }
function escapeXml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;"); }
