"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { AssignPlanForm } from "../[id]/assign-plan-form";
import type { CustomerRow } from "./customers-table";
import { CustomerStatusBadge } from "./customer-status-badge";
import {
  getLatestActiveWalletSummary,
  type DrawerWalletSummary,
} from "@/server/actions/wallet";
import { formatTWTime } from "@/lib/date-utils";

interface Plan {
  id: string;
  name: string;
  category: string;
  price: number;
  sessionCount: number;
}

interface Props {
  customer: CustomerRow;
  plans: Plan[];
  canDiscount: boolean;
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
