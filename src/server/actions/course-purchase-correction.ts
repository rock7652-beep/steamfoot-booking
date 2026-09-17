"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWritablePermission } from "@/lib/permissions";
import { handleActionError } from "@/lib/errors";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import { editCoursePurchaseInTransaction, voidCoursePurchaseInTransaction } from "@/server/services/course-purchase-correction";
const base = z.object({ purchaseId: z.string().min(1).max(100), reason: z.string().trim().min(1, "請填寫原因").max(500) });
function refresh() { for (const path of ["/dashboard/revenue", "/dashboard/cashbook", "/dashboard/courses", "/book"]) revalidatePath(path); }
export async function voidCoursePurchase(input: unknown) {
  try {
    const data = base.parse(input);
    await requireWritablePermission("transaction.void");
    const { storeId, user } = await courseManager("transaction.void");
    await courseTransaction(storeId, (tx) => voidCoursePurchaseInTransaction(tx, { storeId, userId: user.id }, data));
    refresh(); return { success: true as const };
  } catch (e) { return handleActionError(e); }
}
export async function editCoursePurchase(input: unknown) {
  try {
    const data = base.extend({ note: z.string().trim().max(500), revenueStaffId: z.string().min(1).max(100).nullable() }).parse(input);
    await requireWritablePermission("transaction.create");
    const { storeId, user } = await courseManager("transaction.create");
    await courseTransaction(storeId, (tx) => editCoursePurchaseInTransaction(tx, { storeId, userId: user.id }, data));
    refresh(); return { success: true as const };
  } catch (e) { return handleActionError(e); }
}
