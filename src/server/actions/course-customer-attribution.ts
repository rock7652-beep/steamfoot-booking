"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { AppError, handleActionError } from "@/lib/errors";
import { updateCustomerAssignmentSchema, bulkUpdateCustomerAssignmentSchema } from "@/lib/validators/customer";
import { courseManager } from "@/server/services/course-access";
import { lockCourseStore } from "@/server/services/course-store-lock";
import type { ActionResult } from "@/types";
import { requireWritablePermission } from "@/lib/permissions";

export async function bulkAssignCourseCustomers(input: z.infer<typeof bulkUpdateCustomerAssignmentSchema>): Promise<ActionResult<{ count: number }>> {
  try {
    await requireWritablePermission("customer.assign");
    const data = bulkUpdateCustomerAssignmentSchema.parse(input);
    const { storeId, user } = await courseManager("customer.assign");
    const ids = [...new Set(data.customerIds)];
    const count = await prisma.$transaction(async tx => {
      await lockCourseStore(tx, storeId);
      const staff = await tx.staff.findFirst({ where: { id: data.assignedStaffId, storeId, status: "ACTIVE", user: { role: "OWNER", status: "ACTIVE" } }, select: { id: true } });
      if (!staff) throw new AppError("VALIDATION", "請選擇本店啟用中的店長，教練不具後台管理身分");
      const customers = await tx.customer.findMany({
        where: { id: { in: ids }, storeId, mergedIntoCustomerId: null, OR: [{ userId: null }, { user: { status: "ACTIVE" } }] },
        select: { id: true, assignedStaffId: true },
      });
      if (customers.length !== ids.length) throw new AppError("CONFLICT", "選取資料包含已停用、已合併或非本店顧客，本批未儲存，請重新核對。");
      const result = await tx.customer.updateMany({ where: { id: { in: ids }, storeId }, data: { assignedStaffId: staff.id } });
      await tx.auditLog.create({ data: { actorUserId: user.id, targetType: "Customer", targetId: storeId, action: "COURSE_BULK_ASSIGN", beforeJson: customers, afterJson: { customerIds: ids, assignedStaffId: staff.id } } });
      return result.count;
    });
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
    return { success: true, data: { count } };
  } catch (error) { return handleActionError(error); }
}

export async function saveCourseCustomerAttribution(input: z.infer<typeof updateCustomerAssignmentSchema>): Promise<ActionResult<void>> {
  try {
    const data = updateCustomerAssignmentSchema.parse(input);
    const { storeId } = await courseManager("customer.assign");
    await prisma.$transaction(async tx => {
      const customer = await tx.customer.findFirst({ where: { id: data.customerId, storeId, mergedIntoCustomerId: null }, select: { id: true } });
      if (!customer) throw new AppError("NOT_FOUND", "找不到本店顧客");
      const staff = await tx.staff.findFirst({
        where: { id: data.assignedStaffId, storeId, status: "ACTIVE", user: { role: "OWNER", status: "ACTIVE" } }, select: { id: true },
      });
      if (!staff) throw new AppError("VALIDATION", "請選擇本店啟用中的店長，教練不具後台管理身分");
      const sponsorId = data.referredByCustomerId ?? null;
      if (sponsorId) {
        if (sponsorId === customer.id) throw new AppError("VALIDATION", "引薦人不可為本人");
        const sponsor = await tx.customer.findFirst({ where: { id: sponsorId, storeId, mergedIntoCustomerId: null }, select: { id: true } });
        if (!sponsor) throw new AppError("VALIDATION", "引薦人必須是本店顧客，教練需先綁定會員身份");
      }
      await tx.customer.update({ where: { id: customer.id, storeId }, data: { assignedStaffId: staff.id, sponsorId } });
    });
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard");
    return { success: true, data: undefined };
  } catch (error) { return handleActionError(error); }
}

export async function searchCourseReferrerCandidates(
  query: string,
  excludeCustomerId?: string,
): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      phoneMasked: string;
      kind: "CUSTOMER" | "COACH";
      kindLabel: string;
    }>
  >
> {
  try {
    const { storeId } = await courseManager("customer.read");
    const q = z.string().trim().max(100).parse(query);
    if (!q) return { success: true, data: [] };
    const digits = normalizePhone(q);

    const [customers, coaches] = await Promise.all([
      prisma.customer.findMany({
        where: {
          storeId,
          mergedIntoCustomerId: null,
          ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            ...(/\d/.test(q) && digits ? [{ phone: { contains: digits } }] : []),
          ],
        },
        select: { id: true, name: true, phone: true, userId: true, identityLinks: { select: { userId: true } } },
        orderBy: { name: "asc" },
        take: 10,
      }),
      prisma.staff.findMany({
        where: {
          storeId,
          status: "ACTIVE",
          courseCoachEnabled: true,
          OR: [
            { displayName: { contains: q, mode: "insensitive" } },
            ...(/\d/.test(q) && digits ? [{ phone: { contains: digits } }] : []),
          ],
        },
        select: {
          id: true,
          displayName: true,
          phone: true,
          memberLink: { select: { userId: true, revokedAt: true } },
        },
        orderBy: { displayName: "asc" },
        take: 10,
      }),
    ]);

    const coachUserIds = coaches
      .flatMap((coach) =>
        coach.memberLink && !coach.memberLink.revokedAt ? [coach.memberLink.userId] : [],
      );

    const linkedCoachCustomers = coachUserIds.length
      ? await prisma.customer.findMany({
          where: {
            storeId,
            mergedIntoCustomerId: null,
            ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
            OR: [
              { userId: { in: coachUserIds } },
              { identityLinks: { some: { userId: { in: coachUserIds } } } },
            ],
          },
          select: {
            id: true,
            name: true,
            phone: true,
            userId: true,
            identityLinks: { select: { userId: true } },
          },
        })
      : [];

    const byCustomerId = new Map<
      string,
      {
        id: string;
        name: string;
        phoneMasked: string;
        kind: "CUSTOMER" | "COACH";
        kindLabel: string;
      }
    >();

    const maskPhone = (phone: string) =>
      phone.length > 7
        ? `${phone.slice(0, 4)}•••${phone.slice(-3)}`
        : phone;

    for (const person of customers) {
      byCustomerId.set(person.id, {
        id: person.id,
        name: person.name,
        phoneMasked: maskPhone(person.phone),
        kind: "CUSTOMER",
        kindLabel: "顧客",
      });
    }

    for (const coach of coaches) {
      const userId =
        coach.memberLink && !coach.memberLink.revokedAt
          ? coach.memberLink.userId
          : null;
      if (!userId) continue;
      const customer = linkedCoachCustomers.find(
        (person) =>
          person.userId === userId ||
          person.identityLinks.some((link) => link.userId === userId),
      );
      if (!customer) continue;
      byCustomerId.set(customer.id, {
        id: customer.id,
        name: coach.displayName || customer.name,
        phoneMasked: maskPhone(coach.phone || customer.phone),
        kind: "COACH",
        kindLabel: "教練",
      });
    }

    return {
      success: true,
      data: [...byCustomerId.values()].slice(0, 10),
    };
  } catch (error) {
    return handleActionError(error);
  }
}
