"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  courseManager,
  courseTransaction,
} from "@/server/services/course-access";
import { handleActionError } from "@/lib/errors";
export async function saveCourseSettings(input: unknown) {
  try {
    const { storeId } = await courseManager("business_hours.manage");
    const d = z
      .object({
        name: z.string().trim().min(1).max(100),
        bookingLeadMinutes: z.number().int().min(0).max(43200),
        cancellationLeadMinutes: z.number().int().min(0).max(43200),
      })
      .parse(input);
    await courseTransaction(storeId, async (tx) => {
      await tx.$executeRaw`UPDATE "Store" SET name = ${d.name}, "updatedAt" = NOW() WHERE id = ${storeId}`;
      const rules = {
        bookingLeadMinutes: d.bookingLeadMinutes,
        cancellationLeadMinutes: d.cancellationLeadMinutes,
      };
      await tx.courseBookingRule.upsert({
        where: { storeId },
        create: { storeId, ...rules },
        update: rules,
      });
    });
    revalidatePath("/dashboard", "layout");
    revalidatePath("/book");
    return { success: true as const };
  } catch (e) {
    return handleActionError(e);
  }
}
