"use client";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { DashboardLink } from "@/components/dashboard-link";
import type { CourseBusinessReport } from "@/server/queries/course-business-analytics";
type Segment = keyof CourseBusinessReport["counts"];
const names: Record<Segment,string> = {trial:"體驗人數",newCard:"新卡人數",renewal:"續卡人數",converted:"本期體驗開卡",unconverted:"體驗未開卡",tracked:"過往體驗追蹤開卡",visitors:"實際上課人數"};
export function BusinessAnalyticsView({data,all,staffId}:{data:CourseBusinessReport;all:boolean;staffId?:string|null}) {
  const router=useRouter(),search=useSearchParams();
  const [pending,start]=useTransition();
  const [segment,setSegment]=useState<Segment|null>(null),[keyword,setKeyword]=useState(""),[page,setPage]=useState(1);
  const [metric,setMetric]=useState<"trial"|"newCard"|"renewal"|"revenue">("trial");
  const coach=data.scope.view==="coach";
  function navigate(view:string,person:string) {const params=new URLSearchParams(search.toString());params.set("perspective",view);params.set("person",person);start(()=>router.push(`?${params}`));}
  function show(value:Segment) {setSegment(segment===value?null:value);setKeyword("");setPage(1);}
  const people=data.staff.filter(s=>(all||s.id===staffId)&&(coach?s.courseCoachEnabled||s.id===data.scope.person:s.user.role!=="CUSTOMER"||s.id===data.scope.person));
  const rows=segment?(data.segments?.[segment]??[]).filter(p=>p.name.toLocaleLowerCase().includes(keyword.trim().toLocaleLowerCase())):[];
  const pages=Math.max(1,Math.ceil(rows.length/10));
  const metricCard=(key:Segment)=><button key={key} type="button" disabled={!data.segments||pending} aria-expanded={segment===key} onClick={()=>show(key)} className="min-h-24 rounded-xl border border-earth-200 bg-white p-4 text-left enabled:hover:border-primary-500"><span className="text-sm text-earth-600">{names[key]}</span><strong className="mt-2 block text-2xl text-primary-900">{data.counts[key]} <span className="text-sm font-normal">人</span></strong>{data.segments&&<span className="mt-1 block text-xs text-primary-700">查看名單</span>}</button>;
  return <div className="space-y-4" aria-busy={pending}>
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="分析對象">
      {([['store','店家'],['manager','直屬店長'],['coach','教練']] as const).filter(([v])=>all||v!=="store").map(([v,label])=><button key={v} disabled={pending} aria-pressed={data.scope.view===v} onClick={()=>navigate(v,all?"all":staffId!)} className={`min-h-11 rounded-lg border px-4 text-sm ${data.scope.view===v?"bg-primary-700 text-white":"bg-white text-earth-700"}`}>{label}</button>)}
      {data.scope.view!=="store"&&<select aria-label={coach?"選擇教練":"選擇直屬店長"} disabled={pending} value={data.scope.person} onChange={e=>navigate(data.scope.view,e.target.value)} className="min-h-11 max-w-full rounded-lg border bg-white px-3 text-sm">
        {all&&<option value="all">{coach?"全部教練":"全部直屬店長"}</option>}{people.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}{all&&!coach&&<option value="unassigned">未歸屬</option>}
      </select>}
      {pending&&<span role="status" className="text-sm text-earth-500">更新分析中…</span>}
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {metricCard("trial")}
      {coach?<><Summary label="實際授課" value={`${data.sessions} 堂`} note={`${data.hours.toFixed(1)} 小時`}/><Summary label="出席人次" value={`${data.attendance} 人次`}/><Summary label="應計授課費" value={data.fee===null?"無檢視權限":`NT$ ${data.fee.toLocaleString()}`} note={data.missingFees?`${data.missingFees} 堂費率待核對，未計入` : "依已結束且有出席課次的固定費率"}/></>:<>{metricCard("newCard")}{metricCard("renewal")}<button disabled={!data.segments||pending} onClick={()=>show("converted")} className="min-h-24 rounded-xl border border-earth-200 bg-white p-4 text-left"><span className="text-sm text-earth-600">體驗開卡率</span><strong className="mt-2 block text-2xl text-primary-900">{data.conversionRate===null?"—":`${data.conversionRate.toFixed(1)}%`}</strong><span className="mt-1 block text-xs text-earth-500">{data.counts.converted} / {data.eligibleTrials} 位新客體驗者</span></button></>}
    </div>
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-white px-4 py-3 text-sm">
      {!coach&&<span>收款淨額 <strong>{data.netRevenue===null?"無檢視權限":`NT$ ${data.netRevenue.toLocaleString()}`}</strong></span>}
      {data.scope.view==="manager"&&<span>方案利潤 <strong>{data.profit===null?"無檢視權限":`NT$ ${data.profit.toLocaleString()}`}</strong>{data.missingProfit>0&&<span className="ml-2 text-amber-700">{data.missingProfit} 筆待核對，未計入</span>}</span>}
      {(["unconverted","tracked","visitors"] as Segment[]).map(key=><button key={key} disabled={!data.segments||pending} className="min-h-11 text-primary-700 underline disabled:no-underline" onClick={()=>show(key)}>{names[key]} {data.counts[key]} 人</button>)}
    </div>
    {segment&&data.segments&&<section className="rounded-xl border border-primary-200 bg-white p-4" aria-label={`${names[segment]}名單`}>
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{names[segment]}（{data.counts[segment]} 人）</h2><button className="min-h-11 px-3 text-sm" onClick={()=>setSegment(null)}>關閉名單</button></div>
      <input aria-label="搜尋名單" placeholder="搜尋顧客姓名" value={keyword} onChange={e=>{setKeyword(e.target.value);setPage(1);}} className="mb-2 min-h-11 w-full rounded-lg border px-3"/>
      <ul className="divide-y">{rows.slice((page-1)*10,page*10).map(p=><li key={p.id}><DashboardLink className="block min-h-11 py-3 text-sm text-primary-700" href={`/dashboard/courses?view=customers&customerId=${encodeURIComponent(p.id)}`}>{p.name}</DashboardLink></li>)}</ul>
      {!rows.length&&<p className="py-3 text-sm text-earth-500">沒有符合條件的顧客。</p>}
      {pages>1&&<div className="flex items-center justify-end gap-3 text-sm"><button className="min-h-11 px-3" disabled={page===1} onClick={()=>setPage(page-1)}>上一頁</button><span>{page} / {pages}</span><button className="min-h-11 px-3" disabled={page===pages} onClick={()=>setPage(page+1)}>下一頁</button></div>}
    </section>}
    <section className="rounded-xl border bg-white p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">本期趨勢</h2><select aria-label="趨勢指標" value={metric} onChange={e=>setMetric(e.target.value as typeof metric)} className="min-h-11 rounded-lg border px-3"><option value="trial">體驗人數</option><option value="newCard">{coach?"體驗後新卡":"新卡人數"}</option>{!coach&&<option value="renewal">續卡筆數</option>}{data.netRevenue!==null&&<option value="revenue">收款淨額</option>}</select></div>
      {data.trend.length?<div className="h-56 min-w-0"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.trend}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date" tickFormatter={v=>v.slice(5)} minTickGap={24}/><YAxis allowDecimals={false}/><Tooltip/><Line type="linear" dataKey={metric} name={metric==="trial"?"體驗人數":metric==="newCard"?"新卡人數":metric==="revenue"?"收款淨額":"續卡筆數"} stroke="#427663" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div>:<p className="py-8 text-center text-sm text-earth-500">本期尚無體驗或開卡紀錄。</p>}
    </section>
    {coach&&<details className="rounded-xl border bg-white p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">體驗後開卡成果</summary><p className="my-2 text-sm text-earth-600">歸給首次付費前最後一次完成體驗的授課教練，供教學追蹤；成交業績仍歸直屬店長。</p><div className="grid grid-cols-2 gap-3">{metricCard("newCard")}{metricCard("converted")}</div></details>}
    {!coach&&<details className="rounded-xl border bg-white p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">授課明細</summary><p className="py-2 text-sm">實際授課 {data.sessions} 堂 · {data.hours.toFixed(1)} 小時 · 出席 {data.attendance} 人次</p></details>}
    <details className="text-sm text-earth-600"><summary className="min-h-11 cursor-pointer py-3">統計方式與歸屬</summary><div className="space-y-2 pb-3"><p>體驗依完成出席計算並按人去重；新卡為首次付費方案，續卡為後續付費方案。免費指派、共卡加入與全額退款不算成交。新卡與續卡可能是同一人，本期人數不可直接相加。</p><p>體驗開卡率只計同批首次購買前的體驗者；追蹤開卡歸實際購買月份，另列過往體驗。沒有體驗者時顯示 —。</p><p>直屬店長的體驗與上課依顧客目前歸屬；成交依購買時快照，未指定列未歸屬，不使用核帳人代替。教練依課次授課紀錄。角色數字不可重複加總。</p><p>收款包含方案及體驗收款，扣除當期退款／沖銷；不重複加總現金帳。方案利潤依成交快照，部分退款或缺少快照列待核對。授課費依每堂固定費率，缺少費率另列待核對。</p></div></details>
  </div>;
}
function Summary({label,value,note}:{label:string;value:string;note?:string}) {return <div className="min-h-24 rounded-xl border border-earth-200 bg-white p-4"><p className="text-sm text-earth-600">{label}</p><strong className="mt-2 block text-2xl text-primary-900">{value}</strong>{note&&<p className="mt-1 text-xs text-earth-500">{note}</p>}</div>;}
