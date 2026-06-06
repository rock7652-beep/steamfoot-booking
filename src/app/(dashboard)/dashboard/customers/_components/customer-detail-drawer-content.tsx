"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { AssignPlanForm } from "../[id]/assign-plan-form";
import { CustomerStatusBadge } from "./customer-status-badge";
import { TrialBookingDrawer } from "../../_components/trial-booking-drawer";
import {
  updateCustomerAssignment,
  searchReferrerCandidates,
  updateCustomerServiceNoteAction,
} from "@/server/actions/customer";
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
  plans: Plan[];
  canDiscount: boolean;
  staffOptions: StaffOption[];
  canAssign: boolean;
  /** 內部服務備註可編輯（= customer.update）。false → 只顯示不可改。 */
  canEditNote: boolean;
  /** "plan" → 自動展開「指派新方案」並滾到方案區 */
  focus?: "plan" | null;
  onClose: () => void;
  /** drawer 內成功操作後 → 父層只 refetch 本人 slim 資料（不整頁 refresh） */
  onMutated: () => void;
  titleId: string;
}

const AUTH_SOURCE_LABEL: Record<string, string> = {
  MANUAL: "後台手動建立",
  LINE: "LINE 註冊",
  GOOGLE: "Google 登入",
  EMAIL: "Email 註冊",
};

function formatPhoneForStaff(phone: string | null | undefined): string {
  if (!phone) return "—";
  if (phone.startsWith("_oauth_")) return "—";
  return phone;
}

