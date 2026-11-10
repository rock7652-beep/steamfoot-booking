import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { courseSessionAdjustmentRecords } from "@/server/services/course-session-adjustment-records";
import { activeSessionAdjustments } from "@/lib/plan-session-adjustment";
import { dayRange } from "@/lib/date-utils";

/** Display only. Caller derives the learner/card IDs from a verified member
 * session or phone grant (rechecked after reading). Never infer attendance from a
 * reservation or reconstruct a purchased quantity from the current balance. */
export async function readCoursePhonePlanGrids(storeId: string, customerId: string, cardIds: string[]) {
  if (!cardIds.length) return new Map<string, { total: number; dates: string[] }>();
  const [cards, adjustments] = await Promise.all([
    coursePrisma.coursePointCard.findMany({
      where: { storeId, id: { in: cardIds }, unit: "SESSION", musicOpeningStateRequired: false, members: { some: { storeId, customerId } } },
      select: { id: true, entries: { where: { kind: "GRANT" }, select: { points: true } }, bookings: {
        where: { storeId, customerId, status: "ATTENDED", absenceKind: null, session: { cancelledAt: null } },
        select: { id: true, pointCost: true, session: { select: { startsAt: true } } },
        orderBy: [{ session: { startsAt: "asc" } }, { id: "asc" }], take: 501,
      } },
    }),
    courseSessionAdjustmentRecords(coursePrisma, storeId, cardIds),
  ]);
  const manual = activeSessionAdjustments(adjustments).filter(row => row.customerId === customerId && row.operation === "BACKFILL" && row.occurredOn);
  const result = new Map<string, { total: number; dates: string[] }>();
  for (const card of cards) {
    const total = card.entries.reduce((sum, entry) => sum + entry.points, 0);
    if (!Number.isSafeInteger(total) || total < 1 || total > 500 || card.bookings.length > 500) continue;
    const uses = [
      ...card.bookings.map(row => ({ date: row.session.startsAt.toISOString(), quantity: row.pointCost })),
      ...manual.filter(row => row.cardId === card.id).map(row => ({ date: dayRange(row.occurredOn!).start.toISOString(), quantity: row.quantity })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    // Inconsistent historical quantities need a staff check, never extra cells
    // or a silent truncation that changes the purchased plan.
    if (uses.some(row => !Number.isSafeInteger(row.quantity) || row.quantity < 1) || uses.reduce((sum, row) => sum + row.quantity, 0) > total) continue;
    result.set(card.id, { total, dates: uses.flatMap(row => Array.from({ length: row.quantity }, () => row.date)) });
  }
  return result;
}
