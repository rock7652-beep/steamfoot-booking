"use client";
import { RosterTable } from "@/components/admin/roster-primitives";
import type { FeaturePresentationState } from "@/lib/effective-entitlement";
import { CourseCardReservations } from "./card-reservations";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { useEffect, useRef, useState } from "react";
import { browseCourseCards } from "@/server/actions/course-browse";
import { toLocalDateStr } from "@/lib/date-utils";
import { courseBalanceText, type CourseBalanceTotal } from "@/lib/course-balance-summary";
import type { CourseCardView } from "./member-workspace";
export type CardBrowseState = { search: string; history: boolean; page: number };
export function CourseCardBrowser({ dataScope, customerId, state, onChange, onSelect, revision=0, canReadBookings=false, sharedCardState="ENABLED" }: {
  dataScope?: "operational" | "legacy";
  sharedCardState?:FeaturePresentationState; canReadBookings?:boolean; customerId?: string; state:CardBrowseState;onChange:(state:CardBrowseState)=>void;
  onSelect:(card:CourseCardView)=>void;revision?:number;
}) {
  const detailReader = usePanelReader("course-card", browseCourseCards);
  const [retry,setRetry]=useState(0);
  const [result,setResult]=useState<{key:string;customerId?:string;rows:CourseCardView[];hasMore:boolean;totals?:CourseBalanceTotal[];error?:string}|null>(null);
  const previousSearch = useRef(state.search);
  const key=JSON.stringify([dataScope,customerId,state,revision,retry]);
  useEffect(()=>{
    let active=true;
    const delay=previousSearch.current===state.search?0:200;
    previousSearch.current=state.search;
    const timer=setTimeout(()=>{browseCourseCards({customerId,dataScope,...state}).then(r=>{
      if(active)setResult(r.success ? {key,customerId,rows:r.rows,hasMore:r.hasMore,totals:r.totals} : {key,customerId,rows:[],hasMore:false,error:r.error});
    }).catch(()=>{if(active)setResult({key,customerId,rows:[],hasMore:false,error:"讀取失敗，請重試"});});},delay);
    return ()=>{active=false;clearTimeout(timer);};
  },[customerId,dataScope,state,key]);
  const ready=result?.key===key;
  const visible=result?.customerId===customerId?result:null;
  return <section className="space-y-3">
    {customerId && ready && visible?.totals && <div aria-label="有效方案合計" className="space-y-1 rounded-lg bg-primary-50 px-3 py-2 text-sm"><p className="font-semibold">有效方案合計 · {visible.totals.reduce((sum,total)=>sum+total.count,0)} 個</p><p>{courseBalanceText(visible.totals)}</p><p className="text-earth-600">{sharedCardState!=="HIDDEN"&&"共卡為共同餘額；"}各方案期限與適用課程分開計算。</p></div>}
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label={sharedCardState==="HIDDEN"?"搜尋持有方案或持有人":"搜尋持有方案或共卡成員"} className="min-h-11 min-w-0 flex-1 rounded-lg border border-earth-200 bg-white px-3 text-base" placeholder={sharedCardState==="HIDDEN"?"搜尋方案／持有人":"搜尋方案／共卡成員"} value={state.search} onChange={e=>onChange({...state,search:e.target.value,page:0})}/>
      <select aria-label="方案效期" className="min-h-11 rounded-lg border border-earth-200 bg-white px-2 text-sm" value={state.history ? "history":"active"} onChange={e=>onChange({...state,history:e.target.value==="history",page:0})}><option value="active">有效方案</option><option value="history">已到期／停用</option></select>
    </div>
    {!ready && <p role="status">更新中…</p>}
    {ready && result?.error ? <p role="alert">{result.error}<button className="min-h-11 px-3" onClick={()=>setRetry(n=>n+1)}>重試</button></p> : <fieldset disabled={!ready} className={!ready?"opacity-60":""}>
      <RosterTable label="學費與堂數方案清單" columns={["方案", "剩餘", "已預約", "可再預約", "期限", "操作"]}>

        {visible?.rows.map(c=>{
          const unit=c.unit==="SESSION"?"堂":"點";
          const inactive=c.closed||c.expired;
          const status=c.closed?"已停用":c.expired?"已到期":c.remaining>0&&c.available===0&&c.held>=c.remaining?"額度已全數預約":c.remaining===0?"額度已用完":null;
          return <tr key={c.id}>
            <td><p className="font-medium">{c.name}</p>{(!customerId || c.members.length>1) && <p className="text-earth-600">{c.members.map(m=>m.name).join("、")}</p>}{c.openingIssue && <p className="text-amber-800">{c.openingIssue}</p>}{status && <p className="text-earth-600">{status}</p>}</td>
            <td className="text-right tabular-nums">{c.remaining} {unit}</td>
            <td className="text-right tabular-nums">{canReadBookings&&c.held>0 ? <CourseCardReservations cardId={c.id} held={c.held} unit={c.unit} revision={revision}/> : `${c.held} ${unit}`}</td>
            <td className="text-right font-semibold tabular-nums">{inactive ? "—" : `${c.available} ${unit}`}</td>
            <td>{c.expiryKind === "NO_EXPIRY" ? "無期限" : !c.expiresAt || (c.openingImported && !c.musicActivatedAt) ? "期初效期待核對" : c.musicValidityDays && !c.musicActivatedAt ? `首次上課起 ${c.musicValidityDays} 天` : toLocalDateStr(new Date(c.expiresAt))}</td>
            <td><button type="button" aria-label={`查看 ${c.name} 明細`} onPointerEnter={()=>detailReader.prefetch({cardId:c.id,dataScope})} onFocus={()=>detailReader.prefetch({cardId:c.id,dataScope})} onTouchStart={()=>detailReader.prefetch({cardId:c.id,dataScope})} onClick={()=>onSelect(c)} className="min-h-11 min-w-11 text-primary-700 underline">明細</button></td>
          </tr>;
        })}

      </RosterTable>
        {ready && !visible?.rows.length && <p className="py-3 text-sm text-earth-500">{state.search ? "沒有符合的方案" : state.history ? "尚無到期或停用方案" : "尚無有效方案"}</p>}
      {(state.page>0 || visible?.hasMore) && <nav aria-label="持有方案分頁" className="flex flex-wrap items-center justify-end gap-3 text-sm"><span>第 {state.page+1} 頁 · 每頁 20 筆</span><button className="min-h-11 rounded border border-earth-200 px-3 disabled:opacity-40" disabled={!state.page} onClick={()=>onChange({...state,page:state.page-1})}>上一頁</button><button className="min-h-11 rounded border border-earth-200 px-3 disabled:opacity-40" disabled={!visible?.hasMore} onClick={()=>onChange({...state,page:state.page+1})}>下一頁</button></nav>}
    </fieldset>}
  </section>;
}
