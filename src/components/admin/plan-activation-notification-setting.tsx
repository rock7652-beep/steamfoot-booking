"use client";
import { useState } from "react";
import { NotificationSwitch } from "./notification-switch";
import { useSettingsPanelGuard } from "./settings-panel-context";
import { useReminderSettingMutation } from "@/app/(dashboard)/dashboard/reminders/reminder-setting-feedback";
import { setPlanActivationNotificationEnabled } from "@/server/actions/plan-activation-notification";
import { planActivationMessage } from "@/lib/plan-activation-notification";

export function PlanActivationNotificationSetting({storeId,initialEnabled,readOnly=false}:{storeId:string;initialEnabled:boolean;readOnly?:boolean}) {
  const [enabled,setEnabled]=useState(initialEnabled);
  const mutation=useReminderSettingMutation();
  useSettingsPanelGuard(false,mutation.pending);
  function change(next:boolean) {
    void mutation.run("toggle",()=>setPlanActivationNotificationEnabled({expectedStoreId:storeId,enabled:next}),()=>setEnabled(next),()=>{
      const previous=enabled;setEnabled(next);return ()=>setEnabled(previous);
    });
  }
  return <section aria-label="方案開通通知" className="min-w-0 space-y-2 rounded-xl border border-earth-200 bg-white p-4 text-sm">
    <label className="flex min-h-11 flex-wrap items-center justify-between gap-3">
      <span className="font-semibold text-earth-900">方案開通通知・{mutation.pending?"儲存中…":enabled?"開啟":"關閉"}</span>
      <NotificationSwitch aria-label="方案開通通知開關" checked={enabled} disabled={readOnly||mutation.pending} onChange={e=>change(e.target.checked)}/>
    </label>
    <p className="text-earth-600">購買或續購方案開通後，自動以 LINE 通知購買人。待核帳訂單於核帳開通後通知。</p>
    <p className="text-earth-500">啟用後不補發歷史購買；共用成員不另外通知。沿用本店 LINE 提醒額度。</p>
    <details className="min-w-0 rounded-lg border border-earth-200">
      <summary className="min-h-11 cursor-pointer px-3 py-2.5 font-medium text-primary-700">查看訊息預覽</summary>
      <div className="space-y-2 border-t border-earth-100 p-3">
        <p className="text-earth-500">示範資料，不會發送。</p>
        <div className="whitespace-pre-wrap break-words rounded-lg bg-earth-50 p-4">{planActivationMessage({storeName:"示範門市",customerName:"王小美",planName:"十堂方案",quantity:10,unit:"堂",expiresDate:"2027-01-31"})}</div>
      </div>
    </details>
    {mutation.toggleError&&<p role="alert" className="break-words text-red-700">{mutation.toggleError}</p>}
  </section>;
}
