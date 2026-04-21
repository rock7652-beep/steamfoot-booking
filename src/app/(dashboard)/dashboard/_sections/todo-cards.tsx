import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getStoreFilter } from "@/lib/manager-visibility";
import { bookingDateToday, todayRange } from "@/lib/date-utils";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking-constants";
import { getDashboardTodaySummary } from "@/server/queries/dashboard-summary";
import { DashboardLink as Link } from "@/components/dashboard-link";

interface TodoCardsProps {
  activeStoreId: string | null;
}

type TodoTone = "danger" | "warning" | "info" | "primary" | "neutral";

interface TodoItem {
  key: string;
  tone: TodoTone;
  icon: string; // single char / emoji-safe unicode
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

const TONE_STYLE: Record<TodoTone, { bar: string; badge: string; cta: string }> = {
  danger: {
    bar: "border-l-[4px] border-l-red-500",
    badge: "bg-red-50 text-red-700",
    cta: "bg-red-600 text-white hover:bg-red-700",
  },
  warning: {
    bar: "border-l-[4px] border-l-amber-500",
    badge: "bg-amber-50 text-amber-800",
    cta: "bg-amber-600 text-white hover:bg-amber-700",
  },
  info: {
    bar: "border-l-[4px] border-l-blue-500",
    badge: "bg-blue-50 text-blue-700",
    cta: "bg-blue-600 text-white hover:bg-blue-700",
  },
  primary: {
    bar: "border-l-[4px] border-l-primary-500",
    badge: "bg-primary-50 text-primary-700",
    cta: "bg-primary-600 text-white hover:bg-primary-700",
  },
  neutral: {
    bar: "border-l-[4px] border-l-earth-300",
    badge: "bg-earth-100 text-earth-800",
    cta: "bg-earth-700 text-white hover:bg-earth-800",
  },
};

/**
 * B 區 — 今天先做這些事
 *
 * 動態組出 3-5 張 task card，每張都有：明確任務 + 一句說明 + 一個 CTA。
 * 優先順序（只顯示 count > 0 的）：
 *   1. 未到需追蹤（danger）
 *   2. 未指派人員（warning）
 *   3. 新客資料未補（info）
 *   4. 本週方案到期（warning）
 *   5. 今日預約（primary）— fallback，即使 0 也提醒
 */
export async function TodoCards({ activeStoreId }: TodoCardsProps) {
  const user = await getCurrentUser();
  if (!user) return null;
  const storeFilter = getStoreFilter(user, activeStoreId);

  const { start: todayStart, end: todayEnd } = todayRange();
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaysAhead = new Date(todayStart);
  sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);

  const [summary, incompleteNewCustomers, expiringWallets] = await Promise.all([
    getDashboardTodaySummary(activeStoreId),
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
    prisma.customerPlanWallet
      .count({
        where: {
          status: "ACTIVE",
          expiryDate: { gte: todayStart, lt: sevenDaysAhead },
          customer: storeFilter,
        },
      })
      .catch(() => 0),
  ]);

  const items: TodoItem[] = [];

  if (summary.noShowCount > 0) {
    items.push({
      key: "no-show",
      tone: "danger",
      icon: "⚠",
      title: `有 ${summary.noShowCount} 筆未到預約需追蹤`,
      description: "建議聯繫客人確認是否改期或結案",
      ctaLabel: "去看預約",
      ctaHref: "/dashboard/bookings?status=NO_SHOW",
    });
  }

  if (summary.todayUnassignedCount > 0) {
    items.push({
      key: "unassigned",
      tone: "warning",
      icon: "●",
      title: `有 ${summary.todayUnassignedCount} 筆預約尚未指派人員`,
      description: "請先安排今天的值班教練",
      ctaLabel: "去指派",
      ctaHref: "/dashboard/bookings",
    });
  }

  if (incompleteNewCustomers > 0) {
    items.push({
      key: "incomplete-customers",
      tone: "info",
      icon: "✎",
      title: `有 ${incompleteNewCustomers} 位新客資料尚未完成`,
      description: "提醒客人補齊生日、Email 等基本資料",
      ctaLabel: "去看顧客",
      ctaHref: "/dashboard/customers",
    });
  }

  if (expiringWallets > 0) {
    items.push({
      key: "expiring-wallets",
      tone: "warning",
      icon: "⏰",
      title: `本週方案到期顧客 ${expiringWallets} 位`,
      description: "建議提前聯繫提醒續約",
      ctaLabel: "去看方案",
      ctaHref: "/dashboard/customers?filter=expiring",
    });
  }

  if (summary.todayBookingCount > 0) {
    items.push({
      key: "today-bookings",
      tone: "primary",
      icon: "📅",
      title: `今天有 ${summary.todayBookingCount} 筆預約`,
      description: "先掃一下今天的時段與客人",
      ctaLabel: "去看預約",
      ctaHref: "/dashboard/bookings",
    });
  }

  // 最多顯示 5 張（priority 已排序）
  const displayed = items.slice(0, 5);

  // 全部沒有 → 顯示正向狀態
  if (displayed.length === 0) {
    return (
      <section className="rounded-xl border border-earth-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-xl font-bold text-earth-900">今天先做這些事</h2>
        </div>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="text-4xl">☀️</span>
          <p className="text-lg font-semibold text-earth-800">
            今天沒有需要立即處理的事
          </p>
          <p className="text-base text-earth-700">
            可以先看看今日預約，或新增一筆預約
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/dashboard/bookings"
              className="flex min-h-[48px] items-center justify-center rounded-xl border border-earth-300 bg-white px-6 text-base font-semibold text-earth-800 hover:bg-earth-50"
            >
              查看今日預約
            </Link>
            <Link
              href="/dashboard/bookings/new"
              className="flex min-h-[48px] items-center justify-center rounded-xl bg-primary-600 px-6 text-base font-semibold text-white hover:bg-primary-700"
            >
              ＋ 新增預約
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-earth-900">今天先做這些事</h2>
        <span className="rounded-md bg-earth-100 px-2.5 py-1 text-sm font-semibold text-earth-800">
          {displayed.length} 項
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {displayed.map((item) => {
          const s = TONE_STYLE[item.tone];
          return (
            <div
              key={item.key}
              className={`flex flex-col gap-3 rounded-xl border border-earth-200 bg-white p-5 ${s.bar} sm:flex-row sm:items-center sm:justify-between`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <span
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-lg font-bold ${s.badge}`}
                  aria-hidden
                >
                  {item.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold leading-snug text-earth-900">
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm text-earth-700">{item.description}</p>
                </div>
              </div>
              <Link
                href={item.ctaHref}
                className={`flex min-h-[44px] flex-shrink-0 items-center justify-center rounded-xl px-5 text-base font-semibold shadow-sm transition ${s.cta}`}
              >
                {item.ctaLabel}
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function TodoCardsSkeleton() {
  return (
    <section>
      <div className="mb-4 h-7 w-40 rounded bg-earth-100" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[100px] rounded-xl border border-earth-200 bg-white p-5">
            <div className="flex animate-pulse gap-3">
              <div className="h-10 w-10 rounded-lg bg-earth-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-earth-100" />
                <div className="h-3 w-1/2 rounded bg-earth-100" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
