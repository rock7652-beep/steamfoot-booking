"use client";

import { CustomerLabels } from "@/components/customer-labels";
import { useId, useState } from "react";
import { ModalPanel } from "./modal-panel";
import { InlineRosterNoteEditor, type InlineRosterNote } from "./inline-roster-note";
import styles from "./roster-reminders.module.css";

/** Shared roster reminders: two lines, separate 44px actions, full text on demand. */
export function RosterReminders({ customerId, name, serviceNote, notes, canEdit, canEditNote = false, onOpen, onEdit, inlineNote, usualLabel = "店內", className = "", sports = false }: {
  customerId?: string;
  name: string;
  serviceNote?: string | null;
  notes?: string | null;
  canEdit: boolean;
  canEditNote?: boolean;
  onOpen?: () => void;
  onEdit?: () => void;
  inlineNote?: InlineRosterNote;
  usualLabel?: string;
  className?: string;
  sports?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const sessionNote = notes?.trim().replace(/\s+/g, " ");
  const usualNote = serviceNote?.trim().replace(/\s+/g, " ");
  return <><div className={`${styles.reminders} ${className}`} onClick={event => event.stopPropagation()} data-roster-reminders data-sports-roster-reminders={sports || undefined}>
    <button type="button" className={styles.overview} aria-label={`${name} 標籤與備註`} onClick={onOpen ?? (() => setOpen(true))}>
      <span className={styles.summaryLine}>
        {customerId ? <CustomerLabels customerId={customerId} displayOnly variant="summary" maxVisible={5} /> : <span className="text-earth-400">無標籤</span>}
      </span>
      <span className={styles.noteLine}>
        {sessionNote && <span className={`${styles.notePart} font-medium text-earth-900`}><span className={styles.noteSource}>本次<span className="sr-only">備註</span>：</span><span className={styles.noteText}>{sessionNote}</span></span>}
        {sessionNote && usualNote && <span aria-hidden="true" className="shrink-0 text-earth-300">｜</span>}
        {usualNote && <span className={`${styles.notePart} text-earth-600`}><span className={styles.noteSource}>{usualLabel}<span className="sr-only">備註</span>：</span><span className={styles.noteText}>{usualNote}</span></span>}
        {!sessionNote && !usualNote && <span className="text-earth-400">尚無備註</span>}
      </span>
    </button>
    <span className={styles.actionSlot}>
      {customerId && <CustomerLabels customerId={customerId} readOnly={!canEdit} iconOnly triggerLabel={`${name} ${canEdit ? "查看或修改" : "查看"}標籤`} />}
    </span>
    {inlineNote ? <InlineRosterNoteEditor key={inlineNote.scopeKey} name={name} value={notes ?? null} canEdit={canEditNote} config={inlineNote} /> : <span className={styles.actionSlot}>
      {canEditNote && onEdit && <button type="button" className={styles.iconAction} aria-label={`${name} 本次備註`} title={sessionNote ? "編輯本次備註" : "新增本次備註"} onClick={onEdit}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m15 4 5 5M4 20l4-1 12-12a2.1 2.1 0 0 0-3-3L5 16Z"/></svg>
        <span className="sr-only">{sessionNote ? "編輯本次備註" : "＋本次備註"}</span>
      </button>}
    </span>}
  </div>
    <ModalPanel open={open} onClose={() => setOpen(false)} labelledById={titleId} width={512}>
      <header className="flex items-center justify-between gap-3 border-b border-earth-100 px-4 py-2">
        <h3 id={titleId} className="min-w-0 break-words font-semibold">{name} · 標籤與備註</h3>
        <button type="button" className="min-h-11 shrink-0 rounded border border-earth-200 px-3 text-sm" onClick={() => setOpen(false)}>關閉</button>
      </header>
      <div className="min-h-0 space-y-4 overflow-y-auto p-4 text-sm">
        {customerId && <CustomerLabels customerId={customerId} readOnly={!canEdit} />}
        <div><h4 className="text-earth-500">{usualLabel}備註</h4><p className="whitespace-pre-wrap break-words">{serviceNote?.trim() || "尚無備註"}</p></div>
        <div><h4 className="text-earth-500">本次備註</h4><p className="whitespace-pre-wrap break-words">{notes?.trim() || "尚無備註"}</p></div>
        {canEditNote && onEdit && <button type="button" className="min-h-11 rounded border border-earth-200 px-3" onClick={() => { setOpen(false); onEdit(); }}>編輯本次備註</button>}
      </div>
    </ModalPanel>
  </>;
}
