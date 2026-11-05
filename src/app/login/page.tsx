"use client";

import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { getDefaultRouteForRole, type UserRole } from "@/lib/auth/permissions";

function LoginForm() {
  const router = useRouter(); const params = useSearchParams();
  const [showPassword, setShowPassword] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const sessionMessage = ["session-expired", "session-required"].includes(params.get("reason") ?? "") ? "Your session has expired. Please sign in again." : "";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (loading) return; setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
      const data = await response.json() as { ok: boolean; error?: string; details?: Array<{ message: string }>; user?: { role: UserRole } };
      if (!response.ok || !data.user) { setError(data.error === "Validation failed" ? data.details?.[0]?.message ?? "Enter your username and password." : data.error ?? "Unable to sign in."); return; }
      router.replace(getDefaultRouteForRole(data.user.role)); router.refresh();
    } catch { setError("Unable to reach the login service. Please try again."); }
    finally { setLoading(false); }
  };

  return <main className="grid min-h-screen place-items-center bg-[#f7f8fc] p-4"><div className="w-full max-w-md"><div className="mb-6 flex items-center justify-center gap-3"><span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded"><Image src="/brand/techtrek-logo.png" alt="TechTrek" width={40} height={40} className="size-10 object-contain" priority unoptimized/></span><span><span className="heading block font-bold">TechTrek Academy</span><span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-red-700">Operations System</span></span></div><section className="rounded-lg border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,.06)] sm:p-8"><div className="mb-6"><span className="mb-3 grid size-10 place-items-center rounded bg-red-50 text-red-700"><LockKeyhole size={18}/></span><h1 className="heading text-2xl font-bold">Internal Staff Login</h1><p className="mt-1 text-sm text-slate-500">Authorized TechTrek academy staff accounts only.</p></div>{sessionMessage && !error ? <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">{sessionMessage}</div> : null}{error ? <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</div> : null}<form className="space-y-4" onSubmit={submit}><label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Username <span className="text-red-700">*</span></span><input name="username" className="h-10 w-full rounded border border-slate-300 px-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" type="text" autoComplete="username" autoCapitalize="none" disabled={loading} required/></label><label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Password <span className="text-red-700">*</span></span><span className="relative block"><input name="password" className="h-10 w-full rounded border border-slate-300 px-3 pe-10 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" type={showPassword ? "text" : "password"} autoComplete="current-password" disabled={loading} required/><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span></label><Button className="w-full" type="submit" disabled={loading}>{loading ? "Signing in..." : "Log In"}</Button></form></section><p className="mt-5 text-center text-[11px] leading-5 text-slate-400">Private internal system. Access is limited to approved staff accounts.</p><div className="mt-4 text-center text-[10px] text-slate-400">(c) 2026 TechTrek Academy - Internal Operations</div></div></main>;
}

export default function LoginPage() {
  return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#f7f8fc] text-sm text-slate-500">Loading login...</div>}><LoginForm/></Suspense>;
}
