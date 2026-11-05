"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

export function StudentPortalLogin() {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/student-portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, phone }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Student not found. Please check your University Student ID and phone number.");
      router.replace("/student");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Student not found. Please check your University Student ID and phone number.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-[#f7f8fc] p-4">
    <div className="w-full max-w-md">
      <div className="mb-6 flex items-center justify-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded">
          <Image src="/brand/techtrek-logo.png" alt="TechTrek" width={48} height={48} className="size-12 object-contain" priority unoptimized/>
        </span>
        <span>
          <span className="heading block text-lg font-bold">TechTrek Academy</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-red-700">Student Portal</span>
        </span>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,.06)] sm:p-8">
        <div className="mb-6">
          <h1 className="heading text-2xl font-bold">View My Profile</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the same university ID and phone number used during registration.</p>
        </div>
        {error ? <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</div> : null}
        <form className="space-y-4" onSubmit={submit}>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">University Student ID <span className="text-red-700">*</span></span>
            <input className="h-10 w-full rounded border border-slate-300 px-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" value={studentId} onChange={event => setStudentId(event.target.value)} autoComplete="username" disabled={loading} required/>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Phone Number <span className="text-red-700">*</span></span>
            <input className="h-10 w-full rounded border border-slate-300 px-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" value={phone} onChange={event => setPhone(event.target.value)} autoComplete="tel" disabled={loading} required/>
          </label>
          <button className="inline-flex h-10 w-full items-center justify-center rounded border border-red-700 bg-red-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-800 disabled:pointer-events-none disabled:opacity-50" type="submit" disabled={loading}>{loading ? "Checking..." : "View My Profile"}</button>
        </form>
      </section>
      <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">This portal shows your own TechTrek registration, enrollment, payment, and receipt information.</p>
    </div>
  </main>;
}
