"use server";
import { z } from "zod";
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
  cardId: id,
  customerId: id,
  requestKey: z.string().uuid(),
});

export async function saveCourseCustomer(input: unknown) {
  try {
    const data = z
      .object({
        id: id.optional(),
        name: z.string().trim().min(1).max(80),
        phone: z.string().trim().max(30).default(""),
      })
      .parse(input);
    const { storeId } = await courseManager(
      data.id ? "customer.update" : "customer.create",
    );
    if (data.id) {
      const result = await prisma.customer.updateMany({
        where: { id: data.id, storeId, mergedIntoCustomerId: null },
        data: { name: data.name, phone: data.phone },
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
          data: { storeId, name: data.name, phone: data.phone },
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
      })
      .parse(input);
    const { storeId } = await courseManager("plans.edit");
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
    await reserveCourse(
      { userId: user.id, storeId, name: user.name ?? "店長" },
      bookingInput.parse(input),
    );
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function createMemberCourseBooking(input: unknown) {
  try {
    const { user, storeId, customer } = await courseMember();
    await reserveCourse(
      {
        userId: user.id,
        storeId,
        name: customer.name,
        customerId: customer.id,
      },
      bookingInput.parse(input),
    );
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
        status: z.enum(["CANCELLED", "ATTENDED"]),
        member: z.boolean().default(false),
      })
      .parse(input);
    let actor: CourseActor;
    if (data.member) {
      const { user, storeId, customer } = await courseMember();
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
    await courseTransaction(actor.storeId, (tx) =>
      settleCourseBooking(tx, actor, data.bookingId, data.status),
    );
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
      for (const b of bookings)
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
    const [roster, cards] = await Promise.all([
      getCourseRoster(storeId, sessionId),
      canCreate ? getCourseCards(storeId) : [],
    ]);
    return {
      success: true as const,
      data: {
        roster,
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
    const { user, storeId } = await courseAccount();
    const { bookingId } = z.object({ bookingId: id }).parse(input);
    await courseTransaction(storeId, async (tx) => {
      const allowed = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT b.id FROM "CourseBooking" b
        JOIN "CourseSession" s ON s.id = b."sessionId" AND s."storeId" = b."storeId"
        JOIN "StaffMemberLink" l ON l."staffId" = s."coachId" AND l."storeId" = s."storeId"
        JOIN "Staff" st ON st.id = l."staffId" AND st."storeId" = l."storeId"
        WHERE b.id = ${bookingId} AND b."storeId" = ${storeId} AND l."userId" = ${user.id} AND l."revokedAt" IS NULL AND st.status::text = 'ACTIVE'`;
      if (!allowed.length)
        throw new AppError("FORBIDDEN", "只能點名自己被授權的課程");
      await settleCourseBooking(
        tx,
        { storeId, userId: user.id, name: user.name ?? "教練" },
        bookingId,
        "ATTENDED",
      );
    });
    refresh();
    return { success: true as const };
  } catch (e) {
    return handleActionError(e);
  }
}
