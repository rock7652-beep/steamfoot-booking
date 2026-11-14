"use client";
import type {SettingsPanelNavigationOptions} from "@/components/admin/settings-panel-context";
import {CLOSED_PLAN_LABEL} from "@/lib/plan-status-label";
import {PlanCardHeader} from "@/components/admin/plan-card-header";
import {PlanGridActions} from "@/components/admin/plan-grid-actions";
import {SteamPlanManagement} from "@/components/admin/steam-plan-management";
import { StoreMemberConnectionPanel } from "@/components/admin/store-member-connection-panel";
import { CustomerPhoneLink } from "@/components/customer-detail-fields";
import {CustomerProfileNavigation,CustomerProfileSectionHeading,CustomerRecordsFilter,CustomerProfileConnection,customerProfileLineLabel} from "@/components/admin/customer-profile-layout";
import { CustomerLabels } from "@/components/customer-labels";

import { useEffect, useId, useRef, useState } from "react";
import { BookingServiceNoteEditor } from "../../bookings/booking-service-note-editor";
import { CustomerAttributionForm } from "@/components/customer-attribution-form";
import { AssignPlanForm } from "../[id]/assign-plan-form";
import { CustomerStatusBadge } from "./customer-status-badge";
import { CreateBookingForm } from "../[id]/create-booking-form";
import { EditCustomerForm } from "../[id]/edit/edit-customer-form";
import { CustomerPanelAdvanced } from "./customer-panel-advanced";
import { CustomerPanelSessions } from "./customer-panel-sessions";
import type { CustomerPanelSummary } from "@/server/actions/customer-panel-summary";
import { CustomerPanelSummaryView } from "./customer-panel-summary";
import { CustomerPanelRecordsList } from "./customer-panel-records";

import { sortWalletsByFEFO } from "@/lib/wallet-sort";
import { walletAvailableToBook } from "@/lib/wallet-availability";
import { toLocalDateStr } from "@/lib/date-utils";
import { formatTWTime } from "@/lib/date-utils";
import type { getCustomerDrawerDetail } from "@/server/queries/customer";

type CustomerDetail = Awaited<ReturnType<typeof getCustomerDrawerDetail>>;

interface Plan {
  id: string;
  name: string;
  category: string;
  price: number;
  sessionCount: number;
  validityDays: number | null;
}

interface StaffOption {
  id: string;
  displayName: string;
}

interface Props {
  customer: CustomerDetail;
  initialSummary?: CustomerPanelSummary;
  plans: Plan[];
  canDiscount: boolean;
  staffOptions: StaffOption[];
  canAssign: boolean;
  /** 店內備註可編輯（= customer.update）。false → 只顯示不可改。 */
  canEditNote: boolean;
  /** View Mode: full read, zero write. */
  readOnly?: boolean;
  /** "plan" → 自動展開「指派新方案」並滾到方案區 */
  focus?: "plan" | null;
  onClose: () => void;
  allowNavigation?: (options?:SettingsPanelNavigationOptions) => boolean;
  /** drawer 內成功操作後 → 父層只 refetch 本人 slim 資料（不整頁 refresh） */
  onMutated: () => void;
  titleId: string;
}



function formatPhoneForStaff(phone: string | null | undefined): string {
  if (!phone) return "—";
  if (phone.startsWith("_oauth_")) return "—";
  return phone;
}



