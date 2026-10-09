"use client";

import { CustomerLabels } from "@/components/customer-labels";
import styles from "./sports-roster.module.css";

/** Sports-only, two visual lines; each adjacent action owns a separate 44px target. */
export function SportsRosterReminders({ customerId, name, serviceNote, notes, canEdit, canEditNote, onOpen, onEdit }: {
  customerId?: string;
  name: string;
  serviceNote?: string | null;
  notes?: string | null;
  canEdit: boolean;
  canEditNote: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const sessionNote = notes?.trim().replace(/\s+/g, " ");
  const usualNote = serviceNote?.trim().replace(/\s+/g, " ");
  return <div className={styles.reminders} data-sports-roster-reminders>
    <button type="button" className={styles.overview} aria-label={`${name} 標籤與備註`} onClick={onOpen}>
      <span className={styles.summaryLine}>
        {customerId ? <CustomerLabels customerId={customerId} displayOnly variant="summary" maxVisible={5} /> : <span className="text-earth-400">無標籤</span>}
      </span>
      <span className={styles.noteLine}>
        {sessionNote && <span className={`${styles.notePart} font-medium text-earth-900`}><span className={styles.noteSource}>本次<span className="sr-only">備註</span>：</span><span className={styles.noteText}>{sessionNote}</span></span>}
        {sessionNote && usualNote && <span aria-hidden="true" className="shrink-0 text-earth-300">｜</span>}
        {usualNote && <span className={`${styles.notePart} text-earth-600`}><span className={styles.noteSource}>店內<span className="sr-only">備註</span>：</span><span className={styles.noteText}>{usualNote}</span></span>}
        {!sessionNote && !usualNote && <span className="text-earth-400">尚無備註</span>}
      </span>
    </button>
    <span className={styles.actionSlot}>
      {customerId && <CustomerLabels customerId={customerId} readOnly={!canEdit} iconOnly triggerLabel={`${name} ${canEdit ? "查看或修改" : "查看"}標籤`} />}
    </span>
    <span className={styles.actionSlot}>
      {canEditNote && <button type="button" className={styles.iconAction} aria-label={`${name} 本次備註`} title={sessionNote ? "編輯本次備註" : "新增本次備註"} onClick={onEdit}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m15 4 5 5M4 20l4-1 12-12a2.1 2.1 0 0 0-3-3L5 16Z"/></svg>
        <span className="sr-only">{sessionNote ? "編輯本次備註" : "＋本次備註"}</span>
      </button>}
    </span>
  </div>;
}
