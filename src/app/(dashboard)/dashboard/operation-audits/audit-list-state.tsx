"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Only remember presentation state; permissions and rows are always server-owned. */
export function AuditListState({ viewKey, children }: { viewKey: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const storageKey = `audit-list:v1:${viewKey}`;
  useEffect(() => {
    let frame = 0;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      sessionStorage.removeItem(storageKey);
      const saved = JSON.parse(raw) as { open?: unknown; top?: unknown };
      const open = new Set(Array.isArray(saved.open) ? saved.open.filter(id => typeof id === "string") : []);
      root.current?.querySelectorAll<HTMLDetailsElement>("details[data-record]").forEach(el => { el.open = open.has(el.dataset.record ?? ""); });
      if (typeof saved.top === "number" && Number.isFinite(saved.top)) {
        const top = Math.max(0, saved.top);
        frame = requestAnimationFrame(() => window.scrollTo({ top, behavior: "instant" }));
      }
    } catch { /* Storage may be disabled; native back navigation still works. */ }
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);
  return <div ref={root} className="@container min-w-0" onClickCapture={event => {
    if (!(event.target instanceof Element) || !event.target.closest("a")) return;
    try {
      const open = Array.from(root.current?.querySelectorAll<HTMLDetailsElement>("details[data-record][open]") ?? [], el => el.dataset.record);
      sessionStorage.setItem(storageKey, JSON.stringify({ open, top: window.scrollY }));
    } catch { /* A read-only view must remain usable without storage. */ }
  }}>{children}</div>;
}
