import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";

/** Shared by course financial and booking transactions, including cross-session shared-card spending. */
export async function lockCourseStore(tx: Pick<Prisma.TransactionClient, "$queryRaw">, storeId: string) {
  const stores = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Store" WHERE id = ${storeId} AND "industryModule"::text = 'COURSE' AND "operatingStatus"::text IN ('ACTIVE','TRIAL') FOR UPDATE`;
  if (!stores.length) throw new AppError("FORBIDDEN", "店家已暫停、停用或模組已變更");
}