function maskLineUserId(id: string | null): string {
  if (!id) return "—";
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function CustomerDetailDrawerContent({
  customer,
  plans,
  canDiscount,
  staffOptions,
  canAssign,
  canEditNote,
  focus,
  onClose,
  onMutated,
  titleId,
}: Props) {
  const headerRef = useRef<HTMLDivElement>(null);
  const planSectionRef = useRef<HTMLElement>(null);

  // 內部服務備註（後台限定）。component 以 key={detail.id} 重掛 → 初值依當前顧客。
  const SERVICE_NOTE_MAX = 1000;
  const [noteDraft, setNoteDraft] = useState(customer.serviceNote ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const noteDirty = noteDraft.trim() !== (customer.serviceNote ?? "").trim();

  async function handleSaveNote() {
    if (savingNote || !noteDirty) return;
    setSavingNote(true);
    try {
      const res = await updateCustomerServiceNoteAction({
        customerId: customer.id,
        serviceNote: noteDraft, // action 內 trim → 空字串存 null
      });
      if (!res.success) {
        toast.error(res.error ?? "儲存內部服務備註失敗");
        return;
      }
      toast.success("已儲存內部服務備註");
      onMutated(); // 父層 refetch 本人 slim 資料（drawer cache invalidate）
    } finally {
      setSavingNote(false);
    }
  }

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
  const activeWallets = customer.planWallets.filter((w) => w.status === "ACTIVE");
  const inactiveWalletCount = Math.max(
    0,
    customer._count.planWallets - activeWallets.length,
  );

  // 身份異常旗標：來源是 LINE 但實際 LINE 未綁定時提示
  const lineBound = customer.lineLinkStatus === "LINKED";
  const identityWarning = customer.authSource === "LINE" && !lineBound;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header
        ref={headerRef}
        tabIndex={-1}
        className="sticky top-0 z-10 flex items-start justify-between border-b border-earth-100 bg-white px-5 py-4 outline-none"
      >
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-lg font-semibold text-earth-900">
            {customer.name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-earth-500">
            {phoneDisplay !== "—" && <span>☎ {phoneDisplay}</span>}
            {customer.lineName && <span>LINE {customer.lineName}</span>}
          </div>
          <div className="mt-2">
            <CustomerStatusBadge
              stage={customer.customerStage}
              lineLinkStatus={customer.lineLinkStatus}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          className="ml-2 shrink-0 rounded p-1 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Quick actions */}
        <section>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <TrialBookingDrawer
              preset={{ customerId: customer.id, customerName: customer.name }}
              triggerLabel="建立體驗預約"
              triggerClassName="rounded-md bg-primary-600 px-3 py-2 text-center text-xs font-medium text-white hover:bg-primary-700"
            />
            <Link
              href={`/dashboard/customers/${customer.id}#new-booking`}
              className="rounded-md border border-earth-200 bg-white px-3 py-2 text-center text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              ＋ 新增預約
            </Link>
            <Link
              href={`/dashboard/customers/${customer.id}/edit`}
              className="rounded-md border border-earth-200 bg-white px-3 py-2 text-center text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              編輯資料
            </Link>
            <Link
              href={`/dashboard/customers/${customer.id}#bookings`}
              className="rounded-md border border-earth-200 bg-white px-3 py-2 text-center text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              預約紀錄
            </Link>
            <Link
              href={`/dashboard/customers/${customer.id}`}
              className="rounded-md border border-earth-200 bg-white px-3 py-2 text-center text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              完整詳情
            </Link>
          </div>
        </section>

        {/* 內部服務備註（後台限定，店長 / 合作店長交接用） */}
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-earth-800">
            內部服務備註
            <span className="rounded bg-earth-100 px-1.5 py-0.5 text-[10px] font-normal text-earth-500">
              僅後台可見
            </span>
          </h3>
          {canEditNote ? (
            <div className="rounded-lg border border-earth-200 bg-white p-3">
              <textarea
                value={noteDraft}
                onChange={(e) =>
                  setNoteDraft(e.target.value.slice(0, SERVICE_NOTE_MAX))
                }
                maxLength={SERVICE_NOTE_MAX}
                rows={3}
                placeholder="例：怕熱，溫度不要太高；第一次來容易緊張，接待時放慢說明。"
                className="w-full resize-y rounded-md border border-earth-200 px-2.5 py-2 text-sm text-earth-800 outline-none placeholder:text-earth-300 focus:border-primary-400"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] tabular-nums text-earth-400">
                  {noteDraft.length} / {SERVICE_NOTE_MAX}
                </span>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  disabled={!noteDirty || savingNote}
                  className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-earth-200 disabled:text-earth-400"
                >
                  {savingNote ? "儲存中…" : "儲存備註"}
                </button>
              </div>
            </div>
          ) : customer.serviceNote ? (
            <div className="whitespace-pre-wrap rounded-lg border border-earth-100 bg-earth-50 p-3 text-sm text-earth-700">
              {customer.serviceNote}
            </div>
          ) : (
            <div className="rounded-lg border border-earth-100 bg-earth-50 p-3 text-xs text-earth-400">
              尚無備註
            </div>
          )}
        </section>

        {/* 課程方案 / 堂數 */}
        <section ref={planSectionRef}>
          <h3 className="mb-2 text-sm font-semibold text-earth-800">課程方案</h3>
          {activeWallets.length === 0 ? (
            <div className="rounded-lg border border-earth-100 bg-earth-50 p-3 text-xs text-earth-500">
              尚無使用中的方案
            </div>
          ) : (
            <ul className="space-y-2">
              {activeWallets.map((w) => {
                const used = w.sessions.filter(
                  (s) => s.status === "COMPLETED" || s.status === "BACKFILLED",
                ).length;
                const total = w.sessions.length || w.plan.sessionCount;
                const remaining = Math.max(0, total - used);
                const expiry = w.expiryDate ? new Date(w.expiryDate) : null;
                const expired = expiry ? expiry.getTime() < Date.now() : false;
                return (
                  <li
                    key={w.id}
                    className="rounded-lg border border-earth-200 bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-earth-900">
                          {w.plan.name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-earth-500">
                          <span className="tabular-nums">
                            剩 <span className="font-medium text-earth-800">{remaining}</span> / {total} 堂
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
                      <button
                        type="button"
                        onClick={() => handleReorder(w.plan.id)}
                        className="shrink-0 rounded border border-primary-300 bg-primary-50 px-2 py-1 text-[11px] font-medium text-primary-700 hover:bg-primary-100"
                      >
                        🔁 續購
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {inactiveWalletCount > 0 ? (
            <p className="mt-1 text-[11px] text-earth-400">
              另有 {inactiveWalletCount} 筆已結束方案，可至完整詳情查看
            </p>
          ) : null}

          {/* 指派新方案 — 預設收合，focus=plan 自動展開 */}
          <div className="mt-3">
            {assignOpen ? (
              <div className="rounded-lg border border-earth-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-earth-800">＋ 指派新方案</h4>
                  <button
                    type="button"
                    onClick={() => setAssignOpen(false)}
                    className="text-[11px] text-earth-500 hover:text-earth-700"
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
                  onSuccess={onMutated}
                  defaultPlanId={preselectedPlanId}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAssignOpen(true)}
                className="w-full rounded-md border border-dashed border-primary-300 bg-primary-50/30 px-3 py-2 text-xs font-medium text-primary-700 hover:bg-primary-50"
              >
                ＋ 指派新方案
              </button>
            )}
          </div>
        </section>

        {/* 歸屬設定 */}
        <CollapsibleSection title="歸屬設定" defaultOpen>
          <AttributionForm
            customerId={customer.id}
            currentStaffId={customer.assignedStaffId}
            currentSponsor={
              sponsor ? { id: sponsor.id, name: sponsor.name } : null
            }
            staffOptions={staffOptions}
            canAssign={canAssign}
            onSaved={onMutated}
          />
        </CollapsibleSection>

        {/* 身份 / LINE 綁定 */}
        <CollapsibleSection
          title="身份與 LINE 綁定"
          defaultOpen={identityWarning}
          badge={
            identityWarning ? (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                需檢查
              </span>
            ) : null
          }
        >
          {identityWarning ? (
            <div className="mb-2 rounded-md border border-red-100 bg-red-50 p-2 text-[11px] text-red-700">
              來源是 {AUTH_SOURCE_LABEL[customer.authSource] ?? customer.authSource}，
              但目前 LINE 未綁定，請至完整詳情頁檢查身份設定。
            </div>
          ) : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-earth-500">LINE 綁定</dt>
            <dd className="text-earth-800">
              {lineBound ? (
                <>
                  已綁定
                  {customer.lineLinkedAt ? (
                    <span className="ml-1 text-earth-400">
                      ({formatTWTime(customer.lineLinkedAt, { dateOnly: true })})
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-earth-500">未綁定</span>
              )}
            </dd>
            <dt className="text-earth-500">LINE User ID</dt>
            <dd className="break-all font-mono text-[11px] text-earth-600">
              {maskLineUserId(customer.lineUserId)}
            </dd>
            <dt className="text-earth-500">來源</dt>
            <dd className="text-earth-800">
              {AUTH_SOURCE_LABEL[customer.authSource] ?? customer.authSource}
            </dd>
            {customer.user?.email ? (
              <>
                <dt className="text-earth-500">Email</dt>
                <dd className="break-all text-earth-800">{customer.user.email}</dd>
              </>
            ) : customer.email ? (
              <>
                <dt className="text-earth-500">Email</dt>
                <dd className="break-all text-earth-800">{customer.email}</dd>
              </>
            ) : null}
          </dl>
          <div className="mt-2">
            <Link
              href={`/dashboard/customers/${customer.id}#identity`}
              className="text-[11px] font-medium text-primary-600 hover:text-primary-700"
            >
              查看完整身份診斷 →
            </Link>
          </div>
        </CollapsibleSection>

        {/* 成長摘要 */}
        <CollapsibleSection title="成長摘要">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-earth-500">推薦人數</dt>
            <dd className="tabular-nums text-earth-800">
              {customer._count.sponsoredCustomers} 人
            </dd>
            <dt className="text-earth-500">累積到店</dt>
            <dd className="tabular-nums text-earth-800">
              {customer._count.bookings} 次
            </dd>
            <dt className="text-earth-500">行動點數</dt>
            <dd className="tabular-nums text-earth-800">{customer.totalPoints}</dd>
            <dt className="text-earth-500">人才階段</dt>
            <dd className="text-earth-800">{customer.talentStage}</dd>
            {customer.lastVisitAt ? (
              <>
                <dt className="text-earth-500">最近來店</dt>
                <dd className="tabular-nums text-earth-800">
                  {formatTWTime(customer.lastVisitAt, { dateOnly: true })}
                </dd>
              </>
            ) : null}
          </dl>
        </CollapsibleSection>

        {/* 系統資訊 */}
        <CollapsibleSection title="系統資訊">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-earth-500">Customer ID</dt>
            <dd className="break-all font-mono text-[11px] text-earth-600">
              {customer.id}
            </dd>
            <dt className="text-earth-500">建立日期</dt>
            <dd className="tabular-nums text-earth-800">
              {formatTWTime(customer.createdAt, { dateOnly: true })}
            </dd>
            <dt className="text-earth-500">最後更新</dt>
            <dd className="tabular-nums text-earth-800">
              {formatTWTime(customer.updatedAt, { dateOnly: true })}
            </dd>
            <dt className="text-earth-500">登入帳號狀態</dt>
            <dd className="text-earth-800">
              {customer.user?.status ?? "—"}
            </dd>
          </dl>
        </CollapsibleSection>
      </div>

      {/* Footer */}
      <footer className="border-t border-earth-100 px-5 py-3">
        <Link
          href={`/dashboard/customers/${customer.id}`}
          className="text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          查看完整詳情 →
        </Link>
      </footer>
    </div>
  );
}

// ============================================================
// CollapsibleSection — 用 <details> 實作；無需額外狀態
// ============================================================

function CollapsibleSection({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-earth-100 bg-white" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-semibold text-earth-800 hover:bg-earth-50">
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
// AttributionForm — 歸屬店長 + 推薦人（從 quick drawer 沿用）
// ============================================================

function AttributionForm({
  customerId,
  currentStaffId,
  currentSponsor,
  staffOptions,
  canAssign,
  onSaved,
}: {
  customerId: string;
  currentStaffId: string | null;
  currentSponsor: { id: string; name: string } | null;
  staffOptions: StaffOption[];
  canAssign: boolean;
  onSaved?: () => void;
}) {
  const [staffId, setStaffId] = useState<string>(currentStaffId ?? "");
  const [sponsor, setSponsor] = useState<{ id: string; name: string } | null>(
    currentSponsor,
  );
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<
    Array<{ id: string; name: string; phoneMasked: string }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty =
    staffId !== (currentStaffId ?? "") ||
    (sponsor?.id ?? null) !== (currentSponsor?.id ?? null);

  // 推薦人搜尋：姓名或手機（部分即可），debounce 300ms 避免逐字打 query。
  // sponsor 已選或 query 為空時不查；以 active flag 丟棄過期回應避免 race。
  useEffect(() => {
    const q = query.trim();
    if (sponsor || q.length < 1) {
      setCandidates([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const result = await searchReferrerCandidates(q, customerId);
      if (!active) return;
      setSearching(false);
      setSearched(true);
      setCandidates(result.success ? result.data : []);
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, sponsor, customerId]);

  function selectCandidate(c: { id: string; name: string }) {
    setSponsor({ id: c.id, name: c.name });
    setQuery("");
    setCandidates([]);
    setSearched(false);
  }

  async function handleSave() {
    if (!staffId) {
      toast.error("請選擇歸屬店長");
      return;
    }
    setSaving(true);
    try {
      const result = await updateCustomerAssignment({
        customerId,
        assignedStaffId: staffId,
        referredByCustomerId: sponsor?.id ?? null,
      });
      if (result.success) {
        toast.success("已更新歸屬設定");
        onSaved?.();
      } else {
        toast.error(result.error ?? "儲存失敗");
      }
    } finally {
      setSaving(false);
    }
  }

  if (!canAssign) {
    return (
      <div className="space-y-1 text-xs text-earth-600">
        <div>
          <span className="text-earth-500">歸屬店長：</span>
          <span className="font-medium text-earth-800">
            {staffOptions.find((s) => s.id === currentStaffId)?.displayName ?? "未指派"}
          </span>
        </div>
        <div>
          <span className="text-earth-500">推薦人：</span>
          <span className="text-earth-800">{currentSponsor?.name ?? "—"}</span>
        </div>
        <p className="pt-1 text-[11px] text-earth-400">您沒有指派權限，無法修改</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-earth-600">
          歸屬店長 <span className="text-red-500">*</span>
        </label>
        <select
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          className="mt-1 w-full rounded-md border border-earth-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">請選擇店長</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-earth-600">
          推薦人（選填）
        </label>
        {sponsor ? (
          <div className="mt-1 flex items-center justify-between rounded-md border border-earth-200 bg-earth-50 px-2 py-1.5">
            <span className="text-sm text-earth-800">{sponsor.name}</span>
            <button
              type="button"
              onClick={() => setSponsor(null)}
              className="text-[11px] text-earth-500 hover:text-red-600"
            >
              清除
            </button>
          </div>
        ) : (
          <div className="mt-1 space-y-1.5">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="輸入推薦人姓名或手機"
              className="w-full rounded-md border border-earth-300 bg-white px-2 py-1.5 text-sm"
            />
            {searching ? (
              <p className="text-[11px] text-earth-400">查詢中…</p>
            ) : candidates.length > 0 ? (
              <ul className="max-h-40 divide-y divide-earth-100 overflow-auto rounded-md border border-earth-200">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => selectCandidate(c)}
                      className="flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-earth-50"
                    >
                      <span className="text-sm text-earth-800">{c.name}</span>
                      <span className="tabular-nums text-[11px] text-earth-500">
                        {c.phoneMasked}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : searched && query.trim() ? (
              <p className="text-[11px] text-amber-700">找不到符合的顧客</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving || !staffId}
          className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "儲存中…" : "儲存歸屬"}
        </button>
      </div>
    </div>
  );
}
