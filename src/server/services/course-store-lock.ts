import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";

/** Shared by every course mutation, including cross-session shared-card spending. */
export async function lockCourseStore(tx: Pick<Prisma.TransactionClient, "$queryRaw">, storeId: string) {
  const stores = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Store" WHERE id = ${storeId} AND "industryModule"::text = 'COURSE' FOR UPDATE`;
  if (!stores.length) throw new AppError("FORBIDDEN", "此功能僅適用於課程門市");
}
