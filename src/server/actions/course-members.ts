"use server";
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
    let customerId = data.id ?? "";
    if (data.id) {
      const result = await prisma.customer.updateMany({
        where: { id: data.id, storeId, mergedIntoCustomerId: null },
        data: profile,
      });
      if (!result.count) throw new AppError("NOT_FOUND", "找不到本店顧客");
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
    const { id: planId, ...data } = z
      .object({
        id: id.optional(),
        name: z.string().trim().min(1).max(80),
        points: z.number().int().min(1).max(100000),
        price: z.number().int().min(0).max(10000000),
        storeCost: z.number().int().min(0).max(10000000).default(0),
        termSessionIds:z.array(id).max(52).default([]),
        validDays: z.number().int().min(1).max(3650),
        isActive: z.boolean().default(true),
        unit: z.enum(["POINT", "SESSION"]).default("POINT"),
        templateIds: z.array(id).max(200).default([]),
      })
      .parse(input);
    const { storeId } = await courseManager("plans.edit");
    if (data.templateIds.length && await coursePrisma.courseTemplate.count({ where: { storeId, id: { in: data.templateIds } } }) !== new Set(data.templateIds).size) throw new AppError("VALIDATION", "適用課程必須屬於本店");
    await courseTransaction(storeId,async tx=>{
    const previous=planId?await tx.coursePointPlan.findFirst({where:{id:planId,storeId}}):null;
    const sameTerm=previous && previous.points===data.points && previous.unit===data.unit && JSON.stringify([...previous.termSessionIds].sort())===JSON.stringify([...data.termSessionIds].sort()) && JSON.stringify([...previous.templateIds].sort())===JSON.stringify([...data.templateIds].sort());
    if(previous?.termSessionIds.length&&!sameTerm&&await tx.coursePurchase.count({where:{storeId,planId}}))throw new AppError("CONFLICT","此期課已有購買紀錄，請新增下一期方案，保留原期別課次。");
    data.termSessionIds=sameTerm?previous.termSessionIds:await validateCourseTerm(tx,storeId,data);
    if (planId) {
      const result = await tx.coursePointPlan.updateMany({
        where: { id: planId, storeId },
        data,
      });
      if (!result.count) throw new AppError("NOT_FOUND", "找不到本店方案");
    } else
      await tx.coursePointPlan.create({ data: { ...data, storeId } });
    });
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
    if (checkout.discountValue > 0) await courseManager("transaction.discount");
    await courseTransaction(storeId, async tx => {
      const plan=await tx.coursePointPlan.findFirst({where:{id:data.planId,storeId},select:{termSessionIds:true}});
      if(plan?.termSessionIds.length) await courseManager("booking.create");
      return assignCourseWithCheckout(tx, {storeId, userId:user.id}, {...data,...checkout});
    });
    for (const path of ["/dashboard/revenue", "/dashboard/cashbook", "/dashboard/cash-drawer"]) revalidatePath(path);
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
      if (!data.member && data.status === "CANCELLED") {
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
    refresh();
    return { success: true as const };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function restoreCourseBooking(input: unknown) {
  try {
    const { user, storeId } = await courseManager("booking.update");
    const data = z.object({ bookingId: id }).parse(input);
    await courseTransaction(storeId, async (tx) => {
      const booking = await tx.courseBooking.findFirst({
        where: { id: data.bookingId, storeId },
        include: { session: true, card: true },
      });
      if (!booking) throw new AppError("NOT_FOUND", "找不到本店預約");
      if (booking.status !== "CANCELLED") throw new AppError("VALIDATION", "這筆預約不是已取消狀態");
      if (booking.session.cancelledAt) throw new AppError("VALIDATION", "整堂課已取消，無法恢復個別預約");

      const [occupied, duplicate] = await Promise.all([
        tx.courseBooking.count({
          where: { storeId, sessionId: booking.sessionId, status: { not: "CANCELLED" } },
        }),
        tx.courseBooking.findFirst({
          where: {
            storeId,
            sessionId: booking.sessionId,
            customerId: booking.customerId,
            status: { not: "CANCELLED" },
            id: { not: booking.id },
          },
          select: { id: true },
        }),
      ]);
      if (duplicate) throw new AppError("CONFLICT", "這位學員已經有本堂有效預約");
      if (occupied >= booking.session.capacity) throw new AppError("CONFLICT", "課程已滿，無法恢復預約");

      if (booking.cardId && booking.card) {
        const card = booking.card;
        const now = new Date();
        if (card.closedAt) throw new AppError("VALIDATION", "原方案已退款或結清，無法恢復");
        if (card.expiresAt < now || card.expiresAt < booking.session.startsAt)
          throw new AppError("VALIDATION", "原方案已到期或不涵蓋上課日期");
        if (card.templateIds.length && !card.templateIds.includes(booking.session.templateId))
          throw new AppError("VALIDATION", "原方案已不適用這堂課");
        if (card.termSessionIds.length && !card.termSessionIds.includes(booking.session.id))
          throw new AppError("VALIDATION", "原期課方案不適用這堂課");

        const held = await tx.courseBooking.aggregate({
          where: { storeId, cardId: card.id, status: "RESERVED", id: { not: booking.id } },
          _sum: { pointCost: true },
        });
        if (card.remaining - (held._sum.pointCost ?? 0) < booking.pointCost)
          throw new AppError("CONFLICT", "原方案目前可用額度不足，無法恢復");

        await tx.$executeRaw`
          INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","afterJson","createdAt")
          VALUES (
            ${crypto.randomUUID()},
            ${user.id},
            'CourseBooking',
            ${booking.id},
            'COURSE_BOOKING_RESTORE',
            ${JSON.stringify({ status: "CANCELLED", storeId })}::jsonb,
            ${JSON.stringify({ status: "RESERVED", cardId: booking.cardId })}::jsonb,
            NOW()
          )
        `;
      }

      await tx.courseBooking.update({
        where: { id: booking.id },
        data: { status: "RESERVED", checkedInAt: null },
      });
    });
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
          customers: canCreate && await checkPermission(user.role,user.staffId,"trial.create") ? await prisma.customer.findMany({where:{storeId,mergedIntoCustomerId:null},select:{id:true,name:true,phone:true},orderBy:{name:"asc"}}) : [],
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
  try {
    const data=z.object({sessionId:id,target:z.enum(["CHECKED_IN","ATTENDED","NO_SHOW","RESERVED"]),noShowChoice:z.enum(["DEDUCTED","DEDUCTED_WITH_MAKEUP"]).optional(),bookings:z.array(z.object({id,status:z.enum(["RESERVED","ATTENDED","NO_SHOW"])})).min(1).max(200)}).parse(input);
    if(new Set(data.bookings.map(b=>b.id)).size!==data.bookings.length) throw new AppError("VALIDATION","學員不可重複");
    const {user,storeId}=await courseManager("booking.update");
    await courseTransaction(storeId,async tx=>{
      const session=await tx.courseSession.findFirst({where:{id:data.sessionId,storeId,cancelledAt:null}});
      if(!session)throw new AppError("NOT_FOUND","找不到可點名的本店課次");
      const count=await tx.courseBooking.count({where:{storeId,sessionId:data.sessionId,id:{in:data.bookings.map(b=>b.id)},status:data.target==="CHECKED_IN"?"RESERVED":{not:"CANCELLED"}}});
      if(count!==data.bookings.length)throw new AppError("CONFLICT","名單或狀態已變更，請重新核對");
      const actor={storeId,userId:user.id,name:user.name??"店長"};
      for(const booking of data.bookings){
        if(data.target==="CHECKED_IN")await settleCourseBooking(tx,actor,booking.id,"CHECKED_IN");
        else if(data.target==="NO_SHOW"&&booking.status==="RESERVED")await settleCourseBooking(tx,actor,booking.id,"NO_SHOW",data.noShowChoice);
        else await correctCourseAttendance(tx,actor,booking.id,data.target,booking.status);
      }
    });
    if(data.target!=="CHECKED_IN")scheduleCourseLowBalanceCheck(storeId,data.bookings.map(b=>b.id));
    refresh();return {success:true as const};
  }catch(error){return handleActionError(error);}
}
