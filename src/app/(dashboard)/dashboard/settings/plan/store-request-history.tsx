import { getStoreUpgradeRequests } from "@/server/queries/upgrade-request";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import type { UpgradeRequestStatus } from "@prisma/client";

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

export async function StoreRequestHistory({ storeId }: { storeId: string }) {
  const requests = await getStoreUpgradeRequests(storeId);

  if (requests.length === 0) return null;

  // 預設顯示最近 5 筆
  const display = requests.slice(0, 5);
  const hasMore = requests.length > 5;

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-5">
      <h4 className="text-sm font-semibold text-earth-800 mb-3">申請歷史</h4>
      <div className="space-y-2">
        {display.map((req) => (
          <div
            key={req.id}
            className="flex items-center justify-between rounded-lg bg-earth-50 px-3 py-2"
          >
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
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[req.status]}`}>
                {STATUS_LABEL[req.status]}
              </span>
              <span className="text-[10px] text-earth-400">
                {new Date(req.createdAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}
              </span>
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <p className="mt-2 text-[10px] text-earth-400">
          共 {requests.length} 筆，僅顯示最近 5 筆
        </p>
      )}
    </div>
  );
}
