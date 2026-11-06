import { randomInt, randomUUID } from "node:crypto";
import { evaluateSubscriptionReferral, planSubscriptionReferralRedemption } from "@/lib/subscription-referral-policy";
import { normalizeSubscriptionReferralCode, SUBSCRIPTION_REFERRAL_CODE_RE } from "@/lib/subscription-referral-code";
import { toLocalDateStr, parseTaiwanDateToDbDate } from "@/lib/date-utils";

export interface ReferralSql {
  query<T extends object>(text: string, values?: unknown[]): Promise<T[]>;
}
export interface ReferralDatabase extends ReferralSql {
  transaction<T>(work: (tx: ReferralSql) => Promise<T>): Promise<T>;
}
export type ReferralRecord = { id: string; referrerStoreId: string; referredStoreId: string; code: string; boundAt: Date; sourceLeadId: string; identityReview: "UNVERIFIED" | "DISTINCT" | "SAME_OPERATOR" };
type PaymentRecord = { id: string; referralId: string; subscriptionId: string; receiptRef: string; settledAt: Date; activatedAt: Date };
type ReviewRecord = { id: string; paymentId: string; checkedAt: Date; refunded: boolean; verificationRef: string };
export type RewardRecord = { id: string; referralId: string; beneficiaryStoreId: string; days: number; state: "READY" | "APPLIED"; previousExpiresOn: string | null; newExpiresOn: string | null; appliedAt: Date | null };
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function fail(message: string): never { throw new Error(message); }
async function lockSubscription(tx: ReferralSql, storeId: string) {
  // Prisma raw queries cannot deserialize PostgreSQL void (OID 2278).
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS lock", [`subscription:${storeId}`]);
}
async function requireDistinctStoreOrganizations(tx:ReferralSql,a:string,b:string) {
  const roots=await tx.query<{origin:string;root:string}>(`WITH RECURSIVE tree(origin,id,"parentStoreId") AS (SELECT id,id,"parentStoreId" FROM "Store" WHERE id=ANY($1::text[]) UNION SELECT t.origin,p.id,p."parentStoreId" FROM tree t JOIN "Store" p ON p.id=t."parentStoreId") SELECT origin,id AS root FROM tree WHERE "parentStoreId" IS NULL`,[[a,b]]);
  if(roots.length!==2||new Set(roots.map(row=>row.root)).size!==2)fail("雙方屬於同一店家組織，或組織歸屬尚未確認");
}
export async function ensureReferralCode(db: ReferralDatabase, storeId: string, actorId: string): Promise<string> {
  return db.transaction(async tx => {
    const stores = await tx.query<{ id: string }>('SELECT id FROM "Store" WHERE id=$1 AND "archivedAt" IS NULL FOR UPDATE', [storeId]);
    if (!stores.length) fail("店家不存在或已封存");
    const previous = await tx.query<{ code: string }>('SELECT code FROM "StoreSubscriptionReferralCode" WHERE "storeId"=$1', [storeId]);
    if (previous[0]) return previous[0].code;
    for (let attempt=0;attempt<5;attempt++) {
      const code = `SB-${Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join("")}`;
      const saved=await tx.query<{code:string}>('INSERT INTO "StoreSubscriptionReferralCode" ("storeId",code,"createdBy") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING code',[storeId,code,actorId]);
      if(saved[0])return saved[0].code;
    }
    return fail("推薦碼建立未完成，請重試");
  });
}
export async function validReferralCode(db: ReferralSql, raw: string): Promise<boolean> {
  const code=normalizeSubscriptionReferralCode(raw);
  if(!SUBSCRIPTION_REFERRAL_CODE_RE.test(code))return false;
  const rows=await db.query<{code:string}>('SELECT c.code FROM "StoreSubscriptionReferralCode" c JOIN "Store" s ON s.id=c."storeId" WHERE c.code=$1 AND s."archivedAt" IS NULL',[code]);
  return rows.length===1;
}
/** HQ supplies an explicitly verified store. Attribution comes only from immutable intake. */
export async function bindReferralLead(db: ReferralDatabase, actorId: string, leadId: string, storeId: string): Promise<{id:string}> {
  return db.transaction(async tx=>{
    await lockSubscription(tx,storeId);
    const lead=(await tx.query<{id:string;code:string;createdAt:Date;trialApplicationId:string|null}>('SELECT id,"originalPayload"->>\'subscriptionReferralCode\' AS code,"createdAt","trialApplicationId" FROM "ConsultationLead" WHERE id=$1 AND "originalPayload"->>\'subscriptionReferralConfirmed\'=\'true\' FOR UPDATE',[leadId]))[0];
    if(!lead?.trialApplicationId||!lead.code)fail("請先核對並關聯這筆需求的體驗申請");
    const code=normalizeSubscriptionReferralCode(lead.code);
    const inviter=(await tx.query<{storeId:string}>('SELECT c."storeId" FROM "StoreSubscriptionReferralCode" c JOIN "Store" s ON s.id=c."storeId" WHERE c.code=$1 AND s."archivedAt" IS NULL',[code]))[0];
    if(!inviter||inviter.storeId===storeId)fail("推薦碼無效或屬於同一店家");
    const store=(await tx.query<{id:string;parentStoreId:string|null}>('SELECT id,"parentStoreId" FROM "Store" WHERE id=$1 AND "archivedAt" IS NULL',[storeId]))[0];
    if(!store)fail("被推薦店家不存在或已封存");
    await requireDistinctStoreOrganizations(tx,inviter.storeId,storeId);
    const previous=(await tx.query<ReferralRecord>('SELECT * FROM "StoreSubscriptionReferral" WHERE "referredStoreId"=$1 OR "sourceLeadId"=$2',[storeId,leadId]))[0];
    if(previous){if(previous.sourceLeadId===leadId&&previous.referredStoreId===storeId&&previous.referrerStoreId===inviter.storeId)return {id:previous.id};return fail("這筆申請或店家已綁定推薦人，不能覆蓋");}
    const id=randomUUID();
    await tx.query('INSERT INTO "StoreSubscriptionReferral" (id,"referrerStoreId","referredStoreId",code,"boundAt","createdBy","sourceLeadId") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',[id,inviter.storeId,storeId,code,lead.createdAt,actorId,leadId]);
    return {id};
  });
}
export interface VerifyReferralInput {
  commandId:string; referralId:string; subscriptionId:string; receiptRef:string; settledAt:Date;
  distinctOperator:boolean; firstPaymentConfirmed:boolean; refunded:boolean; verificationRef:string;
}
/** Immutable payment evidence, append-only refund reviews, both rewards in one transaction. */
export async function verifyReferralPayment(db: ReferralDatabase, actorId:string, input:VerifyReferralInput, now:Date) {
  return db.transaction(async tx=>{
    const relation=(await tx.query<ReferralRecord>('SELECT * FROM "StoreSubscriptionReferral" WHERE id=$1 FOR UPDATE',[input.referralId]))[0];
    if(!relation)fail("推薦關係不存在");
    if(relation.identityReview==="SAME_OPERATOR")fail("此推薦已標記為同一經營者，不能覆蓋核對結果");
    await requireDistinctStoreOrganizations(tx,relation.referrerStoreId,relation.referredStoreId);
    if(!input.distinctOperator||!input.firstPaymentConfirmed)fail("請核對不同經營者及首次付款");
    const sub=(await tx.query<{id:string;storeId:string;effectiveAt:Date|null;startedAt:Date;billingStatus:string;priceAmount:number|null;isTrial:boolean;plan:string}>('SELECT id,"storeId","effectiveAt","startedAt","billingStatus","priceAmount","isTrial",plan FROM "StoreSubscription" WHERE id=$1',[input.subscriptionId]))[0];
    if(!sub||sub.storeId!==relation.referredStoreId||sub.isTrial||sub.plan==="EXPERIENCE"||sub.billingStatus!=="PAID"||!sub.priceAmount||sub.priceAmount<=0)fail("請選擇本店已實收的首次正式訂閱");
    const activatedAt=sub.effectiveAt??sub.startedAt;
    const existing=(await tx.query<PaymentRecord>('SELECT * FROM "StoreSubscriptionReferralPayment" WHERE "referralId"=$1',[relation.id]))[0];
    if(existing&&(existing.subscriptionId!==sub.id||existing.receiptRef!==input.receiptRef||existing.settledAt.getTime()!==input.settledAt.getTime()||existing.activatedAt.getTime()!==activatedAt.getTime()))fail("原收款證據已鎖定，不能覆蓋");
    const paymentId=existing?.id??randomUUID();
    const oldReview=(await tx.query<ReviewRecord>('SELECT * FROM "StoreSubscriptionReferralRefundReview" WHERE id=$1',[input.commandId]))[0];
    if(oldReview&&(oldReview.paymentId!==paymentId||oldReview.refunded!==input.refunded||oldReview.verificationRef!==input.verificationRef))fail("重送識別與原核對內容不同");
    const checkedAt=oldReview?.checkedAt??now;
    const eligibility=evaluateSubscriptionReferral({relationId:relation.id,referrerAccountId:relation.referrerStoreId,referredAccountId:relation.referredStoreId,boundAt:relation.boundAt,identityReview:"DISTINCT",payment:{receiptId:input.receiptRef,accountId:sub.storeId,isFirstPaidOrder:true,settledAt:input.settledAt,activatedAt,refunded:input.refunded,refundCheckedAt:checkedAt}},checkedAt);
    if(eligibility.state==="REJECTED"&&eligibility.reason!=="REFUNDED")fail("推薦資格不符："+eligibility.reason);
    if(!existing)await tx.query('INSERT INTO "StoreSubscriptionReferralPayment" (id,"referralId","subscriptionId","receiptRef","settledAt","activatedAt","firstPaidConfirmedBy","verifiedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[paymentId,relation.id,sub.id,input.receiptRef,input.settledAt,activatedAt,actorId,checkedAt]);
    if(!oldReview)await tx.query('INSERT INTO "StoreSubscriptionReferralRefundReview" (id,"paymentId","checkedAt",refunded,"checkedBy","verificationRef") VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',[input.commandId,paymentId,checkedAt,input.refunded,actorId,input.verificationRef]);
    await tx.query('UPDATE "StoreSubscriptionReferral" SET "identityReview"=\'DISTINCT\',"identityReviewedBy"=$2,"identityReviewedAt"=$3 WHERE id=$1 RETURNING id',[relation.id,actorId,checkedAt]);
    if(eligibility.state==="ELIGIBLE")for(const reward of eligibility.rewards)await tx.query('INSERT INTO "StoreSubscriptionReferralReward" (id,"referralId","referrerStoreId","referredStoreId","beneficiaryStoreId","refundReviewId",days) VALUES ($1,$2,$3,$4,$5,$6,30) ON CONFLICT ("referralId","beneficiaryStoreId") DO NOTHING RETURNING id',[reward.key,relation.id,relation.referrerStoreId,relation.referredStoreId,reward.accountId,input.commandId]);
    return {state:eligibility.state,message:eligibility.state==="ELIGIBLE"?"已確認收款與無退款，可查看雙方獎勵狀態。":eligibility.state==="WAITING"?"已保存收款核對，尚未滿 30 天；期滿後請重新核對退款。":"已保存退款核對，不發放獎勵。"};
  });
}
export interface ApplyRewardInput { rewardId:string; expectedExpiresOn:string; billingReference?:string; billingConfirmed:boolean }
/** Runtime adapter must authenticate HQ before invoking this service. */
export async function applyReferralReward(db:ReferralDatabase,actorId:string,input:ApplyRewardInput,now:Date) {
  return db.transaction(tx=>applyReferralRewardInTransaction(tx,actorId,input,now));
}
async function applyReferralRewardInTransaction(tx:ReferralSql,actorId:string,input:ApplyRewardInput,now:Date) {
    const reward=(await tx.query<RewardRecord>('SELECT * FROM "StoreSubscriptionReferralReward" WHERE id=$1 FOR UPDATE',[input.rewardId]))[0];
    if(!reward)fail("獎勵不存在");
    if(reward.state==="APPLIED")return {message:"此獎勵已發放，未重複延長。",replayed:true};
    const relation=(await tx.query<ReferralRecord>('SELECT * FROM "StoreSubscriptionReferral" WHERE id=$1',[reward.referralId]))[0];
    if(!relation||relation.identityReview!=="DISTINCT")fail("推薦歸屬或經營者核對尚未確認");
    await requireDistinctStoreOrganizations(tx,relation.referrerStoreId,relation.referredStoreId);
    await lockSubscription(tx,reward.beneficiaryStoreId);
    const current=(await tx.query<{id:string;plan:string;planStatus:string;planExpiresAt:Date|null;currentSubscriptionId:string|null;expiresAt:Date|null;status:string;billingCycle:string|null;isTrial:boolean}>('SELECT s.id,s.plan,s."planStatus",s."planExpiresAt",s."currentSubscriptionId",p."expiresAt",p.status,p."billingCycle",p."isTrial" FROM "Store" s JOIN "StoreSubscription" p ON p.id=s."currentSubscriptionId" AND p."storeId"=s.id WHERE s.id=$1 AND s."archivedAt" IS NULL FOR UPDATE OF s,p',[reward.beneficiaryStoreId]))[0];
    if(!current?.currentSubscriptionId||!current.expiresAt||!current.planExpiresAt)fail("請先完成訂閱啟用，再使用保留獎勵");
    if(!["ACTIVE","TRIAL"].includes(current.planStatus)||current.status!==current.planStatus)fail("訂閱狀態尚未確認，請先核對");
    const expiresOn=toLocalDateStr(current.expiresAt);
    if(expiresOn!==toLocalDateStr(current.planExpiresAt)||expiresOn!==input.expectedExpiresOn)fail("到期日已變更，請重新核對免費期間");
    if(!current.isTrial&&!["MONTHLY","YEARLY"].includes(current.billingCycle??""))fail("請先核對訂閱計費週期");
    const latest=(await tx.query<{refunded:boolean}>('SELECT x.refunded FROM "StoreSubscriptionReferralRefundReview" x JOIN "StoreSubscriptionReferralPayment" p ON p.id=x."paymentId" WHERE p."referralId"=$1 ORDER BY x."checkedAt" DESC,x.id DESC LIMIT 1',[reward.referralId]))[0];
    const paid=(await tx.query<{billingStatus:string}>('SELECT s."billingStatus" FROM "StoreSubscription" s JOIN "StoreSubscriptionReferralPayment" p ON p."subscriptionId"=s.id WHERE p."referralId"=$1',[reward.referralId]))[0];
    if(!latest||latest.refunded||paid?.billingStatus!=="PAID")fail("收款或退款狀態已變更，暫不套用獎勵");
    const {addTaiwanDuration}=await import("@/lib/date-utils");
    const plan=planSubscriptionReferralRedemption({subscriptionId:current.currentSubscriptionId,status:current.status as "ACTIVE"|"TRIAL",expiresOn,billingCycle:current.isTrial?"NOT_REQUIRED":current.billingCycle as "MONTHLY"|"YEARLY",billingConfirmation:input.billingConfirmed&&input.billingReference?{reference:input.billingReference,subscriptionId:current.currentSubscriptionId,freeFromOn:addTaiwanDuration(expiresOn,1,"DAY"),freeThroughOn:addTaiwanDuration(expiresOn,30,"DAY"),checkedAt:now}:undefined},now);
    if(plan.state!=="READY")fail(plan.reason==="BILLING_CONFIRMATION_REQUIRED"?"請先確認免費期間的扣款安排並填寫核對編號":"獎勵保留，請先重新啟用訂閱");
    const expiry=parseTaiwanDateToDbDate(plan.newExpiresOn);
    await tx.query('UPDATE "StoreSubscription" SET "expiresAt"=$2,"updatedBy"=$3,"updatedAt"=$4 WHERE id=$1 RETURNING id',[current.currentSubscriptionId,expiry,actorId,now]);
    await tx.query('UPDATE "Store" SET "planExpiresAt"=$2,"updatedAt"=$3 WHERE id=$1 RETURNING id',[current.id,expiry,now]);
    await tx.query('UPDATE "StoreSubscriptionReferralReward" SET state=\'APPLIED\',"appliedSubscriptionId"=$2,"previousExpiresOn"=$3::date,"freeFromOn"=$4::date,"newExpiresOn"=$5::date,"billingConfirmationRef"=$6,"appliedBy"=$7,"appliedAt"=$8 WHERE id=$1 RETURNING id',[reward.id,current.currentSubscriptionId,plan.previousExpiresOn,plan.freeFromOn,plan.newExpiresOn,input.billingReference||null,actorId,now]);
    await tx.query('INSERT INTO "StorePlanChange" (id,"storeId","changeType","fromPlan","toPlan","fromStatus","toStatus","subscriptionId","operatorUserId",reason,"metadataJson","createdAt") VALUES ($1,$2,\'PLAN_ACTIVATED\',$3::"PricingPlan",$3::"PricingPlan",$4::"StorePlanStatus",$4::"StorePlanStatus",$5,$6,$7,$8::jsonb,$9) RETURNING id',[randomUUID(),current.id,current.plan,current.planStatus,current.currentSubscriptionId,actorId,"推薦活動獎勵：主方案延長 30 天",JSON.stringify({referralRewardId:reward.id,previousExpiresOn:plan.previousExpiresOn,newExpiresOn:plan.newExpiresOn,billingConfirmationRef:input.billingReference||null}),now]);
    return {message:`已發放 30 天，到期日延長至 ${plan.newExpiresOn}。`,replayed:false};
}


export interface ApplyReferralRewardsInput {
  referralId:string;
  referrer:{expectedExpiresOn:string;billingReference?:string};
  referred:{expectedExpiresOn:string;billingReference?:string};
  billingConfirmed:boolean;
}
/** One atomic command: validate the exact pair and serialize refund reviews and both subscriptions. */
export async function applyReferralRewards(db:ReferralDatabase,actorId:string,input:ApplyReferralRewardsInput,now:Date){
  return db.transaction(async tx=>{
    const relation=(await tx.query<ReferralRecord>('SELECT * FROM "StoreSubscriptionReferral" WHERE id=$1 FOR UPDATE',[input.referralId]))[0];
    if(!relation)fail("推薦紀錄不存在，請重新整理");
    const rewards=await tx.query<RewardRecord>('SELECT * FROM "StoreSubscriptionReferralReward" WHERE "referralId"=$1 ORDER BY id FOR UPDATE',[relation.id]);
    if(rewards.length!==2||new Set(rewards.map(r=>r.beneficiaryStoreId)).size!==2||rewards.some(r=>![relation.referrerStoreId,relation.referredStoreId].includes(r.beneficiaryStoreId)))fail("雙方獎勵尚未準備好，請先確認收款與活動資格");
    for(const storeId of [relation.referrerStoreId,relation.referredStoreId].sort())await lockSubscription(tx,storeId);
    const results=[];
    for(const reward of rewards){
      const detail=reward.beneficiaryStoreId===relation.referrerStoreId?input.referrer:input.referred;
      results.push(await applyReferralRewardInTransaction(tx,actorId,{rewardId:reward.id,...detail,billingConfirmed:input.billingConfirmed},now));
    }
    return {message:results.every(r=>r.replayed)?"雙方獎勵已發放，未重複增加天數。":"完成！雙方各 30 天已發放，已發過的獎勵不會重複增加。",replayed:results.every(r=>r.replayed)};
  });
}
