"use client";

import { Download, FileText } from "lucide-react";
import { safeDisplayText } from "@/lib/display";
import type { StudentPortalDocumentPlayback, StudentPortalDocumentSummary } from "@/types/student-documents";
import { StudentCertificateDownloadButton } from "./StudentCertificateDownloadButton";
import { StudentSecureViewerShell } from "./StudentSecureViewerShell";

export function StudentDocumentViewer({ document, documents = [] }: { document: StudentPortalDocumentPlayback | null; documents?: StudentPortalDocumentSummary[] }) {
  const currentIndex = document ? documents.findIndex(item => item.studentDocumentId === document.studentDocumentId) : -1;
  const previous = currentIndex > 0 ? documents[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 && currentIndex < documents.length - 1 ? documents[currentIndex + 1] : undefined;
  if (!document) return <section className="rounded-lg border border-red-200 bg-white p-8 text-center">
    <h2 className="heading text-xl font-bold text-red-800">You do not have access to this document.</h2>
    <p className="mt-2 text-sm text-slate-500">Only documents published to your Student Portal can be opened here.</p>
  </section>;
  return <div className="space-y-4">
    <section className="rounded-lg border border-red-100 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="inline-flex items-center gap-1.5 rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-bold text-red-700"><FileText size={14}/>{safeDisplayText(document.documentTypeLabel)}</div><p className="mt-2 text-sm font-semibold text-slate-800">{safeDisplayText(document.documentTitle)}</p>{document.documentDescription ? <p className="mt-1 text-sm text-slate-500">{safeDisplayText(document.documentDescription)}</p> : null}</div>
        <StudentCertificateDownloadButton href={document.downloadHref} filename={document.filename} icon={<Download size={14}/>} label="Download PDF" loadingLabel="Downloading PDF..." errorMessage="Unable to download this document right now. Please try again." className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50 lg:w-auto"/>
      </div>
    </section>
    <StudentSecureViewerShell mode="material" title={document.documentTitle} meta={document.documentTypeLabel} backHref="/student/documents" backLabel="Back to Documents" previousHref={previous ? `/student/documents/${encodeURIComponent(previous.studentDocumentId)}` : undefined} previousLabel="Previous Document" nextHref={next ? `/student/documents/${encodeURIComponent(next.studentDocumentId)}` : undefined} nextLabel="Next Document">
      <iframe className="absolute inset-0 size-full bg-white" src={document.previewUrl} title={safeDisplayText(document.documentTitle)} allow="fullscreen" allowFullScreen/>
      <div aria-hidden="true" className="absolute right-2 top-2 z-20 size-[72px] rounded-sm bg-slate-950/90 shadow-sm sm:size-[80px]" title=""/>
      <div className="pointer-events-none absolute left-3 top-3 z-30 rounded bg-white/25 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur-sm sm:left-4 sm:top-4 sm:px-3 sm:py-1.5 sm:text-xs student-document-watermark">{safeDisplayText(document.studentId)} | {safeDisplayText(document.studentName)}</div>
    </StudentSecureViewerShell>
    <style>{`@keyframes studentDocumentWatermark{0%{transform:translate(0,0)}50%{transform:translate(28px,22px)}100%{transform:translate(0,0)}}.student-document-watermark{animation:studentDocumentWatermark 12s ease-in-out infinite;}`}</style>
  </div>;
}
