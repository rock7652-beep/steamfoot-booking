import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import { getStoreFilter } from "@/lib/manager-visibility";
import { resolveActiveStoreId } from "@/lib/store";

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
  const allowed = await checkPermission(session.user.role, session.user.staffId, "customer.export");
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const user = session.user;
  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);

  // 匯出符合當前店舖視角的顧客
  const customers = await prisma.customer.findMany({
    where: { ...getStoreFilter(user, activeStoreId) },
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
    "Email",
    "Google 帳號",
    "LINE 名稱",
    "狀態",
    "直屬店長",
    "有效方案",
    "剩餘堂數",
    "總預約數",
    "最近消費",
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
      c.email ?? "",
      c.user?.email ?? "",
      c.lineName ?? "",
      STAGE_ZH[c.customerStage] ?? c.customerStage,
      c.assignedStaff?.displayName ?? "未指派",
      activePlans || "無",
      remainingSessions.toString(),
      c._count.bookings.toString(),
      c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString("zh-TW") : "",
      c.notes ?? "",
      c.firstVisitAt ? new Date(c.firstVisitAt).toLocaleDateString("zh-TW") : "",
      new Date(c.createdAt).toLocaleDateString("zh-TW"),
    ];
  });

  const csv = toCsv([headers, ...rows]);
  const today = toLocalDateStr();
  const filename = `顧客資料_${today}.csv`;

  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
