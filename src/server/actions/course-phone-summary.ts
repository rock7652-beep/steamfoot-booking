"use server";
import { AppError, handleActionError } from "@/lib/errors";
import { courseMember } from "@/server/services/course-access";
import { readCoursePhoneLearners } from "@/server/services/course-phone-view";
import { getCourseCards } from "@/server/queries/course-members";
import { coursePrisma } from "@/lib/course-db";
import { readCoursePhonePlanGrids } from "@/server/queries/course-phone-plan-grids";
import { courseDisplayName } from "@/lib/course-template-presentation";

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
      const grids = await readCoursePhonePlanGrids(actor.storeId, learner.id, cards.map(card => card.id));
      const lessons = (rows: typeof upcoming) => rows.map(row => ({ id: row.id, name: courseDisplayName(row.session.nameSnapshot), startsAt: row.session.startsAt.toISOString(),
        status: row.session.cancelledAt ? "已停課" : row.absenceKind === "STUDENT_LEAVE" || row.absenceKind === "GROUP_LEAVE_FORFEITED" ? "請假" : row.absenceKind === "TEACHER_ABSENT" ? "教師未授課" : ({ RESERVED: "待上課", ATTENDED: "已出席", NO_SHOW: "未到", CANCELLED: "已取消" }[row.status] ?? "待確認") }));
      return { ...learner, cards: cards.map(card => ({ id: card.id, name: card.name, unit: card.unit, remaining: card.remaining, available: card.available, held: card.held, shared: card.members.length > 1, closed: card.closed, expired: card.expired, grid: grids.get(card.id) ?? null })), upcoming: lessons(upcoming), history: lessons(history) };
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
