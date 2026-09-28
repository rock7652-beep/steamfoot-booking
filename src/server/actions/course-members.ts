"use server";
import { musicSubjectRuleSchema } from "@/lib/music-subject-rule";
import { resolveMusicSubjectRule } from "@/server/services/music-subject-rule";
import { courseHistoryRange } from "@/lib/course-history-range";
import {validateCourseTerm} from "@/server/services/course-term";
import {scheduleCourseLowBalanceCheck} from "@/server/services/course-low-balance-schedule";
import { courseCheckoutSchema } from "@/lib/course-checkout";
import { assignCourseWithCheckout } from "@/server/services/course-assignment-checkout";
import { after } from "next/server";
import { z } from "zod";
import { updateCustomerSchema } from "@/lib/validators/customer";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { AppError, handleActionError } from "@/lib/errors";
import { parseTaipeiDateTime } from "@/lib/date-utils";
import {
  courseManager,
  courseMember,
  courseAccount,
  courseTransaction,
} from "@/server/services/course-access";
import {
  reserveCourse,
  reserveCourseMembers,
  settleCourseBooking,
  correctCourseAttendance,
  syncCourseRelease,
  type CourseActor,
} from "@/server/services/course-booking";

const id = z.string().min(1).max(100);
function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/courses");
  revalidatePath("/book");
}

// The music roster updates itself optimistically and reconciles through a direct roster read.
// Revalidating from a Server Action also forces the current dashboard route to reload.
async function refreshUnlessMusicRoster(storeId: string) {
  const music = await prisma.storeFeatureEntitlement.findFirst({
    where: { storeId, featureKey: "business.music", status: "ENABLED" },
    select: { storeId: true },
  });
  if (!music) refresh();
}
const bookingInput = z.object({
  makeupForBookingId: id.nullable().optional(),
  sessionId: id,
  notes: z.string().trim().max(1000).default(""),
  cardId: id,
  customerId: id,
  requestKey: z.string().uuid(),
});

