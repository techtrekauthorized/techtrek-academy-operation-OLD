"use client";

import Link from "next/link";
import { Maximize2, Minimize2, MonitorUp } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { safeDisplayText } from "@/lib/display";

type ViewerMode = "recording" | "material";

export function StudentSecureViewerShell({
  mode,
  title,
  meta,
  backHref,
  backLabel,
  previousHref,
  previousLabel,
  nextHref,
  nextLabel,
  children,
}: {
  mode: ViewerMode;
  title: string;
  meta: string;
  backHref: string;
  backLabel: string;
  previousHref?: string;
  previousLabel: string;
  nextHref?: string;
  nextLabel: string;
  children: ReactNode;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [theater, setTheater] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === viewerRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    setNotice("");
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (!viewerRef.current?.requestFullscreen) {
        setTheater(true);
        setNotice("Fullscreen is not available in this browser. Theater Mode has been enabled.");
        return;
      }
      await viewerRef.current.requestFullscreen();
    } catch {
      setTheater(true);
      setNotice("Fullscreen is not available in this browser. Theater Mode has been enabled.");
    }
  };

  const recording = mode === "recording";
  return <section className={theater ? "-mx-4 sm:-mx-6 lg:-mx-8" : ""}>
    <div className="mb-3 flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <Link className="inline-flex h-9 items-center justify-center rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50" href={backHref}>{backLabel}</Link>
        <h2 className="heading mt-2 text-xl font-bold text-slate-950 sm:text-2xl">{safeDisplayText(title)}</h2>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-red-700">{safeDisplayText(meta)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {recording && <button type="button" aria-label={theater ? "Exit Theater Mode" : "Enter Theater Mode"} onClick={() => setTheater(current => !current)} className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50"><MonitorUp size={15}/>{theater ? "Exit Theater Mode" : "Theater Mode"}</button>}
        <button type="button" aria-label={fullscreen ? "Exit Fullscreen" : "Enter Fullscreen"} onClick={() => void toggleFullscreen()} className="inline-flex h-10 items-center justify-center gap-2 rounded border border-red-700 bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800">{fullscreen ? <Minimize2 size={15}/> : <Maximize2 size={15}/>} {fullscreen ? "Exit Fullscreen" : "Fullscreen"}</button>
      </div>
    </div>
    {notice && <p role="status" className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{notice}</p>}
    <div
      ref={viewerRef}
      className={[
        "student-secure-viewer relative mx-auto overflow-hidden bg-slate-950 shadow-sm",
        recording ? "aspect-video" : "min-h-[72dvh]",
        theater ? "w-full max-w-[1600px] rounded-none border-y border-slate-900" : "w-full max-w-[1500px] rounded-lg border border-slate-200",
      ].join(" ")}
    >
      {fullscreen && <button type="button" aria-label="Exit Fullscreen" onClick={() => void toggleFullscreen()} className="absolute right-3 top-3 z-40 inline-flex h-9 items-center justify-center gap-2 rounded bg-white/90 px-3 text-xs font-bold text-slate-900 shadow"><Minimize2 size={14}/>Exit Fullscreen</button>}
      {children}
    </div>
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-between">
      <NavButton href={previousHref} label={previousLabel}/>
      <NavButton href={backHref} label={backLabel}/>
      <NavButton href={nextHref} label={nextLabel}/>
    </div>
    <style>{`.student-secure-viewer:fullscreen{width:100vw!important;height:100dvh!important;max-width:none!important;border-radius:0!important;border:0!important;background:#020617!important}.student-secure-viewer:fullscreen iframe{width:100%!important;height:100%!important}`}</style>
  </section>;
}

function NavButton({ href, label }: { href?: string; label: string }) {
  if (!href) return <span className="inline-flex h-10 items-center justify-center rounded border border-slate-200 px-3 text-sm font-semibold text-slate-400">{label}</span>;
  return <Link className="inline-flex h-10 items-center justify-center rounded border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50" href={href}>{label}</Link>;
}
