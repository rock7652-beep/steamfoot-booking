-- ONLY project ttworfzgwejdeolegkxl. Synthetic fixtures; never production.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='steamfoot_referral_qa_20261105') OR EXISTS(SELECT 1 FROM "Store" WHERE id LIKE 'referral-qa-20261105-%') THEN RAISE EXCEPTION 'QA fixture target is not fresh'; END IF;
END $$;
CREATE ROLE steamfoot_referral_qa_20261105 LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO steamfoot_referral_qa_20261105;
INSERT INTO "User"(id,name,email,"passwordHash",role,status,"updatedAt") VALUES
 ('referral-qa-20261105-owner-a','推薦驗收－體驗推薦人','referral-a@steamfoot-qa.invalid','__QA_PASSWORD_HASH__','OWNER','ACTIVE',now()),
 ('referral-qa-20261105-owner-b','推薦驗收－滿30天朋友','referral-b@steamfoot-qa.invalid','__QA_PASSWORD_HASH__','OWNER','ACTIVE',now()),
 ('referral-qa-20261105-owner-c','推薦驗收－新朋友','referral-c@steamfoot-qa.invalid','__QA_PASSWORD_HASH__','OWNER','ACTIVE',now()),
 ('referral-qa-20261105-hq','推薦驗收－總部','referral-hq@steamfoot-qa.invalid','__QA_PASSWORD_HASH__','ADMIN','ACTIVE',now());
INSERT INTO "Store"(id,name,slug,"isDemo",plan,"planStatus","planEffectiveAt","planExpiresAt","updatedAt") VALUES
 ('referral-qa-20261105-a','【HQ測試】推薦驗收－體驗推薦人','referral-qa-20261105-a',true,'BASIC','TRIAL',now()-interval '10 days',now()+interval '20 days',now()),
 ('referral-qa-20261105-b','【HQ測試】推薦驗收－滿30天朋友','referral-qa-20261105-b',true,'BASIC','ACTIVE',now()-interval '35 days',now()+interval '25 days',now()),
 ('referral-qa-20261105-c','【HQ測試】推薦驗收－新朋友','referral-qa-20261105-c',true,'BASIC','TRIAL',now(),now()+interval '30 days',now());
INSERT INTO "Staff"(id,"userId","storeId","displayName","isOwner",status,"updatedAt")
 SELECT 'referral-qa-20261105-staff-'||v,'referral-qa-20261105-owner-'||v,'referral-qa-20261105-'||v,'測試老闆',true,'ACTIVE',now() FROM unnest(ARRAY['a','b','c'])v;
INSERT INTO "StoreSubscription"(id,"storeId",plan,status,"startedAt","effectiveAt","expiresAt","isTrial","billingCycle","billingStatus","priceAmount","updatedAt")
 SELECT 'referral-qa-20261105-sub-'||v,s.id,s.plan,CASE WHEN v='b' THEN 'ACTIVE'::"SubscriptionStatus" ELSE 'TRIAL'::"SubscriptionStatus" END,s."planEffectiveAt",s."planEffectiveAt",s."planExpiresAt",v<>'b',CASE WHEN v='b' THEN 'MONTHLY' ELSE NULL END,CASE WHEN v='b' THEN 'PAID'::"BillingStatus" ELSE 'NOT_REQUIRED'::"BillingStatus" END,CASE WHEN v='b' THEN 990 ELSE 0 END,now() FROM unnest(ARRAY['a','b','c'])v JOIN "Store" s ON s.id='referral-qa-20261105-'||v;
UPDATE "Store" SET "currentSubscriptionId"='referral-qa-20261105-sub-'||right(id,1) WHERE id IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c');
INSERT INTO "TrialApplication"(id,"requestId","resumeTokenHash","storeName","contactEmail",payload,"notificationStatus","updatedAt") VALUES
 ('referral-qa-20261105-trial-b','referral-qa-20261105-trial-request-b','not-a-real-resume-token','【HQ測試】推薦驗收－滿30天朋友','referral-b@steamfoot-qa.invalid','{}','NOT_SENT_PREVIEW',now()),
 ('referral-qa-20261105-trial-c','referral-qa-20261105-trial-request-c','not-a-real-resume-token','【HQ測試】推薦驗收－新朋友','referral-c@steamfoot-qa.invalid','{}','NOT_SENT_PREVIEW',now());
INSERT INTO "StoreSubscriptionReferralCode"("storeId",code,"createdBy")VALUES('referral-qa-20261105-a','SB-TESTABCD','referral-qa-20261105-owner-a');
INSERT INTO "ConsultationLead"(id,"requestId","payloadHash","originalPayload","storeName",industry,"sheetStatus","trialApplicationId","trialLinkedAt","trialLinkedBy","createdAt","updatedAt")VALUES
 ('referral-qa-20261105-lead-b','referral-qa-20261105-request-b','__QA_PAYLOAD_HASH__','{"subscriptionReferralCode":"SB-TESTABCD","subscriptionReferralConfirmed":true}','【HQ測試】推薦驗收－滿30天朋友','時段預約／蒸足','NOT_SENT_PREVIEW','referral-qa-20261105-trial-b',now(),'referral-qa-20261105-hq',now()-interval '40 days',now());
