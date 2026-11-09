import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { ReferralDatabase, ReferralSql } from "./repository";

function adapter(client:Pick<Prisma.TransactionClient,"$queryRawUnsafe">):ReferralSql {
  return {query: <T extends object>(text:string,values:unknown[]=[])=>client.$queryRawUnsafe<T[]>(text,...values)};
}
export const referralDatabase:ReferralDatabase={
  ...adapter(prisma),
  transaction:work=>prisma.$transaction(tx=>work(adapter(tx)),{maxWait:5000,timeout:15000}),
};
/** Disabled by default. Existing previews/production never create missing tables. */
export async function subscriptionReferralsReady():Promise<boolean> {
  if(process.env.SUBSCRIPTION_REFERRALS_ENABLED!=="true"||process.env.CONSULTATION_HQ_ENABLED!=="true")return false;
  try{
    // Reading every used field checks table presence, column compatibility and backend grants.
    await referralDatabase.query(`SELECT c."storeId",c.code,r.id,r."sourceLeadId",r."boundAt",r."identityReview",p."settledAt",p."activatedAt",p."receiptRef",v."checkedAt",v.refunded,w.state,w.days,w."newExpiresOn" FROM "StoreSubscriptionReferralCode" c LEFT JOIN "StoreSubscriptionReferral" r ON false LEFT JOIN "StoreSubscriptionReferralPayment" p ON false LEFT JOIN "StoreSubscriptionReferralRefundReview" v ON false LEFT JOIN "StoreSubscriptionReferralReward" w ON false LIMIT 0`);
    const privileges=await referralDatabase.query<{ready:boolean}>(`SELECT bool_and(has_table_privilege(current_user,name,'SELECT') AND has_table_privilege(current_user,name,'INSERT') AND (NOT needs_update OR has_table_privilege(current_user,name,'UPDATE'))) AS ready FROM (VALUES ('public."StoreSubscriptionReferralCode"',false),('public."StoreSubscriptionReferral"',true),('public."StoreSubscriptionReferralPayment"',false),('public."StoreSubscriptionReferralRefundReview"',false),('public."StoreSubscriptionReferralReward"',true)) AS required(name,needs_update)`);
    return privileges[0]?.ready===true;
  }catch{return false;}
}
export async function requireSubscriptionReferralsReady() {
  if(!await subscriptionReferralsReady())throw new Error("推薦活動尚未開通或資料表尚未就緒，原有資料未變更");
}
