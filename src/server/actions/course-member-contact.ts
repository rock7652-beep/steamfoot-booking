"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { courseMember } from "@/server/services/course-access";

export async function saveCourseMemberContact(input: unknown) {
  try {
    const data = z.object({
      emergencyContactName: z.string().trim().max(100),
      emergencyContactPhone: z.string().trim().max(30),
    }).parse(input);
    const { storeId, customer } = await courseMember();
    const result = await prisma.customer.updateMany({
      where: { id: customer.id, storeId, mergedIntoCustomerId: null },
      data: {
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
      },
    });
    if (!result.count) throw new AppError("NOT_FOUND", "找不到本店會員資料");
    revalidatePath("/book");
    revalidatePath("/dashboard/courses");
    return { success: true as const };
  } catch (error) { return handleActionError(error); }
}
