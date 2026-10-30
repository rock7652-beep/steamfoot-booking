"use client";
import {SportsMoveConfirm} from '@/app/(dashboard)/dashboard/courses/sports-move-confirm';
import type {CourseMoveClipboard} from '@/app/(dashboard)/dashboard/courses/course-schedule-board';
import {readBeautyNativeCalendar} from '@/lib/beauty/native-calendar';
import {readBeautyMoveResult,readBeautyRosterOperation,updateBeautyRosterAttendance,cancelBeautyRosterAppointment} from '@/server/actions/beauty-native-roster';
import {toLocalDateStr} from '@/lib/date-utils';
import type {CourseRosterData} from '@/app/(dashboard)/dashboard/courses/roster-source';
import type {BeautyCalendarData} from '@/lib/beauty/calendar-read';
import {useCourseDraftGuard} from "@/components/admin/use-course-draft-guard";
import {RosterToolbar} from '@/components/admin/roster-primitives';
import dynamic from "next/dynamic";
const BeautyNativeRoster=dynamic(()=>import("./native-roster-source").then(m=>m.BeautyNativeRoster));
const RentalPanel=dynamic(()=>import("@/app/(dashboard)/dashboard/courses/rental-panel").then(m=>m.RentalPanel));
import {BeautyScheduleWorkspace} from './schedule-workspace';
import {BeautyOpeningGuide} from './opening-guide';
import {BeautyManagementList} from './management-list';

import { useState, useTransition,useCallback,useRef,useEffect,type ReactNode } from "react";
import { useRouter,useSearchParams } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
const BeautyNativeCustomerWorkspace=dynamic(()=>import("./native-customer-source").then(m=>m.BeautyNativeCustomerWorkspace));
import {BeautyNativeScheduleDialog} from "./native-schedule-source";
const CompanionSlot=dynamic(()=>import("@/app/(dashboard)/dashboard/bookings/booking-companion-editor").then(m=>m.CompanionSlot));
import {toast} from "sonner";
import {BeautyCollectionDialog} from './collection-dialog';
import { BeautyCatalogEditor, type EditorKind } from "./catalog-editor";
import {
  findBeautyCompanionByPhone,attachBeautyCompanion,createBeautyCompanion,
  changeBeautyStatus,
  refundBeautyPayment,
  moveBeautyAppointment,
} from "@/server/actions/beauty";
import type { BeautyDashboardData } from "@/server/beauty/queries";
import type { BeautyTab } from "@/lib/beauty/contracts";
const button =
  "min-h-11 rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm disabled:opacity-50";
