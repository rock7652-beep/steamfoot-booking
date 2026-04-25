import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getStoreContext } from "@/lib/store-context";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CUSTOMER_POINT_LABELS } from "@/lib/points-config";
import { getMyPointHistory, getMyMonthlyPoints } from "@/server/queries/customer-points";
import { getActiveBonusRules } from "@/server/queries/bonus-rule";

/**
 * 我的點數（顧客端集點頁）
 *
 * 結構（v2 集點系統）：
 *   A. 目前點數
 *   B. 集點方式（固定 4 項：來店蒸足 / 分享給朋友 / 朋友完成體驗 / 蒸足打卡）
 *   C. 額外活動（選填，從 bonus-rules 載入）
 *   D. 集點紀錄
 *
 * 主線集點行為（對齊：集點 → 升級教練 → 開分店）：
 *   - 來店蒸足（自己的行動）
 *   - 分享給朋友
 *   - 朋友完成體驗
 */

interface PointRuleItem {
  label: string;
  description: string;
  points: number;
  icon: string;
}

// 集點方式 — 依顧客心智排序：自己來 → 帶朋友 → 朋友到 → 輔助
const COLLECTION_RULES: PointRuleItem[] = [
  { label: "來店蒸足", description: "到店放鬆一次", points: 5, icon: "calendar" },
  { label: "分享給朋友", description: "邀請朋友來體驗", points: 10, icon: "share" },
  { label: "朋友完成體驗", description: "朋友來店蒸足", points: 20, icon: "visit" },
  { label: "蒸足打卡", description: "記錄今天的放鬆感受", points: 2, icon: "note" },
];

export default async function MyPointsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER" || !user.customerId) redirect("/");

  const storeCtx = await getStoreContext();
  const storeId = storeCtx?.storeId;
  const prefix = `/s/${storeCtx?.storeSlug ?? "zhubei"}`;

  const [customer, pointHistory, monthlyPoints, bonusRules] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: user.customerId },
      select: { totalPoints: true },
    }),
    getMyPointHistory(user.customerId, { limit: 30 }),
    getMyMonthlyPoints(user.customerId),
    storeId ? getActiveBonusRules(storeId) : Promise.resolve([]),
  ]);

  const totalPoints = customer?.totalPoints ?? 0;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href={`${prefix}/book`} className="flex min-h-[44px] min-w-[44px] items-center justify-center text-earth-700 hover:text-earth-900 lg:hidden">
          &larr;
        </Link>
        <h1 className="text-2xl font-bold text-earth-900">我的點數</h1>
      </div>

      <div className="space-y-6">
        {/* ═══ 區塊 A：目前點數 ═══ */}
        <div className="rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50 to-primary-100/50 p-6 shadow-sm">
          <p className="text-base font-semibold text-primary-800">目前點數</p>
          <p className="mt-2 text-5xl font-bold text-primary-700">
            {totalPoints}
            <span className="ml-2 text-xl font-medium text-primary-700">點</span>
          </p>
          <div className="mt-4 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-sm font-semibold text-primary-800">
              本月 +{monthlyPoints}
            </span>
          </div>
        </div>

        {/* ═══ 區塊 B：集點方式 ═══ */}
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-earth-900">集點方式</h2>
          <div className="space-y-3">
            {COLLECTION_RULES.map((rule) => (
              <PointRuleCard
                key={rule.label}
                icon={rule.icon}
                label={rule.label}
                points={rule.points}
                description={rule.description}
              />
            ))}
          </div>
        </div>

        {/* ═══ 額外活動（bonus rules，選填） ═══ */}
        {bonusRules.length > 0 && (
          <div className="rounded-2xl border border-primary-100 bg-primary-50/40 p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-primary-800">額外活動</h2>
            <div className="space-y-3">
              {bonusRules.map((rule) => {
                const hasDateRange = rule.startDate || rule.endDate;
                return (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between rounded-xl border border-primary-100 bg-white px-4 py-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
                        <IconSvg name="gift" className="text-primary-700" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-earth-900">{rule.name}</p>
                        {rule.description && (
                          <p className="mt-0.5 text-sm text-earth-700">{rule.description}</p>
                        )}
                        {hasDateRange && (
                          <p className="mt-1 text-sm font-medium text-primary-700">
                            {rule.endDate
                              ? `截止 ${new Date(rule.endDate).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" })}`
                              : "進行中"}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="rounded-full bg-primary-600 px-3 py-1.5 text-base font-bold text-white">
                      +{rule.points}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ 區塊 D：集點紀錄 ═══ */}
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-earth-900">集點紀錄</h2>

          {pointHistory.length === 0 ? (
            <p className="py-8 text-center text-base text-earth-700">
              尚無集點紀錄，開始行動吧！
            </p>
          ) : (
            <div className="space-y-2">
              {pointHistory.map((p) => {
                const dateStr = new Date(p.createdAt).toLocaleDateString("zh-TW", {
                  timeZone: "Asia/Taipei",
                  month: "numeric",
                  day: "numeric",
                });
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl bg-earth-50 px-4 py-3 text-base"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                      <span className="text-sm font-semibold text-earth-800">{dateStr}</span>
                      <span className="text-earth-900">
                        {CUSTOMER_POINT_LABELS[p.type]}
                      </span>
                      {p.note && (
                        <span className="text-sm text-earth-700">· {p.note}</span>
                      )}
                    </div>
                    <span
                      className={`text-lg font-bold ${p.points >= 0 ? "text-green-700" : "text-red-600"}`}
                    >
                      {p.points >= 0 ? "+" : ""}
                      {p.points}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Helper components
// ────────────────────────────────────────────────────────────

function PointRuleCard({
  icon,
  label,
  points,
  description,
}: {
  icon: string;
  label: string;
  points: number;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-earth-100 bg-earth-50/50 px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-earth-100">
          <IconSvg name={icon} className="text-earth-700" />
        </div>
        <div>
          <p className="text-base font-semibold text-earth-900">{label}</p>
          <p className="mt-0.5 text-sm text-earth-700">{description}</p>
        </div>
      </div>
      <span className="rounded-full bg-earth-800 px-3 py-1.5 text-base font-bold text-white">
        +{points}
      </span>
    </div>
  );
}

function IconSvg({ name, className = "" }: { name: string; className?: string }) {
  const icons: Record<string, string> = {
    calendar:
      "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
    share:
      "M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z",
    visit:
      "M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z",
    note: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    gift:
      "M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H4.5a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z",
  };

  const d = icons[name] ?? icons.calendar;
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {d.split(" M").map((segment, i) => (
        <path key={i} d={i === 0 ? segment : `M${segment}`} />
      ))}
    </svg>
  );
}
