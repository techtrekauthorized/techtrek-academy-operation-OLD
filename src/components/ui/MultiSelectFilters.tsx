"use client";

import type { ReactNode } from "react";

export type MultiSelectFilterDefinition<TKey extends string = string> = {
  key: TKey;
  label: string;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
};

export function MultiSelectFilter<TKey extends string>({ definition, values, onChange }: { definition: MultiSelectFilterDefinition<TKey>; values: string[]; onChange: (values: string[]) => void }) {
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter(item => item !== value) : [...values, value]);
  return <details className="group relative"><summary aria-label={definition.label} className="flex h-10 cursor-pointer list-none items-center justify-between rounded border border-slate-300 bg-white px-3 text-sm text-slate-700 [&::-webkit-details-marker]:hidden"><span className="truncate">{values.length ? `${definition.label}: ${values.length} selected` : definition.allLabel}</span><span className="ms-2 text-[10px] text-slate-400">v</span></summary><div className="absolute start-0 top-11 z-50 max-h-72 w-full min-w-64 overflow-y-auto rounded border border-slate-200 bg-white p-2 shadow-xl"><div className="mb-1 flex items-center justify-between border-b px-2 pb-2"><strong className="text-xs">{definition.label}</strong><button type="button" disabled={!values.length} onClick={() => onChange([])} className="text-[11px] font-semibold text-red-700 disabled:text-slate-300">All</button></div>{definition.options.map(option => <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs hover:bg-slate-50"><input type="checkbox" checked={values.includes(option.value)} onChange={() => toggle(option.value)} className="accent-red-700"/><span>{option.label}</span></label>)}</div></details>;
}

export function SelectedFilterChips<TKey extends string>({ definitions, filters, onChange }: { definitions: Array<MultiSelectFilterDefinition<TKey>>; filters: Record<TKey, string[]>; onChange: (key: TKey, values: string[]) => void }) {
  const chips = definitions.flatMap(definition => (filters[definition.key] ?? []).map(value => ({ definition, value, label: definition.options.find(option => option.value === value)?.label ?? value })));
  if (!chips.length) return null;
  return <div className="mt-3 flex flex-wrap gap-1.5">{chips.map(chip => <button type="button" key={`${chip.definition.key}-${chip.value}`} onClick={() => onChange(chip.definition.key, (filters[chip.definition.key] ?? []).filter(value => value !== chip.value))} className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700"><span className="text-slate-500">{chip.definition.label}:</span>{chip.label}<span aria-hidden>-</span></button>)}</div>;
}

export function FilterPanelHeader({ title, detail, activeCount, clearDisabled, onClear, clearLabel = "Clear Filters" }: { title?: string; detail: ReactNode; activeCount: number; clearDisabled: boolean; onClear: () => void; clearLabel?: string }) {
  return <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div>{title && <h2 className="heading text-sm font-bold">{title}</h2>}<div className="text-xs text-slate-500">{detail}</div></div><div className="flex items-center gap-2"><span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">{activeCount} selected</span><button type="button" disabled={clearDisabled} onClick={onClear} className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50">{clearLabel}</button></div></div>;
}
