"use client";

import Link from "next/link";
import { Download, ImageDown, ShieldCheck } from "lucide-react";
import { safeDisplayText } from "@/lib/display";
import type { StudentPortalCertificatePlayback, StudentPortalCertificateSummary } from "@/lib/server/student-portal/service";
import { StudentCertificateDownloadButton } from "./StudentCertificateDownloadButton";
import { StudentSecureViewerShell } from "./StudentSecureViewerShell";

export function StudentCertificateViewer({ certificate, certificates = [] }: { certificate: StudentPortalCertificatePlayback | null; certificates?: StudentPortalCertificateSummary[] }) {
  const currentIndex = certificate ? certificates.findIndex(item => item.certificateId === certificate.certificateId) : -1;
  const previous = currentIndex > 0 ? certificates[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 && currentIndex < certificates.length - 1 ? certificates[currentIndex + 1] : undefined;
  if (!certificate) return <section className="rounded-lg border border-red-200 bg-white p-8 text-center">
    <h2 className="heading text-xl font-bold text-red-800">You do not have access to this certificate.</h2>
    <p className="mt-2 text-sm text-slate-500">Only certificates published to your Student Portal can be opened here.</p>
  </section>;
  return <div className="space-y-4"><section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div><div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-emerald-700"><ShieldCheck size={14}/>Certificate Available</div><p className="mt-2 text-sm font-semibold text-emerald-900">Your official certificate is ready to view, download, or verify.</p></div>
      <div className="grid gap-2 sm:grid-cols-3">
        <StudentCertificateDownloadButton href={certificate.downloadHref} filename={certificate.pdfFilename} icon={<Download size={14}/>} label="Download as PDF" loadingLabel="Downloading PDF..." errorMessage="Unable to download the certificate PDF right now. Please try again." className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"/>
        <StudentCertificateDownloadButton href={certificate.imageDownloadHref} filename={certificate.imageFilename} icon={<ImageDown size={14}/>} label="Download as JPG" loadingLabel="Preparing JPG..." errorMessage="Unable to prepare the certificate image right now. Please try again." className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"/>
        {certificate.verificationUrl ? <Link className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50" href={certificate.verificationUrl} target="_blank"><ShieldCheck size={14}/>View Verification</Link> : null}
      </div>
    </div>
  </section><StudentSecureViewerShell mode="material" title={certificate.certificateName} meta={`Certificate ${safeDisplayText(certificate.certificateId)} | Issued ${safeDisplayText(certificate.issueDate)}`} backHref="/student/certificates" backLabel="Back to Certificates" previousHref={previous ? `/student/certificates/${encodeURIComponent(previous.certificateId)}` : undefined} previousLabel="Previous Certificate" nextHref={next ? `/student/certificates/${encodeURIComponent(next.certificateId)}` : undefined} nextLabel="Next Certificate">
      <iframe className="absolute inset-0 size-full bg-white" src={certificate.previewUrl} title={safeDisplayText(certificate.certificateName)} allow="fullscreen" allowFullScreen/>
      <div aria-hidden="true" className="absolute right-2 top-2 z-20 size-[72px] rounded-sm bg-slate-950/90 shadow-sm sm:size-[80px]" title=""/>
      <div className="pointer-events-none absolute left-3 top-3 z-30 rounded bg-white/25 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur-sm sm:left-4 sm:top-4 sm:px-3 sm:py-1.5 sm:text-xs">{safeDisplayText(certificate.studentId)} | {safeDisplayText(certificate.studentName)}</div>
    </StudentSecureViewerShell></div>;
}
