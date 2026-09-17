"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { AppError, handleActionError } from "@/lib/errors";
import { updateCustomerAssignmentSchema } from "@/lib/validators/customer";
import { courseManager } from "@/server/services/course-access";
import type { ActionResult } from "@/types";

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
        if (sponsorId === customer.id) throw new AppError("VALIDATION", "推薦人不可為本人");
        const sponsor = await tx.customer.findFirst({ where: { id: sponsorId, storeId, mergedIntoCustomerId: null }, select: { id: true } });
        if (!sponsor) throw new AppError("VALIDATION", "推薦人必須是本店顧客");
      }
      await tx.customer.update({ where: { id: customer.id, storeId }, data: { assignedStaffId: staff.id, sponsorId } });
    });
    revalidatePath("/dashboard/courses");
    return { success: true, data: undefined };
  } catch (error) { return handleActionError(error); }
}

export async function searchCourseReferrerCandidates(query: string, excludeCustomerId?: string): Promise<ActionResult<Array<{ id: string; name: string; phoneMasked: string }>>> {
  try {
    const { storeId } = await courseManager("customer.read");
    const q = z.string().trim().max(100).parse(query);
    if (!q) return { success: true, data: [] };
    const digits = normalizePhone(q);
    const matches = await prisma.customer.findMany({
      where: {
        storeId, mergedIntoCustomerId: null,
        ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
        OR: [{ name: { contains: q, mode: "insensitive" } }, ...(/\d/.test(q) && digits ? [{ phone: { contains: digits } }] : [])],
      },
      select: { id: true, name: true, phone: true }, orderBy: { name: "asc" }, take: 10,
    });
    return { success: true, data: matches.map(person => ({ id: person.id, name: person.name, phoneMasked: person.phone.length > 7 ? `${person.phone.slice(0, 4)}•••${person.phone.slice(-3)}` : person.phone })) };
  } catch (error) { return handleActionError(error); }
}
