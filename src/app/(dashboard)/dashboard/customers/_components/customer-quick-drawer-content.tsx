"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { AssignPlanForm } from "../[id]/assign-plan-form";
import type { CustomerRow } from "./customers-table";
import { CustomerStatusBadge } from "./customer-status-badge";
import {
  getLatestActiveWalletSummary,
  type DrawerWalletSummary,
} from "@/server/actions/wallet";
import {
  updateCustomerAssignment,
  lookupCustomerByPhone,
} from "@/server/actions/customer";
import { normalizePhone } from "@/lib/normalize";
import { formatTWTime } from "@/lib/date-utils";

interface Plan {
  id: string;
  name: string;
  category: string;
  price: number;
  sessionCount: number;
}

interface StaffOption {
  id: string;
  displayName: string;
}

interface Props {
  customer: CustomerRow;
  plans: Plan[];
  canDiscount: boolean;
  staffOptions: StaffOption[];
  canAssign: boolean;
  onClose: () => void;
  titleId: string;
}

type WalletState =
  | { status: "loading" }
  | { status: "loaded"; wallet: DrawerWalletSummary | null }
  | { status: "error" };

export function CustomerQuickDrawerContent({
  customer,
  plans,
  canDiscount,
  staffOptions,
  canAssign,
  onClose,
  titleId,
}: Props) {
  const router = useRouter();

  // 開啟時把焦點交給 drawer header，避免誤觸表格背景
  const headerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    headerRef.current?.focus();
  }, []);

  // 讀取最近一筆 ACTIVE wallet（用於「目前方案」顯示 + 「續購同方案」preselect）
  const [walletState, setWalletState] = useState<WalletState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    getLatestActiveWalletSummary(customer.id)
      .then((wallet) => {
        if (!cancelled) setWalletState({ status: "loaded", wallet });
      })
      .catch(() => {
        if (!cancelled) setWalletState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [customer.id]);

  // 「續購同方案」按鈕 state：改變 preselectedPlanId + bump formKey 強制 remount
  const [preselectedPlanId, setPreselectedPlanId] = useState<string | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);

  function handleReorder(planId: string) {
    setPreselectedPlanId(planId);
    setFormKey((k) => k + 1);
  }

  const phoneDisplay = customer.phone.startsWith("_oauth_") ? "—" : customer.phone;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        ref={headerRef}
        tabIndex={-1}
        className="flex items-start justify-between border-b border-earth-100 px-5 py-4 outline-none"
      >
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-earth-900">
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
          className="rounded p-1 text-earth-400 hover:bg-earth-100 hover:text-earth-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* 歸屬設定（店長 + 推薦人） */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-earth-800">歸屬設定</h3>
          <AttributionForm
            customerId={customer.id}
            currentStaffId={customer.assignedStaff?.id ?? null}
            currentSponsor={customer.sponsor}
            staffOptions={staffOptions}
            canAssign={canAssign}
            onSaved={() => router.refresh()}
          />
        </section>

        {/* 目前方案（精簡）*/}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-earth-800">目前方案</h3>
          <CurrentPlanCard state={walletState} />
        </section>

        {/* Assign Plan Form — 直接用現有元件 */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-earth-800">＋指派方案</h3>
          <AssignPlanForm
            key={`${customer.id}-${formKey}`}
            customerId={customer.id}
            plans={plans}
            canDiscount={canDiscount}
            alwaysOpen
            onSuccess={() => router.refresh()}
            defaultPlanId={preselectedPlanId}
          />
        </section>

        {/* 快速操作 */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-earth-800">快速操作</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={walletState.status !== "loaded" || !walletState.wallet}
              onClick={() => {
                if (walletState.status === "loaded" && walletState.wallet) {
                  handleReorder(walletState.wallet.plan.id);
                }
              }}
              className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              🔁 續購同方案
            </button>
            <button
              type="button"
              disabled
              title="功能預留，PR-6 / PR-5.6 再實作"
              className="rounded-lg border border-earth-200 bg-earth-50 px-3 py-1.5 text-xs font-medium text-earth-500 cursor-not-allowed opacity-60"
            >
              🎁 補發方案（預留）
            </button>
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="border-t border-earth-100 px-5 py-3">
        <Link
          href={`/dashboard/customers/${customer.id}`}
          className="text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          查看完整詳情 →
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// AttributionForm — 歸屬店長 + 推薦人
//
// 店長：下拉選單（必填），由父層以 storeId 預先 scope 好 staff 清單
// 推薦人：電話查詢 → 顯示查到的顧客名 → 存檔時一起送出
// 權限：canAssign=false 時唯讀顯示
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
  const [phone, setPhone] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty =
    staffId !== (currentStaffId ?? "") ||
    (sponsor?.id ?? null) !== (currentSponsor?.id ?? null);

  async function handleLookup() {
    const normalized = normalizePhone(phone);
    if (!/^09\d{8}$/.test(normalized)) {
      setLookupMsg("格式：09 開頭共 10 碼");
      return;
    }
    setLooking(true);
    setLookupMsg(null);
    try {
      const result = await lookupCustomerByPhone(normalized, customerId);
      if (!result.success) {
        setLookupMsg(result.error ?? "查詢失敗");
        return;
      }
      if (!result.data) {
        setLookupMsg("查無此顧客");
        return;
      }
      setSponsor(result.data);
      setPhone("");
      setLookupMsg(null);
    } finally {
      setLooking(false);
    }
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
      <div className="rounded-lg border border-earth-100 bg-earth-50 p-3 text-xs text-earth-600 space-y-1">
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
    <div className="space-y-3 rounded-lg border border-earth-200 bg-white p-3">
      {/* 歸屬店長 */}
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

      {/* 推薦人 */}
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
          <div className="mt-1 flex items-center gap-1.5">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="輸入推薦人手機（09 開頭）"
              className="flex-1 rounded-md border border-earth-300 bg-white px-2 py-1.5 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleLookup();
                }
              }}
            />
            <button
              type="button"
              onClick={handleLookup}
              disabled={looking || !phone.trim()}
              className="rounded-md border border-earth-300 bg-white px-2 py-1.5 text-xs text-earth-700 hover:bg-earth-50 disabled:opacity-50"
            >
              {looking ? "查詢中…" : "查詢"}
            </button>
          </div>
        )}
        {lookupMsg ? (
          <p className="mt-1 text-[11px] text-amber-700">{lookupMsg}</p>
        ) : null}
      </div>

      {/* Save */}
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

