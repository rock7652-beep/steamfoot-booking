import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/permissions";
import { getStoreFilter } from "@/lib/manager-visibility";
import { resolveActiveStoreId } from "@/lib/store";
import {
  getStoreRevenueSummary,
  getCoachRevenueSummary,
  getTransactionDetails,
  type ReportFilters,
} from "@/lib/report-queries";
import ExcelJS from "exceljs";

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

  const sp = req.nextUrl.searchParams;
  const reportType = sp.get("reportType") ?? "store";
  const level = sp.get("level") ?? "all";
  const startDate = sp.get("startDate");
  const endDate = sp.get("endDate");

  if (!startDate || !endDate) {
    return new NextResponse("startDate and endDate are required", { status: 400 });
  }

  const filters: ReportFilters = {
    startDate,
    endDate,
    storeId: sp.get("storeId"),
    coachId: sp.get("coachId"),
    coachRole: sp.get("coachRole"),
    planType: sp.get("planType"),
    paymentMethod: sp.get("paymentMethod"),
    keyword: sp.get("keyword"),
    storeFilter,
  };

  const periodType = sp.get("periodType") ?? "custom";

  try {
    const workbook = new ExcelJS.Workbook();

    if (reportType === "store") {
      await buildStoreRevenueWorkbook(workbook, filters, level);
    } else {
      await buildCoachRevenueWorkbook(workbook, filters, level);
    }

    const buffer = await workbook.xlsx.writeBuffer();

    const storeName = sp.get("storeName") ?? "全部";
    const coachName = sp.get("coachName") ?? "全部";

    let filename: string;
    if (reportType === "store") {
      filename = `店營收報表_${storeName}_${periodType}_${startDate}_${endDate}.xlsx`;
    } else {
      filename = `教練營收報表_${storeName}_${coachName}_${periodType}_${startDate}_${endDate}.xlsx`;
    }

    const encodedFilename = encodeURIComponent(filename);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (e) {
    console.error("Export error:", e);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

// ============================================================
// 店營收 Workbook
// ============================================================

async function buildStoreRevenueWorkbook(
  workbook: ExcelJS.Workbook,
  filters: ReportFilters,
  level: string
) {
  if (level === "summary" || level === "all") {
    const summary = await getStoreRevenueSummary(filters);
    const ws = workbook.addWorksheet("店營收總表");

    const headers = [
      "分店名稱", "總營收", "退款金額", "淨營收", "交易筆數",
      "客戶數", "平均客單價", "體驗方案收入", "正式方案收入", "票券收入", "商品收入",
    ];
    const headerRow = ws.addRow(headers);
    styleHeaderRow(headerRow);

    for (const s of summary) {
      ws.addRow([
        s.storeName, s.totalRevenue, s.refundAmount, s.netRevenue,
        s.txCount, s.customerCount, s.avgPerCustomer,
        s.trialRevenue, s.packageRevenue, s.singleRevenue, s.otherRevenue,
      ]);
    }

    formatMoneyColumns(ws, [2, 3, 4, 7, 8, 9, 10, 11]);
    autoFitColumns(ws);
    ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
  }

  if (level === "details" || level === "all") {
    const details = await getTransactionDetails(filters, 1, 10000);
    const ws = workbook.addWorksheet("店營收明細");

    const headers = [
      "交易日期", "交易單號", "分店名稱", "客戶姓名", "客戶電話",
      "方案名稱", "方案類型", "原價金額", "折扣金額", "實收金額",
      "收款方式", "狀態", "備註", "建立人員", "建立時間",
    ];
    const headerRow = ws.addRow(headers);
    styleHeaderRow(headerRow);

    for (const d of details.data) {
      ws.addRow([
        formatDate(d.transactionDate), d.transactionNo ?? "",
        d.storeName, d.customerName, d.customerPhone,
        d.planName ?? "", formatPlanType(d.planType),
        d.grossAmount, d.discountAmount, d.netAmount,
        formatPaymentMethod(d.paymentMethod), formatStatus(d.status),
        d.note ?? "", d.createdByName ?? "", formatDate(d.createdAt),
      ]);
    }

    formatMoneyColumns(ws, [8, 9, 10]);
    autoFitColumns(ws);
    ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
  }
}

// ============================================================
// 教練營收 Workbook
// ============================================================

async function buildCoachRevenueWorkbook(
  workbook: ExcelJS.Workbook,
  filters: ReportFilters,
  level: string
) {
  if (level === "summary" || level === "all") {
    const summary = await getCoachRevenueSummary(filters);
    const ws = workbook.addWorksheet("教練營收總表");

    const headers = [
      "教練姓名", "教練角色", "分店名稱", "歸屬總收入", "退款金額",
      "淨收入", "交易筆數", "客戶數", "平均單筆收入",
      "新客收入", "舊客收入", "體驗收入", "正式方案收入", "票券收入", "商品收入",
    ];
    const headerRow = ws.addRow(headers);
    styleHeaderRow(headerRow);

    for (const c of summary) {
      ws.addRow([
        c.coachName, formatCoachRole(c.coachRole), c.storeName,
        c.totalRevenue, c.refundAmount, c.netRevenue,
        c.txCount, c.customerCount, c.avgPerTx,
        c.newCustomerRevenue, c.existingCustomerRevenue,
        c.trialRevenue, c.packageRevenue, c.singleRevenue, c.otherRevenue,
      ]);
    }

    formatMoneyColumns(ws, [4, 5, 6, 9, 10, 11, 12, 13, 14, 15]);
    autoFitColumns(ws);
    ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
  }

  if (level === "details" || level === "all") {
    const details = await getTransactionDetails(filters, 1, 10000);
    const ws = workbook.addWorksheet("教練營收明細");

    const headers = [
      "交易日期", "交易單號", "分店名稱", "教練姓名", "教練角色",
      "客戶姓名", "客戶電話", "方案名稱", "方案類型", "實收金額",
      "收款方式", "狀態", "是否新客", "備註", "建立時間",
    ];
    const headerRow = ws.addRow(headers);
    styleHeaderRow(headerRow);

    for (const d of details.data) {
      ws.addRow([
        formatDate(d.transactionDate), d.transactionNo ?? "",
        d.storeName, d.coachName ?? "", formatCoachRole(d.coachRole),
        d.customerName, d.customerPhone,
        d.planName ?? "", formatPlanType(d.planType),
        d.netAmount, formatPaymentMethod(d.paymentMethod),
        formatStatus(d.status), d.isFirstPurchase ? "是" : "否",
        d.note ?? "", formatDate(d.createdAt),
      ]);
    }

    formatMoneyColumns(ws, [10]);
    autoFitColumns(ws);
    ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
  }
}

// ============================================================
// Excel helpers
// ============================================================

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8E8E8" },
  };
}

function formatMoneyColumns(ws: ExcelJS.Worksheet, cols: number[]) {
  for (const col of cols) {
    ws.getColumn(col).numFmt = "#,##0";
  }
}

function autoFitColumns(ws: ExcelJS.Worksheet) {
  ws.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 4, 40);
  });
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function formatPlanType(type: string | null): string {
  if (!type) return "";
  const map: Record<string, string> = {
    TRIAL: "體驗",
    SINGLE: "單次",
    PACKAGE: "套餐",
  };
  return map[type] ?? type;
}

function formatPaymentMethod(method: string): string {
  const map: Record<string, string> = {
    CASH: "現金",
    TRANSFER: "轉帳",
    LINE_PAY: "LINE Pay",
    CREDIT_CARD: "信用卡",
    OTHER: "其他",
    UNPAID: "未付款",
  };
  return map[method] ?? method;
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    SUCCESS: "成功",
    CANCELLED: "已取消",
    REFUNDED: "已退款",
  };
  return map[status] ?? status;
}

function formatCoachRole(role: string | null): string {
  if (!role) return "";
  const map: Record<string, string> = {
    ADMIN: "總部",
    OWNER: "店長",
    PARTNER: "合作店長",
  };
  return map[role] ?? role;
}
