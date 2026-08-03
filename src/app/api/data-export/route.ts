import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { dayRange, formatTWTime } from "@/lib/date-utils";
import { requireDataExportFeature } from "@/lib/data-export-gate";
import { getStoreFilter } from "@/lib/manager-visibility";
import { resolveActiveStoreId } from "@/lib/store";

const MAX_EXPORT_ROWS = 10_000;
const types = ["customers", "transactions", "bookings", "wallets"] as const;
type ExportType = (typeof types)[number];

const labels: Record<ExportType, string> = {
  customers: "顧客資料",
  transactions: "營收與交易明細",
  bookings: "預約與服務紀錄",
  wallets: "方案與堂數明細",
};

function safeText(value: unknown): string {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
}

function addRows(sheet: ExcelJS.Worksheet, headers: string[], rows: unknown[][]) {
  const header = sheet.addRow(headers);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
  for (const row of rows) sheet.addRow(row.map((cell) => typeof cell === "string" ? safeText(cell) : cell));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns.forEach((column) => {
    let width = 10;
    column.eachCell?.({ includeEmpty: true }, (cell) => { width = Math.max(width, String(cell.value ?? "").length + 2); });
    column.width = Math.min(width, 36);
  });
}

function dateWhere(startDate: string, endDate: string) {
  const start = dayRange(startDate).start;
  const end = dayRange(endDate).end;
  return { gte: start, lte: end };
}

function validDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  const user = session.user;
  const permitted = await Promise.all([
    checkPermission(user.role, user.staffId, "customer.export"),
    checkPermission(user.role, user.staffId, "report.export"),
  ]);
  if (!permitted.some(Boolean)) return new NextResponse("Forbidden", { status: 403 });

  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") as ExportType;
  const startDate = sp.get("startDate");
  const endDate = sp.get("endDate");
  const status = sp.get("status") || undefined;
  if (!types.includes(type) || !validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    return new NextResponse("Invalid export filters", { status: 400 });
  }
  if ((type === "customers" && !permitted[0]) || (type !== "customers" && !permitted[1])) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const cookieStore = await cookies();
  const activeStoreId = await resolveActiveStoreId(user, cookieStore.get("active-store-id")?.value ?? null);
  const requestedStoreId = user.role === "ADMIN" ? sp.get("storeId") ?? activeStoreId : activeStoreId;
  const feature = await requireDataExportFeature(requestedStoreId);
  if (feature) return feature;
  const storeFilter = getStoreFilter(user, requestedStoreId);
  const workbook = new ExcelJS.Workbook();
  let count = 0;
  const period = dateWhere(startDate, endDate);

  if (type === "customers") {
    const rows = await prisma.customer.findMany({
      where: { ...storeFilter, createdAt: period, ...(status ? { customerStage: status as never } : {}) },
      select: { name: true, phone: true, email: true, customerStage: true, createdAt: true, firstVisitAt: true, lastVisitAt: true, store: { select: { name: true } }, assignedStaff: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" }, take: MAX_EXPORT_ROWS + 1,
    });
    count = rows.length;
    if (count <= MAX_EXPORT_ROWS) addRows(workbook.addWorksheet(labels[type]), ["分店", "姓名", "電話", "Email", "狀態", "直屬店長", "首次到訪", "最近消費", "建立時間"], rows.map((r) => [r.store.name, r.name, r.phone, r.email, r.customerStage, r.assignedStaff?.displayName ?? "未指派", r.firstVisitAt ? formatTWTime(r.firstVisitAt, { dateOnly: true }) : "", r.lastVisitAt ? formatTWTime(r.lastVisitAt, { dateOnly: true }) : "", formatTWTime(r.createdAt)]));
  } else if (type === "transactions") {
    const rows = await prisma.transaction.findMany({
      where: { ...storeFilter, transactionDate: period, ...(status ? { status: status as never } : {}) },
      select: { transactionNo: true, transactionDate: true, transactionType: true, status: true, paymentMethod: true, netAmount: true, customer: { select: { name: true, phone: true } }, store: { select: { name: true } }, paymentSplits: { select: { paymentMethod: true, amount: true } } },
      orderBy: { transactionDate: "desc" }, take: MAX_EXPORT_ROWS + 1,
    });
    count = rows.length;
    if (count <= MAX_EXPORT_ROWS) addRows(workbook.addWorksheet(labels[type]), ["交易日期", "交易單號", "分店", "顧客", "電話", "類型", "狀態", "付款方式明細", "實收金額"], rows.map((r) => [formatTWTime(r.transactionDate, { dateOnly: true }), r.transactionNo, r.store.name, r.customer.name, r.customer.phone, r.transactionType, r.status, r.paymentSplits.length ? r.paymentSplits.map((p) => `${p.paymentMethod} ${Number(p.amount)}`).join("；") : r.paymentMethod, Number(r.netAmount)]));
  } else if (type === "bookings") {
    const rows = await prisma.booking.findMany({
      where: { ...storeFilter, bookingDate: { gte: new Date(`${startDate}T00:00:00.000Z`), lte: new Date(`${endDate}T00:00:00.000Z`) }, ...(status ? { bookingStatus: status as never } : {}) },
      select: { bookingDate: true, slotTime: true, bookingType: true, bookingStatus: true, people: true, customer: { select: { name: true, phone: true } }, store: { select: { name: true } }, serviceStaff: { select: { displayName: true } } },
      orderBy: [{ bookingDate: "desc" }, { slotTime: "desc" }], take: MAX_EXPORT_ROWS + 1,
    });
    count = rows.length;
    if (count <= MAX_EXPORT_ROWS) addRows(workbook.addWorksheet(labels[type]), ["服務日期", "時段", "分店", "顧客", "電話", "服務類型", "狀態", "人數", "服務人員"], rows.map((r) => [r.bookingDate.toISOString().slice(0, 10), r.slotTime, r.store.name, r.customer.name, r.customer.phone, r.bookingType, r.bookingStatus, r.people, r.serviceStaff?.displayName ?? ""]));
  } else {
    const rows = await prisma.customerPlanWallet.findMany({
      where: { ...storeFilter, createdAt: period, ...(status ? { status: status as never } : {}) },
      select: { purchasedPrice: true, totalSessions: true, remainingSessions: true, status: true, startDate: true, expiryDate: true, customer: { select: { name: true, phone: true } }, plan: { select: { name: true } }, store: { select: { name: true } } },
      orderBy: { createdAt: "desc" }, take: MAX_EXPORT_ROWS + 1,
    });
    count = rows.length;
    if (count <= MAX_EXPORT_ROWS) addRows(workbook.addWorksheet(labels[type]), ["分店", "顧客", "電話", "方案", "購入金額", "總堂數", "剩餘堂數", "狀態", "開始日期", "到期日"], rows.map((r) => [r.store.name, r.customer.name, r.customer.phone, r.plan.name, Number(r.purchasedPrice), r.totalSessions, r.remainingSessions, r.status, r.startDate.toISOString().slice(0, 10), r.expiryDate?.toISOString().slice(0, 10) ?? "無期限"]));
  }

  if (count > MAX_EXPORT_ROWS) return new NextResponse(`單次最多匯出 ${MAX_EXPORT_ROWS.toLocaleString()} 筆，請縮小篩選範圍`, { status: 413 });
  await prisma.auditLog.create({ data: { actorUserId: user.id, targetType: "DataExport", targetId: `${type}:${Date.now()}`, action: "EXPORT", afterJson: { type, storeId: requestedStoreId, startDate, endDate, status: status ?? null, rowCount: count, timezone: "Asia/Taipei", exportedAtTaipei: formatTWTime(new Date()) } } });
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = encodeURIComponent(`${labels[type]}_${startDate}_${endDate}.xlsx`);
  return new NextResponse(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${filename}` } });
}
