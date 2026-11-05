"use client";

import Image from "next/image";
import Link from "next/link";
import { Award, Download, Eye, FileText, ImageDown, PlaySquare, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { packageHoursLabel, readableEnum, safeDisplayText } from "@/lib/display";
import type { StudentCertificateProfile, StudentPortalCertificateSummary, StudentPortalProfile, StudentPortalMaterialSummary, StudentPortalRecordingSummary } from "@/lib/server/student-portal/service";
import type { StudentPortalDocumentSummary } from "@/types/student-documents";
import type { StudentPortalLearningResourceSummary } from "@/types/learning-resources";
import { StudentCertificateDownloadButton } from "./StudentCertificateDownloadButton";

const money = (value: number) => new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(value);

export function StudentOverview({ profile }: { profile: StudentPortalProfile }) {
  const current = profile.enrollments[0];
  const remaining = profile.enrollments.reduce((total, enrollment) => total + enrollment.remaining, 0);
  const latestRecording = profile.recordedSessions[profile.recordedSessions.length - 1];
  const latestMaterial = profile.sessionMaterials[profile.sessionMaterials.length - 1];
  const firstName = safeDisplayText(profile.student.studentName).split(/\s+/)[0] || "there";
  return <div className="space-y-5">
    <section className="rounded-lg border border-red-100 bg-white p-5">
      <h2 className="heading text-xl font-bold">Welcome back, {firstName}</h2>
      <p className="mt-1 text-sm text-slate-500">{current ? `${safeDisplayText(current.track)} · ${readableEnum(current.deliveryMode)} · ${packageHoursLabel(current.packageLabel, current.exactHours)}` : "Your learning dashboard is ready."}</p>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Available Recordings" value={profile.recordedSessions.length}/>
      <SummaryCard label="Available Materials" value={profile.sessionMaterials.length}/>
      <SummaryCard label="Active Enrollments" value={profile.enrollments.length}/>
      <SummaryCard label="Remaining Balance" value={money(remaining)}/>
    </section>
    <section className="grid gap-5 lg:grid-cols-2">
      <ContinueCard title="Most Recent Recording" empty="No recordings are available yet." item={latestRecording} href={latestRecording ? `/student/recordings/${encodeURIComponent(latestRecording.recordingId)}` : "/student/recordings"} action="View Recordings"/>
      <ContinueCard title="Most Recent Material" empty="No materials are available yet." item={latestMaterial} href={latestMaterial ? `/student/materials/${encodeURIComponent(latestMaterial.materialId)}` : "/student/materials"} action="View Materials"/>
    </section>
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="heading text-lg font-bold">Account Summary</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Info label="University" value={profile.student.university}/>
        <Info label="College" value={profile.student.college}/>
        <Info label="University Student ID" value={profile.student.studentId}/>
      </div>
    </section>
  </div>;
}

export function StudentRecordingsPageContent({ profile }: { profile: StudentPortalProfile }) {
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [session, setSession] = useState("");
  const recordings = useMemo(() => filterRecordings(profile.recordedSessions, search, level, session), [level, profile.recordedSessions, search, session]);
  return <div className="space-y-5">
    <PortalFilters description="Published recordings available for your assigned groups." search={search} onSearch={setSearch} searchPlaceholder="Search recordings" level={level} onLevel={setLevel} levels={unique(profile.recordedSessions.map(item => item.levelCode))} session={session} onSession={setSession} sessions={unique(profile.recordedSessions.map(item => item.sessionNumber))}/>
    {!profile.recordedSessions.length ? <EmptyPanel title="No recorded sessions are available yet."/> : !recordings.length ? <EmptyPanel title="No recordings match these filters."/> : <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{recordings.map(recording => <RecordingCard key={recording.recordingId} recording={recording}/>)}</section>}
  </div>;
}

export function StudentMaterialsPageContent({ profile }: { profile: StudentPortalProfile }) {
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [session, setSession] = useState("");
  const [materialType, setMaterialType] = useState("");
  const materials = useMemo(() => filterMaterials(profile.sessionMaterials, search, level, session, materialType), [level, materialType, profile.sessionMaterials, search, session]);
  return <div className="space-y-5">
    <PortalFilters description="Published materials available for your assigned groups." search={search} onSearch={setSearch} searchPlaceholder="Search materials" level={level} onLevel={setLevel} levels={unique(profile.sessionMaterials.map(item => item.levelCode))} session={session} onSession={setSession} sessions={unique(profile.sessionMaterials.map(item => item.sessionNumber))} materialType={materialType} onMaterialType={setMaterialType} materialTypes={unique(profile.sessionMaterials.map(item => item.materialType))}/>
    {!profile.sessionMaterials.length ? <EmptyPanel title="No session materials are available yet."/> : !materials.length ? <EmptyPanel title="No materials match these filters."/> : <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{materials.map(material => <MaterialCard key={material.materialId} material={material}/>)}</section>}
  </div>;
}

export function StudentResourcesPageContent({ resources }: { resources: StudentPortalLearningResourceSummary[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const categories = useMemo(() => unique(resources.map(item => item.resourceCategory)), [resources]);
  const visible = useMemo(() => resources.filter(resource => {
    const query = search.trim().toLowerCase();
    return (!category || resource.resourceCategory === category)
      && (!query || [resource.resourceTitle, resource.resourceDescription, resource.resourceCategory, resource.relatedSessionLabel].some(value => value.toLowerCase().includes(query)));
  }), [category, resources, search]);
  return <div className="space-y-5">
    <PortalResourceIntro/>
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-3 text-sm text-slate-500">Explore additional learning resources selected by TechTrek to help you review concepts, strengthen your skills, and get extra support throughout your training journey.</p>
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search resources" aria-label="Search resources" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm text-slate-700"/>
        <SelectFilter label="Category" value={category} onChange={setCategory} options={categories}/>
      </div>
    </section>
    {!resources.length ? <EmptyPanel title="No learning resources are available yet."/> : !visible.length ? <EmptyPanel title="No resources match these filters."/> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(resource => <LearningResourceCard key={resource.resourceId} resource={resource}/>)}</section>}
  </div>;
}

export function StudentDocumentsPageContent({ documents }: { documents: StudentPortalDocumentSummary[] }) {
  const [search, setSearch] = useState("");
  const [documentType, setDocumentType] = useState("");
  const documentTypes = useMemo(() => unique(documents.map(item => item.documentTypeLabel)), [documents]);
  const visible = useMemo(() => documents.filter(document => {
    const query = search.trim().toLowerCase();
    return (!documentType || document.documentTypeLabel === documentType)
      && (!query || [document.documentTitle, document.documentDescription, document.documentTypeLabel].some(value => value.toLowerCase().includes(query)));
  }), [documentType, documents, search]);
  return <div className="space-y-5">
    <section className="overflow-hidden rounded-2xl border border-red-100 bg-[radial-gradient(circle_at_top_right,rgba(220,38,38,.12),transparent_35%),linear-gradient(135deg,#fff,#fff7f7)] p-5 shadow-[0_10px_36px_rgba(127,29,29,.06)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-red-700">My Documents</div><h2 className="heading mt-1 text-2xl font-black text-slate-950">Official documents shared with you</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Access published PDFs that TechTrek has made available for your enrollment.</p></div>
        <span className="grid size-14 place-items-center rounded-2xl bg-white text-red-700 shadow-sm"><FileText size={28}/></span>
      </div>
    </section>
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search documents" aria-label="Search documents" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm text-slate-700"/>
        <SelectFilter label="Document Type" value={documentType} onChange={setDocumentType} options={documentTypes}/>
      </div>
    </section>
    {!documents.length ? <EmptyPanel title="No documents are available yet." detail="Official documents will appear here once TechTrek publishes them to your portal."/> : !visible.length ? <EmptyPanel title="No documents match these filters."/> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(document => <StudentDocumentCard key={document.studentDocumentId} document={document}/>)}</section>}
  </div>;
}

export function StudentPaymentsPageContent({ profile }: { profile: StudentPortalProfile }) {
  if (!profile.enrollments.length) return <EmptyPanel title="No enrollments found."/>;
  return <section className="space-y-5">{profile.enrollments.map(enrollment => <article key={enrollment.enrollmentId} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
    <div className="border-b border-slate-100 bg-slate-50 p-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div><div className="font-mono text-xs font-semibold text-red-700">{safeDisplayText(enrollment.enrollmentId)}</div><h2 className="heading mt-1 text-xl font-bold">{safeDisplayText(enrollment.track)}</h2><p className="mt-1 text-sm text-slate-500">{packageHoursLabel(enrollment.packageLabel, enrollment.exactHours)}</p></div>
        <div className="flex flex-wrap gap-2"><Badge>{enrollment.enrollmentStatus}</Badge><Badge>{enrollment.paymentStatus}</Badge></div>
      </div>
    </div>
    <div className="grid gap-5 p-5 xl:grid-cols-[1fr_1.2fr]">
      <div><h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Enrollment Summary</h3><div className="grid gap-3 sm:grid-cols-2"><Info label="Program Scope" value={enrollment.programScope}/><Info label="Exact / Credit Hours" value={`${enrollment.exactHours}H`}/><Info label="Delivery Mode" value={readableEnum(enrollment.deliveryMode)}/><Info label="Enrollment Status" value={enrollment.enrollmentStatus}/><Info label="Payment Status" value={enrollment.paymentStatus}/><Info label="Final Contract Price" value={money(enrollment.finalContractPrice)}/><Info label="Total Paid" value={money(enrollment.totalPaid)}/><Info label="Remaining Balance" value={money(enrollment.remaining)}/></div></div>
      <div><h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Payments & Receipts</h3>{!enrollment.payments.length ? <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No receipt available yet.</div> : <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[860px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>{["Payment Date", "Payment Type", "Amount", "Total Paid After", "Remaining After", "Payment Method", "Receipt Number", "Receipt Status", "Receipt"].map(header => <th key={header} className="px-3 py-2.5">{header}</th>)}</tr></thead><tbody>{enrollment.payments.map(payment => <tr key={`${enrollment.enrollmentId}-${payment.receiptNumber}-${payment.paymentDate}`} className="border-t border-slate-100"><td className="px-3 py-3">{safeDisplayText(payment.paymentDate)}</td><td className="px-3 py-3">{safeDisplayText(payment.paymentType)}</td><td className="px-3 py-3 font-semibold">{money(payment.paymentAmount)}</td><td className="px-3 py-3">{money(payment.totalPaidAfterPayment)}</td><td className="px-3 py-3">{money(payment.remainingAfterPayment)}</td><td className="px-3 py-3">{safeDisplayText(payment.paymentMethod)}</td><td className="px-3 py-3 font-mono">{safeDisplayText(payment.receiptNumber)}</td><td className="px-3 py-3"><Badge>{safeDisplayText(payment.receiptStatus)}</Badge></td><td className="px-3 py-3">{payment.receiptLink ? <a className="inline-flex h-8 items-center justify-center rounded border border-red-700 bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800" href={payment.receiptLink} target="_blank" rel="noreferrer">View Receipt</a> : <span className="text-slate-400">No receipt available yet.</span>}</td></tr>)}</tbody></table></div>}</div>
    </div>
  </article>)}</section>;
}

export function StudentProfilePageContent({ profile }: { profile: StudentPortalProfile }) {
  const current = profile.enrollments[0];
  return <section className="rounded-lg border border-slate-200 bg-white p-5">
    <h2 className="heading text-lg font-bold">Profile Summary</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Info label="Student Name" value={profile.student.studentName}/>
      <Info label="Academy Student ID" value={profile.student.academyStudentId}/>
      <Info label="University Student ID" value={profile.student.studentId}/>
      <Info label="Phone" value={profile.student.phone}/>
      <Info label="Email" value={profile.student.email}/>
      <Info label="University" value={profile.student.university}/>
      <Info label="College" value={profile.student.college}/>
      <Info label="Department" value={profile.student.department}/>
      <Info label="Current Program / Track" value={current?.track ?? "-"}/>
      <Info label="Delivery Mode" value={current ? readableEnum(current.deliveryMode) : "-"}/>
      <Info label="Intake" value={current?.intake ?? "-"}/>
    </div>
  </section>;
}

export function StudentCertificatesPageContent({ profile, certificates = [] }: { profile: StudentPortalProfile; certificates?: StudentPortalCertificateSummary[] }) {
  const initialProfile = profile.student.certificateProfile;
  const [certificateProfile, setCertificateProfile] = useState(initialProfile);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [certificateName, setCertificateName] = useState(initialProfile.certificateName);
  const [certificateEmail, setCertificateEmail] = useState(initialProfile.certificateEmail);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const locked = certificateProfile.certificateProfileStatus === "CONFIRMED";
  const validate = () => {
    const name = normalizeCertificateNameInput(certificateName);
    const email = normalizeCertificateEmailInput(certificateEmail);
    setCertificateName(name);
    setCertificateEmail(email);
    return { certificateName: name, certificateEmail: email };
  };
  const continueToReview = () => {
    setError("");
    try {
      validate();
      setStep("confirm");
      setConfirmed(false);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Please review your certificate information.");
    }
  };
  const submit = async () => {
    setError("");
    setSubmitting(true);
    try {
      const input = validate();
      const response = await studentPortalFetch<{ profile: StudentCertificateProfile }>("/api/student-portal/certificate-profile", { method: "POST", body: JSON.stringify(input) });
      setCertificateProfile(response.profile);
      setCertificateName(response.profile.certificateName);
      setCertificateEmail(response.profile.certificateEmail);
      setStep("edit");
      setConfirmed(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };
  const heroName = certificates[0]?.studentNameOnCertificate || certificateProfile.certificateName;
  if (locked) return <div className="space-y-5">{certificates.length ? <CertificateAchievementHero studentName={heroName}/> : null}<MyCertificates certificates={certificates}/><section className="rounded-lg border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="heading text-xl font-bold">Certificate Information</h2><p className="mt-1 text-sm text-slate-500">Your certificate identity information has been confirmed.</p></div>
      <Badge>Confirmed</Badge>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <Info label="Name on Certificate" value={certificateProfile.certificateName}/>
      <Info label="Certificate Email" value={certificateProfile.certificateEmail}/>
      <Info label="Confirmed on" value={formatConfirmedAt(certificateProfile.certificateProfileConfirmedAt)}/>
    </div>
  </section></div>;
  return <div className="space-y-5"><section className="rounded-lg border border-slate-200 bg-white p-5">
    {step === "edit" ? <>
      <h2 className="heading text-xl font-bold">Certificate Information</h2>
      <p className="mt-1 text-sm text-slate-500">This information will be used on your certificate. You can edit it freely before final confirmation.</p>
      <div className="mt-5 grid gap-4">
        <CertificateField label="Full Name in English" helper="Enter your full name exactly as you want it to appear on your certificate." value={certificateName} onChange={setCertificateName} autoComplete="name"/>
        <CertificateField label="Certificate Email" helper="Your certificate will be sent to this email address." value={certificateEmail} onChange={setCertificateEmail} type="email" autoComplete="email"/>
      </div>
      {error && <ErrorPanel message={error}/>}
      <button type="button" onClick={continueToReview} className="mt-5 inline-flex h-10 w-full items-center justify-center rounded border border-red-700 bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 sm:w-auto">Continue</button>
    </> : <>
      <h2 className="heading text-xl font-bold">Confirm Certificate Information</h2>
      <p className="mt-1 text-sm text-slate-500">Your name will appear on your certificate exactly as shown below.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Info label="Name on Certificate" value={certificateName}/>
        <Info label="Certificate Delivery Email" value={certificateEmail}/>
      </div>
      <div className="mt-5 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Please review your information carefully. After final confirmation, you will not be able to edit this information from the Student Portal.</div>
      <label className="mt-4 flex items-start gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 accent-red-700"/>I confirm that my name and email are correct.</label>
      {error && <ErrorPanel message={error}/>}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={submitting} onClick={() => { setStep("edit"); setConfirmed(false); setError(""); }} className="inline-flex h-10 items-center justify-center rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Back and Edit</button>
        <button type="button" disabled={!confirmed || submitting} onClick={() => void submit()} className="inline-flex h-10 items-center justify-center rounded border border-red-700 bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:pointer-events-none disabled:opacity-50">{submitting ? "Confirming..." : "Confirm Information"}</button>
      </div>
    </>}
  </section><MyCertificates certificates={certificates}/></div>;
}

export function StudentPlaceholderPageContent({ title, detail }: { title: string; detail: string }) {
  return <EmptyPanel title={title} detail={detail}/>;
}

function RecordingCard({ recording }: { recording: StudentPortalRecordingSummary }) {
  return <article className="flex min-h-[168px] flex-col rounded-lg border border-slate-200 bg-white p-4 transition hover:border-red-200 hover:shadow-sm">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-wide text-red-700">SESSION {safeDisplayText(recording.sessionNumber)}</div><h2 className="heading mt-2 line-clamp-2 text-base font-bold leading-snug">{recordingCardTitle(recording)}</h2></div><Badge>{levelLabel(recording.levelCode)}</Badge></div>
    <Link className="mt-auto inline-flex h-9 w-full items-center justify-center rounded border border-red-700 bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800 sm:w-auto" href={`/student/recordings/${encodeURIComponent(recording.recordingId)}`}>Watch Recording</Link>
  </article>;
}

function MaterialCard({ material }: { material: StudentPortalMaterialSummary }) {
  return <article className="flex min-h-[168px] flex-col rounded-lg border border-slate-200 bg-white p-4 transition hover:border-red-200 hover:shadow-sm">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-wide text-red-700">SESSION {safeDisplayText(material.sessionNumber)}</div><h2 className="heading mt-2 line-clamp-2 text-base font-bold leading-snug">{materialCardTitle(material)}</h2>{material.materialType && <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{safeDisplayText(material.materialType)}</p>}</div><Badge>{levelLabel(material.levelCode)}</Badge></div>
    <Link className="mt-auto inline-flex h-9 w-full items-center justify-center rounded border border-red-700 bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800 sm:w-auto" href={`/student/materials/${encodeURIComponent(material.materialId)}`}>View Material</Link>
  </article>;
}

function PortalResourceIntro() {
  return <section className="overflow-hidden rounded-2xl border border-red-100 bg-[radial-gradient(circle_at_top_right,rgba(220,38,38,.12),transparent_35%),linear-gradient(135deg,#fff,#fff7f7)] p-5 shadow-[0_10px_36px_rgba(127,29,29,.06)]">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-red-700">Learning Resources</div><h2 className="heading mt-1 text-2xl font-black text-slate-950">Curated support for your training journey</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Watch revision videos, tutorials, project support, and extra practice selected for your group.</p></div>
      <span className="grid size-14 place-items-center rounded-2xl bg-white text-red-700 shadow-sm"><PlaySquare size={28}/></span>
    </div>
  </section>;
}

function LearningResourceCard({ resource }: { resource: StudentPortalLearningResourceSummary }) {
  return <article className="flex min-h-[210px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-red-200 hover:shadow-md">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><span className="inline-flex rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">{safeDisplayText(resource.resourceCategory)}</span><h2 className="heading mt-3 text-lg font-black leading-snug text-slate-950">{safeDisplayText(resource.resourceTitle)}</h2></div>
      <PlaySquare className="shrink-0 text-slate-300" size={24}/>
    </div>
    {resource.resourceDescription ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{safeDisplayText(resource.resourceDescription)}</p> : <p className="mt-3 text-sm text-slate-500">Additional video resource selected for your Group.</p>}
    {resource.relatedSessionLabel ? <p className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{safeDisplayText(resource.relatedSessionLabel)}</p> : null}
    <Link className="mt-auto inline-flex h-10 w-full items-center justify-center gap-2 rounded border border-red-700 bg-red-700 px-3 text-xs font-bold text-white hover:bg-red-800 sm:w-auto" href={`/student/resources/${encodeURIComponent(resource.resourceId)}`}><PlaySquare size={14}/>Watch Resource</Link>
  </article>;
}

function StudentDocumentCard({ document }: { document: StudentPortalDocumentSummary }) {
  return <article className="flex min-h-[210px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-red-200 hover:shadow-md">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><span className="inline-flex rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">{safeDisplayText(document.documentTypeLabel)}</span><h2 className="heading mt-3 text-lg font-black leading-snug text-slate-950">{safeDisplayText(document.documentTitle)}</h2></div>
      <FileText className="shrink-0 text-slate-300" size={24}/>
    </div>
    {document.documentDescription ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{safeDisplayText(document.documentDescription)}</p> : <p className="mt-3 text-sm text-slate-500">Official PDF document published for your enrollment.</p>}
    <div className="mt-auto grid gap-2 pt-4 sm:grid-cols-2">
      <ActionLink primary href={document.viewHref} icon={<Eye size={15}/>} label="View PDF"/>
      <StudentCertificateDownloadButton href={document.downloadHref} filename={document.filename} icon={<Download size={15}/>} label="Download PDF" loadingLabel="Downloading PDF..." errorMessage="Unable to download this document right now. Please try again." className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-50"/>
    </div>
  </article>;
}

function CertificateAchievementHero({ studentName }: { studentName: string }) {
  return <section className="relative overflow-hidden rounded-3xl border border-red-100 bg-[radial-gradient(circle_at_top_right,rgba(220,38,38,.16),transparent_34%),linear-gradient(135deg,#fff_0%,#fff7f7_48%,#fff_100%)] p-6 shadow-[0_18px_60px_rgba(127,29,29,.10)] sm:p-8">
    <div className="absolute -right-12 -top-12 size-40 rounded-full bg-red-100/50 blur-2xl" aria-hidden="true"/>
    <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <div className="flex items-center gap-3"><span className="grid size-12 place-items-center overflow-hidden rounded-2xl bg-white shadow-sm"><Image src="/brand/techtrek-logo.png" alt="TechTrek logo" width={44} height={44} className="size-11 object-contain" priority unoptimized/></span><span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white/80 px-3 py-1 text-[11px] font-black uppercase tracking-[.18em] text-red-700"><Sparkles size={13}/>Certificate Achievement</span></div>
        <h1 className="heading mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Congratulations on Your Achievement! 🎓</h1>
        <p className="mt-4 text-lg font-bold text-red-700">Congratulations, {safeDisplayText(studentName)}! 🎓</p>
        <div className="mt-4 max-w-3xl space-y-3 text-sm leading-6 text-slate-700 sm:text-base">
          <p>TechTrek is proud to recognize your dedication, commitment, and effort throughout your training journey. Successfully completing this program reflects the time, hard work, and determination you invested in developing your skills and advancing your professional knowledge.</p>
          <p>We sincerely appreciate your participation and wish you continued success in your career and future achievements. Keep learning, keep building, and keep moving forward.</p>
          <p className="font-semibold text-slate-950">Your official certificate is now available below.</p>
        </div>
      </div>
      <div className="hidden lg:grid size-36 place-items-center rounded-full border border-red-100 bg-white/80 text-red-700 shadow-inner"><Award size={68}/></div>
    </div>
    <style>{`@media (prefers-reduced-motion:no-preference){.certificate-card-lift{transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}.certificate-card-lift:hover{transform:translateY(-2px)}}`}</style>
  </section>;
}

function MyCertificates({ certificates }: { certificates: StudentPortalCertificateSummary[] }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_36px_rgba(15,23,42,.05)] sm:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="heading text-2xl font-black tracking-tight">My Certificates</h2><p className="mt-1 text-sm text-slate-500">Your official TechTrek certificates are available here.</p></div>{certificates.length ? <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">{certificates.length} available</span> : null}</div>
    {!certificates.length ? <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">Your certificates will appear here once they are issued and made available by TechTrek.</div> : <div className="mt-5 grid gap-4 xl:grid-cols-2">{certificates.map(certificate => <article key={certificate.certificateId} className="certificate-card-lift overflow-hidden rounded-2xl border border-red-100 bg-gradient-to-br from-white via-white to-red-50/40 shadow-sm">
      <div className="border-b border-red-100/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0"><div className="font-mono text-xs font-bold text-red-700">{safeDisplayText(certificate.certificateId)}</div><h3 className="heading mt-2 text-xl font-black leading-tight text-slate-950">{safeDisplayText(certificate.certificateName)}</h3><p className="mt-2 text-sm font-medium text-slate-500">Issued on {safeDisplayText(certificate.issueDate)}</p></div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"><ShieldCheck size={14}/>Certificate Available</span>
        </div>
      </div>
      <div className="grid gap-2 p-5 sm:grid-cols-2">
        <ActionLink primary href={certificate.viewHref} icon={<Eye size={15}/>} label="View Certificate"/>
        <StudentCertificateDownloadButton href={certificate.downloadHref} filename={certificate.pdfFilename} icon={<Download size={15}/>} label="Download as PDF" loadingLabel="Downloading PDF..." errorMessage="Unable to download the certificate PDF right now. Please try again." className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-50"/>
        <StudentCertificateDownloadButton href={certificate.imageDownloadHref} filename={certificate.imageFilename} icon={<ImageDown size={15}/>} label="Download as JPG" loadingLabel="Preparing JPG..." errorMessage="Unable to prepare the certificate image right now. Please try again." className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-50"/>
        {certificate.verificationUrl ? <ActionLink href={certificate.verificationUrl} target="_blank" icon={<ShieldCheck size={15}/>} label="View Verification"/> : null}
      </div>
    </article>)}</div>}
  </section>;
}

function ActionLink({ href, label, icon, primary = false, target }: { href: string; label: string; icon: ReactNode; primary?: boolean; target?: "_blank" }) {
  return <Link className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold ${primary ? "border border-red-700 bg-red-700 text-white hover:bg-red-800" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`} href={href} target={target}>{icon}{label}</Link>;
}

function ContinueCard({ title, empty, item, href, action }: { title: string; empty: string; item?: StudentPortalRecordingSummary | StudentPortalMaterialSummary; href: string; action: string }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-5"><h2 className="heading text-lg font-bold">{title}</h2>{item ? <><p className="mt-2 font-semibold">{displayTitle("recordingTitle" in item ? item.recordingTitle : item.materialTitle)}</p><p className="mt-1 text-sm text-slate-500">Session {safeDisplayText(item.sessionNumber)} · {safeDisplayText(item.levelCode)}</p></> : <p className="mt-2 text-sm text-slate-500">{empty}</p>}<Link className="mt-4 inline-flex h-9 items-center justify-center rounded border border-red-700 bg-red-700 px-3 text-xs font-semibold text-white" href={href}>{action}</Link></section>;
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="heading mt-2 text-2xl font-bold">{safeDisplayText(value)}</div></section>;
}

function PortalFilters({ description, search, onSearch, searchPlaceholder, level, onLevel, levels, session, onSession, sessions, materialType, onMaterialType, materialTypes = [] }: { description: string; search: string; onSearch: (value: string) => void; searchPlaceholder: string; level: string; onLevel: (value: string) => void; levels: string[]; session: string; onSession: (value: string) => void; sessions: string[]; materialType?: string; onMaterialType?: (value: string) => void; materialTypes?: string[] }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-4">
    <p className="mb-3 text-sm text-slate-500">{description}</p>
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
      <input value={search} onChange={event => onSearch(event.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm text-slate-700"/>
      <SelectFilter label="Level" value={level} onChange={onLevel} options={levels}/>
      <SelectFilter label="Session" value={session} onChange={onSession} options={sessions}/>
      {onMaterialType && <SelectFilter label="Material Type" value={materialType ?? ""} onChange={onMaterialType} options={materialTypes}/>}
    </div>
  </section>;
}

function EmptyPanel({ title, detail }: { title: string; detail?: string }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-8 text-center"><h2 className="heading text-lg font-bold text-slate-900">{safeDisplayText(title)}</h2>{detail && <p className="mt-2 text-sm text-slate-500">{safeDisplayText(detail)}</p>}</section>;
}

function Info({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 break-words text-sm font-semibold text-slate-900">{safeDisplayText(value)}</div></div>;
}

function Badge({ children }: { children: string }) {
  return <span className="inline-flex whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{safeDisplayText(children)}</span>;
}

function CertificateField({ label, helper, value, onChange, type = "text", autoComplete }: { label: string; helper: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-800">{label}</span><input required type={type} value={value} autoComplete={autoComplete} onChange={event => onChange(event.target.value)} className="h-11 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"/><span className="mt-1.5 block text-xs text-slate-500">{helper}</span></label>;
}

function ErrorPanel({ message }: { message: string }) {
  return <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{safeDisplayText(message)}</div>;
}

function normalizeCertificateNameInput(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Full Name in English is required.");
  if (!/[A-Za-z]/.test(name)) throw new Error("Certificate name must include English letters.");
  if (!/^[A-Za-z][A-Za-z\s'.-]*[A-Za-z.]$/.test(name) && !/^[A-Za-z]$/.test(name)) throw new Error("Certificate name may contain English letters, spaces, hyphen, apostrophe, and period only.");
  return name;
}

function normalizeCertificateEmailInput(value: string) {
  const email = value.trim().toLowerCase();
  if (!email) throw new Error("Certificate Email is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid certificate delivery email address.");
  return email;
}

function formatConfirmedAt(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-EG", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

async function studentPortalFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", ...options?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  return data as T;
}

function recordingCardTitle(recording: StudentPortalRecordingSummary) {
  const session = sessionNumberLabel(recording.sessionNumber);
  const cleaned = displayTitle(recording.recordingTitle, session);
  return cleaned || `Session ${session} Recording`;
}

function materialCardTitle(material: StudentPortalMaterialSummary) {
  const session = sessionNumberLabel(material.sessionNumber);
  const cleaned = displayTitle(material.materialTitle, session);
  return cleaned || `Session ${session} Material`;
}

function displayTitle(value: string, sessionNumber = "") {
  const title = safeDisplayText(value).trim().replace(/\s+/g, " ");
  const withoutLevelPrefix = title.replace(/^Level[_\s-]*\d+\s+Session\s+\d+\s*[-–—]\s*/i, "");
  const genericSessionOnly = new RegExp(`^Session\\s*${escapeRegex(sessionNumber)}\\s+(Recording|Material)$`, "i");
  if (genericSessionOnly.test(withoutLevelPrefix)) return withoutLevelPrefix.replace(/\s+/g, " ");
  return withoutLevelPrefix || title;
}

function levelLabel(value: string) {
  const text = safeDisplayText(value).trim().replace(/_/g, " ").replace(/\s+/g, " ");
  const match = text.match(/^level\s*(\d+)$/i);
  return match ? `LEVEL ${match[1]}` : text.toUpperCase();
}

function sessionNumberLabel(value: string) {
  return safeDisplayText(value).replace(/^session\s*/i, "").trim() || safeDisplayText(value);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="block"><span className="sr-only">{label}</span><select value={value} onChange={event => onChange(event.target.value)} aria-label={label} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-700"><option value="">All {label}s</option>{options.map(option => <option key={option} value={option}>{safeDisplayText(option)}</option>)}</select></label>;
}

function unique(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function filterRecordings(rows: StudentPortalRecordingSummary[], search: string, level: string, session: string) {
  const query = search.trim().toLowerCase();
  return rows.filter(row => (!query || [row.recordingTitle, row.sessionNumber, row.levelCode].some(value => value.toLowerCase().includes(query))) && (!level || row.levelCode === level) && (!session || row.sessionNumber === session));
}

function filterMaterials(rows: StudentPortalMaterialSummary[], search: string, level: string, session: string, materialType: string) {
  const query = search.trim().toLowerCase();
  return rows.filter(row => (!query || [row.materialTitle, row.sessionNumber, row.levelCode, row.materialType].some(value => value.toLowerCase().includes(query))) && (!level || row.levelCode === level) && (!session || row.sessionNumber === session) && (!materialType || row.materialType === materialType));
}
