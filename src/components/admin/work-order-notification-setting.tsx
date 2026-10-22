"use client";
import { useState } from "react";
import { useReminderSettingMutation } from "@/app/(dashboard)/dashboard/reminders/reminder-setting-feedback";
import { NotificationSwitch } from "./notification-switch";
import { setWorkOrderNotificationEnabled } from "@/server/actions/work-order-notification";
import { useSettingsPanelGuard } from "./settings-panel-context";
import { workOrderReadyMessage } from "@/lib/work-order-ready-notification";

export function WorkOrderNotificationSetting({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const mutation = useReminderSettingMutation();
  const busy = mutation.pending;
  const error = mutation.toggleError;
  useSettingsPanelGuard(false, busy);
  function change(next: boolean) {
    void mutation.run("toggle", () => setWorkOrderNotificationEnabled(next), () => setEnabled(next), () => {
      const previous = enabled;
      setEnabled(next);
      return () => setEnabled(previous);
    });
  }
  return <section aria-label="工單取件提醒" className="space-y-2 rounded-lg border border-earth-200 p-4 text-sm"><label className="flex min-h-11 flex-wrap items-center justify-between gap-3"><span className="font-semibold">工單取件提醒・{busy ? "儲存中…" : enabled ? "開啟" : "關閉"}</span><NotificationSwitch checked={enabled} disabled={busy} onChange={e => void change(e.target.checked)} /></label><p className="text-earth-600">轉為待取件時通知顧客，不補發舊工單。</p><details className="rounded-lg border border-earth-200"><summary className="min-h-11 cursor-pointer px-3 py-2.5 font-medium text-primary-700">查看訊息預覽</summary><div className="space-y-3 border-t border-earth-100 p-3"><p className="text-earth-500">示範資料，不會發送。</p><div className="whitespace-pre-wrap break-words rounded-lg bg-earth-50 p-4">{workOrderReadyMessage({ storeName: "示範門市", number: "WO-001", phone: "02-1234-5678", address: "示範門市地址" })}</div><p className="text-earth-500">僅發給已確認本店 LINE 的顧客。</p></div></details>{error && <p role="alert" className="break-words text-red-700">{error}</p>}</section>;
}
