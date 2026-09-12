"use client";

import { createPortal } from "react-dom";

/** Outside drawers/menus so closing a mobile menu cannot hide navigation feedback. */
export function NavigationNotice() {
  if (typeof document === "undefined") return null;
  return createPortal(
    <span role="status" aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-[10000] -translate-x-1/2 rounded-xl border border-earth-200 bg-white px-5 py-3 text-sm font-medium text-earth-800 shadow-lg">
      讀取中，請稍候…
    </span>,
    document.body,
  );
}
