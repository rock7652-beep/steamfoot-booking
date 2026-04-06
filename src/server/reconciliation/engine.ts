/**
 * 自動對帳引擎 v1
 *
 * 負責：
 * 1. 從多個資料來源取得同一指標的數值
 * 2. 比對是否完全一致（tolerance = 0）
 * 3. 建立 run + check 記錄，保留完整 debug payload
 */

import { prisma } from "@/lib/db";
import { toLocalDateStr, toLocalMonthStr, todayRange, monthRange } from "@/lib/date-utils";

const REVENUE_TYPES = [
  "TRIAL_PURCHASE",
  "SINGLE_PURCHASE",
  "PACKAGE_PURCHASE",
  "SUPPLEMENT",
];

// ============================================================
// Types
// ============================================================

interface CheckResult {
  checkCode: string;
  checkName: string;
  status: "pass" | "mismatch" | "error";
  sources: Record<string, number>;
  expected?: string;
  errorMessage?: string;
  debugPayload: Record<string, unknown>;
}

// ============================================================
// 主執行函式
// ============================================================

export async function runReconciliation(triggeredBy: "manual" | "cron" = "manual") {
  const startTime = Date.now();
  const targetDate = toLocalDateStr();
  const targetMonth = toLocalMonthStr();

  // 建立 run 記錄
  const run = await prisma.reconciliationRun.create({
    data: {
      triggeredBy,
      status: "running",
      targetDate,
      targetMonth,
      timezone: "Asia/Taipei (UTC+8)",
    },
  });

  const results: CheckResult[] = [];

  // 執行各項對帳檢查
  const checks = [
    checkTodayRevenue,
    checkMonthRevenue,
    checkTodayBookingCount,
    checkTodayBookingPeople,
    checkMonthCsvTotals,
  ];

  for (const checkFn of checks) {
    try {
      const result = await checkFn(targetDate, targetMonth);
      results.push(result);
    } catch (err) {
      results.push({
        checkCode: checkFn.name.replace("check", "").replace(/([A-Z])/g, "_$1").toLowerCase().slice(1),
        checkName: checkFn.name,
        status: "error",
        sources: {},
        errorMessage: err instanceof Error ? err.message : String(err),
        debugPayload: {
          error: err instanceof Error ? err.stack : String(err),
          targetDate,
          targetMonth,
        },
      });
    }
  }

  // 統計結果
  const passCount = results.filter((r) => r.status === "pass").length;
  const mismatchCount = results.filter((r) => r.status === "mismatch").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const overallStatus = errorCount > 0 ? "error" : mismatchCount > 0 ? "mismatch" : "pass";

  // 寫入 check 記錄 + 更新 run
  await prisma.$transaction([
    ...results.map((r) =>
      prisma.reconciliationCheck.create({
        data: {
          runId: run.id,
          checkCode: r.checkCode,
          checkName: r.checkName,
          status: r.status,
          sources: r.sources as object,
          expected: r.expected,
          errorMessage: r.errorMessage,
          debugPayload: r.debugPayload as object,
        },
      })
    ),
    prisma.reconciliationRun.update({
      where: { id: run.id },
      data: {
        status: overallStatus,
        totalChecks: results.length,
        passCount,
        mismatchCount,
        errorCount,
        durationMs: Date.now() - startTime,
        finishedAt: new Date(),
      },
    }),
  ]);

  return {
    runId: run.id,
    status: overallStatus,
    totalChecks: results.length,
    passCount,
    mismatchCount,
    errorCount,
    durationMs: Date.now() - startTime,
  };
}

// ============================================================
// 對帳項目 1：今日營收
// Dashboard 今日營收 vs 交易紀錄直接 aggregate
// ============================================================

