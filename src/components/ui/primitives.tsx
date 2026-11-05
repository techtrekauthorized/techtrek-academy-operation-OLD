"use client";

import { ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import { useOptionalAuth } from "@/components/auth/AuthProvider";
import { canAccessRoute } from "@/lib/auth/permissions";
import type { ReactNode } from "react";
import type { StatusTone } from "@/types";
import { useI18n } from "@/i18n/I18nProvider";
import { safeDisplayText } from "@/lib/display";

export const cn = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");

export function Button({ children, variant = "primary", size = "md", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  const styles = { primary: "bg-red-700 text-white border-red-700 hover:bg-red-800", secondary: "bg-white text-slate-800 border-slate-300 hover:bg-slate-50", ghost: "bg-transparent text-red-700 border-transparent hover:bg-red-50", danger: "bg-red-50 text-red-800 border-red-200 hover:bg-red-100" };
  return <button className={cn("inline-flex items-center justify-center gap-2 rounded border font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50", size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm", styles[variant], className)} {...props}>{children}</button>;
}

export function LinkButton({ href, children, variant = "primary", className }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  const auth = useOptionalAuth();
  if (auth?.user && href.startsWith("/") && !canAccessRoute(auth.user.role, href.split("?")[0])) return null;
  const styles = { primary: "bg-red-700 text-white border-red-700 hover:bg-red-800", secondary: "bg-white text-slate-800 border-slate-300 hover:bg-slate-50", ghost: "text-red-700 border-transparent hover:bg-red-50" };
  return <Link href={href} className={cn("inline-flex h-10 items-center justify-center gap-2 rounded border px-4 text-sm font-semibold transition-colors", styles[variant], className)}>{children}</Link>;
}

export function StatusBadge({ children, tone }: { children: ReactNode; tone?: StatusTone }) {
  const { t } = useI18n();
  const inferred = typeof children === "string" ? (/paid|active|present|approved|issued|eligible|completed|recorded|reconciled/i.test(children) ? "success" : /overdue|blocked|absent|rejected|conflict/i.test(children) ? "danger" : /partial|pending|late|progress|invited|leave/i.test(children) ? "warning" : /hybrid|online|scheduled/i.test(children) ? "info" : "neutral") : "neutral";
  const styles = { success: "bg-emerald-50 text-emerald-700 border-emerald-200", warning: "bg-amber-50 text-amber-700 border-amber-200", danger: "bg-red-50 text-red-700 border-red-200", info: "bg-blue-50 text-blue-700 border-blue-200", neutral: "bg-slate-100 text-slate-600 border-slate-200" };
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold", styles[tone ?? inferred])}>{typeof children === "string" ? safeDisplayText(t(children)) : children}</span>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) { return <section className={cn("rounded-lg border border-slate-200 bg-white", className)}>{children}</section>; }

export function KpiCard({ label, value, detail, icon, accent = false, valueHidden = false }: { label: string; value: string; detail?: string; icon?: ReactNode; accent?: boolean; valueHidden?: boolean }) {
  const { t } = useI18n();
  return <Card className={cn("min-w-0 p-4", accent && "border-red-200 bg-red-700 text-white")}><div className={cn("mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide", accent ? "text-red-100" : "text-slate-500")}><span>{safeDisplayText(t(label))}</span><span className={accent ? "text-white" : "text-red-700"}>{icon}</span></div><div className="heading text-2xl font-bold tracking-tight" data-ltr>{valueHidden ? <><span aria-hidden="true" className="inline-block select-none blur-md opacity-60 transition duration-150 pointer-events-none">{safeDisplayText(value)}</span><span className="sr-only">Financial value hidden</span></> : safeDisplayText(value)}</div>{detail && <p className={cn("mt-1 text-xs", accent ? "text-red-100" : "text-slate-500")}>{safeDisplayText(detail)}</p>}</Card>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  const { t } = useI18n();
  return <header className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div>{eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[.12em] text-red-700">{safeDisplayText(t(eyebrow))}</div>}<h1 className="heading text-2xl font-bold text-slate-950 sm:text-[28px]">{safeDisplayText(t(title))}</h1>{description && <p className="mt-1 max-w-3xl text-sm text-slate-500">{safeDisplayText(description)}</p>}</div>{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}</header>;
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  const { t, direction } = useI18n();
  return <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-xs text-slate-500">{items.map((item, index) => <span className="flex items-center gap-1" key={item.label}>{index > 0 && <ChevronRight size={12} className={direction === "rtl" ? "rotate-180" : ""}/>} {item.href ? <Link className="hover:text-red-700" href={item.href}>{safeDisplayText(t(item.label))}</Link> : <span>{safeDisplayText(t(item.label))}</span>}</span>)}</nav>;
}

export function SearchInput({ value, onChange, placeholder = "Search...", className }: { value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  const { t, direction } = useI18n(); const translated = t(placeholder);
  return <label className={cn("relative block", className)}><span className="sr-only">{translated}</span><Search className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400", direction === "rtl" ? "right-3" : "left-3")} size={16}/><input className={cn("h-10 w-full rounded border border-slate-300 bg-white text-sm placeholder:text-slate-400 focus:border-red-500", direction === "rtl" ? "pr-9 pl-8" : "pl-9 pr-8")} value={value} onChange={event => onChange(event.target.value)} placeholder={translated}/>{value && <button type="button" aria-label="Clear search" onClick={() => onChange("")} className={cn("absolute top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-800", direction === "rtl" ? "left-2" : "right-2")}><X size={14}/></button>}</label>;
}

export function Select({ label, value, onChange, options, className }: { label: string; value: string; onChange: (value: string) => void; options: string[]; className?: string }) {
  const { t } = useI18n();
  return <label className={cn("block", className)}><span className="sr-only">{safeDisplayText(t(label))}</span><select aria-label={safeDisplayText(t(label))} className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-700" value={value} onChange={e => onChange(e.target.value)}><option value="">{safeDisplayText(`${t("All")} ${t(label)}`)}</option>{options.map(option => <option key={option} value={option}>{safeDisplayText(t(option))}</option>)}</select></label>;
}

export function Field({ label, required, hint, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const { t } = useI18n();
  return <label className={cn("block", className)}><span className="mb-1.5 block text-xs font-semibold text-slate-700">{safeDisplayText(t(label))}{required && <span className="text-red-700"> *</span>}</span><input className="h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm placeholder:text-slate-400 focus:border-red-500" required={required} {...props}/>{hint && <span className="mt-1 block text-[11px] text-slate-500">{safeDisplayText(hint)}</span>}</label>;
}

export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (tab: string) => void }) {
  const { t } = useI18n();
  return <div className="scrollbar-thin flex overflow-x-auto border-b border-slate-200" role="tablist">{tabs.map(tab => <button role="tab" aria-selected={active === tab} key={tab} onClick={() => onChange(tab)} className={cn("whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold", active === tab ? "border-red-700 text-red-700" : "border-transparent text-slate-500 hover:text-slate-800")}>{safeDisplayText(t(tab))}</button>)}</div>;
}

export function EmptyState({ title = "No records found", detail = "Try adjusting your filters or search terms." }: { title?: string; detail?: string }) { const { t } = useI18n(); return <div className="py-14 text-center"><div className="text-sm font-semibold text-slate-800">{safeDisplayText(t(title))}</div><div className="mt-1 text-xs text-slate-500">{safeDisplayText(t(detail))}</div></div>; }
export function LoadingState() { return <div className="space-y-3 p-5" aria-label="Loading"><div className="h-4 w-1/3 animate-pulse rounded bg-slate-200"/><div className="h-10 animate-pulse rounded bg-slate-100"/><div className="h-10 animate-pulse rounded bg-slate-100"/></div>; }
export function ErrorState() { return <div className="m-5 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>Unable to load this view.</strong><p className="mt-1 text-xs">Refresh and try again. No data was changed.</p></div>; }
export function PermissionDeniedState() { return <div className="mx-auto max-w-md py-16 text-center"><h2 className="heading text-xl font-bold">Permission required</h2><p className="mt-2 text-sm text-slate-500">Your internal role does not include access to this area.</p></div>; }
