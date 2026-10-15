import { musicItemTemplateIds } from "@/server/services/music-item-compatibility";
import { musicSessionWhere } from "@/server/services/music-data-scope";
import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { getCourseCards } from "./course-members";
import { toLocalDateStr } from "@/lib/date-utils";

/** Read projection only. Reservations still use createCourseBooking's live checks. */
export async function getMusicLeaveWorkspace(storeId: string, customers: { id: string; name: string }[],dataScope?:string) {
  const leaves = await coursePrisma.courseBooking.findMany({
    where: { storeId, session:musicSessionWhere(storeId,dataScope), customerId: { in: customers.map(c => c.id) }, status: "CANCELLED", absenceKind: "STUDENT_LEAVE", bookingKind: "CARD", musicOpeningMakeupEntitlementId: null },
    include: { card: { select: { id: true, requestKey: true } }, session: { select: { id: true, startsAt: true, templateId: true, nameSnapshot: true, template: { select: { classType: true } } } } },
    orderBy: [{ session: { startsAt: "desc" } }, { id: "asc" }], take: 1001,
  });
  const shown = leaves.slice(0, 1000).filter(row => row.card && row.customerId);
  const coupons = shown.length ? await coursePrisma.coursePointCard.findMany({ where: { storeId, requestKey: { in: shown.flatMap(row => [`yjy-pilot-makeup:${row.id}`, `music-leave-makeup:${row.id}`]) } }, select: { id: true, requestKey: true } }) : [];
  const itemTemplates = new Map(await Promise.all([...new Set(shown.map(row=>row.session.templateId))].map(async id=>[id,await musicItemTemplateIds(coursePrisma,storeId,id)] as const)));
  const cardIds = [...new Set([...shown.map(row => row.card!.id), ...coupons.map(c => c.id)])];
  const [cards, children, sessions] = await Promise.all([
    cardIds.length ? getCourseCards(storeId, undefined, { where: { id: { in: cardIds } }, skip: 0, take: cardIds.length, entries: false }) : [],
    shown.length ? coursePrisma.courseBooking.findMany({ where: { storeId, customerId: { in: customers.map(c => c.id) }, OR: [{ makeupForBookingId: { in: shown.map(row => row.id) } }, { cardId: { in: coupons.map(c => c.id) } }], AND: [{ OR: [{ status: { not: "CANCELLED" } }, { absenceKind: "STUDENT_LEAVE" }] }] }, select: { id: true, cardId: true, makeupForBookingId: true, status: true, absenceKind: true, session: { select: { id: true, startsAt: true, nameSnapshot: true } } } }) : [],
    shown.length ? coursePrisma.courseSession.findMany({ where: { ...musicSessionWhere(storeId,dataScope), storeId, templateId: { in: [...new Set([...itemTemplates.values()].flat())] }, cancelledAt: null, releasedAt: null, startsAt: { gt: new Date() }, isTrial: false, teacherMakeupForSessionId: null, teacherAttendance: { notIn: ["LEAVE", "NO_SHOW"] } }, orderBy: { startsAt: "asc" }, take: 501, select: { id: true, templateId: true, startsAt: true, nameSnapshot: true } }) : [],
  ]);
  return { truncated: leaves.length > 1000, sessionsTruncated: sessions.length > 500, rows: shown.map(row => {
    const coupon = coupons.find(c => c.requestKey === `yjy-pilot-makeup:${row.id}` || c.requestKey === `music-leave-makeup:${row.id}`);
    const separate = row.card!.requestKey.startsWith("yjy-pilot-card:") || !!coupon;
    const card = cards.find(c => c.id === (separate ? coupon?.id : row.cardId));
    const linked = children.filter(c => separate ? !!coupon && c.cardId === coupon.id && c.status !== "CANCELLED" : c.makeupForBookingId === row.id);
    const child = linked[0];
    const issue = linked.length > 1 ? "有多筆補課關聯，請先核對" : !card ? "補課方案尚未完成核對" : card.openingIssue || (card.closed ? "方案已停用" : card.expired ? "已超過補課期限" : !child && card.available <= 0 ? "目前沒有可預約堂數" : null);
    const state = child?.status === "ATTENDED" ? "已補課" : child?.status === "RESERVED" ? "已安排" : child?.absenceKind === "STUDENT_LEAVE" ? "補課再次請假" : child?.status === "NO_SHOW" ? "補課曠課" : issue ? "需處理" : "待安排";
    // A pilot coupon cannot itself issue another pilot coupon; show that rule explicitly.
    const supported = separate || (!row.card!.requestKey.startsWith("yjy-pilot-makeup:") && !row.card!.requestKey.startsWith("music-leave-makeup:") && row.session.template.classType !== "GROUP");
    return {
      id: row.id, customerId: row.customerId!, customerName: customers.find(c => c.id === row.customerId)?.name ?? "學員",
      date: row.session.startsAt.toISOString(), sourceSessionId: row.session.id, name: row.session.nameSnapshot,
      cardId: card?.id ?? null, separate, state, issue: supported ? issue : "請從原課堂核對補課資格",
      expiry: card?.expiresAt ?? null,
      booking: child ? { id: child.session.id, date: child.session.startsAt.toISOString(), name: child.session.nameSnapshot } : null,
      sessions: !child && !issue && supported ? sessions.slice(0, 500).filter(s => itemTemplates.get(row.session.templateId)?.includes(s.templateId) && s.startsAt > row.session.startsAt && (!card?.expiresAt || s.startsAt <= new Date(card.expiresAt))).map(s => ({ id: s.id, date: s.startsAt.toISOString(), name: s.nameSnapshot })) : [],
      sourceDate: toLocalDateStr(row.session.startsAt),
    };
  }) };
}
export type MusicLeaveWorkspace = Awaited<ReturnType<typeof getMusicLeaveWorkspace>>;
