CREATE TYPE "EcpayRecurringStatus" AS ENUM (
  'PENDING_AUTHORIZATION',
  'ACTIVE',
  'PAST_DUE',
  'CANCEL_REQUESTED',
  'CANCELLED',
  'COMPLETED'
);

CREATE TABLE "EcpayRecurringAgreement" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "merchantTradeNo" VARCHAR(20) NOT NULL,
  "checkoutTokenHash" TEXT NOT NULL,
  "plan" "PricingPlan" NOT NULL,
  "monthlyAmount" INTEGER NOT NULL,
  "initialTermMonths" INTEGER NOT NULL DEFAULT 12,
  "termsVersion" TEXT NOT NULL,
  "termsSnapshot" TEXT NOT NULL,
  "termsAcceptedAt" TIMESTAMP(3),
  "consentingName" TEXT,
  "consentingEmail" TEXT,
  "status" "EcpayRecurringStatus" NOT NULL DEFAULT 'PENDING_AUTHORIZATION',
  "successfulPaymentCount" INTEGER NOT NULL DEFAULT 0,
  "lastPaymentAt" TIMESTAMP(3),
  "cancelRequestedAt" TIMESTAMP(3),
  "cancelAfterSuccessCount" INTEGER,
  "cancelledAt" TIMESTAMP(3),
  "lastProviderCode" TEXT,
  "lastProviderMessage" TEXT,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EcpayRecurringAgreement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EcpayRecurringPaymentEvent" (
  "id" TEXT NOT NULL,
  "agreementId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "merchantTradeNo" VARCHAR(20) NOT NULL,
  "providerTradeNo" TEXT,
  "rtnCode" INTEGER NOT NULL,
  "amount" INTEGER,
  "totalSuccessTimes" INTEGER,
  "processDate" TEXT,
  "simulatedPaid" BOOLEAN NOT NULL DEFAULT false,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EcpayRecurringPaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EcpayRecurringAgreement_subscriptionId_key" ON "EcpayRecurringAgreement"("subscriptionId");
CREATE UNIQUE INDEX "EcpayRecurringAgreement_merchantTradeNo_key" ON "EcpayRecurringAgreement"("merchantTradeNo");
CREATE UNIQUE INDEX "EcpayRecurringAgreement_checkoutTokenHash_key" ON "EcpayRecurringAgreement"("checkoutTokenHash");
CREATE INDEX "EcpayRecurringAgreement_storeId_status_idx" ON "EcpayRecurringAgreement"("storeId", "status");
CREATE INDEX "EcpayRecurringAgreement_status_tokenExpiresAt_idx" ON "EcpayRecurringAgreement"("status", "tokenExpiresAt");
CREATE UNIQUE INDEX "EcpayRecurringPaymentEvent_eventKey_key" ON "EcpayRecurringPaymentEvent"("eventKey");
CREATE INDEX "EcpayRecurringPaymentEvent_agreementId_receivedAt_idx" ON "EcpayRecurringPaymentEvent"("agreementId", "receivedAt");

ALTER TABLE "EcpayRecurringAgreement"
  ADD CONSTRAINT "EcpayRecurringAgreement_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EcpayRecurringAgreement"
  ADD CONSTRAINT "EcpayRecurringAgreement_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "StoreSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EcpayRecurringPaymentEvent"
  ADD CONSTRAINT "EcpayRecurringPaymentEvent_agreementId_fkey"
  FOREIGN KEY ("agreementId") REFERENCES "EcpayRecurringAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
