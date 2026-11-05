"use client";

import { Award, BadgeDollarSign, Bell, BookOpenCheck, CalendarDays, ChevronDown, ClipboardCheck, ClipboardList, FileText, GraduationCap, Languages, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, PlaySquare, ReceiptText, Search, Settings, TrendingUp, UsersRound, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { AuthProvider, type AuthUser, useAuth } from "@/components/auth/AuthProvider";
import { ToastProvider } from "@/components/ui/overlays";
import { cn } from "@/components/ui/primitives";
import { canAccessRoute, getDefaultRouteForRole, ROLE_LABELS } from "@/lib/auth/permissions";
import { safeDisplayText } from "@/lib/display";
import { useI18n } from "@/i18n/I18nProvider";

type NavItem = { label: string; href: string; icon: React.ElementType; children?: Array<{ label: string; href: string }> };
const navigation: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Analysis", href: "/analysis", icon: TrendingUp },
  { label: "Students & Enrollments", href: "/students", icon: GraduationCap, children: [{ label: "Student Registry", href: "/students" }, { label: "Register Student", href: "/students/new" }, { label: "Student Placement", href: "/student-placement" }] },
  { label: "Tracks & Groups", href: "/tracks-groups", icon: UsersRound },
  { label: "Group Rosters", href: "/group-rosters", icon: ClipboardList },
  { label: "Schedule", href: "/schedule", icon: CalendarDays, children: [{ label: "Master Schedule", href: "/schedule" }, { label: "Create Session", href: "/schedule/new" }] },
  { label: "Attendance", href: "/attendance", icon: ClipboardCheck, children: [{ label: "Overview", href: "/attendance" }, { label: "Attendance Sessions", href: "/attendance/sessions" }, { label: "Form Responses", href: "/attendance/form-responses" }, { label: "Validation Review", href: "/attendance/validation-review" }, { label: "Session Review", href: "/attendance/session-review" }, { label: "Attendance Matrix", href: "/attendance/matrix" }] },
  { label: "Recorded Sessions", href: "/recorded-sessions", icon: PlaySquare },
  { label: "Session Materials", href: "/session-materials", icon: FileText },
  { label: "Resources", href: "/resources", icon: BookOpenCheck },
  { label: "Student Documents", href: "/student-documents", icon: FileText },
  { label: "Tasks & Grades", href: "/academic-records", icon: BookOpenCheck },
  { label: "Certificates", href: "/certificates", icon: Award },
  { label: "Collections & Receipts", href: "/collections", icon: ReceiptText, children: [{ label: "Quick Collection", href: "/collections" }, { label: "Payment Ledger", href: "/collections/ledger" }, { label: "Outstanding Balances", href: "/collections/outstanding" }] },
  { label: "Staff, Payroll & Expenses", href: "/staff-payroll", icon: BadgeDollarSign, children: [{ label: "Staff Directory", href: "/staff-payroll" }, { label: "Payroll", href: "/payroll" }, { label: "Expenses", href: "/expenses" }] },
  { label: "Profitability", href: "/profitability", icon: TrendingUp },
  { label: "Settings", href: "/settings", icon: Settings },
];

function allowedNavigation(user: AuthUser) {
  return navigation.flatMap(item => {
    const children = item.children?.filter(child => canAccessRoute(user.role, child.href));
    if (!canAccessRoute(user.role, item.href) && !children?.length) return [];
    return [{ ...item, children }];
  });
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "TT";
}

function Brand({ home, collapsed = false, onToggle }: { home: string; collapsed?: boolean; onToggle?: () => void }) {
  return <div className="relative border-b border-slate-200"><Link href={home} title={collapsed ? "TechTrek Academy Operations" : undefined} className={cn("flex h-16 items-center gap-3", collapsed ? "justify-center px-2" : "px-5")}><span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded"><Image src="/brand/techtrek-logo.png" alt="TechTrek" width={32} height={32} className="size-8 object-contain" priority unoptimized/></span>{!collapsed && <span><span className="heading block text-sm font-bold leading-4 text-slate-950">TechTrek Academy</span><span className="block text-[10px] font-semibold uppercase tracking-[.14em] text-red-700">Operations</span></span>}</Link>{onToggle && <button type="button" onClick={onToggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="absolute -end-3 top-5 z-10 grid size-7 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-red-200 hover:text-red-700">{collapsed ? <PanelLeftOpen size={14}/> : <PanelLeftClose size={14}/>}</button>}</div>;
}

