"use client";
import {useState,useTransition} from "react";
import {setCourseBalanceReminderPreference} from "@/server/actions/course-reminder-preference";
export function BalanceReminderPreference({initialStopped}:{initialStopped:boolean}) {
  const [stopped,setStopped]=useState(initialStopped),[message,setMessage]=useState("");
  const [pending,start]=useTransition();
  return <section className="space-y-4 rounded-xl border border-earth-200 bg-white p-4">
    <h1 className="text-lg font-semibold text-primary-900">低可用額度提醒</h1>
    <p className="text-sm text-earth-700">只設定您在本店收到的點數／堂數卡低可用額度提醒；不影響預約通知，也不改變其他共卡成員的接收設定。</p>
    <p className="font-medium">{stopped?"目前已停止接收":"目前可接收店家已啟用的提醒"}</p>
    <button disabled={pending} className="min-h-11 rounded-lg bg-primary-700 px-4 text-white disabled:opacity-50" onClick={()=>start(async()=>{
      setMessage("儲存中…");try {const next=!stopped,result=await setCourseBalanceReminderPreference(next);if(result.success){setStopped(next);setMessage(next?"已停止此類提醒":"已恢復接收；已發送的提醒不會重複發送");}else setMessage(result.error);}catch{setMessage("儲存失敗，請重試");}
    })}>{pending?"儲存中…":stopped?"恢復接收":"不再接收此類訊息"}</button>
    <p role="status" className="text-sm text-primary-800">{message}</p>
  </section>;
}
