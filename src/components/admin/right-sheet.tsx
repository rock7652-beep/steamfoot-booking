"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface RightSheetProps {
  compact?: boolean;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  labelledById?: string;
  closeOnEscape?: boolean;
  variant?: "right" | "modal";
}

export function RightSheet({
  open,
  onClose,
  children,
  width = 460,
  compact = false,
  labelledById,
  closeOnEscape = true,
  variant = "right",
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
      if (event.target instanceof Element && event.target.closest("[data-right-sheet]") !== panel?.closest("[data-right-sheet]")) return;
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
      if (closeOnEscape && e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, closeOnEscape]);

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
        style={{ width: variant === "modal" ? undefined : width, maxWidth: variant === "modal" ? width : undefined }}
        className={`${variant === "modal" ? "absolute left-1/2 top-1/2 flex max-h-[88dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-earth-200 transition-opacity duration-150" : "absolute right-0 top-0 flex h-full max-w-full flex-col transition-transform duration-200"} ${compact ? "border-t-4 border-t-secondary-500 [&>header]:bg-primary-50 [&>footer]:bg-earth-50" : ""} bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_8px_40px_rgba(20,24,31,0.15)] ${
          variant === "modal"
            ? open ? "opacity-100" : "opacity-0"
            : open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {children}
      </aside>
    </div>
  );
}
