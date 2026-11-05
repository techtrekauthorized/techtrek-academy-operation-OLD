import { Clock, MapPin, Users } from "lucide-react";
import type { Session } from "@/types";
import { StatusBadge, cn } from "@/components/ui/primitives";

export function SessionCard({ session, compact = false }: { session: Session; compact?: boolean }) {
  return <article className={cn("rounded border-l-4 border border-slate-200 bg-white p-3", session.status === "Conflict" ? "border-l-red-600 bg-red-50/40" : session.mode === "Online" ? "border-l-blue-600" : "border-l-amber-500")}><div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-bold text-slate-900">{session.title}</h3><p className="mt-0.5 text-[11px] text-slate-500">{session.topic}  -  {session.track}</p></div><StatusBadge>{session.status}</StatusBadge></div><div className={cn("mt-3 grid gap-1 text-[11px] text-slate-600", !compact && "sm:grid-cols-2")}><span className="flex items-center gap-1"><Clock size={12}/>{session.date}  -  {session.time}–{session.endTime}</span><span className="flex items-center gap-1"><MapPin size={12}/>{session.venue}</span><span className="flex items-center gap-1"><Users size={12}/>{session.groups.length} linked group(s)</span><span className="font-semibold">{session.instructor}</span></div></article>;
}
