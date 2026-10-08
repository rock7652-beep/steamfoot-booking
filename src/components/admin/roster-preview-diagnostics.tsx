"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";

const Context = createContext(false);
export function RosterPreviewDiagnosticsProvider({ enabled, children }: { enabled: boolean; children?: ReactNode }) {
  const pathname = usePathname();
  const exactRoster = /^\/s\/staging\/admin\/dashboard\/bookings\/?$/.test(pathname ?? "");
  return <Context.Provider value={enabled && exactRoster}>{children}</Context.Provider>;
}

/** Never return arbitrary message text, stack frames, URLs, identifiers or user data. */
export function safeRosterErrorCode(message: unknown): string {
  if (typeof message !== "string") return "UNCLASSIFIED";
  const reactCode = message.match(/Minified React error #(\d{1,4})(?:\D|$)/)?.[1];
  if (reactCode) return `REACT_${reactCode}`;
  if (message.includes("Maximum update depth exceeded")) return "UPDATE_DEPTH";
  if (/Rendered (?:more|fewer) hooks/.test(message)) return "HOOK_ORDER";
  if (/Cannot read properties of (?:undefined|null)/.test(message)) return "NULL_PROPERTY";
  if (message.includes("is not a function")) return "NOT_CALLABLE";
  if (message.includes("is not iterable")) return "INVALID_LIST";
  if (message.includes("Invalid time value")) return "INVALID_DATE";
  if (message.includes("removeChild")) return "DOM_REMOVE_CHILD";
  return "UNCLASSIFIED";
}

export function useRosterPreviewErrorCode(error: Error): string | null {
  return useContext(Context) ? safeRosterErrorCode(error.message || "") : null;
}
