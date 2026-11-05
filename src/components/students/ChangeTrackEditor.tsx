"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import { DELIVERY_MODE_OPTIONS, deliveryModeLabel, normalizeDeliveryMode, type DeliveryModeValue } from "@/lib/delivery-mode";
import type { EnrollmentDto, OfferingDto, StudentDto } from "@/types/google";
import { Drawer, useToast } from "@/components/ui/overlays";
import { Button, LoadingState } from "@/components/ui/primitives";

type ProgramScopeChoice = "UNIVERSITY_PROGRAM" | "INTENSIVE_DIPLOMA";
const money = (value: number) => new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(value);

export function ChangeTrackEditor({ student, enrollment, onClose, onChanged }: { student: StudentDto; enrollment: EnrollmentDto; onClose: () => void; onChanged: () => Promise<void> }) {
  const { showToast } = useToast();
  const [offerings, setOfferings] = useState<OfferingDto[]>([]);
  const [scope, setScope] = useState<ProgramScopeChoice>(enrollment.programScope === "Intensive Diploma" ? "INTENSIVE_DIPLOMA" : "UNIVERSITY_PROGRAM");
  const [offeringId, setOfferingId] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryModeValue | "">("");
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<{ offerings: OfferingDto[] }>("/api/offerings")
      .then(data => { if (active) setOfferings(data.offerings); })
      .catch(reason => { if (active) setError(formatClientApiError(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const availableOfferings = useMemo(() => offerings.filter(offering => offering.offeringId !== enrollment.offeringId && (scope === "INTENSIVE_DIPLOMA" ? offering.offeringType === "INTENSIVE_DIPLOMA" : offering.offeringType === "UNIVERSITY_PROGRAM" && offering.university === student.university)), [enrollment.offeringId, offerings, scope, student.university]);
  const selectedOffering = availableOfferings.find(offering => offering.offeringId === offeringId);
  const newFinalContractPrice = selectedOffering ? Math.max(0, selectedOffering.price - enrollment.discount) : 0;
  const newRemaining = selectedOffering ? Math.max(0, newFinalContractPrice - enrollment.totalPaid) : 0;
  const creditDue = selectedOffering ? Math.max(0, enrollment.totalPaid - newFinalContractPrice) : 0;
  const newPaymentStatus = selectedOffering ? newRemaining === 0 ? "Fully Paid" : "Partially Paid" : "-";

  const changeScope = (value: string) => {
    setScope(value as ProgramScopeChoice);
    setOfferingId("");
    setDeliveryMode("");
  };
  const changeOffering = (value: string) => {
    setOfferingId(value);
    const offering = availableOfferings.find(item => item.offeringId === value);
    setDeliveryMode(offering ? inferDeliveryMode(offering) : "");
  };

  const confirmChange = async () => {
    if (!selectedOffering || !deliveryMode || saving) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/enrollments/${encodeURIComponent(enrollment.enrollmentId)}/change-track`, { method: "POST", body: JSON.stringify({ offeringId: selectedOffering.offeringId, deliveryMode }) });
      await onChanged();
      showToast("Enrollment track, delivery mode, placement, and receipt links updated successfully.");
      onClose();
    } catch (reason) {
      setError(formatClientApiError(reason));
    } finally {
      setSaving(false);
    }
  };

  return <Drawer open onClose={saving ? () => undefined : onClose} title="Change Track" width="max-w-3xl" footer={confirming ? <><Button variant="secondary" disabled={saving} onClick={() => setConfirming(false)}>Back</Button><Button variant="danger" disabled={saving || !selectedOffering || !deliveryMode} onClick={() => void confirmChange()}>{saving ? "Reissuing Receipts..." : "Confirm Change Track"}</Button></> : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!selectedOffering || !deliveryMode} onClick={() => { setError(""); setConfirming(true); }}>Review & Confirm</Button></>}>
    {loading ? <LoadingState/> : <div className="space-y-5">
      <section><h3 className="heading text-sm font-bold">Current Enrollment</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Value label="Current Program Scope" value={enrollment.programScope}/><Value label="Current Track" value={enrollment.track}/><Value label="Current Package / Hours" value={`${enrollment.packageLabel}  -  ${enrollment.exactHours}H`}/><Value label="Current Catalogue Price" value={money(enrollment.cataloguePrice)}/><Value label="Current Discount" value={money(enrollment.discount)}/><Value label="Current Final Contract Price" value={money(enrollment.finalContractPrice)}/><Value label="Total Paid" value={money(enrollment.totalPaid)}/><Value label="Current Remaining" value={money(enrollment.remaining)}/><Value label="Current Delivery Mode" value={deliveryModeLabel(enrollment.deliveryMode)}/></div></section>

      {!confirming ? <section className="rounded border border-slate-200 p-4"><h3 className="heading text-sm font-bold">Select New Offering</h3><div className="mt-3 grid gap-4 sm:grid-cols-2"><LabeledSelect label="Program Scope" value={scope} onChange={changeScope} options={[{ value: "UNIVERSITY_PROGRAM", label: "University Program" }, { value: "INTENSIVE_DIPLOMA", label: "Intensive Diploma" }]}/><LabeledSelect label="Offering / Track" value={offeringId} onChange={changeOffering} placeholder="Select a different active offering" options={availableOfferings.map(offering => ({ value: offering.offeringId, label: `${offering.track}  -  ${offering.packageLabel}  -  ${offering.exactHours}H  -  ${money(offering.price)}` }))}/><LabeledSelect label="New Delivery Mode" value={deliveryMode} onChange={value => setDeliveryMode(normalizeDeliveryMode(value))} placeholder="Select delivery mode" options={DELIVERY_MODE_OPTIONS.map(option => ({ value: option.value, label: option.label }))}/></div>{scope === "UNIVERSITY_PROGRAM" && <p className="mt-3 text-xs text-slate-500">University Program offerings are limited to {student.university}, matching registration rules.</p>}{selectedOffering && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Value label="New Program Scope" value={selectedOffering.offeringType === "INTENSIVE_DIPLOMA" ? "Intensive Diploma" : selectedOffering.university}/><Value label="New Track" value={selectedOffering.track}/><Value label="New Package Label" value={selectedOffering.packageLabel}/><Value label="New Exact Hours" value={`${selectedOffering.exactHours}H`}/><Value label="New Catalogue Price" value={money(selectedOffering.price)}/><Value label="New Delivery Mode" value={deliveryModeLabel(deliveryMode)}/></div>}</section> : <section className="rounded border border-red-200 bg-red-50 p-4"><h3 className="heading text-base font-bold text-red-900">Confirm Change Track</h3><ul className="mt-3 list-disc space-y-2 ps-5 text-sm leading-6 text-red-900"><li>The enrollment track, delivery mode, and financial balance will be updated.</li><li>Current group placement, level selection, and WhatsApp group status will be cleared.</li><li>Existing payment amounts will remain unchanged.</li><li>Existing accessible receipt links will be replaced by reissued receipts containing the new program details.</li><li>Previous generated receipt files may be moved to Google Drive Trash after successful replacement.</li><li>This action does not create a new payment or enrollment.</li></ul></section>}

      {selectedOffering && <section><h3 className="heading text-sm font-bold">Live Comparison</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><Value label="Current Track / Package / Hours" value={`${enrollment.track}  -  ${enrollment.packageLabel}  -  ${enrollment.exactHours}H`}/><Value label="New Track / Package / Hours" value={`${selectedOffering.track}  -  ${selectedOffering.packageLabel}  -  ${selectedOffering.exactHours}H`}/><Value label="Current Delivery Mode" value={deliveryModeLabel(enrollment.deliveryMode)}/><Value label="New Delivery Mode" value={deliveryMode ? deliveryModeLabel(deliveryMode) : "Select delivery mode"}/><Value label="Current Final Contract Price" value={money(enrollment.finalContractPrice)}/><Value label="New Final Contract Price" value={money(newFinalContractPrice)}/><Value label="Total Paid" value={money(enrollment.totalPaid)}/><Value label="New Remaining" value={money(newRemaining)}/><Value label="New Payment Status" value={newPaymentStatus}/>{creditDue > 0 && <div className="rounded border border-amber-200 bg-amber-50 p-3"><div className="text-[10px] font-semibold uppercase text-amber-700">Credit Due</div><div className="mt-1 text-sm font-bold text-amber-900">{money(creditDue)}</div></div>}</div></section>}
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </div>}
  </Drawer>;
}

function Value({ label, value }: { label: string; value: string }) { return <div className="rounded border bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase text-slate-500">{label}</div><div className="mt-1 text-sm font-bold text-slate-900">{value}</div></div>; }
function LabeledSelect({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label} <span className="text-red-700">*</span></span><select aria-label={label} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm" value={value} onChange={event => onChange(event.target.value)} required>{placeholder && <option value="">{placeholder}</option>}{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function inferDeliveryMode(offering: OfferingDto): DeliveryModeValue {
  const label = `${offering.track} ${offering.packageLabel}`.toLowerCase();
  if (label.includes("hybrid")) return "HYBRID";
  if (label.includes("offline")) return "OFFLINE";
  if (label.includes("online")) return "ONLINE";
  return "UNASSIGNED";
}
