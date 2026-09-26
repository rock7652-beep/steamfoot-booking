// @ts-nocheck — MVP 隱藏頁面，redirect 後全為 dead code
import { getCurrentUser } from "@/lib/session";
import { redirect, notFound } from "next/navigation";
import { getUpgradeRequests } from "@/server/queries/upgrade-request";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import { EmptyState } from "@/components/ui/empty-state";
import { ReviewActions } from "./review-actions";
import { DashboardLink as Link } from "@/components/dashboard-link";
import type { UpgradeRequestStatus } from "@prisma/client";

// ── 狀態標籤 ──

const STATUS_LABEL: Record<UpgradeRequestStatus, string> = {
  PENDING: "待審核",
  APPROVED: "已核准",
  REJECTED: "已拒絕",
  CANCELLED: "已取消",
  EXPIRED: "已過期",
};

const STATUS_COLOR: Record<UpgradeRequestStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-earth-100 text-earth-600",
  EXPIRED: "bg-earth-100 text-earth-500",
};

const STATUS_BORDER: Record<UpgradeRequestStatus, string> = {
  PENDING: "border-amber-200",
  APPROVED: "border-earth-200",
  REJECTED: "border-earth-200",
  CANCELLED: "border-earth-200",
  EXPIRED: "border-earth-200",
};

const SOURCE_LABEL: Record<string, string> = {
  PRICING: "定價頁",
  FEATURE_GATE: "功能閘門",
  SETTINGS: "方案設定",
  ADMIN_CREATED: "管理員建立",
  // 向後相容舊值
  pricing: "定價頁",
  upgrade_notice: "功能閘門",
  settings: "方案設定",
};

const REQUEST_TYPE_LABEL: Record<string, string> = {
  UPGRADE: "升級",
  DOWNGRADE: "降級",
  TRIAL: "試用",
  RENEW: "續約",
};

const VALID_STATUSES: UpgradeRequestStatus[] = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"];

// ── Page ──

interface PageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
  }>;
}

