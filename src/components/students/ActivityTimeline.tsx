import { timeline } from "@/data/mock";

export function ActivityTimeline() {
  return <ol className="relative ml-2 border-l-2 border-slate-200">{timeline.map((item, index) => <li key={item.title} className="relative mb-6 ml-5 last:mb-0"><span className={`absolute -left-[27px] top-1 size-3 rounded-full border-2 border-white ${index === 0 ? "bg-red-700" : "bg-slate-300"}`}/><h3 className="text-sm font-semibold">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.detail}</p><time className="mt-1 block text-[11px] text-slate-400">{item.time}</time></li>)}</ol>;
}
