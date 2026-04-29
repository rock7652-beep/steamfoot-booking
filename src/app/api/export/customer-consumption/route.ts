import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getStoreFilter } from "@/lib/manager-visibility";
import { resolveActiveStoreId } from "@/lib/store";

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => {
    const str = String(cell ?? "");
    return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
  }).join(",")).join("\n");
}

const TX_TYPE_ZH: Record<string, string> = {
  TRIAL_PURCHASE: "體驗購買", SINGLE_PURCHASE: "單次消費",
  PACKAGE_PURCHASE: "課程購買", SESSION_DEDUCTION: "堂數扣抵",
  SUPPLEMENT: "補差額", REFUND: "退款", ADJUSTMENT: "手動調整",
};
const PAY_ZH: Record<string, string> = {
  CASH: "現金", TRANSFER: "匯款", LINE_PAY: "LINE Pay",
  CREDIT_CARD: "信用卡", OTHER: "其他",
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = req.nextUrl;
  const customerId = searchParams.get("customerId");
  const month = searchParams.get("month");

  if (!customerId) return new NextResponse("customerId required", { status: 400 });

  const user = session.user;
  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);

  // Permission check
  const customer = await prisma.customer.findUnique({
    where: { id: customerId, ...getStoreFilter(user, activeStoreId) },
    select: { id: true, name: true, phone: true, assignedStaffId: true },
  });
  if (!customer) return new NextResponse("Not found", { status: 404 });

  // Staff: check customer.export permission; Customer: only own data
  if (session.user.role === "CUSTOMER") {
    if (customer.id !== session.user.customerId) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  } else {
    const allowed = await checkPermission(session.user.role, session.user.staffId, "customer.export");
    if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  }

  let dateFilter: Record<string, unknown> = {};
  if (month) {
    const [year, mon] = month.split("-").map(Number);
    dateFilter = { createdAt: { gte: new Date(year, mon - 1, 1), lte: new Date(year, mon, 0, 23, 59, 59) } };
  }

  const transactions = await prisma.transaction.findMany({
    where: { customerId, ...dateFilter, ...getStoreFilter(user, activeStoreId) },
    include: { revenueStaff: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
  });

  const wallets = await prisma.customerPlanWallet.findMany({
    where: { customerId, ...getStoreFilter(user, activeStoreId) },
    include: { plan: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const headers = ["日期", "類型", "金額", "付款方式", "歸屬店長", "備註"];
  const txRows = transactions.map((t) => [
    new Date(t.createdAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" }),
    TX_TYPE_ZH[t.transactionType] ?? t.transactionType,
    Number(t.amount).toString(),
    PAY_ZH[t.paymentMethod] ?? t.paymentMethod,
    t.revenueStaff.displayName,
    t.note ?? "",
  ]);

  const walletHeaders = ["方案名稱", "購入金額", "總堂數", "剩餘堂數", "狀態", "開始日期", "到期日"];
  const walletRows = wallets.map((w) => [
    w.plan.name,
    Number(w.purchasedPrice).toString(),
    w.totalSessions.toString(),
    w.remainingSessions.toString(),
    w.status,
    new Date(w.startDate).toLocaleDateString("zh-TW"),
    w.expiryDate ? new Date(w.expiryDate).toLocaleDateString("zh-TW") : "無期限",
  ]);

  // 規格 v1：總消費金額排除 VOIDED；CSV 列表仍顯示作廢交易供透明
  const totalSpent = transactions
    .filter((t) => ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT"].includes(t.transactionType) && t.status === "SUCCESS")
    .reduce((s, t) => s + Number(t.amount), 0);

  const rows: string[][] = [
    [`顧客消費明細 — ${customer.name}（${customer.phone}）${month ? ` / ${month}` : ""}`],
    [],
    ["=== 消費紀錄 ==="],
    headers,
    ...txRows,
    [],
    [`總消費金額（不含退款）: ${totalSpent}`],
    [],
    ["=== 課程錢包 ==="],
    walletHeaders,
    ...walletRows,
  ];

  const csv = toCsv(rows);
  const filename = `customer-${customer.name}-${month ?? "all"}.csv`;
  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
