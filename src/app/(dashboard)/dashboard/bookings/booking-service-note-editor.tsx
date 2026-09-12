"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateCustomerServiceNoteAction } from "@/server/actions/customer";

export function BookingServiceNoteEditor({ customerId, value, canEdit, onSaved }: {
  customerId: string;
  value: string | null;
  canEdit: boolean;
  onSaved: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [savedValue, setSavedValue] = useState(value);
  const [previousValue, setPreviousValue] = useState(value);
  if (previousValue !== value) {
    setPreviousValue(value);
    setSavedValue(value);
    if (!editing) setDraft(value ?? "");
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const result = await updateCustomerServiceNoteAction({ customerId, serviceNote: draft.trim() || null });
      if (!result.success) {
        toast.error(result.error ?? "儲存失敗，請重試");
        return;
      }
      setSavedValue(draft.trim() || null);
      setEditing(false);
      toast.success("已儲存店內備註");
      onSaved(draft.trim() || null);
    } catch {
      toast.error("儲存失敗，內容已保留，請重試");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="steamfoot-brand-green-accent col-span-2 rounded-xl border px-3 py-2.5">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary-600" aria-hidden="true" />
          <p className="text-sm font-semibold text-primary-800">{!editing && !savedValue?.trim() ? "尚無店內備註" : "店內備註"}</p>
        </div>
        {canEdit && !editing && (
          <button type="button" className="min-h-11 rounded-lg px-3 text-sm font-semibold text-primary-700 hover:bg-primary-100/70" onClick={() => {
            setDraft(savedValue ?? "");
            setEditing(true);
          }}>{savedValue?.trim() ? "編輯" : "＋新增"}</button>
        )}
      </div>
      {(editing || savedValue?.trim()) && <p className="mb-2 text-xs text-earth-500">僅店內可見，每次服務都適用</p>}
      {editing && canEdit ? (
        <div className="space-y-2">
          <textarea aria-label="店內備註" value={draft} onChange={(event) => setDraft(event.target.value)}
            maxLength={1000} rows={4} disabled={saving}
            className="w-full rounded-lg border border-primary-200 bg-white p-3 text-base leading-relaxed shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
            placeholder="例如：怕冷，請避開冷氣出風口" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-earth-500">{draft.length} / 1000 字</span>
            <div className="flex gap-2">
              <button type="button" disabled={saving} onClick={() => setEditing(false)} className="min-h-11 rounded-lg border border-earth-300 bg-white px-4 text-sm text-earth-700 hover:bg-earth-50 disabled:opacity-50">取消</button>
              <button type="button" disabled={saving} onClick={save} className="min-h-11 rounded-lg bg-primary-700 px-4 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-50">{saving ? "儲存中…" : "儲存"}</button>
            </div>
          </div>
        </div>
      ) : savedValue?.trim() ? (
        <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-earth-800">{savedValue}</p>
      ) : null}

    </div>
  );
}