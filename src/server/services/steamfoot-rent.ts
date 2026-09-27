import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { RentTerm } from "@/lib/steamfoot-rent";

type Reader = Pick<Prisma.TransactionClient, "$queryRaw">;
export async function readRentTerms(storeId: string, staffId?: string, db: Reader = prisma) {
  // Every read is scoped to a concrete, already-authorized store.
  return db.$queryRaw<RentTerm[]>`SELECT id, "staffId", "startMonth", "endMonth",
    "cycleMonths", "monthlyAmount", enabled FROM "StaffRentTerm"
    WHERE "storeId"=${storeId} AND (${staffId ?? null}::text IS NULL OR "staffId"=${staffId ?? null})
    ORDER BY "startMonth" DESC`;
}
