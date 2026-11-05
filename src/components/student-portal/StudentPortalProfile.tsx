import Image from "next/image";
import Link from "next/link";
import { packageHoursLabel, readableEnum, safeDisplayText } from "@/lib/display";
import type { StudentPortalProfile as StudentPortalProfileData } from "@/lib/server/student-portal/service";
import { StudentPortalLogoutButton } from "./StudentPortalLogoutButton";

const money = (value: number) => new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(value);

export function StudentPortalProfile({ profile }: { profile: StudentPortalProfileData }) {
  return <main className="min-h-screen bg-[#f7f8fc] px-4 py-6 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,.04)] sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded">
            <Image src="/brand/techtrek-logo.png" alt="TechTrek" width={48} height={48} className="size-12 object-contain" priority unoptimized/>
          </span>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-red-700">TechTrek Student Portal</div>
            <h1 className="heading text-2xl font-bold text-slate-950">{safeDisplayText(profile.student.studentName)}</h1>
          </div>
        </div>
        <StudentPortalLogoutButton/>
      </header>

      <section className="mb-5 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="heading text-lg font-bold">Profile Summary</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Student Name" value={profile.student.studentName}/>
          <Info label="University Student ID" value={profile.student.studentId}/>
          <Info label="Phone" value={profile.student.phone}/>
          <Info label="Email" value={profile.student.email}/>
          <Info label="University" value={profile.student.university}/>
          <Info label="College" value={profile.student.college}/>
          <Info label="Department" value={profile.student.department}/>
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="heading text-lg font-bold">Recorded Sessions</h2>
          <p className="mt-1 text-sm text-slate-500">Published recordings available for your assigned groups.</p>
        </div>
        {!profile.recordedSessions.length ? <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No recorded sessions are available yet.</section> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{profile.recordedSessions.map(recording => <article key={recording.recordingId} className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-red-700">Session {safeDisplayText(recording.sessionNumber)}</div>
              <h3 className="heading mt-1 text-lg font-bold text-slate-950">{safeDisplayText(recording.recordingTitle)}</h3>
            </div>
            <Badge>{safeDisplayText(recording.levelCode)}</Badge>
          </div>
          <div className="mt-3 text-sm text-slate-500">{safeDisplayText(recording.provider)}</div>
          <Link className="mt-4 inline-flex h-9 items-center justify-center rounded border border-red-700 bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800" href={`/student/recordings/${encodeURIComponent(recording.recordingId)}`}>Watch Recording</Link>
        </article>)}</section>}

        <div>
          <h2 className="heading text-lg font-bold">Session Materials</h2>
          <p className="mt-1 text-sm text-slate-500">Published materials available for your assigned groups.</p>
        </div>
        {!profile.sessionMaterials.length ? <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No session materials are available yet.</section> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{profile.sessionMaterials.map(material => <article key={material.materialId} className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-red-700">Session {safeDisplayText(material.sessionNumber)}</div>
              <h3 className="heading mt-1 text-lg font-bold text-slate-950">{safeDisplayText(material.materialTitle)}</h3>
            </div>
            <Badge>{safeDisplayText(material.levelCode)}</Badge>
          </div>
          <div className="mt-3 text-sm text-slate-500">{safeDisplayText(material.materialType)}</div>
          <Link className="mt-4 inline-flex h-9 items-center justify-center rounded border border-red-700 bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800" href={`/student/materials/${encodeURIComponent(material.materialId)}`}>View Material</Link>
        </article>)}</section>}

        <div>
          <h2 className="heading text-lg font-bold">Enrollments & Receipts</h2>
          <p className="mt-1 text-sm text-slate-500">Read-only enrollment, payment, and receipt information for your TechTrek records.</p>
        </div>
        {!profile.enrollments.length ? <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No enrollments found.</section> : profile.enrollments.map(enrollment => <article key={enrollment.enrollmentId} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-slate-50 p-5">
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
              <div>
                <div className="font-mono text-xs font-semibold text-red-700">{safeDisplayText(enrollment.enrollmentId)}</div>
                <h3 className="heading mt-1 text-xl font-bold text-slate-950">{safeDisplayText(enrollment.track)}</h3>
                <p className="mt-1 text-sm text-slate-500">{packageHoursLabel(enrollment.packageLabel, enrollment.exactHours)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{safeDisplayText(enrollment.enrollmentStatus)}</Badge>
                <Badge>{safeDisplayText(enrollment.paymentStatus)}</Badge>
              </div>
            </div>
          </div>
          <div className="grid gap-5 p-5 xl:grid-cols-[1fr_1.2fr]">
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Enrollment Details</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Registration Date" value={enrollment.registrationDate}/>
                <Info label="Intake" value={enrollment.intake}/>
                <Info label="Program Scope / University" value={enrollment.programScope}/>
                <Info label="Delivery Mode" value={readableEnum(enrollment.deliveryMode)}/>
                <Info label="Final Contract Price" value={money(enrollment.finalContractPrice)}/>
                <Info label="Total Paid" value={money(enrollment.totalPaid)}/>
                <Info label="Remaining" value={money(enrollment.remaining)}/>
              </div>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Payments & Receipts</h4>
              {!enrollment.payments.length ? <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No receipt available yet.</div> : <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full min-w-[860px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>{["Payment Date", "Payment Type", "Amount", "Total Paid After", "Remaining After", "Payment Method", "Receipt Number", "Receipt Status", "Receipt"].map(header => <th key={header} className="px-3 py-2.5">{header}</th>)}</tr>
                  </thead>
                  <tbody>{enrollment.payments.map(payment => <tr key={`${enrollment.enrollmentId}-${payment.receiptNumber}-${payment.paymentDate}`} className="border-t border-slate-100">
                    <td className="px-3 py-3">{safeDisplayText(payment.paymentDate)}</td>
                    <td className="px-3 py-3">{safeDisplayText(payment.paymentType)}</td>
                    <td className="px-3 py-3 font-semibold">{money(payment.paymentAmount)}</td>
                    <td className="px-3 py-3">{money(payment.totalPaidAfterPayment)}</td>
                    <td className="px-3 py-3">{money(payment.remainingAfterPayment)}</td>
                    <td className="px-3 py-3">{safeDisplayText(payment.paymentMethod)}</td>
                    <td className="px-3 py-3 font-mono">{safeDisplayText(payment.receiptNumber)}</td>
                    <td className="px-3 py-3"><Badge>{safeDisplayText(payment.receiptStatus)}</Badge></td>
                    <td className="px-3 py-3">{payment.receiptLink ? <a className="inline-flex h-8 items-center justify-center rounded border border-red-700 bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800" href={payment.receiptLink} target="_blank" rel="noreferrer">View Receipt</a> : <span className="text-slate-400">No receipt available yet.</span>}</td>
                  </tr>)}</tbody>
                </table>
              </div>}
            </div>
          </div>
        </article>)}
      </section>
    </div>
  </main>;
}

function Info({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded border border-slate-200 bg-slate-50 p-3">
    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
    <div className="mt-1 break-words text-sm font-semibold text-slate-900">{safeDisplayText(value)}</div>
  </div>;
}

function Badge({ children }: { children: string }) {
  return <span className="inline-flex whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{safeDisplayText(children)}</span>;
}
