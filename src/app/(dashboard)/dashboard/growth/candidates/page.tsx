import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { resolveActiveStoreId } from "@/lib/store";
import { notFound } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getGrowthCandidatesList } from "@/server/queries/growth";
import {
  GROWTH_CANDIDATE_FILTER_LABELS,
  type GrowthCandidateFilter,
} from "@/lib/growth-logic";
import { GrowthCandidateCard } from "../_components/growth-candidate-card";
import { RelativeLink } from "../_components/relative-link";

interface PageProps {
  searchParams: Promise<{ filter?: string; page?: string; pageSize?: string }>;
}

const FILTER_KEYS = Object.keys(GROWTH_CANDIDATE_FILTER_LABELS) as GrowthCandidateFilter[];

/**
 * /dashboard/growth/candidates — 潛力名單完整列表（Phase B）
 *
 * 預設排序：growthScore desc（由 getGrowthCandidatesList 保證）
 * 篩選：all / high_potential / near_promotion / stagnant / referral_pending / partner / future_owner
 * 分頁：page + pageSize（預設 20）
 * 空資料：不 500，顯示 empty state
 */
export default async function GrowthCandidatesPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN" && user.role !== "OWNER") notFound();

  const params = await searchParams;
  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);

  const filter: GrowthCandidateFilter = FILTER_KEYS.includes(
    params.filter as GrowthCandidateFilter,
  )
    ? (params.filter as GrowthCandidateFilter)
    : "all";
  const page = params.page ? Math.max(1, parseInt(params.page) || 1) : 1;
  const pageSize = params.pageSize ? Math.max(5, parseInt(params.pageSize) || 20) : 20;

  const result = await getGrowthCandidatesList(activeStoreId, { filter, page, pageSize });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  // 切 filter 時固定帶 page=1；page=1 與 pageSize 預設值時省略 query param
  const filterParams = (f: GrowthCandidateFilter) => ({
    filter: f === "all" ? null : f,
    // 要求：切 filter 固定回第 1 頁（省略 page 即可）
  });

  const pageParams = (targetPage: number) => ({
    filter: filter === "all" ? null : filter,
    page: targetPage === 1 ? null : targetPage,
    pageSize: pageSize === 20 ? null : pageSize,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-4">
      <div className="flex items-center gap-3 text-sm text-earth-500">
        <RelativeLink to="/dashboard/growth" className="hover:text-earth-800">
          ← 成長系統
        </RelativeLink>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h1 className="text-lg font-bold text-earth-900">潛力名單</h1>
        <p className="mt-0.5 text-sm text-earth-500">
          依成長分數排序 · 共 {result.total} 位候選人
        </p>

        {/* Filter chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {FILTER_KEYS.map((f) => (
            <RelativeLink
              key={f}
              params={filterParams(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-primary-100 text-primary-800"
                  : "border border-earth-200 text-earth-600 hover:bg-earth-50"
              }`}
            >
              {GROWTH_CANDIDATE_FILTER_LABELS[f]}
            </RelativeLink>
          ))}
        </div>
      </div>

      {result.data.length === 0 ? (
        <div className="rounded-2xl border border-earth-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-earth-500">
            {filter === "all"
              ? "目前尚無合作店長或準店長候選"
              : `符合「${GROWTH_CANDIDATE_FILTER_LABELS[filter]}」的候選人：0`}
          </p>
          <p className="mt-1 text-[11px] text-earth-400">
            當成員累積推薦、點數與出席後，會自動出現
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {result.data.map((c, i) => (
            <li key={c.customerId}>
              <GrowthCandidateCard
                candidate={c}
                rank={(result.page - 1) * result.pageSize + i + 1}
              />
            </li>
          ))}
        </ol>
      )}

      {/* Pagination */}
      {result.total > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-earth-200 bg-white p-3 shadow-sm">
          <p className="text-xs text-earth-500">
            第 {result.page} / {totalPages} 頁 · 顯示 {(result.page - 1) * result.pageSize + 1} –{" "}
            {Math.min(result.page * result.pageSize, result.total)} 筆
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
    </div>
  );
}
