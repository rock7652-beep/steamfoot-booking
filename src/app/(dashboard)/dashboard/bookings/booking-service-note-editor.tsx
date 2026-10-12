"use client";
import { RetainedNoteEditor } from "@/components/operations/retained-note-editor";
import { updateCustomerServiceNoteAction } from "@/server/actions/customer";
export function BookingServiceNoteEditor({ customerId, value, canEdit, onSaved, optimistic = false, compact = false }: {
  customerId: string; value: string | null; canEdit: boolean; onSaved: (value: string | null) => void;
  /** Customer drawers opt in; booking entry points keep their existing save flow. */
  optimistic?: boolean; compact?: boolean;
}) {
  return <RetainedNoteEditor key={customerId} stateKey={`customer-note:${customerId}`} title="店內備註" quiet={compact} hint={compact ? "" : "僅店內可見，每次服務都適用"}
    placeholder="例如：怕冷，請避開冷氣出風口" maxLength={1000} value={value} canEdit={canEdit} optimistic={optimistic}
    save={(serviceNote, expectedServiceNote) => updateCustomerServiceNoteAction({ customerId, serviceNote, expectedServiceNote })} onSaved={onSaved} />;
}
