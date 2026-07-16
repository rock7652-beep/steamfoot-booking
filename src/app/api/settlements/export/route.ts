/**
 * /api/settlements/export — 店長服務金額試算 xlsx 匯出（PR-2.2 第三 commit）
 *
 * 沿用既有 /api/reports/export 慣例：exceljs + xlsx + 兩個 sheet。
 *
 * 權限：report.read（與試算頁本體一致）
 *
 * Query params:
 *   startDate=YYYY-MM-DD  必填
 *   endDate=YYYY-MM-DD    必填
 *   staffId=cuid          可選；UNASSIGNED 篩用 sentinel token
 *
 * 兩個 sheet：
 *   1. 店長彙總（依 revenueStaffId 分組）
 *   2. 明細（每筆 booking 一列）
 *
 * 不寫入任何資料；資料層 100% 重用 previewStaffSettlement query。
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/permissions";
import { requireDataExportFeature } from "@/lib/data-export-gate";
import { resolveActiveStoreId } from "@/lib/store";
import {
  previewStaffSettlement,
  type AmountSource,
} from "@/server/queries/staff-settlement";
import ExcelJS from "exceljs";

const BOOKING_TYPE_LABEL: Record<string, string> = {
  FIRST_TRIAL: "體驗",
  SINGLE: "單堂",
  PACKAGE_SESSION: "套餐",
};

const AMOUNT_SOURCE_LABEL: Record<AmountSource, string> = {
  formula_clean: "公式",
  formula_confirmed: "公式 (已確認)",
  override: "人工指定",
  operator_excluded: "已排除",
  trial_no_wallet: "試用",
  single_no_wallet: "單次",
  missing_wallet: "缺 wallet",
  needs_operator_review: "需人工確認",
  data_missing: "資料殘缺",
  confirmed_but_data_missing: "已確認但資料殘缺",
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

  const allowed = await checkPermission(
    session.user.role,
    session.user.staffId,
    "report.read",
  );
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const sp = req.nextUrl.searchParams;
  const startDate = sp.get("startDate");
  const endDate = sp.get("endDate");
  const staffId = sp.get("staffId") ?? undefined;

  if (!startDate || !endDate) {
    return new NextResponse("startDate and endDate are required", {
      status: 400,
    });
  }

  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = await resolveActiveStoreId(session.user, cookieStoreId);
  const dataExportLocked = await requireDataExportFeature(activeStoreId);
  if (dataExportLocked) return dataExportLocked;

  let summary: Awaited<ReturnType<typeof previewStaffSettlement>>["summary"];
  let details: Awaited<ReturnType<typeof previewStaffSettlement>>["details"];
  try {
    const result = await previewStaffSettlement({
      startDate,
      endDate,
      staffId,
      activeStoreId,
    });
    summary = result.summary;
    details = result.details;
  } catch (e) {
    return new NextResponse(
      `Query failed: ${e instanceof Error ? e.message : String(e)}`,
      { status: 500 },
    );
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Steamfoot Settlement Preview";
  workbook.created = new Date();

  // ── Sheet 1: 店長彙總 ─────────────────────────────────────────────
  const summarySheet = workbook.addWorksheet("店長彙總");
  summarySheet.columns = [
    { header: "店長", key: "staffName", width: 18 },
    { header: "一般完成服務次數", key: "regularCount", width: 18 },
    { header: "補課完成服務次數", key: "makeupCount", width: 18 },
    { header: "可計算次數", key: "totalCount", width: 12 },
    { header: "需人工確認次數", key: "needsReviewCount", width: 16 },
    { header: "應結金額", key: "countedAmount", width: 14 },
  ];
  summarySheet.getRow(1).font = { bold: true };
  for (const row of summary) {
    summarySheet.addRow({
      staffName: row.staffName,
      regularCount: row.regularCount,
      makeupCount: row.makeupCount,
      totalCount: row.totalCount,
      needsReviewCount: row.needsReviewCount,
      countedAmount: Math.round(row.countedAmount * 100) / 100,
    });
  }
  // 金額欄套 format
  summarySheet.getColumn("countedAmount").numFmt = "#,##0.00";

  // ── Sheet 2: 明細 ──────────────────────────────────────────────────
  const detailSheet = workbook.addWorksheet("明細");
  detailSheet.columns = [
    { header: "日期", key: "date", width: 12 },
    { header: "時段", key: "slot", width: 8 },
    { header: "顧客", key: "customer", width: 18 },
    { header: "類型", key: "type", width: 10 },
    { header: "補課", key: "makeup", width: 6 },
    { header: "歸屬店長", key: "revenueStaff", width: 14 },
    { header: "實際服務者 (參考)", key: "serviceStaff", width: 16 },
    { header: "Wallet ID", key: "walletId", width: 28 },
    { header: "金額來源", key: "source", width: 16 },
    { header: "是否計入", key: "counted", width: 10 },
    { header: "是否需人工確認", key: "needsReview", width: 16 },
    { header: "金額", key: "amount", width: 12 },
  ];
  detailSheet.getRow(1).font = { bold: true };
  for (const d of details) {
    detailSheet.addRow({
      date: d.bookingDate.toISOString().slice(0, 10),
      slot: d.slotTime,
      customer: d.customerName,
      type: BOOKING_TYPE_LABEL[d.bookingType] ?? d.bookingType,
      makeup: d.isMakeup ? "Y" : "",
      revenueStaff: d.revenueStaffName,
      serviceStaff: d.serviceStaffName,
      walletId: d.walletId ?? "",
      source: AMOUNT_SOURCE_LABEL[d.amountSource] ?? d.amountSource,
      counted: d.counted ? "Y" : "N",
      needsReview: d.needsReview ? "Y" : "",
      amount: d.amount,
    });
  }
  detailSheet.getColumn("amount").numFmt = "#,##0.00";

  const buffer = await workbook.xlsx.writeBuffer();

  const filename = `服務金額試算_${startDate}_${endDate}.xlsx`;
  const encodedFilename = encodeURIComponent(filename);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
    },
  });
}
