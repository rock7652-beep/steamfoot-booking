import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { courseSessionAdjustmentRecords } from "@/server/services/course-session-adjustment-records";
import { activeSessionAdjustments, type SessionAdjustmentRecord } from "@/lib/plan-session-adjustment";
import { dayRange } from "@/lib/date-utils";

/** Display only. Caller derives the learner/card IDs from a verified member
 * session or phone grant (rechecked after reading). Never infer attendance from a
 * reservation or reconstruct a purchased quantity from the current balance. */
export async function readCoursePhonePlanGrids(storeId: string, customerId: string, cardIds: string[], adjustments?: SessionAdjustmentRecord[], authorizedLearnerIds?: string[]) {
  if (!cardIds.length) return new Map<string, { total: number; dates: string[]; voidedDates?: string[] }>();
  const allowed=new Set(authorizedLearnerIds??[customerId]);
  if(!allowed.has(customerId))return new Map<string, {total:number;dates:string[];voidedDates?:string[]}>();
  const [cards, records] = await Promise.all([
    coursePrisma.coursePointCard.findMany({
      where: { storeId, id: { in: cardIds }, unit: "SESSION", musicOpeningStateRequired: false, members: { some: { storeId, customerId:authorizedLearnerIds?{in:[...allowed]}:customerId } } },
      select: { id: true, members:{select:{customerId:true}}, entries: { where: { kind: "GRANT" }, select: { points: true } }, bookings: {
        where: { storeId, ...(authorizedLearnerIds?{}:{customerId}), status: "ATTENDED", absenceKind: null, session: { cancelledAt: null } },
        select: { id: true, customerId:true, pointCost: true, session: { select: { startsAt: true } } },
        orderBy: [{ session: { startsAt: "asc" } }, { id: "asc" }], take: 501,
      } },
    }),
    adjustments ?? courseSessionAdjustmentRecords(coursePrisma, storeId, cardIds),
  ]);
  const active=activeSessionAdjustments(records);
  const manual = active.filter(row => allowed.has(row.customerId) && row.operation === "BACKFILL" && row.occurredOn);
  const voids=active.filter(row=>allowed.has(row.customerId)&&row.operation==='VOID');
  const result = new Map<string, { total: number; dates: string[]; voidedDates?: string[] }>();
  for (const card of cards) {
    // Never present one learner's dates as the complete shared-plan grid. All
    // members and all dated usage must be within the verified viewer scope.
    if(card.members?.some(member=>!allowed.has(member.customerId))||
      (authorizedLearnerIds&&card.bookings.some(row=>!row.customerId||!allowed.has(row.customerId)))||
      active.some(row=>row.cardId===card.id&&(row.operation==='BACKFILL'||row.operation==='VOID')&&!allowed.has(row.customerId)))continue;
    const total = card.entries.reduce((sum, entry) => sum + entry.points, 0);
    if (!Number.isSafeInteger(total) || total < 1 || total > 500 || card.bookings.length > 500) continue;
    const uses = [
      ...card.bookings.map(row => ({ date: row.session.startsAt.toISOString(), quantity: row.pointCost })),
      ...manual.filter(row => row.cardId === card.id).map(row => ({ date: dayRange(row.occurredOn!).start.toISOString(), quantity: row.quantity })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const cardVoids=voids.filter(row=>row.cardId===card.id);
    // Inconsistent historical quantities need a staff check, never extra cells
    // or a silent truncation that changes the purchased plan.
    if (uses.some(row => !Number.isSafeInteger(row.quantity) || row.quantity < 1) || cardVoids.some(row=>!Number.isSafeInteger(row.quantity)||row.quantity<1||!Number.isFinite(Date.parse(row.recordedAt))) || uses.reduce((sum, row) => sum + row.quantity, 0)+cardVoids.reduce((sum,row)=>sum+row.quantity,0) > total) continue;
    const voidedDates=cardVoids.flatMap(row=>Array.from({length:row.quantity},()=>row.recordedAt));
    result.set(card.id, { total, dates: uses.flatMap(row => Array.from({ length: row.quantity }, () => row.date)),...(voidedDates.length?{voidedDates}:{}) });
  }
  return result;
}
