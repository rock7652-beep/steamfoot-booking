"use server";
import { courseManager } from "@/server/services/course-access";
import { coursePrisma } from "@/lib/course-db";
import { toLocalDateStr } from "@/lib/date-utils";
import { handleActionError } from "@/lib/errors";

export async function getCourseCheckoutCashStatus() {
  try {
    const { storeId } = await courseManager("transaction.create");
    await courseManager("wallet.create");
    const day = new Date(toLocalDateStr() + "T00:00:00Z");
    const rows = await coursePrisma.$queryRaw<Array<{status:string}>>`SELECT status::text FROM "CashDrawerSession" WHERE "storeId"=${storeId} AND "businessDate"=${day}`;
    return { success: true as const, status: rows[0]?.status ?? null };
  } catch (error) {
    const result = handleActionError(error);
    return { success: false as const, error: result.success ? "無法確認現金抽屜" : result.error };
  }
}
