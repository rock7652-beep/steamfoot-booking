"use server";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import { z } from "zod";
import { sportsCompensation } from "@/lib/sports-staging-types";
import { createHash } from "node:crypto";
import { requireSportsStaging } from "@/lib/sports-staging";
import type { SportsSnapshot, SportsLesson } from "@/lib/sports-staging-types";
import {
  courseManager,
  courseMember,
  courseTransaction,
} from "@/server/services/course-access";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { AppError, handleActionError } from "@/lib/errors";
import {
  toLocalDateStr,
  formatTWDateTime,
  addTaiwanDuration,
} from "@/lib/date-utils";
import { coursePlanValues } from "@/lib/course-plan-save";
import {
  saveCoursePointPlan,
  assignCoursePointCard,
  updateCourseBookingStatus,
  cancelCourseSession,
  createCourseBooking,
} from "./course-members";
import { createCourseSchedule, moveCourseSessions } from "./course";
import {
  saveCourseRental,
  cancelCourseRental,
  saveRentalPayment,
} from "./course-rental";
import {
  collectCourseTrial,
  voidCourseTrialPayment,
  createCourseTrial,
} from "./course-trial";
import { refundCoursePurchase } from "./course-refund";
import { enqueueOperationAudit } from "@/server/services/operation-audit-outbox";
import { sportsTeachingTemplateId } from "@/server/services/sports-teaching-rule";
import { assertSportsProductionReady } from "@/server/services/sports-production-readiness";
const id = z.string().min(1).max(100);
async function actor(permission: Parameters<typeof courseManager>[0]) {
  const a = await courseManager(permission);
  requireSportsStaging(a.storeId);
  const fitness = await prisma.storeFeatureEntitlement.findFirst({
    where: {
      storeId: a.storeId,
      featureKey: "business.fitness",
      status: "ENABLED",
    },
  });
  if (!fitness) throw new AppError("FORBIDDEN", "此入口僅適用運動店");
  await coursePrisma.$transaction(tx => assertSportsProductionReady(tx, a.storeId));
  return a;
}
async function result<T extends { success: boolean; error?: string }>(
  value: Promise<T>,
) {
  const r = await value;
  if (!r.success) throw new AppError("VALIDATION", r.error ?? "操作失敗");
  return r;
}
export async function loadSportsStaging(formOnly = false): Promise<
  { success: true; data: SportsSnapshot } | { success: false; error: string }
