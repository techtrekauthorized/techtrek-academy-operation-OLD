"use client";

import { CheckCircle2, X } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { Button, cn } from "./primitives";

type ToastContextValue = { showToast: (message: string) => void };
const ToastContext = createContext<ToastContextValue>({ showToast: () => undefined });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const showToast = useCallback((value: string) => { setMessage(value); window.setTimeout(() => setMessage(""), 3200); }, []);
  return <ToastContext.Provider value={{ showToast }}>{children}{message && <div role="status" className="fixed bottom-5 right-5 z-[70] flex max-w-sm animate-enter items-center gap-3 rounded border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white shadow-xl"><CheckCircle2 className="text-emerald-400" size={18}/><span>{message}</span><button aria-label="Dismiss" onClick={() => setMessage("")}><X size={16}/></button></div>}</ToastContext.Provider>;
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()} className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-slate-200 bg-white shadow-2xl"><header className="flex items-center justify-between border-b p-4"><h2 className="heading text-lg font-bold">{title}</h2><button className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close"><X size={18}/></button></header><div className="p-5">{children}</div>{footer && <footer className="flex justify-end gap-2 border-t bg-slate-50 p-4">{footer}</footer>}</section></div>;
}

export function Drawer({ open, onClose, title, children, footer, width = "max-w-xl" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: string }) {
  return <div className={cn("fixed inset-0 z-[60] transition", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}><div onClick={onClose} className={cn("absolute inset-0 bg-slate-950/35 transition-opacity", open ? "opacity-100" : "opacity-0")}/><section role="dialog" aria-modal="true" aria-label={title} className={cn("absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl transition-transform", width, open ? "translate-x-0" : "translate-x-full")}><header className="flex h-16 shrink-0 items-center justify-between border-b px-5"><h2 className="heading text-lg font-bold">{title}</h2><button onClick={onClose} aria-label="Close" className="p-1 text-slate-500"><X size={20}/></button></header><div className="flex-1 overflow-auto p-5">{children}</div>{footer && <footer className="flex justify-end gap-2 border-t bg-slate-50 p-4">{footer}</footer>}</section></div>;
}

export function ConfirmDialog({ open, onClose, onConfirm, title = "Confirm action", message }: { open: boolean; onClose: () => void; onConfirm: () => void; title?: string; message: string }) {
  return <Modal open={open} onClose={onClose} title={title} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={() => { onConfirm(); onClose(); }}>Confirm</Button></>}><p className="text-sm leading-6 text-slate-600">{message}</p></Modal>;
}
