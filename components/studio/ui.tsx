"use client";
import { useEffect, useRef, useState, type ReactNode, type FormEvent, type ButtonHTMLAttributes } from "react";
import { X, LoaderCircle, CarFront, Check, Clock3, CircleDashed } from "lucide-react";
import { WORK_STATUSES, type WorkStatus } from "../../lib/domain";
import { initials, toCents } from "../../lib/client";

export function Button({ children, variant = "primary", small, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; small?: boolean }) {
  return <button {...props} className={`button ${variant} ${small ? "small" : ""} ${className}`}>{children}</button>;
}
export function Panel({ children, title, action, className = "" }: { children: ReactNode; title?: ReactNode; action?: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{title && <div className="panel-heading"><h2>{title}</h2>{action}</div>}{children}</section>;
}
export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function MoneyInput({ value, onChange, ...props }: { value: number; onChange: (n: number) => void; disabled?: boolean; required?: boolean; "aria-label"?: string }) {
  return <div className="money-input"><input {...props} type="number" min="0" max="10000000" step="0.01" value={value / 100 || ""} placeholder="0" onChange={e => onChange(toCents(e.target.value))}/><span>₽</span></div>;
}
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);
  return <dialog ref={ref} className={`modal ${wide ? "wide" : ""}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === ref.current) { const r = ref.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }} aria-label={title}><div className="modal-heading"><h2>{title}</h2><Button variant="ghost" small onClick={onClose} aria-label="Закрыть окно"><X size={20}/></Button></div>{children}</dialog>;
}
export function SaveForm({ children, onSave, label = "Сохранить", onCancel, className = "" }: { children: ReactNode; onSave: (form: FormData) => Promise<void>; label?: string; onCancel?: () => void; className?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (busy) return; const form = new FormData(e.currentTarget); setBusy(true); setError(""); try { await onSave(form); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <form onSubmit={submit} className={className}>{children}{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions">{onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Отмена</Button>}<Button type="submit" disabled={busy}>{busy && <LoaderCircle size={17} className="spin"/>}{busy ? "Сохраняем…" : label}</Button></div></form>;
}
export function Empty({ title, text, action, icon }: { title: string; text: string; action?: ReactNode; icon?: ReactNode }) { return <div className="empty"><div className="empty-icon">{icon || <CarFront size={34}/>}</div><h3>{title}</h3><p>{text}</p>{action}</div>; }
export function WorkBadge({ status }: { status: WorkStatus }) { const Icon = status === "done" ? Check : status === "progress" ? Clock3 : CircleDashed; return <span className={`badge ${status}`}><Icon size={13}/>{WORK_STATUSES[status]}</span>; }
export function OrderBadge({ completed }: { completed: boolean }) { return <span className={`badge ${completed ? "done" : "progress"}`}><i/>{completed ? "Завершён" : "В работе"}</span>; }
export function Avatar({ name, small = false }: { name: string; small?: boolean }) { return <span className={`avatar ${small ? "small" : ""}`}>{initials(name)}</span>; }
export function Confirm({ title, children, onConfirm, onClose, label = "Подтвердить" }: { title: string; children: ReactNode; onConfirm: () => Promise<void>; onClose: () => void; label?: string }) { return <Modal title={title} onClose={onClose}><SaveForm onSave={onConfirm} onCancel={onClose} label={label}><div className="confirm-copy">{children}</div></SaveForm></Modal>; }
