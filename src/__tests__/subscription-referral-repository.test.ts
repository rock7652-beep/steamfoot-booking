import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, it, expect } from "vitest";
import { ensureReferralCode, validReferralCode, bindReferralLead, verifyReferralPayment, applyReferralReward, type ReferralDatabase, type ReferralSql, type VerifyReferralInput } from "@/server/services/subscription-referral/repository";

async function fixture(){
  const pg=new PGlite();
  await pg.exec(`CREATE TYPE "PricingPlan" AS ENUM ('EXPERIENCE','BASIC','GROWTH','ALLIANCE'); CREATE TYPE "StorePlanStatus" AS ENUM ('ACTIVE','TRIAL','EXPIRED','CANCELLED');
  CREATE TABLE "Store" (id text PRIMARY KEY,name text NOT NULL,"parentStoreId" text,"archivedAt" timestamptz,plan "PricingPlan","planStatus" "StorePlanStatus","planExpiresAt" timestamptz,"currentSubscriptionId" text,"updatedAt" timestamptz);
  CREATE TABLE "StoreSubscription" (id text PRIMARY KEY,"storeId" text NOT NULL,plan "PricingPlan",status text,"isTrial" boolean,"billingCycle" text,"billingStatus" text,"priceAmount" integer,"startedAt" timestamptz,"effectiveAt" timestamptz,"expiresAt" timestamptz,"updatedBy" text,"updatedAt" timestamptz);
  CREATE TABLE "ConsultationLead" (id text PRIMARY KEY,"originalPayload" jsonb,"createdAt" timestamptz,"trialApplicationId" text);
  CREATE TABLE "StorePlanChange" (id text PRIMARY KEY,"storeId" text,"changeType" text,"fromPlan" "PricingPlan","toPlan" "PricingPlan","fromStatus" "StorePlanStatus","toStatus" "StorePlanStatus","subscriptionId" text,"operatorUserId" text,reason text,"metadataJson" jsonb,"createdAt" timestamptz);
  INSERT INTO "Store" VALUES ('a','推薦店',NULL,NULL,'EXPERIENCE','TRIAL','2026-11-20T00:00:00Z','sub-a',now()),('b','朋友店',NULL,NULL,'EXPERIENCE','TRIAL','2026-11-20T00:00:00Z','sub-b',now()),('c','另一店',NULL,NULL,'BASIC','ACTIVE','2026-11-30T00:00:00Z','sub-c',now());
  INSERT INTO "StoreSubscription" VALUES ('sub-a','a','EXPERIENCE','TRIAL',true,'YEARLY','NOT_REQUIRED',0,'2026-10-22T00:00:00Z','2026-10-22T00:00:00Z','2026-11-20T00:00:00Z',NULL,now()),('sub-b','b','EXPERIENCE','TRIAL',true,'YEARLY','NOT_REQUIRED',0,'2026-10-02T02:00:00Z','2026-10-02T02:00:00Z','2026-11-20T00:00:00Z',NULL,now()),('sub-c','c','BASIC','ACTIVE',false,'YEARLY','PAID',6000,'2026-10-02T02:00:00Z','2026-10-02T02:00:00Z','2026-11-30T00:00:00Z',NULL,now());`);
  await pg.exec(readFileSync('docs/marketing/subscription-referral-schema.sql','utf8'));
  function adapter(raw:Pick<PGlite,'query'>):ReferralSql{return {query:async<T extends object>(text:string,values:unknown[]=[])=>{const result=await raw.query<T>(text,values);if(result.fields.some(field=>field.dataTypeID===2278))throw new Error("Prisma raw query cannot deserialize PostgreSQL void");return result.rows;}};}
  const db:ReferralDatabase={...adapter(pg),transaction:work=>pg.transaction(tx=>work(adapter(tx)))};
  const code=await ensureReferralCode(db,'a','hq');
  await db.query('INSERT INTO "ConsultationLead" VALUES ($1,$2::jsonb,$3,$4)',['lead',JSON.stringify({subscriptionReferralCode:code,subscriptionReferralConfirmed:true}),new Date('2026-09-30T10:00:00+08:00'),'application']);
  return {pg,db,code};
}
const mature=new Date('2026-11-01T10:00:00+08:00');
async function paidRelation(db:ReferralDatabase){
  const relation=await bindReferralLead(db,'hq','lead','b');
  await db.query(`UPDATE "StoreSubscription" SET plan='BASIC',"isTrial"=false,status='ACTIVE',"billingCycle"='MONTHLY',"billingStatus"='PAID',"priceAmount"=1480,"expiresAt"='2026-11-30T00:00:00Z' WHERE id='sub-b' RETURNING id`);
  await db.query(`UPDATE "Store" SET plan='BASIC',"planStatus"='ACTIVE',"planExpiresAt"='2026-11-30T00:00:00Z' WHERE id='b' RETURNING id`);
  const input:VerifyReferralInput={commandId:'review-1',referralId:relation.id,subscriptionId:'sub-b',receiptRef:'receipt-1',settledAt:new Date('2026-10-01T10:00:00+08:00'),distinctOperator:true,firstPaymentConfirmed:true,refunded:false,verificationRef:'bank-review-1'};
  return {relation,input};
}
describe('subscription referral durable workflow (isolated PostgreSQL)',()=>{
 it('reuses codes and bindings; matures once; applies a trial and a monthly reward exactly once',async()=>{
  const {pg,db,code}=await fixture();try{
   expect(await ensureReferralCode(db,'a','owner-a')).toBe(code);
   expect(await validReferralCode(db,code.toLowerCase())).toBe(true);expect(await validReferralCode(db,'bad-code')).toBe(false);
   const {relation,input}=await paidRelation(db);expect(await bindReferralLead(db,'hq','lead','b')).toEqual(relation);
   expect((await verifyReferralPayment(db,'hq',input,new Date('2026-10-10T10:00:00+08:00'))).state).toBe('WAITING');
   expect((await db.query('SELECT id FROM "StoreSubscriptionReferralReward"')).length).toBe(0);
   const ready={...input,commandId:'review-2',verificationRef:'bank-review-2'};
   expect((await verifyReferralPayment(db,'hq',ready,mature)).state).toBe('ELIGIBLE');
   await verifyReferralPayment(db,'hq',ready,new Date('2026-11-02T10:00:00+08:00'));
   const rewards=await db.query<{id:string;beneficiaryStoreId:string}>('SELECT id,"beneficiaryStoreId" FROM "StoreSubscriptionReferralReward" ORDER BY "beneficiaryStoreId"');expect(rewards).toHaveLength(2);
   const a={rewardId:rewards[0].id,expectedExpiresOn:'2026-11-20',billingConfirmed:false};
   await applyReferralReward(db,'hq',a,mature);expect((await applyReferralReward(db,'hq',a,mature)).replayed).toBe(true);
   const b={rewardId:rewards[1].id,expectedExpiresOn:'2026-11-30',billingConfirmed:false};
   await expect(applyReferralReward(db,'hq',b,mature)).rejects.toThrow('扣款安排');
   await expect(applyReferralReward(db,'hq',{...b,expectedExpiresOn:'2026-11-29',billingConfirmed:true,billingReference:'billing-1'},mature)).rejects.toThrow('到期日已變更');
   await applyReferralReward(db,'hq',{...b,billingConfirmed:true,billingReference:'billing-1'},mature);
   const stores=await db.query<{id:string;end:string}>(`SELECT id,to_char("planExpiresAt",'YYYY-MM-DD') AS end FROM "Store" WHERE id IN ('a','b') ORDER BY id`);
   expect(stores).toEqual([{id:'a',end:'2026-12-20'},{id:'b',end:'2026-12-30'}]);
   expect(await db.query('SELECT id FROM "StorePlanChange"')).toHaveLength(2);
   expect((await db.query<{count:number}>(`SELECT count(*)::int AS count FROM "StoreSubscriptionReferralReward" WHERE state='APPLIED'`))[0].count).toBe(2);
  }finally{await pg.close();}
 },30000);
 it('rejects another subscription, evidence rewrites, late attribution and same-organization referrals',async()=>{
  const {pg,db,code}=await fixture();try{
   const {input}=await paidRelation(db);
   await expect(verifyReferralPayment(db,'hq',{...input,subscriptionId:'sub-c'},mature)).rejects.toThrow('本店');
   await verifyReferralPayment(db,'hq',input,mature);
   await expect(verifyReferralPayment(db,'hq',{...input,commandId:'new-review',receiptRef:'different-receipt'},mature)).rejects.toThrow('證據已鎖定');
   await db.query('INSERT INTO "ConsultationLead" VALUES ($1,$2::jsonb,$3,$4)',['late',JSON.stringify({subscriptionReferralCode:code,subscriptionReferralConfirmed:true}),new Date('2026-10-05T10:00:00+08:00'),'app-c']);
   const late=await bindReferralLead(db,'hq','late','c');
   await expect(verifyReferralPayment(db,'hq',{...input,commandId:'late-review',referralId:late.id,subscriptionId:'sub-c',receiptRef:'receipt-c'},mature)).rejects.toThrow('LATE_BINDING');
   await db.query('UPDATE "Store" SET "parentStoreId"=$2 WHERE id=$1 RETURNING id',['b','a']);
   await expect(verifyReferralPayment(db,'hq',{...input,commandId:'new-review'},mature)).rejects.toThrow('同一店家組織');
  }finally{await pg.close();}
 },30000);
 it('rolls back subscription, store, and reward updates if the audit write fails',async()=>{
  const {pg,db}=await fixture();try{
   const {input}=await paidRelation(db);await verifyReferralPayment(db,'hq',input,mature);
   const reward=(await db.query<{id:string}>(`SELECT id FROM "StoreSubscriptionReferralReward" WHERE "beneficiaryStoreId"='a'`))[0];
   await pg.exec(`CREATE FUNCTION fail_referral_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated audit failure'; END $$; CREATE TRIGGER fail_referral_audit BEFORE INSERT ON "StorePlanChange" FOR EACH ROW EXECUTE FUNCTION fail_referral_audit();`);
   await expect(applyReferralReward(db,'hq',{rewardId:reward.id,expectedExpiresOn:'2026-11-20',billingConfirmed:false},mature)).rejects.toThrow('simulated audit failure');
   expect((await db.query<{state:string}>('SELECT state FROM "StoreSubscriptionReferralReward" WHERE id=$1',[reward.id]))[0].state).toBe('READY');
   expect((await db.query<{end:string}>(`SELECT to_char("planExpiresAt",'YYYY-MM-DD') AS end FROM "Store" WHERE id='a'`))[0].end).toBe('2026-11-20');
   expect((await db.query<{end:string}>(`SELECT to_char("expiresAt",'YYYY-MM-DD') AS end FROM "StoreSubscription" WHERE id='sub-a'`))[0].end).toBe('2026-11-20');
  }finally{await pg.close();}
 },30000);
 it('holds expired accounts and prevents later refund evidence from being redeemed',async()=>{
  const {pg,db}=await fixture();try{
   const {input}=await paidRelation(db);await verifyReferralPayment(db,'hq',input,mature);
   const reward=(await db.query<{id:string}>(`SELECT id FROM "StoreSubscriptionReferralReward" WHERE "beneficiaryStoreId"='a'`))[0];
   await db.query(`UPDATE "Store" SET "planStatus"='EXPIRED' WHERE id='a' RETURNING id`);
   await expect(applyReferralReward(db,'hq',{rewardId:reward.id,expectedExpiresOn:'2026-11-20',billingConfirmed:false},mature)).rejects.toThrow('訂閱狀態');
   await db.query(`UPDATE "Store" SET "planStatus"='TRIAL' WHERE id='a' RETURNING id`);
   await verifyReferralPayment(db,'hq',{...input,commandId:'refund-event',refunded:true,verificationRef:'refund-ref'},new Date('2026-11-02T10:00:00+08:00'));
   await expect(applyReferralReward(db,'hq',{rewardId:reward.id,expectedExpiresOn:'2026-11-20',billingConfirmed:false},new Date('2026-11-02T10:00:00+08:00'))).rejects.toThrow('退款狀態');
  }finally{await pg.close();}
 },30000);
});
