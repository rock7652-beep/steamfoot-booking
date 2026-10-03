"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CustomerLabels } from "@/components/customer-labels";

export const rosterRowClassName = "items-center gap-2 bg-white px-3 py-1 text-sm hover:bg-earth-50";
export const rosterStatusButtonClassName = "relative z-20 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-primary-600 disabled:opacity-50";

export function RosterToolbar({ children, label }: { children: ReactNode; label: string }) {
  return <div className="flex shrink-0 flex-wrap items-center gap-2" aria-label={label}>{children}</div>;
}

/** Labels and both note sources share one column; full notes open only on demand. */
export function RosterNotes({ customerId, name, readOnly, notes, onOpen }: {
  customerId?: string; name: string; readOnly: boolean;
  notes: { label: string; value?: string | null; emphasis?: boolean }[];
  onOpen?: () => void;
}) {
  const visible = notes.filter(note => note.value?.trim());
  const content = visible.map(note => <span key={note.label} title={note.value ?? undefined}
    className={`block truncate ${note.emphasis ? "font-medium text-earth-900" : "text-earth-600"}`}>
    {note.label}：{note.value?.trim().replace(/\s+/g, " ")}
  </span>);
  return <div className="relative z-20 flex min-h-11 min-w-0 flex-col justify-center py-0.5 text-sm">
    {customerId && <CustomerLabels customerId={customerId} readOnly={readOnly} hideEmpty={readOnly} maxVisible={5} variant="dots" />}
    {visible.length > 0 && (onOpen
      ? <button type="button" className="block w-full space-y-0.5 text-left focus-visible:outline-2 focus-visible:outline-primary-600" aria-label={`${name} 標籤與備註`} onClick={onOpen}>{content}</button>
      : <div className="space-y-0.5">{content}</div>)}
  </div>;
}


/** Fixed menu keeps row actions visible inside a scrolling dialog. */
export function RosterMoreMenu({ name, disabled, onOpen }: { name: string; disabled?: boolean; onOpen: () => void }) {
  const [position, setPosition] = useState<{top: number; left: number} | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) close(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close(); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    menu.current?.querySelector("button")?.focus();
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key, true); window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); };
  }, [position]);
  return <>
    <button ref={trigger} type="button" disabled={disabled} aria-label={`${name} 的更多操作`} aria-expanded={!!position} aria-haspopup="menu" className="min-h-11 min-w-11 rounded text-earth-500 hover:bg-earth-50 focus-visible:outline-2 focus-visible:outline-primary-600" onClick={() => {
      if (position) { setPosition(null); return; }
      const rect = trigger.current!.getBoundingClientRect();
      setPosition({top: rect.bottom + 58 < window.innerHeight ? rect.bottom : Math.max(8, rect.top - 58), left: Math.max(8, rect.right - 160)});
    }}>⋯</button>
    {position && createPortal(<div ref={menu} role="menu" style={position} className="fixed z-[160] w-40 rounded-lg border border-earth-200 bg-white p-1 shadow-lg"><button type="button" role="menuitem" className="min-h-11 w-full rounded px-3 text-left text-sm hover:bg-earth-50" onClick={() => {setPosition(null); onOpen();}}>查看／編輯預約</button></div>, document.body)}
  </>;
}
