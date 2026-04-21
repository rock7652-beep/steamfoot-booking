import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getStoreFilter } from "@/lib/manager-visibility";
import { bookingDateToday, todayRange } from "@/lib/date-utils";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking-constants";
import { getDashboardTodaySummary } from "@/server/queries/dashboard-summary";
import { KpiCard, KpiCardSkeleton } from "@/components/admin/kpi-card";

interface KpiRowProps {
  activeStoreId: string | null;
  isOwner: boolean;
}

/**
 * A 區 — 今日摘要 4 卡
 *
 * 卡片設計（對齊 spec）：
 *   1. 今日預約（含已完成/待到）
 *   2. 待處理事項（未指派 + 未到）
 *   3. 新顧客（近 7 日）
 *   4. 今日營運重點 — insight 而非 KPI，動態產生一句幫店長判斷的話
 */
export async function KpiRow({ activeStoreId, isOwner: _isOwner }: KpiRowProps) {
  const user = await getCurrentUser();
  if (!user) return null;
  const storeFilter = getStoreFilter(user, activeStoreId);

  // 並行查詢：today summary + 近 7 日新客（含 delta + 資料完整度） + 今日預約時段分布（for insight）
  const { start: todayStart, end: todayEnd } = todayRange();
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const fourteenDaysAgo = new Date(todayStart);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

  const [summary, newCustomerCount, prevWeekNewCount, todaySlots, incompleteCustomers] =
    await Promise.all([
      getDashboardTodaySummary(activeStoreId),
      prisma.customer
        .count({
          where: {
            createdAt: { gte: sevenDaysAgo, lt: todayEnd },
            ...storeFilter,
          },
        })
        .catch(() => 0),
      prisma.customer
        .count({
          where: {
            createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
            ...storeFilter,
          },
        })
        .catch(() => 0),
      prisma.booking
        .findMany({
          where: {
            bookingDate: bookingDateToday(),
            bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
            ...storeFilter,
          },
          select: { slotTime: true },
        })
        .catch(() => []),
      prisma.customer
        .count({
          where: {
            OR: [
              { birthday: null },
              { gender: null },
              { email: null },
              { height: null },
            ],
            createdAt: { gte: sevenDaysAgo, lt: todayEnd },
            ...storeFilter,
          },
        })
        .catch(() => 0),
    ]);

  const pending = summary.todayUnassignedCount + summary.noShowCount;
  const bookingChange = summary.todayBookingCount - summary.lastWeekBookingCount;

  // ── 第 4 卡：今日營運重點 insight（優先順序，取第一個命中） ──
  // 1. 未到需追蹤
  // 2. 未指派預約
  // 3. 新客資料未補齊
  // 4. 下午預約較集中
  // 5. 今日尚無預約
  // 6. 今日運作平穩
  const afternoonCount = todaySlots.filter((s) => {
    const h = Number(s.slotTime.split(":")[0] ?? 0);
    return h >= 14;
  }).length;
  const afternoonRatio =
    todaySlots.length > 0 ? afternoonCount / todaySlots.length : 0;

  let insight: { title: string; hint: string; tone: "warning" | "info" | "neutral" };
  if (summary.noShowCount > 0) {
    insight = {
      title: `${summary.noShowCount} 筆未到`,
      hint: "建議聯繫確認是否改期",
      tone: "warning",
    };
  } else if (summary.todayUnassignedCount > 0) {
    insight = {
      title: `${summary.todayUnassignedCount} 筆待指派`,
      hint: "請安排人員",
      tone: "warning",
    };
  } else if (incompleteCustomers > 0) {
    insight = {
      title: `${incompleteCustomers} 位新客資料待補`,
      hint: "提醒客人完成資料",
      tone: "info",
    };
  } else if (todaySlots.length === 0) {
    insight = {
      title: "今日尚無預約",
      hint: "可手動建立或推播優惠",
      tone: "info",
    };
  } else if (afternoonRatio >= 0.6) {
    insight = {
      title: "下午預約較集中",
      hint: `下午共 ${afternoonCount} 筆`,
      tone: "info",
    };
  } else {
    insight = {
      title: "今日運作平穩",
      hint: "沒有需要立即處理的事",
      tone: "neutral",
    };
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="今日預約"
        value={summary.todayBookingCount}
        hint={
          bookingChange === 0
            ? "與上週同日持平"
            : `較上週同日 ${bookingChange > 0 ? "+" : ""}${bookingChange}`
        }
        delta={
          bookingChange === 0
            ? null
            : {
                value: `${bookingChange > 0 ? "+" : ""}${bookingChange}`,
                trend: bookingChange > 0 ? "up" : "down",
              }
        }
      />
      <KpiCard
        label="待處理事項"
        value={pending}
        emphasis={pending > 0 ? "warning" : "normal"}
        hint={
          pending === 0
            ? "目前沒有待處理事項"
            : `未指派 ${summary.todayUnassignedCount} · 未到 ${summary.noShowCount}`
        }
      />
      {/* 第 3 卡：新顧客 — 加判斷點（delta + 資料完整度） */}
      {(() => {
        const weekChange = newCustomerCount - prevWeekNewCount;
        let hint: string;
        if (newCustomerCount === 0) {
          hint = "近 7 日無新顧客加入";
        } else if (incompleteCustomers > 0) {
          // 可行動 hint：呼應 B 區的「新客資料待補」task card
          hint = `其中 ${incompleteCustomers} 位資料待補`;
        } else if (weekChange === 0) {
          hint = "與前一週持平";
        } else {
          hint = `較前一週 ${weekChange > 0 ? "+" : ""}${weekChange}`;
        }
        return (
          <KpiCard
            label="新顧客（近 7 日）"
            value={newCustomerCount}
            hint={hint}
            delta={
              newCustomerCount > 0 && weekChange !== 0
                ? {
                    value: `${weekChange > 0 ? "+" : ""}${weekChange}`,
                    trend: weekChange > 0 ? "up" : "down",
                  }
                : null
            }
          />
        );
      })()}
      {/* 第 4 卡：insight 風格（非數字 KPI）— 對齊 admin/KpiCard 原尺寸 */}
      <div
        className={`relative flex h-[88px] flex-col justify-center gap-1 rounded-md border bg-white px-4 py-3 ${
          insight.tone === "warning"
            ? "border-amber-200 border-l-[3px] border-l-amber-500"
            : insight.tone === "info"
              ? "border-blue-200 border-l-[3px] border-l-blue-500"
              : "border-earth-200"
        }`}
      >
        <div className="flex items-center gap-1.5">
          {insight.tone !== "neutral" && (
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                insight.tone === "warning" ? "bg-amber-500" : "bg-blue-500"
              }`}
              aria-hidden
            />
          )}
          <p className="text-xs font-medium text-earth-500">今日營運重點</p>
        </div>
        <p className="text-[15px] font-bold leading-snug text-earth-900">
          {insight.title}
        </p>
        <p className="text-xs text-earth-500">{insight.hint}</p>
      </div>
    </div>
  );
}

export function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}
