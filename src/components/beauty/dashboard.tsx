"use client";
import type {BeautyCalendarData} from '@/lib/beauty/calendar-read';
import {useCourseDraftGuard} from "@/components/admin/use-course-draft-guard";
import {RosterToolbar} from '@/components/admin/roster-primitives';
import dynamic from "next/dynamic";
const BeautyNativeRoster=dynamic(()=>import("./native-roster-source").then(m=>m.BeautyNativeRoster));
const RentalPanel=dynamic(()=>import("@/app/(dashboard)/dashboard/courses/rental-panel").then(m=>m.RentalPanel));
import {BeautyScheduleWorkspace} from './schedule-workspace';
import {BeautyManagementList} from './management-list';

import { useState, useTransition,useCallback,useRef,type ReactNode } from "react";
import { useRouter,useSearchParams } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
const BeautyNativeCustomerWorkspace=dynamic(()=>import("./native-customer-source").then(m=>m.BeautyNativeCustomerWorkspace));
import {BeautyNativeScheduleDialog} from "./native-schedule-source";
const CompanionSlot=dynamic(()=>import("@/app/(dashboard)/dashboard/bookings/booking-companion-editor").then(m=>m.CompanionSlot));
import {toast} from "sonner";
const BeautyCollectionPanel=dynamic(()=>import("./collection-panel").then(m=>m.BeautyCollectionPanel));
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
  homeContent,settingsContent,analyticsContent,careContent,operationsContent,initialCustomerId,initialAppointmentId,initialBooking=false,
}: {
  data: BeautyDashboardData;
  tab: BeautyTab;
  slug: string;
  readOnly?: boolean;
  homeContent?:ReactNode;settingsContent?:ReactNode;analyticsContent?:ReactNode;careContent?:ReactNode;operationsContent?:ReactNode;initialCustomerId?:string;initialAppointmentId?:string;initialBooking?:boolean;
}) {
  const [calendarState,setCalendarState]=useState<{base:BeautyDashboardData;value:BeautyCalendarData}|null>(null);
  const data=calendarState?.base===incoming?{...incoming,...calendarState.value}:incoming;
  const [rental,setRental]=useState<{id?:string}|null>(null);
  const [rentalGuard,setRentalGuard]=useState({pending:false,dirty:false});
  const onRentalGuard=useCallback((pending:boolean,dirty:boolean)=>setRentalGuard(current=>current.pending===pending&&current.dirty===dirty?current:{pending,dirty}),[]);
  const closeRental=()=>{if(rentalGuard.pending)return;if(rentalGuard.dirty&&!window.confirm("尚有未儲存租借修改，要關閉嗎？"))return;setRental(null);};
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
  const onCollectionGuard=useCallback((dirty:boolean,busy:boolean)=>{setMoneyDirty(dirty);setCollectionBusy(busy);},[]);
  const [moneyDirty,setMoneyDirty]=useState(false),[bookingState,setBookingState]=useState({dirty:false,pending:false});
  const [statusDraft,setStatusDraft]=useState<{id:string;revision:number;target:'COMPLETED'|'CANCELLED'|'NO_SHOW'|'RESERVED';reason:string;requestKey:string}|null>(null);
  const [moneyRequest,setMoneyRequest] = useState(()=>crypto.randomUUID());
  const [moneyPanel, updateMoneyPanel] = useState<{
      kind: "collect" | "refund" | "card" | "move" | "link";
      ids: string[];
    } | null>(null);
  useCourseDraftGuard(moneyDirty||!!statusDraft?.reason.trim(),identityBusy||collectionBusy||(pending&&!!(moneyPanel||statusDraft)));
  const updateBookingGuard=useCallback((dirty:boolean,pending:boolean)=>setBookingState(old=>old.dirty===dirty&&old.pending===pending?old:{dirty,pending}),[setBookingState]);
  function closeBooking(){if(bookingState.pending)return;if(bookingState.dirty&&!window.confirm("尚有未送出的預約，確定離開？"))return;setBooking(false);setBookingState({dirty:false,pending:false});}
  function closeMoney(){if(pending||identityBusy||collectionBusy||moneyDirty&&!window.confirm("尚有未送出的資料，確定離開？"))return;setMoneyPanel(null);}
  function setMoneyPanel(v: typeof moneyPanel) {
    setError("");
    setMoneyDirty(false);
    setMoneyRequest(crypto.randomUUID());
    updateMoneyPanel(v);
  }
  const [detailId, setDetailId] = useState<string | null>(initialBooking ? null : initialCustomerId??null);
  const [rosterBusy,setRosterBusy]=useState(false);

  const [bookingSeed]=useState<{date?:string;time?:string;technicianId?:string;locationId?:string}>({});
  const requestedBookingId=params.get('bookingId');
  const [selection,setSelection]=useState<{param:string|null;id:string|null}>(()=>({param:requestedBookingId,id:initialAppointmentId&&data.items.some(row=>row.id===initialAppointmentId)?initialAppointmentId:null}));
  if(selection.param!==requestedBookingId)setSelection({param:requestedBookingId,id:requestedBookingId});
  const selectedId=selection.param===requestedBookingId?selection.id:requestedBookingId;
  function setSelectedId(id:string|null){setSelection({param:requestedBookingId,id});}
  function closeRoster(keepList=false){
    if(pending||rosterBusy)return;setListOpen(keepList);setSelectedId(null);
    const query=new URLSearchParams(window.location.search);if(query.has('bookingId')){query.delete('bookingId');window.history.replaceState(null,'',`${window.location.pathname}?${query}`);}
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
    if(target==='COMPLETED'){
      const key=`${id}:${revision}:${target}`;if(!statusRequests.current.has(key))statusRequests.current.set(key,crypto.randomUUID());
      run(()=>changeBeautyStatus('manager',{id,revision,target,requestKey:statusRequests.current.get(key)!}),()=>{toast.success('已完成服務');router.refresh();});return;
    }
    setError('');
    setStatusDraft({id,revision,target,reason:'',requestKey:crypto.randomUUID()});
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
      {!['首頁','班表','顧客管理','顧客經營','營運','分析','位置管理','服務項目','收費方式','技師管理','設定'].includes(tab)&&<RosterToolbar label={tab+'搜尋與篩選'}><input className={field+' max-w-72'} aria-label="搜尋" placeholder="搜尋姓名、手機或服務" value={search} onChange={e=>setSearch(e.target.value)}/><button className={button} disabled={pending} onClick={()=>router.refresh()}>更新</button></RosterToolbar>}
      {tab==='首頁'&&homeContent}
      {tab==='班表'&&!readOnly&&data.access.writeAccess&&data.access.customerAccess&&data.locations.some(r=>r.isActive&&r.rentalEnabled)&&<div className="flex justify-end"><button type="button" className={button} disabled={pending} onClick={()=>setRental({})}>新增租借</button></div>}
      {tab==='班表'&&<BeautyScheduleWorkspace data={data} slug={slug} onLoaded={value=>setCalendarState({base:incoming,value})} onOpen={id=>id.startsWith("rental:")?(data.access.customerAccess?setRental({id:id.slice(7)}):setError("沒有檢視租借顧客資料的權限")):setSelectedId(id)} onRoster={()=>setListOpen(true)} onDateChange={date=>{const q=new URLSearchParams(window.location.search);q.set('date',date);window.history.replaceState(null,'','?'+q);}} readOnly={readOnly}/>}
      {(listOpen||selectedId)&&!moneyPanel&&!statusDraft&&!detailId&&<RightSheet open presentation="centered" className="fitness-management-editor" fitContent width={1200} labelledById="beauty-roster-title" closeOnEscape={!pending&&!rosterBusy} onClose={()=>closeRoster()}>
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b bg-primary-50/60 px-4"><div className="flex items-center gap-3">{selectedId&&listOpen&&<button className={button} disabled={pending} onClick={()=>closeRoster(true)}>返回清單</button>}<h2 id="beauty-roster-title" className="font-semibold">{selectedId?'預約明細':'預約清單'}</h2></div><button className={button} disabled={pending} onClick={()=>closeRoster()}>關閉</button></header>
      <section className="flex min-h-0 flex-1 flex-col p-4" aria-label="預約清單"><BeautyNativeRoster data={data} bookingId={selectedId} readOnly={readOnly} onBusyChange={setRosterBusy} onStatus={status} onMoney={(kind,ids)=>setMoneyPanel({kind,ids})} onCustomer={setDetailId}/></section></RightSheet>}
      {tab==='顧客管理'&&<BeautyNativeCustomerWorkspace data={data} readOnly={readOnly}/>}
      {tab==='顧客經營'&&careContent}
      {tab==='分析'&&analyticsContent}
      {tab==='營運'&&operationsContent}
      {['位置管理','服務項目','收費方式','技師管理'].includes(tab)&&<fieldset disabled={pending} aria-busy={pending} className="min-w-0">{pending&&<p role="status" className="py-2 text-sm text-earth-500">更新資料中…</p>}<BeautyManagementList key={tab} tab={tab} data={data} canEdit={!readOnly&&canEditTab} onEdit={(kind,draft)=>{if(!pending&&(draft||(!readOnly&&canEditTab)))setEditor({kind,draft:draft as Record<string,unknown>|undefined});}}/></fieldset>}
      {tab==='設定'&&settingsContent}
      {statusDraft&&<RightSheet open presentation="centered" className="fitness-management-editor" width={520} fitContent labelledById="beauty-status-title" closeOnEscape={!pending} onClose={()=>{if(!pending&&(!statusDraft.reason||window.confirm('尚未確認，確定離開？')))setStatusDraft(null);}}><form className="space-y-3 p-4" onSubmit={e=>{e.preventDefault();if(!pending&&!readOnly&&data.manage.update&&statusDraft.reason.trim())run(async()=>{const r=await changeBeautyStatus('manager',statusDraft);if(r.success)setStatusDraft(null);return r;});}}><h2 id="beauty-status-title" className="font-semibold">確認服務狀態變更</h2><p>{data.items.find(b=>b.id===statusDraft.id)?.personName} · {data.items.find(b=>b.id===statusDraft.id)?.serviceName}</p><p>{({COMPLETED:'服務完成',CANCELLED:'取消此服務分項',NO_SHOW:'標記未到',RESERVED:'恢復／更正回預約'})[statusDraft.target]}</p><label>操作原因<textarea className={field} required maxLength={500} disabled={pending} value={statusDraft.reason} onChange={e=>setStatusDraft({...statusDraft,reason:e.target.value})}/></label>{error&&<p role="alert" className="text-red-700">{error}</p>}<div className="flex justify-end gap-3"><button type="button" className={button} disabled={pending} onClick={()=>{if(!statusDraft.reason||window.confirm('尚未確認，確定離開？'))setStatusDraft(null);}}>返回</button><button className={button+' !bg-primary-700 !text-white'} disabled={pending||readOnly||!data.manage.update||!statusDraft.reason.trim()}>{pending?'處理中…':'確認'}</button></div></form></RightSheet>}

      {booking && !readOnly && data.access.writeAccess && <BeautyNativeScheduleDialog data={data} date={bookingSeed.date??data.date}
        seed={{time:bookingSeed.time,coachId:bookingSeed.technicianId,roomId:bookingSeed.locationId,customerId:initialCustomerId}}
        onGuard={updateBookingGuard} busy={bookingState.pending} onClose={closeBooking}
        onCreated={date=>{setBooking(false);setBookingState({dirty:false,pending:false});if(date!==data.date){const q=new URLSearchParams(window.location.search);q.set("date",date);router.push("?"+q.toString(),{scroll:false});}else router.refresh();}}/>}
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
      {detailId && <BeautyNativeCustomerWorkspace key={detailId} data={data} readOnly={readOnly} customerId={detailId} panelOnly onClose={()=>setDetailId(null)}/>}
      {moneyPanel?.kind==='card'&&<BeautyNativeCustomerWorkspace key={moneyPanel.ids[0]} data={data} readOnly={readOnly} customerId={moneyPanel.ids[0]} initialAction="assign" panelOnly onClose={closeMoney}/>}
      {moneyPanel?.kind==='link'&&(()=>{const b=data.items.find(b=>b.id===moneyPanel.ids[0]);return b&&<RightSheet open presentation="centered" fitContent width={700} labelledById="beauty-identity-title" closeOnEscape={!identityBusy} onClose={closeMoney}><header className="flex items-center justify-between gap-2 border-b p-4"><h2 id="beauty-identity-title" className="font-semibold">補顧客資料 · {b.personName} · {b.serviceName}</h2><button type="button" className={button} disabled={identityBusy} onClick={closeMoney}>關閉</button></header><section className="p-4" onChangeCapture={()=>setMoneyDirty(true)}><CompanionSlot displayPosition={Number(/^同行者 (\d+)$/.exec(b.personName)?.[1]??1)+1} bookingId={b.id} slot={{position:2,revision:b.revision,customerId:b.customerId,name:null}} embedded canEdit={!readOnly&&data.manage.update&&data.access.customerAccess} canCreate={data.manage.customer} blocked={pending} onBusy={setIdentityBusy} onUpdated={()=>{setMoneyDirty(false);setMoneyPanel(null);router.refresh();}} source={{scope:'beauty-companion-phone',find:findBeautyCompanionByPhone,attach:attachBeautyCompanion,create:createBeautyCompanion}}/></section></RightSheet>;})()}
      {moneyPanel?.kind==='collect'&&<RightSheet open presentation="centered" fitContent width={560} labelledById="beauty-collection-title" closeOnEscape={!collectionBusy} onClose={closeMoney}><BeautyCollectionPanel key={moneyPanel.ids.join(':')} ids={moneyPanel.ids} canDiscount={!readOnly&&!!data.manage.discount} onGuard={onCollectionGuard} onClose={closeMoney} onSaved={()=>{setMoneyDirty(false);setMoneyPanel(null);toast.success('已登錄收款');router.refresh();}}/></RightSheet>}
      {moneyPanel && moneyPanel.kind!=='collect' && moneyPanel.kind!=='card' && moneyPanel.kind!=='link' && (
        <RightSheet
          open
          presentation="centered"
          width={listOpen||selectedId?1200:700}
          onClose={closeMoney}
          labelledById="beauty-money-title"
        >
          <form
            onChangeCapture={()=>setMoneyDirty(true)}
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
