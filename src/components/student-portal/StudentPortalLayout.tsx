"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Award, BookOpenCheck, ChevronLeft, ChevronRight, CreditCard, FileText, Home, Menu, PlaySquare, UserRound, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { safeDisplayText } from "@/lib/display";
import type { StudentPortalProfile } from "@/lib/server/student-portal/service";
import { StudentPortalLogoutButton } from "./StudentPortalLogoutButton";

const navGroups = [
  { label: "Overview", items: [{ label: "Overview", href: "/student", icon: Home }] },
  { label: "Learning", items: [{ label: "Recordings", href: "/student/recordings", icon: PlaySquare }, { label: "Materials", href: "/student/materials", icon: FileText }, { label: "Resources", href: "/student/resources", icon: BookOpenCheck }] },
  { label: "Account", items: [{ label: "Certificates", href: "/student/certificates", icon: Award }, { label: "Documents", href: "/student/documents", icon: FileText }, { label: "Payments & Receipts", href: "/student/payments", icon: CreditCard }, { label: "Profile", href: "/student/profile", icon: UserRound }] },
];

let studentPortalSidebarCollapsed = false;

export function StudentPortalLayout({ profile, title, description, children }: { profile: StudentPortalProfile; title: string; description?: string; children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(studentPortalSidebarCollapsed);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const desktopNav = <PortalNav pathname={pathname} collapsed={sidebarCollapsed} onNavigate={() => undefined}/>;
  const mobileNav = <PortalNav pathname={pathname} collapsed={false} onNavigate={() => setDrawerOpen(false)}/>;
  const toggleSidebar = () => setSidebarCollapsed(current => {
    const next = !current;
    studentPortalSidebarCollapsed = next;
    return next;
  });
  useEffect(() => {
    if (!drawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        window.requestAnimationFrame(() => menuButtonRef.current?.focus());
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [drawerOpen]);
  return <main className="min-h-screen bg-[#f7f8fc] text-slate-900">
    <aside className={`fixed inset-y-0 left-0 z-30 hidden border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex lg:flex-col ${sidebarCollapsed ? "w-20" : "w-64"}`}>
      <div className="relative">
        <Brand collapsed={sidebarCollapsed}/>
        <button type="button" aria-label={sidebarCollapsed ? "Expand student portal sidebar" : "Collapse student portal sidebar"} onClick={toggleSidebar} className="absolute -right-3 top-5 z-10 grid size-7 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-red-500">
          {sidebarCollapsed ? <ChevronRight size={15}/> : <ChevronLeft size={15}/>}
        </button>
      </div>
      <div className={`flex-1 overflow-y-auto py-4 ${sidebarCollapsed ? "px-2" : "px-3"}`}>{desktopNav}</div>
      <StudentIdentity profile={profile} collapsed={sidebarCollapsed}/>
    </aside>
    <div className={`transition-[padding] duration-200 ${sidebarCollapsed ? "lg:pl-20" : "lg:pl-64"}`}>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <button ref={menuButtonRef} type="button" aria-label="Open student portal navigation" onClick={() => setDrawerOpen(true)} className="rounded border border-slate-300 bg-white p-2 text-slate-700"><Menu size={18}/></button>
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-[.14em] text-red-700">Student Portal</div>
          <div className="max-w-[180px] truncate text-sm font-bold">{safeDisplayText(profile.student.studentName)}</div>
        </div>
        <StudentPortalLogoutButton compact/>
      </header>
      {drawerOpen && <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Student portal navigation">
        <button type="button" aria-label="Close navigation overlay" className="absolute inset-0 bg-slate-950/40" onClick={() => setDrawerOpen(false)}/>
        <section className="relative flex h-full w-[min(88vw,320px)] flex-col bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b p-4"><Brand compact/><button type="button" aria-label="Close student portal navigation" onClick={() => { setDrawerOpen(false); window.requestAnimationFrame(() => menuButtonRef.current?.focus()); }} className="rounded p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div>
          <div className="flex-1 overflow-y-auto px-3 py-4">{mobileNav}</div>
          <StudentIdentity profile={profile}/>
        </section>
      </div>}
      <div className="relative min-h-screen overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center">
          <Image src="/brand/techtrek-watermark.png" alt="" width={340} height={340} className="w-[210px] opacity-[0.07] sm:w-[260px] lg:w-[340px]" unoptimized/>
        </div>
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-5 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,.04)]">
            <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-red-700">TechTrek Student Portal</div>
            <h1 className="heading mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">{safeDisplayText(title)}</h1>
            {description && <p className="mt-1 max-w-3xl text-sm text-slate-500">{safeDisplayText(description)}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  </main>;
}

function Brand({ compact = false, collapsed = false }: { compact?: boolean; collapsed?: boolean }) {
  return <div className={compact ? "flex items-center gap-2" : `border-b ${collapsed ? "p-4" : "p-5"}`}>
    <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded"><Image src="/brand/techtrek-logo.png" alt="TechTrek" width={44} height={44} className="size-11 object-contain" priority unoptimized/></span>
      <div className={collapsed ? "sr-only" : ""}>
        <div className="heading text-base font-bold text-slate-950">TechTrek</div>
        <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-red-700">Student Portal</div>
      </div>
    </div>
  </div>;
}

function PortalNav({ pathname, collapsed, onNavigate }: { pathname: string; collapsed: boolean; onNavigate: () => void }) {
  return <nav aria-label="Student portal navigation" className="space-y-5">{navGroups.map(group => <section key={group.label}>
    <div className={collapsed ? "sr-only" : "px-3 text-[10px] font-bold uppercase tracking-wide text-slate-400"}>{group.label}</div>
    <div className={collapsed ? "space-y-1" : "mt-2 space-y-1"}>{group.items.map(item => {
      const Icon = item.icon;
      const active = pathname === item.href || (item.href !== "/student" && pathname.startsWith(`${item.href}/`));
      return <Link key={item.href} href={item.href} onClick={onNavigate} aria-label={collapsed ? item.label : undefined} title={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined} className={`flex items-center rounded py-2.5 text-sm font-semibold transition ${collapsed ? "justify-center px-2" : "gap-3 px-3"} ${active ? "bg-red-50 text-red-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}><Icon size={17}/><span className={collapsed ? "sr-only" : ""}>{item.label}</span></Link>;
    })}</div>
  </section>)}</nav>;
}

function StudentIdentity({ profile, collapsed = false }: { profile: StudentPortalProfile; collapsed?: boolean }) {
  const initial = safeDisplayText(profile.student.studentName, "?").slice(0, 1).toUpperCase();
  return <div className={`border-t border-slate-200 ${collapsed ? "p-3" : "p-4"}`}>
    <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">{initial}</span>
      <div className={collapsed ? "sr-only" : "min-w-0 flex-1"}><div className="truncate text-sm font-bold">{safeDisplayText(profile.student.studentName)}</div><div className="truncate text-xs text-slate-500">{safeDisplayText(profile.student.studentId)}</div></div>
    </div>
    <div className="mt-3 flex justify-center"><StudentPortalLogoutButton fullWidth={!collapsed} iconOnly={collapsed}/></div>
  </div>;
}
