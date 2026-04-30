"use server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import {
  todayRange,
  dayRange,
  bookingDateToday,
  toLocalDateStr,
} from "@/lib/date-utils";
import { REVENUE_NET_TYPES, REVENUE_VALID_STATUS } from "@/lib/booking-constants";
import { getStoreFilter } from "@/lib/manager-visibility";

// TODO(PR-payment-confirm): PR-3/4 上線後，本檔 Transaction 營收 aggregate
// 必須加 paymentStatus: { in: ["SUCCESS", "CONFIRMED"] }，否則 Ops v2 面板統計會含 PENDING 誤差。
// 本 PR-1 不加：歷史 backfill=SUCCESS，現行數字與上線前一致。

// ============================================================
// 1. 異常警報系統 (Alerts)
// ============================================================

export type AlertLevel = "critical" | "warning" | "info";

export interface OpsAlert {
  id: string;
  level: AlertLevel;
  title: string;
  description: string;
  metric?: string;       // e.g. "3 筆", "$12,000"
  actionLabel?: string;  // e.g. "查看詳情"
  actionHref?: string;   // e.g. "/dashboard/customers?stage=INACTIVE"
}

export async function getOpsAlerts(activeStoreId?: string | null): Promise<OpsAlert[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const now = new Date();
  const today = todayRange();
  const todayBookingDate = bookingDateToday();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    todayNoShow,
    todayCancelled,
    expiringWallets,
    atRiskCustomers,
    todayBookingCount,
    yesterdayBookingCount,
    monthRevenue,
    lastMonthRevenue,
    pendingBookingsNoStaff,
  ] = await Promise.all([
    // 今日未到
    prisma.booking.count({
      where: { bookingDate: todayBookingDate, bookingStatus: "NO_SHOW", ...storeFilter },
    }),
    // 今日取消
    prisma.booking.count({
      where: { bookingDate: todayBookingDate, bookingStatus: "CANCELLED", ...storeFilter },
    }),
    // 7天內即將到期的套票
    prisma.customerPlanWallet.count({
      where: {
        status: "ACTIVE",
        expiryDate: {
          gte: now,
          lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
        ...storeFilter,
      },
    }),
    // 即將流失顧客（30-60天未到店）
    prisma.customer.count({
      where: {
        lastVisitAt: {
          gte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
          lt: thirtyDaysAgo,
        },
        ...storeFilter,
      },
    }),
    // 今日預約數
    prisma.booking.count({
      where: {
        bookingDate: todayBookingDate,
        bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
        ...storeFilter,
      },
    }),
    // 昨日預約數
    (() => {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = toLocalDateStr(yesterday);
      return prisma.booking.count({
        where: {
          bookingDate: new Date(yesterdayStr + "T00:00:00.000Z"),
          bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
          ...storeFilter,
        },
      });
    })(),
    // 本月營收
    (() => {
      const monthStart = new Date(toLocalDateStr().slice(0, 7) + "-01T00:00:00.000Z");
      return prisma.transaction.aggregate({
        where: {
          createdAt: { gte: monthStart },
          transactionType: { in: [...REVENUE_NET_TYPES] },
          status: REVENUE_VALID_STATUS,
          ...storeFilter,
        },
        _sum: { amount: true },
      });
    })(),
    // 上月營收
    (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      const lastMonthStr = toLocalDateStr(d).slice(0, 7);
      const start = new Date(lastMonthStr + "-01T00:00:00.000Z");
      const end = new Date(toLocalDateStr().slice(0, 7) + "-01T00:00:00.000Z");
      return prisma.transaction.aggregate({
        where: {
          createdAt: { gte: start, lt: end },
          transactionType: { in: [...REVENUE_NET_TYPES] },
          status: REVENUE_VALID_STATUS,
          ...storeFilter,
        },
        _sum: { amount: true },
      });
    })(),
    // 待確認預約（無指派店長）
    prisma.booking.count({
      where: {
        bookingDate: { gte: todayBookingDate },
        bookingStatus: "PENDING",
        revenueStaffId: null,
        ...storeFilter,
      },
    }),
  ]);

  const alerts: OpsAlert[] = [];

  // Critical alerts
  if (todayNoShow >= 2) {
    alerts.push({
      id: "no-show-high",
      level: "critical",
      title: "今日未到率偏高",
      description: `今天有 ${todayNoShow} 位顧客未到店，建議確認原因並跟進`,
      metric: `${todayNoShow} 筆`,
      actionLabel: "查看今日預約",
      actionHref: `/dashboard/bookings?view=day&date=${toLocalDateStr()}`,
    });
  }

  // 套票即將到期
  if (expiringWallets > 0) {
    alerts.push({
      id: "expiring-wallets",
      level: "critical",
      title: "套票即將到期",
      description: `有 ${expiringWallets} 張套票將在 7 天內到期，提醒顧客使用或續購`,
      metric: `${expiringWallets} 張`,
      actionLabel: "查看課程方案",
      actionHref: "/dashboard/plans",
    });
  }

  // Warning alerts
  if (atRiskCustomers > 0) {
    alerts.push({
      id: "at-risk-customers",
      level: "warning",
      title: "顧客即將流失",
      description: `有 ${atRiskCustomers} 位顧客超過 30 天未到店，建議主動聯繫`,
      metric: `${atRiskCustomers} 位`,
      actionLabel: "查看顧客名單",
      actionHref: "/dashboard/customers",
    });
  }

  if (todayCancelled >= 2) {
    alerts.push({
      id: "cancel-high",
      level: "warning",
      title: "今日取消數偏高",
      description: `今天有 ${todayCancelled} 筆預約被取消`,
      metric: `${todayCancelled} 筆`,
    });
  }

  // 營收下降警告
  const currentRev = Number(monthRevenue._sum.amount ?? 0);
  const lastRev = Number(lastMonthRevenue._sum.amount ?? 0);
  if (lastRev > 0) {
    const dayOfMonth = new Date(now.getTime() + 8 * 60 * 60 * 1000).getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projectedRev = (currentRev / dayOfMonth) * daysInMonth;
    if (projectedRev < lastRev * 0.8 && dayOfMonth >= 10) {
      alerts.push({
        id: "revenue-decline",
        level: "warning",
        title: "本月營收預估低於上月",
        description: `目前 $${currentRev.toLocaleString()}，預估全月 $${Math.round(projectedRev).toLocaleString()}（上月 $${lastRev.toLocaleString()}）`,
        metric: `-${Math.round((1 - projectedRev / lastRev) * 100)}%`,
        actionLabel: "查看報表",
        actionHref: "/dashboard/reports",
      });
    }
  }

  // 預約量下降
  if (yesterdayBookingCount > 0 && todayBookingCount < yesterdayBookingCount * 0.5) {
    alerts.push({
      id: "booking-drop",
      level: "info",
      title: "今日預約量較少",
      description: `今天 ${todayBookingCount} 筆，昨天 ${yesterdayBookingCount} 筆`,
      metric: `${todayBookingCount} 筆`,
    });
  }

  // 未指派店長
  if (pendingBookingsNoStaff > 0) {
    alerts.push({
      id: "unassigned-bookings",
      level: "info",
      title: "預約未指派店長",
      description: `有 ${pendingBookingsNoStaff} 筆待處理預約尚未指派店長`,
      metric: `${pendingBookingsNoStaff} 筆`,
      actionLabel: "查看預約",
      actionHref: "/dashboard/bookings",
    });
  }

  // Sort by severity
  const levelOrder: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);

  return alerts;
}

