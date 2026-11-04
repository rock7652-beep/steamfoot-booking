-- REVIEW DRAFT ONLY. No runtime or migration runner imports this file.
-- Applies only new private tables; no subscription changes, grants, jobs or rewards.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE public."StoreSubscriptionReferralCode" (
  "storeId" text PRIMARY KEY REFERENCES public."Store"(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE CHECK (code ~ '^SB-[A-HJ-NP-Z2-9]{8}$'),
  "createdBy" text NOT NULL CHECK (length(btrim("createdBy")) > 0),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("storeId", code)
);
CREATE TABLE public."StoreSubscriptionReferral" (
  id text PRIMARY KEY CHECK (length(btrim(id)) > 0),
  "referrerStoreId" text NOT NULL,
  "referredStoreId" text NOT NULL UNIQUE REFERENCES public."Store"(id) ON DELETE RESTRICT,
  code text NOT NULL,
  "boundAt" timestamptz NOT NULL,
  "createdBy" text NOT NULL,
  "sourceLeadId" text UNIQUE REFERENCES public."ConsultationLead"(id) ON DELETE RESTRICT,
  "identityReview" text NOT NULL DEFAULT 'UNVERIFIED' CHECK ("identityReview" IN ('UNVERIFIED','DISTINCT','SAME_OPERATOR')),
  "identityReviewedBy" text,
  "identityReviewedAt" timestamptz,
  CHECK ("referrerStoreId" <> "referredStoreId"),
  CHECK ("identityReview" = 'UNVERIFIED' OR ("identityReviewedBy" IS NOT NULL AND "identityReviewedAt" IS NOT NULL)),
  FOREIGN KEY ("referrerStoreId", code) REFERENCES public."StoreSubscriptionReferralCode"("storeId",code) ON DELETE RESTRICT,
  UNIQUE (id,"referrerStoreId","referredStoreId")
);
CREATE INDEX "StoreSubscriptionReferral_referrer_idx" ON public."StoreSubscriptionReferral"("referrerStoreId","boundAt");
CREATE TABLE public."StoreSubscriptionReferralPayment" (
  id text PRIMARY KEY,
  "referralId" text NOT NULL UNIQUE REFERENCES public."StoreSubscriptionReferral"(id) ON DELETE RESTRICT,
  "subscriptionId" text NOT NULL REFERENCES public."StoreSubscription"(id) ON DELETE RESTRICT,
  "receiptRef" text NOT NULL UNIQUE CHECK (length(btrim("receiptRef")) > 0),
  "settledAt" timestamptz NOT NULL,
  "activatedAt" timestamptz NOT NULL,
  "firstPaidConfirmedBy" text NOT NULL,
  "verifiedAt" timestamptz NOT NULL,
  CHECK ("verifiedAt" >= "settledAt" AND "verifiedAt" >= "activatedAt")
);
CREATE INDEX "StoreSubscriptionReferralPayment_subscription_idx" ON public."StoreSubscriptionReferralPayment"("subscriptionId");
CREATE TABLE public."StoreSubscriptionReferralRefundReview" (
  id text PRIMARY KEY,
  "paymentId" text NOT NULL REFERENCES public."StoreSubscriptionReferralPayment"(id) ON DELETE RESTRICT,
  "checkedAt" timestamptz NOT NULL,
  refunded boolean NOT NULL,
  "checkedBy" text NOT NULL,
  "verificationRef" text NOT NULL CHECK (length(btrim("verificationRef")) > 0),
  UNIQUE ("paymentId","checkedAt")
);
CREATE TABLE public."StoreSubscriptionReferralReward" (
  id text PRIMARY KEY,
  "referralId" text NOT NULL,
  "referrerStoreId" text NOT NULL,
  "referredStoreId" text NOT NULL,
  "beneficiaryStoreId" text NOT NULL REFERENCES public."Store"(id) ON DELETE RESTRICT,
  "refundReviewId" text NOT NULL REFERENCES public."StoreSubscriptionReferralRefundReview"(id) ON DELETE RESTRICT,
  days integer NOT NULL CHECK (days = 30),
  state text NOT NULL DEFAULT 'READY' CHECK (state IN ('READY','APPLIED')),
  "appliedSubscriptionId" text REFERENCES public."StoreSubscription"(id) ON DELETE RESTRICT,
  "previousExpiresOn" date,
  "freeFromOn" date,
  "newExpiresOn" date,
  "billingConfirmationRef" text,
  "appliedBy" text,
  "appliedAt" timestamptz,
  FOREIGN KEY ("referralId","referrerStoreId","referredStoreId") REFERENCES public."StoreSubscriptionReferral"(id,"referrerStoreId","referredStoreId") ON DELETE RESTRICT,
  CHECK ("beneficiaryStoreId" IN ("referrerStoreId","referredStoreId")),
  UNIQUE ("referralId","beneficiaryStoreId"),
  CHECK (
    (state = 'READY' AND "appliedSubscriptionId" IS NULL AND "previousExpiresOn" IS NULL AND "freeFromOn" IS NULL AND "newExpiresOn" IS NULL AND "billingConfirmationRef" IS NULL AND "appliedBy" IS NULL AND "appliedAt" IS NULL)
    OR (state = 'APPLIED' AND "appliedSubscriptionId" IS NOT NULL AND "previousExpiresOn" IS NOT NULL AND "freeFromOn" IS NOT NULL AND "newExpiresOn" IS NOT NULL AND "appliedBy" IS NOT NULL AND "appliedAt" IS NOT NULL AND "freeFromOn" = "previousExpiresOn" + 1 AND "newExpiresOn" = "previousExpiresOn" + 30)
  )
);
CREATE INDEX "StoreSubscriptionReferralReward_beneficiary_idx" ON public."StoreSubscriptionReferralReward"("beneficiaryStoreId",state);
CREATE INDEX "StoreSubscriptionReferralReward_refund_review_idx" ON public."StoreSubscriptionReferralReward"("refundReviewId");
CREATE INDEX "StoreSubscriptionReferralReward_subscription_idx" ON public."StoreSubscriptionReferralReward"("appliedSubscriptionId");
DO $private$
DECLARE target_table text; target_role text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['StoreSubscriptionReferralCode','StoreSubscriptionReferral','StoreSubscriptionReferralPayment','StoreSubscriptionReferralRefundReview','StoreSubscriptionReferralReward'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',target_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',target_table);
    FOREACH target_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',target_table,target_role);
      END IF;
    END LOOP;
  END LOOP;
END $private$;
COMMIT;
