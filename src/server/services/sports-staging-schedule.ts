import {courseCalendarRead} from './course-calendar-read-scope';
import {memoizeCourseReadRequest} from "./course-read-request-memo";
import {readSportsSessionRuleRow} from "./sports-session-rule-read";
import { sportsTeachingTemplateId } from "./sports-teaching-rule";
import "server-only";
import {assertSportsProductionReady,assertSportsBookingReadReady,sportsRulesAvailable} from "./sports-production-readiness";
import {
  requireSportsStaging,
  sportsStagingEnabled,
} from "@/lib/sports-staging";
import {
  sportsScheduleRule,
  type SportsScheduleRule,
} from "@/lib/sports-staging-types";
import { addTaiwanDuration, formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";
import { AppError } from "@/lib/errors";
import type { Prisma } from "../../../generated/course-client";
import type { CourseActor } from "./course-booking";
export async function readSportsSessionRule(
  tx: Pick<Prisma.TransactionClient, "$queryRaw" | "$queryRawUnsafe" | "$executeRawUnsafe">,
  storeId: string,
  sessionId: string,
) {
  return memoizeCourseReadRequest(tx,JSON.stringify(["sports-rule",storeId,sessionId]),async()=>{
    const calendar=courseCalendarRead(tx,storeId,sessionId);
    const available=()=>sportsRulesAvailable(tx,storeId);
    if (!(await (calendar?calendar.once('sports-rules-available',available):available()))) return null;
    const ready=()=>assertSportsBookingReadReady(tx,storeId);
    await (calendar?calendar.once('sports-rules-booking-read-ready',ready):ready());
    return readSportsSessionRuleRow(tx,storeId,sessionId);
  });
}
export async function attachSportsSessionRules(
  tx: Prisma.TransactionClient,
  actor: CourseActor,
  requestKey: string,
  input: SportsScheduleRule,
  sessionIds?:string[],
  trialLearnerCount=0,
) {
  (await requireSportsStaging(actor.storeId));
  await assertSportsProductionReady(tx, actor.storeId);
  const rule = sportsScheduleRule.parse(input);
  if(rule.waitlist?.limit){
    const {getCourseWaitlistSettings}=await import("./course-waitlist");
    if(rule.enrollment!=="OPEN"||!(await getCourseWaitlistSettings(actor.storeId,tx)).enabled)throw new AppError("VALIDATION","請先在後台設定啟用候補，或將候補人數設為0");
  }
  if(rule.perpetual&&rule.frequency==="SINGLE")throw new AppError("VALIDATION","單次課不建立固定系列");
  const sessions = await tx.courseSession.findMany({
    where: { storeId: actor.storeId, requestKey, ...(sessionIds?{id:{in:sessionIds}}:{}) },
    orderBy: { requestIndex: "asc" },
  });
  if (!sessions.length) throw new AppError("NOT_FOUND", "排課資料不存在");
  // A finite batch contains independent SINGLE lessons; trials stay one-off.
  if (sessions.some(s=>s.isTrial) && sessions.length !== 1)
    throw new AppError("VALIDATION", "體驗僅建立單次課程");
  if (
    rule.frequency !== "SINGLE" &&
    sessions.some(
      (s, i) =>
        toLocalDateStr(s.startsAt) !==
          addTaiwanDuration(
            toLocalDateStr(sessions[0].startsAt),
            i * (rule.frequency === "BIWEEKLY" ? 14 : 7),
            "DAY",
          ) ||
        s.startsAt.getUTCHours() !== sessions[0].startsAt.getUTCHours() ||
        s.startsAt.getUTCMinutes() !== sessions[0].startsAt.getUTCMinutes(),
    )
  )
    throw new AppError("VALIDATION", "固定頻率與課次日期不符");
  if (trialLearnerCount&&(!sessions.every(s=>s.isTrial)||rule.frequency!=="SINGLE"||trialLearnerCount>sessions[0].capacity))throw new AppError("VALIDATION","體驗學員只適用單次體驗排課且不可超過名額");
  if (!sessionIds && rule.enrollment === "ASSIGNED" && !rule.students.length && !trialLearnerCount)
    throw new AppError("VALIDATION", "請至少指定一位學員");
  if (rule.enrollment === "OPEN" && rule.students.length)
    throw new AppError("VALIDATION", "開放選課不會自動加入指定學員");
  if (
    new Set(rule.students.map((s) => s.customerId)).size !==
    rule.students.length
  )
    throw new AppError("VALIDATION", "學員不可重複");
  const plan = rule.planId
    ? await tx.coursePointPlan.findFirst({
        where: { id: rule.planId, storeId: actor.storeId, isActive: true },
      })
    : null;
  if (
    !sessions[0].isTrial &&
    rule.planId !== null && (!plan || !plan.templateIds.includes(sessions[0].templateId))
  )
    throw new AppError("VALIDATION", "請選擇適用本課程的收費方式");
  if(!sessions[0].isTrial && rule.planId===null){
    const t=await tx.courseTemplate.findFirst({where:{id:sessions[0].templateId,storeId:actor.storeId},select:{musicSubjectId:true,isActive:true}});
    if(!t?.isActive||!t.musicSubjectId||sportsTeachingTemplateId(actor.storeId,t.musicSubjectId)!==sessions[0].templateId)throw new AppError("VALIDATION","請選擇已設定規則的教學項目");
  }
  if (sessions[0].isTrial && rule.frequency !== "SINGLE")
    throw new AppError("VALIDATION", "體驗僅建立單次課程");
  const { captureSportsCoachCompensation } = await import("./sports-coach-compensation");
  for (const session of sessions) {
    await captureSportsCoachCompensation(tx, actor.storeId, session);
    await tx.$executeRaw`INSERT INTO "SportsStagingSessionRule" ("sessionId","storeId",frequency,enrollment,"planId","trialPrice",payload) VALUES (${session.id},${actor.storeId},${rule.frequency},${rule.enrollment},${rule.planId},${rule.trialPrice},${JSON.stringify(rule)}::jsonb)`;
  }
  if(rule.perpetual){
    const {addSportsFixedLearners,persistSportsSeries}=await import("./sports-permanent-series");
    if(!sessionIds)await persistSportsSeries(tx,actor,requestKey,rule);
    for(const session of sessions)await addSportsFixedLearners(tx,actor,session,rule);
    return;
  }
  if (rule.students.length) {
    const { reserveCourseInTransaction } = await import("./course-booking");
    const { getStoreLimitsByStoreId } = await import("@/lib/feature-gate");
    const limits = await getStoreLimitsByStoreId(actor.storeId);
    // This caller already holds the Store lock. Allocate once per learner,
    // reserve the full batch, then choose for the next learner (shared cards).
    for (const student of rule.students) {
      for (const session of sessions)
        await reserveCourseInTransaction(
          tx,
          actor,
          {
            sessionId: session.id,
            cardId: null,
            deferredPayment: !session.isTrial,
            customerId: student.customerId,
            trialPrice: session.isTrial ? rule.trialPrice : undefined,
            requestKey: `${requestKey}:${session.requestIndex}:${student.customerId}`,
          },
          limits.maxMonthlyBookings,
        );
    }
  }
}

export async function assertSportsRentalFree(
  tx: Prisma.TransactionClient,
  storeId: string,
  roomId: string,
  ranges: Array<{ startsAt: Date; endsAt: Date }>,
) {
  if (!(await sportsStagingEnabled(storeId))) return;
  const issues = new Set<string>();
  for (const range of ranges) {
      const rental = await tx.courseRental.findFirst({
        where: {
          storeId,
          roomId,
          cancelledAt: null,
          occupiedStartsAt: { lt: range.endsAt },
          occupiedEndsAt: { gt: range.startsAt },
        },
        orderBy: { occupiedStartsAt: "asc" },
      });
      if(rental)issues.add(`${formatTWDateTime(range.startsAt)} 排課衝突：${formatTWDateTime(rental.occupiedStartsAt)}–${formatTWDateTime(rental.occupiedEndsAt)} 這個空間已有租借（含緩衝時間）`);
  }
  if(issues.size)throw new AppError("CONFLICT",`${[...issues].sort().join("；")}；尚未建立，請調整時間或空間`);
}
