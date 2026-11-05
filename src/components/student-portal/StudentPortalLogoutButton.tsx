"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function StudentPortalLogoutButton({ compact = false, fullWidth = false, iconOnly = false }: { compact?: boolean; fullWidth?: boolean; iconOnly?: boolean } = {}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function logout() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch("/api/student-portal/logout", { method: "POST" });
    } finally {
      router.replace("/student");
      router.refresh();
    }
  }
  return <button type="button" onClick={logout} disabled={loading} title={iconOnly ? "Logout" : undefined} aria-label={iconOnly ? "Logout" : undefined} className={`inline-flex h-9 items-center justify-center rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50 ${fullWidth ? "w-full" : ""} ${iconOnly ? "w-10 px-0" : ""}`}>{iconOnly ? <LogOut size={15}/> : loading ? "Signing out..." : compact ? "Exit" : "Logout"}</button>;
}
