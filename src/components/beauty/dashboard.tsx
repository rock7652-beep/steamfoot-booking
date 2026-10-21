"use client";
import {BusinessMetric} from "@/components/admin/business-metric";
import {DataTable} from '@/components/desktop';
import {CourseCustomerList} from '@/app/(dashboard)/dashboard/courses/customer-list';
import {RosterToolbar,RosterMoreMenu} from '@/components/admin/roster-primitives';
import {SettingsWorkspaceFrame,SettingsWorkspaceNav} from '@/components/settings';
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
  voidBeautyFee,
  confirmBeautyPurchase,
  changeBeautyStatus,
  collectBeautyPayment,
  purchaseBeautyPlan,
  refundBeautyPayment,
  confirmBeautySettlement,
  payBeautyFee,
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
  data,
  tab,
  slug,
  readOnly = false,
  careContent,operationsNavigation,initialCustomerId,initialBooking=false,
}: {
  data: BeautyDashboardData;
  tab: BeautyTab;
  slug: string;
  readOnly?: boolean;
  careContent?:ReactNode;operationsNavigation?:ReactNode;initialCustomerId?:string;initialBooking?:boolean;
}) {
  const params=useSearchParams(),settingsCategory=params.get("section")??"booking";
  const router = useRouter(),
    [pending, start] = useTransition(),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [booking, setBooking] = useState(initialBooking),
    [editor, setEditor] = useState<{
      kind: EditorKind;
      draft?: Record<string, unknown>;
    } | null>(null);
  const moneyRequest = useRef(crypto.randomUUID());
  const [moneyPanel, updateMoneyPanel] = useState<{
      kind: "collect" | "refund" | "card" | "fee" | "move" | "void" | "link";
      ids: string[];
    } | null>(null),
    [customerPanel, setCustomerPanel] = useState(false);
  function setMoneyPanel(v: typeof moneyPanel) {
    moneyRequest.current = crypto.randomUUID();
    updateMoneyPanel(v);
  }
  const [detailId, setDetailId] = useState<string | null>(initialBooking ? null : initialCustomerId??null);
  const [techFilter] = useState(""),
    [roomFilter] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
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
    const reason = window.prompt("請填寫操作原因");
    if (reason?.trim())
      run(() =>
        changeBeautyStatus("manager", {
          requestKey: crypto.randomUUID(),
          id,
          revision,
          target,
          reason,
        }),
      );
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
  const total = data.payments
    .filter((p) => ["SALE", "REFUND"].includes(p.kind))
    .reduce((n, p) => n + p.amount, 0);
  return (
    <div className="course-workspace min-w-0 space-y-3">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      {!['首頁','班表','顧客管理','顧客經營','營運','分析','位置管理','服務項目','收費方式','技師管理','設定'].includes(tab)&&<RosterToolbar label={tab+'搜尋與篩選'}><input className={field+' max-w-72'} aria-label="搜尋" placeholder="搜尋姓名、手機或服務" value={search} onChange={e=>setSearch(e.target.value)}/><button className={button} disabled={pending} onClick={()=>router.refresh()}>更新</button>{tab==='顧客管理'&&!readOnly&&data.manage.customer&&<button className={button+' !bg-primary-700 !text-white'} onClick={()=>setCustomerPanel(true)}>＋新增顧客</button>}</RosterToolbar>}
      {tab==='首頁'&&<BeautyHome data={data} readOnly={readOnly} onBook={()=>setBooking(true)} onNavigate={navigate}/>}
      {tab==='班表'&&<><BeautyScheduleWorkspace data={data} onOpen={setSelectedId} onCreate={()=>setBooking(true)} pending={pending} readOnly={readOnly}/><section className="space-y-2" aria-label="預約名單"><RosterToolbar label="預約名單操作"><h2 className="text-sm font-semibold">預約名單</h2>{!readOnly&&data.manage.collect&&checked.length>0&&<button className={button} onClick={()=>setMoneyPanel({kind:'collect',ids:checked})}>選取服務合併收款（{checked.length}位）</button>}</RosterToolbar><DataTable rows={appointments} rowKey={b=>b.id} columns={[
 {key:'select',header:'選取',accessor:b=><input type="checkbox" aria-label={`選取${b.personName}`} disabled={readOnly||!data.manage.collect||!!b.cardId||b.status==='CANCELLED'} checked={checked.includes(b.id)} onChange={e=>setChecked(v=>e.target.checked?[...v,b.id]:v.filter(id=>id!==b.id))}/>},
 {key:'time',header:'預約時間',accessor:b=>formatTWDateTime(new Date(b.startsAt))},{key:'name',header:'顧客／服務',accessor:b=><button className="min-h-11 text-primary-800" onClick={()=>setSelectedId(b.id)}>{b.personName}｜{b.serviceName}</button>},{key:'tech',header:'技師／位置',accessor:b=>`${data.techs.find(t=>t.id===b.technicianId)?.name??'店家安排'}／${data.locations.find(l=>l.id===b.locationId)?.name??'—'}`},
 {key:'status',header:'狀態',accessor:b=>({RESERVED:'已預約',COMPLETED:'已完成',CANCELLED:'已取消',NO_SHOW:'未到'}[b.status]??b.status)},
 {key:'actions',header:'操作',sticky:'right',accessor:b=><RosterMoreMenu name={b.personName} onOpen={()=>setSelectedId(b.id)}/>}
 ]}/></section></>}
      {selectedId&&<RightSheet open width={960} onClose={()=>!pending&&setSelectedId(null)} closeOnEscape={!pending} labelledById="beauty-appointment-title"><header className="flex min-h-14 items-center justify-between border-b px-4"><h2 id="beauty-appointment-title" className="font-semibold">預約明細</h2><button className={button} disabled={pending} onClick={()=>setSelectedId(null)}>關閉</button></header><div className="min-h-0 overflow-y-auto p-4">{data.items.filter(b=>b.id===selectedId).map(b=>(
            <article
              key={b.id}
              className="space-y-2 rounded-xl border border-earth-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="checkbox"
                  disabled={
                    !data.manage.collect ||
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
      ))}</div></RightSheet>}
      {tab==='顧客管理'&&<section className="space-y-3"><RosterToolbar label="顧客管理操作"><span className="text-sm text-earth-500">共 {data.customers.length} 人</span>{!readOnly&&data.manage.customer&&<button className={button+' ml-auto !bg-primary-700 !text-white'} onClick={()=>setCustomerPanel(true)}>＋新增顧客</button>}</RosterToolbar><CourseCustomerList rows={data.customers.map(c=>({...c,mergedIntoCustomerId:null,userStatus:c.user?.status??null,serviceNote:c.notes,validPackageSessions:0,sponsoredCount:c._count.sponsoredCustomers}))} cards={[]} sportsNative basePath="/dashboard/beauty?tab=顧客管理" sessionUnitLabel="次" sessionBalances={data.cards.filter(k=>!k.closedAt&&Date.parse(k.expiresAt)>data.now).flatMap(k=>k.memberIds.map(customerId=>({customerId,available:Math.max(0,k.remaining-k.held)})))} canReadCards={data.access.planAccess} onView={setDetailId} onCreate={!readOnly&&data.manage.customer?()=>setCustomerPanel(true):undefined} onAssign={!readOnly&&data.manage.card?id=>setMoneyPanel({kind:'card',ids:[id]}):undefined}/></section>}
      {tab==='顧客經營'&&careContent}
      {tab === "分析" && (
        <form className="flex flex-wrap gap-2">
          <input type="hidden" name="tab" value="分析" />
          <label>
            月份
            <input
              className={field}
              type="month"
              name="month"
              defaultValue={data.month}
            />
          </label>
          <button className={button}>查看</button>
        </form>
      )}
      {tab==='分析'&&<div className="space-y-3"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><BusinessMetric label="預約人次" value={String(data.analytics.filter(r=>r.status!=='CANCELLED').reduce((n,r)=>n+r._count.id,0))}/><BusinessMetric label="完成服務" value={String(data.analytics.filter(r=>r.status==='COMPLETED').reduce((n,r)=>n+r._count.id,0))}/>{data.access.financeAccess&&<BusinessMetric label="淨收款" value={`NT$ ${total.toLocaleString('zh-TW')}`} note="依收退款入帳日，含方案銷售"/>}{data.access.planAccess&&<BusinessMetric label="有效方案" value={String(data.cards.filter(c=>!c.closedAt&&Date.parse(c.expiresAt)>data.now).length)}/>}</div><DataTable columns={[{key:'service',header:'服務項目',accessor:r=>r.serviceName},{key:'status',header:'狀態',accessor:r=>({RESERVED:'預約',COMPLETED:'完成',CANCELLED:'取消',NO_SHOW:'未到'}[r.status]??r.status)},{key:'count',header:'人次',accessor:r=>r._count.id}]} rows={data.analytics} rowKey={r=>r.serviceName+r.status}/><details className="rounded-xl border border-earth-200 bg-white p-4 text-sm text-earth-600"><summary className="min-h-11 cursor-pointer">統計方式與歸屬</summary><p>服務依預約開始日期統計，收退款依實際入帳日期。方案銷售計入收款，技師拆帳另列；不重複加計現金帳。</p></details></div>}
      {tab === "營運" && (
        <section className="space-y-4">
          {operationsNavigation}
          <form className="flex flex-wrap gap-2">
            <input type="hidden" name="tab" value="營運" />
            <label>
              月份
              <input
                className={field}
                type="month"
                name="month"
                defaultValue={data.month}
              />
            </label>
            <button className={button}>查看</button>
          </form>
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
          <h2 className="font-semibold">收款與退款紀錄</h2>
          <DataTable rows={data.payments} rowKey={p=>p.id} columns={[{key:'date',header:'入帳時間',accessor:p=>formatTWDateTime(new Date(p.createdAt))},{key:'kind',header:'類型',accessor:p=>({SALE:'收款',REFUND:'退款',FEE:'技師付款',FEE_VOID:'拆帳收回'} as Record<string,string>)[p.kind]??p.kind},{key:'amount',header:'金額',align:'right',accessor:p=>`NT$ ${p.amount.toLocaleString('zh-TW')}`},{key:'method',header:'付款方式',accessor:p=>({CASH:'現金',BANK_TRANSFER:'轉帳',CARD:'刷卡',OTHER:'其他'} as Record<string,string>)[p.method]??p.method},{key:'note',header:'備註',accessor:p=>p.note},{key:'actions',header:'操作',sticky:'right',accessor:p=><div className="flex gap-2">              {p.kind === "FEE" && !readOnly && data.manage.feePay && (
                <button
                  className={button}
                  onClick={() => setMoneyPanel({ kind: "void", ids: [p.id] })}
                >
                  登錄拆帳收回
                </button>
              )}
              {p.kind === "SALE" && !readOnly && data.manage.refund && (
                <button
                  className={button}
                  onClick={() => setMoneyPanel({ kind: "refund", ids: [p.id] })}
                >
                  登錄退款
                </button>
              )}
</div>}]} />
          {data.report && (
            <section className="space-y-3">
              <h2 className="font-semibold">技師拆帳月結｜{data.month}</h2>
              <form className="flex gap-2">
                <input type="hidden" name="tab" value="營運" />
                <input
                  className={field}
                  type="month"
                  name="month"
                  defaultValue={data.month}
                />
                <button className={button}>查看</button>
              </form>
              <DataTable rows={data.report.lines} rowKey={l=>l.id} columns={[
                {key:'technician',header:'技師',accessor:l=>data.techs.find(t=>t.id===l.technicianId)?.name??'—'},
                {key:'date',header:'服務日期',accessor:l=>formatTWDateTime(new Date(l.date))},
                {key:'customer',header:'顧客',accessor:l=>l.personName},
                {key:'service',header:'服務項目',accessor:l=>l.serviceName},
                {key:'fee',header:'應付',align:'right',accessor:l=>l.fee.toLocaleString('zh-TW')},
                {key:'paid',header:'已付',align:'right',accessor:l=>l.paid.toLocaleString('zh-TW')},
                {key:'actions',header:'操作',sticky:'right',accessor:l=>!readOnly&&data.manage.feePay?<button className={button} onClick={()=>setMoneyPanel({kind:'fee',ids:[l.id]})}>登錄付款</button>:null},
              ]}/>
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
      {['位置管理','服務項目','收費方式','技師管理'].includes(tab)&&<BeautyManagementList key={tab} tab={tab} data={data} canEdit={!readOnly&&canEditTab} onEdit={(kind,draft)=>{if(draft||(!readOnly&&canEditTab))setEditor({kind,draft:draft as Record<string,unknown>|undefined});}}/>}
      {tab==='設定'&&<SettingsWorkspaceFrame nav={<SettingsWorkspaceNav items={[{id:'booking',label:'營業與預約'},{id:'commerce',label:'收款與體驗'},{id:'notifications',label:'通知與顧客經營'}]} activeId={settingsCategory} onSelect={id=>router.push(`?tab=${encodeURIComponent('設定')}&section=${id}`,{scroll:false})}/>}>
      {settingsCategory==='booking'&&<><SettingsListRow title="營業時間與公休" summary="每週營業時間、特殊日期與公休" href="/dashboard/settings/hours" expanded={false}/><SettingsListRow title="預約與取消規則" summary={`自行預約${data.policy.selfBooking?'開啟':'關閉'} · 開放${data.policy.bookableDays}天 · 取消${data.policy.cancelDeduct?'扣次':'不扣次'} · 未到${data.policy.noShowDeduct?'扣次':'不扣次'}`} expanded={false} onEdit={!readOnly&&canEditTab?()=>setEditor({kind:'settings'}):undefined}/></>}
      {settingsCategory==='commerce'&&<><SettingsListRow title="銀行與收款資料" summary="銀行帳戶、轉帳資訊與付款聯繫" href="/dashboard/settings/payment" expanded={false}/><SettingsListRow title="公開體驗表單" summary="每人每項服務限體驗一次" href={`/beauty-trial/${slug}`} action="查看" expanded={false}/></>}
      {settingsCategory==='notifications'&&<><SettingsListRow title="LINE 官方帳號" summary="帳號連結與登入設定" href="/dashboard/settings/line-official-accounts" expanded={false}/><SettingsListRow title="服務通知" summary={data.policy.notifications?'店家設定開啟':'關閉'} expanded={false}/></>}
      </SettingsWorkspaceFrame>}
      {booking && (
        <RightSheet
          open
          presentation="centered"
          width={1000}
          onClose={() => {
            if (window.confirm("確定關閉預約表單？未送出資料將捨棄。"))
              setBooking(false);
          }}
          labelledById="beauty-booking-title"
        >
          <div className="min-h-0 overflow-y-auto p-4">
            <h2 id="beauty-booking-title" className="mb-4 font-semibold">
              新增預約
            </h2>
            <BeautyBookingForm
              catalog={catalog}
              mode="manager"
              customer={data.customers.find(c=>c.id===initialCustomerId)}
              slug={slug}
              cards={data.cards.map((c) => ({ ...c, closed: !!c.closedAt }))}
              members={data.customers}
              onBooked={() => router.refresh()}
            />
            <button className={button} onClick={() => {if(window.confirm("確定關閉預約表單？未送出資料將捨棄。"))setBooking(false);}}>
              關閉
            </button>
          </div>
        </RightSheet>
      )}
      {editor && (
        <BeautyCatalogEditor
          kind={editor.kind}
          readOnly={readOnly||!canEditTab}
          data={data}
          draft={editor.draft}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            router.refresh();
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
          width={700}
          onClose={() => !pending && setMoneyPanel(null)}
          labelledById="beauty-money-title"
        >
          <form
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
              if (moneyPanel.kind === "void")
                run(() =>
                  voidBeautyFee({
                    requestKey,
                    paymentId: moneyPanel.ids[0],
                    amount: Number(f.get("amount")),
                    method,
                    reason: note,
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
              if (moneyPanel.kind === "fee")
                run(() =>
                  payBeautyFee({
                    requestKey,
                    id: moneyPanel.ids[0],
                    amount: Number(f.get("amount")),
                    method,
                    note,
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
                  void: "登錄已收回的拆帳（不執行轉帳）",
                  refund: "登錄退款（不自動退刷）",
                  card: "購買方案",
                  fee: "技師拆帳付款",
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
                    defaultValue={moneyPanel.ids[0] ?? ""}
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
                  <select className={field} required name="planId">
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
                <fieldset>
                  <legend>具名共用成員（僅允許共用方案）</legend>
                  {data.customers.map((c) => (
                    <label
                      className="flex min-h-11 gap-2 items-center"
                      key={c.id}
                    >
                      <input type="checkbox" name="memberIds" value={c.id} />
                      {c.name}
                    </label>
                  ))}
                </fieldset>
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
            <button className={button} disabled={pending}>
              {pending ? "處理中…" : "確認"}
            </button>
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
