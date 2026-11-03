import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

/** Store-owned event, written in the same transaction as the business change.
 * It carries only a reference: readers resolve current data with their own grants.
 * A retry never reopens or duplicates an already handled event. */
export async function recordDigitalManagerNotice(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  input: { storeId: string; eventKey: string; eventType: "VIP_INTEREST" | "DIGITAL_BUTLER_LEAD_CREATED" | "HUMAN_SUPPORT_REQUESTED" | "TRANSFER_PENDING_CONFIRMATION" | "HUMAN_SUPPORT_FINAL_REMINDER" | "INCOMPLETE_SERVICE_REMINDER" | "DAILY_ACTION_DIGEST"; targetId: string },
) {
  if (!input.storeId || !input.eventKey || !input.targetId) throw new Error("Invalid digital manager notice");
  if(input.eventType==='HUMAN_SUPPORT_FINAL_REMINDER')return tx.$executeRaw`WITH superseded AS (
    UPDATE public."DigitalManagerNotice" SET "handledAt"=now(),"handledById"='system',"handledByName"='系統',revision=revision+1,"updatedAt"=now()
    WHERE "storeId"=${input.storeId} AND "targetId"=${input.targetId} AND "eventType"='HUMAN_SUPPORT_REQUESTED' AND "handledAt" IS NULL
  ) INSERT INTO public."DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId")
    VALUES (${randomUUID()},${input.storeId},${input.eventKey},${input.eventType},${input.targetId})
    ON CONFLICT ("storeId","eventKey") DO NOTHING`;
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

/** Existing contacts keep their lead identity. A new explicit conversation can
 * request renewal again, while retries of an old conversation never supersede a newer request. */
export async function recordLeadRenewalInterest(tx:Pick<Prisma.TransactionClient,'$executeRaw'>,input:{storeId:string;leadId:string;conversationId:string}){
 const eventKey=`renewal-interest:${input.leadId}:${input.conversationId}`;
 return tx.$executeRaw`WITH created AS (
  INSERT INTO public."DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId")
  VALUES (${randomUUID()},${input.storeId},${eventKey},'VIP_INTEREST',${input.leadId})
  ON CONFLICT ("storeId","eventKey") DO NOTHING RETURNING id
 ) UPDATE public."DigitalManagerNotice" SET "handledAt"=now(),"handledById"='system',"handledByName"='系統',revision=revision+1,"updatedAt"=now()
  WHERE "storeId"=${input.storeId} AND "targetId"=${input.leadId} AND "eventType"='VIP_INTEREST'
  AND "eventKey" LIKE 'renewal-interest:%' AND "eventKey"<>${eventKey} AND "handledAt" IS NULL AND EXISTS(SELECT 1 FROM created)`;
}
