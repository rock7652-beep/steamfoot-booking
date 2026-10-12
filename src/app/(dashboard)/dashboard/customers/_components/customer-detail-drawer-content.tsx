"use client";
import { StoreMemberConnectionPanel } from "@/components/admin/store-member-connection-panel";
import { CustomerPhoneLink } from "@/components/customer-detail-fields";
import { CustomerLabels } from "@/components/customer-labels";

import { useEffect, useRef, useState } from "react";
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

import { AdjustWalletForm } from "../[id]/adjust-wallet-form";
import { ExtendWalletExpiryForm } from "../[id]/extend-wallet-expiry-form";
import { BackfillUsedSessionsForm } from "../[id]/backfill-used-sessions-form";
import { sortWalletsByFEFO } from "@/lib/wallet-sort";
import { walletAvailableToBook, walletPendingCount } from "@/lib/wallet-availability";
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
  allowNavigation?: () => boolean;
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
  const [revision, setRevision] = useState(0);
  const handleMutated = () => { setRevision(v => v+1); onMutated(); };
  const [showInactive, setShowInactive] = useState(false);
  const [view, setView] = useState<"overview" | "booking" | "edit">("overview");
  const [activeEditor,setActiveEditor] = useState<string | null>(null);
  const editingAttribution=activeEditor === "attribution";
  const setEditingAttribution=(open:boolean)=>setActiveEditor(open ? "attribution" : null);
  const [recordsTab, setRecordsTab] = useState<"bookings" | "consumption">(customer.canReadBookings ? "bookings" : "consumption");
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
    <div className="@container/customer-detail flex h-full min-h-0 flex-col">
      {/* Header */}
      <header
        ref={headerRef}
        tabIndex={-1}
        className="sticky top-0 z-10 flex items-start justify-between border-b border-earth-100 bg-white px-5 py-2 outline-none"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-center gap-2"><h2 id={titleId} className="truncate text-base font-semibold text-primary-900">
            {customer.name}
          </h2>{!readOnly && canEditNote && <button type="button" onClick={() => setView("edit")} aria-label="編輯顧客資料" className="min-h-11 min-w-11 rounded text-sm text-primary-700">✎</button>}</div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-earth-500">
            {phoneDisplay !== "—" && <CustomerPhoneLink phone={customer.phone}/>}
            {customer.lineName && <span>LINE {customer.lineName}</span>}
          </div>
          <CustomerLabels maxVisible={2} readOnly={readOnly || !canEditNote} customerId={customer.id}/>
          <div>
            {customer.customerStage !== "ACTIVE" && <CustomerStatusBadge
              stage={customer.customerStage}
              lineLinkStatus={customer.lineLinkStatus}
            />}
          </div>
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

      {/* Body */}
      <div hidden={view !== "overview"} className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-5 py-3 space-y-3">
        {readOnly ? (
          <div className="rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-primary-800">
            查看模式提供完整閱讀能力，顧客操作請由該店自行完成。
          </div>
        ) : null}

        <section aria-label="顧客歸屬" className="border-b border-earth-100">
          <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 text-sm"><span>歸屬店長：{staffOptions.find(staff=>staff.id===customer.assignedStaffId)?.displayName ?? "未指派"}</span><span>推薦人：{sponsor?.name ?? "未設定"}</span>{canAssign && !readOnly && <button type="button" onClick={()=>{if(allowNavigation())setEditingAttribution(!editingAttribution);}} className="min-h-11 px-3 text-primary-700">{editingAttribution ? "收合" : "修改"}</button>}</div>
          {editingAttribution && <CustomerAttributionForm customerId={customer.id} currentStaffId={customer.assignedStaffId} currentSponsor={sponsor ? {id:sponsor.id,name:sponsor.name} : null} staffOptions={staffOptions} canAssign={canAssign && !readOnly} readOnly={readOnly} onSaved={()=>{setEditingAttribution(false);handleMutated();}} />}
        </section>
        <BookingServiceNoteEditor compact optimistic customerId={customer.id} value={customer.serviceNote}
          canEdit={canEditNote && !readOnly} onSaved={() => handleMutated()} />

        {/* Quick actions */}
        <section>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {!readOnly ? (
              <>
                {customer.canBook && <button type="button" onClick={() => setView("booking")} className="min-h-11 rounded-md bg-primary-700 px-4 text-sm text-white">新增預約</button>}
                {customer.canAssignPlan && <button type="button" onClick={() => { setAssignOpen(true); planSectionRef.current?.scrollIntoView({block:"start"}); }} className="min-h-11 rounded-md border px-4 text-sm text-primary-700">新增方案</button>}
              </>
            ) : null}
          </div>
        </section>

        {!readOnly && <StoreMemberConnectionPanel key={customer.id} customerId={customer.id} />}
        <CustomerPanelSummaryView initialData={initialSummary} customerId={customer.id} readOnly={readOnly} onMutated={handleMutated} revision={revision} />

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
                const reserved = walletPendingCount(w);
                const expiry = w.expiryDate ? new Date(w.expiryDate) : null;
                const expired = expiry ? toLocalDateStr(expiry) < toLocalDateStr() : false;
                return (
                  <li
                    key={w.id}
                    className="flex flex-wrap items-start gap-x-3 gap-y-2 border-t border-earth-100 pt-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-earth-900">
                          {w.plan.name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-earth-500">
                          <span className="tabular-nums">
                            剩餘 <span className="font-medium text-earth-800">{remaining}</span>｜已約 {reserved}｜可約 {available}
                          </span>
                          {expiry ? (
                            <span className={`tabular-nums ${expired ? "text-red-600" : ""}`}>
                              {formatTWTime(expiry, { dateOnly: true })} 到期
                              {expired && "（已過期）"}
                            </span>
                          ) : (
                            <span>無期限</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <details className="group shrink-0 max-w-full open:w-full">
                      <summary aria-label={`${w.plan.name}方案操作`} className="inline-flex w-fit min-h-11 cursor-pointer list-none items-center rounded-md border border-earth-200 px-3 text-sm font-medium text-primary-700 hover:bg-earth-50">管理方案</summary>
                      <div className="flex flex-wrap gap-2 border-t border-earth-100 py-2 mt-2 [&_button]:min-h-11">
                      {!readOnly && customer.canAssignPlan && plans.some((plan) => plan.id === w.plan.id && plan.category !== "TRIAL") ? (
                        <button
                          type="button"
                          onClick={() => handleReorder(w.plan.id)}
                          className="shrink-0 rounded border border-primary-300 bg-primary-50 px-2 py-1 text-sm font-medium text-primary-700 hover:bg-primary-100"
                        >
                          續購同方案
                        </button>
                      ) : null}

                        {!readOnly && customer.canAdjustWallet && w.status === "ACTIVE" && <AdjustWalletForm controlledOpen={activeEditor === `${w.id}:adjust`} onOpenChange={open=>{if(allowNavigation())setActiveEditor(open ? `${w.id}:adjust` : null);}} walletId={w.id} currentRemaining={remaining} onSuccess={()=>{setActiveEditor(null);handleMutated();}} />}
                        {!readOnly && customer.canAdjustWallet && w.status === "ACTIVE" && available > 0 && <BackfillUsedSessionsForm controlledOpen={activeEditor === `${w.id}:backfill`} onOpenChange={open=>{if(allowNavigation())setActiveEditor(open ? `${w.id}:backfill` : null);}} walletId={w.id} available={available} reserved={reserved} startDateLocal={toLocalDateStr(w.startDate)} onSuccess={()=>{setActiveEditor(null);handleMutated();}} />}
                        {!readOnly && customer.canAdjustWallet && w.expiryDate && (w.status === "ACTIVE" || w.status === "EXPIRED") && <ExtendWalletExpiryForm controlledOpen={activeEditor === `${w.id}:expiry`} onOpenChange={open=>{if(allowNavigation())setActiveEditor(open ? `${w.id}:expiry` : null);}} walletId={w.id} currentExpiry={toLocalDateStr(w.expiryDate)} expired={expired} onSuccess={()=>{setActiveEditor(null);handleMutated();}} />}
                        <CustomerPanelSessions key={`${w.id}-${revision}`} customerId={customer.id} walletId={w.id} planName={w.plan.name} canVoid={!readOnly && customer.canAdjustWallet} onMutated={handleMutated} />
                      </div>
                    </details>
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
                  <h4 className="text-sm font-semibold text-primary-900">＋ 指派新方案</h4>
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



        <section className="border-t border-earth-100 pt-3">
          <div className="flex gap-2" role="tablist" aria-label="顧客紀錄">
            {customer.canReadBookings && <button type="button" role="tab" aria-selected={recordsTab === "bookings"} onClick={() => setRecordsTab("bookings")} className={`min-h-11 rounded px-3 text-sm ${recordsTab === "bookings" ? "bg-primary-50 font-semibold text-primary-800" : "text-earth-600"}`}>預約紀錄</button>}
            {customer.recentConsumption && <button type="button" role="tab" aria-selected={recordsTab === "consumption"} onClick={() => setRecordsTab("consumption")} className={`min-h-11 rounded px-3 text-sm ${recordsTab === "consumption" ? "bg-primary-50 font-semibold text-primary-800" : "text-earth-600"}`}>消費紀錄</button>}
          </div>
          {customer.canReadBookings && <CustomerPanelRecordsList customerId={customer.id} kind="bookings" active={recordsTab === "bookings"} revision={String(revision)} />}
          {customer.recentConsumption !== null && <CustomerPanelRecordsList customerId={customer.id} kind="consumption" active={recordsTab === "consumption"} revision={String(revision)} />}
        </section>

        <section aria-label="更多資料" className="space-y-1 border-t border-earth-100 pt-2">
        <CollapsibleSection title="基本資料">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm @min-[560px]/customer-detail:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            {[["電話", phoneDisplay], ["Email", customer.email], ["LINE 名稱", customer.lineName], ["性別", customer.gender === "MALE" ? "男" : customer.gender === "FEMALE" ? "女" : null], ["生日", customer.birthday ? formatTWTime(customer.birthday, {dateOnly:true}) : null], ["身高", customer.height ? `${customer.height} cm` : null]].filter(([,value])=>!!value && value !== "—").map(([label,value]) => <div key={label} className="contents"><dt className="text-earth-500">{label}</dt><dd className="break-words text-earth-800">{value || "—"}</dd></div>)}
          </dl>
        </CollapsibleSection>
        <CustomerPanelAdvanced managerSimple active customerId={customer.id} readOnly={readOnly} canEdit={canEditNote} onMutated={handleMutated} />
        </section>
      </div>
      {view !== "overview" && <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <button type="button" onClick={() => { if (allowNavigation()) setView("overview"); }} className="mb-3 min-h-11 px-3 text-sm text-primary-700">← 返回顧客</button>
        {view === "booking" ? <CreateBookingForm customerId={customer.id} days={customer.bookingDays} activeWallets={activeWallets.filter(w => walletAvailableToBook(w) > 0).map(w => ({id:w.id, planName:w.plan.name, remainingSessions:walletAvailableToBook(w), expiryDate:w.expiryDate ? toLocalDateStr(w.expiryDate) : null}))} simplified onSuccess={() => {handleMutated(); setView("overview");}} /> : <EditCustomerForm customer={{id:customer.id, updatedAt:new Date(customer.updatedAt).toISOString(), name:customer.name, phone:customer.phone ?? "", email:customer.email ?? "", gender:customer.gender ?? "", birthday:customer.birthday ? toLocalDateStr(customer.birthday) : "", height:customer.height, serviceNote:customer.serviceNote ?? "", lineName:customer.lineName ?? ""}} onSuccess={() => {handleMutated(); setView("overview");}} onCancel={() => setView("overview")} />}
      </div>}

    </div>
  );
}

// ============================================================
// CollapsibleSection — 用 <details> 實作；無需額外狀態
// ============================================================

function CollapsibleSection({
  title,
  defaultOpen = false,
  onOpen,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  onOpen?:()=>void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-earth-100 bg-white" open={defaultOpen} onToggle={event=>{if(event.currentTarget.open)onOpen?.();}}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-semibold text-primary-900 hover:bg-earth-50">
        <span className="flex items-center gap-2">
          {title}
          {badge}
        </span>
        <svg
          className="h-4 w-4 text-earth-400 transition-transform group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="border-t border-earth-100 px-3 py-3">{children}</div>
    </details>
  );
}

// ============================================================
