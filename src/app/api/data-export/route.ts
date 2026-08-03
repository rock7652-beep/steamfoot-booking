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
import {
  DATA_EXPORT_TYPE_LABELS,
  DATA_EXPORT_HEADERS,
  dataExportTypes,
  formatBookingStatus,
  formatBookingType,
  formatPaymentMethod,
  formatTransactionStatus,
  formatTransactionType,
  formatWalletStatus,
  isDataExportStatus,
  type DataExportType,
} from "@/lib/data-export-labels";

const MAX_EXPORT_ROWS = 10_000;
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
  const type = sp.get("type") as DataExportType;
  const startDate = sp.get("startDate");
  const endDate = sp.get("endDate");
  const status = sp.get("status") || undefined;
  if (!dataExportTypes.includes(type) || !validDate(startDate) || !validDate(endDate) || startDate > endDate || (status && !isDataExportStatus(type, status))) {
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
    if (count <= MAX_EXPORT_ROWS) addRows(workbook.addWorksheet(DATA_EXPORT_TYPE_LABELS[type]), [...DATA_EXPORT_HEADERS.customers], rows.map((r) => [r.name, r.phone, r.email, r.store.name, r.assignedStaff?.displayName ?? "未指派", r.firstVisitAt ? formatTWTime(r.firstVisitAt, { dateOnly: true }) : "", r.lastVisitAt ? formatTWTime(r.lastVisitAt, { dateOnly: true }) : "", formatTWTime(r.createdAt)]));
  } else if (type === "transactions") {
    const rows = await prisma.transaction.findMany({
      where: { ...storeFilter, transactionDate: period, ...(status ? { status: status as never } : {}) },
      select: { transactionNo: true, transactionDate: true, transactionType: true, status: true, paymentMethod: true, netAmount: true, customer: { select: { name: true, phone: true } }, store: { select: { name: true } }, paymentSplits: { select: { paymentMethod: true, amount: true } } },
      orderBy: { transactionDate: "desc" }, take: MAX_EXPORT_ROWS + 1,
    });
    count = rows.length;
    if (count <= MAX_EXPORT_ROWS) addRows(workbook.addWorksheet(DATA_EXPORT_TYPE_LABELS[type]), [...DATA_EXPORT_HEADERS.transactions], rows.map((r) => {
      const payments = r.paymentSplits.length ? r.paymentSplits : [{ paymentMethod: r.paymentMethod, amount: r.netAmount }];
      const paymentAmount = (method: string) => Number(payments.find((payment) => payment.paymentMethod === method)?.amount ?? 0);
      return [formatTWTime(r.transactionDate, { dateOnly: true }), r.customer.name, r.store.name, formatTransactionType(r.transactionType), payments.length > 1 ? "混合付款" : formatPaymentMethod(r.paymentMethod), paymentAmount("CASH"), paymentAmount("TRANSFER"), paymentAmount("LINE_PAY"), paymentAmount("CREDIT_CARD"), paymentAmount("OTHER"), paymentAmount("UNPAID"), Number(r.netAmount), formatTransactionStatus(r.status)];
    }));
  } else if (type === "bookings") {
    const rows = await prisma.booking.findMany({
      where: { ...storeFilter, bookingDate: { gte: new Date(`${startDate}T00:00:00.000Z`), lte: new Date(`${endDate}T00:00:00.000Z`) }, ...(status ? { bookingStatus: status as never } : {}) },
      select: { bookingDate: true, slotTime: true, bookingType: true, bookingStatus: true, people: true, customer: { select: { name: true, phone: true } }, store: { select: { name: true } }, serviceStaff: { select: { displayName: true } } },
      orderBy: [{ bookingDate: "desc" }, { slotTime: "desc" }], take: MAX_EXPORT_ROWS + 1,
    });
    count = rows.length;
    if (count <= MAX_EXPORT_ROWS) addRows(workbook.addWorksheet(DATA_EXPORT_TYPE_LABELS[type]), [...DATA_EXPORT_HEADERS.bookings], rows.map((r) => [r.bookingDate.toISOString().slice(0, 10), r.slotTime, r.customer.name, r.store.name, formatBookingType(r.bookingType), formatBookingStatus(r.bookingStatus), r.people, r.serviceStaff?.displayName ?? "未指派"]));
  } else {
    const rows = await prisma.customerPlanWallet.findMany({
      where: { ...storeFilter, createdAt: period, ...(status ? { status: status as never } : {}) },
      select: { purchasedPrice: true, totalSessions: true, remainingSessions: true, status: true, startDate: true, expiryDate: true, customer: { select: { name: true, phone: true } }, plan: { select: { name: true } }, store: { select: { name: true } } },
      orderBy: { createdAt: "desc" }, take: MAX_EXPORT_ROWS + 1,
    });
    count = rows.length;
    if (count <= MAX_EXPORT_ROWS) addRows(workbook.addWorksheet(DATA_EXPORT_TYPE_LABELS[type]), [...DATA_EXPORT_HEADERS.wallets], rows.map((r) => [r.customer.name, r.store.name, r.plan.name, Number(r.purchasedPrice), r.totalSessions, r.remainingSessions, formatWalletStatus(r.status), r.startDate.toISOString().slice(0, 10), r.expiryDate?.toISOString().slice(0, 10) ?? "無期限"]));
  }

  if (count > MAX_EXPORT_ROWS) return new NextResponse(`單次最多匯出 ${MAX_EXPORT_ROWS.toLocaleString()} 筆，請縮小篩選範圍`, { status: 413 });
  await prisma.auditLog.create({ data: { actorUserId: user.id, targetType: "DataExport", targetId: `${type}:${Date.now()}`, action: "EXPORT", afterJson: { type, storeId: requestedStoreId, startDate, endDate, status: status ?? null, rowCount: count, timezone: "Asia/Taipei", exportedAtTaipei: formatTWTime(new Date()) } } });
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = encodeURIComponent(`${DATA_EXPORT_TYPE_LABELS[type]}_${startDate}_${endDate}.xlsx`);
  return new NextResponse(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${filename}` } });
}
