"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/lib/auth/permissions";

export type AuthUser = { userId: string; username: string; displayName: string; role: UserRole };
type AuthContextValue = { user: AuthUser | null; loading: boolean; loggingOut: boolean; logout: () => Promise<void> };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Session unavailable");
        return response.json() as Promise<{ user: AuthUser }>;
      })
      .then(data => { if (active) { setUser(data.user); document.body.dataset.role = data.user.role; } })
      .catch(() => { if (active) window.location.replace("/login?reason=session-expired"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; delete document.body.dataset.role; };
  }, []);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); }
    finally { setUser(null); router.replace("/login"); router.refresh(); }
  };

  return <AuthContext.Provider value={{ user, loading, loggingOut, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}
