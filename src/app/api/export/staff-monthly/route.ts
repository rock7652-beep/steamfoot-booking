import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? "");
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    )
    .join("\n");
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "OWNER" && session.user.role !== "MANAGER")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const month = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);

  const [year, mon] = month.split("-").map(Number);
  const monthStart = new Date(year, mon - 1, 1);
  const monthEnd = new Date(year, mon, 0, 23, 59, 59);

  const REVENUE_TYPES = ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT"];

  const staffFilter =
    session.user.role === "MANAGER" && session.user.staffId
      ? { revenueStaffId: session.user.staffId }
      : {};

  const [txRows, completedRows, spaceFees] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["revenueStaffId", "transactionType"],
      where: {
        ...staffFilter,
        transactionType: { in: REVENUE_TYPES as never },
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    }),
    prisma.booking.groupBy({
      by: ["revenueStaffId"],
      where: {
        ...(session.user.role === "MANAGER" && session.user.staffId
          ? { revenueStaffId: session.user.staffId }
          : {}),
        bookingStatus: "COMPLETED",
        bookingDate: { gte: monthStart, lte: monthEnd },
      },
      _count: { id: true },
    }),
    prisma.spaceFeeRecord.findMany({
      where: {
        ...(session.user.role === "MANAGER" && session.user.staffId
          ? { staffId: session.user.staffId }
          : {}),
        month,
      },
      select: { staffId: true, feeAmount: true },
    }),
  ]);

  // Gather all staff IDs
  const staffIds = [...new Set(txRows.map((r) => r.revenueStaffId))];
  const staffList = await prisma.staff.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, displayName: true },
  });
  const staffMap = Object.fromEntries(staffList.map((s) => [s.id, s.displayName]));

  // Build by-staff summary
  const byStaff: Record<string, {
    name: string; trial: number; single: number; package: number; supplement: number; total: number; spaceFee: number; net: number; completed: number;
  }> = {};

  for (const r of txRows) {
    if (!byStaff[r.revenueStaffId]) {
      byStaff[r.revenueStaffId] = { name: staffMap[r.revenueStaffId] ?? "未知", trial: 0, single: 0, package: 0, supplement: 0, total: 0, spaceFee: 0, net: 0, completed: 0 };
    }
    const amt = Number((r._sum as { amount: unknown }).amount ?? 0);
    const s = byStaff[r.revenueStaffId];
    if (r.transactionType === "TRIAL_PURCHASE") s.trial += amt;
    else if (r.transactionType === "SINGLE_PURCHASE") s.single += amt;
    else if (r.transactionType === "PACKAGE_PURCHASE") s.package += amt;
    else if (r.transactionType === "SUPPLEMENT") s.supplement += amt;
    s.total += amt;
  }
  for (const b of completedRows) {
    const cnt = b._count as { id: number };
    if (byStaff[b.revenueStaffId]) byStaff[b.revenueStaffId].completed = cnt.id;
  }
  for (const f of spaceFees) {
    if (byStaff[f.staffId]) {
      byStaff[f.staffId].spaceFee = Number(f.feeAmount);
      byStaff[f.staffId].net = byStaff[f.staffId].total - Number(f.feeAmount);
    }
  }
  // Fix net for those without space fee
  for (const id of Object.keys(byStaff)) {
    if (!byStaff[id].net && byStaff[id].spaceFee === 0) {
      byStaff[id].net = byStaff[id].total;
    }
  }

  const headers = ["店長", "體驗收入", "單次收入", "套餐收入", "補差額", "課程總收入", "空間分租費", "淨收", "完成服務堂數"];
  const dataRows = Object.values(byStaff).map((s) => [
    s.name, s.trial, s.single, s.package, s.supplement, s.total, s.spaceFee, s.net, s.completed
  ].map(String));

  const csv = toCsv([headers, ...dataRows]);
  const filename = `staff-monthly-${month}.csv`;

  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
