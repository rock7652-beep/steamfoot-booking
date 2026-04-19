import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { resolveActiveStoreId } from "@/lib/store";
import { notFound } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getGrowthStagnationList } from "@/server/queries/growth";
import { GrowthCandidateCard } from "../_components/growth-candidate-card";
import { RelativeLink } from "../_components/relative-link";
import type { GrowthCandidate } from "@/types/talent";

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

/**
 * /dashboard/growth/stagnation — 停滯名單完整頁（Phase B）
 *
 * 停滯條件（沿用 Phase A 標籤規則）：
 *   stage ∈ {PARTNER, FUTURE_OWNER}
 *   AND (lastVisitAt > 30 天前 OR 從未到店)
 *   AND recent30dReferralEvents = 0
 *
 * 排序：停留天數 desc（由 getGrowthStagnationList 保證）
 * 分頁：page（預設每頁 20）
 * 為了讓店長清楚「為什麼被列入」，卡片上方顯示原因行。
 */
export default async function GrowthStagnationPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN" && user.role !== "OWNER") notFound();

  const params = await searchParams;
  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);

  const page = params.page ? Math.max(1, parseInt(params.page) || 1) : 1;

  const result = await getGrowthStagnationList(activeStoreId, { page, pageSize: 20 });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const pageParams = (target: number) => ({ page: target === 1 ? null : target });

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-4">
      <div className="flex items-center gap-3 text-sm text-earth-500">
        <RelativeLink to="/dashboard/growth" className="hover:text-earth-800">
          ← 成長系統
        </RelativeLink>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h1 className="text-lg font-bold text-earth-900">停滯名單</h1>
        <p className="mt-0.5 text-sm text-earth-500">
          合作店長 / 準店長 近 30 天未到店且無推薦行動 · 共 {result.total} 位
        </p>
        <p className="mt-2 text-[11px] text-earth-400">
          列入條件：合作 / 準店長 階段 · 最後到店超過 30 天（或從未到店） · 30 天內無推薦事件
        </p>
      </div>

      {result.data.length === 0 ? (
        <div className="rounded-2xl border border-earth-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-earth-500">目前無停滯名單</p>
          <p className="mt-1 text-[11px] text-earth-400">所有合作店長 / 準店長最近都在動</p>
        </div>
      ) : (
        <ol className="space-y-2">
          {result.data.map((c) => (
            <li key={c.customerId} className="space-y-1">
              {/* 為什麼被列入 — 就在卡片上方 */}
              <StagnationReason candidate={c} />
              <GrowthCandidateCard candidate={c} />
            </li>
          ))}
        </ol>
      )}

      {result.total > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-earth-200 bg-white p-3 shadow-sm">
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
    </div>
  );
}

/** 卡片上方的原因提示列 */
function StagnationReason({ candidate: c }: { candidate: GrowthCandidate }) {
  const daysSinceLastVisit = c.lastActionAt
    ? Math.floor((Date.now() - c.lastActionAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const reasons: string[] = [];
  if (daysSinceLastVisit == null) {
    reasons.push("從未到店");
  } else {
    reasons.push(`已 ${daysSinceLastVisit} 天未到店`);
  }
  reasons.push("30 天內無推薦事件");
  if (c.cumulativeConverted === 0) reasons.push("累積未有轉化");

  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-red-100 bg-red-50/60 px-3 py-1.5">
      <svg
        className="mt-0.5 h-3 w-3 shrink-0 text-red-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p className="text-[11px] text-red-700">列入原因：{reasons.join(" · ")}</p>
    </div>
  );
}
