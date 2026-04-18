import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { resolveActiveStoreId } from "@/lib/store";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getNextOwnerCandidates } from "@/server/queries/talent";
import { getTopReferrersByEventCount } from "@/server/queries/referral-events";
import { getPotentialTagsForCustomers } from "@/server/queries/customer-potential";
import { CustomerPotentialBadge } from "@/components/customer-potential-badge";
import { READINESS_LEVEL_CONFIG, TALENT_STAGE_LABELS } from "@/types/talent";

/**
 * /dashboard/growth/top-candidates — TOP 10 高潛力候選人
 *
 * 獨立頁呈現 readiness / points / referral / future-owner 整併後的 TOP 10，
 * 供 OWNER 單獨檢視、點進顧客卡。
 * 主頁 /dashboard/growth 的 funnel / leaderboard 保留，TOP 10 在該頁只顯示摘要。
 */
export default async function TopCandidatesPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    notFound();
  }

  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);

  const [candidates, topByEvents] = await Promise.all([
    getNextOwnerCandidates(activeStoreId, 10),
    // 事件層排行：以 BOOKING_COMPLETED 為主要成效訊號（真正帶人到店）
    getTopReferrersByEventCount(activeStoreId, {
      limit: 50,
      filterType: "BOOKING_COMPLETED",
    }),
  ]);

  // 把事件數合進 candidate map，供 UI 新增欄位
  const eventCountMap = new Map(
    topByEvents.map((r) => [r.referrerId, r.count]),
  );

  // 批次取潛力 badge（依規則判讀）
  const potentialTags = await getPotentialTagsForCustomers(
    candidates.map((c) => c.customerId),
    { storeId: activeStoreId },
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-4">
      {/* 返回 + 標題 */}
      <div className="flex items-center gap-3 text-sm text-earth-500">
        <Link href="/dashboard/growth" className="hover:text-earth-800">
          ← 人才培育
        </Link>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <h1 className="text-lg font-bold text-earth-900">TOP 10 高潛力候選人</h1>
        <p className="mt-0.5 text-sm text-earth-500">
          依準備度分數、累積積分、帶出人數與出席率綜合排序
        </p>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-2xl border border-earth-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-earth-500">目前尚無足夠資料的候選人。</p>
          <p className="mt-1 text-xs text-earth-400">
            當成員累積推薦、積分與出席後，會自動出現在這裡。
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {candidates.map((c, i) => {
            const config = READINESS_LEVEL_CONFIG[c.readinessLevel];
            const isEligible =
              c.talentStage === "PARTNER" &&
              (c.readinessLevel === "HIGH" || c.readinessLevel === "READY") &&
              c.totalPoints >= 100 &&
              c.referralCount >= 2;
            const rankBg =
              i === 0
                ? "bg-amber-100 text-amber-700"
                : i === 1
                ? "bg-gray-100 text-gray-600"
                : i === 2
                ? "bg-orange-100 text-orange-600"
                : "bg-earth-100 text-earth-500";

            return (
              <li key={c.customerId}>
                <Link
                  href={`/dashboard/customers/${c.customerId}`}
                  className="block rounded-xl border border-earth-200 bg-white p-4 shadow-sm transition hover:border-primary-200 hover:shadow"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${rankBg}`}
                      >
                        {i + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-earth-900">
                            {c.name}
                          </span>
                          <CustomerPotentialBadge tag={potentialTags.get(c.customerId)} size="sm" />
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${config.bg} ${config.color}`}
                          >
                            {config.label}
                          </span>
                          {isEligible && (
                            <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                              可升級
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-earth-400">
                          {TALENT_STAGE_LABELS[c.talentStage]}
                        </p>
                      </div>
                    </div>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="text-earth-300"
                    >
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  {/* 指標 */}
                  <div className="mt-3 grid grid-cols-6 gap-2 border-t border-earth-100 pt-3 text-center">
                    <MetricCell label="分數" value={c.readinessScore} color="earth" />
                    <MetricCell label="積分" value={c.totalPoints} color="primary" />
                    <MetricCell label="轉介" value={c.referralCount} color="blue" />
                    <MetricCell label="帶出" value={c.referralPartnerCount} color="amber" />
                    <MetricCell label="出席" value={c.attendanceCount} color="green" />
                    <MetricCell
                      label="事件"
                      value={eventCountMap.get(c.customerId) ?? 0}
                      color="primary"
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <p className="text-center text-[11px] text-earth-400">
        資料每小時更新一次 · 可點候選人卡片進入完整顧客資料
      </p>
    </div>
  );
}

function MetricCell({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "earth" | "primary" | "blue" | "amber" | "green";
}) {
  const colorMap = {
    earth: "text-earth-700",
    primary: "text-primary-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
    green: "text-green-600",
  };
  return (
    <div>
      <p className="text-[10px] text-earth-400">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${colorMap[color]}`}>{value}</p>
    </div>
  );
}
