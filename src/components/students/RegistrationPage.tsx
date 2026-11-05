"use client";

import { Check, Circle, ExternalLink, LoaderCircle, ReceiptText, Search, UserPlus } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { RECEIVER_OPTIONS } from "@/config/receivers";
import { COLLEGE_OPTIONS, DEPARTMENT_OPTIONS, OTHER_UNIVERSITY_VALUE, STUDENT_STATUS_OPTIONS } from "@/config/student-options";
import { apiFetch, ClientApiError, formatClientApiError } from "@/lib/client-api";
import { DELIVERY_MODE_OPTIONS, deliveryModeLabel } from "@/lib/delivery-mode";
import type { EnrollmentDto, OfferingDto, StudentDto } from "@/types/google";
import { Modal } from "@/components/ui/overlays";
import { Breadcrumbs, Button, Card, Field, LinkButton, LoadingState, PageHeader, SearchInput, StatusBadge } from "@/components/ui/primitives";
import { joinDisplay, safeDisplayText } from "@/lib/display";

type UniversityOption = { universityId: string; universityName: string; code: string };
type RegistrationMeta = { offerings: OfferingDto[]; currentIntake: string; receiptNumberPreview: string };
type ReceiptSuccess = {
  student: StudentDto; enrollment: EnrollmentDto;
  payment: { paymentId: string; paymentAmount: number; remainingBalance: number; receiptNumber: string; receiptStatus: "Generated"; receiptLink: string; receiptPdfFileId: string; receiptDownloadLink: string };
};

const emptyStudent: Omit<StudentDto, "academyStudentId"> = { studentName: "", phone: "", email: "", university: "", college: "", department: "", studentId: "", studentStatus: "Active" };
const progressStages = ["Validating student and enrollment", "Saving registration data", "Creating Google Docs receipt", "Filling receipt template", "Exporting PDF", "Uploading PDF to Google Drive", "Finalizing receipt record"];
const money = (value: number) => new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(value);

