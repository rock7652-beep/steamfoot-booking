"use client";
import {CLOSED_PLAN_LABEL} from "@/lib/plan-status-label";
import {PlanCardHeader} from "@/components/admin/plan-card-header";
import {useIdleReadPreload} from "@/components/admin/use-calendar-month-preload";
import {useCustomerCardReader} from "@/components/admin/use-customer-card-reader";
import { useMusicDataRevision } from "@/components/operations/panel-read-cache";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { RosterTable } from "@/components/admin/roster-primitives";
import type { FeaturePresentationState } from "@/lib/effective-entitlement";
import { CourseCardReservations } from "./card-reservations";
import {useCourseCardDetailReader} from "@/components/admin/use-course-card-detail-reader";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { browseCourseCards } from "@/server/actions/course-browse";
import { toLocalDateStr } from "@/lib/date-utils";
import { courseBalanceText, type CourseBalanceTotal } from "@/lib/course-balance-summary";
import type { CourseCardView } from "./member-workspace";
export type CardBrowseState = { search: string; history: boolean; page: number };
function CardBrowserContent({load,preloadDetails=false,reservations,renderProgress,renderActions,sessionUnitLabel="堂", overview=false,  storeId, native=false, compact=false,dataScope, customerId, state, onChange, onSelect, revision=0,snapshot, canReadBookings=false, sharedCardState="ENABLED" }: {
  preloadDetails?:boolean;storeId?:string;overview?:boolean;dataScope?:"operational"|"legacy";load?:typeof browseCourseCards;reservations?:import("./member-source").CourseCustomerSource["reservations"];sessionUnitLabel?:string;native?:boolean; compact?:boolean; sharedCardState?:FeaturePresentationState; canReadBookings?:boolean; customerId?: string; state:CardBrowseState;onChange:(state:CardBrowseState)=>void;
  onSelect:(card:CourseCardView)=>void;renderProgress?:(card:CourseCardView)=>ReactNode;renderActions?:(card:CourseCardView)=>ReactNode;revision?:number;snapshot?:(import('@/lib/course-purchase-roster').CoursePurchaseCardsSnapshot&{revision:number});
}) {
  const browseReader = useCustomerCardReader({load,native,revision,storeId,canReadBookings});
  const detailReader = useCourseCardDetailReader(load,storeId,revision,preloadDetails);
  const [retry,setRetry]=useState(0);
  const [result,setResult]=useState<{key:string;customerId?:string;rows:CourseCardView[];hasMore:boolean;totals?:CourseBalanceTotal[];error?:string}|null>(null);
  const previousSearch = useRef(state.search);
  const consumedSnapshot=useRef<typeof snapshot>(undefined);
  const syncRevision = useMusicDataRevision();
  const key=JSON.stringify([syncRevision,dataScope,customerId,state,revision,retry]);
  useEffect(()=>{
    let active=true;
    if(snapshot&&snapshot!==consumedSnapshot.current&&snapshot.customerId===customerId&&snapshot.revision===revision&&(!dataScope||dataScope==="operational")&&!state.search&&!state.history&&state.page===0){consumedSnapshot.current=snapshot;queueMicrotask(()=>{if(active)setResult({key,customerId,rows:snapshot.result.rows,hasMore:snapshot.result.hasMore,totals:snapshot.result.totals});});return()=>{active=false;};}
    const delay=previousSearch.current===state.search?0:200;previousSearch.current=state.search;
    const timer=setTimeout(()=>{browseReader.read({customerId,dataScope,...state}).then(r=>{
      if(active)setResult(r.success ? {key,customerId,rows:r.rows,hasMore:r.hasMore,totals:r.totals} : {key,customerId,rows:[],hasMore:false,error:r.error});
    }).catch(()=>{if(active)setResult({key,customerId,rows:[],hasMore:false,error:"讀取失敗，請重試"});});},delay);
    return ()=>{active=false;clearTimeout(timer);};
  },[customerId,dataScope,state,key,browseReader,snapshot,revision]);
  const fresh=browseReader.get({customerId,dataScope,...state});
  const cached=fresh??browseReader.peek({customerId,dataScope,...state});
  const ready=result?.key===key||!!cached;
  const visible=result?.key===key?result:cached?.success?{key,customerId,rows:cached.rows,hasMore:cached.hasMore,totals:cached.totals}:result?.customerId===customerId?result:null;
  const detailPreload=useMemo(()=>({read:(id:string)=>detailReader.read({cardId:id,dataScope}),get:(id:string)=>detailReader.get({cardId:id,dataScope})}),[detailReader,dataScope]);
  useIdleReadPreload({enabled:!!customerId&&!overview&&(!load||preloadDetails),blocked:false,keys:visible?.rows.slice(0,20).map(card=>card.id)??[],reader:detailPreload,startDelayMs:0,gapMs:0,concurrency:2});
  const renderRows=()=>visible?.rows.map(c=>{
          const unit=c.unit==="SESSION"?sessionUnitLabel:"點";
          const inactive=c.closed||c.expired;
          const status=c.closed?CLOSED_PLAN_LABEL:c.expired?"已到期":c.remaining>0&&c.available===0&&c.held>=c.remaining?"額度已全數預約":c.remaining===0?"額度已用完":null;
          if(native||overview)return <div key={c.id} className={overview?"rounded-lg border border-earth-200 bg-earth-50 px-3 py-2 text-sm":"px-3 py-2 text-sm"}>
            <PlanCardHeader summary={<>
              <span className="whitespace-nowrap font-semibold">{inactive?status:c.unit==="SESSION"?`可預約 ${c.available} ${sessionUnitLabel}`:`可用 ${c.available} 點`}</span>
              <span className="text-sm text-earth-500">{c.expiryKind === "NO_EXPIRY" ? "無期限" : !c.expiresAt || (c.openingImported && !c.musicActivatedAt) ? "期初效期待核對" : c.musicValidityDays && !c.musicActivatedAt ? `首次上課起 ${c.musicValidityDays} 天` : `${toLocalDateStr(new Date(c.expiresAt))} 到期`}</span>
            </>} actions={overview?renderActions?.(c):undefined}>
              <button type="button" onPointerEnter={()=>detailReader.prefetch({cardId:c.id,dataScope})} onFocus={()=>detailReader.prefetch({cardId:c.id,dataScope})} onTouchStart={()=>detailReader.prefetch({cardId:c.id,dataScope})} onClick={()=>onSelect(c)} className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-left">
                <span className="min-w-0 break-words font-medium">{c.name}</span>
                {c.members.length>1&&<span className="min-w-0 break-words text-sm text-earth-500">共同餘額 · 共卡人：{c.members.map(m=>m.name).join("、")}</span>}
              </button>
            </PlanCardHeader>
            {overview&&c.openingIssue&&<p className="text-sm text-amber-800">{c.openingIssue}</p>}
            {overview&&renderProgress?.(c)}
            {(!overview&&(!native||c.held>0||!!status))&&<div className="flex flex-wrap items-center gap-x-3 text-earth-600"><span>{inactive?"紀錄剩餘":"剩餘"} {c.remaining} {unit}</span>{canReadBookings&&c.held>0?<CourseCardReservations label={overview?"預約保留":undefined} load={reservations} sessionUnitLabel={sessionUnitLabel} cardId={c.id} held={c.held} unit={c.unit} revision={revision}/>:!overview||c.held>0?<span>{overview?"預約保留":"已預約"} {c.held} {unit}{c.unit==="POINT"?"額度":""}</span>:null}{!inactive&&status&&<span className="text-xs">{status}</span>}</div>}
          </div>;
          return <tr key={c.id}>
            <td><p className="font-medium">{c.name}</p>{(!customerId || c.members.length>1) && <p className="text-earth-600">{c.members.map(m=>m.name).join("、")}</p>}{c.openingIssue && <p className="text-amber-800">{c.openingIssue}</p>}{status && <p className="text-earth-600">{status}</p>}</td>
            <td className="text-right tabular-nums">{c.remaining} {unit}</td>
            <td className="text-right tabular-nums">{canReadBookings&&c.held>0 ? <CourseCardReservations load={reservations} sessionUnitLabel={sessionUnitLabel} cardId={c.id} held={c.held} unit={c.unit} revision={revision}/> : `${c.held} ${unit}`}</td>
            <td className="text-right font-semibold tabular-nums">{inactive ? "—" : `${c.available} ${unit}`}</td>
            <td>{c.expiryKind === "NO_EXPIRY" ? "無期限" : !c.expiresAt || (c.openingImported && !c.musicActivatedAt) ? "期初效期待核對" : c.musicValidityDays && !c.musicActivatedAt ? `首次上課起 ${c.musicValidityDays} 天` : toLocalDateStr(new Date(c.expiresAt))}</td>
            <td>{compact && <ExclusiveMenu label={`${c.name} 操作`} triggerText="⋯"><button type="button" className="min-h-11 w-full px-3 text-left text-sm" onClick={()=>onSelect(c)}>查看堂數明細</button></ExclusiveMenu>}{!compact && <button type="button" aria-label={`查看 ${c.name} 明細`} onPointerEnter={()=>detailReader.prefetch({cardId:c.id,dataScope})} onFocus={()=>detailReader.prefetch({cardId:c.id,dataScope})} onTouchStart={()=>detailReader.prefetch({cardId:c.id,dataScope})} onClick={()=>onSelect(c)} className="min-h-11 min-w-11 text-primary-700 underline">明細</button>}</td>
          </tr>;
        });
  return <section aria-busy={!!cached&&!fresh&&result?.key!==key} className={overview?"space-y-1":"space-y-3"}>
    {!overview && customerId && ready && visible?.totals && (!native||visible.rows.length>0) && <div aria-label="有效方案合計" className="space-y-1 rounded-lg bg-primary-50 px-3 py-2 text-sm"><p className="font-semibold">有效方案合計 · {visible.totals.reduce((sum,total)=>sum+total.count,0)} 個</p>{(!native||visible.totals.some(t=>t.count>0))&&<p>{courseBalanceText(visible.totals)}</p>}{!compact && <p className="text-earth-600">{sharedCardState!=="HIDDEN"&&"共卡為共同餘額；"}各方案期限與適用課程分開計算。</p>}</div>}
    {(!overview||state.search||state.page>0||visible?.hasMore||(visible?.rows.length??0)>5)&&<div className="flex flex-wrap items-center gap-2">
      {(!native||state.search||state.page>0||visible?.hasMore||(visible?.rows.length??0)>5)&&<input aria-label={sharedCardState==="HIDDEN"?"搜尋持有方案或持有人":"搜尋持有方案或共卡成員"} className="min-h-11 min-w-0 flex-1 rounded-lg border border-earth-200 bg-white px-3 text-base" placeholder={sharedCardState==="HIDDEN"?"搜尋方案／持有人":"搜尋方案／共卡成員"} value={state.search} onChange={e=>onChange({...state,search:e.target.value,page:0})}/>}
      {!overview&&<select aria-label="方案效期" className="min-h-11 rounded-lg border border-earth-200 bg-white px-2 text-sm" value={state.history ? "history":"active"} onChange={e=>onChange({...state,history:e.target.value==="history",page:0})}><option value="active">有效方案</option><option value="history">已到期／註銷</option></select>}
    </div>}
    {!ready && <p role="status">更新中…</p>}
    {ready && result?.error ? <p role="alert">{result.error}<button className="min-h-11 px-3" onClick={()=>{browseReader.invalidate({customerId,dataScope,...state});setRetry(n=>n+1);}}>重試</button></p> : <fieldset disabled={!ready} className={!ready?"opacity-60":""}>
      {native||overview?<div className={overview?"space-y-2":"divide-y divide-earth-100"}>{renderRows()}</div>:<RosterTable dense widths={["30%","10%","16%","10%","22%","12%"]} label="學費與堂數方案清單" columns={["方案", "剩餘", "已預約", "可用", "期限", "操作"]}>

        {renderRows()}

      </RosterTable>}
        {ready && !visible?.rows.length && <p className="py-3 text-sm text-earth-500">{state.search ? "沒有符合的方案" : state.history ? "尚無到期或停用方案" : "尚無有效方案"}</p>}
      {(state.page>0 || visible?.hasMore) && <nav aria-label="持有方案分頁" className="flex flex-wrap items-center justify-end gap-3 text-sm"><span>第 {state.page+1} 頁 · 每頁 20 筆</span><button className="min-h-11 rounded border border-earth-200 px-3 disabled:opacity-40" disabled={!state.page} onClick={()=>onChange({...state,page:state.page-1})}>上一頁</button><button className="min-h-11 rounded border border-earth-200 px-3 disabled:opacity-40" disabled={!visible?.hasMore} onClick={()=>onChange({...state,page:state.page+1})}>下一頁</button></nav>}
    </fieldset>}

  </section>;
}

/** History supplements the active overview; it must never replace its cards or grids. */
export function CourseCardBrowser(props:Parameters<typeof CardBrowserContent>[0]) {
 const scope=JSON.stringify([props.customerId,props.dataScope]);
 const [history,setHistory]=useState({scope,open:false,state:{search:"",history:true,page:0}});
 if(!props.overview)return <CardBrowserContent {...props}/>;
 const current=history.scope===scope?history:{scope,open:false,state:{search:"",history:true,page:0}};
 return <>
  <CardBrowserContent {...props} state={{...props.state,history:false}}/>
  <div className="flex flex-wrap items-start gap-x-4">
   <button type="button" className="min-h-11 text-sm text-earth-600" aria-expanded={current.open} onClick={()=>setHistory({...current,open:!current.open})}>{current.open?"收合歷史方案":"歷史方案"}</button>
  </div>
  {current.open&&<section aria-label="歷史方案" className="space-y-1 border-t border-earth-100 pt-2"><h3 className="text-sm font-semibold">歷史方案</h3><CardBrowserContent {...props} snapshot={undefined} state={current.state} onChange={state=>setHistory({...current,state:{...state,history:true}})}/></section>}
 </>;
}
