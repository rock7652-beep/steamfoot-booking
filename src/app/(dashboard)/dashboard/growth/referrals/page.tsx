import { Suspense } from "react";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { resolveActiveStoreId } from "@/lib/store";
import { notFound } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import {
  getGrowthReferralSummary,
  getGrowthReferralList,
  getGrowthReferralLeaderboard,
} from "@/server/queries/growth";
import { KpiCard } from "@/components/ui/kpi-card";
import { SectionCard } from "@/components/ui/section-card";
import { SectionSkeleton, KpiCardSkeleton } from "@/components/section-skeleton";
import { formatTWTime } from "@/lib/date-utils";
import { RelativeLink } from "../_components/relative-link";
import { TALENT_STAGE_LABELS } from "@/types/talent";
import type { ReferralStatus } from "@prisma/client";

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

const STATUS_LABEL: Record<ReferralStatus, string> = {
  PENDING: "待到店",
  VISITED: "已到店",
  CONVERTED: "已轉化",
  CANCELLED: "取消",
};

const STATUS_COLOR: Record<ReferralStatus, string> = {
  PENDING: "bg-earth-100 text-earth-700",
  VISITED: "bg-blue-100 text-blue-700",
  CONVERTED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

/**
 * /dashboard/growth/referrals — 推薦追蹤（Phase B）
 *
 * 顯示：
 * - 推薦摘要（本月 推薦件 / 到店 / 轉化 / 轉化率）
 * - 推薦紀錄列表（近 30 天，分頁）
 * - 推薦人排行榜（推薦數 + 轉化數 + 轉化率，TOP 10）
 */
export default async function GrowthReferralsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN" && user.role !== "OWNER") notFound();

  const params = await searchParams;
  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);

  const page = params.page ? Math.max(1, parseInt(params.page) || 1) : 1;

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-4">
      <div className="flex items-center gap-3 text-sm text-earth-500">
        <RelativeLink to="/dashboard/growth" className="hover:text-earth-800">
          ← 成長系統
        </RelativeLink>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h1 className="text-lg font-bold text-earth-900">推薦追蹤</h1>
        <p className="mt-0.5 text-sm text-earth-500">推薦 → 到店 → 轉化 的完整流程</p>
      </div>

      {/* 摘要 */}
      <Suspense fallback={<SummaryFallback />}>
        <SummaryBlock activeStoreId={activeStoreId} />
      </Suspense>

      {/* 列表（近 30 天） */}
      <Suspense fallback={<SectionSkeleton heightClass="h-64" />}>
        <ListBlock activeStoreId={activeStoreId} page={page} />
      </Suspense>

      {/* 排行榜 */}
      <Suspense fallback={<SectionSkeleton heightClass="h-64" />}>
        <LeaderboardBlock activeStoreId={activeStoreId} />
      </Suspense>
    </div>
  );
}

function SummaryFallback() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}

async function SummaryBlock({ activeStoreId }: { activeStoreId: string | null }) {
  const s = await getGrowthReferralSummary(activeStoreId);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <KpiCard
        label={`本月推薦（${s.monthLabel}）`}
        value={s.totalThisMonth}
        unit="件"
        color="primary"
      />
      <KpiCard label="已到店" value={s.visitedThisMonth} unit="件" color="blue" />
      <KpiCard label="已轉化" value={s.convertedThisMonth} unit="件" color="green" />
      <KpiCard
        label="轉化率"
        value={s.conversionRate != null ? `${s.conversionRate}%` : "—"}
        color="amber"
      />
    </div>
  );
}

async function ListBlock({
  activeStoreId,
  page,
}: {
  activeStoreId: string | null;
  page: number;
}) {
  const result = await getGrowthReferralList(activeStoreId, { page, pageSize: 30, days: 30 });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const pageParams = (target: number) => ({ page: target === 1 ? null : target });

  return (
    <SectionCard title="近 30 天推薦紀錄" subtitle={`共 ${result.total} 筆`}>
      {result.data.length === 0 ? (
        <div className="rounded-xl bg-earth-50 py-6 text-center">
          <p className="text-sm text-earth-400">近 30 天無推薦紀錄</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-earth-100">
            {result.data.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/customers/${r.referrerId}`}
                      className="text-sm font-medium text-earth-800 hover:text-primary-700"
                    >
                      {r.referrerName}
                    </Link>
                    <span className="text-[11px] text-earth-400">→</span>
                    <span className="text-sm text-earth-700">{r.referredName}</span>
                    {r.referredPhone && (
                      <span className="text-[11px] text-earth-400">{r.referredPhone}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-earth-400">
                    {formatTWTime(r.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLOR[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  {r.convertedCustomerId && (
                    <Link
                      href={`/dashboard/customers/${r.convertedCustomerId}`}
                      className="text-[11px] text-primary-600 hover:text-primary-700"
                    >
                      看顧客 →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-earth-100 pt-3">
              <p className="text-xs text-earth-500">
                第 {result.page} / {totalPages} 頁
              </p>
              <div className="flex gap-2">
                <RelativeLink
                  params={pageParams(Math.max(1, result.page - 1))}
                  aria-disabled={result.page <= 1}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    result.page <= 1
                      ? "pointer-events-none border-earth-100 text-earth-300"
                      : "border-earth-200 text-earth-700 hover:bg-earth-50"
                  }`}
                >
                  ← 上一頁
                </RelativeLink>
                <RelativeLink
                  params={pageParams(Math.min(totalPages, result.page + 1))}
                  aria-disabled={result.page >= totalPages}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    result.page >= totalPages
                      ? "pointer-events-none border-earth-100 text-earth-300"
                      : "border-earth-200 text-earth-700 hover:bg-earth-50"
                  }`}
                >
                  下一頁 →
                </RelativeLink>
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

async function LeaderboardBlock({ activeStoreId }: { activeStoreId: string | null }) {
  const items = await getGrowthReferralLeaderboard(activeStoreId, { limit: 10 });

  return (
    <SectionCard title="推薦人排行榜" subtitle="依推薦數排序（累積 VISITED + CONVERTED）">
      {items.length === 0 ? (
        <div className="rounded-xl bg-earth-50 py-6 text-center">
          <p className="text-sm text-earth-400">目前無推薦紀錄</p>
        </div>
      ) : (
        <ol className="space-y-1">
          {items.map((r, i) => {
            const rankBg =
              i === 0
                ? "bg-amber-100 text-amber-700"
                : i === 1
                ? "bg-gray-100 text-gray-600"
                : i === 2
                ? "bg-orange-100 text-orange-600"
                : "bg-earth-100 text-earth-500";
            return (
              <Link
                key={r.customerId}
                href={`/dashboard/customers/${r.customerId}`}
                className="flex items-center justify-between rounded-lg border border-earth-100 bg-white px-3 py-2 shadow-sm transition hover:border-primary-200"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${rankBg}`}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-earth-800">{r.name}</span>
                  <span className="text-[10px] text-earth-400">
                    {TALENT_STAGE_LABELS[r.talentStage]}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-blue-500">{r.referralCount} 推薦</span>
                  <span className="text-green-600">{r.convertedCount} 轉化</span>
                  <span className="text-amber-600">
                    {r.conversionRate != null ? `${r.conversionRate}%` : "—"}
                  </span>
                </div>
              </Link>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}
