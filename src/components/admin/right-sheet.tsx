"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface RightSheetProps {
  compact?: boolean;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  labelledById?: string;
}

export function RightSheet({
  open,
  onClose,
  children,
  width = 460,
  compact = false,
  labelledById,
}: RightSheetProps) {
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || !compact) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
    (focusable()[0] ?? panel)?.focus({ preventScroll: true });
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); panel?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    panel?.addEventListener("keydown", trap);
    return () => { panel?.removeEventListener("keydown", trap); previous?.focus({ preventScroll: true }); };
  }, [open, compact]);
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <div
      data-right-sheet
      aria-hidden={!open}
      className={`fixed inset-0 ${compact ? "z-[70]" : "z-50"} ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-earth-900/30 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        ref={panelRef}
        tabIndex={compact ? -1 : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        style={{ width }}
        className={`absolute right-0 top-0 flex h-full max-w-full flex-col ${compact ? "border-l border-earth-200 border-t-4 border-t-secondary-500 [&>header]:bg-primary-50 [&>footer]:bg-earth-50" : ""} bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_8px_40px_rgba(20,24,31,0.15)] transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {children}
      </aside>
    </div>
  );
}