> {
  try {
    const { storeId } = await actor("booking.read");
    await Promise.all(["plans.edit", "customer.read", "wallet.read", "transaction.read"].map(p=>courseManager(p as Parameters<typeof courseManager>[0])));
    // Scheduling never returns compensation, even to an owner. Management reads
    // keep the independent finance permission and query.
    if (!formOnly) await courseManager("teacher.compensation.read");
    const [
      subjects,
      plans,
      templates,
      sessions,
      rentals,
      cards,
      customers,
      coaches,
      rooms,
      rules,
    ] = await Promise.all([
      coursePrisma.musicSubject.findMany({
        where: { storeId },
        orderBy: { name: "asc" },
      }),
      coursePrisma.coursePointPlan.findMany({
        where: { storeId },
        orderBy: { name: "asc" },
      }),
      coursePrisma.courseTemplate.findMany({ where: { storeId } }),
      formOnly ? [] : coursePrisma.courseSession.findMany({
        where: { storeId, cancelledAt: null },
        include: {
          bookings: {
            include: { trialPayments: { where: { status: "SUCCESS" } } },
          },
        },
        orderBy: { startsAt: "asc" },
        take: 501,
      }),
      formOnly ? [] : coursePrisma.courseRental.findMany({
        where: { storeId, cancelledAt: null },
        include: { payments: { where: { status: "SUCCESS" } } },
        orderBy: { startsAt: "asc" },
        take: 501,
      }),
      coursePrisma.coursePointCard.findMany({
        where: { storeId, closedAt: null, expiresAt: { gte: new Date() } },
        include: { members: true, bookings: { where: { status: "RESERVED" } } },
      }),
      prisma.customer.findMany({
        where: { storeId, mergedIntoCustomerId: null },
        select: { id: true, name: true, phone: true },
        take: 501,
      }),
      prisma.staff.findMany({
        where: { storeId, status: "ACTIVE", courseCoachEnabled: true },
        select: {
          id: true,
          displayName: true,
          courseQualifiedTemplateIds: true,
        },
      }),
      coursePrisma.courseRoom.findMany({ where: { storeId, isActive: true },orderBy:{name:"asc"} }),
      formOnly ? [] : coursePrisma.$queryRaw<
        Array<{
          sessionId: string;
          frequency: string;
          enrollment: string;
          planId: string | null;
          trialPrice: number;
        }>
      >`SELECT "sessionId",frequency,enrollment,"planId","trialPrice" FROM "SportsStagingSessionRule" WHERE "storeId"=${storeId}`,
    ]);
    if (sessions.length > 500 || rentals.length > 500 || customers.length > 500)
      throw new AppError("VALIDATION", "目前資料量超過新版課表載入範圍，請聯絡管理者。");
    const compensationRows = formOnly ? [] : await coursePrisma.courseCompensation.findMany({where:{storeId,staffId:""}});
    const fees = plans.map((p) => {
      const t = templates.find((t) => t.id === p.templateIds[0]);
      return {
        id: p.id,
        subject: p.sportsSubjectId??t?.musicSubjectId ?? t?.id ?? "",
        sportsMode:p.sportsMode,
        name: p.name,
        unit: p.unit === "POINT" ? "點數" : "堂數",
        amount: p.points,
        price: p.price,
        days: p.validDays,
        cost: p.sportsCost??t?.pointCost ?? 1,
        shared: p.allowShared,
        templateId: t?.id ?? "",
        snapshot: JSON.stringify(coursePlanValues.parse(p)),
        compensation: (()=>{const parsed=sportsCompensation.safeParse((compensationRows.find(r=>r.templateId===t?.id)?.rules as unknown[])?.[0]);return parsed.success?parsed.data:undefined;})(),
      };
    });
    const lessons: SportsLesson[] = sessions.map((s) => {
      const t = templates.find((t) => t.id === s.templateId),
        r = rules.find((r) => r.sessionId === s.id);
      const recurring =
        sessions.filter((p) => p.requestKey === s.requestKey).length > 1;
      const fixed = r ? r.frequency !== "SINGLE" : recurring;
      return {
        id: s.id,
        subject: t?.musicSubjectId ?? t?.id ?? "",
        fee:
          r?.planId ??
          fees.find((f) => f.templateId === s.templateId)?.id ??
          "",
        kind: s.isTrial
          ? "體驗"
          : fixed
            ? r?.frequency === "BIWEEKLY"
              ? "隔週固定"
              : "每週固定"
            : "單次",
        mode: r?.enrollment === "ASSIGNED" ? "指定學員" : "開放選課",
        date: toLocalDateStr(s.startsAt),
        time: formatTWDateTime(s.startsAt).slice(11, 16),
        duration: (s.endsAt.getTime() - s.startsAt.getTime()) / 60000,
        coach: coaches.find((c) => c.id === s.coachId)?.displayName ?? "",
        room: rooms.find((r) => r.id === s.roomId)?.name ?? "",
        capacity: s.capacity,
        students: s.bookings
          .filter((b) => b.status !== "CANCELLED")
          .map((b) => b.customerId ?? ""),
        price: r?.trialPrice ?? 0,
        series: s.requestKey,
        bookings: s.bookings.map((b) => ({
          id: b.id,
          name: b.customerName,
          status: b.status,
          trial: b.bookingKind === "TRIAL",
          paymentId: b.trialPayments[0]?.id,
        })),
        ...(fixed && s.rescheduledFromStartsAt
          ? {
              originalDate: toLocalDateStr(s.rescheduledFromStartsAt),
              originalTime: formatTWDateTime(s.rescheduledFromStartsAt).slice(
                11,
                16,
              ),
            }
          : {}),
      };
    });
    lessons.push(
      ...rentals.map((r) => ({
        id: r.id,
        subject: "",
        fee: "",
        kind: "空間出租",
        mode: "",
        date: toLocalDateStr(r.startsAt),
        time: formatTWDateTime(r.startsAt).slice(11, 16),
        duration: (r.endsAt.getTime() - r.startsAt.getTime()) / 60000,
        coach: "",
        room: rooms.find((p) => p.id === r.roomId)?.name ?? "",
        capacity: 0,
        students: [],
        price: r.amount,
        series: r.requestKey,
        bookings: [],
        paymentId: r.payments[0]?.id,
        revision: r.revision,
        customer: r.customerName,
        phone: r.customerPhone,
      })),
    );
    return {
      success: true,
      data: {
        storeId,
        subjects: subjects.map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
          active: s.isActive,
          updatedAt: s.updatedAt.toISOString(),
          templateId:templates.find(t=>t.id===sportsTeachingTemplateId(storeId,s.id))?.id,
        })),
        fees,
        lessons,
        students: cards
          .filter((c) => {
            const f = fees.find((f) => f.id === c.planId);
            return (
              f && (c.sportsMode!=="LEGACY" || !c.templateIds.length || c.templateIds.includes(f.templateId))
            );
          })
          .flatMap((c) =>
            c.members.map((m) => ({
              id: m.customerId,
              name: customers.find((p) => p.id === m.customerId)?.name ?? "",
              fee: c.planId,
              subject:c.sportsSubjectId??fees.find(f=>f.id===c.planId)?.subject,
              sportsMode:c.sportsMode,
              cardId: c.id,
              available:
                c.remaining - c.bookings.reduce((n, b) => n + b.pointCost, 0),
            })),
          ),
        customers,
        coaches: coaches.map((c) => ({
          id: c.id,
          name: c.displayName,
          templates: c.courseQualifiedTemplateIds,
        })),
        rooms: rooms.map((r) => ({
          id: r.id,
          name: r.name,
          capacity: r.capacity,
          rental: r.rentalEnabled,
        })),
        date: toLocalDateStr(),
      },
    };
  } catch (e) {
    const error = handleActionError(e);
    return {
      success: false,
      error: "error" in error ? error.error : "讀取失敗",
    };
  }
}
export async function saveSportsSubject(input: unknown) {
  try {
    const d = z
      .object({
        id: id.optional(),
        name: z.string().trim().min(1).max(80),
        category: z.string().trim().max(40),
        active: z.boolean(),
        expectedUpdatedAt: z.string().optional(),
        requestKey: z.string().uuid(),
      })
      .parse(input);
    const { storeId, user } = await actor(
      d.id ? "booking.update" : "booking.create",
    );
    const saved = await courseTransaction(
      storeId,
      async (tx) => {
        const key =
          d.id ??
          "sports_" +
            createHash("sha256")
              .update(`${storeId}:${user.id}:${d.requestKey}`)
              .digest("hex");
        const before = await tx.musicSubject.findFirst({
          where: { id: key, storeId },
        });
        const values = {
          name: d.name,
          category: d.category,
          isActive: d.active,
        };
        if (before) {
          if (!d.id) {
            if (
              before.name !== d.name ||
              before.category !== d.category ||
              before.isActive !== d.active
            )
              throw new AppError("CONFLICT", "請求已使用");
            return before;
          }
          if (
            !d.expectedUpdatedAt ||
            before.updatedAt.toISOString() !== d.expectedUpdatedAt
          )
            throw new AppError("CONFLICT", "教學項目已更新，請重新開啟");
          return tx.musicSubject.update({ where: { id: key }, data: values });
        }
        if (d.id) throw new AppError("NOT_FOUND", "找不到本店教學項目");
        return tx.musicSubject.create({
          data: { id: key, storeId, ...values },
        });
      },
      async (row, tx) =>
        enqueueOperationAudit(
          {
            actorUserId: user.id,
            storeId,
            module: "FITNESS",
            targetType: "MusicSubject",
            targetId: row.id,
            action: "SPORTS_SUBJECT_SAVE",
            summary: "運動教學項目儲存",
          },
          tx,
          d.requestKey,
        ),
    );
    return { success: true as const, id: saved.id };
  } catch (e) {
    return handleActionError(e);
  }
}
export async function saveSportsFee(input: unknown) {
  try {
    const d = z
      .object({
        active:z.boolean().optional(),
        customerPurchasable:z.boolean().optional(),
        compensation: sportsCompensation.optional(),
        expectedCompensation: sportsCompensation.nullable().optional(),
        id: id.optional(),
        sportsMode:z.enum(["LEGACY","ASSIGNED","OPEN"]).default("LEGACY"),
        subject: id.optional(),
        name: z.string().trim().min(1).max(80),
        unit: z.enum(["點數", "堂數"]),
        amount: z.number().int().min(1).max(100000),
        price: z.number().int().min(0).max(10000000),
        days: z.number().int().min(1).max(3650),
        cost: z.number().int().min(1).max(10000),
        shared: z.boolean(),
        coachIds: z.array(id).default([]),
        requestKey: z.string().uuid(),
        snapshot: z.string().optional(),
      })
      .parse(input);
    const { storeId } = await actor("plans.edit");
    if(d.sportsMode==="LEGACY"){await courseManager("booking.create");await courseManager("staff.manage");if(!d.subject||!d.coachIds.length)throw new AppError("VALIDATION","請選教學項目與授課教練");}
    const base: Partial<z.infer<typeof coursePlanValues>> = d.snapshot
      ? coursePlanValues.parse(JSON.parse(d.snapshot))
      : {};
    return await saveCoursePointPlan({
      ...base,
      id: d.id,
      name: d.name,
      unit: d.unit === "點數" ? "POINT" : "SESSION",
      points: d.amount,
      price: d.price,
      validDays: d.days,
      storeCost: 0,
      allowShared: d.shared,
      isActive: d.active ?? base.isActive ?? true,
      customerPurchasable:d.customerPurchasable??base.customerPurchasable??true,
      templateIds: [],
      sportsMode:d.sportsMode,
      sportsSubjectId:d.sportsMode==="ASSIGNED"?d.subject??null:null,
      sportsCost:d.sportsMode==="ASSIGNED"?(d.unit==="堂數"?1:d.cost):null,
      sportsSetup: d.sportsMode==="LEGACY"?{
        compensation: d.compensation,
        expectedCompensation: d.expectedCompensation,
        subject: d.subject,
        cost: d.cost,
        coachIds: d.coachIds,
        requestKey: d.requestKey,
      }:undefined,
      expectedSnapshot: d.snapshot,
      receipt: { expectedStoreId: storeId, requestKey: d.requestKey },
    });
  } catch (e) {
    return handleActionError(e);
  }
}
export async function sportsStagingCommand(input: unknown) {
  try {
    const data = z
      .object({
        operation: z.enum([
          "schedule",
          "move",
          "purchase",
          "attendance",
          "cancel",
          "join",
          "trial-collect",
          "trial-void",
          "rental-collect",
          "refund",
        ]),
        payload: z.record(z.string(), z.unknown()),
      })
      .parse(input);
    const { storeId, user } = await actor("booking.read");
    const p = data.payload;
    if (data.operation === "schedule") {
      const d = z
        .object({
          subject: id,
          fee: id.optional(),
          kind: z.enum(["每週固定", "隔週固定", "單次", "體驗", "空間出租"]),
          mode: z.enum(["指定學員", "開放選課"]),
          date: z.string(),
          time: z.string(),
          duration: z.number().int().min(5).max(480),
          waitlistLimit:z.number().int().min(0).max(100).optional(),
          waitlistStopMinutes:z.number().int().min(0).max(10080).optional(),
          count: z.number().int().min(1).max(24),
          coach: z.string(),
          coachId: id.optional(),
          room: z.string(),
          capacity: z.number().int().min(1).max(50),
          students: z.array(id),
          price: z.number().int().min(0).max(1000000),
          customerId: z.string().min(1).nullable().optional(),
          customer: z.string().default(""),
          phone: z.string().default(""),
          requestKey: z.string().uuid(),
        })
        .parse(p);
      const room = await coursePrisma.courseRoom.findFirst({
        where: { storeId, name: d.room, isActive: true },
      });
      if (!room) throw new AppError("VALIDATION", "請選有效空間");
      if (d.kind === "空間出租")
        return await result(
          saveCourseRental({
            roomId: room.id,
            customerId: d.customerId??null,
            customerName: d.customer,
            customerPhone: d.phone,
            date: d.date,
            time: d.time,
            durationMinutes: d.duration,
            amount: d.price,
            requestKey: d.requestKey,
          }),
        );
      const plan = await coursePrisma.coursePointPlan.findFirst({
        where: { id: d.fee??"", storeId, isActive: true },
      });
      if (d.fee && !plan) throw new AppError("VALIDATION", "請選有效收費方式");
      const template = await coursePrisma.courseTemplate.findFirst({
        where: {
          id: plan?.templateIds[0]??sportsTeachingTemplateId(storeId,d.subject),
          storeId,
          musicSubjectId: d.subject,
          isActive: true,
        },
      });
      if (!template) throw new AppError("VALIDATION", "請先在教學項目設定授課教練與課程規則");
      const coaches = await prisma.staff.findMany({
        where: {
          storeId, status: "ACTIVE", courseCoachEnabled: true,
          courseQualificationsConfirmed: true,
          courseQualifiedTemplateIds: { has: template.id },
          ...(d.coachId ? { id: d.coachId } : { displayName: d.coach }),
        },
      });
      if (coaches.length !== 1) throw new AppError("VALIDATION", "請重新選擇具本課程授課資格的教練；同名教練請重新整理後選擇。");
      const coach = coaches[0];
      if (room.capacity !== null && d.capacity > room.capacity)
        throw new AppError("VALIDATION", "人數超過空間容量");
      const frequency =
        d.kind === "每週固定"
          ? "WEEKLY"
          : d.kind === "隔週固定"
            ? "BIWEEKLY"
            : "SINGLE";
      const perpetual=sportsNativePreview(storeId)&&frequency!=="SINGLE";
      const count=frequency==="SINGLE"||perpetual?1:d.count;
      // Resolve cards only after createCourseSchedule holds the Store lock and
      // has checked for an existing receipt. Retries preserve original intent.
      const students = (d.mode === '指定學員' ? d.students : []).map(customerId=>({customerId,cardId:null}));
      if (d.kind === "體驗") await courseManager("trial.create");
      return await result(
        createCourseSchedule({
          templateId: template.id,
          roomId: room.id,
          coachId: coach.id,
          date: d.date,
          time: d.time,
          durationMinutes: d.duration,
          capacity: d.capacity,
          isTrial: d.kind === "體驗",
          additionalDates: Array.from({ length: count - 1 }, (_, i) =>
            addTaiwanDuration(
              d.date,
              (i + 1) * (frequency === "BIWEEKLY" ? 14 : 7),
              "DAY",
            ),
          ),
          requestKey: d.requestKey,
          sportsStaging: {
            perpetual:perpetual?true:undefined,
            frequency,
            ...(sportsNativePreview(storeId)&&d.waitlistLimit!==undefined?{waitlist:{limit:d.mode==="開放選課"?d.waitlistLimit:0,stopMinutes:d.waitlistStopMinutes??240}}:{}),
            enrollment: d.mode === "指定學員" ? "ASSIGNED" : "OPEN",
            planId: d.kind === "體驗" ? null : plan?.id??null,
            students,
            trialPrice: d.price,
          },
        }),
      );
    }
    if (data.operation === "move") {
      const d = z.object({ id, date: z.string(), time: z.string() }).parse(p);
      const session = await coursePrisma.courseSession.findFirst({
        where: { id: d.id, storeId },
      });
      if (session)
        return await result(
          moveCourseSessions({
            ...d,
            scope: "SINGLE",
            roomId: session.roomId,
            coachId: session.coachId,
          }),
        );
      const rental = await coursePrisma.courseRental.findFirst({
        where: { id: d.id, storeId, cancelledAt: null },
      });
      if (!rental) throw new AppError("NOT_FOUND", "找不到本店排課");
      return await result(
        saveCourseRental({
          ...d,
          revision: rental.revision,
          requestKey: rental.requestKey,
          roomId: rental.roomId,
          customerId: rental.customerId,
          customerName: rental.customerName,
          customerPhone: rental.customerPhone,
          durationMinutes:
            (rental.endsAt.getTime() - rental.startsAt.getTime()) / 60000,
          amount: rental.amount,
          note: rental.note,
        }),
      );
    }
    if (data.operation === "purchase") {
      const d = z
        .object({
          planId: id,
          customerId: id,
          requestKey: z.string().uuid(),
          expectedPrice: z.number(),
        })
        .parse(p);
      const plan = await coursePrisma.coursePointPlan.findFirst({
        where: { id: d.planId, storeId, isActive: true },
      });
      if (!plan || plan.price !== d.expectedPrice)
        throw new AppError("CONFLICT", "價格已更新，請重新開啟");
      const staff = await prisma.staff.findFirst({
        where: { storeId, userId: user.id, status: "ACTIVE" },
      });
      return await result(
        assignCoursePointCard({
          ...d,
          expiresDate: addTaiwanDuration(
            toLocalDateStr(),
            plan.validDays,
            "DAY",
          ),
          expectedListPrice: plan.price,
          expectedStoreCost: plan.storeCost,
          discountKind: "AMOUNT",
          discountValue: 0,
          paymentMethod: "CARD",
          revenueStaffId: staff?.id ?? "",
        }),
      );
    }
    if (data.operation === "attendance")
      return await result(updateCourseBookingStatus(p));
    if (data.operation === "cancel") {
      const d = z
        .object({
          id,
          revision: z.number().optional(),
          expectedBookings: z.number().int().min(0).optional(),
        })
        .parse(p);
      const r = await coursePrisma.courseRental.findFirst({
        where: { id: d.id, storeId },
      });
      return r
        ? await result(cancelCourseRental({ id: r.id, revision: d.revision }))
        : await result(
            cancelCourseSession({
              sessionId: d.id,
              expectedBookings: d.expectedBookings,
            }),
          );
    }
    if (data.operation === "join") {
      const d = z
        .object({
          sessionId: id,
          customerId: id,
          requestKey: z.string().uuid(),
        })
        .parse(p);
      const rule = await coursePrisma.$queryRaw<
        Array<{ planId: string | null; trialPrice: number; enrollment:string }>
      >`SELECT "planId","trialPrice",enrollment FROM "SportsStagingSessionRule" WHERE "storeId"=${storeId} AND "sessionId"=${d.sessionId}`;
      if (!rule[0]) throw new AppError("NOT_FOUND", "課程不在測試改版入口");
      const session = await coursePrisma.courseSession.findFirst({where:{id:d.sessionId,storeId,cancelledAt:null}});
      if(!session)throw new AppError("NOT_FOUND","找不到本店課程");
      if(session.isTrial)return await result(createCourseTrial({...d,price:rule[0].trialPrice}));
      return await result(createCourseBooking({...d,autoCard:true}));
    }
    if (data.operation === "trial-collect")
      return await result(collectCourseTrial(p));
    if (data.operation === "trial-void")
      return await result(voidCourseTrialPayment(p));
    if (data.operation === "rental-collect")
      return await result(saveRentalPayment(p));
    if (data.operation === "refund")
      return await result(refundCoursePurchase(p));
    throw new AppError("VALIDATION", "不支援此操作");
  } catch (e) {
    return handleActionError(e);
  }
}

