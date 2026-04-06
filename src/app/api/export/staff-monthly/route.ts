import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { toLocalMonthStr, monthRange } from "@/lib/date-utils";

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
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  const allowed = await checkPermission(session.user.role, session.user.staffId, "report.export");
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const { searchParams } = req.nextUrl;
  const month = searchParams.get("month") ?? toLocalMonthStr();

  const { start: monthStart, end: monthEnd } = monthRange(month);

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
    const sid = r.revenueStaffId ?? "unassigned";
    if (!byStaff[sid]) {
      byStaff[sid] = { name: staffMap[sid] ?? "未指派", trial: 0, single: 0, package: 0, supplement: 0, total: 0, spaceFee: 0, net: 0, completed: 0 };
    }
    const amt = Number((r._sum as { amount: unknown }).amount ?? 0);
    const s = byStaff[sid];
    if (r.transactionType === "TRIAL_PURCHASE") s.trial += amt;
    else if (r.transactionType === "SINGLE_PURCHASE") s.single += amt;
    else if (r.transactionType === "PACKAGE_PURCHASE") s.package += amt;
    else if (r.transactionType === "SUPPLEMENT") s.supplement += amt;
    s.total += amt;
  }
  for (const b of completedRows) {
    const cnt = b._count as { id: number };
    const sid = b.revenueStaffId ?? "unassigned";
    if (byStaff[sid]) byStaff[sid].completed = cnt.id;
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

  const headers = ["店長", "體驗收入", "單次收入", "課程收入", "補差額", "課程總收入", "空間分租費", "淨收", "完成服務堂數"];
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
