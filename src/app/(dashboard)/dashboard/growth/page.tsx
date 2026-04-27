import { Suspense } from "react";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { resolveActiveStoreId } from "@/lib/store";
import { notFound } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getGrowthOverviewSummary } from "@/server/queries/growth";

import { GrowthKpiInline } from "./_components/kpi-inline";
import { GrowthTopCandidatesTable } from "./_components/top-candidates-table";
import { StagnationMiniTable } from "./_components/stagnation-mini-table";

/**
 * 成長系統 v2 — 桌機版重畫 v2.0（決策頁，非展示頁）
 *
 * 設計原則：
 * - 一屏完成（1440px 下第一屏看到 KPI + 高潛力名單 + 行動區）
 * - 去卡片化（KPI inline、名單改 Table）
 * - 資訊密度 > 視覺舒服
 * - 每一塊都要回答「這是讓店長做什麼決策？」
 *
 * Layout：
 *   Page Header（精簡）
 *   KPI Row（inline / ≤ 48px）
 *   Main Grid（col-8 Top10 Table ｜ col-4 行動區 = 提醒 + 停滯 + 快速操作）
 */
export default async function GrowthOverviewPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    notFound();
  }

  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);

  return (
    <div className="mx-auto max-w-[1440px] space-y-3 px-4 py-3">
      {/* Page Header（精簡） */}
      <PageHeader />

      {/* Overview 資料區 — Suspense 包裹，失敗/空資料都不拖整頁 */}
      <Suspense fallback={<OverviewFallback />}>
        <OverviewBlock activeStoreId={activeStoreId} />
      </Suspense>
    </div>
  );
}

// ============================================================
// Page Header（精簡版）
// ============================================================

function PageHeader() {
  return (
    <div className="flex items-center justify-between pb-1">
      <div>
        <h1 className="text-lg font-bold text-earth-900">成長系統</h1>
        <p className="text-[11px] text-earth-500">找出下一位教練 / 店長 — 誰值得現在約談</p>
      </div>
      <div className="flex items-center gap-1.5">
        <Link
          href="/dashboard/growth/candidates"
          className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
        >
          完整名單
        </Link>
        <Link
          href="/dashboard/growth/referrals"
          className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
        >
          推薦追蹤
        </Link>
        <Link
          href="/dashboard/bonus-rules"
          className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
        >
          獎勵制度
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// Overview Fallback（skeleton）
// ============================================================

function OverviewFallback() {
  return (
    <>
      <div className="h-12 animate-pulse rounded-xl border border-earth-200 bg-white" />
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-8 h-[440px] animate-pulse rounded-xl border border-earth-200 bg-white" />
        <div className="col-span-4 space-y-3">
          <div className="h-[140px] animate-pulse rounded-xl border border-earth-200 bg-white" />
          <div className="h-[200px] animate-pulse rounded-xl border border-earth-200 bg-white" />
          <div className="h-[80px] animate-pulse rounded-xl border border-earth-200 bg-white" />
        </div>
      </div>
    </>
  );
}

// ============================================================
// Overview Block
// ============================================================

async function OverviewBlock({ activeStoreId }: { activeStoreId: string | null }) {
  const overview = await getGrowthOverviewSummary(activeStoreId);
  const { kpi, allSorted, stagnation } = overview;

  // 今日建議 — 從 kpi / stagnation 派生；用行動語氣（動詞開頭），不額外查詢
  const reminders: Array<{ verb: string; rest: string }> = [];
  if (kpi.highPotentialCount > 0) {
    reminders.push({ verb: "約談", rest: `${kpi.highPotentialCount} 位高潛力顧客（本週排入行事曆）` });
  }
  if (kpi.nearPromotionCount > 0) {
    reminders.push({ verb: "推一把", rest: `${kpi.nearPromotionCount} 位接近升級（差最後一步）` });
  }
  if (stagnation.length > 0) {
    reminders.push({ verb: "喚回", rest: `${stagnation.length} 位停滯 30 天顧客（今日私訊）` });
  }
  if (kpi.monthConvertedReferrals === 0 && kpi.monthReferralEvents > 0) {
    reminders.push({ verb: "追蹤", rest: `${kpi.monthReferralEvents} 件推薦未轉化（追進度）` });
  }
  if (reminders.length === 0) {
    reminders.push({ verb: "維持", rest: "常態關懷（目前沒有急迫待辦）" });
  }

  // 主 CTA — 有候選人時直接指名 Top 1，讓店長一鍵進入聯絡頁
  const top1 = allSorted[0];
  const primaryCta = top1
    ? { label: `約談 Top 1 · ${top1.name}`, href: `/dashboard/customers/${top1.customerId}#contact` }
    : { label: "開始建立潛力名單", href: "/dashboard/growth/candidates" };

  return (
    <>
      {/* KPI Inline Row */}
      <GrowthKpiInline
        items={[
          { label: "高潛力", value: kpi.highPotentialCount, tone: "amber" },
          { label: "可升級", value: kpi.nearPromotionCount, tone: "green" },
          { label: "本月推薦", value: kpi.monthReferralEvents, tone: "blue" },
          { label: "新合作夥伴", value: kpi.newPartnerThisMonth, tone: "primary" },
          { label: "新店長", value: kpi.newFutureOwnerThisMonth, tone: "earth" },
        ]}
      />

      {/* Main Grid：col-8 主決策區 / col-4 行動區 */}
      <div className="grid grid-cols-12 gap-3">
        {/* 左側（col-8）— Top 10 高潛力名單 */}
        <div className="col-span-12 lg:col-span-8">
          {/* 走 drawer：頁面 gate 已限 ADMIN/OWNER，所以 isOwner 恆為 true */}
          <GrowthTopCandidatesTable candidates={allSorted} isOwner />
        </div>

        {/* 右側（col-4）— 行動區 */}
        <aside className="col-span-12 space-y-3 lg:col-span-4">
          {/* 區塊 1：今日該做 — 行動語氣（動詞 + 對象） */}
          <div className="rounded-xl border border-earth-200 bg-white px-3 py-2.5">
            <h3 className="mb-1.5 text-xs font-semibold text-earth-800">今日該做</h3>
            <ul className="space-y-1.5">
              {reminders.map((r, i) => (
                <li key={i} className="flex items-baseline gap-2 text-[12px] leading-snug">
                  <span className="shrink-0 rounded bg-primary-100 px-1.5 py-0.5 text-[11px] font-semibold text-primary-700">
                    {r.verb}
                  </span>
                  <span className="text-earth-700">{r.rest}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 區塊 2：停滯名單 mini table */}
          <StagnationMiniTable items={stagnation} />

          {/* 區塊 3：快速操作 — 動詞開頭 */}
          <div className="rounded-xl border border-earth-200 bg-white px-3 py-2.5">
            <h3 className="mb-1.5 text-xs font-semibold text-earth-800">快速操作</h3>
            <div className="flex flex-col gap-1.5">
              <Link
                href={primaryCta.href}
                className="flex items-center justify-between rounded-md bg-primary-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700"
              >
                <span className="truncate">{primaryCta.label}</span>
                <span className="ml-2 shrink-0">→</span>
              </Link>
              <Link
                href="/dashboard/growth/referrals"
                className="flex items-center justify-between rounded-md border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
              >
                <span>登錄今日推薦</span>
                <span>→</span>
              </Link>
              <Link
                href="/dashboard/growth/stagnation"
                className="flex items-center justify-between rounded-md border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
              >
                <span>喚回停滯顧客</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
