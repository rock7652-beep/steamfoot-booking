import {formatTWTime} from "@/lib/date-utils";
import {moduleStaffRevenueSummary,type ModuleRevenueRow} from "@/lib/module-revenue-report";
import type {StoreRevenueSummary} from "@/lib/report-queries";
import { AppError } from "@/lib/errors";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { getCourseRevenueReport } from "@/server/queries/course-revenue-report";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { checkPermission } from "@/lib/permissions";
import { requireDataExportFeature } from "@/lib/data-export-gate";
import {getManagerReadFilter} from "@/lib/manager-visibility";
import { getStoreFilter } from "@/lib/manager-visibility";
import { resolveActiveStoreId } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
  userForViewContext,
} from "@/lib/store-view-context-server";
import {
  getStoreRevenueSummary,
  getCoachRevenueSummary,
  getTransactionDetails,
  type ReportFilters,
} from "@/lib/report-queries";
import ExcelJS from "exceljs";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const allowed = await checkPermission(user.role, user.staffId, "report.export");
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  if (storeViewContext?.isViewMode) {
    return new NextResponse("Reports export is not available in view mode", { status: 403 });
  }

  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = await resolveActiveStoreId(user, cookieStoreId);
  const readUser = userForViewContext(user, storeViewContext);
  const reportsStoreId = storeIdForViewContext(activeStoreId, storeViewContext);
  const storeFilter = getStoreFilter(readUser, reportsStoreId);

  const sp = req.nextUrl.searchParams;
  const analysisStoreId = getEffectiveActorRole(user) === "ADMIN" && !storeViewContext?.isViewMode
    ? sp.get("storeId") ?? reportsStoreId
    : reportsStoreId;
  if ((!analysisStoreId && getEffectiveActorRole(user) !== "ADMIN") ||
      (analysisStoreId && !(await hasStoreFeature(analysisStoreId, FEATURES.BASIC_REPORTS)))) {
    return NextResponse.json({ error: "分析尚未開通，NT$800／月獨立加購" }, { status: 403 });
  }

  const dataExportStoreId = getEffectiveActorRole(user) === "ADMIN"
    ? sp.get("storeId") ?? reportsStoreId
    : reportsStoreId;
  const dataExportLocked = await requireDataExportFeature(dataExportStoreId);
  if (dataExportLocked) return dataExportLocked;

  const reportType = sp.get("reportType") ?? "store";
  const level = sp.get("level") ?? "all";
  const startDate = sp.get("startDate");
  const endDate = sp.get("endDate");

  if (!startDate || !endDate) {
    return new NextResponse("startDate and endDate are required", { status: 400 });
  }

  const filters: ReportFilters = {
    dataScope: sp.get("dataScope"),
    startDate,
    endDate,
    storeId: getEffectiveActorRole(user) === "ADMIN" ? sp.get("storeId") : reportsStoreId,
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

    const industry=analysisStoreId?await getStoreIndustryModule(analysisStoreId):null;
    if (analysisStoreId && (industry === "course"||industry==="beauty")) {
      if(industry==="beauty"){
        const scope=getManagerReadFilter(readUser.role,readUser.staffId??null,"revenueStaffId",analysisStoreId);
        if(typeof scope.revenueStaffId==="string"){
          if(filters.coachId&&filters.coachId!==scope.revenueStaffId)return new NextResponse("Forbidden",{status:403});
          filters.coachId=scope.revenueStaffId;
        }
      }
      if(industry==="beauty"&&level!=="summary"&&(!(await checkPermission(user.role,user.staffId,"transaction.read"))||!(await hasStoreFeature(analysisStoreId,FEATURES.TRANSACTION_MANAGEMENT))))return new NextResponse("Forbidden",{status:403});
      const report = industry==="beauty"?await (await import("@/server/queries/beauty-revenue-report")).getBeautyRevenueReport(analysisStoreId,filters,{customers:await checkPermission(user.role,user.staffId,"customer.read")}):await getCourseRevenueReport(analysisStoreId, filters);
      if(industry==="beauty"){
        if(report.data.length>10000)return new NextResponse("單次最多匯出 10,000 筆，請縮小篩選範圍",{status:413});
        if(reportType==="store")await buildStoreRevenueWorkbook(workbook,filters,level,report);
        else await buildCoachRevenueWorkbook(workbook,filters,level,report);
      }else{
      const summary = workbook.addWorksheet("課程收入總覽");
      summary.addRow(["收款登錄","退款／沖銷","淨收入","收款紀錄數","付款顧客數"]);
      summary.addRow([report.kpi.totalRevenue,report.kpi.refundAmount,report.kpi.netRevenue,report.kpi.txCount,report.kpi.customerCount]);
      const sheet = workbook.addWorksheet("課程收退款明細");
      sheet.addRow(["發生日","類型","顧客","方案","點數／堂數制","金額","歸屬人員","備註"]);
      for (const row of report.data) sheet.addRow([row.transactionDate,row.refund?(row.unit==="TRIAL"?"體驗收款沖銷":"退款"):(row.unit==="TRIAL"?"體驗收款":"核帳收入"),row.customerName,row.planName,row.unit==="TRIAL"?"體驗（不使用方案）":row.unit==="SESSION"?"堂數":"點數",row.netAmount,row.coachName??"",row.note??""]);
      sheet.views=[{state:"frozen",ySplit:1,xSplit:0}];
      autoFitColumns(sheet);autoFitColumns(summary);
      }
    } else if (reportType === "store") {
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
        "Cache-Control":"private, no-store",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (e) {
    if (e instanceof AppError && e.code === "VALIDATION") return NextResponse.json({ error: e.message }, { status: 400 });
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
  level: string,
  source?:{data:ModuleRevenueRow[];summary:StoreRevenueSummary[]}
) {
  if (level === "summary" || level === "all") {
    const summary = source?.summary ?? await getStoreRevenueSummary(filters);
    const ws = workbook.addWorksheet(source?"服務收入總表":"店營收總表");

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
    const details = source ? {data:source.data} : await getTransactionDetails(filters, 1, 10000);
    const ws = workbook.addWorksheet(source?"服務收退款明細":"店營收明細");

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
        d.planName ?? "", source&&d.planType==="SESSION"?"次數":formatPlanType(d.planType),
        d.grossAmount, d.discountAmount, d.netAmount,
        formatPaymentMethod(d.paymentMethod), formatStatus(d.status),
        d.note ?? "", d.createdByName ?? "", source?formatTWTime(new Date(d.createdAt)):formatDate(d.createdAt),
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
  level: string,
  source?:{data:ModuleRevenueRow[];summary:StoreRevenueSummary[]}
) {
  if (level === "summary" || level === "all") {
    const summary = source ? moduleStaffRevenueSummary({...source,kpi:{totalRevenue:0,refundAmount:0,netRevenue:0,txCount:0,customerCount:0,avgPerCustomer:0},paymentMethods:[]}) : await getCoachRevenueSummary(filters);
    const ws = workbook.addWorksheet(source?"店長歸屬收入總表":"教練營收總表");

    const headers = [
      source?"所屬店長":"教練姓名", source?"角色":"教練角色", "分店名稱", "歸屬總收入", "退款金額",
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
    const details = source ? {data:source.data} : await getTransactionDetails(filters, 1, 10000);
    const ws = workbook.addWorksheet(source?"店長歸屬收入明細":"教練營收明細");

    const headers = [
      "交易日期", "交易單號", "分店名稱", source?"所屬店長":"教練姓名", source?"角色":"教練角色",
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
        d.planName ?? "", source&&d.planType==="SESSION"?"次數":formatPlanType(d.planType),
        d.netAmount, formatPaymentMethod(d.paymentMethod),
        formatStatus(d.status), d.isFirstPurchase ? "是" : "否",
        d.note ?? "", source?formatTWTime(new Date(d.createdAt)):formatDate(d.createdAt),
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
  ws.eachRow(row=>row.eachCell(cell=>{if(typeof cell.value==="string"&&/^[=+\-@]/.test(cell.value.trimStart()))cell.value="'"+cell.value;}));
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
    OWNER: "老闆",
    MANAGER: "店長",
    STAFF: "門市人員",
    PARTNER: "門市人員（舊帳號）",
  };
  return map[role] ?? role;
}
