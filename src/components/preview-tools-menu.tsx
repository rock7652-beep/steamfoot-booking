"use client";

import { useEffect, useRef, useState } from "react";

type Item = { label: string; href: string; locked: boolean; status?: string };

export function PreviewToolsMenu({ items, storeName }: { items: Item[]; storeName?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  if (!items.length) return null;
  return <div ref={root} className="relative shrink-0" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls="dashboard-preview-tools" aria-label="預覽工具" onClick={() => setOpen(value => !value)} className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium text-earth-600 hover:bg-earth-100 focus-visible:outline-2 focus-visible:outline-primary-500">
      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>
      <span className="hidden sm:inline">預覽</span><span aria-hidden="true">▾</span>
    </button>
    {open && <div id="dashboard-preview-tools" aria-label="預覽選項" className="absolute left-0 top-full z-50 mt-1 max-h-[60dvh] w-56 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-earth-200 bg-white p-1 shadow-lg">
      {storeName && <p className="break-words px-3 py-2 text-sm text-earth-500">{storeName}</p>}
      {items.map(item => item.locked ? <div key={item.href} aria-disabled="true" className="flex min-h-11 items-center justify-between gap-2 px-3 text-sm text-earth-500"><span>{item.label}</span><span className="text-xs">{item.status ?? "未開通"}</span></div> : <a key={item.href} href={item.href} className="flex min-h-11 items-center rounded-md px-3 text-sm text-primary-900 hover:bg-earth-100 focus-visible:bg-earth-100">{item.label}</a>)}
    </div>}
  </div>;
}
