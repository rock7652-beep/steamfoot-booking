import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";

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

  const { searchParams } = req.nextUrl;
  const month = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);

  const TZ_OFFSET = 8; // Asia/Taipei UTC+8
  const [year, mon] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, mon - 1, 1, -TZ_OFFSET));
  const monthEnd = new Date(Date.UTC(year, mon, 0, 23 - TZ_OFFSET, 59, 59, 999));

  const [txRows, cashRows, spaceFees, completedRows] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["revenueStaffId", "transactionType"],
      where: {
        transactionType: { in: ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT", "REFUND"] },
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    }),
    prisma.cashbookEntry.groupBy({
      by: ["type"],
      where: { entryDate: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.spaceFeeRecord.findMany({
      where: { month },
      select: { staffId: true, feeAmount: true },
    }),
    prisma.booking.groupBy({
      by: ["revenueStaffId"],
      where: { bookingStatus: "COMPLETED", bookingDate: { gte: monthStart, lte: monthEnd } },
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
