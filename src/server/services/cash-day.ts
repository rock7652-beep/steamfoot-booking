import { AppError } from "@/lib/errors";
import type { Prisma } from "@prisma/client";

type CashDayClient = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;

/** Hold the drawer row until the financial write commits, and invalidate any
 * closing calculation begun before it. No session remains allowed for stores
 * without the drawer feature. Historical supplements preserve closed snapshots. */
export async function lockCashDay(
  tx: CashDayClient, storeId: string, businessDate: Date,
  options: { requireOpen?: boolean; allowClosedSupplement?: boolean } = {},
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT id,status::text FROM "CashDrawerSession"
    WHERE "storeId"=${storeId} AND "businessDate"=${businessDate} FOR UPDATE`;
  const session = rows[0];
  if (session?.status === "CLOSED") {
    if (options.allowClosedSupplement) return true;
    throw new AppError("BUSINESS_RULE", "這一天已經結帳，請使用尚未結帳的日期，或由店長依既有流程處理。");
  }
  if (!session) {
    if (options.requireOpen) throw new AppError("BUSINESS_RULE", "現金收支需先開啟該日現金抽屜。");
    return false;
  }
  await tx.$executeRaw`UPDATE "CashDrawerSession"
    SET "updatedAt"=GREATEST(clock_timestamp(),"updatedAt"+interval '1 millisecond')
    WHERE id=${session.id} AND "storeId"=${storeId}`;
  return false;
}
