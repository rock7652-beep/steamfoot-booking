import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { toLocalMonthStr, monthRange } from "@/lib/date-utils";
import { getManagerReadFilter, getStoreFilter } from "@/lib/manager-visibility";
import { resolveActiveStoreId, currentStoreId } from "@/lib/store";
import { checkReportLimit } from "@/lib/usage-gate";
import { getStorePlanById } from "@/lib/store-plan";
import { REVENUE_VALID_STATUS } from "@/lib/booking-constants";

// TODO(PR-payment-confirm): PR-3/4 上線後，CSV 匯出的 Transaction groupBy 必須加
// paymentStatus: { in: ["SUCCESS", "CONFIRMED"] }，否則匯出會含 PENDING 交易誤差。
// 本 PR-1 不加：歷史 backfill=SUCCESS，匯出數字與上線前一致。

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => {
    const str = String(cell ?? "");
    return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
  }).join(",")).join("\n");
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  const allowed = await checkPermission(session.user.role, session.user.staffId, "report.export");
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const user = session.user;
  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);
  const storeFilter = getStoreFilter(user, activeStoreId);

  // PricingPlan: 報表匯出次數限制
  if (user.storeId) {
    const store = await prisma.store.findUnique({
      where: { id: user.storeId },
      select: {
        id: true, plan: true,
        maxStaffOverride: true, maxCustomersOverride: true,
        maxMonthlyBookingsOverride: true, maxMonthlyReportsOverride: true,
        maxReminderSendsOverride: true, maxStoresOverride: true,
      },
    });
    if (store) {
      // 計算本月匯出次數（用 ErrorLog 的 EXTERNAL_API 作為 proxy 太粗略，直接計 report snapshot）
      // 簡化：EXPERIENCE/BASIC maxMonthlyReports=0 直接阻擋
      const limitCheck = checkReportLimit(store, 0);
      if (!limitCheck.allowed) {
        return new NextResponse("報表匯出功能需升級方案", { status: 403 });
      }
    }
  }

  const { searchParams } = req.nextUrl;
  const month = searchParams.get("month") ?? toLocalMonthStr();

  const { start: monthStart, end: monthEnd } = monthRange(month);

  const revenueFilter = getManagerReadFilter(session.user.role, session.user.staffId, "revenueStaffId", activeStoreId);
  const staffIdFilter = getManagerReadFilter(session.user.role, session.user.staffId, "staffId", activeStoreId);

  // SpaceFeeRecord now has storeId — use staffIdFilter directly
  const spaceFeeFilter = staffIdFilter;

  const [txRows, cashRows, spaceFees, completedRows] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["revenueStaffId", "transactionType"],
      where: {
        ...revenueFilter,
        ...storeFilter,
        transactionType: { in: ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT", "REFUND"] },
        status: REVENUE_VALID_STATUS,
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    }),
    prisma.cashbookEntry.groupBy({
      by: ["type"],
      where: { ...staffIdFilter, ...storeFilter, entryDate: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.spaceFeeRecord.findMany({
      where: { ...spaceFeeFilter, month },
      select: { staffId: true, feeAmount: true },
    }),
    prisma.booking.groupBy({
      by: ["revenueStaffId"],
      where: { ...revenueFilter, ...storeFilter, bookingStatus: "COMPLETED", bookingDate: { gte: monthStart, lte: monthEnd } },
      _count: { id: true },
    }),
  ]);

  const staffIds = [...new Set(txRows.map((r) => r.revenueStaffId).filter((id): id is string => id !== null))];
  const staffList = await prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, displayName: true } });
  const staffMap: Record<string, string> = Object.fromEntries(staffList.map((s) => [s.id, s.displayName]));

  const byStaff: Record<string, { name: string; trial: number; single: number; package: number; supplement: number; refund: number; total: number; spaceFee: number; net: number; completed: number }> = {};
  for (const r of txRows) {
    const sid = r.revenueStaffId ?? "unassigned";
    if (!byStaff[sid]) byStaff[sid] = { name: staffMap[sid] ?? "未指派", trial: 0, single: 0, package: 0, supplement: 0, refund: 0, total: 0, spaceFee: 0, net: 0, completed: 0 };
    const amt = Number((r._sum as { amount: unknown }).amount ?? 0);
    const s = byStaff[sid];
    if (r.transactionType === "TRIAL_PURCHASE") { s.trial += amt; s.total += amt; }
    else if (r.transactionType === "SINGLE_PURCHASE") { s.single += amt; s.total += amt; }
    else if (r.transactionType === "PACKAGE_PURCHASE") { s.package += amt; s.total += amt; }
    else if (r.transactionType === "SUPPLEMENT") { s.supplement += amt; s.total += amt; }
    else if (r.transactionType === "REFUND") { s.refund += amt; } // negative
  }
  for (const b of completedRows) {
    const cnt = b._count as { id: number };
    const sid = b.revenueStaffId ?? "unassigned";
    if (byStaff[sid]) byStaff[sid].completed = cnt.id;
  }
  for (const f of spaceFees) {
    if (byStaff[f.staffId]) {
      byStaff[f.staffId].spaceFee = Number(f.feeAmount);
      byStaff[f.staffId].net = byStaff[f.staffId].total + byStaff[f.staffId].refund - Number(f.feeAmount);
    }
  }
  for (const id of Object.keys(byStaff)) {
    if (!byStaff[id].spaceFee) byStaff[id].net = byStaff[id].total + byStaff[id].refund;
  }

  const cashMap: Record<string, number> = {};
  for (const c of cashRows) cashMap[c.type] = Number((c._sum as { amount: unknown }).amount ?? 0);
  const cashIncome = cashMap["INCOME"] ?? 0;
  const cashExpense = (cashMap["EXPENSE"] ?? 0) + (cashMap["WITHDRAW"] ?? 0);

  const rows: string[][] = [
    [`蒸足店 全店月報 — ${month}`],
    [],
    ["=== 課程收入明細（按店長）==="],
    ["店長", "體驗", "單次", "課程", "補差額", "退款", "課程總收", "空間費", "淨收", "完成堂數"],
    ...Object.values(byStaff).map((s) => [s.name, s.trial, s.single, s.package, s.supplement, s.refund, s.total, s.spaceFee, s.net, s.completed].map(String)),
    ["合計",
      Object.values(byStaff).reduce((a, s) => a + s.trial, 0),
      Object.values(byStaff).reduce((a, s) => a + s.single, 0),
      Object.values(byStaff).reduce((a, s) => a + s.package, 0),
      Object.values(byStaff).reduce((a, s) => a + s.supplement, 0),
      Object.values(byStaff).reduce((a, s) => a + s.refund, 0),
      Object.values(byStaff).reduce((a, s) => a + s.total, 0),
      Object.values(byStaff).reduce((a, s) => a + s.spaceFee, 0),
      Object.values(byStaff).reduce((a, s) => a + s.net, 0),
      Object.values(byStaff).reduce((a, s) => a + s.completed, 0),
    ].map(String),
    [],
    ["=== 現金帳 ==="],
    ["收入", cashIncome],
    ["支出 + 提領", cashExpense],
    ["淨額", cashIncome - cashExpense],
  ].map((row) => row.map(String));

  const csv = toCsv(rows);
  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="store-monthly-${month}.csv"`,
    },
  });
}
