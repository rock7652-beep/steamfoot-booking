"use server";
import { AppError, handleActionError } from "@/lib/errors";
import { courseMember } from "@/server/services/course-access";
import { readCoursePhoneLearners } from "@/server/services/course-phone-view";
import { getCourseCards } from "@/server/queries/course-members";
import { coursePrisma } from "@/lib/course-db";
import { readCoursePhonePlanGrids } from "@/server/queries/course-phone-plan-grids";
import { courseDisplayName } from "@/lib/course-template-presentation";
import { courseSessionAdjustmentRecords } from "@/server/services/course-session-adjustment-records";
import { activeSessionAdjustments } from "@/lib/plan-session-adjustment";
import { parseTaipeiDateTime } from "@/lib/date-utils";

export async function loadCoursePhoneSummary() {
  try {
    const actor = await courseMember();
    const group = await readCoursePhoneLearners();
    if (group.status !== "phone_group") return { success: true as const, learners: [] };
    const now = new Date();
    const learners = await Promise.all(group.learners.map(async learner => {
      const select = { id: true, status: true, absenceKind: true, session: { select: { nameSnapshot: true, startsAt: true, cancelledAt: true } } } as const;
      const [cards, upcoming, history] = await Promise.all([
        getCourseCards(actor.storeId, learner.id, { where: {}, entries: false }),
        coursePrisma.courseBooking.findMany({ where: { storeId: actor.storeId, customerId: learner.id, status: "RESERVED", session: { startsAt: { gte: now }, cancelledAt: null } }, select, orderBy: [{ session: { startsAt: "asc" } }, { id: "asc" }], take: 20 }),
        coursePrisma.courseBooking.findMany({ where: { storeId: actor.storeId, customerId: learner.id, session: { startsAt: { lt: now } } }, select, orderBy: [{ session: { startsAt: "desc" } }, { id: "asc" }], take: 20 }),
      ]);
      const cardIds = cards.map(card => card.id);
      const adjustments = await courseSessionAdjustmentRecords(coursePrisma, actor.storeId, cardIds);
      const grids = await readCoursePhonePlanGrids(actor.storeId, learner.id, cardIds, adjustments);
      const lessons = (rows: typeof upcoming) => rows.map(row => ({ id: row.id, name: courseDisplayName(row.session.nameSnapshot), startsAt: row.session.startsAt.toISOString(),
        dateOnly: false, quantity: 1, unitLabel: "堂",
        status: row.session.cancelledAt ? "已停課" : row.absenceKind === "STUDENT_LEAVE" || row.absenceKind === "GROUP_LEAVE_FORFEITED" ? "請假" : row.absenceKind === "TEACHER_ABSENT" ? "教師未授課" : ({ RESERVED: "待上課", ATTENDED: "已出席", NO_SHOW: "未到", CANCELLED: "已取消" }[row.status] ?? "待確認") }));
      const backfills = activeSessionAdjustments(adjustments).flatMap(record => {
        const card = cards.find(card => card.id === record.cardId);
        const date = record.occurredOn && parseTaipeiDateTime(record.occurredOn, "00:00");
        if (!card || record.customerId !== learner.id || record.operation !== "BACKFILL" || !date) return [];
        return [{ id: record.id, name: card.name, startsAt: date.toISOString(), dateOnly: true, quantity: record.quantity, unitLabel: card.unit === "SESSION" ? "堂" : "點", status: "已出席（補登）" }];
      });
      const combinedHistory = [...lessons(history), ...backfills].sort((a, b) => b.startsAt.localeCompare(a.startsAt) || a.id.localeCompare(b.id)).slice(0, 20);
      return { ...learner, cards: cards.map(card => ({ id: card.id, name: card.name, unit: card.unit, remaining: card.remaining, available: card.available, held: card.held, shared: card.members.length > 1, closed: card.closed, expired: card.expired, grid: grids.get(card.id) ?? null })), upcoming: lessons(upcoming), history: combinedHistory };
    }));
    // Reads span core/course DBs. Do not return collected data if the staff
    // revokes authority or changes group membership while these reads run.
    const current = await readCoursePhoneLearners();
    if (current.status !== "phone_group" || JSON.stringify(current.learners) !== JSON.stringify(group.learners)) throw new AppError("CONFLICT", "電話綁定或學員資料已更新，請重新讀取");
    return { success: true as const, learners };
  } catch (error) {
    const result = handleActionError(error);
    return { success: false as const, error: result.success ? "目前無法讀取學員課程" : result.error };
  }
}