export function NewStudentRegistrationPage() {
  const [meta, setMeta] = useState<RegistrationMeta>(); const [universities, setUniversities] = useState<UniversityOption[]>([]); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<"new" | "existing">("new"); const [student, setStudent] = useState(emptyStudent); const [selectedAcademyId, setSelectedAcademyId] = useState(""); const [studentSearch, setStudentSearch] = useState(""); const [matches, setMatches] = useState<StudentDto[]>([]);
  const [collegeChoice, setCollegeChoice] = useState(""); const [otherCollege, setOtherCollege] = useState(""); const [departmentChoice, setDepartmentChoice] = useState(""); const [otherDepartment, setOtherDepartment] = useState("");
  const [universityChoice, setUniversityChoice] = useState(""); const [actualUniversity, setActualUniversity] = useState(""); const [offeringId, setOfferingId] = useState(""); const [deliveryMode, setDeliveryMode] = useState(""); const [discount, setDiscount] = useState(0); const [discountReason, setDiscountReason] = useState(""); const [paymentAmount, setPaymentAmount] = useState(0); const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10)); const [paymentMethod, setPaymentMethod] = useState("");
  // Future: default this to the authenticated internal user. For now a fixed manual dropdown keeps collection ownership explicit.
  const [receiverName, setReceiverName] = useState(""); const [notes, setNotes] = useState(""); const [saving, setSaving] = useState(false); const [stageIndex, setStageIndex] = useState(-1); const [formError, setFormError] = useState(""); const [failureStage, setFailureStage] = useState(""); const [success, setSuccess] = useState<ReceiptSuccess>();

  useEffect(() => { let active = true; Promise.all([apiFetch<RegistrationMeta>("/api/offerings"), apiFetch<{ universities: UniversityOption[] }>("/api/universities")]).then(([offeringData, universityData]) => { if (!active) return; setMeta(offeringData); setUniversities(universityData.universities); }).catch(error => { if (active) setLoadError(formatClientApiError(error)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const intensiveMode = universityChoice === OTHER_UNIVERSITY_VALUE; const programScope = intensiveMode ? "INTENSIVE_DIPLOMA" : "UNIVERSITY_PROGRAM";
  const offerings = useMemo(() => (meta?.offerings ?? []).filter(item => intensiveMode ? item.offeringType === "INTENSIVE_DIPLOMA" : Boolean(universityChoice) && item.offeringType === "UNIVERSITY_PROGRAM" && item.university === universityChoice), [meta, intensiveMode, universityChoice]);
  const offering = offerings.find(item => item.offeringId === offeringId); const finalPrice = Math.max(0, (offering?.price ?? 0) - discount); const isFreeEnrollment = Boolean(offering) && finalPrice === 0; const remaining = Math.max(0, finalPrice - paymentAmount); const paymentType = isFreeEnrollment ? "Full Payment" : paymentAmount > 0 ? paymentAmount === finalPrice ? "Full Payment" : "Deposit" : "-"; const paymentStatus = isFreeEnrollment ? "Fully Paid" : paymentAmount > 0 ? remaining === 0 ? "Fully Paid" : "Partially Paid" : "-"; const paymentMethodOptions = isFreeEnrollment ? ["Cash", "InstaPay", "Bank Transfer", "Card", "Wallet", "100% Discount"] : ["Cash", "InstaPay", "Bank Transfer", "Card", "Wallet"];
  useEffect(() => { if (isFreeEnrollment) { if (paymentAmount !== 0) setPaymentAmount(0); if (!paymentMethod) setPaymentMethod("100% Discount"); } else if (paymentMethod === "100% Discount") setPaymentMethod(""); }, [isFreeEnrollment, paymentAmount, paymentMethod]);

  const updateStudent = (key: keyof typeof student, value: string) => { if (mode === "existing" && ["studentName", "studentId"].includes(key)) return; setStudent(current => ({ ...current, [key]: value })); };
  const chooseCollege = (value: string) => { setCollegeChoice(value); setOtherCollege(""); setStudent(current => ({ ...current, college: value === "Other" ? "" : value })); };
  const chooseDepartment = (value: string) => { setDepartmentChoice(value); setOtherDepartment(""); setStudent(current => ({ ...current, department: value === "Other" ? "" : value })); };
  const chooseUniversity = (value: string) => { setUniversityChoice(value); setOfferingId(""); setFormError(""); if (value === OTHER_UNIVERSITY_VALUE) { setActualUniversity(""); setStudent(current => ({ ...current, university: "" })); } else { setActualUniversity(""); setStudent(current => ({ ...current, university: value })); } };
  const searchExisting = async () => { setFormError(""); try { const data = await apiFetch<{ students: StudentDto[] }>(`/api/students/search?q=${encodeURIComponent(studentSearch)}`); setMatches(data.students); } catch (error) { setFormError(formatClientApiError(error)); } };
  const chooseExisting = (value: StudentDto) => { const isActiveUniversity = universities.some(item => item.universityName === value.university); const fixedCollege = value.college !== "Other" && COLLEGE_OPTIONS.some(option => option === value.college); const fixedDepartment = !value.department || (value.department !== "Other" && DEPARTMENT_OPTIONS.some(option => option === value.department)); setMode("existing"); setSelectedAcademyId(value.academyStudentId); setStudent({ studentName: value.studentName, phone: value.phone, email: value.email, university: value.university, college: value.college, department: value.department, studentId: value.studentId, studentStatus: value.studentStatus }); setCollegeChoice(fixedCollege ? value.college : "Other"); setOtherCollege(fixedCollege ? "" : value.college === "Other" ? "" : value.college); setDepartmentChoice(fixedDepartment ? value.department : "Other"); setOtherDepartment(fixedDepartment ? "" : value.department === "Other" ? "" : value.department); setUniversityChoice(isActiveUniversity ? value.university : OTHER_UNIVERSITY_VALUE); setActualUniversity(isActiveUniversity ? "" : value.university); setOfferingId(""); setMatches([]); };
  const reset = () => { setMode("new"); setStudent(emptyStudent); setSelectedAcademyId(""); setStudentSearch(""); setMatches([]); setCollegeChoice(""); setOtherCollege(""); setDepartmentChoice(""); setOtherDepartment(""); setUniversityChoice(""); setActualUniversity(""); setOfferingId(""); setDeliveryMode(""); setDiscount(0); setDiscountReason(""); setPaymentAmount(0); setPaymentMethod(""); setReceiverName(""); setNotes(""); setStageIndex(-1); setFormError(""); setFailureStage(""); setSuccess(undefined); };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return;
    const realUniversity = (intensiveMode ? actualUniversity : universityChoice).trim();
    const finalCollege = (collegeChoice === "Other" ? otherCollege : collegeChoice).trim();
    const finalDepartment = (departmentChoice === "Other" ? otherDepartment : departmentChoice).trim();
    if (!realUniversity) return setFormError(intensiveMode ? "Actual Student University is required." : "Select Student University.");
    if (!finalCollege) return setFormError(collegeChoice === "Other" ? "Other College Name is required." : "Select College.");
    if (departmentChoice === "Other" && !finalDepartment) return setFormError("Other Department Name is required.");
    if (!offering) return setFormError("Select an available offering."); if (!deliveryMode) return setFormError("Select Delivery Mode."); if (!paymentMethod) return setFormError("Select Payment Method."); if (!receiverName) return setFormError("Select Receiver Name."); if (discount > offering.price) return setFormError("Discount cannot exceed the catalogue price."); if (finalPrice === 0 && paymentAmount !== 0) return setFormError("Opening payment must be zero when the final contract price is zero."); if (finalPrice > 0 && (paymentAmount <= 0 || paymentAmount > finalPrice)) return setFormError("Opening payment must be greater than zero and cannot exceed the final contract price.");
    setSaving(true); setFormError(""); setFailureStage(""); setStageIndex(0);
    const timer = window.setInterval(() => setStageIndex(current => Math.min(current + 1, progressStages.length - 2)), 850);
    try {
      const data = await apiFetch<{ result: ReceiptSuccess }>("/api/registrations", { method: "POST", body: JSON.stringify({ mode, academyStudentId: selectedAcademyId || undefined, student: { ...student, university: realUniversity, college: finalCollege, department: finalDepartment }, offeringId: offering.offeringId, deliveryMode, discount, discountReason: discountReason.trim(), openingPaymentAmount: paymentAmount, paymentDate, paymentMethod, receiverName, notes: notes.trim() }) });
      const payment = data.result.payment;
      if (!payment.paymentId || payment.receiptStatus !== "Generated" || !payment.receiptPdfFileId || !payment.receiptLink) throw new Error("Registration response did not contain a completed generated receipt.");
      setStageIndex(progressStages.length - 1); setSuccess(data.result);
    } catch (error) {
      const apiError = error instanceof ClientApiError ? error : undefined; const stage = apiError && !Array.isArray(apiError.details) ? apiError.details?.stage : undefined;
      setFailureStage(stage || progressStages[Math.max(stageIndex, 0)]); setFormError(formatClientApiError(error));
    } finally { window.clearInterval(timer); setSaving(false); }
  };

  if (loading) return <Card>
<LoadingState/>
</Card>;
  if (loadError) return <>
<PageHeader title="Register Student / Add Enrollment"/>
<Card className="p-5">
<p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{loadError}</p>
</Card>
</>;
  return <>
<form onSubmit={submit}>
<Breadcrumbs items={[{ label: "Students & Enrollments", href: "/students" }, { label: "Register Student" }]}/>
<PageHeader eyebrow="Google Sheets | Live Registration" title="Register Student / Add Enrollment" description="Creates the student when needed, enrollment, opening payment, and uploaded Google Drive receipt as one protected workflow."/>
<Card className="mb-5 p-5">
<div className="mb-5 flex flex-wrap gap-2">
<Button type="button" variant={mode === "new" ? "primary" : "secondary"} onClick={reset}>New Student + Enrollment</Button>
<Button type="button" variant={mode === "existing" ? "primary" : "secondary"} onClick={() => setMode("existing")}>Existing Student + Enrollment</Button>
</div>
<h2 className="heading text-lg font-bold">1. Find or Create Student</h2>{mode === "existing" && <div className="mt-4">
<div className="flex gap-2">
<SearchInput className="flex-1" value={studentSearch} onChange={setStudentSearch} placeholder="Academy ID, Student ID, phone, or student name"/>
<Button type="button" variant="secondary" onClick={searchExisting}>
<Search size={15}/>Search</Button>
</div>{matches.length > 0 && <div className="mt-2 divide-y rounded border">{matches.map(match => <button type="button" className="flex w-full justify-between p-3 text-start hover:bg-red-50" key={match.academyStudentId} onClick={() => chooseExisting(match)}>
<span>
<strong>{match.studentName}</strong>
<small className="block text-slate-500">{joinDisplay(" - ", match.phone, match.studentId)}</small>
</span>
<span className="mono text-red-700">{match.academyStudentId}</span>
</button>)}</div>}{selectedAcademyId && <p className="mt-2 text-xs font-semibold text-emerald-700">Selected existing student: {selectedAcademyId}</p>}</div>}<div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
<Field label="Student Name" value={student.studentName} onChange={event => updateStudent("studentName", event.target.value)} readOnly={mode === "existing"} required/>
<Field label="Phone" value={student.phone} onChange={event => updateStudent("phone", event.target.value)} required/>
<Field label="Email" type="email" value={student.email} onChange={event => updateStudent("email", event.target.value)}/>
<LabeledSelect label="Student University" value={universityChoice} onChange={chooseUniversity} placeholder="Select Student University" required options={[...universities.map(item => ({ value: item.universityName, label: item.universityName })), { value: OTHER_UNIVERSITY_VALUE, label: "Other University - Intensive Diploma" }]}/>{intensiveMode && <Field label="Actual Student University" value={actualUniversity} onChange={event => { setActualUniversity(event.target.value); setStudent(current => ({ ...current, university: event.target.value })); }} required/>}
<LabeledSelect label="College" value={collegeChoice} onChange={chooseCollege} placeholder="Select College" required options={COLLEGE_OPTIONS.map(value => ({ value, label: value }))}/>
{collegeChoice === "Other" && <Field label="Other College Name" value={otherCollege} onChange={event => setOtherCollege(event.target.value)} required/>}
<LabeledSelect label="Department" value={departmentChoice} onChange={chooseDepartment} placeholder="Select Department" options={DEPARTMENT_OPTIONS.map(value => ({ value, label: value }))}/>
{departmentChoice === "Other" && <Field label="Other Department Name" value={otherDepartment} onChange={event => setOtherDepartment(event.target.value)} required/>}
<Field label="Student ID" value={student.studentId} onChange={event => updateStudent("studentId", event.target.value)} readOnly={mode === "existing"} required/>
<LabeledSelect label="Student Status" value={student.studentStatus} onChange={value => updateStudent("studentStatus", value)} required options={STUDENT_STATUS_OPTIONS.map(value => ({ value, label: value }))}/>
</div>{intensiveMode && <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">The student&apos;s real university is stored in their profile. Pricing and program details follow the Intensive Diploma offering.</p>}</Card>
<Card className="mb-5 p-5">
<h2 className="heading text-lg font-bold">2. Select Program Offering</h2>
<div className="mt-4 grid gap-4 md:grid-cols-2">
<LabeledSelect label="Program Scope" value={programScope} onChange={() => undefined} disabled required options={[{ value: programScope, label: intensiveMode ? "Intensive Diploma" : "University Program" }]}/>
<LabeledSelect label="Offering" value={offeringId} onChange={setOfferingId} placeholder="Select Offering" required options={offerings.map(item => ({ value: item.offeringId, label: joinDisplay(" | ", item.offeringId, item.track, item.packageLabel, `${item.exactHours}H`) }))}/>
</div>{intensiveMode && <div className="mt-3">
<StatusBadge tone="warning">Intensive Diploma</StatusBadge>
</div>}{offering ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
<Summary label="Program Scope" value={intensiveMode ? "Intensive Diploma" : offering.university}/>
<Summary label="Track" value={offering.track}/>
<Summary label="Package Label" value={offering.packageLabel}/>
<Summary label="Credit Hours" value={`${offering.exactHours}H`}/>
<Summary label="Duration Days" value={String(offering.durationDays)}/>
<Summary label="Catalogue Price" value={money(offering.price)}/>
</div> : <p className="mt-4 rounded border bg-slate-50 p-3 text-xs text-slate-500">Select a student university to load its active offerings.</p>}<div className="mt-4 max-w-md"><LabeledSelect label="Delivery Mode" value={deliveryMode} onChange={setDeliveryMode} placeholder="Select Delivery Mode" required options={DELIVERY_MODE_OPTIONS.map(option => ({ value: option.value, label: option.label }))}/></div></Card>
<Card className="mb-5 p-5">
<h2 className="heading text-lg font-bold">3. Contract, Payment & Receipt</h2>
<div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
<Field label="Discount" type="number" min="0" max={offering?.price ?? 0} value={discount} onChange={event => setDiscount(Number(event.target.value))}/>
<Field label="Discount Reason" value={discountReason} onChange={event => setDiscountReason(event.target.value)} required={discount > 0}/>
<Field label="Opening Payment Amount" type="number" min={isFreeEnrollment ? "0" : "0.01"} max={finalPrice} step="0.01" value={isFreeEnrollment ? paymentAmount : paymentAmount || ""} onChange={event => setPaymentAmount(Number(event.target.value))} required/>
<Field label="Payment Date" type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)} required/>
<LabeledSelect label="Payment Method" value={paymentMethod} onChange={setPaymentMethod} placeholder="Select Payment Method" required options={paymentMethodOptions.map(value => ({ value, label: value }))}/>
<LabeledSelect label="Receiver Name" value={receiverName} onChange={setReceiverName} placeholder="Select Receiver" required options={RECEIVER_OPTIONS.map(value => ({ value, label: value }))}/>
<Field className="md:col-span-2" label="Notes" value={notes} onChange={event => setNotes(event.target.value)}/>
</div>
<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
<Summary label="Catalogue Price" value={money(offering?.price ?? 0)}/>
<Summary label="Discount" value={money(discount)}/>
<Summary label="Final Contract Price" value={money(finalPrice)}/>
<Summary label="This Payment Amount" value={money(paymentAmount)}/>
<Summary label="Total Paid After Payment" value={money(paymentAmount)}/>
<Summary label="Remaining After Payment" value={money(remaining)}/>
<Summary label="Payment Type / Status" value={joinDisplay(" | ", paymentType, paymentStatus)}/>
<Summary label="Delivery Mode" value={deliveryMode ? deliveryModeLabel(deliveryMode) : "-"}/>
<Summary label="Receipt Number Preview" value={meta?.receiptNumberPreview ?? "-"}/>
</div>{isFreeEnrollment && <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">100% discount enrollment - zero payment receipt will be generated.</p>}{(saving || stageIndex >= 0) && <ProgressPanel current={stageIndex} failed={Boolean(formError)} failureStage={failureStage}/>} {formError && <p role="alert" className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
<strong>{failureStage ? `Failed during ${failureStage}. ` : ""}</strong>{formError}</p>}<div className="mt-5 flex justify-end gap-2">
<LinkButton href="/students" variant="secondary">Cancel</LinkButton>
<Button type="submit" disabled={saving || !offering || !deliveryMode || !receiverName || !paymentMethod || (mode === "existing" && !selectedAcademyId)}>
<ReceiptText size={16}/>{saving ? "Processing Registration & Receipt..." : "Register & Generate Receipt"}</Button>
</div>
</Card>
</form>
<ReceiptSuccessModal success={success} onClose={() => setSuccess(undefined)} onRegisterAnother={reset}/>
</>;
}

function LabeledSelect({ label, value, onChange, options, placeholder, required, disabled }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string; required?: boolean; disabled?: boolean }) { return <label className="block">
<span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}{required && <span className="text-red-700"> *</span>}</span>
<select aria-label={safeDisplayText(label)} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100" value={value} onChange={event => onChange(event.target.value)} required={required} disabled={disabled}>{placeholder && <option value="">{safeDisplayText(placeholder)}</option>}{options.map(option => <option key={option.value} value={option.value}>{safeDisplayText(option.label)}</option>)}</select>
</label>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded border bg-slate-50 p-3">
<div className="text-[10px] font-semibold uppercase text-slate-400">{label}</div>
<div className="mt-1 text-sm font-bold">{safeDisplayText(value)}</div>
</div>; }
function ProgressPanel({ current, failed, failureStage }: { current: number; failed: boolean; failureStage: string }) { return <div className="mt-5 rounded border border-blue-200 bg-blue-50 p-4">
<div className="mb-3 flex items-center gap-2 text-sm font-bold text-blue-900">{failed ? <Circle size={16}/> : <LoaderCircle className="animate-spin" size={16}/>}Receipt generation progress</div>
<div className="grid gap-2 md:grid-cols-2">{progressStages.map((stage, index) => { const complete = !failed && index < current; const active = index === current; const stageFailed = failed && failureStage.toLowerCase().includes(stage.toLowerCase().split(" ").slice(0,2).join(" ")); return <div key={stage} className={`flex items-center gap-2 rounded border bg-white px-3 py-2 text-xs ${stageFailed ? "border-red-300 text-red-800" : active ? "border-blue-400 text-blue-900" : "border-slate-200 text-slate-500"}`}>{complete ? <Check size={14} className="text-emerald-600"/> : active && !failed ? <LoaderCircle size={14} className="animate-spin text-blue-600"/> : <Circle size={14}/>}<span>{index + 1}. {stage}</span>
</div>; })}</div>
</div>; }
function ReceiptSuccessModal({ success, onClose, onRegisterAnother }: { success?: ReceiptSuccess; onClose: () => void; onRegisterAnother: () => void }) { return <Modal open={Boolean(success)} onClose={onClose} title="Receipt Generated Successfully">{success && <div>
<div className="mb-5 rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
<strong>Registration, payment, and receipt were finalized successfully.</strong>
<p className="mt-1 text-xs">The PDF was uploaded to Google Drive and the receipt record was saved.</p>
</div>
<dl className="grid gap-4 sm:grid-cols-2">
<Info label="Student Name" value={success.student.studentName}/>
<Info label="Enrollment ID" value={success.enrollment.enrollmentId}/>
<Info label="Delivery Mode" value={deliveryModeLabel(success.enrollment.deliveryMode)}/>
<Info label="Payment ID" value={success.payment.paymentId}/>
<Info label="Receipt Number" value={success.payment.receiptNumber}/>
<Info label="Payment Amount" value={money(success.payment.paymentAmount)}/>
<Info label="Remaining Balance" value={money(success.payment.remainingBalance)}/>
<Info label="Receipt Status" value={success.payment.receiptStatus}/>
</dl>
<div className="mt-6 grid gap-2 sm:grid-cols-2">
<a href={success.payment.receiptLink} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded border border-red-700 bg-red-700 px-4 text-sm font-semibold text-white">
<ExternalLink size={15}/>Open Receipt</a>
<a href={success.payment.receiptDownloadLink} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-300 px-4 text-sm font-semibold text-slate-800">
<ExternalLink size={15}/>Download PDF</a>
<LinkButton href={`/students/${encodeURIComponent(success.student.academyStudentId)}`} variant="secondary">Go to Student Profile</LinkButton>
<Button onClick={onRegisterAnother}>
<UserPlus size={15}/>Register Another Student</Button>
</div>
</div>}</Modal>; }
function Info({ label, value }: { label: string; value: string }) { return <div>
<dt className="text-xs uppercase text-slate-400">{label}</dt>
<dd className="mt-1 font-semibold">{value}</dd>
</div>; }
