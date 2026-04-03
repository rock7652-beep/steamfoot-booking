import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? "");
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(",")
    )
    .join("\n");
}

const STAGE_ZH: Record<string, string> = {
  LEAD: "名單",
  TRIAL: "體驗",
  ACTIVE: "已購課",
  INACTIVE: "已停用",
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  if (session.user.role === "CUSTOMER") return new NextResponse("Forbidden", { status: 403 });

  // Manager can only export own customers
  const staffFilter =
    session.user.role === "MANAGER" && session.user.staffId
      ? { assignedStaffId: session.user.staffId }
      : {};

  const customers = await prisma.customer.findMany({
    where: { ...staffFilter },
    include: {
      assignedStaff: { select: { displayName: true } },
      user: { select: { email: true } },
      planWallets: {
        where: { status: "ACTIVE" },
        select: { remainingSessions: true, plan: { select: { name: true } } },
      },
      _count: {
        select: {
          bookings: { where: { bookingStatus: { in: ["CONFIRMED", "COMPLETED"] } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const headers = [
    "姓名",
    "電話",
    "LINE 名稱",
    "Email",
    "狀態",
    "歸屬店長",
    "有效方案",
    "剩餘堂數",
    "總預約數",
    "備註",
    "首次到訪",
    "建立日期",
  ];

  const rows = customers.map((c) => {
    const activePlans = c.planWallets.map((w) => w.plan.name).join("、");
    const remainingSessions = c.planWallets.reduce((sum, w) => sum + w.remainingSessions, 0);
    return [
      c.name,
      c.phone,
      c.lineName ?? "",
      c.user?.email ?? "",
      STAGE_ZH[c.customerStage] ?? c.customerStage,
      c.assignedStaff.displayName,
      activePlans || "無",
      remainingSessions.toString(),
      c._count.bookings.toString(),
      c.notes ?? "",
      c.firstVisitAt ? new Date(c.firstVisitAt).toLocaleDateString("zh-TW") : "",
      new Date(c.createdAt).toLocaleDateString("zh-TW"),
    ];
  });

  const csv = toCsv([headers, ...rows]);
  const today = new Date().toISOString().slice(0, 10);
  const filename = `顧客資料_${today}.csv`;

  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