export function CustomerDetailDrawerContent({
  customer,
  initialSummary,
  plans,
  canDiscount,
  staffOptions,
  canAssign,
  canEditNote,
  readOnly = false,
  focus,
  onClose,
  allowNavigation = () => true,
  onMutated,
  titleId,
}: Props) {
  const [healthEnabled,setHealthEnabled]=useState(initialSummary?.healthEnabled===true);
  const [revision, setRevision] = useState(0);
  const handleMutated = () => { setRevision(v => v+1); onMutated(); };
  const [showInactive, setShowInactive] = useState(false);
  const [view, setView] = useState<"overview" | "booking" | "edit">("overview");
  const [activeEditor,setActiveEditor] = useState<string | null>(null);
  const [managementPending,setManagementPending]=useState(false);
  const managementGuardId=useId();
  const editingAttribution=activeEditor === "attribution";
  const setEditingAttribution=(open:boolean)=>setActiveEditor(open ? "attribution" : null);
  const [panelTab, setPanelTab] = useState<"overview" | "bookings" | "consumption" | "profile" | "health" | "connection">("overview");
  const bodyRef = useRef<HTMLDivElement>(null);
  const tabScroll = useRef<Record<string, number>>({});
  const lineManagementRef = useRef<HTMLDivElement>(null);
  function switchTab(next: typeof panelTab, focus?:"line") {
    if (!allowNavigation()) return;
    tabScroll.current[panelTab] = bodyRef.current?.scrollTop ?? 0;
    if(focus==="line")setView("overview");
    setPanelTab(next);
    requestAnimationFrame(() => {
      if(focus==="line"&&lineManagementRef.current){lineManagementRef.current.focus({preventScroll:true});lineManagementRef.current.scrollIntoView({block:"start"});}
      else if (bodyRef.current) bodyRef.current.scrollTop = tabScroll.current[next] ?? 0;
    });
  }
  const headerRef = useRef<HTMLDivElement>(null);
  const planSectionRef = useRef<HTMLElement>(null);

  // 開啟時把焦點交給 drawer header
  useEffect(() => {
    headerRef.current?.focus();
  }, []);

  // focus=plan → 滾到方案區
  useEffect(() => {
    if (focus === "plan" && planSectionRef.current) {
      planSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focus]);

  // 「續購同方案」preselect + remount key
  const [preselectedPlanId, setPreselectedPlanId] = useState<string | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);
  const [assignOpen, setAssignOpen] = useState(focus === "plan");

  function handleReorder(planId: string) {
    if (readOnly || !plans.some((plan) => plan.id === planId && plan.category !== "TRIAL")) return;
    setPreselectedPlanId(planId);
    setAssignOpen(true);
    setFormKey((k) => k + 1);
    planSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const phoneDisplay = formatPhoneForStaff(customer.phone);
  const sponsor = customer.sponsor;

  // 有效方案：ACTIVE 且未過期（已過期會由 backend 標 EXPIRED，這裡只篩 ACTIVE）
  // slim query 只回 ACTIVE 錢包 → filter 結果即全部；失效張數改用
  // _count.planWallets（全部錢包數）− active 數，維持原顯示語意。
  const activeWallets = sortWalletsByFEFO(customer.planWallets.filter((w) => w.status === "ACTIVE" && (!w.expiryDate || toLocalDateStr(w.expiryDate) >= toLocalDateStr()) && w.remainingSessions > 0));
  const visibleWallets = showInactive ? customer.planWallets : activeWallets;
  const inactiveWalletCount = Math.max(
    0,
    customer._count.planWallets - activeWallets.length,
  );

  // 身份異常旗標：來源是 LINE 但實際 LINE 未綁定時提示

  return (
    <div data-customer-detail className="@container/customer-detail flex h-full min-h-0 flex-col">
      {/* Header */}
      <header
        ref={headerRef}
        tabIndex={-1}
        className="sticky top-0 z-10 flex items-start justify-between border-b border-earth-100 bg-white px-5 py-2 outline-none"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-3"><div className="flex items-center gap-2"><h2 id={titleId} className="truncate text-base font-semibold text-primary-900">
            {customer.name}
          </h2>{!readOnly && canEditNote && <button type="button" onClick={() => setView("edit")} aria-label="編輯顧客資料" className="min-h-11 min-w-11 rounded text-sm text-primary-700">✎</button>}</div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-earth-500">
            {phoneDisplay !== "—" && <CustomerPhoneLink phone={customer.phone}/>}
            <CustomerProfileConnection label={customerProfileLineLabel(customer.lineLinkStatus,customer.lineName,customer.lineUserId)} onManage={()=>switchTab("connection","line")}/>
          </div>
          </div><div className="flex flex-wrap items-center gap-2"><CustomerLabels maxVisible={2} readOnly={readOnly || !canEditNote} customerId={customer.id}/>
          <div>
            {customer.customerStage !== "ACTIVE" && <CustomerStatusBadge
              stage={customer.customerStage}
              lineLinkStatus={customer.lineLinkStatus}
            />}
          </div></div></div>
          {!readOnly && <div className="flex flex-wrap gap-2">{customer.canBook && <button type="button" onClick={() => { if (allowNavigation()) setView("booking"); }} className="min-h-11 rounded-md bg-primary-700 px-3 text-sm text-white">新增預約</button>}{customer.canAssignPlan && <button type="button" onClick={() => { if (!allowNavigation()) return; setView("overview"); setPanelTab("overview"); setAssignOpen(true); requestAnimationFrame(() => planSectionRef.current?.scrollIntoView({block:"start"})); }} className="min-h-11 rounded-md border border-earth-200 px-3 text-sm text-primary-700">新增方案</button>}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          className="ml-2 min-h-11 min-w-11 shrink-0 rounded p-1 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      {view==="overview"&&<CustomerProfileNavigation value={panelTab==="health"?"health":panelTab==="profile"?"data":"overview"} healthEnabled={healthEnabled} disabled={managementPending} onChange={value=>switchTab(value==="data"?"profile":value)}/>}
      {/* Body */}
      <div ref={bodyRef} hidden={view !== "overview"} className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-5 py-3 space-y-3">
        {readOnly ? (
          <div className="rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-primary-800">
            查看模式提供完整閱讀能力，顧客操作請由該店自行完成。
          </div>
        ) : null}

        <div hidden={panelTab !== "overview" && panelTab !== "health"}><CustomerPanelSummaryView onHealthEnabled={setHealthEnabled} section={panelTab === "health" ? "health" : "overview"} initialData={initialSummary} customerId={customer.id} readOnly={readOnly} onMutated={handleMutated} revision={revision} /></div>
        <section hidden={panelTab !== "overview"} className="space-y-2">
        {/* 課程方案 / 堂數 */}
        <section ref={planSectionRef}>
          <h3 className="mb-2 text-sm font-semibold text-primary-900">方案</h3>
          {visibleWallets.length === 0 ? (
            <div className="rounded-lg border border-earth-100 bg-earth-50 p-3 text-sm text-earth-500">
              尚無使用中的方案
            </div>
          ) : (
            <ul className="space-y-2">
              {visibleWallets.map((w) => {
                const remaining = w.remainingSessions;
                const available = walletAvailableToBook(w);
                const expiry = w.expiryDate ? new Date(w.expiryDate) : null;
                const expired = expiry ? toLocalDateStr(expiry) < toLocalDateStr() : false;
                return (
                  <li
                    key={w.id}
                    className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 rounded-lg border border-earth-200 bg-earth-50 px-3 py-2"
                  >
                    <PlanCardHeader summary={<>
                      <strong className="tabular-nums text-primary-900">{w.status === "CANCELLED" ? CLOSED_PLAN_LABEL : expired || w.status === "EXPIRED" ? "已到期" : w.status === "USED_UP" ? "已用完" : `可預約 ${available} 堂`}</strong>
                      {expiry ? <span className={`tabular-nums ${expired ? "text-red-600" : "text-earth-500"}`}>{toLocalDateStr(expiry)} 到期</span> : <span className="text-earth-500">無期限</span>}
                    </>} actions={<>
                      {!readOnly && customer.canAssignPlan && plans.some(plan=>plan.id===w.plan.id&&plan.category!=="TRIAL")&&<button type="button" className="min-h-11 shrink-0 whitespace-nowrap rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100" onClick={()=>{if(allowNavigation()){setActiveEditor(null);handleReorder(w.plan.id);}}}>續購同方案</button>}
                      {customer.canReadWallets&&<PlanGridActions disabled={managementPending} label={w.plan.name} allowSession={!readOnly&&customer.canAdjustWallet&&w.status==="ACTIVE"&&available>0} allowExpiry={!readOnly&&customer.canAdjustWallet&&!!w.expiryDate&&["ACTIVE","EXPIRED"].includes(w.status)} allowClose={!readOnly&&customer.canAdjustWallet&&["ACTIVE","EXPIRED"].includes(w.status)} onHistory={()=>{if(!managementPending&&allowNavigation({ignoreDirtyFor:managementGuardId}))setActiveEditor(`${w.id}:history`);}} onSelect={action=>{if(!managementPending&&allowNavigation({ignoreDirtyFor:managementGuardId}))setActiveEditor(`${w.id}:${action}`);}}/>}
                    </>}>
                      <button type="button" disabled={managementPending||!customer.canReadWallets} className="min-h-11 break-words text-left text-sm font-semibold text-earth-900" onClick={()=>{if(!managementPending&&customer.canReadWallets&&allowNavigation({ignoreDirtyFor:managementGuardId}))setActiveEditor(`${w.id}:history`);}}>{w.plan.name}</button>
                    </PlanCardHeader>
                    <div className="w-full min-w-0 text-sm text-earth-600"><p>購買 {w.purchasedAt ? toLocalDateStr(new Date(w.purchasedAt)) : "—"} · {w.purchasedPrice == null ? "方案金額待核對" : `方案金額 NT$ ${w.purchasedPrice.toLocaleString("zh-TW")}`}</p></div>
                    <div className="w-full min-w-0">
                      {customer.canReadWallets&&customer.canReadBookings&&<CustomerPanelSessions key={`${w.id}-${revision}`} storeId={w.storeId} customerId={customer.id} walletId={w.id} totalSessions={w.totalSessions} remainingSessions={remaining} initialProgress={w.usageProgress} hideDetailsToggle planName={w.plan.name} canVoid={!readOnly && customer.canAdjustWallet && w.status!=='CANCELLED'} onMutated={handleMutated} />}
                      {activeEditor?.startsWith(`${w.id}:`)&&<div className="mt-2 min-w-0"><SteamPlanManagement guardId={managementGuardId} onPending={setManagementPending} key={activeEditor} customerId={customer.id} customerName={customer.name} walletId={w.id} storeId={w.storeId} action={activeEditor.slice(w.id.length+1) as import('@/components/admin/plan-grid-actions').PlanGridAction|'history'} readOnly={readOnly||!customer.canAdjustWallet} onCancel={()=>setActiveEditor(null)} onSaved={()=>{setActiveEditor(null);handleMutated();}}/></div>}

                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {inactiveWalletCount > 0 ? (
            <button type="button" onClick={() => setShowInactive(!showInactive)} className="mt-1 min-h-11 text-sm text-earth-600">{showInactive ? "收合歷史方案" : `歷史方案（${inactiveWalletCount}）`}</button>
          ) : null}

          {/* 指派新方案 — 預設收合，focus=plan 自動展開 */}
          {!readOnly && customer.canAssignPlan && assignOpen ? (
            <div className="mt-3">
            {assignOpen ? (
              <div className="border-t border-earth-100 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-primary-900">指派新方案</h4>
                  <button
                    type="button"
                    onClick={() => { if (allowNavigation()) setAssignOpen(false); }}
                    className="text-sm text-earth-500 hover:text-earth-700"
                  >
                    收合
                  </button>
                </div>
                <AssignPlanForm
                  key={`${customer.id}-${formKey}`}
                  customerId={customer.id}
                  plans={plans}
                  canDiscount={canDiscount}
                  alwaysOpen
                  onSuccess={() => { setAssignOpen(false); handleMutated(); }}
                  defaultPlanId={preselectedPlanId}
                />
              </div>
            ) : null}
            </div>
          ) : null}
        </section>



        <section aria-label="顧客歸屬">
          <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 text-sm"><span>歸屬店長：{staffOptions.find(staff=>staff.id===customer.assignedStaffId)?.displayName ?? "未指派"}</span><span>推薦人：{sponsor?.name ?? "未設定"}</span>{canAssign && !readOnly && <button type="button" disabled={managementPending} onClick={()=>{if(!managementPending&&allowNavigation()){setEditingAttribution(!editingAttribution);}}} className="min-h-11 px-3 text-primary-700">{editingAttribution ? "收合" : "編輯"}</button>}</div>

          {editingAttribution && <CustomerAttributionForm customerId={customer.id} currentStaffId={customer.assignedStaffId} currentSponsor={sponsor ? {id:sponsor.id,name:sponsor.name} : null} staffOptions={staffOptions} canAssign={canAssign && !readOnly} readOnly={readOnly} onSaved={()=>{setEditingAttribution(false);handleMutated();}} />}
        </section>
        {(customer.canReadBookings||customer.recentConsumption!==null)&&<button type="button" className="min-h-11 text-sm text-primary-700" onClick={()=>switchTab(customer.canReadBookings?"bookings":"consumption")}>全部紀錄</button>}
        {(customer.email||customer.lineName||customer.gender||customer.birthday||customer.height)&&<section aria-label="基本資料" className="border-t border-earth-100 py-2">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm @min-[560px]/customer-detail:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            {[["Email", customer.email], ["LINE 名稱", customer.lineName], ["性別", customer.gender === "MALE" ? "男" : customer.gender === "FEMALE" ? "女" : null], ["生日", customer.birthday ? formatTWTime(customer.birthday, {dateOnly:true}) : null], ["身高", customer.height ? `${customer.height} cm` : null]].filter(([,value])=>!!value && value !== "—").map(([label,value]) => <div key={label} className="contents"><dt className="text-earth-500">{label}</dt><dd className="break-words text-earth-800">{value || "—"}</dd></div>)}
          </dl>
        </section>}
        <BookingServiceNoteEditor compact optimistic customerId={customer.id} value={customer.serviceNote}
          canEdit={canEditNote && !readOnly} onSaved={() => handleMutated()} />

        </section>

        {(["bookings","consumption"].includes(panelTab))&&<section className="space-y-2"><CustomerProfileSectionHeading title="全部紀錄" onBack={()=>switchTab("overview")} disabled={managementPending}/><CustomerRecordsFilter service value={panelTab==="bookings"?"bookings":"purchases"} canReadBookings={customer.canReadBookings} canReadTransactions={customer.recentConsumption!==null} onChange={value=>switchTab(value==="bookings"?"bookings":"consumption")}/></section>}
        <section hidden={panelTab !== "bookings"}>
          {customer.canReadBookings && <CustomerPanelRecordsList customerId={customer.id} kind="bookings" active={view === "overview" && panelTab === "bookings"} revision={String(revision)} />}
        </section>
        <section hidden={panelTab !== "consumption"}>
          {customer.recentConsumption !== null && <CustomerPanelRecordsList customerId={customer.id} kind="consumption" active={view === "overview" && panelTab === "consumption"} revision={String(revision)} />}
        </section>
        <section hidden={panelTab !== "connection"} className="space-y-3">
          <CustomerProfileSectionHeading title="會員與 LINE 管理" onBack={()=>switchTab("overview")}/>
          {!readOnly && <StoreMemberConnectionPanel key={`member-connection:${customer.id}`} customerId={customer.id} pendingOnly />}
          <div ref={lineManagementRef} tabIndex={-1} role="region" aria-label="LINE 身分管理" className="outline-none"><CustomerPanelAdvanced key={`line-management:${customer.id}`} managerSimple lineExpanded active={panelTab === "connection"} customerId={customer.id} readOnly={readOnly} canEdit={canEditNote} onMutated={handleMutated} /></div>
        </section>

      </div>
      {view !== "overview" && <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <button type="button" onClick={() => { if (allowNavigation()) setView("overview"); }} className="mb-3 min-h-11 px-3 text-sm text-primary-700">← 返回顧客</button>
        {view === "booking" ? <CreateBookingForm customerId={customer.id} days={customer.bookingDays} activeWallets={activeWallets.filter(w => walletAvailableToBook(w) > 0).map(w => ({id:w.id, planName:w.plan.name, remainingSessions:walletAvailableToBook(w), expiryDate:w.expiryDate ? toLocalDateStr(w.expiryDate) : null}))} simplified onSuccess={() => {handleMutated(); setView("overview");}} /> : <EditCustomerForm hideServiceNote customer={{id:customer.id, updatedAt:new Date(customer.updatedAt).toISOString(), name:customer.name, phone:customer.phone ?? "", email:customer.email ?? "", gender:customer.gender ?? "", birthday:customer.birthday ? toLocalDateStr(customer.birthday) : "", height:customer.height, serviceNote:customer.serviceNote ?? "", lineName:customer.lineName ?? ""}} onSuccess={() => {handleMutated(); setView("overview");}} onCancel={() => setView("overview")} />}
      </div>}

    </div>
  );
}
