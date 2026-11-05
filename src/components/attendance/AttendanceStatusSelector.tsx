"use client";

import { CheckCircle2, Clock3, CircleOff, HeartPulse } from "lucide-react";
import type { AttendanceStatus } from "@/types";
import { cn } from "@/components/ui/primitives";

const choices: Array<{ status: AttendanceStatus; icon: React.ElementType; styles: string }> = [
  { status: "Present", icon: CheckCircle2, styles: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  { status: "Late", icon: Clock3, styles: "border-amber-300 bg-amber-50 text-amber-700" },
  { status: "Absent", icon: CircleOff, styles: "border-red-300 bg-red-50 text-red-700" },
  { status: "Excused", icon: HeartPulse, styles: "border-blue-300 bg-blue-50 text-blue-700" },
];

export function AttendanceStatusSelector({ value, onChange }: { value?: AttendanceStatus; onChange: (value: AttendanceStatus) => void }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{choices.map(choice => { const Icon = choice.icon; return <button key={choice.status} onClick={() => onChange(choice.status)} className={cn("flex h-16 flex-col items-center justify-center gap-1 rounded border text-xs font-bold transition", value === choice.status ? choice.styles : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50")}><Icon size={19}/>{choice.status}</button>; })}</div>;
}
