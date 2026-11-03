import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { coursePrisma } from "@/lib/course-db";
import { AppError } from "@/lib/errors";
import { toLocalDateStr } from "@/lib/date-utils";
import { getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { courseMonthlyBookingWhere } from "@/lib/course-usage";
import { parseMusicOpeningMakeupSnapshot, musicOpeningMakeupSourceKey, musicOpeningMakeupSourceSlotKey, musicOpeningMakeupContentHash, classifyMusicOpeningMakeupRecord, assertMusicOpeningMakeupTarget } from "@/lib/music-opening-makeup";
import { lockCourseStore } from "./course-store-lock";
import type { CourseActor } from "./course-booking";
import type { Prisma } from "../../../generated/course-client";

const id = z.string().trim().min(1).max(200);
export const openingMakeupCommandSchema = z.object({
  entitlementId: id, expectedVersion: z.number().int().min(0), requestKey: id,
  action: z.enum(["RESERVE", "CHECK_IN", "ATTEND", "CANCEL", "TEACHER_ABSENT", "CORRECT_TO_RESERVED", "CORRECT_TO_CANCELLED"]),
  sessionId: id.nullable(), bookingId: id.nullable(),
  expectedStatus: z.enum(["RESERVED", "ATTENDED"]).nullable(),
  actualAttendance: z.boolean(), reason: z.string().trim().max(500),
}).strict();
export type OpeningMakeupCommand = z.infer<typeof openingMakeupCommandSchema>;
export type OpeningMakeupResult = { entitlementId: string; bookingId: string; status: string; version: number };
const fail = (message: string): never => { throw new AppError("VALIDATION", message); };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Dedicated transaction: deliberately does not use courseTransaction's notification kick. */
export async function changeOpeningMakeup(actor: CourseActor, raw: unknown) {
  const input = openingMakeupCommandSchema.parse(raw);
  const limits = await getStoreLimitsByStoreId(actor.storeId);
  return coursePrisma.$transaction(tx => changeOpeningMakeupInTransaction(tx, actor, input, limits.maxMonthlyBookings), { timeout: 15000 });
}

/** Store lock, entitlement lock, CAS, booking and durable receipt are one transaction. */
export async function changeOpeningMakeupInTransaction(tx: Prisma.TransactionClient, actor: CourseActor, raw: unknown, maxMonthlyBookings: number | null) {
  const input = openingMakeupCommandSchema.parse(raw);
  if (actor.customerId) return fail("期初補課由本店有權限人員安排");
  await lockCourseStore(tx, actor.storeId);
  const music = await tx.$queryRaw<Array<{ featureKey: string }>>`SELECT "featureKey" FROM "StoreFeatureEntitlement" WHERE "storeId"=${actor.storeId} AND "featureKey"='business.music' AND status::text='ENABLED' LIMIT 1`;
  if (!music.length) return fail("此功能僅適用於音樂教室");
  const operationId = `opening-makeup:${digest([actor.storeId, input.requestKey])}`;
  const requestHash = digest([actor.userId, input]);
  const previous = await tx.$queryRaw<Array<{ afterJson: { requestHash: string; result: OpeningMakeupResult } }>>`SELECT "afterJson" FROM "AuditLog" WHERE id=${operationId} AND "storeId"=${actor.storeId} AND action='OPENING_MAKEUP_OPERATION'`;
  if (previous.length) {
    if (previous.length !== 1 || previous[0].afterJson?.requestHash !== requestHash || !previous[0].afterJson.result) return fail("操作編號已用於不同內容，請重新整理");
    return previous[0].afterJson.result;
  }
  await tx.$queryRaw`SELECT id FROM "CourseMusicOpeningMakeupEntitlement" WHERE id=${input.entitlementId} AND "storeId"=${actor.storeId} FOR UPDATE`;
  const right = await tx.courseMusicOpeningMakeupEntitlement.findFirst({ where: { id: input.entitlementId, storeId: actor.storeId } });
  if (!right) return fail("找不到本店期初補課權益");
  let snapshot;
  try {
    snapshot = parseMusicOpeningMakeupSnapshot(right.snapshot);
    if (classifyMusicOpeningMakeupRecord(snapshot) !== "OPENING" || right.sourceKey !== musicOpeningMakeupSourceKey(snapshot) || right.sourceSlotKey !== musicOpeningMakeupSourceSlotKey(snapshot) || right.contentHash !== musicOpeningMakeupContentHash(snapshot) || right.storeId !== snapshot.scope.targetStoreId || right.customerId !== snapshot.mapping.customerId || right.templateId !== snapshot.mapping.templateId) return fail("期初補課來源核對不一致");
  } catch { return fail("期初補課來源仍有待核對資料，暫不能操作"); }
  if (right.version !== input.expectedVersion) return fail("資料已由另一個操作更新，請重新整理後確認");
  const live = await tx.courseBooking.findMany({ where: { storeId: actor.storeId, musicOpeningMakeupEntitlementId: right.id, status: { not: "CANCELLED" } } });
  if (live.length > 1) return fail("權益有重複預約，請先核對");
  let booking;
  const now = new Date();
  if (input.action === "RESERVE") {
    if (!input.sessionId || input.bookingId !== null || input.expectedStatus !== null || input.actualAttendance || live.length) return fail("此權益已保留或已核銷，請重新整理");
    const [session, customers, rule] = await Promise.all([
      tx.courseSession.findFirst({ where: { id: input.sessionId, storeId: actor.storeId, cancelledAt: null, releasedAt: null }, include: { template: { include: { musicSubject: true } } } }),
      tx.$queryRaw<Array<{ id: string; name: string }>>`SELECT id,name FROM "Customer" WHERE id=${right.customerId} AND "storeId"=${actor.storeId} AND "mergedIntoCustomerId" IS NULL`,
      tx.courseBookingRule.findUnique({ where: { storeId: actor.storeId } }),
    ]);
    if (!session || !customers.length || !session.template.isActive || session.template.visibility === "OFF" || session.template.musicSubject?.isActive === false || ["LEAVE", "NO_SHOW"].includes(session.teacherAttendance) || session.isTrial || session.teacherMakeupForSessionId) return fail("請選擇本店有效的原課程時段");
    try { assertMusicOpeningMakeupTarget(snapshot, { storeId: actor.storeId, customerId: right.customerId, templateId: session.templateId, businessDate: toLocalDateStr(session.startsAt) }); } catch { return fail("課程、日期或原有效期限不符，請先核對"); }
    if (session.template.classType !== snapshot.mapping.classType) return fail("課程類型已變更，請先核對來源");
    if (session.startsAt.getTime() <= now.getTime() + (rule?.bookingLeadMinutes ?? 0) * 60000) return fail("已超過預約截止時間");
    if (maxMonthlyBookings !== null && await tx.courseBooking.count({ where: courseMonthlyBookingWhere(actor.storeId) }) >= maxMonthlyBookings) throw new AppError("FORBIDDEN", "已達方案本月預約額度上限");
    const day = new Date(`${toLocalDateStr(session.startsAt)}T00:00:00Z`);
    const closed = await tx.$queryRaw<Array<{ closed: boolean }>>`SELECT COALESCE((SELECT type <> 'custom' FROM "SpecialBusinessDay" WHERE "storeId"=${actor.storeId} AND date=${day}::date), (SELECT NOT "isOpen" FROM "BusinessHours" WHERE "storeId"=${actor.storeId} AND "dayOfWeek"=EXTRACT(DOW FROM ${day}::date)::int), false) AS closed`;
    if (closed[0]?.closed) return fail("店家公休日無法新增預約");
    const [occupied, overlap] = await Promise.all([
      tx.courseBooking.count({ where: { storeId: actor.storeId, sessionId: session.id, status: { not: "CANCELLED" } } }),
      tx.courseBooking.findFirst({ where: { storeId: actor.storeId, customerId: right.customerId, status: { not: "CANCELLED" }, session: { cancelledAt: null, releasedAt: null, startsAt: { lt: session.endsAt }, endsAt: { gt: session.startsAt } } } }),
    ]);
    if (occupied >= session.capacity) return fail("本堂課已滿班");
    if (overlap) return fail("學員同時段已有課程");
    booking = await tx.courseBooking.create({ data: {
      storeId: actor.storeId, sessionId: session.id, customerId: right.customerId, customerName: customers[0].name,
      musicOpeningMakeupEntitlementId: right.id, bookingKind: "OPENING_MAKEUP", cardId: null, pointCost: 0,
      status: "RESERVED", requestKey: operationId, operatorUserId: actor.userId, operatorName: actor.name,
      notes: "期初補課權益；教師鐘點待核對",
    } });
  } else {
    if (input.sessionId !== null || !input.bookingId || !input.expectedStatus) return fail("請重新讀取補課預約");
    const current = await tx.courseBooking.findFirst({ where: { id: input.bookingId, storeId: actor.storeId, customerId: right.customerId, musicOpeningMakeupEntitlementId: right.id }, include: { session: { include: { template: { select: { classType: true } } } } } });
    if (!current || current.status !== input.expectedStatus || live[0]?.id !== current.id || current.bookingKind !== "OPENING_MAKEUP" || current.cardId !== null || current.pointCost !== 0) return fail("預約狀態已變更，請重新整理");
    try { assertMusicOpeningMakeupTarget(snapshot, { storeId: actor.storeId, customerId: right.customerId, templateId: current.session.templateId, businessDate: toLocalDateStr(current.session.startsAt) }); } catch { return fail("原課堂與權益映射不一致，請先核對"); }
    if (current.session.storeId !== actor.storeId || current.session.template.classType !== snapshot.mapping.classType) return fail("原課堂來源已變更，請先核對");
    const correction = input.action.startsWith("CORRECT_");
    if (correction ? current.status !== "ATTENDED" : current.status !== "RESERVED") return fail("目前狀態不接受這項操作");
    if (["CANCEL", "TEACHER_ABSENT", "CORRECT_TO_RESERVED", "CORRECT_TO_CANCELLED"].includes(input.action) && !input.reason) return fail("請填寫取消或更正原因");
    if (input.action === "ATTEND" ? !input.actualAttendance : input.actualAttendance) return fail("出席必須另行確認實際上課");
    if (["ATTEND", "CHECK_IN"].includes(input.action) && (current.session.cancelledAt || current.session.releasedAt || ["LEAVE", "NO_SHOW"].includes(current.session.teacherAttendance))) return fail("課堂目前無法點名，請先核對排課");
    if (input.action === "ATTEND" && current.session.startsAt > now) return fail("尚未到上課時間，不能確認實際出席");
    if (input.action === "CORRECT_TO_RESERVED" && (current.session.cancelledAt || current.session.releasedAt)) return fail("原課時段已取消或釋出，請改為取消後重新安排");
    const status = input.action === "ATTEND" ? "ATTENDED" : ["CANCEL", "TEACHER_ABSENT", "CORRECT_TO_CANCELLED"].includes(input.action) ? "CANCELLED" : "RESERVED";
    booking = await tx.courseBooking.update({ where: { id: current.id }, data: {
      status, checkedInAt: input.action === "CHECK_IN" ? now : null,
      absenceKind: input.action === "TEACHER_ABSENT" ? "TEACHER_ABSENT" : null,
    } });
  }
  const changed = await tx.courseMusicOpeningMakeupEntitlement.updateMany({ where: { id: right.id, storeId: actor.storeId, version: input.expectedVersion }, data: { version: { increment: 1 } } });
  if (changed.count !== 1) throw new AppError("CONFLICT", "權益已更新，操作未儲存");
  const result: OpeningMakeupResult = { entitlementId: right.id, bookingId: booking.id, status: booking.status, version: right.version + 1 };
  const receipt = JSON.stringify({ requestHash, result, action: input.action, reason: input.reason, actualAttendance: input.actualAttendance, fromVersion: right.version, teacherFeePolicy: "UNVERIFIED" });
  // Direct durable audit, deliberately no notification/audit-outbox enqueue.
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,"targetType","targetId",action,summary,"afterJson","createdAt") VALUES (${operationId},${actor.userId},${actor.name},${actor.storeId},'MUSIC','CourseMusicOpeningMakeupEntitlement',${right.id},'OPENING_MAKEUP_OPERATION','期初補課權益操作',${receipt}::jsonb,NOW())`;
  return result;
}
