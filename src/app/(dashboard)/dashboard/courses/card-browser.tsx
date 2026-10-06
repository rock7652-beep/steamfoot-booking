"use client";
import { CourseCardReservations } from "./card-reservations";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { useEffect, useState } from "react";
import { browseCourseCards } from "@/server/actions/course-browse";
import { toLocalDateStr } from "@/lib/date-utils";
import { courseBalanceText, type CourseBalanceTotal } from "@/lib/course-balance-summary";
import type { CourseCardView } from "./member-workspace";
export type CardBrowseState = { search: string; history: boolean; page: number };
export function CourseCardBrowser({ customerId, state, onChange, onSelect, revision=0, canReadBookings=false }: {
  canReadBookings?:boolean; customerId?: string; state:CardBrowseState;onChange:(state:CardBrowseState)=>void;
  onSelect:(card:CourseCardView)=>void;revision?:number;
}) {
  const detailReader = usePanelReader("course-card", browseCourseCards);
  const [retry,setRetry]=useState(0);
  const [result,setResult]=useState<{key:string;customerId?:string;rows:CourseCardView[];hasMore:boolean;totals?:CourseBalanceTotal[];error?:string}|null>(null);
  const key=JSON.stringify([customerId,state,revision,retry]);
  useEffect(()=>{
    let active=true;
    const timer=setTimeout(()=>{browseCourseCards({customerId,...state}).then(r=>{
      if(active)setResult(r.success ? {key,customerId,rows:r.rows,hasMore:r.hasMore,totals:r.totals} : {key,customerId,rows:[],hasMore:false,error:r.error});
    }).catch(()=>{if(active)setResult({key,customerId,rows:[],hasMore:false,error:"讀取失敗，請重試"});});},200);
    return ()=>{active=false;clearTimeout(timer);};
  },[customerId,state,key]);
  const ready=result?.key===key;
  const visible=result?.customerId===customerId?result:null;
  return <section className="space-y-3">
    {customerId && ready && visible?.totals && <div aria-label="有效方案合計" className="space-y-1 rounded-lg bg-primary-50 px-3 py-2 text-sm"><p className="font-semibold">有效方案合計 · {visible.totals.reduce((sum,total)=>sum+total.count,0)} 個</p><p>{courseBalanceText(visible.totals)}</p><p className="text-earth-600">共卡為共同餘額；各方案期限與適用課程分開計算。</p></div>}
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label="搜尋持有方案或共卡成員" className="min-h-11 min-w-0 flex-1 rounded-lg border border-earth-200 bg-white px-3 text-base" placeholder="搜尋方案／共卡成員" value={state.search} onChange={e=>onChange({...state,search:e.target.value,page:0})}/>
      <select aria-label="方案效期" className="min-h-11 rounded-lg border border-earth-200 bg-white px-2 text-sm" value={state.history ? "history":"active"} onChange={e=>onChange({...state,history:e.target.value==="history",page:0})}><option value="active">有效方案</option><option value="history">已到期／停用</option></select>
    </div>
    {!ready && <p role="status">更新中…</p>}
    {ready && result?.error ? <p role="alert">{result.error}<button className="min-h-11 px-3" onClick={()=>setRetry(n=>n+1)}>重試</button></p> : <fieldset disabled={!ready} className={!ready?"opacity-60":""}>
      <div className="divide-y divide-earth-100 bg-white">

        {visible?.rows.map(c=>{
          const unit=c.unit==="SESSION"?"堂":"點";
          const inactive=c.closed||c.expired;
          const status=c.closed?"已停用":c.expired?"已到期":c.remaining>0&&c.available===0&&c.held>=c.remaining?"額度已全數預約":c.remaining===0?"額度已用完":null;
          return <div key={c.id} className="px-3 py-2 text-sm">
            <button type="button" onPointerEnter={()=>detailReader.prefetch({cardId:c.id})} onFocus={()=>detailReader.prefetch({cardId:c.id})} onTouchStart={()=>detailReader.prefetch({cardId:c.id})} onClick={()=>onSelect(c)} className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-left">
              <span className="min-w-0 break-words font-medium">{c.name}</span><span className="whitespace-nowrap font-semibold">{inactive?status:c.unit==="SESSION"?`還可預約 ${c.available} 堂`:`可用 ${c.available} 點`}</span>
              <span className="min-w-0 break-words text-xs text-earth-500">{c.members.length>1?`共同餘額 · 共卡人：${c.members.map(m=>m.name).join("、")}`:`持有人：${c.members[0]?.name??"未設定"}`}</span><span className="text-xs text-earth-500">{c.musicValidityDays && !c.musicActivatedAt ? `首次上課起 ${c.musicValidityDays} 天` : `${toLocalDateStr(new Date(c.expiresAt))} 到期`}</span>
            </button>
            <div className="flex flex-wrap items-center gap-x-3 text-earth-600"><span>{inactive?"紀錄剩餘":"剩餘"} {c.remaining} {unit}</span>{canReadBookings&&c.held>0?<CourseCardReservations cardId={c.id} held={c.held} unit={c.unit} revision={revision}/>:<span>已預約 {c.held} {unit}{c.unit==="POINT"?"額度":""}</span>}{!inactive&&status&&<span className="text-xs">{status}</span>}</div>
          </div>;
        })}

        {ready && !visible?.rows.length && <p className="py-3 text-sm text-earth-500">{state.search ? "沒有符合的方案" : state.history ? "尚無到期或停用方案" : "尚無有效方案"}</p>}
      </div>
      {(state.page>0 || visible?.hasMore) && <nav aria-label="持有方案分頁" className="flex flex-wrap items-center justify-end gap-3 text-sm"><span>第 {state.page+1} 頁 · 每頁 20 筆</span><button className="min-h-11 rounded border border-earth-200 px-3 disabled:opacity-40" disabled={!state.page} onClick={()=>onChange({...state,page:state.page-1})}>上一頁</button><button className="min-h-11 rounded border border-earth-200 px-3 disabled:opacity-40" disabled={!visible?.hasMore} onClick={()=>onChange({...state,page:state.page+1})}>下一頁</button></nav>}
    </fieldset>}
  </section>;
}
