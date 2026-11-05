"use client";

import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { EmptyState, cn } from "./primitives";
import { useI18n } from "@/i18n/I18nProvider";
import { displayNode, safeDisplayText } from "@/lib/display";

export type Column<T> = { key: string; header: string; className?: string; cell: (row: T, index: number) => ReactNode };

export function DataTable<T>({ rows, columns, getKey, selectable = false, onRowClick }: { rows: T[]; columns: Column<T>[]; getKey: (row: T) => string; selectable?: boolean; onRowClick?: (row: T) => void }) {
  const { t } = useI18n();
  if (!rows.length) return <EmptyState/>;
  return <div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[820px] border-collapse text-start"><thead><tr className="border-b border-slate-200 bg-slate-50">{selectable && <th className="w-10 px-3 py-2"><input aria-label="Select all" type="checkbox" className="accent-red-700"/></th>}{columns.map(column => <th key={column.key} className={cn("whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500", column.className)}>{safeDisplayText(t(column.header))}</th>)}<th className="w-10 px-3 py-2"><span className="sr-only">{safeDisplayText(t("Actions"))}</span></th></tr></thead><tbody>{rows.map((row, rowIndex) => <tr onClick={() => onRowClick?.(row)} className={cn("table-row h-12 border-b border-slate-100 text-[13px] last:border-0", onRowClick && "cursor-pointer")} key={getKey(row)}>{selectable && <td className="px-3" onClick={event => event.stopPropagation()}><input aria-label={`Select ${getKey(row)}`} type="checkbox" className="accent-red-700"/></td>}{columns.map(column => <td key={column.key} className={cn("whitespace-nowrap px-3 py-2 text-slate-700", column.className)}>{displayNode(column.cell(row, rowIndex))}</td>)}<td className="px-3"><button onClick={event => event.stopPropagation()} aria-label={`Actions for ${getKey(row)}`} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><MoreHorizontal size={16}/></button></td></tr>)}</tbody></table></div>;
}

export function FilterBar({ children, resultCount }: { children: ReactNode; resultCount?: number }) {
  return <div className="border-b border-slate-200 bg-white p-3"><div className="flex flex-col gap-2 md:flex-row md:items-center">{children}{resultCount !== undefined && <span className="ml-auto whitespace-nowrap px-2 text-xs text-slate-500">{resultCount} results</span>}</div></div>;
}
