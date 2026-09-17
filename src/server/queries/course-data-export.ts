import "server-only";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { formatTWTime } from "@/lib/date-utils";
import { courseExportStatusLabel, COURSE_EXPORT_LABELS } from "@/lib/course-data-export";
import type { DataExportType } from "@/lib/data-export-labels";

type Sheet = { name: string; headers: string[]; rows: unknown[][] };
/** Authorization and feature gates belong to the caller; every query is store scoped. */
export async function getCourseDataExport(storeId: string, type: DataExportType, period: { gte: Date; lte: Date }, status: string | undefined, limit: number, options: { now?: Date; revenueStaffId?: string } = {}): Promise<Sheet[]> {
  const take = limit + 1;
  const now = options.now ?? new Date();
  const attribution = options.revenueStaffId ? { revenueStaffId: options.revenueStaffId } : {};
  const stamp = (date: Date | null) => date ? formatTWTime(date) : "";
  const unit = (value: string) => value === "SESSION" ? "堂" : "點";
  const namesFor = async (ids: string[]) => new Map((await prisma.customer.findMany({ where: { storeId, id: { in: [...new Set(ids)] } }, select: { id: true, name: true } })).map(row => [row.id, row.name]));
  if (type === "customers") {
    const rows = await prisma.customer.findMany({ where: { storeId, mergedIntoCustomerId: null, createdAt: period, ...(status ? { customerStage: status as never } : {}) }, select: { id: true, name: true, phone: true, email: true, createdAt: true, assignedStaff: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take });
    const ids = rows.map(row => row.id);
    const visits = ids.length ? await coursePrisma.$queryRaw<Array<{ customerId: string; first: Date; last: Date }>>`
      SELECT b."customerId",min(s."startsAt") AS first,max(s."startsAt") AS last
      FROM "CourseBooking" b JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId"
      WHERE b."storeId"=${storeId} AND b."customerId"=ANY(${ids}::text[]) AND b.status='ATTENDED'
      GROUP BY b."customerId"` : [];
    const byCustomer = new Map(visits.map(row => [row.customerId, row]));
    return [{ name: COURSE_EXPORT_LABELS[type], headers: ["姓名", "電話", "Email", "直屬店長", "首次出席", "最近出席", "建立時間"], rows: rows.map(row => [row.name, row.phone, row.email, row.assignedStaff?.displayName ?? "未指派", stamp(byCustomer.get(row.id)?.first ?? null), stamp(byCustomer.get(row.id)?.last ?? null), stamp(row.createdAt)]) }];
  }
  if (type === "transactions") {
    const [orders, refunds] = await Promise.all([
      coursePrisma.coursePurchase.findMany({ where: { storeId, createdAt: period, ...attribution, ...(status ? { status } : {}) }, include: { refunds: true }, orderBy: { createdAt: "desc" }, take }),
      coursePrisma.coursePurchaseRefund.findMany({ where: { storeId, createdAt: period, purchase: { ...attribution, ...(status ? { status } : {}) } }, include: { purchase: true }, orderBy: { createdAt: "desc" }, take }),
    ]);
    const names = await namesFor([...orders.map(row => row.customerId), ...refunds.map(row => row.purchase.customerId)]);
    return [
      { name: "購買登錄", headers: ["購買編號", "登錄時間", "顧客", "方案", "購買金額", "狀態", "核帳時間", "累計登錄退款", "說明"], rows: orders.map(row => [row.id, stamp(row.createdAt), names.get(row.customerId) ?? "顧客待核對", row.name, row.price, courseExportStatusLabel(type, row.status), stamp(row.confirmedAt), row.refunds.reduce((sum, refund) => sum + refund.amount, 0), "依購買登錄期間；累計退款含其他日期，不作期間營收加總"]) },
      { name: "退款發生", headers: ["退款編號", "購買編號", "登錄時間", "顧客", "方案", "退款金額", "方式", "原因", "實際金流"], rows: refunds.map(row => [row.id, row.purchaseId, stamp(row.createdAt), names.get(row.purchase.customerId) ?? "顧客待核對", row.purchase.name, row.amount, ({ CASH: "現金", BANK_TRANSFER: "匯款", CARD: "退刷", OTHER: "其他" } as Record<string, string>)[row.method] ?? "需核對", row.reason, "僅登錄；未自動匯款或退刷"]) },
    ];
  }
  if (type === "bookings") {
    const rows = await coursePrisma.courseBooking.findMany({ where: { storeId, session: { startsAt: period }, ...(status ? { status } : {}) }, include: { session: true, card: true }, orderBy: [{ session: { startsAt: "desc" } }, { createdAt: "desc" }], take });
    return [{ name: COURSE_EXPORT_LABELS[type], headers: ["上課時間", "課程", "實際上課者（預約時姓名）", "操作人（預約時姓名）", "本人／代約", "使用方案", "方案到期", "額度", "單位", "預約狀態", "報到時間", "課次狀態"], rows: rows.map(row => [stamp(row.session.startsAt), row.session.nameSnapshot, row.customerName, row.operatorName, row.operatorCustomerId === row.customerId ? "本人預約" : "代約", row.card.nameSnapshot, stamp(row.card.expiresAt), row.pointCost, unit(row.card.unit), courseExportStatusLabel(type, row.status), stamp(row.checkedInAt), row.session.cancelledAt ? "已取消課程" : "已排課"]) }];
  }
  const cards = await coursePrisma.coursePointCard.findMany({ where: { storeId, createdAt: period, ...(status === "CLOSED" ? { closedAt: { not: null } } : status === "EXPIRED" ? { closedAt: null, expiresAt: { lte: now } } : status === "ACTIVE" ? { closedAt: null, expiresAt: { gt: now } } : {}) }, include: { members: true, bookings: { where: { storeId, status: "RESERVED" }, select: { pointCost: true } } }, orderBy: { createdAt: "desc" }, take });
  const names = await namesFor(cards.flatMap(card => card.members.map(member => member.customerId)));
  return [{ name: COURSE_EXPORT_LABELS[type], headers: ["卡片編號", "方案", "共卡授權成員", "剩餘", "已預約占用", "可用", "單位", "到期日", "狀態", "發卡時間", "說明"], rows: cards.map(card => {
    const held = card.bookings.reduce((sum, booking) => sum + booking.pointCost, 0);
    const state = card.closedAt ? "CLOSED" : card.expiresAt <= now ? "EXPIRED" : "ACTIVE";
    return [card.id, card.nameSnapshot, card.members.map(member => names.get(member.customerId) ?? "顧客待核對").join("、"), card.remaining, held, state === "ACTIVE" ? Math.max(0, card.remaining - held) : 0, unit(card.unit), stamp(card.expiresAt), courseExportStatusLabel("wallets", state), stamp(card.createdAt), "每張卡只列一次，共卡不可按人重複加總；占用不是正式使用"];
  }) }];
}