// ============================================================
// CurrentPlanCard — 目前方案精簡卡片（Skeleton / 無方案 / 有方案）
// ============================================================

function CurrentPlanCard({ state }: { state: WalletState }) {
  if (state.status === "loading") {
    return (
      <div className="animate-pulse rounded-lg border border-earth-100 bg-earth-50 p-3">
        <div className="h-4 w-32 rounded bg-earth-200" />
        <div className="mt-2 h-3 w-48 rounded bg-earth-100" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-600">
        讀取方案資訊失敗
      </div>
    );
  }
  if (!state.wallet) {
    return (
      <div className="rounded-lg border border-earth-100 bg-earth-50 p-3 text-xs text-earth-500">
        尚無使用中的方案
      </div>
    );
  }

  const { plan, remainingSessions, expiryDate } = state.wallet;
  const expiryDateObj = expiryDate ? new Date(expiryDate) : null;
  const expired = expiryDateObj ? expiryDateObj.getTime() < Date.now() : false;

  return (
    <div className="rounded-lg border border-earth-200 bg-white p-3">
      <div className="text-sm font-medium text-earth-900">{plan.name}</div>
      <div className="mt-1 flex items-center gap-3 text-xs text-earth-500">
        <span>剩餘 {remainingSessions} 堂</span>
        {expiryDateObj ? (
          <span className={expired ? "text-red-600" : ""}>
            到期 {formatTWTime(expiryDateObj, { dateOnly: true })}
            {expired && "（已過期）"}
          </span>
        ) : (
          <span>無期限</span>
        )}
      </div>
    </div>
  );
}