-- Explicit role-scoped policies; no changes to existing roles/policies or RLS settings.
GRANT SELECT ON "Store","Staff","User","Customer","StaffPermission","ShopConfig","StoreFeatureEntitlement","StoreSubscription","ConsultationLead","TrialApplication" TO steamfoot_referral_qa_20261105;
GRANT UPDATE("planExpiresAt","updatedAt") ON "Store" TO steamfoot_referral_qa_20261105;
GRANT UPDATE("expiresAt","updatedBy","updatedAt") ON "StoreSubscription" TO steamfoot_referral_qa_20261105;
GRANT SELECT,INSERT,UPDATE ON "StaffLoginRecord" TO steamfoot_referral_qa_20261105;
GRANT INSERT ON "ConsultationLead" TO steamfoot_referral_qa_20261105;
GRANT SELECT,INSERT ON "StorePlanChange" TO steamfoot_referral_qa_20261105;
CREATE POLICY referral_qa_20261105 ON "Store" TO steamfoot_referral_qa_20261105 USING(id IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c')) WITH CHECK(id IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c'));
CREATE POLICY referral_qa_20261105 ON "Staff" TO steamfoot_referral_qa_20261105 USING("storeId" IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c'));
CREATE POLICY referral_qa_20261105 ON "User" TO steamfoot_referral_qa_20261105 USING(id IN ('referral-qa-20261105-owner-a','referral-qa-20261105-owner-b','referral-qa-20261105-owner-c','referral-qa-20261105-hq'));
CREATE POLICY referral_qa_20261105 ON "Customer" TO steamfoot_referral_qa_20261105 USING(false);
CREATE POLICY referral_qa_20261105 ON "StaffPermission" TO steamfoot_referral_qa_20261105 USING("staffId" IN ('referral-qa-20261105-staff-a','referral-qa-20261105-staff-b','referral-qa-20261105-staff-c'));
CREATE POLICY referral_qa_20261105 ON "ShopConfig" TO steamfoot_referral_qa_20261105 USING("storeId" IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c'));
CREATE POLICY referral_qa_20261105 ON "StoreFeatureEntitlement" TO steamfoot_referral_qa_20261105 USING("storeId" IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c'));
CREATE POLICY referral_qa_20261105 ON "StoreSubscription" TO steamfoot_referral_qa_20261105 USING("storeId" IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c')) WITH CHECK("storeId" IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c'));
CREATE POLICY referral_qa_20261105 ON "StorePlanChange" TO steamfoot_referral_qa_20261105 USING("storeId" IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c')) WITH CHECK("storeId" IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c'));
CREATE POLICY referral_qa_20261105 ON "TrialApplication" TO steamfoot_referral_qa_20261105 USING(id IN ('referral-qa-20261105-trial-b','referral-qa-20261105-trial-c'));
CREATE POLICY referral_qa_20261105 ON "ConsultationLead" TO steamfoot_referral_qa_20261105 USING("storeName" LIKE '【HQ測試】推薦驗收%') WITH CHECK("storeName" LIKE '【HQ測試】推薦驗收%' AND "sheetStatus"='NOT_SENT_PREVIEW');
CREATE POLICY referral_qa_20261105 ON "StaffLoginRecord" TO steamfoot_referral_qa_20261105 USING("actorUserId" IN ('referral-qa-20261105-owner-a','referral-qa-20261105-owner-b','referral-qa-20261105-owner-c','referral-qa-20261105-hq') OR ("actorUserId" IS NULL AND outcome='FAILED')) WITH CHECK("actorUserId" IN ('referral-qa-20261105-owner-a','referral-qa-20261105-owner-b','referral-qa-20261105-owner-c','referral-qa-20261105-hq') OR ("actorUserId" IS NULL AND outcome='FAILED'));
GRANT SELECT,INSERT ON "StoreSubscriptionReferralCode","StoreSubscriptionReferralPayment","StoreSubscriptionReferralRefundReview" TO steamfoot_referral_qa_20261105;
GRANT SELECT,INSERT,UPDATE ON "StoreSubscriptionReferral","StoreSubscriptionReferralReward" TO steamfoot_referral_qa_20261105;
CREATE POLICY referral_qa_20261105 ON "StoreSubscriptionReferralCode" TO steamfoot_referral_qa_20261105 USING("storeId" IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c')) WITH CHECK("storeId" IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c'));
CREATE POLICY referral_qa_20261105 ON "StoreSubscriptionReferral" TO steamfoot_referral_qa_20261105 USING("referrerStoreId" IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c') AND "referredStoreId" IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c')) WITH CHECK("referrerStoreId" IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c') AND "referredStoreId" IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c'));
CREATE POLICY referral_qa_20261105 ON "StoreSubscriptionReferralPayment" TO steamfoot_referral_qa_20261105 USING(EXISTS(SELECT 1 FROM "StoreSubscriptionReferral" r WHERE r.id="referralId")) WITH CHECK(EXISTS(SELECT 1 FROM "StoreSubscriptionReferral" r WHERE r.id="referralId") AND "subscriptionId" IN ('referral-qa-20261105-sub-a','referral-qa-20261105-sub-b','referral-qa-20261105-sub-c'));
CREATE POLICY referral_qa_20261105 ON "StoreSubscriptionReferralRefundReview" TO steamfoot_referral_qa_20261105 USING(EXISTS(SELECT 1 FROM "StoreSubscriptionReferralPayment" p WHERE p.id="paymentId")) WITH CHECK(EXISTS(SELECT 1 FROM "StoreSubscriptionReferralPayment" p WHERE p.id="paymentId"));
CREATE POLICY referral_qa_20261105 ON "StoreSubscriptionReferralReward" TO steamfoot_referral_qa_20261105 USING("beneficiaryStoreId" IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c')) WITH CHECK("beneficiaryStoreId" IN ('referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c'));
COMMIT;
