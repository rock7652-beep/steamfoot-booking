"use client";
import {useState,useTransition} from "react";
import {setCourseBalanceReminderPreference,setCourseTrialCarePreference} from "@/server/actions/course-reminder-preference";
export function BalanceReminderPreference({initialStopped,trialCare=false,beauty=false,savePreference}:{initialStopped:boolean;trialCare?:boolean;beauty?:boolean;savePreference?:(stopped:boolean)=>Promise<{success:boolean;error?:string}>}) {
  const [stopped,setStopped]=useState(initialStopped),[message,setMessage]=useState("");
  const [pending,start]=useTransition();
  return <section className="space-y-4 rounded-xl border border-earth-200 bg-white p-4">
    <h1 className="text-lg font-semibold text-primary-900">{trialCare?"體驗後關懷":beauty?"方案剩餘／用完與到期提醒":"低可用額度／用完提醒"}</h1>
    <p className="text-sm text-earth-700">{trialCare?"只設定您在本店收到的體驗後關懷與方案邀請，不影響預約通知。":beauty?"只設定本店方案剩餘、用完與到期提醒；不影響預約通知或其他共用成員。":"只設定本店方案的低額度與用完提醒；不影響預約通知或其他共卡成員。"}</p>
    <p className="font-medium">{stopped?"目前已停止接收":"目前可接收店家已啟用的提醒"}</p>
    <button disabled={pending} className="min-h-11 rounded-lg bg-primary-700 px-4 text-white disabled:opacity-50" onClick={()=>start(async()=>{
      setMessage("儲存中…");try {const next=!stopped,result=await (savePreference??(trialCare?setCourseTrialCarePreference:setCourseBalanceReminderPreference))(next);if(result.success){setStopped(next);setMessage(next?"已停止此類提醒":"已恢復接收；已發送的提醒不會重複發送");}else setMessage(result.error??"儲存失敗");}catch{setMessage("儲存失敗，請重試");}
    })}>{pending?"儲存中…":stopped?"恢復接收":"不再接收此類訊息"}</button>
    <p role="status" className="text-sm text-primary-800">{message}</p>
  </section>;
}
