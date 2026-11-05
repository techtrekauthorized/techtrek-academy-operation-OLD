import { CalendarClock, Users } from "lucide-react";
import Link from "next/link";
import type { Group } from "@/types";
import { Card, StatusBadge } from "@/components/ui/primitives";

export function GroupSummaryCard({ group }: { group: Group }) {
  return <Card className="p-4 transition-colors hover:border-red-200"><div className="flex items-start justify-between gap-3"><div><Link className="heading font-bold hover:text-red-700" href={`/groups/${group.id}`}>{group.name}</Link><p className="mt-1 text-xs text-slate-500">{group.university}  -  {group.intake}</p></div><StatusBadge>{group.deliveryMode}</StatusBadge></div><div className="mt-3 text-xs text-slate-500">{group.track}  -  {group.packageLabel}  -  {group.exactHours}H</div><div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-xs"><div><div className="text-slate-400">Enrollment</div><div className="mt-1 flex items-center gap-1 font-semibold"><Users size={13}/>{group.students} / {group.capacity}</div></div><div><div className="text-slate-400">Next session</div><div className="mt-1 flex items-center gap-1 font-semibold"><CalendarClock size={13}/>{group.nextSession}</div></div><div><div className="text-slate-400">Instructor</div><div className="mt-1 font-semibold">{group.instructor}</div></div><div><div className="text-slate-400">Catalogue reference</div><div className="mt-1 font-semibold text-red-700">EGP {group.cataloguePrice.toLocaleString()}</div></div></div></Card>;
}
