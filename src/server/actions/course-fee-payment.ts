"use server";
import { revalidatePath } from "next/cache";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import { recordCourseFeePayment, voidCourseFeePayment } from "@/server/services/course-fee-payment";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import { AppError, handleActionError } from "@/lib/errors";

export async function payCourseFee(input: unknown) {
  try {
    const {user, storeId} = await courseManager("cashbook.create");
    if (user.role !== "OWNER") throw new AppError("FORBIDDEN", "僅店長可登錄授課費付款");
    await assertStoreSubscriptionWritable(storeId);
    await courseTransaction(storeId, tx => recordCourseFeePayment(tx, {storeId, userId:user.id}, input));
    revalidatePath("/dashboard/revenue");
    revalidatePath("/dashboard/transactions");
    revalidatePath("/dashboard/cashbook");
    return {success:true as const};
  } catch (error) { return handleActionError(error); }
}

export async function correctCourseFee(input: unknown) {
  try {
    const {user, storeId} = await courseManager("cashbook.create");
    if (user.role !== "OWNER") throw new AppError("FORBIDDEN", "僅店長可更正授課費付款");
    await assertStoreSubscriptionWritable(storeId);
    await courseTransaction(storeId, tx => voidCourseFeePayment(tx, {storeId, userId:user.id}, input));
    revalidatePath("/dashboard/revenue");
    revalidatePath("/dashboard/transactions");
    revalidatePath("/dashboard/cashbook");
    return {success:true as const};
  } catch (error) { return handleActionError(error); }
}
