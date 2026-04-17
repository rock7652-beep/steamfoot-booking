import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getStoreContext } from "@/lib/store-context";
import { redirect } from "next/navigation";
import Link from "next/link";
import { POINT_VALUES, POINT_LABELS } from "@/lib/points-config";
import { getMyPointHistory, getMyMonthlyPoints } from "@/server/queries/customer-points";
import { getActiveBonusRules } from "@/server/queries/bonus-rule";
import type { PointType } from "@prisma/client";

// 前台顯示的「日常行動」積分規則（排除 MANUAL_ADJUSTMENT 和里程碑類型）
const DAILY_ACTION_RULES: { type: PointType; icon: string }[] = [
  { type: "ATTENDANCE", icon: "calendar" },
  { type: "SERVICE", icon: "check" },
  { type: "SERVICE_NOTE", icon: "note" },
  { type: "REFERRAL_CREATED", icon: "share" },
  { type: "REFERRAL_VISITED", icon: "visit" },
  { type: "REFERRAL_CONVERTED", icon: "star" },
];

const MILESTONE_RULES: { type: PointType; icon: string }[] = [
  { type: "BECAME_PARTNER", icon: "trophy" },
  { type: "REFERRAL_PARTNER", icon: "crown" },
  { type: "BECAME_FUTURE_OWNER", icon: "rocket" },
];

export default async function MyPointsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER" || !user.customerId) redirect("/");

  const storeCtx = await getStoreContext();
  const storeSlug = storeCtx?.storeSlug ?? "zhubei";
  const storeId = storeCtx?.storeId;

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
        <Link href="/book" className="text-earth-400 hover:text-earth-600 lg:hidden">
          &larr;
        </Link>
        <h1 className="text-xl font-bold text-earth-900">我的積分</h1>
      </div>

      <div className="space-y-6">
        {/* ═══ 區塊 A：積分總覽 ═══ */}
        <div className="rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50 to-primary-100/50 p-6 shadow-sm">
          <p className="text-xs font-medium text-primary-600">累計積分</p>
          <p className="mt-1 text-4xl font-bold text-primary-700">{totalPoints}</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-primary-600">
            <span className="inline-flex items-center rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium">
              本月 +{monthlyPoints}
            </span>
          </div>
        </div>

        {/* ═══ 區塊 B：積分攻略 ═══ */}
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-earth-700">積分攻略</h2>

          {/* 日常行動 */}
          <div className="mb-5">
            <p className="mb-2.5 text-xs font-medium text-earth-500">日常行動</p>
            <div className="space-y-2">
              {DAILY_ACTION_RULES.map(({ type, icon }) => (
                <PointRuleCard
                  key={type}
                  icon={icon}
                  label={POINT_LABELS[type]}
                  points={POINT_VALUES[type]}
                  description={getRuleDescription(type)}
                />
              ))}
            </div>
          </div>

          {/* 里程碑 */}
          <div className="mb-5">
            <p className="mb-2.5 text-xs font-medium text-earth-500">成長里程碑</p>
            <div className="space-y-2">
              {MILESTONE_RULES.map(({ type, icon }) => (
                <PointRuleCard
                  key={type}
                  icon={icon}
                  label={POINT_LABELS[type]}
                  points={POINT_VALUES[type]}
                  description={getRuleDescription(type)}
                  highlight
                />
              ))}
            </div>
          </div>

          {/* 獎勵活動 */}
          {bonusRules.length > 0 && (
            <div>
              <p className="mb-2.5 text-xs font-medium text-primary-600">
                獎勵活動
              </p>
              <div className="space-y-2">
                {bonusRules.map((rule) => {
                  const hasDateRange = rule.startDate || rule.endDate;
                  return (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between rounded-xl border border-primary-100 bg-primary-50/50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100">
                          <IconSvg name="gift" className="text-primary-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-earth-800">{rule.name}</p>
                          {rule.description && (
                            <p className="text-xs text-earth-500">{rule.description}</p>
                          )}
                          {hasDateRange && (
                            <p className="mt-0.5 text-[10px] text-primary-500">
                              {rule.endDate
                                ? `截止 ${new Date(rule.endDate).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" })}`
                                : "進行中"
                              }
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="rounded-full bg-primary-600 px-3 py-1 text-xs font-bold text-white">
                        +{rule.points}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ═══ 區塊 C：積分紀錄 ═══ */}
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-earth-700">積分紀錄</h2>

          {pointHistory.length === 0 ? (
            <p className="py-6 text-center text-sm text-earth-400">
              尚無積分紀錄，開始行動吧！
            </p>
          ) : (
            <div className="space-y-1.5">
              {pointHistory.map((p) => {
                const dateStr = new Date(p.createdAt).toLocaleDateString("zh-TW", {
                  timeZone: "Asia/Taipei",
                  month: "numeric",
                  day: "numeric",
                });
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg bg-earth-50/80 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-earth-400">{dateStr}</span>
                      <span className="text-earth-700">{POINT_LABELS[p.type]}</span>
                      {p.note && (
                        <span className="text-xs text-earth-400">· {p.note}</span>
                      )}
                    </div>
                    <span className={`font-bold ${p.points >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {p.points >= 0 ? "+" : ""}{p.points}
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
  highlight = false,
}: {
  icon: string;
  label: string;
  points: number;
  description: string;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
      highlight ? "border-amber-100 bg-amber-50/50" : "border-earth-100 bg-earth-50/50"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          highlight ? "bg-amber-100" : "bg-earth-100"
        }`}>
          <IconSvg name={icon} className={highlight ? "text-amber-600" : "text-earth-500"} />
        </div>
        <div>
          <p className="text-sm font-medium text-earth-800">{label}</p>
          <p className="text-xs text-earth-500">{description}</p>
        </div>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${
        highlight
          ? "bg-amber-600 text-white"
          : "bg-earth-700 text-white"
      }`}>
        +{points}
      </span>
    </div>
  );
}

function getRuleDescription(type: PointType): string {
  const map: Record<string, string> = {
    ATTENDANCE: "完成預約並到店體驗",
    SERVICE: "完成服務項目",
    SERVICE_NOTE: "填寫服務後的紀錄",
    REFERRAL_CREATED: "介紹新朋友登記",
    REFERRAL_VISITED: "你介紹的朋友到店體驗",
    REFERRAL_CONVERTED: "你介紹的朋友成為正式顧客",
    BECAME_PARTNER: "達成成長里程碑",
    REFERRAL_PARTNER: "你推薦的朋友達成成長里程碑",
    BECAME_FUTURE_OWNER: "解鎖下一階段成長",
  };
  return map[type] ?? "";
}

function IconSvg({ name, className = "" }: { name: string; className?: string }) {
  const icons: Record<string, string> = {
    calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
    check: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    note: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    share: "M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z",
    visit: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z",
    star: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z",
    trophy: "M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.996.178-1.768.621-2.134 1.1a1.097 1.097 0 00.058 1.37c.588.694 2.09.851 3.143.338m12.433-.738c.996.178 1.768.621 2.134 1.1a1.097 1.097 0 01-.058 1.37c-.588.694-2.09.851-3.143.338M12 2.25c2.386 0 4.5 2.015 4.5 4.5s-2.114 4.5-4.5 4.5-4.5-2.015-4.5-4.5 2.114-4.5 4.5-4.5z",
    crown: "M2.25 18L9 11.25l3 3L21.75 4.5M21.75 4.5h-6m6 0v6",
    rocket: "M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z",
    gift: "M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H4.5a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z",
  };

  const d = icons[name] ?? icons.star;
  return (
    <svg
      width="16"
      height="16"
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