async function checkTodayRevenue(targetDate: string, _targetMonth: string): Promise<CheckResult> {
  const { start: todayStart, end: todayEnd } = todayRange();

  // Source A: Dashboard 邏輯 — transaction aggregate (REVENUE_TYPES)
  const dashboardAgg = await prisma.transaction.aggregate({
    where: {
      transactionType: { in: REVENUE_TYPES as never },
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    _sum: { amount: true },
  });
  const dashboardValue = Number(dashboardAgg._sum.amount ?? 0);

  // Source B: 逐筆加總驗證
  const allTxToday = await prisma.transaction.findMany({
    where: {
      transactionType: { in: REVENUE_TYPES as never },
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    select: { amount: true, transactionType: true },
  });
  const rowSumValue = allTxToday.reduce((sum, t) => sum + Number(t.amount), 0);

  const sources = {
    "Dashboard aggregate": dashboardValue,
    "逐筆加總": rowSumValue,
  };

  const allMatch = dashboardValue === rowSumValue;

  return {
    checkCode: "today_revenue",
    checkName: "今日營收",
    status: allMatch ? "pass" : "mismatch",
    sources,
    expected: "所有來源數字完全一致",
    debugPayload: {
      targetDate,
      dateRange: { start: todayStart.toISOString(), end: todayEnd.toISOString() },
      timezone: "Asia/Taipei (UTC+8)",
      formula: "SUM(transaction.amount) WHERE type IN REVENUE_TYPES AND createdAt IN today",
      revenueTypes: REVENUE_TYPES,
      transactionCount: allTxToday.length,
      tolerance: 0,
    },
  };
}

// ============================================================
// 對帳項目 2：本月營收
// Dashboard 本月營收 vs 報表 monthlyStoreSummary 邏輯
// ============================================================

async function checkMonthRevenue(_targetDate: string, targetMonth: string): Promise<CheckResult> {
  const { start: monthStart, end: monthEnd } = monthRange(targetMonth);

  // Source A: Dashboard 邏輯 — aggregate
  const dashboardAgg = await prisma.transaction.aggregate({
    where: {
      transactionType: { in: REVENUE_TYPES as never },
      createdAt: { gte: monthStart, lte: monthEnd },
    },
    _sum: { amount: true },
  });
  const dashboardValue = Number(dashboardAgg._sum.amount ?? 0);

  // Source B: 報表邏輯 — groupBy + sum（與 monthlyStoreSummary 相同）
  const reportRows = await prisma.transaction.groupBy({
    by: ["revenueStaffId"],
    where: {
      transactionType: { in: REVENUE_TYPES as never },
      createdAt: { gte: monthStart, lte: monthEnd },
    },
    _sum: { amount: true },
  });
  const reportValue = reportRows.reduce(
    (sum, r) => sum + Number((r._sum as { amount: unknown }).amount ?? 0),
    0
  );

  // Source C: CSV 邏輯 — groupBy transactionType（與 store-monthly route 相同）
  const csvRows = await prisma.transaction.groupBy({
    by: ["revenueStaffId", "transactionType"],
    where: {
      transactionType: { in: REVENUE_TYPES as never },
      createdAt: { gte: monthStart, lte: monthEnd },
    },
    _sum: { amount: true },
  });
  const csvValue = csvRows.reduce(
    (sum, r) => sum + Number((r._sum as { amount: unknown }).amount ?? 0),
    0
  );

  const sources = {
    "Dashboard aggregate": dashboardValue,
    "報表 groupBy staff": reportValue,
    "CSV groupBy staff+type": csvValue,
  };

  const allMatch = dashboardValue === reportValue && reportValue === csvValue;

  return {
    checkCode: "month_revenue",
    checkName: "本月營收",
    status: allMatch ? "pass" : "mismatch",
    sources,
    expected: "Dashboard = 報表 = CSV 三源完全一致",
    debugPayload: {
      targetMonth,
      dateRange: { start: monthStart.toISOString(), end: monthEnd.toISOString() },
      timezone: "Asia/Taipei (UTC+8)",
      formula: "SUM(transaction.amount) WHERE type IN REVENUE_TYPES AND createdAt IN month",
      revenueTypes: REVENUE_TYPES,
      staffBreakdown: reportRows.map((r) => ({
        staffId: r.revenueStaffId,
        amount: Number((r._sum as { amount: unknown }).amount ?? 0),
      })),
      tolerance: 0,
    },
  };
}

// ============================================================
// 對帳項目 3：今日預約筆數
// ============================================================

async function checkTodayBookingCount(targetDate: string, _targetMonth: string): Promise<CheckResult> {
  const { start: todayStart, end: todayEnd } = todayRange();

  // Source A: Dashboard aggregate
  const aggResult = await prisma.booking.aggregate({
    where: {
      bookingDate: { gte: todayStart, lte: todayEnd },
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
    },
    _count: { id: true },
  });
  const aggCount = aggResult._count.id;

  // Source B: 逐筆 count 驗證
  const rowCount = await prisma.booking.count({
    where: {
      bookingDate: { gte: todayStart, lte: todayEnd },
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
    },
  });

  const sources = {
    "aggregate _count": aggCount,
    "count() 驗證": rowCount,
  };

  const allMatch = aggCount === rowCount;

  return {
    checkCode: "today_booking_count",
    checkName: "今日預約筆數",
    status: allMatch ? "pass" : "mismatch",
    sources,
    expected: "兩種計數方式完全一致",
    debugPayload: {
      targetDate,
      dateRange: { start: todayStart.toISOString(), end: todayEnd.toISOString() },
      timezone: "Asia/Taipei (UTC+8)",
      formula: "COUNT(booking.id) WHERE date = today AND status IN (PENDING, CONFIRMED)",
      statusFilter: ["PENDING", "CONFIRMED"],
      excludes: ["COMPLETED", "NO_SHOW", "CANCELLED"],
      tolerance: 0,
    },
  };
}

// ============================================================
// 對帳項目 4：今日預約人數
// ============================================================

async function checkTodayBookingPeople(targetDate: string, _targetMonth: string): Promise<CheckResult> {
  const { start: todayStart, end: todayEnd } = todayRange();

  // Source A: Dashboard aggregate
  const aggResult = await prisma.booking.aggregate({
    where: {
      bookingDate: { gte: todayStart, lte: todayEnd },
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
    },
    _sum: { people: true },
  });
  const aggPeople = aggResult._sum.people ?? 0;

  // Source B: 逐筆加總驗證
  const bookings = await prisma.booking.findMany({
    where: {
      bookingDate: { gte: todayStart, lte: todayEnd },
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { people: true, id: true },
  });
  const rowPeople = bookings.reduce((sum, b) => sum + b.people, 0);

  const sources = {
    "aggregate _sum.people": aggPeople,
    "逐筆加總 people": rowPeople,
  };

  const allMatch = aggPeople === rowPeople;

  return {
    checkCode: "today_booking_people",
    checkName: "今日預約人數",
    status: allMatch ? "pass" : "mismatch",
    sources,
    expected: "兩種計算方式完全一致",
    debugPayload: {
      targetDate,
      dateRange: { start: todayStart.toISOString(), end: todayEnd.toISOString() },
      timezone: "Asia/Taipei (UTC+8)",
      formula: "SUM(booking.people) WHERE date = today AND status IN (PENDING, CONFIRMED)",
      bookingCount: bookings.length,
      tolerance: 0,
    },
  };
}

// ============================================================
// 對帳項目 5：CSV 合計列對帳（本月）
// 模擬 CSV 邏輯的合計列 vs 報表邏輯
// ============================================================

async function checkMonthCsvTotals(_targetDate: string, targetMonth: string): Promise<CheckResult> {
  const { start: monthStart, end: monthEnd } = monthRange(targetMonth);

  // Source A: 報表邏輯 — 直接 aggregate
  const [revenueAgg, refundAgg, completedCount] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        transactionType: { in: REVENUE_TYPES as never },
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        transactionType: "REFUND",
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    }),
    prisma.booking.count({
      where: {
        bookingStatus: "COMPLETED",
        bookingDate: { gte: monthStart, lte: monthEnd },
      },
    }),
  ]);

  const reportRevenue = Number(revenueAgg._sum.amount ?? 0);
  const reportRefund = Number(refundAgg._sum.amount ?? 0);
  const reportNet = reportRevenue + reportRefund;
  const reportCompleted = completedCount;

  // Source B: CSV 邏輯 — groupBy staff+type 再合計（模擬 store-monthly route）
  const csvRevenueRows = await prisma.transaction.groupBy({
    by: ["revenueStaffId", "transactionType"],
    where: {
      transactionType: { in: [...REVENUE_TYPES, "REFUND"] as never },
      createdAt: { gte: monthStart, lte: monthEnd },
    },
    _sum: { amount: true },
  });

  let csvRevenue = 0;
  let csvRefund = 0;
  for (const r of csvRevenueRows) {
    const amt = Number((r._sum as { amount: unknown }).amount ?? 0);
    if (r.transactionType === "REFUND") {
      csvRefund += amt;
    } else {
      csvRevenue += amt;
    }
  }
  const csvNet = csvRevenue + csvRefund;

  const csvCompletedRows = await prisma.booking.groupBy({
    by: ["revenueStaffId"],
    where: {
      bookingStatus: "COMPLETED",
      bookingDate: { gte: monthStart, lte: monthEnd },
    },
    _count: { id: true },
  });
  const csvCompleted = csvCompletedRows.reduce(
    (sum, r) => sum + (r._count as { id: number }).id,
    0
  );

  const revenueMatch = reportRevenue === csvRevenue;
  const refundMatch = reportRefund === csvRefund;
  const netMatch = reportNet === csvNet;
  const completedMatch = reportCompleted === csvCompleted;
  const allMatch = revenueMatch && refundMatch && netMatch && completedMatch;

  const sources = {
    "報表課程總收入": reportRevenue,
    "CSV課程總收合計": csvRevenue,
    "報表退款": reportRefund,
    "CSV退款合計": csvRefund,
    "報表淨收入": reportNet,
    "CSV淨收合計": csvNet,
    "報表完成堂數": reportCompleted,
    "CSV完成堂數合計": csvCompleted,
  };

  return {
    checkCode: "month_csv_totals",
    checkName: "CSV 合計列對帳（本月）",
    status: allMatch ? "pass" : "mismatch",
    sources,
    expected: "報表 aggregate = CSV groupBy 合計，四組數字完全一致",
    debugPayload: {
      targetMonth,
      dateRange: { start: monthStart.toISOString(), end: monthEnd.toISOString() },
      timezone: "Asia/Taipei (UTC+8)",
      formulas: {
        revenue: "SUM(amount) WHERE type IN REVENUE_TYPES",
        refund: "SUM(amount) WHERE type = REFUND",
        net: "revenue + refund (refund is negative)",
        completed: "COUNT(booking.id) WHERE status = COMPLETED",
      },
      revenueTypes: REVENUE_TYPES,
      details: {
        revenueMatch,
        refundMatch,
        netMatch,
        completedMatch,
      },
      tolerance: 0,
    },
  };
}
