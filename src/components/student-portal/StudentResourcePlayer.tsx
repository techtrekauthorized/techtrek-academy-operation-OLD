"use client";

import { safeDisplayText } from "@/lib/display";
import type { StudentPortalLearningResourcePlayback, StudentPortalLearningResourceSummary } from "@/types/learning-resources";
import { StudentSecureViewerShell } from "./StudentSecureViewerShell";

export function StudentResourcePlayer({ resource, resources = [] }: { resource: StudentPortalLearningResourcePlayback | null; resources?: StudentPortalLearningResourceSummary[] }) {
  const embedUrl = resource ? resourceEmbedUrl(resource.provider, resource.videoId) : "";
  const currentIndex = resource ? resources.findIndex(item => item.resourceId === resource.resourceId) : -1;
  const previous = currentIndex > 0 ? resources[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 && currentIndex < resources.length - 1 ? resources[currentIndex + 1] : undefined;
  return <>
    {!resource ? <section className="rounded-lg border border-red-200 bg-white p-8 text-center">
      <h2 className="heading text-xl font-bold text-red-800">You do not have access to this resource.</h2>
      <p className="mt-2 text-sm text-slate-500">If you believe this is a mistake, please contact TechTrek support.</p>
    </section> : !embedUrl ? <section className="rounded-lg border border-amber-200 bg-white p-8 text-center">
      <h2 className="heading text-xl font-bold text-amber-800">This resource is not available right now.</h2>
      <p className="mt-2 text-sm text-slate-500">Please contact TechTrek support if this continues.</p>
    </section> : <StudentSecureViewerShell mode="recording" title={resource.resourceTitle} meta={`${safeDisplayText(resource.resourceCategory)}${resource.relatedSessionLabel ? ` | ${safeDisplayText(resource.relatedSessionLabel)}` : ""}`} backHref="/student/resources" backLabel="Back to Resources" previousHref={previous ? `/student/resources/${encodeURIComponent(previous.resourceId)}` : undefined} previousLabel="Previous Resource" nextHref={next ? `/student/resources/${encodeURIComponent(next.resourceId)}` : undefined} nextLabel="Next Resource">
      <iframe className="absolute inset-0 size-full" src={embedUrl} title={safeDisplayText(resource.resourceTitle)} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen/>
      <div aria-hidden="true" className="absolute right-2 top-2 z-20 size-[72px] rounded-sm bg-slate-950/90 shadow-sm sm:size-[80px]" title=""/>
      <div className="pointer-events-none absolute left-3 top-3 z-30 rounded bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur-sm sm:left-4 sm:top-4 sm:px-3 sm:py-1.5 sm:text-xs student-resource-watermark">ID: {safeDisplayText(resource.studentId)} | {safeDisplayText(resource.studentName)}</div>
    </StudentSecureViewerShell>}
    <style>{`@keyframes studentResourceWatermark{0%{transform:translate(0,0)}50%{transform:translate(24px,18px)}100%{transform:translate(0,0)}}.student-resource-watermark{animation:studentResourceWatermark 12s ease-in-out infinite;}`}</style>
  </>;
}

function resourceEmbedUrl(provider: string, videoId: string) {
  const id = videoId.trim();
  if (!id || provider !== "GoogleDrive") return "";
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
}
