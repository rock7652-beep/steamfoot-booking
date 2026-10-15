"use client";
import { useActionState } from "react";
import { testMusicPilotMonthly, type MonthlyPilotState } from "@/server/actions/music-pilot-monthly-test";
import { formatTWDateTime } from "@/lib/date-utils";
const initial:MonthlyPilotState={success:false,message:""};
export function MonthlyTest(){
  const [state,action,pending]=useActionState(testMusicPilotMonthly,initial);
  return <section className="min-w-0 rounded border p-3 text-sm space-y-3" aria-labelledby="monthly-test-title">
    <h2 id="monthly-test-title" className="font-semibold">月結與發薪・自動復原測試</h2>
    <p className="text-gray-600">使用十位學員的原價及老師費率，建立模擬課堂。2000 年 1 月僅用來隔開實際排課；舊薪資不重匯。測試結束自動復原，畫面保留本次結果，可重複執行。</p>
    <form action={action} className="flex flex-wrap items-center gap-3"><input type="hidden" name="confirmed" value="yes"/><button disabled={pending} className="min-h-11 rounded bg-green-700 px-4 text-white disabled:opacity-50">{pending?"正在驗證月結與發薪…":"執行月結與發薪測試"}</button><span>不轉帳，不留下測試支出</span></form>
    {state.message&&<p role="status" className={state.success?"text-green-800":"text-red-700"}>{state.message}</p>}
    {state.report&&<div className="space-y-3">
      <ul className="space-y-2 list-disc pl-5">{state.report.checks.map(c=><li key={c}>{c}</li>)}</ul>
      <div className="overflow-x-auto"><table className="w-full min-w-[480px]"><caption className="text-left font-medium py-2">模擬月結最終結果・五位老師</caption><thead><tr className="text-left border-b"><th className="p-2">老師</th><th>應付</th><th>已登錄</th><th>未付</th></tr></thead><tbody>{state.report.people.map(p=><tr key={p.name} className="border-b"><td className="p-2">{p.name}</td><td>{p.fee.toLocaleString()}</td><td>{p.paid.toLocaleString()}</td><td>{p.remaining.toLocaleString()}</td></tr>)}</tbody></table></div>
      <p>測試產生 {state.report.revisions} 版月結、{state.report.paymentCount} 筆付款（其中 {state.report.voidCount} 筆沖回）。支出 {state.report.expense.toLocaleString()} − 沖回 {state.report.reversal.toLocaleString()} ＝淨額 {(state.report.expense-state.report.reversal).toLocaleString()} 元。全部已復原。</p>
      <details><summary className="min-h-11 cursor-pointer font-medium flex items-center">查看模擬發薪與更正紀錄</summary><div className="overflow-x-auto"><table className="w-full min-w-[760px]"><thead><tr className="text-left border-b"><th className="p-2">老師／課堂</th><th>金額</th><th>狀態</th><th>登錄時間</th><th>備註／更正原因</th></tr></thead><tbody>{state.report.lines.flatMap(l=>l.payments.map(p=><tr key={p.id} className="border-b align-top"><td className="p-2">{l.name}<br/>{l.label}</td><td className="p-2">{p.amount}</td><td className="p-2">{p.voided?"已沖回":"已登錄"}</td><td className="p-2 whitespace-nowrap">{formatTWDateTime(new Date(p.date))}</td><td className="p-2">{p.reason??p.note}</td></tr>))}</tbody></table></div></details>
    </div>}
  </section>;
}
