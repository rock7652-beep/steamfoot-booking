"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const rosterRowClassName = "items-center gap-2 bg-white px-3 py-1 text-sm hover:bg-earth-50";
export const rosterStatusButtonClassName = "relative z-20 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-primary-600 disabled:opacity-50";

export function RosterToolbar({ children, label }: { children: ReactNode; label: string }) {
  return <div className="flex shrink-0 flex-wrap items-center gap-2" aria-label={label}>{children}</div>;
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
