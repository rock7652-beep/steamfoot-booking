import "server-only";
import { Prisma } from "@prisma/client";
import { musicRetirementEnabled, musicRetirementManifest } from "@/lib/music-retirement";
/** Fixed source literals only; no private identity list is transmitted to source control. */
export function musicRetirementSql(storeId: string, model: string, column = "id") {
  if (storeId !== musicRetirementManifest.storeId || !musicRetirementEnabled()) return Prisma.empty;
  if (!/^(?:[a-z]+\.)?(?:id|"(?:customerId|cardId|sessionId|purchaseId|bookingId)")$/.test(column)) throw new Error("Invalid archive SQL column");
  return Prisma.sql`AND NOT EXISTS (SELECT 1 FROM "MusicOperationalArchive" retirement_archive
    WHERE retirement_archive."storeId"=${storeId} AND retirement_archive."batchId"=${musicRetirementManifest.batchId}
      AND retirement_archive."entityType"=${model} AND retirement_archive."rowKey"=${Prisma.raw(column)})`;
}