export async function saveCourseCustomer(input: unknown) {
  try {
    const data = updateCustomerSchema.pick({ name: true, phone: true, email: true, gender: true, birthday: true, height: true, lineName: true, serviceNote: true, expectedUpdatedAt: true }).extend({ id: id.optional(), emergencyContactName: z.string().trim().max(100).nullable().optional(), emergencyContactPhone: z.string().trim().max(30).nullable().optional(), address: z.string().trim().max(300).nullable().optional(), notes: z.string().trim().max(1000).nullable().optional() }).parse(input);
    const { storeId } = await courseManager(
      data.id ? "customer.update" : "customer.create",
    );
    if (data.birthday && !parseTaipeiDateTime(data.birthday, "00:00")) throw new AppError("VALIDATION", "生日格式不正確");
    const profile = {
      name: data.name, phone: data.phone,
      email: data.email ?? null,
      gender: data.gender ?? null,
      birthday: data.birthday ? new Date(`${data.birthday}T00:00:00.000Z`) : null,
      height: data.height ?? null,
      ...(data.emergencyContactName !== undefined ? { emergencyContactName: data.emergencyContactName || null } : {}),
      ...(data.emergencyContactPhone !== undefined ? { emergencyContactPhone: data.emergencyContactPhone || null } : {}),
      ...(data.address !== undefined ? { address: data.address || null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      ...(data.lineName !== undefined ? { lineName: data.lineName || null } : {}),
      ...(data.serviceNote !== undefined ? { serviceNote: data.serviceNote || null } : {}),
    };
    let customerId = data.id ?? "";
    if (data.id) {
      const result = await prisma.customer.updateMany({
        where: { id: data.id, storeId, mergedIntoCustomerId: null, ...(data.expectedUpdatedAt ? {updatedAt:new Date(data.expectedUpdatedAt)} : {}) },
        data: profile,
      });
      if (!result.count) throw new AppError(data.expectedUpdatedAt?"CONFLICT":"NOT_FOUND", data.expectedUpdatedAt?"顧客資料已有更新，輸入已保留。請核對目前資料後再編輯。":"找不到本店顧客");
    } else {
      const { getStoreLimitsByStoreId } = await import("@/lib/feature-gate");
      const limits = await getStoreLimitsByStoreId(storeId);
      customerId = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
        const count = await tx.customer.count({
          where: { storeId, mergedIntoCustomerId: null },
        });
        if (limits.maxCustomers !== null && count >= limits.maxCustomers)
          throw new AppError("FORBIDDEN", "已達方案顧客額度上限");
        const created = await tx.customer.create({
          data: { storeId, ...profile },
          select: { id: true },
        });
        return created.id;
      });
    }
    refresh();
    return { success: true as const, data: { id: customerId } };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function saveCoursePointPlan(input: unknown) {
  try {
    const schema = z
      .object({
        id: id.optional(),
        expectedSnapshot: z.string().max(30000).optional(),
        musicSetup: musicSubjectRuleSchema.optional(),
        name: z.string().trim().min(1).max(80),
        points: z.number().int().min(1).max(100000),
        price: z.number().int().min(0).max(10000000),
        storeCost: z.number().int().min(0).max(10000000).default(0),
        termSessionIds:z.array(id).max(52).default([]),
        customerPurchasable: z.boolean().default(true),
        allowShared: z.boolean().default(false),
        validDays: z.number().int().min(1).max(3650),
        isActive: z.boolean().default(true),
        unit: z.enum(["POINT", "SESSION"]).default("POINT"),
        musicBonusLessons:z.number().int().min(0).max(1000).default(0),
        musicTermSizes:z.array(z.number().int().min(1).max(1000)).max(100).default([]),
        musicTerms:z.number().int().min(1).max(100).nullable().default(null),
        templateIds: z.array(id).max(200).default([]),
      })
;
    const { id: planId, expectedSnapshot, musicSetup, ...data } = schema.parse(input);
    const expected = expectedSnapshot ? schema.omit({id:true,expectedSnapshot:true,musicSetup:true}).parse(JSON.parse(expectedSnapshot)) : null;
    const { storeId } = await courseManager("plans.edit");
    const isMusic = await prisma.storeFeatureEntitlement.findFirst({
      where: { storeId, featureKey: "business.music", status: "ENABLED" },
      select: { storeId: true },
    });
    if (isMusic && data.unit !== "SESSION")
      throw new AppError("VALIDATION", "音樂教室方案以堂數計算；每次上課使用 1 堂");
    if (isMusic && !musicSetup) {
      if (data.templateIds.length!==1 || data.musicTerms===null) throw new AppError("VALIDATION","音樂方案請選擇一種課程與購買期數");
      const template=await coursePrisma.courseTemplate.findFirst({where:{id:data.templateIds[0],storeId,isActive:true},select:{musicPricePerLesson:true,musicTermLessons:true,musicValidityDaysPerTerm:true,musicTrialMode:true}});
      if (!template || template.musicTrialMode) throw new AppError("VALIDATION","體驗課不建立期數方案，請選擇一般課程");
      const {musicPlanQuote}=await import("@/lib/music-course-products");
      let quote:ReturnType<typeof musicPlanQuote>;
      try { quote=musicPlanQuote(template,data.musicTerms); } catch(error) {throw new AppError("VALIDATION",error instanceof Error ? error.message : "課程設定不完整");}
      data.points=quote.lessons+data.musicBonusLessons;data.price=quote.price;data.validDays=quote.validDays;
      data.musicTermSizes=Array(data.musicTerms).fill(template.musicTermLessons!);
      if(data.points>100000)throw new AppError("VALIDATION","總堂數超過上限");
      if (data.termSessionIds.length) throw new AppError("VALIDATION","音樂固定時段由課表管理，購買方案不預先綁定指定課次");
    } else if (!isMusic && (musicSetup || data.musicBonusLessons || data.musicTermSizes.length || data.musicTerms!==null)) throw new AppError("VALIDATION","運動方案不使用音樂課期數");
    if (data.templateIds.length && await coursePrisma.courseTemplate.count({ where: { storeId, id: { in: data.templateIds } } }) !== new Set(data.templateIds).size) throw new AppError("VALIDATION", "適用課程必須屬於本店");
    await courseTransaction(storeId,async tx=>{
    if(isMusic && musicSetup){
      if(data.musicTerms===null || data.termSessionIds.length)throw new AppError("VALIDATION","請設定購買期數；實際上課日期由課表安排");
      const template=await resolveMusicSubjectRule(tx,storeId,musicSetup);
      const {musicPlanQuote}=await import("@/lib/music-course-products");
      const quote=musicPlanQuote(template,data.musicTerms);
      data.templateIds=[template.id];data.points=quote.lessons+data.musicBonusLessons;
      data.price=quote.price;data.validDays=quote.validDays;
      data.musicTermSizes=Array(data.musicTerms).fill(template.musicTermLessons!);
      if(data.points>100000)throw new AppError("VALIDATION","總堂數超過上限");
    }
    const previous=planId?await tx.coursePointPlan.findFirst({where:{id:planId,storeId}}):null;
    const sameTerm=previous && previous.points===data.points && previous.unit===data.unit && JSON.stringify([...previous.termSessionIds].sort())===JSON.stringify([...data.termSessionIds].sort()) && JSON.stringify([...previous.templateIds].sort())===JSON.stringify([...data.templateIds].sort());
    if(previous?.termSessionIds.length&&!sameTerm&&await tx.coursePurchase.count({where:{storeId,planId}}))throw new AppError("CONFLICT","此期課已有購買紀錄，請新增下一期方案，保留原期別課次。");
    data.termSessionIds=sameTerm?previous.termSessionIds:await validateCourseTerm(tx,storeId,data);
    if (planId) {
      const result = await tx.coursePointPlan.updateMany({
        where: { id: planId, storeId, ...(expected ? {...expected,musicTermSizes:{equals:expected.musicTermSizes},templateIds:{equals:expected.templateIds},termSessionIds:{equals:expected.termSessionIds}} : {}) },
        data,
      });
      if (!result.count) throw new AppError(expected?"CONFLICT":"NOT_FOUND", expected?"方案已有更新，輸入已保留。請核對目前資料後再編輯。":"找不到本店方案");
    } else
      await tx.coursePointPlan.create({ data: { ...data, storeId } });
    });
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function setCoursePointPlanStatus(input: unknown) {
  try {
    const data = z.object({ id, isActive: z.boolean() }).parse(input);
    const { storeId } = await courseManager("plans.edit");
    const result = await coursePrisma.coursePointPlan.updateMany({
      where: { id: data.id, storeId },
      data: { isActive: data.isActive },
    });
    if (!result.count) throw new AppError("NOT_FOUND", "找不到本店方案");
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function assignCoursePointCard(input: unknown) {
  try {
    const { user, storeId } = await courseManager("wallet.create");
    const data = z
      .object({
        planId: id,
        customerId: id,
        expiresDate: z
          .string()
          .refine((v) => !!parseTaipeiDateTime(v, "00:00")),
        requestKey: z.string().uuid(),
      })
      .parse(input);
    await courseManager("transaction.create");
    const checkout = courseCheckoutSchema.parse(input);
    if (checkout.discountValue > 0 || (checkout.musicManualBonus??0)>0) await courseManager("transaction.discount");
    await courseTransaction(storeId, async tx => {
      const plan=await tx.coursePointPlan.findFirst({where:{id:data.planId,storeId},select:{termSessionIds:true,unit:true}});
      const music = !!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}});
      if(music && plan?.unit==="POINT")throw new AppError("VALIDATION","音樂教室只使用堂數方案");
      if(plan?.termSessionIds.length) await courseManager("booking.create");
      return assignCourseWithCheckout(tx, {storeId, userId:user.id, music}, {...data,...checkout});
    });
    for (const path of ["/dashboard/revenue", "/dashboard/cashbook", "/dashboard/cash-drawer"]) revalidatePath(path);
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

/** Checkout options for the learner currently selected in the schedule dialog. */
export async function loadCourseStudentPurchase(bookingId: string) {
  try {
    id.parse(bookingId);
    const { user, storeId } = await courseManager("wallet.create");
    await courseManager("transaction.create");
    const booking = await coursePrisma.courseBooking.findFirst({
      where: { id: bookingId, storeId },
      select: { customerId: true, customerName: true, session: { select: { templateId: true } } },
    });
    if (!booking) throw new AppError("NOT_FOUND", "找不到本店學員");
    const { checkPermission } = await import("@/lib/permissions");
    const [plans, customer, canDiscount] = await Promise.all([
      coursePrisma.coursePointPlan.findMany({
        where: { storeId, isActive: true, unit: "SESSION", templateIds: { has: booking.session.templateId } },
        select: { id: true, name: true, points: true, price: true, storeCost: true, validDays: true, musicTerms:true,musicTermSizes:true,musicBonusLessons:true },
        orderBy: [{ points: "asc" }, { name: "asc" }],
      }),
      prisma.customer.findFirst({ where: { id: booking.customerId, storeId, mergedIntoCustomerId: null }, select: { id: true } }),
      checkPermission(user.role, user.staffId, "transaction.discount"),
    ]);
    if (!customer) throw new AppError("NOT_FOUND", "找不到本店學員");
    return { success: true as const, data: { customerId: booking.customerId, customerName: booking.customerName, plans, canDiscount } };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function setCourseCardMembers(input: unknown) {
  try {
    const { storeId } = await courseManager("wallet.create");
    const data = z
      .object({ cardId: id, customerIds: z.array(id).min(1).max(50) })
      .parse(input);
    await courseTransaction(storeId, async (tx) => {
      const card = await tx.coursePointCard.findFirst({
        where: { id: data.cardId, storeId },
        include: { plan: { select: { allowShared: true } } },
      });
      if (!card) throw new AppError("NOT_FOUND", "找不到本店方案");
      if (!card.plan.allowShared) throw new AppError("VALIDATION", "此方案未開放共卡");
      if(card.termSessionIds.length)throw new AppError("VALIDATION","期課為指定學員，不開放共卡；請另購方案");
      for (const customerId of new Set(data.customerIds)) {
        const rows = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM "Customer" WHERE id = ${customerId} AND "storeId" = ${storeId} AND "mergedIntoCustomerId" IS NULL`;
        if (!rows.length)
          throw new AppError("FORBIDDEN", "共卡只能加入本店顧客");
      }
      // Do not orphan a reserved learner/operator by revoking access silently.
      const held = await tx.courseBooking.findMany({
        where: { storeId, cardId: card.id, status: "RESERVED" },
        select: { customerId: true, operatorCustomerId: true },
      });
      if (
        held.some(
          (b) =>
            !data.customerIds.includes(b.customerId) ||
            (b.operatorCustomerId &&
              !data.customerIds.includes(b.operatorCustomerId)),
        )
      )
        throw new AppError("CONFLICT", "移除成員前請先處理其尚未完成的預約");
      await tx.courseCardMember.deleteMany({
        where: {
          cardId: card.id,
          storeId,
          customerId: { notIn: data.customerIds },
        },
      });
      await tx.courseCardMember.createMany({
        data: [...new Set(data.customerIds)].map((customerId) => ({
          storeId,
          cardId: card.id,
          customerId,
        })),
        skipDuplicates: true,
      });
    });
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function createCourseBooking(input: unknown) {
  try {
    const { user, storeId } = await courseManager("booking.create");
    const booking = await reserveCourse(
      { userId: user.id, storeId, name: user.name ?? "店長" },
      bookingInput.parse(input),
    );
    scheduleCourseLowBalanceCheck(storeId,[booking.id]);
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function createMemberCourseBooking(input: unknown) {
  try {
    const { user, storeId, customer } = await courseMember({ write: true });
    if (input && typeof input === "object" && "makeupForBookingId" in input && input.makeupForBookingId) throw new AppError("VALIDATION", "補課請逐位安排");
    const bookings = await reserveCourseMembers(
      {
        userId: user.id,
        storeId,
        name: customer.name,
        customerId: customer.id,
      },
      z.union([
        bookingInput.omit({ customerId: true }).extend({ customerIds: z.array(id).min(1).max(20) }),
        bookingInput.transform(({ customerId, ...rest }) => ({ ...rest, customerIds: [customerId] })),
      ]).parse(input),
    );
    scheduleCourseLowBalanceCheck(storeId,bookings.map(b=>b.id));
    after(async () => {
      const {notifyCourseBookingManagers}=await import("@/server/services/course-manager-notifications");
      await notifyCourseBookingManagers(storeId,bookings.map(b=>b.id));
    });
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function updateCourseBookingStatus(input: unknown) {
  try {
    const data = z
      .object({
        bookingId: id,
        status: z.enum(["CANCELLED", "ATTENDED", "CHECKED_IN", "NO_SHOW", "STUDENT_LEAVE"]),
        noShowChoice: z
          .enum(["DEDUCTED", "DEDUCTED_WITH_MAKEUP"])
          .optional(),
        member: z.boolean().default(false),
      })
      .parse(input);
    let actor: CourseActor;
    if (data.member) {
      const { user, storeId, customer } = await courseMember({ write: true });
      if (data.status !== "CANCELLED")
        throw new AppError("FORBIDDEN", "會員不能操作點名");
      actor = {
        userId: user.id,
        storeId,
        name: customer.name,
        customerId: customer.id,
      };
    } else {
      const { user, storeId } = await courseManager("booking.update");
      actor = { userId: user.id, storeId, name: user.name ?? "店長" };
    }
    await courseTransaction(actor.storeId, async (tx) => {
      if (!data.member && (data.status === "CANCELLED" || data.status === "STUDENT_LEAVE")) {
        const booking = await tx.courseBooking.findFirst({where:{id:data.bookingId,storeId:actor.storeId},select:{bookingKind:true}});
        if (booking?.bookingKind === "TRIAL") await courseManager("trial.cancel");
      }
      return settleCourseBooking(
        tx,
        actor,
        data.bookingId,
        data.status,
        data.noShowChoice,
      );
    });
    scheduleCourseLowBalanceCheck(actor.storeId,[data.bookingId]);
    if (!data.member && (data.status === "ATTENDED" || data.status === "NO_SHOW")) await refreshUnlessMusicRoster(actor.storeId);
    else refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function cancelCourseSession(input: unknown) {
  try {
    const { user, storeId } = await courseManager("booking.update");
    const data = z
      .object({ sessionId: id, expectedBookings: z.number().int().min(0) })
      .parse(input);
    await courseTransaction(storeId, async (tx) => {
      const session = await tx.courseSession.findFirst({
        where: { id: data.sessionId, storeId },
      });
      if (!session) throw new AppError("NOT_FOUND", "找不到課程");
      if (session.cancelledAt) return;
      const bookings = await tx.courseBooking.findMany({
        where: { storeId, sessionId: session.id, status: { not: "CANCELLED" } },
      });
      if (bookings.length !== data.expectedBookings)
        throw new AppError("CONFLICT", "預約人數已變動，請重新核對後取消");
      if (bookings.some((b) => b.status === "ATTENDED"))
        throw new AppError("CONFLICT", "此課已有完成點名紀錄，不能整堂取消");
      for (const b of bookings.filter((b) => b.status === "RESERVED"))
        await settleCourseBooking(
          tx,
          { storeId, userId: user.id, name: user.name ?? "店長" },
          b.id,
          "CANCELLED",
        );
      await tx.courseSession.update({
        where: { id: session.id },
        data: { cancelledAt: new Date() },
      });
    });
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

/** Stop only the already scheduled future lessons of this series. Current and past lessons remain intact. */
async function futureMusicCourseScope(
  tx: Parameters<Parameters<typeof courseTransaction>[1]>[0],
  storeId: string,
  sessionId: string,
  bookingId?: string,
) {
  const source = await tx.courseSession.findFirst({
    where: { id: sessionId, storeId, cancelledAt: null },
    select: { id: true, requestKey: true, templateId: true, startsAt: true },
  });
  if (!source) throw new AppError("NOT_FOUND", "找不到本店課程");
  const music = await prisma.storeFeatureEntitlement.findFirst({
    where: { storeId, featureKey: "business.music", status: "ENABLED" },
    select: { storeId: true },
  });
  if (!music) throw new AppError("VALIDATION", "此操作只適用音樂教室");
  let customerId: string | undefined;
  let customerName: string | undefined;
  if (bookingId) {
    const learner = await tx.courseBooking.findFirst({
      where: { id: bookingId, storeId, sessionId, status: { not: "CANCELLED" } },
      select: { customerId: true, customerName: true },
    });
    if (!learner) throw new AppError("NOT_FOUND", "找不到此堂學員");
    customerId = learner.customerId;
    customerName = learner.customerName;
  }
  const after = new Date(Math.max(Date.now(), source.startsAt.getTime()));
  const sessions = await tx.courseSession.findMany({
    where: { storeId, requestKey: source.requestKey, templateId: source.templateId,
      startsAt: { gt: after }, cancelledAt: null, releasedAt: null },
    select: { id: true, startsAt: true },
    orderBy: { startsAt: "asc" },
    take: 501,
  });
  if (sessions.length > 500) throw new AppError("VALIDATION", "後續課程過多，請分段處理");
  const allBookings = await tx.courseBooking.findMany({
    where: { storeId, sessionId: { in: sessions.map((item) => item.id) },
      ...(customerId ? { customerId } : {}), status: { not: "CANCELLED" } },
    select: { id: true, status: true, sessionId: true },
    orderBy: { id: "asc" },
  });
  if (allBookings.some((item) => item.status !== "RESERVED"))
    throw new AppError("CONFLICT", "後續課程已有完成點名，請先核對紀錄");
  return {
    sessionIds: sessions.map((item) => item.id),
    bookingIds: allBookings.map((item) => item.id),
    customerName,
  };
}

export async function previewFutureCourseStop(input: unknown) {
  try {
    const data = z.object({ sessionId: id, bookingId: id.optional() }).parse(input);
    const { storeId } = await courseManager("booking.read");
    const scope = await courseTransaction(storeId, tx =>
      futureMusicCourseScope(tx, storeId, data.sessionId, data.bookingId));
    return { success: true as const, data: scope };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function stopFutureCourseLessons(input: unknown) {
  try {
    const data = z.object({
      sessionId: id, bookingId: id.optional(),
      expectedSessionIds: z.array(id).max(500),
      expectedBookingIds: z.array(id).max(1000),
    }).parse(input);
    const { user, storeId } = await courseManager("booking.update");
    await courseTransaction(storeId, async tx => {
      const scope = await futureMusicCourseScope(tx, storeId, data.sessionId, data.bookingId);
      if (scope.sessionIds.join(",") !== data.expectedSessionIds.join(",") ||
          scope.bookingIds.join(",") !== data.expectedBookingIds.join(","))
        throw new AppError("CONFLICT", "後續課程或名單已變動，請重新開啟確認");
      if (!scope.sessionIds.length || data.bookingId && !scope.bookingIds.length)
        throw new AppError("VALIDATION", "沒有可停止的後續已排課");
      for (const bookingId of scope.bookingIds)
        await settleCourseBooking(tx,
          { storeId, userId: user.id, name: user.name ?? "店長" },
          bookingId, "CANCELLED");
      if (!data.bookingId)
        await tx.courseSession.updateMany({
          where: { storeId, id: { in: scope.sessionIds }, cancelledAt: null },
          data: { cancelledAt: new Date() },
        });
    });
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function loadCourseSessionDetail(sessionId: string, rosterOnly = false) {
  try {
    const { user, storeId } = await courseManager("booking.read");
    id.parse(sessionId);
    const { getCourseRoster, getCourseCards } =
      await import("@/server/queries/course-members");
    const { checkPermission } = await import("@/lib/permissions");
    const canReadCards = await checkPermission(
      user.role,
      user.staffId,
      "wallet.read",
    );
    const canCreate = await checkPermission(
      user.role,
      user.staffId,
      "booking.create",
    );
    const canPurchase = await checkPermission(user.role, user.staffId, "wallet.create") && await checkPermission(user.role, user.staffId, "transaction.create");
    const session = await coursePrisma.courseSession.findFirst({ where: { id: sessionId, storeId }, select: { startsAt: true, templateId: true, pointCost: true, teacherNote: true, teacherAttendance:true,teacherAttendanceReason:true,teacherMakeupForSessionId:true } });
    if (!session) throw new AppError("NOT_FOUND", "找不到本店課程");
    const musicStore = !!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}});
    const [roster, cards, pendingMakeups] = await Promise.all([
      getCourseRoster(storeId, sessionId),
      canCreate && !rosterOnly ? getCourseCards(storeId) : [],
      canCreate && musicStore && !rosterOnly ? coursePrisma.courseBooking.findMany({
        where:{storeId,status:"CANCELLED",absenceKind:"STUDENT_LEAVE",cardId:{not:null},session:{templateId:session.templateId,startsAt:{lt:session.startsAt},template:{classType:{not:"GROUP"}}}},
        select:{id:true,customerId:true,cardId:true,session:{select:{startsAt:true}}},orderBy:{session:{startsAt:"asc"}},
      }).then(async leaves => {
        const used = await coursePrisma.courseBooking.findMany({where:{storeId,makeupForBookingId:{in:leaves.map(leave=>leave.id)},OR:[{status:{not:"CANCELLED"}},{absenceKind:"STUDENT_LEAVE"}]},select:{makeupForBookingId:true}});
        const linked = new Set(used.map(item=>item.makeupForBookingId));
        return leaves.filter(leave=>!linked.has(leave.id)).map(leave=>({id:leave.id,customerId:leave.customerId,cardId:leave.cardId!,date:leave.session.startsAt.toISOString()}));
      }) : [],
    ]);
    return {
      success: true as const,
      data: {
        roster,
        canPurchase,
        pendingMakeups,
        trial: {
          settings: await (await import("@/lib/shop-config")).getTrialSettings(storeId),
          canCreate: canCreate && await checkPermission(user.role,user.staffId,"trial.create"),
          canCollect: await checkPermission(user.role,user.staffId,"trial.confirm"),
          canCorrect: await checkPermission(user.role,user.staffId,"transaction.void"),
          customers: !rosterOnly && canCreate && await checkPermission(user.role,user.staffId,"trial.create") ? await prisma.customer.findMany({where:{storeId,mergedIntoCustomerId:null},select:{id:true,name:true,phone:true},orderBy:{name:"asc"}}) : [],
        },
        session: { startsAt: session.startsAt.toISOString(), pointCost: session.pointCost, teacherNote: session.teacherNote, teacherAttendance:session.teacherAttendance, teacherAttendanceReason:session.teacherAttendanceReason,teacherMakeupForSessionId:session.teacherMakeupForSessionId },
        cards: cards.filter((card) => !musicStore || card.unit === "SESSION").map((card) => ({
          ...card,
          entries: canReadCards ? card.entries : [],
        })),
      },
    };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function loadCourseRosterQuick(sessionId: string) {
  const startedAt = Date.now();
  let authMs = 0;
  let sessionMs = 0;
  let rosterMs = 0;
  try {
    const { storeId } = await courseManager("booking.read");
    authMs = Date.now() - startedAt;
    id.parse(sessionId);
    const session = await coursePrisma.courseSession.findFirst({where:{id:sessionId,storeId,cancelledAt:null},select:{teacherNote:true,teacherAttendance:true,teacherAttendanceReason:true}});
    sessionMs = Date.now() - startedAt - authMs;
    if (!session) throw new AppError("NOT_FOUND", "找不到本店課程");
    const { getCourseRoster } = await import("@/server/queries/course-members");
    const roster = await getCourseRoster(storeId,sessionId);
    rosterMs = Date.now() - startedAt - authMs - sessionMs;
    console.info("[course-roster-read]", { outcome: "success", count: roster.length, authMs, sessionMs, rosterMs, totalMs: Date.now() - startedAt });
    return {success:true as const, data:{roster,teacherNote:session.teacherNote,teacherAttendance:session.teacherAttendance,teacherAttendanceReason:session.teacherAttendanceReason}};
  } catch(error) {
    console.info("[course-roster-read]", { outcome: "error", authMs, sessionMs, rosterMs, totalMs: Date.now() - startedAt });
    return handleActionError(error);
  }
}

export async function saveCourseRosterNote(input: unknown) {
  try {
    const data=z.object({sessionId:id,bookingId:id.optional(),note:z.string().trim().max(1000)}).parse(input);
    const {storeId}=await courseManager("booking.update");
    if(data.bookingId) {
      const result=await coursePrisma.courseBooking.updateMany({where:{id:data.bookingId,sessionId:data.sessionId,storeId,status:{not:"CANCELLED"}},data:{notes:data.note}});
      if(!result.count)throw new AppError("NOT_FOUND","找不到本店學員預約");
    } else {
      const result=await coursePrisma.courseSession.updateMany({where:{id:data.sessionId,storeId,cancelledAt:null},data:{teacherNote:data.note}});
      if(!result.count)throw new AppError("NOT_FOUND","找不到本店課程");
    }
    refresh();return {success:true as const};
  } catch(error) {return handleActionError(error);}
}

export async function markCourseTeacherAttendance(input: unknown) {
  try {
    const data=z.object({sessionId:id,status:z.enum(["SCHEDULED","NO_SHOW","LEAVE"]),reason:z.string().trim().max(500).default("")}).parse(input);
    const {user,storeId}=await courseManager("booking.update");
    await courseTransaction(storeId,async(tx)=>{
      const existing=await tx.courseSession.findFirst({where:{id:data.sessionId,storeId,cancelledAt:null},select:{id:true,teacherAttendance:true,teacherAttendanceReason:true,teacherAttendanceAt:true,teacherAttendanceById:true}});
      if(!existing)throw new AppError("NOT_FOUND","找不到本店課程");
      const result=await tx.courseSession.updateMany({where:{id:data.sessionId,storeId,teacherAttendance:existing.teacherAttendance},data:{teacherAttendance:data.status,teacherAttendanceReason:data.status==="SCHEDULED"?"":data.reason,teacherAttendanceAt:data.status==="SCHEDULED"?null:new Date(),teacherAttendanceById:data.status==="SCHEDULED"?null:user.id}});
      if(!result.count)throw new AppError("CONFLICT","老師狀態已更新，請重新整理");
      await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${user.id},'CourseSession',${data.sessionId},'COURSE_TEACHER_ATTENDANCE',${JSON.stringify({storeId,status:existing.teacherAttendance,reason:existing.teacherAttendanceReason,at:existing.teacherAttendanceAt,byId:existing.teacherAttendanceById})}::jsonb,${JSON.stringify({storeId,status:data.status,reason:data.status==="SCHEDULED"?"":data.reason,byId:user.id})}::jsonb,NOW())`;
      await syncCourseRelease(tx, storeId, data.sessionId);
    });
    refresh();return {success:true as const};
  } catch(error){return handleActionError(error);}
}

export async function markCourseCoachAttendance(input: unknown) {
  try {
    const { user, storeId } = await courseAccount({ write: true });
    const { bookingId, status } = z.object({ bookingId: id, status: z.enum(["ATTENDED", "CHECKED_IN", "NO_SHOW"]).default("ATTENDED") }).parse(input);
    const saved = await courseTransaction(storeId, async (tx) => {
      const allowed = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT b.id FROM "CourseBooking" b
        JOIN "CourseSession" s ON s.id = b."sessionId" AND s."storeId" = b."storeId"
        JOIN "StaffMemberLink" l ON l."staffId" = s."coachId" AND l."storeId" = s."storeId"
        JOIN "Staff" st ON st.id = l."staffId" AND st."storeId" = l."storeId"
        WHERE b.id = ${bookingId} AND b."storeId" = ${storeId} AND l."userId" = ${user.id} AND l."revokedAt" IS NULL AND st.status::text = 'ACTIVE' AND st."courseCoachEnabled"=true`;
      if (!allowed.length)
        throw new AppError("FORBIDDEN", "只能點名自己被授權的課程");
      return settleCourseBooking(
        tx,
        { storeId, userId: user.id, name: user.name ?? "教練" },
        bookingId,
        status,
      );
    });
    scheduleCourseLowBalanceCheck(storeId,[bookingId]);
    refresh();
    return { success: true as const, attendanceUpdates: [{ id: saved.id, status: saved.status, checkedIn: !!saved.checkedInAt, updatedAt: saved.updatedAt.toISOString() }] };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function loadCourseCustomerBookings(customerId: string, offset = 0, range: {from?:string;to?:string} = {}) {
  try {
    const { storeId } = await courseManager("customer.read");
    await courseManager("booking.read");
    const customer = await prisma.customer.findFirst({ where: { id: id.parse(customerId), storeId, mergedIntoCustomerId: null }, select: { id: true } });
    if (!customer) throw new AppError("NOT_FOUND", "找不到本店顧客");
    const skip = z.number().int().min(0).max(1000000).parse(offset);
    const bookings = await coursePrisma.courseBooking.findMany({ where: { storeId, customerId, session: { startsAt: courseHistoryRange(range) } }, include: { session: { select: { startsAt: true, nameSnapshot: true } }, card: { select: { nameSnapshot: true, expiresAt: true, unit: true } } }, orderBy: [{ session: { startsAt: "desc" } }, {id:"desc"}], skip, take: 11 });
    return { success: true as const, hasMore: bookings.length > 10, data: bookings.slice(0,10).map((b) => ({ id: b.id, name: b.session.nameSnapshot, date: b.session.startsAt.toISOString(), status: b.status, checkedIn: !!b.checkedInAt, plan: b.card?.nameSnapshot ?? "體驗（不使用方案）", expiresAt: b.card?.expiresAt.toISOString() ?? null, points: b.pointCost, unit: b.card?.unit ?? "TRIAL", notes: b.notes, operator: b.operatorName })) };
  } catch (e) { const failure=handleActionError(e);return {success:false as const,error:failure.success?"讀取失敗":failure.error}; }
}

export async function updateCourseRosterBatch(input: unknown) {
  const startedAt = Date.now();
  let authMs = 0;
  let lockWaitMs = 0;
  let validationMs = 0;
  let writeMs = 0;
  let transactionMs = 0;
  let target = "UNKNOWN";
  let count = 0;
  try {
    const data=z.object({sessionId:id,target:z.enum(["CHECKED_IN","ATTENDED","NO_SHOW","RESERVED"]),noShowChoice:z.enum(["DEDUCTED","DEDUCTED_WITH_MAKEUP"]).optional(),bookings:z.array(z.object({id,status:z.enum(["RESERVED","ATTENDED","NO_SHOW","CANCELLED"])})).min(1).max(200)}).parse(input);
    if(new Set(data.bookings.map(b=>b.id)).size!==data.bookings.length) throw new AppError("VALIDATION","學員不可重複");
    target = data.target;
    count = data.bookings.length;
    const {user,storeId}=await courseManager("booking.update");
    authMs = Date.now() - startedAt;
    // Start this independent lookup before the transaction so it does not add
    // another database round trip after attendance has already been saved.
    const musicLookup = prisma.storeFeatureEntitlement.findFirst({
      where: { storeId, featureKey: "business.music", status: "ENABLED" },
      select: { storeId: true },
    }).then(Boolean, () => false);
    const transactionStartedAt = Date.now();
    await courseTransaction(storeId,async tx=>{
      const transactionWorkAt = Date.now();
      lockWaitMs = transactionWorkAt - transactionStartedAt;
      const session=await tx.courseSession.findFirst({where:{id:data.sessionId,storeId,cancelledAt:null}});
      if(!session)throw new AppError("NOT_FOUND","找不到可點名的本店課次");
      const count=await tx.courseBooking.count({where:{storeId,sessionId:data.sessionId,id:{in:data.bookings.map(b=>b.id)},...(data.target==="RESERVED"?{OR:[{status:{not:"CANCELLED"}},{status:"CANCELLED",absenceKind:{in:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"]}}]}:{status:data.target==="CHECKED_IN"?"RESERVED":{not:"CANCELLED"}})}});
      if(count!==data.bookings.length)throw new AppError("CONFLICT","名單或狀態已變更，請重新核對");
      validationMs = Date.now() - transactionWorkAt;
      const writeStartedAt = Date.now();
      const actor={storeId,userId:user.id,name:user.name??"店長"};
      for(const booking of data.bookings){
        if(data.target==="CHECKED_IN")await settleCourseBooking(tx,actor,booking.id,"CHECKED_IN");
        else if(data.target==="NO_SHOW"&&booking.status==="RESERVED")await settleCourseBooking(tx,actor,booking.id,"NO_SHOW",data.noShowChoice);
        else await correctCourseAttendance(tx,actor,booking.id,data.target,booking.status);
      }
      writeMs = Date.now() - writeStartedAt;
    });
    transactionMs = Date.now() - transactionStartedAt;
    if(data.target!=="CHECKED_IN")scheduleCourseLowBalanceCheck(storeId,data.bookings.map(b=>b.id));
    const refreshStartedAt = Date.now();
    if (!(await musicLookup)) refresh();
    const refreshMs = Date.now() - refreshStartedAt;
    console.info("[course-roster-batch]", { outcome: "success", target, count, authMs, lockWaitMs, validationMs, writeMs, transactionMs, refreshMs, totalMs: Date.now() - startedAt });
    return {success:true as const};
  }catch(error){
    console.info("[course-roster-batch]", { outcome: "error", target, count, authMs, lockWaitMs, validationMs, writeMs, transactionMs, totalMs: Date.now() - startedAt });
    return handleActionError(error);
  }
}

/** One transaction for the manager's day-wide leave/attendance list. */
export async function updateCourseDailyAttendanceBatch(input: unknown) {
  try {
    const data=z.object({
      target:z.enum(["RESERVED","ATTENDED","NO_SHOW"]),
      bookings:z.array(z.object({id,status:z.enum(["RESERVED","CANCELLED"]),sessionId:id})).min(1).max(200),
    }).parse(input);
    if(new Set(data.bookings.map(b=>b.id)).size!==data.bookings.length)throw new AppError("VALIDATION","學員不可重複");
    if(data.bookings.some(b=>data.target==="RESERVED" ? b.status!=="CANCELLED" : b.status!=="RESERVED"))throw new AppError("VALIDATION","請重新核對待處理名單");
    const {user,storeId}=await courseManager("booking.update");
    await courseTransaction(storeId,async tx=>{
      const sessionIds=[...new Set(data.bookings.map(b=>b.sessionId))];
      const sessions=await tx.courseSession.findMany({where:{id:{in:sessionIds},storeId,cancelledAt:null},select:{id:true,endsAt:true}});
      if(sessions.length!==sessionIds.length)throw new AppError("CONFLICT","課程已變更，請重新核對名單");
      if(data.target==="NO_SHOW" && sessions.some(session=>session.endsAt>new Date()))throw new AppError("VALIDATION","課程尚未結束，不能記錄曠課");
      const current=await tx.courseBooking.findMany({where:{storeId,id:{in:data.bookings.map(b=>b.id)}},select:{id:true,sessionId:true,status:true,absenceKind:true}});
      if(current.length!==data.bookings.length || data.bookings.some(b=>{
        const found=current.find(item=>item.id===b.id);
        return !found || found.sessionId!==b.sessionId || found.status!==b.status || (b.status==="CANCELLED" && !["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(found.absenceKind??""));
      }))throw new AppError("CONFLICT","名單或狀態已變更，請重新核對");
      const actor={storeId,userId:user.id,name:user.name??"店長"};
      for(const booking of data.bookings){
        if(data.target==="NO_SHOW")await settleCourseBooking(tx,actor,booking.id,"NO_SHOW","DEDUCTED");
        else await correctCourseAttendance(tx,actor,booking.id,data.target,booking.status);
      }
    });
    scheduleCourseLowBalanceCheck(storeId,data.bookings.map(b=>b.id));
    refresh();return {success:true as const};
  }catch(error){return handleActionError(error);}
}

export async function saveCourseLeaveNote(input: unknown) {
  try {
    const data=z.object({bookingId:id,note:z.string().trim().max(1000)}).parse(input);
    const {user,storeId}=await courseManager("booking.update");
    await courseTransaction(storeId,async tx=>{
      const booking=await tx.courseBooking.findFirst({where:{id:data.bookingId,storeId,status:"CANCELLED",absenceKind:{in:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"]}},select:{id:true,notes:true}});
      if(!booking)throw new AppError("CONFLICT","請假狀態已變更，請重新核對");
      if(booking.notes===data.note)return;
      await tx.courseBooking.update({where:{id:booking.id},data:{notes:data.note}});
      await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${user.id},'CourseBooking',${booking.id},'COURSE_LEAVE_NOTE',${JSON.stringify({storeId,note:booking.notes})}::jsonb,${JSON.stringify({note:data.note})}::jsonb,NOW())`;
    });
    refresh();return {success:true as const};
  }catch(error){return handleActionError(error);}
}

export async function loadMusicJoinOptions(planId:string) {
  try {
    id.parse(planId);
    const {storeId}=await courseManager("wallet.create");
    const plan=await coursePrisma.coursePointPlan.findFirst({where:{id:planId,storeId,isActive:true}});
    if(!plan || plan.musicTerms!==1 || plan.templateIds.length!==1)return {success:true as const,options:[]};
    const template=await coursePrisma.courseTemplate.findFirst({where:{id:plan.templateIds[0],storeId,classType:"GROUP"}});
    if(!template?.musicTermLessons)return {success:true as const,options:[]};
    const sessions=await coursePrisma.courseSession.findMany({where:{storeId,templateId:template.id,cancelledAt:null,startsAt:{gte:new Date()}},orderBy:{startsAt:"asc"},take:200,select:{id:true,startsAt:true,requestIndex:true,requestKey:true}});
    const size=template.musicTermLessons;
    const options=sessions.filter(first=>{
      const end=(Math.floor(first.requestIndex/size)+1)*size;
      return sessions.filter(s=>s.requestKey===first.requestKey&&s.requestIndex>=first.requestIndex&&s.requestIndex<end).length===end-first.requestIndex;
    }).map(first=>({id:first.id,startsAt:first.startsAt.toISOString(),remaining:size-first.requestIndex%size}));
    return {success:true as const,options};
  }catch(error){return handleActionError(error);}
}
