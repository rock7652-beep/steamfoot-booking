"use server";
import {courseSaleSnapshot} from "@/server/services/course-sale-allocation";
import {validateCourseTerm,enrollCourseTerm} from "@/server/services/course-term";
import {scheduleCourseLowBalanceCheck} from "@/server/services/course-low-balance-schedule";
import { after } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWritablePermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import {
  courseMember,
  courseAccount,
  courseManager,
  courseTransaction,
} from "@/server/services/course-access";
import { correctCourseAttendance, settleCourseBooking } from "@/server/services/course-booking";
import { AppError, handleActionError } from "@/lib/errors";
import { addTaiwanDuration, dayRange, toLocalDateStr } from "@/lib/date-utils";
const id = z.string().min(1).max(100);
function refresh() {
  revalidatePath("/book");
  revalidatePath("/dashboard/courses");
  revalidatePath("/dashboard/plans");
  revalidatePath("/dashboard/cashbook");
  revalidatePath("/dashboard/analytics");
}
export async function saveCourseAttendance(input: unknown) {
  try {
    const data = z
      .object({
        sessionId: id,
        target: z.enum(["RESERVED", "ATTENDED", "NO_SHOW", "CHECKED_IN"]),
        bookings: z
          .array(
            z.object({
              id,
              status: z.enum(["RESERVED", "ATTENDED", "NO_SHOW"]),
            }),
          )
          .min(1)
          .max(200),
      })
      .parse(input);
    if (new Set(data.bookings.map((b) => b.id)).size !== data.bookings.length)
      throw new AppError("VALIDATION", "學員不可重複");
    const { user, storeId } = await courseAccount({ write: true });
    const attendanceUpdates = await courseTransaction(storeId, async (tx) => {
      const allowed = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT s.id FROM "CourseSession" s JOIN "StaffMemberLink" l ON l."staffId"=s."coachId" AND l."storeId"=s."storeId" JOIN "Staff" st ON st.id=l."staffId" AND st."storeId"=l."storeId" WHERE s.id=${data.sessionId} AND s."storeId"=${storeId} AND s."cancelledAt" IS NULL AND l."userId"=${user.id} AND l."revokedAt" IS NULL AND st.status::text='ACTIVE' AND st."courseCoachEnabled"=true`;
      if (!allowed.length)
        throw new AppError("FORBIDDEN", "只能點名自己被授權的課程");
      const count = await tx.courseBooking.count({
        where: {
          storeId,
          sessionId: data.sessionId,
          id: { in: data.bookings.map((b) => b.id) },
          status: data.target === "CHECKED_IN" ? "RESERVED" : { not: "CANCELLED" },
        },
      });
      if (count !== data.bookings.length)
        throw new AppError("VALIDATION", "名單已變更，請重新確認");
      const updates = [];
      for (const b of data.bookings) {
        const saved = data.target === "CHECKED_IN"
          ? await settleCourseBooking(tx, { storeId, userId: user.id, name: user.name ?? "教練" }, b.id, "CHECKED_IN")
          : await correctCourseAttendance(tx, { storeId, userId: user.id, name: user.name ?? "教練" }, b.id, data.target, b.status);
        updates.push({ id: saved.id, status: saved.status, checkedIn: !!saved.checkedInAt, updatedAt: saved.updatedAt.toISOString() });
      }
      return updates;
    });
    if (data.target !== "CHECKED_IN") scheduleCourseLowBalanceCheck(storeId,data.bookings.map(b=>b.id));
    refresh();
    return { success: true as const, attendanceUpdates };
  } catch (e) {
    return handleActionError(e);
  }
}
export async function saveCourseCoachNote(input: unknown) {
  try {
    const data = z.object({ bookingId: id, notes: z.string().max(1000), previousNotes: z.string().max(1000) }).parse(input);
    const { user, storeId } = await courseAccount({ write: true });
    await courseTransaction(storeId, async (tx) => {
      const allowed = await tx.$queryRaw<Array<{ id: string }>>`SELECT b.id FROM "CourseBooking" b JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId" JOIN "StaffMemberLink" l ON l."staffId"=s."coachId" AND l."storeId"=s."storeId" JOIN "Staff" st ON st.id=l."staffId" AND st."storeId"=l."storeId" WHERE b.id=${data.bookingId} AND b."storeId"=${storeId} AND b.status::text<>'CANCELLED' AND s."cancelledAt" IS NULL AND l."userId"=${user.id} AND l."revokedAt" IS NULL AND st.status::text='ACTIVE' AND st."courseCoachEnabled"=true`;
      if (!allowed.length) throw new AppError("FORBIDDEN", "只能編輯自己被授權課程的備註");
      const result = await tx.courseBooking.updateMany({ where: { id: data.bookingId, storeId, status: { not: "CANCELLED" }, notes: data.previousNotes }, data: { notes: data.notes } });
      if (result.count !== 1) throw new AppError("CONFLICT", "備註已由其他人更新，請保留草稿並重新核對。");
    });
    refresh();
    return { success: true as const };
  } catch (e) { return handleActionError(e); }
}
export async function purchaseCoursePlan(input: unknown) {
  try {
    const data = z
      .object({
        planId: id,
        requestKey: z.string().uuid(),
        transferLastFive: z.string().regex(/^\d{5}$/, "請填寫匯款帳號後五碼"),
      })
      .parse(input);
    const { storeId, customer } = await courseMember({ write: true });
    const config = await prisma.shopConfig.findUnique({
      where: { storeId },
      select: { bankName: true, bankAccountNumber: true },
    });
    if (!config?.bankName || !config.bankAccountNumber)
      throw new AppError("VALIDATION", "店家尚未設定收款資訊，請聯絡店家");
    const purchaseId = await courseTransaction(storeId, async (tx) => {
      const prior = await tx.coursePurchase.findUnique({
        where: { storeId_requestKey: { storeId, requestKey: data.requestKey } },
      });
      if (prior) {
        if (
          prior.customerId !== customer.id ||
          prior.planId !== data.planId ||
          prior.transferLastFive !== data.transferLastFive
        )
          throw new AppError("CONFLICT", "購買請求已使用");
        return prior.id;
      }
      const plan = await tx.coursePointPlan.findFirst({
        where: { id: data.planId, storeId, isActive: true },
      });
      if (!plan) throw new AppError("NOT_FOUND", "此方案已下架");
      const owners=await tx.$queryRaw<Array<{assignedStaffId:string|null}>>`SELECT "assignedStaffId" FROM "Customer" WHERE id=${customer.id} AND "storeId"=${storeId}`;
      const allocation=await courseSaleSnapshot(tx,storeId,plan.price,plan.storeCost,owners[0]?.assignedStaffId??null);
      const termSessionIds=await validateCourseTerm(tx,storeId,plan);
      const created = await tx.coursePurchase.create({
        data: {
          ...data,
          ...allocation,
          termSessionIds,
          storeId,
          customerId: customer.id,
          name: plan.name,
          unit: plan.unit,
          points: plan.points,
          price: plan.price,
          validDays: plan.validDays,
          templateIds: plan.templateIds,
        },
      });
      return created.id;
    });
    after(async () => {
      const {notifyCoursePurchaseManagers}=await import("@/server/services/course-manager-notifications");
      await notifyCoursePurchaseManagers(storeId,purchaseId);
    });
    refresh();
    return { success: true as const };
  } catch (e) {
    return handleActionError(e);
  }
}
export async function confirmCoursePurchase(input: unknown) {
  try {
    const { purchaseId } = z.object({ purchaseId: id }).parse(input);
    await requireWritablePermission("wallet.create");
    const { storeId, user } = await courseManager("wallet.create");
    await courseTransaction(storeId, async (tx) => {
      const order = await tx.coursePurchase.findFirst({
        where: { id: purchaseId, storeId },
      });
      if (!order) throw new AppError("NOT_FOUND", "找不到本店訂單");
      if (order.status === "CONFIRMED") return;
      if(order.termSessionIds?.length) await courseManager("booking.create");
      if (order.status !== "PENDING")
        throw new AppError("VALIDATION", "此訂單無法核帳");
      const customers = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "Customer" WHERE id=${order.customerId} AND "storeId"=${storeId} AND "mergedIntoCustomerId" IS NULL`;
      if (!customers.length)
        throw new AppError("VALIDATION", "顧客資料已變更，請先核對");
      const card = await tx.coursePointCard.create({
        data: {
          storeId,
          planId: order.planId,
          termSessionIds:order.termSessionIds,
          nameSnapshot: order.name,
          unit: order.unit,
          templateIds: order.templateIds,
          remaining: order.points,
          expiresAt: dayRange(
            addTaiwanDuration(toLocalDateStr(), order.validDays, "DAY"),
          ).end,
          requestKey: "purchase:" + order.id,
          members: { create: { customerId: order.customerId } },
          entries: {
            create: {
              kind: "GRANT",
              points: order.points,
              actorUserId: user.id,
            },
          },
        },
      });
      await enrollCourseTerm(tx,{storeId,userId:user.id,name:"店長核帳期課"},card,order.customerId);
      if (order.price > 0)
        await tx.$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"staffId","createdByUserId","updatedAt") VALUES (${"course-purchase:" + order.id},${storeId},${new Date(toLocalDateStr() + "T00:00:00Z")},'INCOME','OTHER','課程方案',${order.price},${"線上購買：" + order.name + " / " + order.id + (order.note ? " / " + order.note : "")},${order.revenueStaffId},${user.id},NOW())`;
      await tx.coursePurchase.update({
        where: { id: order.id },
        data: {
          status: "CONFIRMED",
          cardId: card.id,
          confirmedAt: new Date(),
          confirmedBy: user.id,
        },
      });
    });
    refresh();
    return { success: true as const };
  } catch (e) {
    return handleActionError(e);
  }
}
