"use client";

import { useEffect, useState } from "react";
import { COLLEGE_OPTIONS, DEPARTMENT_OPTIONS, OTHER_UNIVERSITY_VALUE, STUDENT_STATUS_OPTIONS } from "@/config/student-options";
import { apiFetch, formatClientApiError } from "@/lib/client-api";
import type { StudentDto } from "@/types/google";
import { Drawer, useToast } from "@/components/ui/overlays";
import { Button, Field } from "@/components/ui/primitives";

type UniversityOption = { universityId: string; universityName: string; code: string };
type EditableStudent = Omit<StudentDto, "academyStudentId">;

export function StudentPersonalDataEditor({ student, onClose, onSaved }: { student: StudentDto; onClose: () => void; onSaved: (student: StudentDto) => void }) {
  const { showToast } = useToast();
  const knownCollege = student.college !== "Other" && COLLEGE_OPTIONS.some(option => option === student.college);
  const knownDepartment = !student.department || (student.department !== "Other" && DEPARTMENT_OPTIONS.some(option => option === student.department));
  const [draft, setDraft] = useState<EditableStudent>({ studentName: student.studentName, phone: student.phone, email: student.email, university: student.university, college: student.college, department: student.department, studentId: student.studentId, studentStatus: student.studentStatus });
  const [universities, setUniversities] = useState<UniversityOption[]>([]);
  const [universityChoice, setUniversityChoice] = useState(OTHER_UNIVERSITY_VALUE);
  const [customUniversity, setCustomUniversity] = useState(student.university);
  const [collegeChoice, setCollegeChoice] = useState(knownCollege ? student.college : "Other");
  const [customCollege, setCustomCollege] = useState(knownCollege ? "" : student.college === "Other" ? "" : student.college);
  const [departmentChoice, setDepartmentChoice] = useState(knownDepartment ? student.department : "Other");
  const [customDepartment, setCustomDepartment] = useState(knownDepartment ? "" : student.department === "Other" ? "" : student.department);
  const [loadingUniversities, setLoadingUniversities] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<{ universities: UniversityOption[] }>("/api/universities")
      .then(data => {
        if (!active) return;
        setUniversities(data.universities);
        const knownUniversity = data.universities.some(option => option.universityName === student.university);
        setUniversityChoice(knownUniversity ? student.university : OTHER_UNIVERSITY_VALUE);
        setCustomUniversity(knownUniversity ? "" : student.university);
      })
      .catch(reason => { if (active) setError(formatClientApiError(reason)); })
      .finally(() => { if (active) setLoadingUniversities(false); });
    return () => { active = false; };
  }, [student.university]);

  const update = (key: keyof EditableStudent, value: string) => setDraft(current => ({ ...current, [key]: value }));

  const save = async () => {
    if (saving) return;
    const university = (universityChoice === OTHER_UNIVERSITY_VALUE ? customUniversity : universityChoice).trim();
    const college = (collegeChoice === "Other" ? customCollege : collegeChoice).trim();
    const department = (departmentChoice === "Other" ? customDepartment : departmentChoice).trim();
    const studentName = draft.studentName.trim(); const phone = draft.phone.trim(); const email = draft.email.trim(); const studentId = draft.studentId.trim(); const studentStatus = draft.studentStatus.trim();
    if (!studentName) return setError("Student Name is required.");
    if (!phone) return setError("Phone is required.");
    if (!university || university.toLowerCase() === "intensive diploma" || university === "Other") return setError(universityChoice === OTHER_UNIVERSITY_VALUE ? "Actual Student University is required and cannot be Intensive Diploma." : "Student University is required.");
    if (!college || college === "Other") return setError(collegeChoice === "Other" ? "Other College Name is required." : "College is required.");
    if (departmentChoice === "Other" && (!department || department === "Other")) return setError("Other Department Name is required.");
    if (!studentId) return setError("Student ID is required.");
    if (!studentStatus) return setError("Student Status is required.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email address.");
    setSaving(true); setError("");
    try {
      const payload: EditableStudent = { studentName, phone, email, university, college, department, studentId, studentStatus };
      const result = await apiFetch<{ student: StudentDto }>(`/api/students/${encodeURIComponent(student.academyStudentId)}`, { method: "PATCH", body: JSON.stringify(payload) });
      onSaved(result.student);
      showToast("Student personal data updated in Google Sheets.");
      onClose();
    } catch (reason) { setError(formatClientApiError(reason)); }
    finally { setSaving(false); }
  };

  return <Drawer open onClose={onClose} title="Edit Student Personal Data" footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button disabled={saving || loadingUniversities} onClick={() => void save()}>{saving ? "Saving…" : "Save to Google Sheets"}</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Student Name" value={draft.studentName} onChange={event => update("studentName", event.target.value)} required/>
      <Field label="Phone" value={draft.phone} onChange={event => update("phone", event.target.value)} required/>
      <Field label="Email" type="email" value={draft.email} onChange={event => update("email", event.target.value)}/>
      <LabeledSelect label="Student University" value={universityChoice} onChange={setUniversityChoice} placeholder="Select Student University" required disabled={loadingUniversities} options={[...universities.map(item => ({ value: item.universityName, label: item.universityName })), { value: OTHER_UNIVERSITY_VALUE, label: "Other University - Intensive Diploma" }]}/>
      {universityChoice === OTHER_UNIVERSITY_VALUE && <Field label="Actual Student University" value={customUniversity} onChange={event => setCustomUniversity(event.target.value)} required/>}
      <LabeledSelect label="College" value={collegeChoice} onChange={value => { setCollegeChoice(value); if (value !== "Other") setCustomCollege(""); }} placeholder="Select College" required options={COLLEGE_OPTIONS.map(value => ({ value, label: value }))}/>
      {collegeChoice === "Other" && <Field label="Other College Name" value={customCollege} onChange={event => setCustomCollege(event.target.value)} required/>}
      <LabeledSelect label="Department" value={departmentChoice} onChange={value => { setDepartmentChoice(value); if (value !== "Other") setCustomDepartment(""); }} placeholder="Select Department" options={DEPARTMENT_OPTIONS.map(value => ({ value, label: value }))}/>
      {departmentChoice === "Other" && <Field label="Other Department Name" value={customDepartment} onChange={event => setCustomDepartment(event.target.value)} required/>}
      <Field label="Student ID" value={draft.studentId} onChange={event => update("studentId", event.target.value)} required/>
      <LabeledSelect label="Student Status" value={draft.studentStatus} onChange={value => update("studentStatus", value)} placeholder="Select Student Status" required options={STUDENT_STATUS_OPTIONS.map(value => ({ value, label: value }))}/>
    </div>
    {error && <p role="alert" className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </Drawer>;
}

function LabeledSelect({ label, value, onChange, options, placeholder, required, disabled }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string; required?: boolean; disabled?: boolean }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}{required && <span className="text-red-700"> *</span>}</span><select aria-label={label} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100" value={value} onChange={event => onChange(event.target.value)} required={required} disabled={disabled}>{placeholder && <option value="">{placeholder}</option>}{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
