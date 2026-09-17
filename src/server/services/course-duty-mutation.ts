import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { assertCourseDutyCoverage } from "./course-duty";
import { prisma } from "@/lib/db";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { requireWritablePermission } from "@/lib/permissions";
import { courseManager } from "./course-access";
/** Course duty edits serialize with booking/scheduling, then validate before commit. */
export async function withDutyMutation<T>(storeId: string, work: (db: Prisma.TransactionClient, course: boolean) => Promise<T>): Promise<T> {
  if (await getStoreIndustryModule(storeId) !== "course") return work(prisma, false);
  await requireWritablePermission("duty.manage");
  const actor = await courseManager("duty.manage");
  if (actor.storeId !== storeId) throw new AppError("FORBIDDEN", "無法修改其他店家的值班");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
    const result = await work(tx, true);
    await assertCourseDutyCoverage(tx, storeId);
    return result;
  }, {timeout: 15000});
}
