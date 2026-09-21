"use client";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import {useState,useTransition} from "react";
import {saveCourseLowBalanceSetting} from "@/server/actions/course-low-balance";
import {courseLowBalanceBody} from "@/lib/course-low-balance";
import {LineCardPreview} from "../../reminders/line-card-preview";
type Plan={id:string;name:string;unit:string;isActive:boolean;lowBalanceEnabled:boolean;lowBalanceThreshold:number|null};
function PlanReminder({plan}:{plan:Plan}) {
  const [threshold,setThreshold]=useState(plan.lowBalanceThreshold?.toString()??"");
  const [enabled,setEnabled]=useState(plan.lowBalanceEnabled);
  const [saved,setSaved]=useState({enabled:plan.lowBalanceEnabled,threshold:plan.lowBalanceThreshold});
  const [message,setMessage]=useState("");
  const [pending,start]=useTransition();
  useSettingsPanelGuard(enabled !== saved.enabled || threshold !== (saved.threshold?.toString() ?? ""), pending);
  const unit=plan.unit==="SESSION"?"堂":"點";
  return <details className={`rounded-xl border border-earth-200 bg-white ${plan.isActive?"":"opacity-60"}`}>
    <summary className="cursor-pointer p-4"><span className="font-medium text-primary-900">{plan.name}</span><span className="ml-2 text-sm text-earth-600">{plan.isActive?"":"下架 · "}{saved.enabled?`可用 ≤ ${saved.threshold} ${unit}`:"未啟用"}</span></summary>
    <form className="space-y-3 border-t border-earth-100 p-4" onSubmit={event=>{event.preventDefault();start(async()=>{
      setMessage("儲存中…");
      try {const result=await saveCourseLowBalanceSetting({planId:plan.id,enabled,threshold:threshold===""?null:Number(threshold)});if(result.success) setSaved({enabled,threshold:threshold===""?null:Number(threshold)});setMessage(result.success?"已儲存":result.error);}catch{setMessage("儲存失敗，已保留輸入內容，請重試");}
    });}}>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={enabled} disabled={pending} onChange={event=>setEnabled(event.target.checked)}/>啟用此方案低可用額度提醒</label>
      <label className="block text-sm">可用額度低於或等於<input aria-label={`${plan.name} 提醒門檻`} type="number" min="0" max="1000000" step="1" required={enabled} value={threshold} disabled={pending} onChange={event=>setThreshold(event.target.value)} className="mx-2 min-h-11 w-24 rounded border border-earth-300 px-3"/>{unit}</label>
      <details className="text-sm text-earth-600"><summary className="min-h-11 cursor-pointer py-3 text-primary-700">額度計算與提醒頻率</summary><p>每張卡分開判斷，使用剩餘扣除預約占用後的額度。每卡對同一位成員提醒一次；取消重約不重複提醒。未設定門檻時不會自動啟用。</p></details>
      <details><summary className="cursor-pointer text-sm text-primary-700">訊息預覽（示意資料）</summary><div className="mt-3"><LineCardPreview title="方案可用額度提醒" subtitle="示意資料，非真實發送" actions={[{label:"查看我的方案",variant:"primary"},{label:"停止／管理此類提醒",variant:"link"}]}>{courseLowBalanceBody(plan.name,5,3,plan.unit)}</LineCardPreview></div></details>
      <p role="status" className="text-sm text-primary-800">{message}</p>
      <button disabled={pending} className="min-h-11 rounded-lg bg-primary-700 px-4 text-white disabled:opacity-50">{pending?"儲存中…":"儲存設定"}</button>
    </form>
  </details>;
}
export function CourseLowBalanceSettings({plans}:{plans:Plan[]}) {
  return <section aria-labelledby="course-low-balance-title" className="space-y-3"><h2 id="course-low-balance-title" className="font-semibold text-primary-900">低可用額度提醒</h2>{plans.length?plans.map(plan=><PlanReminder key={plan.id} plan={plan}/>):<p className="text-sm text-earth-600">建立點數／堂數方案後，可在此逐一設定提醒。</p>}</section>;
}