export default async function UpgradeRequestsPage({ searchParams }: PageProps) {
  /* MVP: 升級申請管理暫時隱藏 */
  redirect("/dashboard");

  // eslint-disable-next-line @typescript-eslint/no-unreachable -- MVP 隱藏，保留原始邏輯
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") notFound();

  const params = await searchParams;

  // 預設顯示 PENDING
  const statusFilter = VALID_STATUSES.includes(params.status as UpgradeRequestStatus)
    ? (params.status as UpgradeRequestStatus)
    : (params.status === "__all__" ? undefined : "PENDING" as const);

  const search = params.search?.trim() || undefined;

  const requests = await getUpgradeRequests({ status: statusFilter, search });

  const hasActiveFilters = !!(search || params.status);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-earth-900">升級申請管理</h1>
        <p className="mt-1 text-sm text-earth-500">
          審核店舖的方案升級申請
        </p>
      </div>

      {/* Filter Form */}
      <form method="GET" className="flex flex-wrap gap-2">
        <select
          name="status"
          defaultValue={params.status ?? "PENDING"}
          className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-xs text-earth-700 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
        >
          <option value="__all__">全部狀態</option>
          {VALID_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>

        <input
          name="search"
          defaultValue={params.search ?? ""}
          placeholder="搜尋店家名稱"
          className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-xs text-earth-700 placeholder:text-earth-400 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
        />

        <button
          type="submit"
          className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-primary-700"
        >
          搜尋
        </button>
      </form>

      {/* Active Filters */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-earth-500">篩選條件：</span>
          {statusFilter && (
            <Link
              href={`?${new URLSearchParams({
                ...(search ? { search } : {}),
              })}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs text-primary-700"
            >
              {STATUS_LABEL[statusFilter]}
              <span className="text-primary-400">&times;</span>
            </Link>
          )}
          {search && (
            <Link
              href={`?${new URLSearchParams({
                ...(params.status ? { status: params.status } : {}),
              })}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs text-primary-700"
            >
              搜尋：{search}
              <span className="text-primary-400">&times;</span>
            </Link>
          )}
          <Link
            href="/dashboard/upgrade-requests"
            className="text-xs text-earth-400 hover:text-earth-600"
          >
            全部清除
          </Link>
        </div>
      )}

      {/* Results count */}
      <p className="text-xs text-earth-400">
        共 {requests.length} 筆
        {statusFilter ? `（${STATUS_LABEL[statusFilter]}）` : ""}
      </p>

      {/* Request List */}
      {requests.length === 0 ? (
        <EmptyState
          icon={search ? "search" : "empty"}
          title={search ? "查無符合條件的申請" : "目前沒有升級申請"}
          description={search ? "請嘗試調整搜尋條件" : undefined}
          action={hasActiveFilters ? { label: "清除篩選", href: "/dashboard/upgrade-requests" } : undefined}
        />
      ) : (
        <div className="space-y-4">
          {requests.map((req) => {
            const isPending = req.status === "PENDING";
            const planChanged = req.storePlan !== req.currentPlan;

            return (
              <div
                key={req.id}
                className={`rounded-xl border bg-white p-5 space-y-3 ${STATUS_BORDER[req.status]}`}
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-earth-800">
                      {req.storeName}
                    </h3>
                    <p className="mt-0.5 text-xs text-earth-500">
                      申請人：{req.requesterName ?? "未知"}
                      <span className="ml-2 rounded bg-primary-50 px-1.5 py-0.5 text-[10px] text-primary-600">
                        {REQUEST_TYPE_LABEL[req.requestType] ?? req.requestType}
                      </span>
                      {req.source && (
                        <span className="ml-1 rounded bg-earth-100 px-1.5 py-0.5 text-[10px] text-earth-500">
                          {SOURCE_LABEL[req.source] ?? req.source}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${STATUS_COLOR[req.status]}`}>
                    {STATUS_LABEL[req.status]}
                  </span>
                </div>

                {/* Plan Transition */}
                <div className="flex items-center gap-2 text-xs">
                  <span className={`rounded px-2 py-0.5 font-medium ${PRICING_PLAN_INFO[req.currentPlan].bgColor} ${PRICING_PLAN_INFO[req.currentPlan].color}`}>
                    {PRICING_PLAN_INFO[req.currentPlan].label}
                  </span>
                  <svg className="h-3 w-3 text-earth-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <span className={`rounded px-2 py-0.5 font-medium ${PRICING_PLAN_INFO[req.requestedPlan].bgColor} ${PRICING_PLAN_INFO[req.requestedPlan].color}`}>
                    {PRICING_PLAN_INFO[req.requestedPlan].label}
                  </span>
                </div>

                {/* Plan Changed Warning */}
                {isPending && planChanged && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                    <p className="text-xs font-medium text-red-700">
                      注意：店舖目前方案已變更為「{PRICING_PLAN_INFO[req.storePlan].label}」，與申請時不同，核准可能覆蓋現有設定
                    </p>
                  </div>
                )}

                {/* Reason */}
                {req.reason && (
                  <p className="text-xs text-earth-600 bg-earth-50 rounded-lg px-3 py-2">
                    {req.reason}
                  </p>
                )}

                {/* Review Note (for processed) */}
                {!isPending && req.reviewNote && (
                  <p className="text-xs text-earth-600 bg-earth-50 rounded-lg px-3 py-2">
                    審核備註：{req.reviewNote}
                  </p>
                )}

                {/* Timestamps */}
                <div className="text-[10px] text-earth-400">
                  申請時間：{new Date(req.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                  {!isPending && req.reviewedAt && (
                    <>
                      {" · "}審核人：{req.reviewerName ?? "未知"} ·{" "}
                      {new Date(req.reviewedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                    </>
                  )}
                </div>

                {/* Actions: pending → review; approved + billing pending → confirm payment */}
                {isPending && <ReviewActions requestId={req.id} planChanged={planChanged} />}
                {req.status === "APPROVED" && req.billingStatus === "PENDING" && (
                  <ReviewActions requestId={req.id} billingStatus="PENDING" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
