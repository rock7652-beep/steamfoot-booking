"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import styles from "./right-sheet.module.css";

const openPanels: symbol[] = [];
let originalOverflow = "";

interface RightSheetProps {
  presentation?: "side" | "centered";
  compact?: boolean;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  labelledById?: string;
  closeOnEscape?: boolean;
}

export function RightSheet({
  presentation = "side",
  open,
  onClose,
  children,
  width = 460,
  compact = false,
  labelledById,
  closeOnEscape = true,
}: RightSheetProps) {
  const centered = presentation === "centered";
  const token = useRef(Symbol("sheet"));
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || (!compact && !centered)) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
    (focusable()[0] ?? panel)?.focus({ preventScroll: true });
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab" || openPanels.at(-1) !== token.current) return;
      if (event.target instanceof Element && event.target.closest("[data-right-sheet]") !== panel?.closest("[data-right-sheet]")) return;
      const items = focusable();
      const first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); panel?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    panel?.addEventListener("keydown", trap);
    return () => { panel?.removeEventListener("keydown", trap); previous?.focus({ preventScroll: true }); };
  }, [open, compact, centered]);
  useEffect(() => {
    if (!open) return;
    const id = token.current;
    if (!openPanels.length) originalOverflow = document.body.style.overflow;
    openPanels.push(id);
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (openPanels.at(-1) !== id || !closeOnEscape || e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      closeRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const index = openPanels.indexOf(id);
      if (index >= 0) openPanels.splice(index, 1);
      if (!openPanels.length) document.body.style.overflow = originalOverflow;
    };
  }, [open, closeOnEscape]);

  return (
    <div
      data-right-sheet
      data-presentation={presentation}
      inert={!open}
      style={centered ? { top: 0, right: 0 } : undefined}
      aria-hidden={!open}
      className={`fixed inset-0 ${centered ? "z-[80]" : compact ? "z-[70]" : "z-50"} ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <div
        onClick={() => { if (openPanels.at(-1) === token.current) onClose(); }}
        className={`absolute inset-0 bg-earth-900/30 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        ref={panelRef}
        tabIndex={compact || centered ? -1 : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        style={centered ? { "--sheet-width": `${width}px` } as CSSProperties : { width }}
        className={`${centered ? styles.centered : "absolute right-0 top-0 h-full max-w-full"} flex flex-col ${compact ? "border-l border-earth-200 border-t-4 border-t-secondary-500 [&>header]:bg-primary-50 [&>footer]:bg-earth-50" : ""} bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_8px_40px_rgba(20,24,31,0.15)] transition-transform duration-200 ${
          centered ? (open ? "visible" : "invisible") : (open ? "translate-x-0" : "translate-x-full")
        }`}
      >
        {children}
      </aside>
    </div>
  );
}
