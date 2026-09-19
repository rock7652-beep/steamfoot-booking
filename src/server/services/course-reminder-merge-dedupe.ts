import "server-only";
import type { Prisma } from "@prisma/client";

/** Preserve successful notification identities across customer merges. Caller holds store lock. */
export async function courseReminderAlreadySent(tx: Prisma.TransactionClient, storeId: string, customerId: string, eventId: (id: string) => string) {
  if ((await tx.messageLog.findUnique({ where: { id: eventId(customerId) } }))?.status === "SENT") return true;
  const aliases = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Customer" WHERE "storeId"=${storeId} AND "mergedIntoCustomerId"=${customerId}`;
  for (const alias of aliases) {
    if ((await tx.messageLog.findUnique({ where: { id: eventId(alias.id) } }))?.status === "SENT") return true;
  }
  return false;
}