export async function bookSportsTrial(input: unknown) {
  try {
    const d = z
      .object({
        sessionId: id,
        requestKey: z.string().uuid(),
        expectedPrice: z.number().int().min(0),
      })
      .parse(input);
    const { storeId, user, customer } = await courseMember({ write: true });
    requireSportsStaging(storeId);
    const fitness = await prisma.storeFeatureEntitlement.findFirst({
      where: { storeId, featureKey: "business.fitness", status: "ENABLED" },
    });
    if (!fitness) throw new AppError("FORBIDDEN", "此入口僅適用運動店");
    const { getTrialSettings, clampTrialTotal } =
      await import("@/lib/shop-config");
    const settings = await getTrialSettings(storeId);
    if (!settings.trialEnabled)
      throw new AppError("FORBIDDEN", "店家體驗功能已關閉");
    const { getStoreLimitsByStoreId } = await import("@/lib/feature-gate");
    const limits = await getStoreLimitsByStoreId(storeId);
    await courseTransaction(storeId, async (tx) => {
      await assertSportsProductionReady(tx, storeId);
      const { readSportsSessionRule } =
        await import("@/server/services/sports-staging-schedule");
      const rule = await readSportsSessionRule(tx, storeId, d.sessionId);
      if (!rule || rule.enrollment !== "OPEN" || rule.planId !== null)
        throw new AppError("VALIDATION", "此課未開放體驗預約");
      const price = clampTrialTotal(rule.trialPrice, 1, settings);
      if (price !== d.expectedPrice)
        throw new AppError("CONFLICT", "體驗價格已更新，請重新確認");
      const { reserveCourseInTransaction } =
        await import("@/server/services/course-booking");
      return reserveCourseInTransaction(
        tx,
        {
          storeId,
          userId: user.id,
          name: customer.name,
          customerId: customer.id,
        },
        {
          sessionId: d.sessionId,
          cardId: null,
          customerId: customer.id,
          trialPrice: price,
          requestKey: d.requestKey,
        },
        limits.maxMonthlyBookings,
        { sportsMemberTrial: true },
      );
    });
    return { success: true as const };
  } catch (e) {
    return handleActionError(e);
  }
}
