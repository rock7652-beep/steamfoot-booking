"use client";
import {useCoursePersonnelText} from "@/components/course-personnel-label";
import {musicBatchLabel,musicPeriodLabel,musicPeriodNumber} from "@/lib/music-purchase-periods";
import {musicPurchasedTitle} from "@/lib/music-purchase-display";
import {CustomerTransactionAction} from "./customer-transaction-action";
import {useEffect,useId,useRef,useState} from "react";
import {useSearchParams} from "next/navigation";
import {usePanelReader} from "@/components/operations/panel-read-cache";
import {ExclusiveMenu} from "@/components/admin/exclusive-menu";
import {ModalPanel} from "@/components/admin/modal-panel";
import {DashboardLink} from "@/components/dashboard-link";
import type {loadMusicPeriods} from "@/server/actions/music-periods";
import {readMusicPeriods} from "@/lib/music-period-read-client";
import {loadCourseCustomerPurchases} from "@/server/actions/course-customer-history";
import {musicTeachingKey} from "@/lib/music-teaching-item";
import {musicPlanItems} from "@/lib/music-catalog";
import {musicPeriodReceipts} from "@/lib/music-period-payments";
import {studentScheduleHref,studentCourseHref,studentMakeupsHref} from "@/lib/music-student-navigation";
import {formatTWDateTime,toLocalDateStr} from "@/lib/date-utils";
import {COURSE_PAYMENT_LABELS} from "@/lib/course-checkout";
import {MusicTuitionDetails,type TuitionOrder} from "./music-tuition-details";
import {MusicPeriodOverview} from "./music-period-overview";

