"use client";

import { ArrowRightLeft, Edit3, Plus, Trash2 } from "lucide-react";
import type { EnrollmentDto, StudentDto } from "@/types/google";
import type { UserRole } from "@/lib/auth/permissions";
import { deliveryModeLabel } from "@/lib/delivery-mode";
import { Button, LinkButton } from "@/components/ui/primitives";
import { joinDisplay, safeDisplayText } from "@/lib/display";

export function StudentProfileHeader({ student, enrollments, selected, role, onSelectEnrollment, onEdit, onChangeTrack, onDelete }: { student: StudentDto; enrollments: EnrollmentDto[]; selected?: EnrollmentDto; role?: UserRole; onSelectEnrollment: (id: string) => void; onEdit: () => void; onChangeTrack: () => void; onDelete: () => void }) {
  const initials = student.studentName.split(" ").filter(Boolean).map(part => part[0]).slice(0, 2).join("");
  return <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)_auto] lg:items-center">
    <div className="flex min-w-0 items-center gap-4"><div className="grid size-16 shrink-0 place-items-center rounded bg-slate-900 text-lg font-bold text-white">{initials}</div><div className="min-w-0"><h1 className="heading break-words text-2xl font-bold text-slate-950">{safeDisplayText(student.studentName)}</h1><p className="mono mt-1 break-all text-xs text-slate-500"><span className="text-red-700">{student.academyStudentId}</span>{student.studentId ? ` - ${safeDisplayText(student.studentId)}` : ""}</p></div></div>
    <div className="min-w-0">{enrollments.length > 0 ? <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Enrollment Context</span><select className="h-10 w-full rounded border border-red-200 bg-red-50 px-3 text-sm" value={selected?.enrollmentId ?? ""} onChange={event => onSelectEnrollment(event.target.value)}>{enrollments.map(enrollment => <option key={enrollment.enrollmentId} value={enrollment.enrollmentId}>{joinDisplay(" | ", enrollment.enrollmentId, enrollment.track, `${enrollment.exactHours}H`, deliveryModeLabel(enrollment.deliveryMode))}</option>)}</select></label> : <p className="text-sm text-slate-500">No enrollment context available.</p>}</div>
    <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end"><Button variant="secondary" onClick={onEdit}><Edit3 size={15}/>Edit Personal Data</Button>{selected && role !== "SALES" && <Button variant="secondary" onClick={onChangeTrack}><ArrowRightLeft size={15}/>Change Track</Button>}{selected && role !== "SALES" && <LinkButton href={`/collections?studentId=${encodeURIComponent(student.academyStudentId)}&enrollmentId=${encodeURIComponent(selected.enrollmentId)}`}><Plus size={15}/>Record Payment</LinkButton>}{role === "ADMIN" && <Button variant="danger" onClick={onDelete}><Trash2 size={15}/>Delete Student</Button>}</div>
  </div>;
}
