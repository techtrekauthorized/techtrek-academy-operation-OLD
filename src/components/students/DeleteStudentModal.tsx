"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import type { EnrollmentDto, PaymentDto, StudentDto } from "@/types/google";
import { Modal, useToast } from "@/components/ui/overlays";
import { Button, ErrorState, LoadingState } from "@/components/ui/primitives";

type Preview = { student: StudentDto; enrollments: EnrollmentDto[]; payments: PaymentDto[] };
type DeleteResult = { deletedEnrollmentCount: number; deletedPaymentCount: number; receiptCleanupCount: number; warning?: string };
const money = (value: number) => new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(value);

export function DeleteStudentModal({ academyStudentId, onClose }: { academyStudentId: string; onClose: () => void }) {
  const router = useRouter(); const { showToast } = useToast();
  const [preview, setPreview] = useState<Preview>(); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false); const [password, setPassword] = useState(""); const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<Preview>(`/api/students/${encodeURIComponent(academyStudentId)}`)
      .then(data => { if (active) setPreview(data); })
      .catch(reason => { if (active) setError(formatClientApiError(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [academyStudentId]);

  const knownGeneratedFileCount = useMemo(() => preview ? new Set(preview.payments.filter(payment => payment.receiptSource === "GOOGLE_DOCS" && /^[A-Za-z0-9_-]{10,}$/.test(payment.receiptPdfFileId)).map(payment => payment.receiptPdfFileId)).size : 0, [preview]);
  const totalPaidAmount = preview?.payments.reduce((sum, payment) => sum + payment.paymentAmount, 0) ?? 0;

  const deleteStudent = async () => {
    if (!preview || !confirmed || !password || deleting) return;
    setDeleting(true); setError("");
    try {
      const data = await apiFetch<{ result: DeleteResult }>(`/api/students/${encodeURIComponent(academyStudentId)}`, { method: "DELETE", body: JSON.stringify({ confirmationPassword: password }) });
      showToast(`Student deleted: ${data.result.deletedEnrollmentCount} enrollments and ${data.result.deletedPaymentCount} payment/receipt rows removed.`);
      if (data.result.warning) showToast(data.result.warning);
      router.replace("/students"); router.refresh();
    } catch (reason) { setError(formatClientApiError(reason)); setPassword(""); }
    finally { setDeleting(false); }
  };

  return <Modal open onClose={deleting ? () => undefined : onClose} title="Delete Student Permanently" footer={<><Button variant="secondary" disabled={deleting} onClick={onClose}>Cancel</Button><Button variant="danger" disabled={loading || !preview || !confirmed || !password || deleting} onClick={() => void deleteStudent()}>{deleting ? "Deleting Student…" : "Delete Student"}</Button></>}>
    {loading ? <LoadingState/> : error && !preview ? <><ErrorState/><p className="mt-3 text-sm text-red-700">{error}</p></> : preview ? <div className="space-y-5">
      <section className="rounded border border-slate-200 bg-slate-50 p-4"><h3 className="heading text-sm font-bold">Student</h3><dl className="mt-3 grid gap-3 sm:grid-cols-2"><Value label="Student Name" value={preview.student.studentName}/><Value label="Academy Student ID" value={preview.student.academyStudentId}/><Value label="Phone" value={preview.student.phone}/><Value label="Student University" value={preview.student.university}/></dl></section>
      <section><h3 className="heading text-sm font-bold">Records to be deleted</h3><div className="mt-3 grid gap-2 sm:grid-cols-2"><Summary label="Enrollments" value={String(preview.enrollments.length)}/><Summary label="Payment / Receipt Rows" value={String(preview.payments.length)}/><Summary label="Total Recorded as Paid" value={money(totalPaidAmount)}/><Summary label="Generated PDFs to Trash" value={String(knownGeneratedFileCount)}/></div>{preview.enrollments.length > 0 && <div className="mt-3 max-h-44 space-y-2 overflow-auto">{preview.enrollments.map(enrollment => <div key={enrollment.enrollmentId} className="rounded border border-slate-200 p-3 text-xs"><strong className="block text-slate-900">{enrollment.track}  -  {enrollment.packageLabel}  -  {enrollment.exactHours}H</strong><span className="mt-1 block text-slate-500">Final {money(enrollment.finalContractPrice)}  -  Paid {money(enrollment.totalPaid)}  -  Remaining {money(enrollment.remaining)}</span></div>)}</div>}{preview.payments.some(payment => payment.receiptNumber) && <div className="mt-3"><div className="text-xs font-semibold text-slate-700">Receipt numbers that will disappear</div><div className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-auto">{preview.payments.filter(payment => payment.receiptNumber).map(payment => <span key={payment.paymentId} className="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600">{payment.receiptNumber}</span>)}</div></div>}</section>
      <section className="rounded border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900"><p className="font-bold">This action is permanent.</p><ul className="mt-2 list-disc ps-5"><li>This removes the student, enrollments, payments, and receipt history.</li><li>No refund payment or refund receipt is created automatically.</li><li>This cannot be restored from the application.</li><li>Old generated receipt PDFs may be moved to Google Drive Trash after deletion.</li></ul></section>
      <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 accent-red-700"/><span>I understand that this permanently removes the student and all related records.</span></label>
      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Enter your current Admin password to confirm <span className="text-red-700">*</span></span><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={deleting} className="h-10 w-full rounded border border-slate-300 px-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"/></label>
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </div> : null}
  </Modal>;
}

function Value({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-900">{value || "—"}</dd></div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded border border-slate-200 p-3"><div className="text-[10px] font-semibold uppercase text-slate-500">{label}</div><div className="mt-1 text-sm font-bold text-slate-900">{value}</div></div>; }