type PeriodData=Extract<Awaited<ReturnType<typeof loadMusicPeriods>>,{success:true}>;
type Card=PeriodData["data"][number];
const field="min-h-11 min-w-0 rounded-lg border border-earth-200 bg-white px-3 text-sm";
const amount=(n:number)=>`NT$ ${n.toLocaleString()}`;
const lessonStatus=(b:Card["bookings"][number])=>b.absenceKind==="STUDENT_LEAVE"?"請假／補課":b.absenceKind==="TEACHER_ABSENT"?"教師未授課":b.absenceKind==="GROUP_LEAVE_FORFEITED"?"請假・扣堂":({ATTENDED:"已出席",CHECKED_IN:"已報到",NO_SHOW:"曠課",CANCELLED:"已取消",RESERVED:"待上課"}[b.status]??b.status);
export function MusicStudentCourses({customerId,revision:dataRevision=0,templates,subjects,canReadBookings,canReadTransactions,canReadCards,canAssign,canSchedule=false,onPurchase,onManageCard}:{
 customerId:string;revision?:number;templates:{id:string;name:string;musicSubjectId?:string|null}[];subjects:{id:string;name:string}[];
 canReadBookings:boolean;canReadTransactions:boolean;canReadCards:boolean;canAssign:boolean;canSchedule?:boolean;onPurchase:(selection?:{subjectId:string;planId:string})=>void;onManageCard:(id:string)=>void;
}){
 const params=useSearchParams(),title=useId();
 const section=useRef<HTMLElement>(null);
 const periodsReader=usePanelReader("music-periods",readMusicPeriods);
 const ordersReader=usePanelReader("purchases",loadCourseCustomerPurchases);
 const [state,setState]=useState<{customerId:string;cards:Card[];orders:TuitionOrder[];more:boolean;error:string}|null>(null);
 const [revision,setRevision]=useState(0),[loading,setLoading]=useState(false),[subjectId,setSubject]=useState(params.get("studentSubject")??""),[methodId,setMethod]=useState(params.get("studentMethod")??""),[advanced,setAdvanced]=useState<string|null>(null);
 useEffect(()=>{let active=true;setLoading(true);
 // A completed purchase updates the mounted panel without remounting its filters.
 // Detach any pre-purchase in-flight reads before requesting authoritative data.
 periodsReader.invalidate(customerId);ordersReader.clear();
 void Promise.all([canReadBookings||canReadCards?periodsReader.read(customerId):null,canReadTransactions?ordersReader.read(customerId,0):null]).then(([periods,orders])=>{
  if(!active)return;
  setState({customerId,cards:periods?.success?periods.data:[],orders:orders?.success?orders.data:[],more:orders?.success?orders.hasMore:false,error:[periods&&!periods.success?periods.error:"",orders&&!orders.success?orders.error:""].filter(Boolean).join("・")});
 }).catch(()=>{if(active)setState({customerId,cards:[],orders:[],more:false,error:"讀取未完成，請重試。"});}).finally(()=>{if(active)setLoading(false);});
 return()=>{active=false;};},[customerId,dataRevision,revision,canReadBookings,canReadCards,canReadTransactions,periodsReader,ordersReader]);
 function retain(key:string,value:string){const url=new URL(window.location.href);if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);window.history.replaceState(null,"",url.pathname+url.search);}
 const refresh=()=>setRevision(n=>n+1);
 const current=state?.customerId===customerId?state:null;
 useEffect(()=>{if(loading||!current)return;const area=section.current?.closest<HTMLElement>("[data-course-person-scroll]");const key=area?.dataset.coursePersonScroll;if(area&&key){try{area.scrollTop=Number(sessionStorage.getItem(key))||0;}catch{}}},[loading,current]);
 const methods=new Map<string,{id:string;name:string;items:{id:string;name:string}[]}>();
 for(const entry of [...(current?.cards??[]),...(current?.orders??[])]){
  const items=musicPlanItems(entry.templateIds,templates,subjects);
  if(!methods.has(entry.planId))methods.set(entry.planId,{id:entry.planId,name:"nameSnapshot" in entry?entry.nameSnapshot:entry.name,items:items.length?items:[{id:"unconfirmed",name:"待確認教學項目"}]});
 }
 const items=[...new Map([...methods.values()].flatMap(m=>m.items).map(item=>[item.id,item])).values()];
 const selectedSubject=items.find(i=>i.id===subjectId)??items[0];
 const options=[...methods.values()].filter(m=>m.items.some(i=>i.id===selectedSubject?.id));
 const selectedMethod=options.find(m=>m.id===methodId)??options[0];
 const cards=current?.cards.filter(c=>c.planId===selectedMethod?.id)??[];
 const orders=current?.orders.filter(o=>o.planId===selectedMethod?.id)??[];
 return <section ref={section} aria-label="課程與學費" className="@container/student space-y-3">
  <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-sm">教學項目<select aria-label="學員教學項目" className={`${field} mt-1 w-full`} value={selectedSubject?.id??""} onChange={e=>{setSubject(e.target.value);setMethod("");retain("studentSubject",e.target.value);retain("studentMethod","");}}><option value="" disabled>請選擇教學項目</option>{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{canAssign&&<button type="button" className={field} onClick={()=>onPurchase(selectedSubject&&selectedMethod?{subjectId:selectedSubject.id,planId:selectedMethod.id}:undefined)}>{selectedMethod?"續購此方案":"購課／續購"}</button>}<button type="button" className={field} disabled={loading} onClick={refresh}>更新</button></div>
  {current?.error&&<p role="alert" className="text-sm text-red-700">{current.error}<button className={field} onClick={refresh}>重試</button></p>}
  {loading&&!current?<p role="status">讀取課程與學費…</p>:<>
   <nav aria-label="收費方式" className="flex flex-wrap gap-1 border-b border-earth-200">{options.map(method=><button key={method.id} type="button" aria-pressed={method.id===selectedMethod?.id} className={`min-h-11 min-w-0 break-words border-b-2 px-3 text-sm ${method.id===selectedMethod?.id?"border-primary-700 font-semibold text-primary-800":"border-transparent text-earth-600"}`} onClick={()=>{setMethod(method.id);retain("studentMethod",method.id);}}>{musicPurchasedTitle(method.name,current?.cards.find(c=>c.planId===method.id)?.musicTermSizes)}</button>)}</nav>
   {!selectedMethod&&!current?.error&&<p className="py-3 text-sm text-earth-500">尚無已購課程。</p>}
   {cards.map(card=>{const order=orders.find(o=>o.cardId===card.id);return <PeriodPurchase key={card.id} card={card} order={order} customerId={customerId} query={params.toString()} scheduleTemplate={selectedSubject?musicTeachingKey(selectedSubject.id):""} canSchedule={canSchedule&&canReadBookings&&!card.closedAt} canReadBookings={canReadBookings} canReadTransactions={canReadTransactions} refresh={refresh} canReadCards={canReadCards} onManageCard={onManageCard} onAdvanced={()=>setAdvanced(card.id)}/>;})}
   {orders.filter(o=>!cards.some(c=>c.id===o.cardId)).map(order=><section className="rounded-lg border p-3 text-sm" key={order.id}><div className="flex flex-wrap items-center justify-between gap-2"><span>購課 {toLocalDateStr(new Date(order.createdAt))}・{({PENDING:"待核帳",CONFIRMED:"已購課",REFUNDED:"已退款",VOIDED:"已作廢"})[order.status as "PENDING"]??order.status}</span><div className="flex flex-wrap gap-2"><MusicTuitionDetails closeLabel="返回課程與學費" order={order} onUpdated={refresh}/><CustomerTransactionAction closeLabel="返回課程與學費" customerId={customerId} purchaseId={order.id} onUpdated={refresh}/></div></div>{order.tuition?.periods.map(p=><div key={p.period} className="flex flex-wrap gap-x-5 gap-y-2 border-t py-3"><strong>第 {p.period} 期</strong><span>{p.lessons} 堂</span><span>應收 {amount(p.due)}</span><span>已收 {amount(p.received)}</span><span>未收 {amount(p.outstanding)}</span></div>)}</section>)}
   {current?.more&&<button className={field} disabled={loading} onClick={async()=>{setLoading(true);try{const result=await ordersReader.read(customerId,current.orders.length);if(result.success)setState(previous=>previous?.customerId===customerId?{...previous,orders:[...previous.orders,...result.data],more:result.hasMore}:previous);else setState(previous=>previous?{...previous,error:result.error}:previous);}catch{setState(previous=>previous?{...previous,error:"更多購課讀取失敗，請重試。"}:previous);}finally{setLoading(false);}}}>載入更多購課</button>}
  </>}
  <ModalPanel open={advanced!==null} onClose={()=>setAdvanced(null)} labelledById={title} width={1000}><header className="flex items-center justify-between border-b p-3"><h3 id={title} className="font-semibold">期別核對與詳細紀錄</h3><button className={field} onClick={()=>{setAdvanced(null);refresh();}}>關閉</button></header><div className="min-h-0 overflow-y-auto p-3">{advanced&&<MusicPeriodOverview key={advanced} customerId={customerId} initialCardId={advanced}/>}</div></ModalPanel>
 </section>;
}
function PeriodPurchase({card,order,customerId,query,refresh,canReadBookings,canReadTransactions,canReadCards,onManageCard,onAdvanced,scheduleTemplate,canSchedule}:{scheduleTemplate:string;canSchedule:boolean;card:Card;order?:TuitionOrder;customerId:string;query:string;refresh:()=>void;canReadBookings:boolean;canReadTransactions:boolean;canReadCards:boolean;onManageCard:(id:string)=>void;onAdvanced:()=>void}){
  const personnelText = useCoursePersonnelText();
 const periods=[...new Set(card.slots.map(s=>s.period))];
 const needsReview=canReadBookings&&(card.musicOpeningStateRequired||card.bookings.some(b=>!b.assignment&&b.status!=="CANCELLED"));
 const payments=order?.tuition?musicPeriodReceipts(order.tuition.periods.map(p=>p.due),order.tuition.receipts):[];
 return <section className="space-y-2" aria-label={`${card.nameSnapshot} 各期紀錄`}>
  <header className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-earth-600">{order?`${musicBatchLabel(card.purchaseBatch,card.periodStart,card.musicTermSizes.length)||"購課"}｜${formatTWDateTime(new Date(order.createdAt))}・`:""}{card.musicTermSizes.length} 期・{card.musicTermSizes.reduce((a,b)=>a+b,0)} 堂{order?.status==="REFUNDED"?"・已退款":card.closedAt?"・已停用":""}</span><div className="flex flex-wrap items-center gap-2">{canSchedule&&<DashboardLink className={field} href={studentScheduleHref(customerId,query,scheduleTemplate)}>安排課程</DashboardLink>}<ExclusiveMenu label={`${card.nameSnapshot} 更多操作`} triggerText="⋯">{canReadCards&&<button className="min-h-11 w-full px-3 text-left text-sm" onClick={()=>onManageCard(card.id)}>方案與額度管理</button>}<button className="min-h-11 w-full px-3 text-left text-sm" onClick={onAdvanced}>期別核對與詳細紀錄</button>{order&&<div className="px-3 py-1"><CustomerTransactionAction closeLabel="返回課程與學費" customerId={customerId} purchaseId={order.id} onUpdated={refresh}/></div>}</ExclusiveMenu></div></header>
  {needsReview&&<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm"><span>期別待核對</span><button className={field} onClick={onAdvanced}>核對紀錄</button></div>}
  {periods.map(period=>{const slots=card.slots.filter(s=>s.period===period);const rows=canReadBookings?card.bookings.filter(b=>b.assignment?.period===period).sort((a,b)=>(a.assignment?.ordinal??0)-(b.assignment?.ordinal??0)||a.date.localeCompare(b.date)):[];const live=rows.filter(b=>b.status!=="CANCELLED");const dates=live.map(b=>b.date).sort();const financial=order?.tuition?.periods.find(p=>p.period===period);const receipts=payments[period-1]??[];const completed=new Set(rows.filter(b=>b.status==="ATTENDED"||b.status==="NO_SHOW"||b.absenceKind==="GROUP_LEAVE_FORFEITED").map(b=>b.assignment?.ordinal)).size;
   return <details key={period} open={(new URLSearchParams(query).get("studentPeriods")??"").split(",").includes(`${card.id}:${period}`)} onToggle={event=>{const token=`${card.id}:${period}`;const url=new URL(window.location.href);const expanded=new Set((url.searchParams.get("studentPeriods")??"").split(",").filter(Boolean));if(event.currentTarget.open)expanded.add(token);else expanded.delete(token);const value=[...expanded].join(",");if(value)url.searchParams.set("studentPeriods",value);else url.searchParams.delete("studentPeriods");window.history.replaceState(null,"",url.pathname+url.search);}} className="group/period rounded-lg border border-earth-200" data-music-period={period}><summary className="min-h-11 cursor-pointer list-none px-3 py-3 text-sm"><div className="grid min-w-0 grid-cols-2 items-center gap-x-4 gap-y-2 @min-[58rem]/student:grid-cols-[6rem_minmax(10rem,1fr)_8rem_repeat(3,minmax(5rem,auto))_auto]"><strong>{period>card.musicTermSizes.length?"贈課":musicPeriodLabel(period,card.periodStart,card.purchaseBatch)}</strong><span className="text-earth-600">{dates.length?`${toLocalDateStr(new Date(dates[0]))} ～ ${toLocalDateStr(new Date(dates[dates.length-1]))}`:canReadBookings?(rows.length?"僅取消紀錄":needsReview?"—":"尚未排課"):"課表無檢視權限"}</span><span>{canReadBookings?(needsReview?`共 ${slots.length} 堂`:`已上 ${completed}/${slots.length} 堂`):`共 ${slots.length} 堂`}</span>{financial?<><span>應收 {amount(financial.due)}</span><span>已收 {amount(financial.received)}</span><span className={financial.outstanding?"text-amber-800":"text-earth-600"}>未收 {order?.status==="REFUNDED"?"—":amount(financial.outstanding)}</span></>:<span className="text-earth-500">{order?"無逐期收款資料":canReadTransactions?"收款資料尚未載入":"收款資料無檢視權限"}</span>}<span className="text-primary-700"><span className="group-open/period:hidden">展開 ⌄</span><span className="hidden group-open/period:inline">收合 ⌃</span></span></div></summary>
    <div className="space-y-3 border-t border-earth-100 p-3 text-sm"><section><div className="mb-1 flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">繳費明細</h4>{order&&financial&&<MusicTuitionDetails closeLabel="返回課程與學費" order={order} receiptPeriod={period} displayPeriod={musicPeriodNumber(period,card.periodStart)} onUpdated={refresh}/>}</div>{receipts.length?<div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left"><thead><tr>{["收款日期","本期抵付","付款方式"].map(v=><th className="py-2 pr-3 font-medium text-earth-600" key={v}>{v}</th>)}</tr></thead><tbody>{receipts.map(r=><tr className="border-t border-earth-100" key={r.id}><td className="py-2 pr-3">{toLocalDateStr(new Date(r.paidAt))}</td><td>{amount(r.allocated)}</td><td>{COURSE_PAYMENT_LABELS[r.method]??r.method}</td></tr>)}</tbody></table></div>:<p className="py-2 text-earth-500">{canReadTransactions?"尚無本期收款紀錄":"收款資料無檢視權限"}</p>}</section>
    <section><h4 className="mb-1 font-semibold">上課紀錄</h4>{rows.length?<div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left"><thead><tr>{["堂次",personnelText("上課日期／教師"),"出勤","操作"].map(v=><th key={v} className="py-2 pr-3 font-medium text-earth-600">{v}</th>)}</tr></thead><tbody>{rows.map(b=><tr className="border-t border-earth-100" key={b.id}><td>第 {b.assignment?.ordinal} 堂{b.assignment?.kind==="MAKEUP"?"・補課":""}</td><td className="py-2">{formatTWDateTime(new Date(b.date))}・{b.teacher}</td><td>{personnelText(lessonStatus(b))}</td><td>{b.status==="CANCELLED"?<span className="text-earth-400">—</span>:<DashboardLink className="inline-flex min-h-11 items-center text-primary-700 underline" href={studentCourseHref(customerId,toLocalDateStr(new Date(b.date)),b.sessionId,query)}>課堂／點名</DashboardLink>}{b.absenceKind==="STUDENT_LEAVE"&&<DashboardLink className="ml-3 inline-flex min-h-11 items-center text-primary-700 underline" href={studentMakeupsHref(customerId,query)}>請假／補課</DashboardLink>}</td></tr>)}</tbody></table></div>:<p className="py-2 text-earth-500">{canReadBookings?"尚未排課":"課表無檢視權限"}</p>}</section></div>
   </details>;
  })}
 </section>;
}
