"use client";
import { RetainedNoteEditor } from "@/components/operations/retained-note-editor";
import { updateBookingNoteAction } from "@/server/actions/booking-note";
export function BookingNoteEditor({ bookingId, value, canEdit, onSaved }: {
  bookingId: string; value: string | null; canEdit: boolean; onSaved: (value: string | null) => void;
}) {
  return <RetainedNoteEditor key={bookingId} stateKey={`booking-note:${bookingId}`} title="本次備註" hint="僅適用這次預約"
    placeholder="例如：今天會晚到 10 分鐘" tone="gold" maxLength={500} value={value} canEdit={canEdit}
    save={(notes, expectedNotes) => updateBookingNoteAction({ bookingId, notes, expectedNotes })} onSaved={onSaved} />;
}
