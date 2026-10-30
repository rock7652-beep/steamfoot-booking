"use client";
import {ReminderSettingRow} from "./reminder-settings-list";
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
  return <section aria-label="工單取件提醒" className="min-w-0"><ReminderSettingRow title="工單取件提醒" description="轉為待取件時通知已確認本店 LINE 的顧客，不補發舊工單" pending={busy} error={error} action="預覽" control={<NotificationSwitch aria-label="工單取件提醒開關" checked={enabled} disabled={busy} onChange={e=>change(e.target.checked)}/> }><p className="mb-3 text-sm text-earth-500">示範資料，不會發送。</p><div className="whitespace-pre-wrap break-words rounded-lg bg-white p-4">{workOrderReadyMessage({storeName:"示範門市",number:"WO-001",phone:"02-1234-5678",address:"示範門市地址"})}</div></ReminderSettingRow></section>;
}
