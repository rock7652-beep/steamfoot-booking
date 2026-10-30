import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

/** Store-owned event, written in the same transaction as the business change.
 * It carries only a reference: readers resolve current data with their own grants.
 * A retry never reopens or duplicates an already handled event. */
export async function recordDigitalManagerNotice(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  input: { storeId: string; eventKey: string; eventType: "TRANSFER_PENDING_CONFIRMATION" | "HUMAN_SUPPORT_FINAL_REMINDER" | "INCOMPLETE_SERVICE_REMINDER" | "DAILY_ACTION_DIGEST"; targetId: string },
) {
  if (!input.storeId || !input.eventKey || !input.targetId) throw new Error("Invalid digital manager notice");
  return tx.$executeRaw`INSERT INTO public."DigitalManagerNotice"
    (id,"storeId","eventKey","eventType","targetId")
    VALUES (${randomUUID()},${input.storeId},${input.eventKey},${input.eventType},${input.targetId})
    ON CONFLICT ("storeId","eventKey") DO NOTHING`;
}

/** Completing the source operation resolves only its own store's pending notice. */
export async function resolveDigitalManagerNotice(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  input: { storeId: string; eventKey: string; actorUserId: string; actorName: string },
) {
  return tx.$executeRaw`UPDATE public."DigitalManagerNotice"
    SET "handledAt"=now(),"handledById"=${input.actorUserId},"handledByName"=${input.actorName},revision=revision+1,"updatedAt"=now()
    WHERE "storeId"=${input.storeId} AND "eventKey"=${input.eventKey} AND "handledAt" IS NULL`;
}
