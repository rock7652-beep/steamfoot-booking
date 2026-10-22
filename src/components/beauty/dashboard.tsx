"use client";
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {readBeautyCalendar,projectBeautyCalendar,type BeautyCalendarData} from '@/lib/beauty/calendar-read';
import {useCourseDraftGuard} from "@/components/admin/use-course-draft-guard";
import ReportDateRange from "@/components/report-date-range";
import {courseAnalysisRange} from "@/lib/course-analytics";
import {CustomerPanelTabs} from "@/components/admin/customer-panel-tabs";
import {DataTable} from '@/components/desktop';
import {CourseCustomerList} from '@/app/(dashboard)/dashboard/courses/customer-list';
import {RosterToolbar,RosterMoreMenu} from '@/components/admin/roster-primitives';
import {SettingsWorkspaceFrame,SettingsWorkspaceNav} from '@/components/settings';
import {BeautyFeeSummary} from './fee-summary';
import {BeautySharedMembers} from "./shared-members";
import {BeautyHome} from './home';
import {BeautyScheduleWorkspace} from './schedule-workspace';
import {BeautyManagementList} from './management-list';

import { useState, useTransition, useRef,type ReactNode } from "react";
import { useRouter,useSearchParams } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { SettingsListRow } from "@/components/settings";
import { BeautyCustomerPanel } from "./customer-panel";
import { BeautyBookingForm } from "./booking-form";
import { BeautyCatalogEditor, type EditorKind } from "./catalog-editor";
import {
  linkBeautyCustomer,
  confirmBeautyPurchase,
  changeBeautyStatus,
  collectBeautyPayment,
  purchaseBeautyPlan,
  refundBeautyPayment,
  confirmBeautySettlement,
  saveBeautyCustomer,
  moveBeautyAppointment,
} from "@/server/actions/beauty";
import { formatTWDateTime } from "@/lib/date-utils";
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
  settingsStoreContent,settingsLabelsContent,settingsSubscriptionContent,analyticsContent,careContent,operationsNavigation,initialCustomerId,initialBooking=false,
}: {
  data: BeautyDashboardData;
  tab: BeautyTab;
  slug: string;
  readOnly?: boolean;
  settingsStoreContent?:ReactNode;settingsLabelsContent?:ReactNode;settingsSubscriptionContent?:ReactNode;analyticsContent?:ReactNode;careContent?:ReactNode;operationsNavigation?:ReactNode;initialCustomerId?:string;initialBooking?:boolean;
}) {
  const [calendarState,setCalendarState]=useState<{base:BeautyDashboardData;value:BeautyCalendarData}|null>(null);
  const data=calendarState?.base===incoming?{...incoming,...calendarState.value}:incoming;
  const [calendarPending,setCalendarPending]=useState(false),[listOpen,setListOpen]=useState(false);
  const calendarVersion=useRef(0);
  const calendarReader=usePanelReader('beauty-manager-calendar',readBeautyCalendar,slug,0);
  async function changeCalendar(date:string,calendar:BeautyDashboardData['calendar']){
   if(calendarPending||pending||booking||selectedId||listOpen)return;
   const previous=calendarState;
   const preview=calendarReader.peek(date,calendar,slug)??null;
   const snapshot=preview?.success?preview.data:projectBeautyCalendar(data,date,calendar);
   if(snapshot)setCalendarState({base:incoming,value:snapshot});
   const version=++calendarVersion.current;setCalendarPending(true);setError('');
   try{const r=await calendarReader.read(date,calendar,slug);if(version!==calendarVersion.current)return;if(!r.success){setCalendarState(previous);setError(r.error);return;}setCalendarState({base:incoming,value:r.data});setChecked([]);const q=new URLSearchParams(window.location.search);q.set('date',date);q.set('calendar',calendar);window.history.replaceState(null,'','?'+q.toString());}catch{setCalendarState(previous);setError('班表讀取失敗，原班表已保留，請重試。');}finally{if(version===calendarVersion.current)setCalendarPending(false);}
  }
  const params=useSearchParams(),settingsCategory=params.get("section")??"store";
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
  const [moneyDirty,setMoneyDirty]=useState(false),[bookingState,setBookingState]=useState({dirty:false,pending:false});
  const [statusDraft,setStatusDraft]=useState<{id:string;revision:number;target:'COMPLETED'|'CANCELLED'|'NO_SHOW'|'RESERVED';reason:string;requestKey:string}|null>(null);
  const [purchasePlanId,setPurchasePlanId]=useState(""),[purchaseCustomerId,setPurchaseCustomerId]=useState("");
  const moneyRequest = useRef(crypto.randomUUID());
  const [moneyPanel, updateMoneyPanel] = useState<{
      kind: "collect" | "refund" | "card" | "move" | "link";
      ids: string[];
    } | null>(null),
    [customerPanel, setCustomerPanel] = useState(false);
  useCourseDraftGuard(moneyDirty||!!statusDraft?.reason.trim(),pending&&!!(moneyPanel||statusDraft));
  function closeBooking(){if(bookingState.pending)return;if(bookingState.dirty&&!window.confirm("尚有未送出的預約，確定離開？"))return;setBooking(false);setBookingState({dirty:false,pending:false});}
  function closeMoney(){if(pending||moneyDirty&&!window.confirm("尚有未送出的資料，確定離開？"))return;setMoneyPanel(null);}
  function setMoneyPanel(v: typeof moneyPanel) {
    setMoneyDirty(false);
    setPurchasePlanId("");setPurchaseCustomerId(v?.kind==='card'?v.ids[0]??"":"");
    moneyRequest.current = crypto.randomUUID();
    updateMoneyPanel(v);
  }
  const [detailId, setDetailId] = useState<string | null>(initialBooking ? null : initialCustomerId??null);
  const [techFilter] = useState(""),
    [roomFilter] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [receiptSearch,setReceiptSearch]=useState(''),[receiptKind,setReceiptKind]=useState(''),[receiptPage,setReceiptPage]=useState(0),[paymentId,setPaymentId]=useState<string|null>(null);
  const requestedArea=params.get('area');
  const operationsArea=requestedArea==='fees'&&data.report?'fees':requestedArea==='purchases'&&data.access.planAccess&&data.access.customerAccess?'purchases':'revenue';
  const receipts=data.payments.filter(p=>(!receiptKind||p.kind===receiptKind)&&`${p.note} ${p.amount}`.includes(receiptSearch));
  const financialDates=courseAnalysisRange(tab==='營運'?Object.fromEntries(params):{month:data.month});
  const [bookingSeed,setBookingSeed]=useState<{date?:string;time?:string;technicianId?:string;locationId?:string}>({});
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const navigate=(tab:string)=>router.push(`?tab=${encodeURIComponent(tab)}`,{scroll:false});
  function run(work: () => Promise<{ success: boolean; error?: string }>) {
    if (pending) return;
    start(async () => {
      setError("");
      try {
        const r = await work();
        if (r.success) {
          setMoneyPanel(null);
          setCustomerPanel(false);
          router.refresh();
        } else setError(r.error ?? "操作失敗");
      } catch {
        setError("連線失敗，請核對後重試");
      }
    });
  }
  const catalog = {
    policy: data.policy,
    services: data.services.filter((s) => s.active),
    locations: data.locations.filter(l=>l.isActive),
    techs: data.techs.filter((t) => t.active),
  };
  const appointments = data.items.filter(
    (b) =>
      `${b.personName} ${b.serviceName}`.includes(search) &&
      (!techFilter || b.technicianId === techFilter) &&
      (!roomFilter || b.locationId === roomFilter),
  );
  function status(
    id: string,
    revision: number,
    target: "COMPLETED" | "CANCELLED" | "NO_SHOW" | "RESERVED",
  ) {
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
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      {!['首頁','班表','顧客管理','顧客經營','營運','分析','位置管理','服務項目','收費方式','技師管理','設定'].includes(tab)&&<RosterToolbar label={tab+'搜尋與篩選'}><input className={field+' max-w-72'} aria-label="搜尋" placeholder="搜尋姓名、手機或服務" value={search} onChange={e=>setSearch(e.target.value)}/><button className={button} disabled={pending} onClick={()=>router.refresh()}>更新</button>{tab==='顧客管理'&&!readOnly&&data.manage.customer&&<button className={button+' !bg-primary-700 !text-white'} onClick={()=>setCustomerPanel(true)}>＋新增顧客</button>}</RosterToolbar>}
      {tab==='首頁'&&<BeautyHome data={data} readOnly={readOnly} onBook={()=>setBooking(true)} onNavigate={navigate}/>}
      {tab==='班表'&&<><BeautyScheduleWorkspace data={data} onOpen={setSelectedId} onCreate={seed=>{setBookingSeed(seed??{date:data.date});setBooking(true);}} pending={pending||calendarPending} onChange={changeCalendar} readOnly={readOnly} actions={<button className={button} disabled={calendarPending} onClick={()=>setListOpen(true)}>預約清單</button>}/>{calendarPending&&<p role="status" className="text-sm text-earth-500">更新班表中…</p>}</>}
      {(listOpen||selectedId)&&!moneyPanel&&!statusDraft&&<RightSheet open presentation="centered" className="fitness-management-editor" width={1200} labelledById="beauty-roster-title" closeOnEscape={!pending} onClose={()=>{if(!pending){setListOpen(false);setSelectedId(null);setChecked([]);}}}>
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b bg-primary-50/60 px-4"><div className="flex items-center gap-3">{selectedId&&listOpen&&<button className={button} disabled={pending} onClick={()=>setSelectedId(null)}>返回清單</button>}<h2 id="beauty-roster-title" className="font-semibold">{selectedId?'預約明細':'預約清單'}</h2></div><button className={button} disabled={pending} onClick={()=>{setListOpen(false);setSelectedId(null);setChecked([]);}}>關閉</button></header>
      {!selectedId&&<section className="min-h-0 space-y-2 overflow-auto p-4" aria-label="預約清單"><input className={field} aria-label="搜尋預約" placeholder="搜尋顧客或服務" value={search} onChange={e=>setSearch(e.target.value)}/><RosterToolbar label="預約名單操作">{!readOnly&&data.manage.collect&&checked.length>0&&<button className={button} onClick={()=>setMoneyPanel({kind:'collect',ids:checked})}>選取服務合併收款（{checked.length}位）</button>}</RosterToolbar><DataTable rows={appointments} rowKey={b=>b.id} columns={[
 {key:'select',header:'選取',accessor:b=><input type="checkbox" aria-label={`選取${b.personName}`} disabled={readOnly||!data.manage.collect||!!b.cardId||b.status==='CANCELLED'} checked={checked.includes(b.id)} onChange={e=>setChecked(v=>e.target.checked?[...v,b.id]:v.filter(id=>id!==b.id))}/>},
 {key:'time',header:'預約時間',accessor:b=>formatTWDateTime(new Date(b.startsAt))},{key:'name',header:'顧客／服務',accessor:b=><button className="min-h-11 text-primary-800" onClick={()=>setSelectedId(b.id)}>{b.personName}｜{b.serviceName}</button>},{key:'tech',header:'技師／位置',accessor:b=>`${data.techs.find(t=>t.id===b.technicianId)?.name??'店家安排'}／${data.locations.find(l=>l.id===b.locationId)?.name??'—'}`},
 {key:'status',header:'狀態',accessor:b=>({RESERVED:'已預約',COMPLETED:'已完成',CANCELLED:'已取消',NO_SHOW:'未到'}[b.status]??b.status)},
 {key:'actions',header:'操作',sticky:'right',accessor:b=><RosterMoreMenu name={b.personName} onOpen={()=>setSelectedId(b.id)}/>}
 ]}/></section>}
      {selectedId&&<div className="min-h-0 overflow-y-auto p-4">{data.items.filter(b=>b.id===selectedId).map(b=>(
            <article
              key={b.id}
              className="space-y-2 rounded-xl border border-earth-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="checkbox"
                  disabled={
                    readOnly || !data.manage.collect ||
                    !!b.cardId ||
                    b.status === "CANCELLED"
                  }
                  aria-label={`選取${b.personName}`}
                  checked={checked.includes(b.id)}
                  onChange={(e) =>
                    setChecked((c) =>
                      e.target.checked
                        ? [...c, b.id]
                        : c.filter((id) => id !== b.id),
                    )
                  }
                />
                <strong>
                  {formatTWDateTime(new Date(b.startsAt))}　{b.personName}｜
                  {b.serviceName}
                </strong>
                <span>
                  {
                    (
                      {
                        RESERVED: "已預約",
                        COMPLETED: "已完成",
                        CANCELLED: "已取消",
                        NO_SHOW: "未到",
                      } as Record<string, string>
                    )[b.status]
                  }
                </span>
              </div>
              <p>
                {data.techs.find((t) => t.id === b.technicianId)?.name ??
                  "技師"}
                ｜
                {data.locations.find((l) => l.id === b.locationId)?.name ??
                  "位置"}
                ｜結束 {formatTWDateTime(new Date(b.endsAt))}｜
                {b.cardId ? "使用方案1次" : `NT$${b.price}`}
              </p>
              <details>
                <summary className="min-h-11 cursor-pointer py-2">
                  同行與備註
                </summary>
                <p>
                  同組：
                  {data.items
                    .filter((x) => x.groupId === b.groupId)
                    .map((x) => x.personName)
                    .join("、")}
                </p>
                <p>
                  {b.personPhone}　{b.notes || "無本次備註"}
                </p>
              </details>
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  {data.manage.update && b.status === "RESERVED" && (
                    <>
                      <button
                        disabled={pending}
                        className={button}
                        onClick={() => status(b.id, b.revision, "COMPLETED")}
                      >
                        服務完成
                      </button>
                      <button
                        disabled={pending}
                        className={button}
                        onClick={() => status(b.id, b.revision, "NO_SHOW")}
                      >
                        未到
                      </button>
                      <button
                        className={button}
                        onClick={() =>
                          setMoneyPanel({ kind: "move", ids: [b.id] })
                        }
                      >
                        改期／換技師位置
                      </button>
                    </>
                  )}
                  <button
                    disabled={pending || !data.manage.update}
                    className={button}
                    onClick={() =>
                      status(
                        b.id,
                        b.revision,
                        b.status === "CANCELLED" ? "RESERVED" : "CANCELLED",
                      )
                    }
                  >
                    {b.status === "CANCELLED" ? "恢復預約" : "取消"}
                  </button>
                  {b.status !== "RESERVED" && b.status !== "CANCELLED" && (
                    <button
                      className={button}
                      disabled={pending}
                      onClick={() => status(b.id, b.revision, "RESERVED")}
                    >
                      更正回預約
                    </button>
                  )}
                  {!b.customerId &&
                    data.manage.update &&
                    data.access.customerAccess && (
                      <button
                        className={button}
                        onClick={() =>
                          setMoneyPanel({ kind: "link", ids: [b.id] })
                        }
                      >
                        核對並連結顧客
                      </button>
                    )}
                  {data.manage.collect && !b.cardId && (
                    <button
                      className={button}
                      onClick={() =>
                        setMoneyPanel({ kind: "collect", ids: [b.id] })
                      }
                    >
                      收款
                    </button>
                  )}
                  <button
                    disabled={!data.manage.card}
                    className={button}
                    onClick={() =>
                      setMoneyPanel({
                        kind: "card",
                        ids: b.customerId ? [b.customerId] : [],
                      })
                    }
                  >
                    購買方案
                  </button>
                </div>
              )}
            </article>
      ))}</div>}</RightSheet>}
      {tab==='顧客管理'&&<section className="space-y-3"><RosterToolbar label="顧客管理操作"><span className="text-sm text-earth-500">共 {data.customers.length} 人</span>{!readOnly&&data.manage.customer&&<button className={button+' ml-auto !bg-primary-700 !text-white'} onClick={()=>setCustomerPanel(true)}>＋新增顧客</button>}</RosterToolbar><CourseCustomerList rows={data.customers.map(c=>({...c,mergedIntoCustomerId:null,userStatus:c.user?.status??null,serviceNote:c.notes,validPackageSessions:0,sponsoredCount:c._count.sponsoredCustomers}))} cards={[]} sportsNative basePath="/dashboard/beauty?tab=顧客管理" sessionUnitLabel="次" sessionBalances={data.cards.filter(k=>!k.closedAt&&Date.parse(k.expiresAt)>data.now).flatMap(k=>k.memberIds.map(customerId=>({customerId,available:Math.max(0,k.remaining-k.held)})))} canReadCards={data.access.planAccess} onView={setDetailId} onCreate={!readOnly&&data.manage.customer?()=>setCustomerPanel(true):undefined} onAssign={!readOnly&&data.manage.card?id=>setMoneyPanel({kind:'card',ids:[id]}):undefined}/></section>}
      {tab==='顧客經營'&&careContent}
      {tab==='分析'&&analyticsContent}
      {tab === "營運" && (
        <section className="space-y-4">
          {operationsNavigation}
          <CustomerPanelTabs ariaLabel="營運分類" value={operationsArea} items={[{id:'revenue',label:'收退款明細'},...(data.access.planAccess&&data.access.customerAccess?[{id:'purchases',label:'待核帳'}]:[]),...(data.report?[{id:'fees',label:'技師月結'}]:[])]} onSelect={id=>{const q=new URLSearchParams(params.toString());q.set('area',id);router.push('?'+q,{scroll:false});}}/>
          <div hidden={operationsArea!=='purchases'}>
          <h2 className="font-semibold">待核帳</h2>
          {data.purchases.map((p) => (
            <div key={p.id} className="flex flex-wrap gap-3 border-b py-3">
              <span>
                {data.customers.find((c) => c.id === p.customerId)?.name}
                ｜後四碼{p.lastFour}
              </span>
              {!readOnly && data.manage.card && (
                <button
                  className={button}
                  onClick={() =>
                    run(() =>
                      confirmBeautyPurchase({
                        id: p.id,
                        requestKey: crypto.randomUUID(),
                      }),
                    )
                  }
                >
                  確認入帳並發方案
                </button>
              )}
            </div>
          ))}
          </div><div hidden={operationsArea!=='revenue'} className="space-y-3">
          <ReportDateRange compact preserveQuery activePreset={params.get('startDate')?'custom':params.get('preset')??'month'} {...financialDates}/>
          <RosterToolbar label="收退款篩選"><input className={field+' max-w-72'} aria-label="搜尋收退款" placeholder="搜尋備註或金額" value={receiptSearch} onChange={e=>{setReceiptSearch(e.target.value);setReceiptPage(0);}}/><select className={button} aria-label="交易類型" value={receiptKind} onChange={e=>{setReceiptKind(e.target.value);setReceiptPage(0);}}><option value="">全部類型</option><option value="SALE">收款</option><option value="REFUND">退款</option><option value="FEE">技師付款</option><option value="FEE_VOID">拆帳收回</option></select><span>共 {receipts.length} 筆</span></RosterToolbar>
          <h2 className="font-semibold">收款與退款紀錄</h2>
          <DataTable rows={receipts.slice(receiptPage*20,receiptPage*20+20)} rowKey={p=>p.id} columns={[{key:'date',header:'入帳時間',accessor:p=>formatTWDateTime(new Date(p.createdAt))},{key:'kind',header:'類型',accessor:p=>({SALE:'收款',REFUND:'退款',FEE:'技師付款',FEE_VOID:'拆帳收回'} as Record<string,string>)[p.kind]??p.kind},{key:'amount',header:'金額',align:'right',accessor:p=>`NT$ ${p.amount.toLocaleString('zh-TW')}`},{key:'method',header:'付款方式',accessor:p=>({CASH:'現金',BANK_TRANSFER:'轉帳',CARD:'刷卡',OTHER:'其他'} as Record<string,string>)[p.method]??p.method},{key:'note',header:'備註',accessor:p=>p.note},{key:'actions',header:'操作',sticky:'right',accessor:p=><RosterMoreMenu openLabel="查看收退款明細" name="交易" onOpen={()=>setPaymentId(p.id)}/>}]} />
          {receipts.length>20&&<nav aria-label="收退款分頁" className="flex justify-end gap-3 text-sm"><button className={button} disabled={!receiptPage} onClick={()=>setReceiptPage(receiptPage-1)}>上一頁</button><span>{receiptPage+1}／{Math.ceil(receipts.length/20)}</span><button className={button} disabled={(receiptPage+1)*20>=receipts.length} onClick={()=>setReceiptPage(receiptPage+1)}>下一頁</button></nav>}
          </div>
          {data.report && (

            <section hidden={operationsArea!=='fees'} className="space-y-3">
              <h2 className="font-semibold">技師拆帳月結｜{data.month}</h2>
              <form className="flex gap-2">
                <input type="hidden" name="tab" value="營運" /><input type="hidden" name="area" value="fees"/>
                <input
                  className={field}
                  type="month"
                  name="month"
                  defaultValue={data.month}
                />
                <button className={button}>查看</button>
              </form>
              <BeautyFeeSummary data={data}/>
              {!readOnly && data.manage.feeConfirm && (
                <button
                  disabled={pending}
                  className={button}
                  onClick={() =>
                    run(() =>
                      confirmBeautySettlement({
                        requestKey: crypto.randomUUID(),
                        month: data.month,
                        fingerprint: data.report!.fingerprint,
                      }),
                    )
                  }
                >
                  確認本月拆帳
                </button>
              )}
            </section>
          )}
        </section>
      )}
      {['位置管理','服務項目','收費方式','技師管理'].includes(tab)&&<fieldset disabled={pending} aria-busy={pending} className="min-w-0">{pending&&<p role="status" className="py-2 text-sm text-earth-500">更新資料中…</p>}<BeautyManagementList key={tab} tab={tab} data={data} canEdit={!readOnly&&canEditTab} onEdit={(kind,draft)=>{if(!pending&&(draft||(!readOnly&&canEditTab)))setEditor({kind,draft:draft as Record<string,unknown>|undefined});}}/></fieldset>}
      {tab==='設定'&&<SettingsWorkspaceFrame nav={<SettingsWorkspaceNav items={[{id:'store',label:'店家資料'},{id:'booking',label:'營業與預約'},{id:'commerce',label:'收款與體驗'},{id:'notifications',label:'通知與顧客經營'},{id:'subscription',label:'系統方案與用量'}]} activeId={settingsCategory} onSelect={id=>router.push(`?tab=${encodeURIComponent('設定')}&section=${id}`,{scroll:false})}/>}>
      <div hidden={settingsCategory!=='store'}>{settingsStoreContent}</div>
      {settingsCategory==='subscription'&&settingsSubscriptionContent}
      {settingsCategory==='booking'&&<><SettingsListRow title="營業時間與公休" summary="每週營業時間、特殊日期與公休" href="/dashboard/beauty?tab=設定&section=booking&panel=hours" expanded={false}/><SettingsListRow title="預約與取消規則" summary={`自行預約${data.policy.selfBooking?'開啟':'關閉'} · 開放${data.policy.bookableDays}天 · 取消${data.policy.cancelDeduct?'扣次':'不扣次'} · 未到${data.policy.noShowDeduct?'扣次':'不扣次'}`} expanded={false} onEdit={!readOnly&&canEditTab?()=>setEditor({kind:'settings'}):undefined}/></>}
      {settingsCategory==='commerce'&&<><SettingsListRow title="銀行與收款資料" summary="銀行帳戶、轉帳資訊與付款聯繫" href="/dashboard/beauty?tab=設定&section=commerce&panel=payment" expanded={false}/><SettingsListRow title="公開體驗表單" summary="每人每項服務限體驗一次" href={`/beauty-trial/${slug}`} action="查看" expanded={false}/></>}
      {settingsCategory==='notifications'&&<>{settingsLabelsContent}<SettingsListRow title="顧客關懷" summary="生日、未回店、方案與體驗追蹤" href="/dashboard/beauty?tab=顧客經營" action="查看" expanded={false}/><SettingsListRow title="LINE 官方帳號" summary="帳號連結與登入設定" href="/dashboard/beauty?tab=設定&section=notifications&panel=line" expanded={false}/><SettingsListRow title="服務通知" summary={data.policy.notifications?'店家設定開啟':'關閉'} expanded={false} onEdit={!readOnly&&canEditTab?()=>setEditor({kind:'settings',settingsSection:'notifications'}):undefined}/></>}
      </SettingsWorkspaceFrame>}
      {statusDraft&&<RightSheet open presentation="centered" className="fitness-management-editor" width={520} fitContent labelledById="beauty-status-title" closeOnEscape={!pending} onClose={()=>{if(!pending&&(!statusDraft.reason||window.confirm('尚未確認，確定離開？')))setStatusDraft(null);}}><form className="space-y-3 p-4" onSubmit={e=>{e.preventDefault();if(!pending&&!readOnly&&data.manage.update&&statusDraft.reason.trim())run(async()=>{const r=await changeBeautyStatus('manager',statusDraft);if(r.success)setStatusDraft(null);return r;});}}><h2 id="beauty-status-title" className="font-semibold">確認服務狀態變更</h2><p>{data.items.find(b=>b.id===statusDraft.id)?.personName} · {data.items.find(b=>b.id===statusDraft.id)?.serviceName}</p><p>{({COMPLETED:'服務完成',CANCELLED:'取消此服務分項',NO_SHOW:'標記未到',RESERVED:'恢復／更正回預約'})[statusDraft.target]}</p><label>操作原因<textarea className={field} required maxLength={500} disabled={pending} value={statusDraft.reason} onChange={e=>setStatusDraft({...statusDraft,reason:e.target.value})}/></label>{error&&<p role="alert" className="text-red-700">{error}</p>}<div className="flex justify-end gap-3"><button type="button" className={button} disabled={pending} onClick={()=>{if(!statusDraft.reason||window.confirm('尚未確認，確定離開？'))setStatusDraft(null);}}>返回</button><button className={button+' !bg-primary-700 !text-white'} disabled={pending||readOnly||!data.manage.update||!statusDraft.reason.trim()}>{pending?'處理中…':'確認'}</button></div></form></RightSheet>}
      {paymentId&&<RightSheet open width={640} onClose={()=>setPaymentId(null)} labelledById="beauty-receipt-title"><header className="flex items-center justify-between border-b p-4"><h2 id="beauty-receipt-title">收退款明細</h2><button className={button} onClick={()=>setPaymentId(null)}>關閉</button></header><div className="space-y-3 overflow-y-auto p-4">{data.payments.filter(p=>p.id===paymentId).map(p=><section key={p.id}><p>{formatTWDateTime(new Date(p.createdAt))}</p><strong>NT$ {p.amount.toLocaleString('zh-TW')}</strong><p className="whitespace-pre-wrap">{p.note}</p><div className="flex gap-2">{p.kind==='SALE'&&!readOnly&&data.manage.refund&&<button className={button} onClick={()=>setMoneyPanel({kind:'refund',ids:[p.id]})}>登錄退款</button>}</div></section>)}</div></RightSheet>}
      {booking && (
        <RightSheet
          open
          presentation="centered"
          width={1000}
          onClose={closeBooking}
          closeOnEscape={!bookingState.pending}
          labelledById="beauty-booking-title"
        >
          <div className="min-h-0 overflow-y-auto p-4">
            <h2 id="beauty-booking-title" className="mb-4 font-semibold">
              新增預約
            </h2>
            <BeautyBookingForm
              catalog={catalog}
              mode="manager"
              onStateChange={setBookingState}
              initialDate={bookingSeed.date??data.date}
              initialTime={bookingSeed.time}
              initialTechnicianId={bookingSeed.technicianId}
              initialLocationId={bookingSeed.locationId}
              customer={data.customers.find(c=>c.id===initialCustomerId)}
              slug={slug}
              cards={data.cards.map((c) => ({ ...c, closed: !!c.closedAt }))}
              members={data.customers}
              onBooked={() => router.refresh()}
            />
            <button className={button} disabled={bookingState.pending} onClick={closeBooking}>
              關閉
            </button>
          </div>
        </RightSheet>
      )}
      {editor && (
        <BeautyCatalogEditor
          kind={editor.kind}
          settingsSection={editor.settingsSection}
          readOnly={readOnly||!canEditTab}
          data={data}
          draft={editor.draft}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            start(()=>router.refresh());
          }}
        />
      )}
      {detailId && (
        <BeautyCustomerPanel
          id={detailId}
          data={data}
          readOnly={readOnly}
          onClose={() => setDetailId(null)}
        />
      )}
      {customerPanel && (
        <RightSheet
          open
          presentation="centered"
          onClose={() => !pending && setCustomerPanel(false)}
          labelledById="beauty-customer-title"
        >
          <form
            className="space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(() =>
                saveBeautyCustomer({
                  name: f.get("name"),
                  phone: f.get("phone"),
                  notes: f.get("notes"),
                }),
              );
            }}
          >
            <h2 id="beauty-customer-title">新增顧客</h2>
            <label>
              姓名
              <input className={field} required name="name" />
            </label>
            <label>
              手機
              <input className={field} required type="tel" name="phone" />
            </label>
            <label>
              備註
              <textarea className={field} name="notes" />
            </label>
            <button className={button} disabled={pending}>
              儲存
            </button>
          </form>
        </RightSheet>
      )}
      {moneyPanel && (
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
                requestKey = moneyRequest.current,
                method = String(f.get("method") ?? "OTHER"),
                note = String(f.get("note") ?? "");
              if (moneyPanel.kind === "link") {
                const b = data.items.find((b) => b.id === moneyPanel.ids[0])!;
                run(() =>
                  linkBeautyCustomer({
                    id: b.id,
                    revision: b.revision,
                    customerId: f.get("customerId"),
                    requestKey,
                  }),
                );
              }
              if (moneyPanel.kind === "collect")
                run(() =>
                  collectBeautyPayment({
                    requestKey,
                    ids: moneyPanel.ids,
                    amounts: moneyPanel.ids.map((id) => Number(f.get(id))),
                    method,
                    note,
                  }),
                );
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
              if (moneyPanel.kind === "card")
                run(() =>
                  purchaseBeautyPlan({
                    requestKey,
                    planId: f.get("planId"),
                    customerId: f.get("customerId"),
                    memberIds: f.getAll("memberIds"),
                    paid: Number(f.get("amount")),
                    method,
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
                );
              }
            }}
          >
            <h2 id="beauty-money-title">
              {
                {
                  collect: "服務收款",
                  link: "核對並連結顧客（請先確認本人身分）",
                  refund: "登錄退款（不自動退刷）",
                  card: "購買方案",
                  move: "改期／換技師位置",
                }[moneyPanel.kind]
              }
            </h2>
            {moneyPanel.kind === "collect"
              ? moneyPanel.ids.map((id) => {
                  const b = data.items.find((b) => b.id === id);
                  return (
                    <label className="block" key={id}>
                      {b?.personName}｜{b?.serviceName}
                      <input
                        className={field}
                        type="number"
                        min={0}
                        required
                        name={id}
                        defaultValue={b?.price}
                      />
                    </label>
                  );
                })
              : moneyPanel.kind !== "move" &&
                moneyPanel.kind !== "link" && (
                  <label>
                    金額
                    <input
                      required
                      className={field}
                      type="number"
                      min={0}
                      name="amount"
                    />
                  </label>
                )}
            {moneyPanel.kind === "link" && (
              <label>
                已核對的顧客
                <select className={field} required name="customerId">
                  <option value="">請選擇</option>
                  {data.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}｜{c.phone}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {moneyPanel.kind === "card" && (
              <>
                <label>
                  購買人
                  <select
                    required
                    className={field}
                    name="customerId"
                    value={purchaseCustomerId} onChange={e=>setPurchaseCustomerId(e.target.value)}
                  >
                    <option value="">請選擇</option>
                    {data.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  方案
                  <select className={field} required name="planId" value={purchasePlanId} onChange={e=>setPurchasePlanId(e.target.value)}>
                    <option value="">請選擇</option>
                    {data.plans
                      .filter((p) => p.active)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}｜{p.sessions}次｜NT${p.price}
                          {p.allowShared ? "｜可共用" : ""}
                        </option>
                      ))}
                  </select>
                </label>
                {purchaseCustomerId&&data.plans.find(p=>p.id===purchasePlanId)?.allowShared&&<BeautySharedMembers key={purchasePlanId+purchaseCustomerId} customers={data.customers} ownerId={purchaseCustomerId}/>}

              </>
            )}
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
            {moneyPanel.kind !== "move" && moneyPanel.kind !== "link" && (
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
    </div>
  );
}
