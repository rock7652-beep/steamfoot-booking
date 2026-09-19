"use server";
import {scheduleCourseLowBalanceCheck} from "@/server/services/course-low-balance-schedule";
import { after } from "next/server";
import { z } from "zod";
import { updateCustomerSchema } from "@/lib/validators/customer";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { AppError, handleActionError } from "@/lib/errors";
import { dayRange, parseTaipeiDateTime } from "@/lib/date-utils";
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
  type CourseActor,
} from "@/server/services/course-booking";

const id = z.string().min(1).max(100);
function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/courses");
  revalidatePath("/book");
}
const bookingInput = z.object({
  sessionId: id,
  notes: z.string().trim().max(1000).default(""),
  cardId: id,
  customerId: id,
  requestKey: z.string().uuid(),
});

export async function saveCourseCustomer(input: unknown) {
  try {
    const data = updateCustomerSchema.pick({ name: true, phone: true, email: true, gender: true, birthday: true, height: true, lineName: true, serviceNote: true }).extend({ id: id.optional(), emergencyContactName: z.string().trim().max(100).nullable().optional(), emergencyContactPhone: z.string().trim().max(30).nullable().optional(), address: z.string().trim().max(300).nullable().optional(), notes: z.string().trim().max(1000).nullable().optional() }).parse(input);
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
    if (data.id) {
      const result = await prisma.customer.updateMany({
        where: { id: data.id, storeId, mergedIntoCustomerId: null },
        data: profile,
      });
      if (!result.count) throw new AppError("NOT_FOUND", "找不到本店顧客");
    } else {
      const { getStoreLimitsByStoreId } = await import("@/lib/feature-gate");
      const limits = await getStoreLimitsByStoreId(storeId);
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
        const count = await tx.customer.count({
          where: { storeId, mergedIntoCustomerId: null },
        });
        if (limits.maxCustomers !== null && count >= limits.maxCustomers)
          throw new AppError("FORBIDDEN", "已達方案顧客額度上限");
        await tx.customer.create({
          data: { storeId, ...profile },
        });
      });
    }
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function saveCoursePointPlan(input: unknown) {
  try {
    const { id: planId, ...data } = z
      .object({
        id: id.optional(),
        name: z.string().trim().min(1).max(80),
        points: z.number().int().min(1).max(100000),
        price: z.number().int().min(0).max(10000000),
        validDays: z.number().int().min(1).max(3650),
        isActive: z.boolean().default(true),
        unit: z.enum(["POINT", "SESSION"]).default("POINT"),
        templateIds: z.array(id).max(200).default([]),
      })
      .parse(input);
    const { storeId } = await courseManager("plans.edit");
    if (data.templateIds.length && await coursePrisma.courseTemplate.count({ where: { storeId, id: { in: data.templateIds } } }) !== new Set(data.templateIds).size) throw new AppError("VALIDATION", "適用課程必須屬於本店");
    if (planId) {
      const result = await coursePrisma.coursePointPlan.updateMany({
        where: { id: planId, storeId },
        data,
      });
      if (!result.count) throw new AppError("NOT_FOUND", "找不到本店方案");
    } else
      await coursePrisma.coursePointPlan.create({ data: { ...data, storeId } });
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
    await courseTransaction(storeId, async (tx) => {
      const prior = await tx.coursePointCard.findUnique({
        where: { storeId_requestKey: { storeId, requestKey: data.requestKey } },
        include: { members: true },
      });
      if (prior) {
        if (
          prior.planId !== data.planId ||
          !prior.members.some((m) => m.customerId === data.customerId) ||
          prior.expiresAt.getTime() !== dayRange(data.expiresDate).end.getTime()
        )
          throw new AppError("CONFLICT", "方案指派請求已使用");
        return;
      }
      const plan = await tx.coursePointPlan.findFirst({
        where: { id: data.planId, storeId, isActive: true },
      });
      const customers = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "Customer" WHERE id = ${data.customerId} AND "storeId" = ${storeId} AND "mergedIntoCustomerId" IS NULL`;
      const expiresAt = dayRange(data.expiresDate).end;
      if (!plan || !customers.length || expiresAt < new Date())
        throw new AppError("VALIDATION", "請選擇本店方案、顧客及有效期限");
      await tx.coursePointCard.create({
        data: {
          storeId,
          planId: plan.id,
          nameSnapshot: plan.name,
          unit: plan.unit,
          templateIds: plan.templateIds,
          remaining: plan.points,
          expiresAt,
          requestKey: data.requestKey,
          members: { create: { customerId: data.customerId } },
          entries: {
            create: {
              kind: "GRANT",
              points: plan.points,
              actorUserId: user.id,
            },
          },
        },
      });
    });
    refresh();
    return { success: true as const };
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
      });
      if (!card) throw new AppError("NOT_FOUND", "找不到本店方案");
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
        status: z.enum(["CANCELLED", "ATTENDED", "CHECKED_IN", "NO_SHOW"]),
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
      if (!data.member && data.status === "CANCELLED") {
        const booking = await tx.courseBooking.findFirst({where:{id:data.bookingId,storeId:actor.storeId},select:{bookingKind:true}});
        if (booking?.bookingKind === "TRIAL") await courseManager("trial.cancel");
      }
      return settleCourseBooking(tx, actor, data.bookingId, data.status);
    });
    scheduleCourseLowBalanceCheck(actor.storeId,[data.bookingId]);
    refresh();
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

export async function loadCourseSessionDetail(sessionId: string) {
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
    const session = await coursePrisma.courseSession.findFirst({ where: { id: sessionId, storeId }, select: { startsAt: true, pointCost: true } });
    if (!session) throw new AppError("NOT_FOUND", "找不到本店課程");
    const [roster, cards] = await Promise.all([
      getCourseRoster(storeId, sessionId),
      canCreate ? getCourseCards(storeId) : [],
    ]);
    return {
      success: true as const,
      data: {
        roster,
        trial: {
          settings: await (await import("@/lib/shop-config")).getTrialSettings(storeId),
          canCreate: canCreate && await checkPermission(user.role,user.staffId,"trial.create"),
          canCollect: await checkPermission(user.role,user.staffId,"trial.confirm"),
          canCorrect: await checkPermission(user.role,user.staffId,"transaction.void"),
          customers: canCreate && await checkPermission(user.role,user.staffId,"trial.create") ? await prisma.customer.findMany({where:{storeId,mergedIntoCustomerId:null},select:{id:true,name:true},orderBy:{name:"asc"}}) : [],
        },
        session: { startsAt: session.startsAt.toISOString(), pointCost: session.pointCost },
        cards: cards.map((card) => ({
          ...card,
          entries: canReadCards ? card.entries : [],
        })),
      },
    };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function markCourseCoachAttendance(input: unknown) {
  try {
    const { user, storeId } = await courseAccount({ write: true });
    const { bookingId, status } = z.object({ bookingId: id, status: z.enum(["ATTENDED", "CHECKED_IN", "NO_SHOW"]).default("ATTENDED") }).parse(input);
    await courseTransaction(storeId, async (tx) => {
      const allowed = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT b.id FROM "CourseBooking" b
        JOIN "CourseSession" s ON s.id = b."sessionId" AND s."storeId" = b."storeId"
        JOIN "StaffMemberLink" l ON l."staffId" = s."coachId" AND l."storeId" = s."storeId"
        JOIN "Staff" st ON st.id = l."staffId" AND st."storeId" = l."storeId"
        WHERE b.id = ${bookingId} AND b."storeId" = ${storeId} AND l."userId" = ${user.id} AND l."revokedAt" IS NULL AND st.status::text = 'ACTIVE' AND st."courseCoachEnabled"=true`;
      if (!allowed.length)
        throw new AppError("FORBIDDEN", "只能點名自己被授權的課程");
      await settleCourseBooking(
        tx,
        { storeId, userId: user.id, name: user.name ?? "教練" },
        bookingId,
        status,
      );
    });
    scheduleCourseLowBalanceCheck(storeId,[bookingId]);
    refresh();
    return { success: true as const };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function loadCourseCustomerBookings(customerId: string) {
  try {
    const { storeId } = await courseManager("customer.read");
    await courseManager("booking.read");
    const customer = await prisma.customer.findFirst({ where: { id: id.parse(customerId), storeId, mergedIntoCustomerId: null }, select: { id: true } });
    if (!customer) throw new AppError("NOT_FOUND", "找不到本店顧客");
    const bookings = await coursePrisma.courseBooking.findMany({ where: { storeId, customerId }, include: { session: { select: { startsAt: true, nameSnapshot: true } }, card: { select: { nameSnapshot: true, expiresAt: true, unit: true } } }, orderBy: { session: { startsAt: "desc" } }, take: 100 });
    return { success: true as const, data: bookings.map((b) => ({ id: b.id, name: b.session.nameSnapshot, date: b.session.startsAt.toISOString(), status: b.status, checkedIn: !!b.checkedInAt, plan: b.card?.nameSnapshot ?? "體驗（不使用方案）", expiresAt: b.card?.expiresAt.toISOString() ?? null, points: b.pointCost, unit: b.card?.unit ?? "TRIAL", notes: b.notes, operator: b.operatorName })) };
  } catch (e) { return handleActionError(e); }
}