// ============================================================
// 2. 顧客經營清單 (Customer Actions)
// ============================================================

export type ActionType =
  | "call_back"        // 流失挽回
  | "renew_plan"       // 續購提醒
  | "first_visit"      // 新客跟進
  | "upsell"           // 升級推薦
  | "birthday";        // 生日關懷

export interface CustomerAction {
  id: string;
  type: ActionType;
  priority: number;       // 1-5, higher = more urgent
  customerName: string;
  customerId: string;
  phone: string;
  lineLinked: boolean;    // 是否已綁定 LINE
  reason: string;
  daysInfo: string;       // e.g. "42 天未到店", "3 天後到期"
  suggestedAction: string;
}

export async function getCustomerActions(limit = 20, activeStoreId?: string | null): Promise<CustomerAction[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    atRiskCustomers,
    expiringWalletCustomers,
    newCustomersNoVisit,
    activeHighSpenders,
    birthdayCustomers,
  ] = await Promise.all([
    // 流失挽回：30-90 天未到店
    prisma.customer.findMany({
      where: {
        lastVisitAt: {
          gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          lt: thirtyDaysAgo,
        },
        ...storeFilter,
      },
      select: { id: true, name: true, phone: true, lastVisitAt: true, lineLinkStatus: true },
      orderBy: { lastVisitAt: "desc" },
      take: 10,
    }),

    // 續購提醒：套票 14 天內到期
    prisma.customerPlanWallet.findMany({
      where: {
        status: "ACTIVE",
        expiryDate: { gte: now, lte: fourteenDaysFromNow },
        ...storeFilter,
      },
      select: {
        id: true,
        expiryDate: true,
        remainingSessions: true,
        customer: { select: { id: true, name: true, phone: true, lineLinkStatus: true } },
      },
      orderBy: { expiryDate: "asc" },
      take: 10,
    }),

    // 新客跟進：7 天內建立但未完成任何預約
    prisma.customer.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        bookings: { none: { bookingStatus: "COMPLETED" } },
        ...storeFilter,
      },
      select: { id: true, name: true, phone: true, createdAt: true, lineLinkStatus: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),

    // 升級推薦：活躍 + 用單次但消費 ≥3 次
    prisma.customer.findMany({
      where: {
        lastVisitAt: { gte: thirtyDaysAgo },
        planWallets: { none: { status: "ACTIVE" } },
        bookings: { some: { bookingStatus: "COMPLETED" } },
        ...storeFilter,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        lineLinkStatus: true,
        _count: { select: { bookings: { where: { bookingStatus: "COMPLETED" } } } },
      },
      orderBy: { lastVisitAt: "desc" },
      take: 20,
    }),

    // 生日關懷：7 天內生日（限制筆數避免大量資料載入）
    prisma.customer.findMany({
      where: {
        birthday: { not: null },
        ...storeFilter,
      },
      select: { id: true, name: true, phone: true, birthday: true, lineLinkStatus: true },
      take: 500,
    }),
  ]);

  const actions: CustomerAction[] = [];

  // 流失挽回
  for (const c of atRiskCustomers) {
    const days = Math.round((now.getTime() - (c.lastVisitAt?.getTime() ?? 0)) / (1000 * 60 * 60 * 24));
    actions.push({
      id: `callback-${c.id}`,
      type: "call_back",
      priority: days > 60 ? 5 : 4,
      customerName: c.name,
      customerId: c.id,
      phone: c.phone,
      lineLinked: c.lineLinkStatus === "LINKED",
      reason: "長時間未到店",
      daysInfo: `${days} 天未到店`,
      suggestedAction: "電話關心或發送優惠",
    });
  }

  // 續購提醒
  for (const w of expiringWalletCustomers) {
    const daysLeft = Math.max(0, Math.round((w.expiryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    actions.push({
      id: `renew-${w.id}`,
      type: "renew_plan",
      priority: daysLeft <= 3 ? 5 : 4,
      customerName: w.customer.name,
      customerId: w.customer.id,
      phone: w.customer.phone,
      lineLinked: w.customer.lineLinkStatus === "LINKED",
      reason: `套票即將到期（剩 ${w.remainingSessions} 堂）`,
      daysInfo: `${daysLeft} 天後到期`,
      suggestedAction: "提醒續購或使用剩餘堂數",
    });
  }

  // 新客跟進
  for (const c of newCustomersNoVisit) {
    const days = Math.round((now.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    actions.push({
      id: `firstvisit-${c.id}`,
      type: "first_visit",
      priority: 3,
      customerName: c.name,
      customerId: c.id,
      phone: c.phone,
      lineLinked: c.lineLinkStatus === "LINKED",
      reason: "新註冊但尚未到店",
      daysInfo: `註冊 ${days} 天`,
      suggestedAction: "邀請首次體驗",
    });
  }

  // 升級推薦
  for (const c of activeHighSpenders) {
    if (c._count.bookings >= 3) {
      actions.push({
        id: `upsell-${c.id}`,
        type: "upsell",
        priority: 3,
        customerName: c.name,
        customerId: c.id,
        phone: c.phone,
        lineLinked: c.lineLinkStatus === "LINKED",
        reason: `已消費 ${c._count.bookings} 次，尚無套票`,
        daysInfo: `${c._count.bookings} 次到店`,
        suggestedAction: "推薦購買套票方案",
      });
    }
  }

  // 生日關懷
  const todayMD = toLocalDateStr().slice(5); // MM-DD
  for (const c of birthdayCustomers) {
    if (!c.birthday) continue;
    const bMD = c.birthday.toISOString().slice(5, 10); // MM-DD
    // 檢查前後 7 天
    const bThisYear = new Date(`${toLocalDateStr().slice(0, 4)}-${bMD}T00:00:00.000Z`);
    const diffDays = Math.round((bThisYear.getTime() - new Date(toLocalDateStr() + "T00:00:00.000Z").getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= -1 && diffDays <= 7) {
      actions.push({
        id: `birthday-${c.id}`,
        type: "birthday",
        priority: diffDays <= 0 ? 4 : 2,
        customerName: c.name,
        customerId: c.id,
        phone: c.phone,
        lineLinked: c.lineLinkStatus === "LINKED",
        reason: "即將生日",
        daysInfo: diffDays === 0 ? "今天生日！" : diffDays < 0 ? "昨天生日" : `${diffDays} 天後生日`,
        suggestedAction: "發送生日祝福或優惠",
      });
    }
  }

  // Sort by priority desc
  actions.sort((a, b) => b.priority - a.priority);
  return actions.slice(0, limit);
}

// ============================================================
// 3. 分店排行榜 (Staff Rankings)
// ============================================================

export interface StaffRanking {
  staffId: string;
  displayName: string;
  colorCode: string;
  rank: number;
  // Metrics
  revenue: number;
  customerCount: number;
  completionRate: number;
  newCustomerCount: number;
  avgRevenue: number;
  // Comparison
  revenueGrowth: number | null; // vs last period, in %
}

export async function getStaffRankings(days = 30, activeStoreId?: string | null): Promise<StaffRanking[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const now = new Date();
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const prevPeriodStart = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000);
  const periodStartStr = toLocalDateStr(periodStart);
  const todayStr = toLocalDateStr(now);
  const prevPeriodStartStr = toLocalDateStr(prevPeriodStart);

  const startRange = dayRange(periodStartStr);
  const endRange = dayRange(todayStr);
  const prevStartRange = dayRange(prevPeriodStartStr);

  const staff = await prisma.staff.findMany({
    where: { status: "ACTIVE", ...storeFilter },
    select: {
      id: true,
      displayName: true,
      colorCode: true,
      // Current period
      revenueTransactions: {
        where: {
          createdAt: { gte: startRange.start, lte: endRange.end },
          transactionType: { in: [...REVENUE_NET_TYPES] },
          status: REVENUE_VALID_STATUS,
        },
        select: { amount: true },
      },
      revenueBookings: {
        where: {
          bookingDate: {
            gte: new Date(periodStartStr + "T00:00:00.000Z"),
            lte: new Date(todayStr + "T00:00:00.000Z"),
          },
        },
        select: { bookingStatus: true },
      },
      assignedCustomers: {
        select: { id: true, createdAt: true },
      },
    },
  });

  // Get previous period revenue for growth calculation
  const prevRevByStaff = await prisma.transaction.groupBy({
    by: ["revenueStaffId"],
    where: {
      createdAt: { gte: prevStartRange.start, lt: startRange.start },
      transactionType: { in: [...REVENUE_NET_TYPES] },
      status: REVENUE_VALID_STATUS,
      ...storeFilter,
    },
    _sum: { amount: true },
  });
  const prevRevMap = new Map(
    prevRevByStaff
      .filter((r) => r.revenueStaffId != null)
      .map((r) => [r.revenueStaffId!, Number(r._sum?.amount ?? 0)])
  );

  const rankings = staff.map((s) => {
    const revenue = s.revenueTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const bookingCount = s.revenueBookings.length;
    const completedCount = s.revenueBookings.filter((b) => b.bookingStatus === "COMPLETED").length;
    const newCustCount = s.assignedCustomers.filter(
      (c) => c.createdAt >= startRange.start
    ).length;
    const txCount = s.revenueTransactions.length;

    const prevRev = prevRevMap.get(s.id);
    const revenueGrowth =
      prevRev != null && prevRev > 0
        ? Math.round(((revenue - prevRev) / prevRev) * 100)
        : null;

    return {
      staffId: s.id,
      displayName: s.displayName,
      colorCode: s.colorCode,
      rank: 0,
      revenue,
      customerCount: s.assignedCustomers.length,
      completionRate: bookingCount > 0 ? Math.round((completedCount / bookingCount) * 100) : 0,
      newCustomerCount: newCustCount,
      avgRevenue: txCount > 0 ? Math.round(revenue / txCount) : 0,
      revenueGrowth,
    };
  });

  rankings.sort((a, b) => b.revenue - a.revenue);
  rankings.forEach((r, i) => (r.rank = i + 1));

  return rankings;
}

// ============================================================
// 4. AI 經營建議 (Recommendations)
// ============================================================

export type RecommendationType = "revenue" | "retention" | "acquisition" | "efficiency";

export interface Recommendation {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  impact: string;   // e.g. "預估月增 $5,000"
  effort: "低" | "中" | "高";
  actionLabel?: string;
  actionHref?: string;
}

export async function getRecommendations(activeStoreId?: string | null): Promise<Recommendation[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const now = new Date();
  const today = todayRange();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [
    totalCustomers,
    activeCustomers,
    dormantCustomers,
    noWalletFrequent,
    lowRemainingSessions,
    noShowRate30,
    avgBookingsPerDay,
  ] = await Promise.all([
    prisma.customer.count({ where: { ...storeFilter } }),
    prisma.customer.count({ where: { lastVisitAt: { gte: thirtyDaysAgo }, ...storeFilter } }),
    prisma.customer.count({
      where: {
        ...storeFilter,
        OR: [
          { lastVisitAt: { lt: sixtyDaysAgo } },
          { lastVisitAt: null, createdAt: { lt: sixtyDaysAgo } },
        ],
      },
    }),
    // 常客但沒套票
    prisma.customer.count({
      where: {
        lastVisitAt: { gte: thirtyDaysAgo },
        planWallets: { none: { status: "ACTIVE" } },
        bookings: { some: { bookingStatus: "COMPLETED" } },
        ...storeFilter,
      },
    }),
    // 套票剩餘 ≤2 堂
    prisma.customerPlanWallet.count({
      where: { status: "ACTIVE", remainingSessions: { lte: 2 }, ...storeFilter },
    }),
    // 30 天未到率
    (async () => {
      const periodStart = new Date(toLocalDateStr(thirtyDaysAgo) + "T00:00:00.000Z");
      const periodEnd = new Date(toLocalDateStr() + "T00:00:00.000Z");
      const [total, noShow] = await Promise.all([
        prisma.booking.count({
          where: {
            bookingDate: { gte: periodStart, lte: periodEnd },
            bookingStatus: { in: ["COMPLETED", "NO_SHOW"] },
            ...storeFilter,
          },
        }),
        prisma.booking.count({
          where: {
            bookingDate: { gte: periodStart, lte: periodEnd },
            bookingStatus: "NO_SHOW",
            ...storeFilter,
          },
        }),
      ]);
      return total > 0 ? Math.round((noShow / total) * 100) : 0;
    })(),
    // 每日平均預約
    (async () => {
      const periodStart = new Date(toLocalDateStr(thirtyDaysAgo) + "T00:00:00.000Z");
      const periodEnd = new Date(toLocalDateStr() + "T00:00:00.000Z");
      const total = await prisma.booking.count({
        where: {
          bookingDate: { gte: periodStart, lte: periodEnd },
          bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
          ...storeFilter,
        },
      });
      return Math.round(total / 30);
    })(),
  ]);

  const recs: Recommendation[] = [];

  // 1. 沉睡客喚回
  if (dormantCustomers > 0) {
    const potentialRev = dormantCustomers * 800; // 假設客單價 $800
    recs.push({
      id: "wake-dormant",
      type: "retention",
      title: "沉睡顧客喚回計畫",
      description: `目前有 ${dormantCustomers} 位沉睡顧客（60天+ 未到店）。發送專屬優惠或 LINE 訊息可有效喚回 10-20%。`,
      impact: `預估月增 $${Math.round(potentialRev * 0.15).toLocaleString()}`,
      effort: "低",
      actionLabel: "查看沉睡顧客",
      actionHref: "/dashboard/customers",
    });
  }

  // 2. 套票升級推薦
  if (noWalletFrequent > 0) {
    recs.push({
      id: "upsell-packages",
      type: "revenue",
      title: "推動單次客升級套票",
      description: `有 ${noWalletFrequent} 位常客尚未購買套票。套票平均客單價較單次高 40%，建議主動推薦。`,
      impact: `預估月增 $${(noWalletFrequent * 1200).toLocaleString()}`,
      effort: "中",
    });
  }

  // 3. 套票續購提醒
  if (lowRemainingSessions > 0) {
    recs.push({
      id: "renew-reminders",
      type: "revenue",
      title: "套票即將用完，提前續購",
      description: `有 ${lowRemainingSessions} 張套票剩餘 ≤2 堂。在用完前提醒可提高續購率 30%。`,
      impact: "提高續購率",
      effort: "低",
      actionLabel: "查看課程方案",
      actionHref: "/dashboard/plans",
    });
  }

  // 4. 降低未到率
  if (noShowRate30 > 10) {
    recs.push({
      id: "reduce-noshow",
      type: "efficiency",
      title: "降低未到率",
      description: `近 30 天未到率 ${noShowRate30}%（建議 <10%）。啟用預約提醒可降低未到率 50%。`,
      impact: `每月減少 ${Math.round(avgBookingsPerDay * 30 * noShowRate30 / 200)} 筆浪費`,
      effort: "低",
      actionLabel: "設定提醒",
      actionHref: "/dashboard/reminders",
    });
  }

  // 5. 活躍率偏低
  if (totalCustomers > 0) {
    const activeRate = Math.round((activeCustomers / totalCustomers) * 100);
    if (activeRate < 30) {
      recs.push({
        id: "boost-active-rate",
        type: "acquisition",
        title: "提高顧客活躍率",
        description: `目前活躍率 ${activeRate}%（${activeCustomers}/${totalCustomers}），建議透過定期課程、LINE 推播提高回訪。`,
        impact: "提高回訪率 → 穩定營收",
        effort: "中",
      });
    }
  }

  // 6. 填充空閒時段
  if (avgBookingsPerDay < 5) {
    recs.push({
      id: "fill-slots",
      type: "acquisition",
      title: "填充空閒時段",
      description: `每日平均僅 ${avgBookingsPerDay} 筆預約，有大量空閒時段。可推出離峰優惠吸引客人。`,
      impact: "提高場地使用率",
      effort: "中",
    });
  }

  return recs;
}
