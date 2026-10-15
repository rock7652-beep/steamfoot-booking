"use client";
import { useState } from "react";
import { DashboardLink } from "@/components/dashboard-link";
import type { MusicPilotSalaryReport } from "@/server/queries/music-pilot-salary";
type Scenario="LIVE"|"ATTEND"|"LEAVE"|"NO_SHOW"|"TEACHER_LEAVE";
const money=(n:number|null)=>n===null?"待點名／核對":new Intl.NumberFormat("zh-TW").format(n)+" 元";
export function SalaryPreview({rows}:{rows:MusicPilotSalaryReport["rows"]}){
  const [search,setSearch]=useState("");const [teacher,setTeacher]=useState("");const [states,setStates]=useState<Record<string,Scenario>>({});
  const shown=rows.filter(r=>(!teacher||r.teacher===teacher)&&(!search||`${r.students} ${r.teacher} ${r.date} ${r.name}`.includes(search)));
  const total=shown.reduce((n,r)=>n+(r.scenarios.ATTEND.amount??0),0);
  return <><div className="flex flex-wrap items-end gap-3 text-sm"><label>搜尋學生／日期<input aria-label="搜尋薪資樣本" value={search} onChange={e=>setSearch(e.target.value)} className="block min-h-11 w-64 max-w-full rounded border px-3"/></label><label>老師<select aria-label="篩選樣本老師" value={teacher} onChange={e=>setTeacher(e.target.value)} className="block min-h-11 rounded border px-3"><option value="">全部老師</option>{[...new Set(rows.map(r=>r.teacher))].map(t=><option key={t}>{t}</option>)}</select></label><p>{shown.length} 堂・全部出席預估 {money(total)}{shown.some(r=>r.scenarios.ATTEND.amount===null)&&"（含待核對課堂，不完整）"}</p></div>
    <p className="text-sm text-gray-600">「出勤試算」不改點名或堂數。實際點名後重新讀取可看目前鐘點；正式月結只納入已結束課堂，試算不代表已發薪。</p>
    <div className="max-w-full overflow-x-auto rounded border"><table className="min-w-[960px] w-full text-left text-sm"><thead className="bg-gray-50"><tr>{["課堂","老師／比例","學員","目前點名鐘點","出勤試算","結果","操作"].map(t=><th key={t} className="p-3 font-medium">{t}</th>)}</tr></thead><tbody>{shown.map(r=>{
      const selected=states[r.id]??"ATTEND",result=r.scenarios[selected];
      return <tr key={r.id} className="border-t align-top"><td className="p-3 whitespace-nowrap">{r.dateTime}<p className="text-gray-500">{r.name}・{r.future?"未結束":"已結束"}</p></td><td className="p-3">{r.teacher}<p>{r.rate}</p></td><td className="p-3 max-w-64">{r.students}</td><td className="p-3">{money(r.scenarios.LIVE.amount)}{r.scenarios.LIVE.issue&&<p className="text-gray-500">{r.scenarios.LIVE.issue}</p>}</td><td className="p-3"><select aria-label={`${r.dateTime} ${r.teacher} 出勤試算`} value={selected} onChange={e=>setStates(v=>({...v,[r.id]:e.target.value as Scenario}))} className="min-h-11 rounded border px-2"><option value="ATTEND">全部待點名者出席</option><option value="LEAVE">{r.firstStudent} 請假</option><option value="NO_SHOW">{r.firstStudent} 曠課</option><option value="TEACHER_LEAVE">老師請假</option><option value="LIVE">目前點名狀態</option></select></td><td className="p-3"><strong aria-live="polite">{money(result.amount)}</strong>{result.issue&&<p>{result.issue}</p>}<details><summary className="min-h-11 cursor-pointer py-3">計算明細</summary>{result.details.length?result.details.map(d=><p key={d.id}>{d.name}：{d.base??"待核對"} → {money(d.amount)}・{d.reason}</p>):<p>本狀態尚無可計酬學員</p>}</details></td><td className="p-3"><DashboardLink className="inline-flex min-h-11 items-center underline" href={`/dashboard/courses?date=${r.date}&action=booking&session=${r.id}`}>查看課堂／點名</DashboardLink></td></tr>;
    })}</tbody></table></div></>;
}
