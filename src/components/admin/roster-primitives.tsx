"use client";

import type { ReactNode } from "react";
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
    {customerId && <CustomerLabels customerId={customerId} readOnly={readOnly} hideEmpty maxVisible={5} variant="dots" />}
    {visible.length > 0 && (onOpen
      ? <button type="button" className="block w-full space-y-0.5 text-left focus-visible:outline-2 focus-visible:outline-primary-600" aria-label={`${name} 標籤與備註`} onClick={onOpen}>{content}</button>
      : <div className="space-y-0.5">{content}</div>)}
  </div>;
}