const field = button + " w-full";
export function BeautyDashboard({
  data: incoming,
  tab,
  slug,
  readOnly = false,
  planPurchaseRecoveryEnabled = false,
  collectionRecoveryEnabled = false,
  cashbookShortcut,homeContent,settingsContent,analyticsContent,careContent,operationsContent,initialCustomerId,initialAppointmentId,initialBooking=false,
}: {
  data: BeautyDashboardData;
  tab: BeautyTab;
  slug: string;
  readOnly?: boolean;
  planPurchaseRecoveryEnabled?: boolean;
  collectionRecoveryEnabled?: boolean;
  cashbookShortcut?:ReactNode;homeContent?:ReactNode;settingsContent?:ReactNode;analyticsContent?:ReactNode;careContent?:ReactNode;operationsContent?:ReactNode;initialCustomerId?:string;initialAppointmentId?:string;initialBooking?:boolean;
}) {
  const [calendarState,setCalendarState]=useState<{base:BeautyDashboardData;value:BeautyCalendarData}|null>(null);
  const data=calendarState?.base===incoming?{...incoming,...calendarState.value}:incoming;
  const [calendarSync,setCalendarSync]=useState<{base:BeautyDashboardData;date:string;pending:boolean;error?:string}|null>(null);
  const calendarGeneration=useRef(0),currentIncoming=useRef(incoming);currentIncoming.current=incoming;
  useEffect(()=>()=>{++calendarGeneration.current;},[]);
  async function syncCalendar(date:string){
    const generation=++calendarGeneration.current,base=incoming;
    setCalendarSync({base,date,pending:true});
    try{
      const result=await readBeautyNativeCalendar(date,slug);
      if(generation!==calendarGeneration.current||currentIncoming.current!==base)return;
      if(!result.success)throw Error(result.error);
      setCalendarState({base,value:result.data});setCalendarSync(null);
      const query=new URLSearchParams(window.location.search);query.set('date',date);query.delete('bookingId');
      window.history.replaceState(null,'','?'+query);
    }catch{
      if(generation===calendarGeneration.current&&currentIncoming.current===base)setCalendarSync({base,date,pending:false,error:'已儲存，班表更新未完成。請重新讀取，不需重複送出。'});
    }
  }
  const [cut,setCut]=useState<{clipboard:CourseMoveClipboard;revision:number;requestKey:string}|null>(null);
  const [paste,setPaste]=useState<{date:string;time:string;roomId:string;coachId:string}|null>(null);
  function cutBooking(id:string){
    const b=data.items.find(row=>row.id===id);if(!b||b.status!=='RESERVED'||readOnly||!data.manage.update||pendingId||collectionBusy)return;
    if(cut&&cut.clipboard.sessionId!==id&&!window.confirm('改為剪下這筆預約？原本預約不會變動。'))return;
    setCut({revision:b.revision,requestKey:crypto.randomUUID(),clipboard:{sessionId:b.id,startsAt:b.startsAt,templateId:b.serviceId,roomId:b.locationId,coachId:b.technicianId,durationMinutes:(+new Date(b.endsAt)-+new Date(b.startsAt))/60000,scope:'SINGLE',label:`${b.personName} · ${b.serviceName}`}});setSelectedId(null);setListOpen(false);setMoneyPanel(null);
  }
  const [rental,setRental]=useState<{id?:string}|null>(null);
  const [rentalGuard,setRentalGuard]=useState({pending:false,dirty:false});
  const onRentalGuard=useCallback((pending:boolean,dirty:boolean)=>setRentalGuard(current=>current.pending===pending&&current.dirty===dirty?current:{pending,dirty}),[]);
  const closeRental=()=>{if(rentalGuard.pending)return;setRental(null);};
  const [listOpen,setListOpen]=useState(false);
  const params=useSearchParams();
  const router = useRouter(),
    [pending, start] = useTransition(),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [booking, setBooking] = useState(initialBooking),
    [editor, setEditor] = useState<{
      kind: EditorKind;
      settingsSection?:"booking"|"notifications";
      draft?: Record<string, unknown>;
    } | null>(null);
  const [identityBusy,setIdentityBusy]=useState(false),[collectionBusy,setCollectionBusy]=useState(false);
  const mutationLock=useRef(false),statusRequests=useRef(new Map<string,string>());
  const onCollectionGuard=useCallback((_dirty:boolean,busy:boolean)=>setCollectionBusy(busy),[]);
  const [bookingState,setBookingState]=useState({dirty:false,pending:false});
  const [statusDraft,setStatusDraft]=useState<{id:string;revision:number;target:'COMPLETED'|'CANCELLED'|'NO_SHOW'|'RESERVED';reason:string;requestKey:string}|null>(null);
  const [moneyRequest,setMoneyRequest] = useState(()=>crypto.randomUUID());
  const [moneyPanel, updateMoneyPanel] = useState<{
      kind: "collect" | "refund" | "card" | "move" | "link";
      ids: string[];
    } | null>(null);
  const [pendingId,setPendingId]=useState<string|null>(null),[syncNeeded,setSyncNeeded]=useState(false);
  useCourseDraftGuard(false,identityBusy||collectionBusy||!!pendingId||(pending&&!!(moneyPanel||statusDraft)));
  const updateBookingGuard=useCallback((dirty:boolean,pending:boolean)=>setBookingState(old=>old.dirty===dirty&&old.pending===pending?old:{dirty,pending}),[setBookingState]);
  function closeBooking(){if(bookingState.pending)return;setBooking(false);setBookingState({dirty:false,pending:false});}
  function closeMoney(){if(pending||identityBusy||collectionBusy)return;setMoneyPanel(null);}
  function setMoneyPanel(v: typeof moneyPanel) {
    setError("");

    setMoneyRequest(crypto.randomUUID());
    updateMoneyPanel(v);
  }
  // The customer tab's shared workspace owns its deep-linked detail panel.
  // Roster/care entry points use the overlay below instead.
  const [detailId, setDetailId] = useState<string | null>(initialBooking || tab==='顧客管理' ? null : initialCustomerId??null);
  const [rosterBusy,setRosterBusy]=useState(false);

  const [bookingSeed]=useState<{date?:string;time?:string;technicianId?:string;locationId?:string}>({});
  const requestedBookingId=params.get('bookingId');
  const [selection,setSelection]=useState<{param:string|null;id:string|null}>(()=>({param:requestedBookingId,id:initialAppointmentId&&data.items.some(row=>row.id===initialAppointmentId)?initialAppointmentId:null}));
  if(selection.param!==requestedBookingId){setSelection({param:requestedBookingId,id:requestedBookingId});updateMoneyPanel(null);}
  const selectedId=selection.param===requestedBookingId?selection.id:requestedBookingId;
  function setSelectedId(id:string|null){setSelection({param:requestedBookingId,id});}
  function closeRoster(keepList=false){
    if(pending||rosterBusy||pendingId||collectionBusy)return;setMoneyPanel(null);setListOpen(keepList);setSelectedId(null);setRosterSnapshot(undefined);setSyncNeeded(false);
    const query=new URLSearchParams(window.location.search);if(query.has('bookingId')){query.delete('bookingId');window.history.replaceState(null,'',`${window.location.pathname}?${query}`);}
  }
  const [rosterSnapshot,setRosterSnapshot]=useState<{sessionId:string;data:CourseRosterData}>();
  const rosterSession=selectedId?`booking:${selectedId}`:`day:${data.date}`;
  const activeRoster=useRef(rosterSession);activeRoster.current=rosterSession;
  function acceptRosterRefresh(result:Awaited<ReturnType<typeof readBeautyRosterOperation>>,scope:string){
    if(activeRoster.current!==scope)return;
    if(!result.success){setSyncNeeded(true);setError('操作已送出，最新狀態尚未核對。請重新讀取，勿重複操作。');return;}
    setRosterSnapshot({sessionId:scope,data:result.data.roster});setSyncNeeded(false);setError('');
    const fresh=result.data.calendar;
    setCalendarState(old=>{const current=old?.base===incoming?old.value:incoming;return {base:incoming,value:{date:current.date,calendar:current.calendar,calendarDays:{...current.calendarDays,...fresh.calendarDays},items:[...current.items.filter(b=>toLocalDateStr(new Date(b.startsAt))!==fresh.date),...fresh.items],rentals:current.rentals}};});
  }
  async function rosterOperation(id:string,work:()=>ReturnType<typeof updateBeautyRosterAttendance>){
    if(mutationLock.current||pendingId||pending||syncNeeded)return;
    const scope=rosterSession;mutationLock.current=true;setPendingId(id);setError('');
    try{const result=await work();if(!result.success){setError(result.error);return;}acceptRosterRefresh(result.refresh,scope);if(result.refresh.success)toast.success('已更新預約狀態');}
    catch{setSyncNeeded(true);setError('操作結果尚未確認，請重新讀取核對，勿重複操作。');}
    finally{mutationLock.current=false;setPendingId(null);}
  }
  async function syncRoster(){
    if(mutationLock.current)return;const scope=rosterSession;mutationLock.current=true;setPendingId('sync');
    try{acceptRosterRefresh(await readBeautyRosterOperation({sessionId:scope,date:data.date}),scope);}catch{setError('重新讀取失敗，請稍後再試');}finally{mutationLock.current=false;setPendingId(null);}
  }
  function run(work: () => Promise<{ success: boolean; error?: string }>,afterSaved?:()=>void) {
    if (pending||mutationLock.current) return;
    mutationLock.current=true;
    start(async () => {
      setError("");
      try {
        const r = await work();
        if (r.success) {
          setMoneyPanel(null);
          if(afterSaved)afterSaved();else router.refresh();
        } else setError(r.error ?? "操作失敗");
      } catch {
        setError("連線失敗，請核對後重試");
      } finally {mutationLock.current=false;}
    });
  }
  function status(
    id: string,
    revision: number,
    target: "COMPLETED" | "CANCELLED" | "NO_SHOW" | "RESERVED",
  ) {
    if(readOnly||!data.manage.update||pending||mutationLock.current)return;
    if(target==='CANCELLED'){
      if(!window.confirm('確定取消此筆預約？'))return;
      const key=`${id}:${revision}:cancel`;if(!statusRequests.current.has(key))statusRequests.current.set(key,crypto.randomUUID());
      void rosterOperation(id,()=>cancelBeautyRosterAppointment({id,revision,requestKey:statusRequests.current.get(key)!,sessionId:rosterSession,date:data.date}));return;
    }
    if(target==='COMPLETED'){attendance(id,revision,'ATTENDED');return;}
    setError('');
    setStatusDraft({id,revision,target,reason:'',requestKey:crypto.randomUUID()});
  }
  function attendance(id:string,revision:number,choice:import('@/lib/beauty/contracts').BeautyAttendanceChoice){
    if(readOnly||!data.manage.update||pending||mutationLock.current)return;
    const key=`${id}:${revision}:attendance:${choice}`;if(!statusRequests.current.has(key))statusRequests.current.set(key,crypto.randomUUID());
    void rosterOperation(id,()=>updateBeautyRosterAttendance({attendance:{id,revision,choice,requestKey:statusRequests.current.get(key)!},sessionId:rosterSession,date:data.date}));
  }
  const canEditTab =
    (
      {
        位置管理: data.manage.location,
        服務項目: data.manage.plan,
        收費方式: data.manage.plan,
        技師管理: data.manage.technician,
        設定: data.manage.settings,
      } as Record<string, boolean>
    )[tab] ?? false;
  return (
    <div className="course-workspace min-w-0 space-y-3">
      {error && !moneyPanel && !statusDraft && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      {calendarSync?.base===incoming&&<div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm"><span>{calendarSync.pending?'已儲存，正在更新班表…':calendarSync.error}</span>{!calendarSync.pending&&<button type="button" className={button} onClick={()=>void syncCalendar(calendarSync.date)}>重新讀取班表</button>}</div>}
      {!['首頁','班表','顧客管理','顧客經營','營運','分析','位置管理','服務項目','收費方式','技師管理','設定'].includes(tab)&&<RosterToolbar label={tab+'搜尋與篩選'}><input className={field+' max-w-72'} aria-label="搜尋" placeholder="搜尋姓名、手機或服務" value={search} onChange={e=>setSearch(e.target.value)}/><button className={button} disabled={pending} onClick={()=>router.refresh()}>更新</button></RosterToolbar>}
      {(process.env.NEXT_PUBLIC_BEAUTY_SETUP_REVIEW==='1'||(data.chargeRulesActive&&data.access.planAccess&&data.access.staffAccess)||data.chargeCatalog?.enabled)&&tab==='設定'&&data.manage.settings&&!readOnly&&<div className="flex justify-end"><BeautyOpeningGuide key={data.storeId} data={data}/></div>}{tab==='首頁'&&homeContent}

      {tab==='班表'&&<BeautyScheduleWorkspace suspended={!!(listOpen||selectedId||detailId||moneyPanel||statusDraft||booking||rental)} cashbookShortcut={cashbookShortcut} move={cut?{clipboard:cut.clipboard,onPaste:setPaste,onCancel:()=>{setCut(null);setPaste(null);}}:undefined} data={data} slug={slug} onLoaded={value=>setCalendarState({base:incoming,value})} onOpen={id=>id.startsWith("rental:")?(data.access.customerAccess?setRental({id:id.slice(7)}):setError("沒有檢視租借顧客資料的權限")):setSelectedId(id)} onRoster={()=>setListOpen(true)} onDateChange={date=>{++calendarGeneration.current;setCalendarSync(null);const q=new URLSearchParams(window.location.search);q.set('date',date);window.history.replaceState(null,'','?'+q);}} readOnly={readOnly}/>}
      {(listOpen||selectedId)&&<RightSheet open={(!moneyPanel||moneyPanel.kind==='collect')&&!statusDraft&&!detailId} presentation="centered" className="fitness-management-editor" fitContent width={1200} labelledById="beauty-roster-title" closeOnEscape={!pending&&!rosterBusy&&!pendingId&&!collectionBusy} onClose={()=>closeRoster()}>
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b bg-primary-50/60 px-4"><div className="flex items-center gap-3">{selectedId&&listOpen&&<button className={button} disabled={pending} onClick={()=>closeRoster(true)}>返回清單</button>}<h2 id="beauty-roster-title" className="font-semibold">預約清單</h2></div><button className={button} disabled={pending||!!pendingId||collectionBusy} onClick={()=>closeRoster()}>關閉</button></header>
      <section className="flex min-h-0 flex-1 flex-col p-4" aria-label="預約清單">{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{syncNeeded&&<button type="button" className={button} disabled={!!pendingId} onClick={()=>void syncRoster()}>重新讀取核對</button>}<BeautyNativeRoster collectionRecoveryEnabled={collectionRecoveryEnabled} suspended={!!detailId||!!statusDraft||!!moneyPanel} onCut={cutBooking} pendingId={pendingId} snapshot={rosterSnapshot} busy={pending||!!pendingId||syncNeeded||collectionBusy} data={data} bookingId={selectedId} readOnly={readOnly} onBusyChange={setRosterBusy} onAttendance={attendance} onStatus={status} onMoney={(kind,ids)=>{if(!pending&&!pendingId&&!syncNeeded&&!mutationLock.current)setMoneyPanel({kind,ids});}} onCustomer={setDetailId}/></section></RightSheet>}
      {moneyPanel?.kind==='collect'&&<BeautyCollectionDialog ids={moneyPanel.ids} storeId={data.storeId} collectionRecoveryEnabled={collectionRecoveryEnabled&&!readOnly} canDiscount={!readOnly&&!!data.manage.discount} onGuard={onCollectionGuard} onClose={closeMoney} onSaved={()=>{setMoneyPanel(null);toast.success('已更新帳務');void syncRoster();}}/>}
      {cut&&paste&&<SportsMoveConfirm key={cut.requestKey+JSON.stringify(paste)} clipboard={cut.clipboard} seed={paste} rooms={data.locations.filter(l=>l.isActive)} coaches={data.techs.filter(t=>t.active).map(t=>({id:t.id,displayName:t.name}))} onClose={()=>setPaste(null)} source={{save:async target=>moveBeautyAppointment('manager',{id:cut.clipboard.sessionId,revision:cut.revision,requestKey:cut.requestKey,date:target.date,time:target.time,technicianId:target.coachId,locationId:target.roomId,reason:'班表剪下貼上改期'}),read:()=>readBeautyMoveResult(cut.clipboard.sessionId)}} onSaved={date=>{setPaste(null);setCut(null);toast.success('已改期');void syncCalendar(date);}}/>}
      {tab==='顧客管理'&&<BeautyNativeCustomerWorkspace data={data} readOnly={readOnly} planPurchaseRecoveryEnabled={planPurchaseRecoveryEnabled} collectionRecoveryEnabled={collectionRecoveryEnabled}/>}
      {tab==='顧客經營'&&careContent}
      {tab==='分析'&&analyticsContent}
      {tab==='營運'&&operationsContent}
      {['位置管理','服務項目','收費方式','技師管理'].includes(tab)&&<fieldset disabled={pending} aria-busy={pending} className="min-w-0">{pending&&<p role="status" className="py-2 text-sm text-earth-500">更新資料中…</p>}<BeautyManagementList key={tab} tab={tab} data={data} canEdit={!readOnly&&canEditTab} onEdit={(kind,draft)=>{if(!pending&&(draft||(!readOnly&&canEditTab)))setEditor({kind,draft:draft as Record<string,unknown>|undefined});}}/></fieldset>}
      {tab==='設定'&&settingsContent}
      {statusDraft&&<RightSheet open presentation="centered" className="fitness-management-editor" width={520} fitContent labelledById="beauty-status-title" closeOnEscape={!pending} onClose={()=>{if(!pending)setStatusDraft(null);}}><form className="space-y-3 p-4" onSubmit={e=>{e.preventDefault();if(!pending&&!readOnly&&data.manage.update&&statusDraft.reason.trim())run(async()=>{const r=await changeBeautyStatus('manager',statusDraft);if(r.success)setStatusDraft(null);return r;});}}><h2 id="beauty-status-title" className="font-semibold">確認服務狀態變更</h2><p>{data.items.find(b=>b.id===statusDraft.id)?.personName} · {data.items.find(b=>b.id===statusDraft.id)?.serviceName}</p><p>{({COMPLETED:'服務完成',CANCELLED:'取消此服務分項',NO_SHOW:'標記未到',RESERVED:'恢復／更正回預約'})[statusDraft.target]}</p><label>操作原因<textarea className={field} required maxLength={500} disabled={pending} value={statusDraft.reason} onChange={e=>setStatusDraft({...statusDraft,reason:e.target.value})}/></label>{error&&<p role="alert" className="text-red-700">{error}</p>}<div className="flex justify-end gap-3"><button type="button" className={button} disabled={pending} onClick={()=>{setStatusDraft(null);}}>返回</button><button className={button+' !bg-primary-700 !text-white'} disabled={pending||readOnly||!data.manage.update||!statusDraft.reason.trim()}>{pending?'處理中…':'確認'}</button></div></form></RightSheet>}

      {booking && !readOnly && data.access.writeAccess && <BeautyNativeScheduleDialog data={data} date={bookingSeed.date??data.date}
        seed={{time:bookingSeed.time,coachId:bookingSeed.technicianId,roomId:bookingSeed.locationId,customerId:initialCustomerId}}
        onGuard={updateBookingGuard} busy={bookingState.pending} onClose={closeBooking}
        onCreated={date=>{setBooking(false);setBookingState({dirty:false,pending:false});toast.success('已新增預約');void syncCalendar(date);}}/>}
      {editor && (
        <BeautyCatalogEditor
          kind={editor.kind}
          settingsSection={editor.settingsSection}
          readOnly={readOnly||!canEditTab}
          data={data}
          draft={editor.draft}
          onClose={() => setEditor(null)}
          onSaved={() => {
            if(editor.kind!=='technician')setEditor(null);
            start(()=>router.refresh());
          }}
        />
      )}
      {detailId && tab!=='顧客管理' && <BeautyNativeCustomerWorkspace key={detailId} data={data} readOnly={readOnly} customerId={detailId} panelOnly planPurchaseRecoveryEnabled={planPurchaseRecoveryEnabled} collectionRecoveryEnabled={collectionRecoveryEnabled} onClose={()=>setDetailId(null)}/>}
      {moneyPanel?.kind==='card'&&<BeautyNativeCustomerWorkspace key={moneyPanel.ids[0]} data={data} readOnly={readOnly} customerId={moneyPanel.ids[0]} initialAction="assign" panelOnly planPurchaseRecoveryEnabled={planPurchaseRecoveryEnabled} collectionRecoveryEnabled={collectionRecoveryEnabled} rosterSessionId={rosterSession} onPurchasedRoster={snapshot=>{if(snapshot&&snapshot.sessionId===activeRoster.current){setRosterSnapshot(snapshot);setSyncNeeded(false);}else{window.dispatchEvent(new Event("customer-search-invalidated"));if(!snapshot)void syncRoster();}}} onClose={closeMoney}/>}
      {moneyPanel?.kind==='link'&&(()=>{const b=data.items.find(b=>b.id===moneyPanel.ids[0]);return b&&<RightSheet open presentation="centered" fitContent width={700} labelledById="beauty-identity-title" closeOnEscape={!identityBusy} onClose={closeMoney}><header className="flex items-center justify-between gap-2 border-b p-4"><h2 id="beauty-identity-title" className="font-semibold">補顧客資料 · {b.personName} · {b.serviceName}</h2><button type="button" className={button} disabled={identityBusy} onClick={closeMoney}>關閉</button></header><section className="p-4"><CompanionSlot displayPosition={Number(/^同行者 (\d+)$/.exec(b.personName)?.[1]??1)+1} bookingId={b.id} slot={{position:2,revision:b.revision,customerId:b.customerId,name:null}} embedded canEdit={!readOnly&&data.manage.update&&data.access.customerAccess} canCreate={data.manage.customer} blocked={pending} onBusy={setIdentityBusy} onUpdated={()=>{setMoneyPanel(null);router.refresh();}} source={{scope:'beauty-companion-phone',find:findBeautyCompanionByPhone,attach:attachBeautyCompanion,create:createBeautyCompanion}}/></section></RightSheet>;})()}

      {moneyPanel && moneyPanel.kind!=='collect' && moneyPanel.kind!=='card' && moneyPanel.kind!=='link' && (
        <RightSheet
          open
          presentation="centered"
          width={listOpen||selectedId?1200:700}
          onClose={closeMoney}
          labelledById="beauty-money-title"
        >
          <form

            className="min-h-0 space-y-3 overflow-y-auto p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (pending) return;
              const f = new FormData(e.currentTarget),
                requestKey = moneyRequest,
                method = String(f.get("method") ?? "OTHER"),
                note = String(f.get("note") ?? "");
              if (moneyPanel.kind === "refund")
                run(() =>
                  refundBeautyPayment({
                    requestKey,
                    paymentId: moneyPanel.ids[0],
                    amount: Number(f.get("amount")),
                    method,
                    reason: note,
                  }),
                );
              if (moneyPanel.kind === "move") {
                const b = data.items.find((b) => b.id === moneyPanel.ids[0])!;
                run(() =>
                  moveBeautyAppointment("manager", {
                    requestKey,
                    id: b.id,
                    revision: b.revision,
                    date: f.get("date"),
                    time: f.get("time"),
                    technicianId: f.get("technicianId") || null,
                    locationId: f.get("locationId") || null,
                    reason: note,
                  }),
                  ()=>{setSelectedId(null);setListOpen(false);const query=new URLSearchParams(params.toString());query.set('tab','班表');query.set('date',String(f.get('date')));query.set('bookingId',b.id);router.push(`?${query}`);},
                );
              }
            }}
          >
            <h2 id="beauty-money-title">
              {
                {
                  refund: "登錄退款（不自動退刷）",
                  card: "購買方案",
                  move: "改期／換技師位置",
                }[moneyPanel.kind]
              }
            </h2>
            {moneyPanel.kind === "refund" && <label className="block">金額<input required className={field} type="number" min={1} name="amount" /></label>}
            {moneyPanel.kind === "move" && (
              <>
                <label>
                  日期
                  <input
                    type="date"
                    required
                    className={field}
                    name="date"
                    defaultValue={data.date}
                  />
                </label>
                <label>
                  時間
                  <input type="time" required className={field} name="time" />
                </label>
                <label>
                  技師
                  <select className={field} name="technicianId">
                    <option value="">保留偏好，自動安排</option>
                    {data.techs.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  位置
                  <select className={field} name="locationId">
                    <option value="">自動安排</option>
                    {data.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {moneyPanel.kind !== "move" && (
              <label>
                付款方式
                <select className={field} name="method">
                  <option value="CASH">現金</option>
                  <option value="BANK_TRANSFER">轉帳</option>
                  <option value="CARD">信用卡</option>
                  <option value="OTHER">其他</option>
                </select>
              </label>
            )}
            <label>
              原因／備註
              <input className={field} required name="note" />
            </label>
            <div className="flex justify-end gap-3"><button type="button" className={button} disabled={pending} onClick={closeMoney}>返回</button><button className={button} disabled={pending}>
              {pending ? "處理中…" : "確認"}
            </button></div>
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
          </form>
        </RightSheet>
      )}
    {rental&&<RightSheet open presentation="centered" width={1040} maxHeight={680} fixedHeight onClose={closeRental} labelledById="beauty-rental-title"><header className="flex shrink-0 items-center justify-between border-b border-earth-200 px-4 py-2"><h2 id="beauty-rental-title" className="font-semibold">{rental.id?'租借明細':'新增租借'}</h2><button className={button} disabled={rentalGuard.pending} onClick={closeRental}>關閉</button></header><div className="flex min-h-0 flex-1 flex-col p-4"><RentalPanel key={rental.id??"new"} module="beauty" id={rental.id} seed={{date:data.date}} rooms={data.locations} customers={data.customers.map(c=>({id:c.id,name:c.name,phone:c.phone}))} permissions={{customerRead:data.access.customerAccess,customerCreate:!!data.manage.customer&&!readOnly,collect:data.manage.collect&&!readOnly,correct:!!data.manage.refund&&!readOnly,edit:!!data.manage.update&&!readOnly}} onGuard={onRentalGuard}/></div></RightSheet>}
</div>
  );
}
