"use client";

import { useEffect, useState } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { RightSheet } from "@/components/admin/right-sheet";
import {
  fetchGrowthCustomerDrawer,
  type GrowthCustomerDrawerPayload,
} from "@/server/actions/growth-drawer";
import { TalentPipelineSection } from "../../customers/[id]/talent-pipeline-section";
import { PointsSection } from "../../customers/[id]/points-section";
import { ReferralWrapper } from "../../customers/[id]/referral-wrapper";
import { TALENT_STAGE_LABELS } from "@/types/talent";
import type { CustomerStage, TalentStage } from "@prisma/client";

const CUSTOMER_STAGE_LABEL: Record<CustomerStage, string> = {
  LEAD: "名單",
  TRIAL: "體驗",
  ACTIVE: "已購課",
  INACTIVE: "已停用",
};

const TALENT_STAGE_COLOR: Record<TalentStage, string> = {
  CUSTOMER: "bg-earth-100 text-earth-700",
  REGULAR: "bg-earth-200 text-earth-700",
  POTENTIAL_PARTNER: "bg-blue-50 text-blue-700",
  PARTNER: "bg-blue-100 text-blue-800",
  FUTURE_OWNER: "bg-amber-100 text-amber-700",
  OWNER: "bg-green-100 text-green-700",
};

interface Props {
  open: boolean;
  customerId: string | null;
  /** Lightweight summary handed in at click time so the drawer header
   *  appears instantly while the full payload loads. */
  summary?: { name: string; talentStage: TalentStage } | null;
  /** Drives whether the talent stage / manual points / referral forms
   *  show their write actions. Read-mode is fine for non-OWNER. */
  isOwner: boolean;
  onClose: () => void;
}

export function GrowthCustomerDrawer({
  open,
  customerId,
  summary,
  isOwner,
  onClose,
}: Props) {
  const [data, setData] = useState<GrowthCustomerDrawerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Same pattern as booking-detail-drawer: track which customer the data
  // belongs to so a stale payload can't briefly replace skeleton on a new
  // click. Lint-compliant — no setState in effect body.
  const dataMatches = !!data && data.customer.id === customerId;
  const loading = !!customerId && !error && !dataMatches;

  useEffect(() => {
    if (!open || !customerId) return;
    let canceled = false;
    fetchGrowthCustomerDrawer(customerId)
      .then((payload) => {
        if (canceled) return;
        setData(payload);
        setError(null);
      })
      .catch((e) => {
        if (canceled) return;
        setError(e?.message ?? "載入失敗");
      });
    return () => {
      canceled = true;
    };
  }, [open, customerId]);

  // Header rendering uses summary first, then full data when ready —
  // gives an instant header band on click instead of all-skeleton.
  const headerName = dataMatches
    ? data.customer.name
    : (summary?.name ?? "—");
  const headerTalentStage = dataMatches
    ? data.customer.talentStage
    : (summary?.talentStage ?? "CUSTOMER");

  return (
    <RightSheet
      open={open}
      onClose={onClose}
      labelledById="growth-customer-drawer-title"
      width={520}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-earth-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${TALENT_STAGE_COLOR[headerTalentStage]}`}
              >
                {TALENT_STAGE_LABELS[headerTalentStage]}
              </span>
              {dataMatches && data && (
                <span className="rounded bg-earth-100 px-1.5 py-0.5 text-[11px] font-medium text-earth-600">
                  {CUSTOMER_STAGE_LABEL[data.customer.customerStage]}
                </span>
              )}
            </div>
            <h2
              id="growth-customer-drawer-title"
              className="mt-1 truncate text-lg font-bold text-earth-900"
            >
              {headerName}
            </h2>
            {dataMatches && data && (
              <p className="mt-0.5 truncate text-sm text-earth-500">
                {data.customer.phone}
                {data.customer.sponsor && (
                  <>
                    <span className="mx-1.5 text-earth-300">·</span>
                    推薦人{" "}
                    <Link
                      href={`/dashboard/customers/${data.customer.sponsor.id}`}
                      className="text-primary-600 hover:text-primary-700"
                    >
                      {data.customer.sponsor.name}
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-earth-500 hover:bg-earth-100"
            aria-label="關閉"
          >
            ✕
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : loading || !data ? (
            <SkeletonBody />
          ) : (
            <DrawerSections data={data} isOwner={isOwner} />
          )}
        </div>

        {/* Footer */}
        {dataMatches && data && (
          <div className="flex items-center justify-between gap-2 border-t border-earth-200 bg-earth-50 px-5 py-3">
            <span className="text-[11px] text-earth-500">
              累積點數{" "}
              <strong className="font-bold text-earth-800 tabular-nums">
                {data.customer.totalPoints}
              </strong>
              <span className="ml-3">
                推薦{" "}
                <strong className="font-bold text-earth-800 tabular-nums">
                  {data.referralCount}
                </strong>{" "}
                人
              </span>
            </span>
            <Link
              href={`/dashboard/customers/${data.customer.id}`}
              className="inline-flex h-8 items-center text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              開啟完整顧客頁 →
            </Link>
          </div>
        )}
      </div>
    </RightSheet>
  );
}

function DrawerSections({
  data,
  isOwner,
}: {
  data: GrowthCustomerDrawerPayload;
  isOwner: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* 人才管道 — 升級進度條 / 階段變更（OWNER） */}
      <TalentPipelineSection
        customerId={data.customer.id}
        talentStage={data.customer.talentStage}
        sponsor={data.customer.sponsor}
        referralCount={data.referralCount}
        stageNote={data.customer.stageNote}
        isOwner={isOwner}
        upgradeEligibility={data.upgradeEligibility}
      />

      {/* 集點 — 列表 + 手動發點（OWNER） */}
      <PointsSection
        customerId={data.customer.id}
        totalPoints={data.customer.totalPoints}
        recentPoints={data.recentPoints}
        bonusRules={data.bonusRules}
        canManualAward={isOwner}
      />

      {/* 轉介紹 — 列表 + 狀態變更（OWNER） */}
      <ReferralWrapper
        customerId={data.customer.id}
        referrals={data.referrals}
        canManage={isOwner}
      />
    </div>
  );
}

function SkeletonBody() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-md border border-earth-100 bg-earth-50"
        />
      ))}
    </div>
  );
}
