"use client";

import { safeDisplayText } from "@/lib/display";
import type { StudentPortalRecordingPlayback, StudentPortalRecordingSummary } from "@/lib/server/student-portal/service";
import { StudentSecureViewerShell } from "./StudentSecureViewerShell";

export function StudentRecordingPlayer({ recording, recordings = [] }: { recording: StudentPortalRecordingPlayback | null; recordings?: StudentPortalRecordingSummary[] }) {
  const embedUrl = recording ? recordingEmbedUrl(recording.provider, recording.videoId) : "";
  const isGoogleDrive = recording?.provider === "GoogleDrive";
  const currentIndex = recording ? recordings.findIndex(item => item.recordingId === recording.recordingId) : -1;
  const previous = currentIndex > 0 ? recordings[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 && currentIndex < recordings.length - 1 ? recordings[currentIndex + 1] : undefined;
  return <>
      {!recording ? <section className="rounded-lg border border-red-200 bg-white p-8 text-center">
        <h2 className="heading text-xl font-bold text-red-800">You do not have access to this recording.</h2>
        <p className="mt-2 text-sm text-slate-500">If you believe this is a mistake, please contact TechTrek support.</p>
      </section> : !embedUrl ? <section className="rounded-lg border border-amber-200 bg-white p-8 text-center">
        <h2 className="heading text-xl font-bold text-amber-800">This recording is not available right now.</h2>
        <p className="mt-2 text-sm text-slate-500">Please contact TechTrek support if this continues.</p>
      </section> : <StudentSecureViewerShell mode="recording" title={recording.recordingTitle} meta={`Session ${safeDisplayText(recording.sessionNumber)} | ${safeDisplayText(recording.levelCode)}`} backHref="/student/recordings" backLabel="Back to Recordings" previousHref={previous ? `/student/recordings/${encodeURIComponent(previous.recordingId)}` : undefined} previousLabel="Previous Recording" nextHref={next ? `/student/recordings/${encodeURIComponent(next.recordingId)}` : undefined} nextLabel="Next Recording">
        <iframe className="absolute inset-0 size-full" src={embedUrl} title={safeDisplayText(recording.recordingTitle)} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen/>
        {isGoogleDrive && <div aria-hidden="true" className="absolute right-2 top-2 z-20 size-[72px] rounded-sm bg-slate-950/90 shadow-sm sm:size-[80px]" title=""/>}
        <div className="pointer-events-none absolute left-3 top-3 z-30 rounded bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur-sm sm:left-4 sm:top-4 sm:px-3 sm:py-1.5 sm:text-xs student-recording-watermark">ID: {safeDisplayText(recording.studentId)} | {safeDisplayText(recording.studentName)}</div>
      </StudentSecureViewerShell>}
      <style>{`@keyframes studentRecordingWatermark{0%{transform:translate(0,0)}50%{transform:translate(24px,18px)}100%{transform:translate(0,0)}}.student-recording-watermark{animation:studentRecordingWatermark 12s ease-in-out infinite;}`}</style>
  </>;
}

function recordingEmbedUrl(provider: string, videoId: string) {
  const id = videoId.trim();
  if (!id || provider !== "GoogleDrive") return "";
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
}
