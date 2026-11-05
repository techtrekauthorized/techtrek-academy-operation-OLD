"use client";

import { safeDisplayText } from "@/lib/display";
import type { StudentPortalMaterialPlayback, StudentPortalMaterialSummary } from "@/lib/server/student-portal/service";
import { StudentSecureViewerShell } from "./StudentSecureViewerShell";

export function StudentMaterialViewer({ material, materials = [] }: { material: StudentPortalMaterialPlayback | null; materials?: StudentPortalMaterialSummary[] }) {
  const currentIndex = material ? materials.findIndex(item => item.materialId === material.materialId) : -1;
  const previous = currentIndex > 0 ? materials[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 && currentIndex < materials.length - 1 ? materials[currentIndex + 1] : undefined;
  return <>
      {!material ? <section className="rounded-lg border border-red-200 bg-white p-8 text-center">
        <h2 className="heading text-xl font-bold text-red-800">You do not have access to this material.</h2>
        <p className="mt-2 text-sm text-slate-500">If you believe this is a mistake, please contact TechTrek support.</p>
      </section> : !material.previewUrl ? <section className="rounded-lg border border-amber-200 bg-white p-8 text-center">
        <h2 className="heading text-xl font-bold text-amber-800">This material is not available right now.</h2>
        <p className="mt-2 text-sm text-slate-500">Please contact TechTrek support if this continues.</p>
      </section> : <StudentSecureViewerShell mode="material" title={material.materialTitle} meta={`Session ${safeDisplayText(material.sessionNumber)} | ${safeDisplayText(material.levelCode)} | ${safeDisplayText(material.materialType)}`} backHref="/student/materials" backLabel="Back to Materials" previousHref={previous ? `/student/materials/${encodeURIComponent(previous.materialId)}` : undefined} previousLabel="Previous Material" nextHref={next ? `/student/materials/${encodeURIComponent(next.materialId)}` : undefined} nextLabel="Next Material">
        <iframe className="absolute inset-0 size-full bg-white" src={material.previewUrl} title={safeDisplayText(material.materialTitle)} allow="fullscreen" allowFullScreen/>
        <div aria-hidden="true" className="absolute right-2 top-2 z-20 size-[72px] rounded-sm bg-slate-950/90 shadow-sm sm:size-[80px]" title=""/>
        <div className="pointer-events-none absolute left-3 top-3 z-30 rounded bg-white/25 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur-sm sm:left-4 sm:top-4 sm:px-3 sm:py-1.5 sm:text-xs student-material-watermark">{safeDisplayText(material.studentId)} | {safeDisplayText(material.studentName)}</div>
      </StudentSecureViewerShell>}
      <style>{`@keyframes studentMaterialWatermark{0%{transform:translate(0,0)}50%{transform:translate(28px,22px)}100%{transform:translate(0,0)}}.student-material-watermark{animation:studentMaterialWatermark 12s ease-in-out infinite;}`}</style>
  </>;
}
