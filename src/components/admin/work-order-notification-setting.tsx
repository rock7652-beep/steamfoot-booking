"use client";
import { useRef, useState } from "react";
import { NotificationSwitch } from "./notification-switch";
import { setWorkOrderNotificationEnabled } from "@/server/actions/work-order-notification";

export function WorkOrderNotificationSetting({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  async function change(next: boolean) {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const result = await setWorkOrderNotificationEnabled(next);
      if (result.success) setEnabled(next); else setError(result.error);
    } catch { setError("目前無法儲存，請稍後再試"); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <section className="space-y-2 rounded-lg border border-earth-200 p-4 text-sm"><label className="flex min-h-11 flex-wrap items-center justify-between gap-3"><span className="font-semibold">工單待取件 LINE 通知・{busy ? "儲存中…" : enabled ? "開啟" : "關閉"}</span><NotificationSwitch checked={enabled} disabled={busy} onChange={e => void change(e.target.checked)} /></label><p className="text-earth-600">只通知開啟後首次轉為待取件、且已確認本店 LINE 的工單；不補發舊工單。</p>{error && <p role="alert" className="break-words text-red-700">{error}</p>}</section>;
}
