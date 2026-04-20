"use client";

import { useEffect, type ReactNode } from "react";

interface RightSheetProps {
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
  labelledById,
}: RightSheetProps) {
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
      aria-hidden={!open}
      className={`fixed inset-0 z-50 ${
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
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        style={{ width }}
        className={`absolute right-0 top-0 flex h-full max-w-full flex-col bg-white shadow-[0_8px_40px_rgba(20,24,31,0.15)] transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {children}
      </aside>
    </div>
  );
}
