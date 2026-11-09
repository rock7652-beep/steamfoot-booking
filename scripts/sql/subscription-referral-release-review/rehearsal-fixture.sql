-- Synthetic parents only. Never run against an existing database.
CREATE TYPE "PricingPlan" AS ENUM ('EXPERIENCE','BASIC','GROWTH','ALLIANCE');
CREATE TYPE "StorePlanStatus" AS ENUM ('ACTIVE','TRIAL','EXPIRED','CANCELLED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE','TRIAL','EXPIRED','CANCELLED');
CREATE TYPE "BillingStatus" AS ENUM ('NOT_REQUIRED','PAID','REFUNDED');
CREATE TYPE "PlanChangeType" AS ENUM ('PLAN_ACTIVATED');
CREATE TABLE "Store" (id text PRIMARY KEY,name text NOT NULL,"parentStoreId" text REFERENCES "Store"(id),
  "archivedAt" timestamp,plan "PricingPlan","planStatus" "StorePlanStatus","planExpiresAt" timestamp,
  "currentSubscriptionId" text,"updatedAt" timestamp);
CREATE TABLE "StoreSubscription" (id text PRIMARY KEY,"storeId" text NOT NULL REFERENCES "Store"(id),
  plan "PricingPlan",status "SubscriptionStatus","isTrial" boolean,"billingCycle" text,
  "billingStatus" "BillingStatus","priceAmount" integer,"startedAt" timestamp,"effectiveAt" timestamp,
  "expiresAt" timestamp,"updatedBy" text,"updatedAt" timestamp);
ALTER TABLE "Store" ADD FOREIGN KEY ("currentSubscriptionId") REFERENCES "StoreSubscription"(id);
CREATE TABLE "ConsultationLead" (id text PRIMARY KEY,"originalPayload" jsonb,"createdAt" timestamp,"trialApplicationId" text);
CREATE TABLE "StorePlanChange" (id text PRIMARY KEY,"storeId" text REFERENCES "Store"(id),
  "changeType" "PlanChangeType","fromPlan" "PricingPlan","toPlan" "PricingPlan",
  "fromStatus" "StorePlanStatus","toStatus" "StorePlanStatus","subscriptionId" text REFERENCES "StoreSubscription"(id),
  "operatorUserId" text,reason text,"metadataJson" jsonb,"createdAt" timestamp);
INSERT INTO "Store" VALUES
  ('a','SYNTHETIC_A',NULL,NULL,'EXPERIENCE','TRIAL','2026-11-20',NULL,'2026-10-01'),
  ('b','SYNTHETIC_B',NULL,NULL,'BASIC','ACTIVE','2026-11-30',NULL,'2026-10-01');
INSERT INTO "StoreSubscription" VALUES
  ('sub-a','a','EXPERIENCE','TRIAL',true,'YEARLY','NOT_REQUIRED',0,'2026-10-02 02:00','2026-10-02 02:00','2026-11-20',NULL,'2026-10-01'),
  ('sub-b','b','BASIC','ACTIVE',false,'MONTHLY','PAID',1480,'2026-10-02 02:00','2026-10-02 02:00','2026-11-30',NULL,'2026-10-01');
UPDATE "Store" SET "currentSubscriptionId"='sub-'||id;
CREATE TABLE "_prisma_migrations" (
  id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL, finished_at timestamptz,
  migration_name varchar(255) NOT NULL, logs text, rolled_back_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0);
INSERT INTO "_prisma_migrations" (id,checksum,finished_at,migration_name,applied_steps_count) VALUES
  ('00000000-0000-0000-0000-000000000001',repeat('0',64),now(),'20261001000000_synthetic_existing_a',1),
  ('00000000-0000-0000-0000-000000000002',repeat('1',64),now(),'20261002000000_synthetic_existing_b',1);
