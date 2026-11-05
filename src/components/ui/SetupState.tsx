import { CircleDashed } from "lucide-react";
import type { ReactNode } from "react";

export function SetupState({ title, detail, guidance, icon }: { title: string; detail: string; guidance?: string; icon?: ReactNode }) {
  return <div className="flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center"><span className="mb-3 grid size-11 place-items-center rounded-full border border-red-100 bg-red-50 text-red-700">{icon ?? <CircleDashed size={21}/>}</span><h3 className="heading text-base font-bold text-slate-800">{title}</h3><p className="mt-1 max-w-xl text-sm text-slate-500">{detail}</p>{guidance && <p className="mt-2 max-w-xl text-xs text-slate-400">{guidance}</p>}</div>;
}
