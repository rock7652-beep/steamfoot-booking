"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWritablePermission } from "@/lib/permissions";
import { handleActionError } from "@/lib/errors";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import { refundUnusedCoursePurchase } from "@/server/services/course-refund";

export async function refundCoursePurchase(input: unknown) {
  try {
    const data = z.object({
      purchaseId: z.string().min(1).max(100),
      reason: z.string().trim().min(1, "請填寫退款原因").max(1000),
      requestKey: z.string().uuid(),
      amount: z.number().int().positive().max(2147483647),
      method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]),
      expectedRemaining: z.number().int().min(0),
      expectedRefundedAmount: z.number().int().min(0),
    }).parse(input);
    await requireWritablePermission("transaction.refund");
    const { user, storeId } = await courseManager("transaction.refund");
    const refund = await courseTransaction(storeId, (tx) =>
      refundUnusedCoursePurchase(tx, { storeId, userId: user.id }, data));
    for (const path of ["/dashboard/revenue", "/dashboard/courses", "/dashboard/cashbook", "/book"])
      revalidatePath(path);
    return { success: true as const, refundId: refund.id };
  } catch (error) { return handleActionError(error); }
}
