import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { planActivationMessage, planActivationSettingId, type PlanActivationSnapshot } from "@/lib/plan-activation-notification";

type Tx = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
export async function getPlanActivationEnabled(storeId: string) {
  return (await prisma.messageTemplate.findUnique({where:{id:planActivationSettingId(storeId)},select:{body:true}}))?.body === "enabled";
}
/** Same transaction as issuance; never called by imports, corrections or balance grants. */
export async function enqueuePlanActivation(tx: Tx, value: {
  storeId:string; customerId:string; module:"STEAMFOOT"|"COURSE"|"BEAUTY"; sourceId:string; entitlementId:string;
  planName:string; quantity:number; unit:string; expiresDate:string|null;
}) {
  const {storeId,customerId,module,sourceId,entitlementId}=value;
  // Beauty may use an isolated database; its customer-facing preferences live in the main database.
  const enabled = module === "BEAUTY" ? await getPlanActivationEnabled(storeId) :
    (await tx.$queryRaw<Array<{body:string}>>`SELECT body FROM "MessageTemplate" WHERE id=${planActivationSettingId(storeId)} AND "storeId"=${storeId} FOR SHARE`)[0]?.body === "enabled";
  const [person] = await tx.$queryRaw<Array<{customerName:string;storeName:string}>>`SELECT c.name AS "customerName",s.name AS "storeName" FROM "Customer" c JOIN "Store" s ON s.id=c."storeId" WHERE c.id=${customerId} AND c."storeId"=${storeId} AND c."mergedIntoCustomerId" IS NULL`;
  if (!person) throw new Error("Plan activation customer does not belong to store");
  const snapshot:PlanActivationSnapshot={...person,planName:value.planName,quantity:value.quantity,unit:value.unit,expiresDate:value.expiresDate};
  const reason=!enabled?"方案開通時通知未開啟，不補發":isPreviewExternalIntegrationBlocked()?"隔離預覽不向外發送 LINE":module==="BEAUTY"&&(process.env.BEAUTY_MODULE_ENABLED!=="1"||process.env.BEAUTY_NOTIFICATIONS_ENABLED!=="1")?"美業通知未開啟，不補發":null;
  await tx.$executeRaw`INSERT INTO "PlanActivationNotification" (id,"storeId","customerId",module,"sourceId","entitlementId",snapshot,body,status,"errorMessage","retryKey") VALUES (${randomUUID()},${storeId},${customerId},${module},${sourceId},${entitlementId},${JSON.stringify(snapshot)}::jsonb,${planActivationMessage(snapshot)},${reason?"SKIPPED":"PENDING"},${reason},${randomUUID()}) ON CONFLICT ("storeId",module,"entitlementId") DO NOTHING`;
}