function SidebarContent({ user, items, onNavigate, collapsed = false, onToggle }: { user: AuthUser; items: NavItem[]; onNavigate?: () => void; collapsed?: boolean; onToggle?: () => void }) {
  const pathname = usePathname(); const { t } = useI18n(); const { logout, loggingOut } = useAuth(); const [open, setOpen] = useState<Record<string, boolean>>({});
  return <div className="flex h-full flex-col"><Brand home={getDefaultRouteForRole(user.role)} collapsed={collapsed} onToggle={onToggle}/><nav className={cn("scrollbar-thin flex-1 overflow-y-auto py-4", collapsed ? "overflow-x-visible px-2" : "px-3")} aria-label="Main navigation">{items.map(item => { const Icon = item.icon; const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`); const childActive = item.children?.some(child => pathname === child.href); const expanded = open[item.label] ?? Boolean(childActive); return <div key={item.label} className="group relative mb-1"><div className={cn("flex items-center rounded", isActive && "bg-red-50")}><Link href={item.href} title={collapsed ? t(item.label) : undefined} onClick={onNavigate} className={cn("flex min-w-0 flex-1 items-center py-2.5 text-[13px] font-semibold", collapsed ? "justify-center px-2" : "gap-3 px-3", isActive ? "text-red-800" : "text-slate-600 hover:text-slate-950")}><Icon size={18}/>{!collapsed && <span className="truncate">{t(item.label)}</span>}</Link>{item.children?.length && !collapsed ? <button aria-label={`${expanded ? "Collapse" : "Expand"} ${t(item.label)}`} onClick={() => setOpen(value => ({ ...value, [item.label]: !expanded }))} className="me-1 rounded p-2 text-slate-400 hover:bg-white"><ChevronDown size={14} className={cn("transition-transform", expanded && "rotate-180")}/></button> : null}</div>{item.children?.length && !collapsed && expanded ? <div className="ms-8 border-s border-slate-200 py-1">{item.children.map(child => <Link key={child.href} href={child.href} onClick={onNavigate} className={cn("block py-1.5 ps-3 text-xs", pathname === child.href ? "font-semibold text-red-700" : "text-slate-500 hover:text-slate-900")}>{t(child.label)}</Link>)}</div> : null}{collapsed && item.children?.length ? <div className="invisible absolute start-full top-0 z-50 ms-2 w-52 translate-x-1 rounded border border-slate-200 bg-white p-2 opacity-0 shadow-xl transition group-hover:visible group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-x-0 group-focus-within:opacity-100"><div className="px-2 py-1.5 text-xs font-bold text-slate-900">{t(item.label)}</div>{item.children.map(child => <Link key={child.href} href={child.href} className={cn("block rounded px-2 py-2 text-xs", pathname === child.href ? "bg-red-50 font-semibold text-red-700" : "text-slate-600 hover:bg-slate-50")}>{t(child.label)}</Link>)}</div> : null}</div>; })}</nav><div className={cn("border-t border-slate-200", collapsed ? "p-2" : "p-4")}><div title={collapsed ? `${user.displayName}  -  ${ROLE_LABELS[user.role]}` : undefined} className={cn("flex items-center gap-3", collapsed && "flex-col justify-center")}><span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">{initials(user.displayName)}</span>{!collapsed && <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{safeDisplayText(user.displayName)}</div><div className="text-[11px] text-slate-500">{ROLE_LABELS[user.role]}</div></div>}<button type="button" disabled={loggingOut} onClick={() => void logout()} title="Logout" aria-label="Logout" className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"><LogOut size={15}/></button></div></div></div>;
}

function Topbar({ user, items, onMenu }: { user: AuthUser; items: NavItem[]; onMenu: () => void }) {
  const { language, setLanguage, t } = useI18n(); const { logout, loggingOut } = useAuth(); const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } if (event.key === "Escape") setSearchOpen(false); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);
  const quickLinks = useMemo(() => items.flatMap(item => [{ label: item.label, href: item.href }, ...(item.children ?? [])]), [items]);
  return <><header className="sticky top-0 z-30 flex h-16 items-center border-b border-slate-200 bg-white px-4 lg:px-6"><button className="me-3 rounded p-2 text-slate-600 xl:hidden" onClick={onMenu} aria-label="Open navigation"><Menu size={20}/></button><button onClick={() => setSearchOpen(true)} className="hidden h-9 w-full max-w-md items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 text-start text-xs text-slate-400 sm:flex"><Search size={15}/>Search or jump to an allowed page...<kbd className="ms-auto rounded border bg-white px-1.5 py-0.5 text-[10px] text-slate-500">Ctrl K</kbd></button><div className="ms-auto flex items-center gap-1"><button onClick={() => setLanguage(language === "en" ? "ar" : "en")} className="flex h-9 items-center gap-1 rounded border border-slate-200 px-2 text-xs font-bold text-slate-700 hover:bg-slate-50" aria-label="Toggle language"><Languages size={15}/>{language === "en" ? "AR" : "EN"}</button><button className="rounded p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications"><Bell size={18}/></button><span className="mx-2 hidden h-5 w-px bg-slate-200 sm:block"/><div className="hidden text-end sm:block"><div className="max-w-40 truncate text-xs font-semibold">{user.displayName}</div><div className="text-[10px] text-slate-500">{ROLE_LABELS[user.role]}</div></div><span className="ms-2 grid size-8 place-items-center rounded-full bg-red-700 text-xs font-bold text-white">{initials(user.displayName)}</span><button type="button" onClick={() => void logout()} disabled={loggingOut} title="Logout" aria-label="Logout" className="ms-1 rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"><LogOut size={17}/></button></div></header>{searchOpen && <div className="fixed inset-0 z-[80] bg-slate-950/35 p-4 pt-[12vh]" onMouseDown={() => setSearchOpen(false)}><div className="mx-auto max-w-xl overflow-hidden rounded-lg border bg-white shadow-2xl" onMouseDown={event => event.stopPropagation()}><div className="flex items-center gap-2 border-b px-4"><Search size={18} className="text-slate-400"/><input autoFocus aria-label="Global search" placeholder="Search allowed pages..." className="h-14 flex-1 bg-transparent text-sm outline-none"/><button onClick={() => setSearchOpen(false)} aria-label="Close"><X size={18}/></button></div><div className="max-h-80 overflow-auto p-2">{quickLinks.map(link => <Link onClick={() => setSearchOpen(false)} key={`${link.href}-${link.label}`} href={link.href} className="flex items-center gap-3 rounded px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-red-700"><Search size={14}/>{t(link.label)}</Link>)}</div></div></div>}</>;
}

function AuthenticatedShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth(); const [mobileOpen, setMobileOpen] = useState(false); const [collapsed, setCollapsed] = useState(false); const [sidebarReady, setSidebarReady] = useState(false);
  useEffect(() => { const frame = window.requestAnimationFrame(() => { setCollapsed(window.localStorage.getItem("techtrek-sidebar-collapsed") === "true"); setSidebarReady(true); }); return () => window.cancelAnimationFrame(frame); }, []);
  const toggleSidebar = () => setCollapsed(current => { const next = !current; window.localStorage.setItem("techtrek-sidebar-collapsed", String(next)); return next; });
  if (loading || !user) return <div className="grid min-h-screen place-items-center bg-[#f7f8fc]"><div className="text-center"><span className="mx-auto mb-3 grid size-10 animate-pulse place-items-center rounded bg-red-700 text-xs font-black text-white">TT</span><p className="text-sm text-slate-500">Loading secure workspace...</p></div></div>;
  const items = allowedNavigation(user);
  return <ToastProvider><div className="min-h-screen bg-[#f7f8fc]"><aside className={cn("fixed inset-y-0 start-0 z-40 hidden border-e border-slate-200 bg-white xl:block", sidebarReady && "transition-[width] duration-200 ease-out", collapsed ? "w-[72px]" : "w-[260px]")}><SidebarContent user={user} items={items} collapsed={collapsed} onToggle={toggleSidebar}/></aside><div className={cn(sidebarReady && "transition-[padding] duration-200 ease-out", collapsed ? "xl:ps-[72px]" : "xl:ps-[260px]")}><Topbar user={user} items={items} onMenu={() => setMobileOpen(true)}/><main className="mx-auto max-w-[1440px] p-4 sm:p-6">{children}</main></div>{mobileOpen && <div className="fixed inset-0 z-50 xl:hidden"><button className="absolute inset-0 bg-slate-950/40" onClick={() => setMobileOpen(false)} aria-label="Close navigation"/><aside className="relative h-full w-[285px] bg-white shadow-xl"><SidebarContent user={user} items={items} onNavigate={() => setMobileOpen(false)}/></aside></div>}</div></ToastProvider>;
}

export function AppShell({ children }: { children: ReactNode }) {
  return <AuthProvider><AuthenticatedShell>{children}</AuthenticatedShell></AuthProvider>;
}
