import { Mail, Phone, University } from "lucide-react";
import Link from "next/link";
import type { Enrollment, Student } from "@/types";
import { Card, StatusBadge } from "@/components/ui/primitives";
import { derivePaymentStatus, getStudentEnrollments } from "@/data/mock";

export function StudentQuickCard({ student, enrollment }: { student: Student; enrollment?: Enrollment }) {
  const activeEnrollment = enrollment ?? getStudentEnrollments(student.id)[0];
  return <Card className="overflow-hidden"><div className="h-1 bg-red-700"/><div className="p-5"><div className="flex items-start gap-4"><div className="grid size-14 shrink-0 place-items-center rounded bg-slate-900 text-lg font-bold text-white">{student.englishFullName.split(" ").map(part => part[0]).slice(0, 2).join("")}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="heading text-xl font-bold">{student.englishFullName}</h2>{activeEnrollment && <StatusBadge>{derivePaymentStatus(activeEnrollment)}</StatusBadge>}</div><div className="mono mt-1 text-xs text-red-700" data-ltr>{student.academyStudentId}  -  {student.universityStudentId}</div></div>{activeEnrollment && <div className="heading text-2xl font-bold text-red-700" data-ltr>{activeEnrollment.attendancePercentage}%</div>}</div><div className="mt-5 grid gap-2 text-xs text-slate-600 sm:grid-cols-2"><span className="flex items-center gap-2"><University size={14}/>{student.university}</span><span className="flex items-center gap-2"><Mail size={14}/><span data-ltr>{student.email}</span></span><span className="flex items-center gap-2"><Phone size={14}/><span data-ltr>{student.phone}</span></span>{activeEnrollment && <span className="font-semibold text-slate-800">{activeEnrollment.track}  -  {activeEnrollment.code}</span>}</div><Link href={`/students/${student.id}`} className="mt-4 inline-block text-xs font-semibold text-red-700 hover:underline">Open full student profile →</Link></div></Card>;
}
