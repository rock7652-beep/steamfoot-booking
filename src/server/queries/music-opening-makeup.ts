import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { AppError } from "@/lib/errors";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { musicOpeningMakeupRecordSchema, classifyMusicOpeningMakeupRecord, type MusicOpeningMakeupReceipt, parseMusicOpeningMakeupSnapshot, musicOpeningMakeupSourceKey, musicOpeningMakeupSourceSlotKey, musicOpeningMakeupContentHash, summarizeMusicOpeningMakeupRights } from "@/lib/music-opening-makeup";
import { summarizeNativeMakeupSources } from "@/lib/music-opening-native-summary";

/** Source IDs never leave this server-only projection. No card balance is added. */
export async function getOpeningMakeupWorkspace(storeId: string, customerId?: string) {
  return coursePrisma.$transaction(async tx => {
    const rights = await tx.courseMusicOpeningMakeupEntitlement.findMany({
      where: { storeId, ...(customerId ? { customerId } : {}) }, orderBy: [{ customerId: "asc" }, { createdAt: "asc" }], take: 201,
      include: { bookings: { orderBy: { createdAt: "asc" }, select: { id: true, storeId: true, customerId: true, bookingKind: true, cardId: true, pointCost: true, makeupForBookingId: true, musicOpeningMakeupEntitlementId: true, status: true, checkedInAt: true, sessionId: true, session: { select: { storeId: true, templateId: true, startsAt: true, nameSnapshot: true } } } } },
    });
    if (rights.length > 200) throw new AppError("VALIDATION", "資料較多，請先選擇學員再讀取期初補課");
    const snapshots = rights.map(row => {
      const snapshot = parseMusicOpeningMakeupSnapshot(row.snapshot);
      if (row.sourceKey !== musicOpeningMakeupSourceKey(snapshot) || row.sourceSlotKey !== musicOpeningMakeupSourceSlotKey(snapshot) || row.contentHash !== musicOpeningMakeupContentHash(snapshot) || row.storeId !== snapshot.scope.targetStoreId || row.customerId !== snapshot.mapping.customerId || row.templateId !== snapshot.mapping.templateId) throw new AppError("VALIDATION", "期初補課來源核對不一致，數量暫不顯示");
      for (const booking of row.bookings) {
        if (booking.storeId !== row.storeId || booking.customerId !== row.customerId || booking.bookingKind !== "OPENING_MAKEUP" || booking.cardId !== null || booking.pointCost !== 0 || booking.makeupForBookingId !== null || booking.musicOpeningMakeupEntitlementId !== row.id || booking.session.storeId !== row.storeId || booking.session.templateId !== row.templateId) throw new AppError("VALIDATION", "補課預約與權益關聯不一致，數量暫不顯示");
      }
      return snapshot;
    });
    const groups = new Map<string, { customerId: string; templateId: string; cutoff: string }>();
    rights.forEach((right, i) => {
      const key = JSON.stringify([right.customerId, right.templateId]), cutoff = snapshots[i].scope.cutoffBusinessDate;
      const old = groups.get(key);
      if (old && old.cutoff !== cutoff) throw new AppError("VALIDATION", "同學員課程有不同切點，請先核對");
      groups.set(key, { customerId: right.customerId, templateId: right.templateId, cutoff });
    });
    const rememberedOpening = new Set<string>();
    const mappedNative = new Map<string, Array<{ id: string; cardId: string; date: string }>>();
    const receiptRows = await tx.$queryRaw<Array<{ afterJson: { receipt: MusicOpeningMakeupReceipt } }>>`SELECT "afterJson" FROM "AuditLog" WHERE "storeId"=${storeId} AND "targetType"='MusicOpeningMakeupManifest' AND action='OPENING_MAKEUP_DISPOSITION'`;
    for (const { afterJson } of receiptRows) {
      const receipt = afterJson.receipt, snapshot = musicOpeningMakeupRecordSchema.parse(receipt.snapshot);
      if (receipt.sourceKey !== musicOpeningMakeupSourceKey(snapshot) || receipt.sourceSlotKey !== musicOpeningMakeupSourceSlotKey(snapshot) || receipt.contentHash !== musicOpeningMakeupContentHash(snapshot) || receipt.kind !== classifyMusicOpeningMakeupRecord(snapshot) || snapshot.scope.targetStoreId !== storeId) throw new AppError("VALIDATION", "補課來源核對紀錄不完整，數量暫不顯示");
      if (customerId && snapshot.mapping.customerId !== customerId) continue;
      if (!["OPENING", "POST_CUTOFF"].includes(receipt.kind)) continue;
      if (receipt.kind === "OPENING") {
        const right = rights.find(row => row.sourceKey === receipt.sourceKey && row.sourceSlotKey === receipt.sourceSlotKey && row.contentHash === receipt.contentHash);
        if (!right) throw new AppError("VALIDATION", "已核對的期初權益缺少資料，數量暫不顯示");
        rememberedOpening.add(right.id);
      }
      const key = JSON.stringify([snapshot.mapping.customerId, snapshot.mapping.templateId]), cutoff = snapshot.scope.cutoffBusinessDate;
      const old = groups.get(key);
      if (old && old.cutoff !== cutoff) throw new AppError("VALIDATION", "同學員課程有不同切點，請先核對");
      groups.set(key, { customerId: snapshot.mapping.customerId, templateId: snapshot.mapping.templateId, cutoff });
      if (receipt.kind === "POST_CUTOFF") {
        const source = snapshot.nativeSourceBooking!;
        mappedNative.set(key, [...(mappedNative.get(key) ?? []), { id: source.id, cardId: source.cardId, date: snapshot.sourceDate.value }]);
      }
    }
    if (rights.some(right => !rememberedOpening.has(right.id))) throw new AppError("VALIDATION", "期初權益缺少完整來源核對紀錄，數量暫不顯示");
    const native = { issued: 0, redeemed: 0, reserved: 0, outstanding: 0, unreserved: 0 };
    for (const group of groups.values()) {
      const bookings = await tx.courseBooking.findMany({ where: {
        storeId, customerId: group.customerId, bookingKind: "CARD", musicOpeningMakeupEntitlementId: null,
        card: { unit: "SESSION" }, session: { templateId: group.templateId, startsAt: { gte: dayRange(group.cutoff).start }, template: { classType: { not: "GROUP" } } },
      }, select: { id: true, cardId: true, makeupForBookingId: true, status: true, absenceKind: true, session: { select: { startsAt: true } } }, take: 10001 });
      if (bookings.length > 10000) throw new AppError("VALIDATION", "原生補課歷史過多，請先核對");
      for (const source of mappedNative.get(JSON.stringify([group.customerId, group.templateId])) ?? []) {
        const original = bookings.find(booking => booking.id === source.id);
        if (!original || original.makeupForBookingId !== null || original.cardId !== source.cardId || toLocalDateStr(original.session.startsAt) !== source.date) throw new AppError("VALIDATION", "切點後來源原預約缺少資料或映射變更，數量暫不顯示");
      }
      const roots = bookings.filter(b => b.makeupForBookingId === null && b.status === "CANCELLED" && b.absenceKind === "STUDENT_LEAVE");
      const summary = summarizeNativeMakeupSources(bookings, roots.map(b => b.id));
      for (const key of ["issued", "redeemed", "reserved", "outstanding", "unreserved"] as const) native[key] += summary[key];
    }
    const redeemedIds = rights.filter(right => right.bookings.some(b => b.status === "ATTENDED")).map(right => right.id);
    if (redeemedIds.length) {
      const attendance = await tx.$queryRaw<Array<{ targetId: string; afterJson: { action: string; actualAttendance: boolean; result: { bookingId: string; status: string; version: number } } }>>`SELECT "targetId","afterJson" FROM "AuditLog" WHERE "storeId"=${storeId} AND action='OPENING_MAKEUP_OPERATION' AND "targetId"=ANY(${redeemedIds}::text[])`;
      for (const right of rights.filter(item => redeemedIds.includes(item.id))) {
        const booking = right.bookings.find(b => b.status === "ATTENDED")!;
        if (!attendance.some(a => a.targetId === right.id && a.afterJson.action === "ATTEND" && a.afterJson.actualAttendance === true && a.afterJson.result.bookingId === booking.id && a.afterJson.result.status === "ATTENDED" && a.afterJson.result.version === right.version)) throw new AppError("VALIDATION", "核銷缺少實際出席核對紀錄，數量暫不顯示");
      }
    }
    const opening = summarizeMusicOpeningMakeupRights(rights);
    const customerIds = [...new Set(rights.map(row => row.customerId))];
    const customers = customerIds.length ? await tx.$queryRaw<Array<{ id: string; name: string }>>`SELECT id,name FROM "Customer" WHERE "storeId"=${storeId} AND id=ANY(${customerIds}::text[])` : [];
    const names = new Map(customers.map(customer => [customer.id, customer.name]));
    const sessions = rights.length ? await tx.courseSession.findMany({ where: { storeId, templateId: { in: [...new Set(rights.map(row => row.templateId))] }, cancelledAt: null, releasedAt: null, startsAt: { gt: new Date() }, teacherAttendance: { notIn: ["LEAVE", "NO_SHOW"] }, teacherMakeupForSessionId: null, isTrial: false }, orderBy: { startsAt: "asc" }, take: 200, select: { id: true, templateId: true, nameSnapshot: true, startsAt: true } }) : [];
    return {
      opening, native, verifiedCustomerCount: new Set([...groups.values()].map(group => group.customerId)).size, totalOutstanding: opening.outstanding + native.outstanding,
      rows: rights.map((row, i) => {
        const snapshot = snapshots[i], live = row.bookings.find(b => b.status !== "CANCELLED");
        return {
          id: row.id, version: row.version, customerId: row.customerId, customerName: names.get(row.customerId) ?? "學員",
          label: `原第 ${snapshot.originalTermNumber} 期第 ${snapshot.originalLessonOrdinal} 堂`, sourceDate: snapshot.sourceDate.value,
          expiry: snapshot.expiry.value, type: snapshot.type, state: live?.status ?? "AVAILABLE",
          booking: live ? { id: live.id, status: live.status, checkedIn: !!live.checkedInAt, date: live.session.startsAt.toISOString(), sessionName: live.session.nameSnapshot } : null,
          sessions: sessions.filter(session => session.templateId === row.templateId && toLocalDateStr(session.startsAt) >= snapshot.scope.cutoffBusinessDate && toLocalDateStr(session.startsAt) > snapshot.sourceDate.value && (!snapshot.expiry.value || toLocalDateStr(session.startsAt) <= snapshot.expiry.value)).map(session => ({ id: session.id, label: session.nameSnapshot, date: session.startsAt.toISOString() })),
        };
      }),
    };
  }, { isolationLevel: "RepeatableRead", timeout: 15000 });
}
export type OpeningMakeupWorkspace = Awaited<ReturnType<typeof getOpeningMakeupWorkspace>>;
