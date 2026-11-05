"use client";

import { Download, FileSpreadsheet, ReceiptText, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { RECEIVER_OPTIONS } from "@/config/receivers";
import { ReceiptHistory } from "@/components/students/StudentsPages";
import { DataTable, FilterBar } from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/overlays";
import { Button, Card, EmptyState, ErrorState, Field, KpiCard, LinkButton, LoadingState, PageHeader, SearchInput, Select, StatusBadge } from "@/components/ui/primitives";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { deliveryModeLabel } from "@/lib/delivery-mode";
import { safeDisplayText } from "@/lib/display";
import type { EnrollmentDto, PaymentDto, RegistryRowDto, StudentDto } from "@/types/google";

const money = (value: number) => new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(value);
const exportToast = (show: (message: string) => void, format: string) => show(`Export ${format} is a frontend placeholder.`);

export function CollectionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const directStudentId = searchParams.get("studentId")?.trim() ?? "";
  const directEnrollmentId = searchParams.get("enrollmentId")?.trim() ?? "";
  const hasDirectRequest = searchParams.has("studentId") || searchParams.has("enrollmentId");
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<StudentDto[]>([]);
  const [profile, setProfile] = useState<{ student: StudentDto; enrollments: EnrollmentDto[]; payments: PaymentDto[] }>();
  const [selectedId, setSelectedId] = useState("");
  const directMode = hasDirectRequest;
  const [searching, setSearching] = useState(hasDirectRequest);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("Cash");
  const [receiver, setReceiver] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const selected = profile?.enrollments.find(item => item.enrollmentId === selectedId);
  const payments = profile?.payments.filter(item => item.enrollmentId === selected?.enrollmentId) ?? [];
  const derivedType = !selected || amount <= 0 ? "—" : selected.totalPaid === 0 && amount === selected.remaining ? "Full Payment" : amount === selected.remaining ? "Final Payment" : selected.totalPaid === 0 ? "Deposit" : "Installment";
  const totalAfter = (selected?.totalPaid ?? 0) + amount;
  const remainingAfter = Math.max(0, (selected?.remaining ?? 0) - amount);
  const derivedStatus = amount > 0 && remainingAfter === 0 ? "Fully Paid" : amount > 0 ? "Partially Paid" : "—";

  useEffect(() => {
    if (!hasDirectRequest) return;
    let active = true;
    Promise.resolve().then(() => { if (active) { setSearching(true); setProfile(undefined); setMatches([]); setError(""); } });
    if (!directStudentId || !directEnrollmentId) {
      Promise.resolve().then(() => { if (active) { setError("The direct collection link is incomplete. Select Change Student to use Quick Collection search."); setSearching(false); } });
      return () => { active = false; };
    }
    apiFetch<{ student: StudentDto; enrollments: EnrollmentDto[]; payments: PaymentDto[] }>(`/api/students/${encodeURIComponent(directStudentId)}`)
      .then(data => {
        if (!active) return;
        const enrollment = data.enrollments.find(item => item.enrollmentId === directEnrollmentId);
        if (data.student.academyStudentId !== directStudentId || !enrollment || enrollment.academyStudentId !== data.student.academyStudentId) {
          throw new Error("The selected student and enrollment do not match or are unavailable.");
        }
        setProfile(data);
        setSelectedId(enrollment.enrollmentId);
        setAmount(0);
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load the selected enrollment."); })
      .finally(() => { if (active) setSearching(false); });
    return () => { active = false; };
  }, [directEnrollmentId, directStudentId, hasDirectRequest]);

  const changeStudent = () => {
    setProfile(undefined);
    setSelectedId("");
    setMatches([]);
    setQuery("");
    setAmount(0);
    setError("");
    setProgress("");
    router.replace("/collections");
  };

  const runSearch = async () => {
    setSearching(true);
    setError("");
    setProfile(undefined);
    try {
      const data = await apiFetch<{ students: StudentDto[] }>(`/api/students/search?q=${encodeURIComponent(query)}`);
      setMatches(data.students);
      if (data.students.length === 1) await chooseStudent(data.students[0]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Search failed"); }
    finally { setSearching(false); }
  };

  const chooseStudent = async (student: StudentDto) => {
    setSearching(true);
    setError("");
    try {
      const data = await apiFetch<{ student: StudentDto; enrollments: EnrollmentDto[]; payments: PaymentDto[] }>(`/api/students/${encodeURIComponent(student.academyStudentId)}`);
      setProfile(data);
      setSelectedId(data.enrollments[0]?.enrollmentId ?? "");
      setMatches([]);
      setAmount(0);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Student profile failed to load"); }
    finally { setSearching(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    if (!receiver) return setError("Select Receiver Name.");
    if (selected.remaining <= 0) return setError("This enrollment is already fully paid.");
    if (amount <= 0 || amount > selected.remaining) return setError("Payment must be greater than zero and cannot exceed the remaining balance.");
    setSaving(true);
    setError("");
    setProgress("Validating the live balance and generating a separate receipt…");
    try {
      const data = await apiFetch<{ payment: PaymentDto }>("/api/payments", { method: "POST", body: JSON.stringify({ enrollmentId: selected.enrollmentId, paymentDate, paymentAmount: amount, paymentMethod: method, receiverName: receiver, notes }) });
      const refreshed = await apiFetch<{ student: StudentDto; enrollments: EnrollmentDto[]; payments: PaymentDto[] }>(`/api/students/${encodeURIComponent(selected.academyStudentId)}`);
      if (!refreshed.enrollments.some(item => item.enrollmentId === selected.enrollmentId)) throw new Error("Payment succeeded, but the selected enrollment could not be refreshed.");
      setProfile(refreshed);
      setSelectedId(selected.enrollmentId);
      setAmount(0);
      setNotes("");
      setProgress("");
      showToast(`Payment saved. Receipt ${data.payment.receiptNumber} generated.`);
    } catch (reason) {
      setError(formatClientApiError(reason));
      setProgress("");
    } finally { setSaving(false); }
  };

  return <>
    <PageHeader
      eyebrow="Google Sheets  -  Live Finance"
      title="Quick Collection Desk"
      description={directMode && selected ? `Selected: ${profile?.student.studentName}  -  ${selected.enrollmentId}` : "Search a student, select the exact enrollment, record one immutable payment, and generate one separate Google Docs receipt."}
      actions={<>{directMode && <Button type="button" variant="secondary" onClick={changeStudent}>Change Student</Button>}<LinkButton href="/collections/ledger" variant="secondary">Payment Ledger</LinkButton><LinkButton href="/collections/outstanding" variant="secondary">Outstanding Balances</LinkButton></>}
    />

    {!directMode && <Card className="mb-5 p-5">
      <label className="mb-2 block text-xs font-semibold">Student Lookup</label>
      <div className="flex gap-2"><SearchInput className="flex-1" value={query} onChange={setQuery} placeholder="Student name, phone, Academy Student ID, or enrollment context"/><Button type="button" disabled={searching} onClick={runSearch}><Search size={15}/>{searching ? "Searching…" : "Search"}</Button></div>
      {matches.length > 0 && <div className="mt-3 divide-y rounded border">{matches.map(student => <button type="button" onClick={() => chooseStudent(student)} className="flex w-full justify-between p-3 text-start hover:bg-red-50" key={student.academyStudentId}><span><strong>{student.studentName}</strong><small className="block text-slate-500">{student.phone}  -  {student.studentId}</small></span><span className="mono text-red-700">{student.academyStudentId}</span></button>)}</div>}
      {error && !profile && <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </Card>}

    {directMode && searching && !profile ? <Card className="mb-5"><LoadingState/></Card> : null}
    {directMode && error && !profile ? <Card className="mb-5"><ErrorState/><div className="px-5 pb-5"><p className="mb-3 text-sm text-red-700">{error}</p><Button type="button" variant="secondary" onClick={changeStudent}>Return to Quick Collection Search</Button></div></Card> : null}

    {profile && selected ? <>
      <Card className="mb-5 p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><h2 className="heading text-lg font-bold">Selected Enrollment Summary</h2><p className="mt-1 text-xs text-slate-500">{directMode ? "Loaded from the exact student and enrollment link." : "Confirm the enrollment before recording a payment."}</p></div>
          {!directMode && <label><span className="mb-1 block text-xs font-semibold">Enrollment Selector</span><select className="h-10 min-w-80 rounded border border-red-200 bg-red-50 px-3 text-sm" value={selected.enrollmentId} onChange={event => { setSelectedId(event.target.value); setAmount(0); setError(""); }}>{profile.enrollments.map(item => <option key={item.enrollmentId} value={item.enrollmentId}>{item.enrollmentId}  -  {item.track}  -  {item.exactHours}H  -  {deliveryModeLabel(item.deliveryMode)}</option>)}</select></label>}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Summary label="Student Name" value={profile.student.studentName}/><Summary label="Academy Student ID" value={profile.student.academyStudentId}/><Summary label="Intake" value={selected.intake}/><Summary label="Student University" value={profile.student.university}/><Summary label="Program Scope" value={selected.programScope}/><Summary label="Track" value={selected.track}/><Summary label="Package / Hours" value={`${selected.packageLabel}  -  ${selected.exactHours}H`}/><Summary label="Delivery Mode" value={deliveryModeLabel(selected.deliveryMode)}/><Summary label="Final Contract Price" value={money(selected.finalContractPrice)}/><Summary label="Total Paid Before" value={money(selected.totalPaid)}/><Summary label="Remaining Before Payment" value={money(selected.remaining)}/>
        </div>
      </Card>

      <Card className="mb-5 p-5">
        <h2 className="heading text-lg font-bold">Record New Payment</h2>
        {selected.remaining <= 0 ? <EmptyState title="Enrollment is fully paid" detail="No additional payment can be recorded."/> : <form onSubmit={submit} className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Payment Date" type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)} required/>
            <Field label="Payment Amount" type="number" min="0.01" max={selected.remaining} step="0.01" value={amount || ""} onChange={event => setAmount(Number(event.target.value))} required/>
            <LabeledSelect label="Payment Method" value={method} onChange={setMethod} placeholder="Select Payment Method" options={["Cash", "InstaPay", "Bank Transfer", "Card", "Wallet"]} required/>
            <LabeledSelect label="Receiver Name" value={receiver} onChange={setReceiver} placeholder="Select Receiver" options={RECEIVER_OPTIONS} required/>
            <Field className="md:col-span-2 xl:col-span-4" label="Notes" value={notes} onChange={event => setNotes(event.target.value)}/>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Summary label="Final Contract Price" value={money(selected.finalContractPrice)}/><Summary label="Total Paid Before" value={money(selected.totalPaid)}/><Summary label="This Payment" value={money(amount)}/><Summary label="Total Paid After Payment" value={money(totalAfter)}/><Summary label="Remaining After Payment" value={money(remainingAfter)}/><Summary label="Derived Payment Type" value={derivedType}/><Summary label="Derived Payment Status" value={derivedStatus}/>
          </div>
          {error && <p role="alert" className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {progress && <p className="mt-4 rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">{progress}</p>}
          <div className="mt-5 flex justify-end"><Button type="submit" disabled={saving || !receiver || amount <= 0 || amount > selected.remaining}><ReceiptText size={16}/>{saving ? "Saving & Generating Receipt…" : "Record Payment & Generate Receipt"}</Button></div>
        </form>}
      </Card>

      <Card className="mb-5"><div className="border-b p-4"><h2 className="heading text-lg font-bold">Previous Payments</h2></div><DataTable rows={payments} getKey={row => row.paymentId} columns={[{ key: "id", header: "Payment ID", cell: row => <span className="mono">{row.paymentId}</span> }, { key: "date", header: "Payment Date", cell: row => row.paymentDate }, { key: "type", header: "Payment Type", cell: row => row.paymentType }, { key: "amount", header: "Payment Amount", cell: row => money(row.paymentAmount) }, { key: "method", header: "Payment Method", cell: row => row.paymentMethod }, { key: "after", header: "Total Paid After Payment", cell: row => money(row.totalPaidAfterPayment) }, { key: "remaining", header: "Remaining After Payment", cell: row => money(row.remainingAfterPayment) }]}/></Card>
      <ReceiptHistory payments={payments}/>
    </> : !directMode ? <Card><EmptyState title="Select a student" detail="Search by Academy ID, Student ID, phone, name, or enrollment context to begin a collection."/></Card> : null}
  </>;
}

export function PaymentLedgerPage() {
  const { showToast } = useToast(); const [payments, setPayments] = useState<PaymentDto[]>([]); const [registry, setRegistry] = useState<RegistryRowDto[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [search, setSearch] = useState(""); const [source, setSource] = useState("");
  useEffect(() => { Promise.all([apiFetch<{ payments: PaymentDto[] }>("/api/payments"), apiFetch<{ rows: RegistryRowDto[] }>("/api/students")]).then(([paymentData, registryData]) => { setPayments(paymentData.payments); setRegistry(registryData.rows); }).catch(reason => setError(reason.message)).finally(() => setLoading(false)); }, []);
  const rows = useMemo(() => payments.map(payment => ({ payment, enrollment: registry.find(item => item.enrollmentId === payment.enrollmentId) })).filter(row => { const needle = search.toLowerCase(); return (!needle || [row.payment.paymentId, row.payment.receiptNumber, row.payment.enrollmentId, row.enrollment?.studentName ?? "", row.payment.academyStudentId].some(value => value.toLowerCase().includes(needle))) && (!source || row.payment.receiptSource === source); }), [payments, registry, search, source]);
  return <><PageHeader eyebrow="Google Sheets  -  Live Finance" title="Payment Ledger & Receipt History" description="Immutable payment and receipt rows from Payments_Receipts." actions={<div className="flex gap-2">{["CSV", "Excel", "PDF"].map(format => <Button key={format} variant="secondary" onClick={() => exportToast(showToast, format)}>{format === "Excel" ? <FileSpreadsheet size={14}/> : <Download size={14}/>}Export {format}</Button>)}</div>}/><Card><FilterBar resultCount={rows.length}><SearchInput className="flex-1" value={search} onChange={setSearch} placeholder="Payment, receipt, enrollment, Academy ID, or student"/><Select label="Receipt Source" value={source} onChange={setSource} options={["LEGACY", "GOOGLE_DOCS"]}/></FilterBar>{loading ? <LoadingState/> : error ? <ErrorState/> : <DataTable rows={rows} getKey={row => row.payment.paymentId} columns={[{ key: "payment", header: "Payment ID", cell: row => <span className="mono">{row.payment.paymentId}</span> }, { key: "receipt", header: "Receipt Number", cell: row => <span className="mono font-semibold text-red-700">{row.payment.receiptNumber}</span> }, { key: "student", header: "Student Name", cell: row => row.enrollment?.studentName ?? row.payment.academyStudentId }, { key: "enrollment", header: "Enrollment ID", cell: row => row.payment.enrollmentId }, { key: "date", header: "Payment Date", cell: row => row.payment.paymentDate }, { key: "type", header: "Payment Type", cell: row => row.payment.paymentType }, { key: "amount", header: "Payment Amount", cell: row => money(row.payment.paymentAmount) }, { key: "after", header: "Total Paid After Payment", cell: row => money(row.payment.totalPaidAfterPayment) }, { key: "remaining", header: "Remaining After Payment", cell: row => money(row.payment.remainingAfterPayment) }, { key: "source", header: "Receipt Source", cell: row => <StatusBadge>{row.payment.receiptSource}</StatusBadge> }, { key: "open", header: "Open Receipt", cell: row => row.payment.receiptLink ? <a href={row.payment.receiptLink} target="_blank" rel="noreferrer" className="font-semibold text-red-700">Open Receipt</a> : "—" }]}/>}</Card></>;
}

export function OutstandingBalancesPage() {
  const { showToast } = useToast(); const [rows, setRows] = useState<RegistryRowDto[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [search, setSearch] = useState("");
  useEffect(() => { apiFetch<{ rows: RegistryRowDto[] }>("/api/students").then(data => setRows(data.rows.filter(row => row.remaining > 0))).catch(reason => setError(reason.message)).finally(() => setLoading(false)); }, []);
  const filtered = rows.filter(row => !search || [row.studentName, row.academyStudentId, row.enrollmentId, row.phone].some(value => value.toLowerCase().includes(search.toLowerCase())));
  return <><PageHeader eyebrow="Google Sheets  -  Live Finance" title="Outstanding Balances" description="Enrollment-level balances read fresh from Enrollments." actions={<div className="flex gap-2">{["CSV", "Excel", "PDF"].map(format => <Button key={format} variant="secondary" onClick={() => exportToast(showToast, format)}>Export {format}</Button>)}</div>}/><div className="grid gap-3 sm:grid-cols-3"><KpiCard label="Outstanding Enrollments" value={String(rows.length)}/><KpiCard label="Total Outstanding" value={money(rows.reduce((sum, row) => sum + row.remaining, 0))}/><KpiCard label="Partially Paid" value={String(rows.filter(row => row.paymentStatus === "Partially Paid").length)}/></div><Card className="mt-5"><FilterBar resultCount={filtered.length}><SearchInput className="flex-1" value={search} onChange={setSearch} placeholder="Student, Academy ID, enrollment, or phone"/></FilterBar>{loading ? <LoadingState/> : error ? <ErrorState/> : <DataTable rows={filtered} getKey={row => row.enrollmentId} columns={[{ key: "student", header: "Student Name", cell: row => <div><strong>{row.studentName}</strong><small className="mono block text-slate-400">{row.academyStudentId}</small></div> }, { key: "phone", header: "Phone", cell: row => row.phone }, { key: "enrollment", header: "Enrollment ID", cell: row => row.enrollmentId }, { key: "scope", header: "Program Scope", cell: row => row.programScope }, { key: "track", header: "Track", cell: row => row.track }, { key: "contract", header: "Final Contract Price", cell: row => money(row.finalContractPrice) }, { key: "paid", header: "Total Paid", cell: row => money(row.totalPaid) }, { key: "remaining", header: "Remaining", cell: row => <strong className="text-red-700">{money(row.remaining)}</strong> }, { key: "status", header: "Payment Status", cell: row => <StatusBadge>{row.paymentStatus}</StatusBadge> }, { key: "action", header: "Actions", cell: row => <LinkButton href={`/collections?studentId=${encodeURIComponent(row.academyStudentId)}&enrollmentId=${encodeURIComponent(row.enrollmentId)}`} variant="ghost">Record Payment</LinkButton> }]}/>}</Card></>;
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded border bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase text-slate-400">{safeDisplayText(label)}</div><div className="mt-1 text-sm font-bold">{safeDisplayText(value)}</div></div>; }
function LabeledSelect({ label, value, onChange, placeholder, options, required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; options: readonly string[]; required?: boolean }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{safeDisplayText(label)}{required && <span className="text-red-700"> *</span>}</span><select aria-label={safeDisplayText(label)} required={required} value={value} onChange={event => onChange(event.target.value)} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-700"><option value="">{safeDisplayText(placeholder)}</option>{options.map(option => <option key={option} value={option}>{safeDisplayText(option)}</option>)}</select></label>; }
