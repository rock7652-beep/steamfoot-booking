"use client";
import {ReminderSettingRow} from "./reminder-settings-list";
import { useState } from "react";
import { NotificationSwitch } from "./notification-switch";
import { useSettingsPanelGuard } from "./settings-panel-context";
import { useReminderSettingMutation } from "@/app/(dashboard)/dashboard/reminders/reminder-setting-feedback";
import { setPlanActivationNotificationEnabled } from "@/server/actions/plan-activation-notification";
import { PlanActivationCardPreview } from "./plan-activation-card-preview";

const sampleCard = {storeName:"示範門市",customerName:"王小美",planName:"十堂方案",quantity:10,unit:"堂",expiresDate:"2027-01-31"};

export function PlanActivationNotificationSetting({storeId,initialEnabled,readOnly=false}:{storeId:string;initialEnabled:boolean;readOnly?:boolean}) {
  const [enabled,setEnabled]=useState(initialEnabled);
  const mutation=useReminderSettingMutation();
  useSettingsPanelGuard(false,mutation.pending);
  function change(next:boolean) {
    void mutation.run("toggle",()=>setPlanActivationNotificationEnabled({expectedStoreId:storeId,enabled:next}),()=>setEnabled(next),()=>{
      const previous=enabled;setEnabled(next);return ()=>setEnabled(previous);
    });
  }
  return <section aria-label="方案開通通知" className="min-w-0"><ReminderSettingRow title="方案開通通知" description="購買／續購開通後通知購買人；待核帳訂單於開通後通知" pending={mutation.pending} error={mutation.toggleError} action="預覽" control={<NotificationSwitch aria-label="方案開通通知開關" checked={enabled} disabled={readOnly||mutation.pending} onChange={e=>change(e.target.checked)}/> }>
    <p className="mb-3 text-sm text-earth-500">示範資料，不會發送。啟用後不補發歷史購買；共用成員不另外通知。</p>
    <PlanActivationCardPreview value={sampleCard}/>
  </ReminderSettingRow></section>;
}
