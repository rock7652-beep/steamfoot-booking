-- ============================================================
-- Baseline Migration — Generated from schema.prisma
-- Replaces all previous incremental migrations
-- ============================================================

-- ============================================================
-- 1. Enums
-- ============================================================

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STORE_MANAGER', 'COACH', 'CUSTOMER');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "CustomerStage" AS ENUM ('LEAD', 'TRIAL', 'ACTIVE', 'INACTIVE');
CREATE TYPE "TalentStage" AS ENUM ('CUSTOMER', 'REGULAR', 'POTENTIAL_PARTNER', 'PARTNER', 'FUTURE_OWNER', 'OWNER');
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'VISITED', 'CONVERTED', 'CANCELLED');
CREATE TYPE "PointType" AS ENUM ('REFERRAL_CREATED', 'REFERRAL_VISITED', 'REFERRAL_CONVERTED', 'ATTENDANCE', 'BECAME_PARTNER');
CREATE TYPE "AuthSource" AS ENUM ('GOOGLE', 'LINE', 'EMAIL', 'MANUAL');
CREATE TYPE "PlanCategory" AS ENUM ('TRIAL', 'SINGLE', 'PACKAGE');
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'USED_UP', 'EXPIRED', 'CANCELLED');
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "BookedByType" AS ENUM ('CUSTOMER', 'STAFF', 'ADMIN');
CREATE TYPE "BookingType" AS ENUM ('FIRST_TRIAL', 'SINGLE', 'PACKAGE_SESSION');
CREATE TYPE "TransactionType" AS ENUM ('TRIAL_PURCHASE', 'SINGLE_PURCHASE', 'PACKAGE_PURCHASE', 'SESSION_DEDUCTION', 'SUPPLEMENT', 'REFUND', 'ADJUSTMENT');
CREATE TYPE "TransactionStatus" AS ENUM ('SUCCESS', 'CANCELLED', 'REFUNDED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'LINE_PAY', 'CREDIT_CARD', 'OTHER', 'UNPAID');
CREATE TYPE "CashbookEntryType" AS ENUM ('INCOME', 'EXPENSE', 'WITHDRAW', 'ADJUSTMENT');
CREATE TYPE "ReminderChannel" AS ENUM ('EMAIL', 'LINE', 'SMS');
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE "LineLinkStatus" AS ENUM ('UNLINKED', 'LINKED', 'BLOCKED');
CREATE TYPE "MessageLogStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');
CREATE TYPE "SpaceFeeStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'WAIVED');
CREATE TYPE "DutyRole" AS ENUM ('STORE_MANAGER', 'BRANCH_MANAGER', 'INTERN_COACH', 'HOURLY_STAFF');
CREATE TYPE "ParticipationType" AS ENUM ('PRIMARY', 'ASSIST', 'SHADOW', 'SUPPORT');
CREATE TYPE "ShopPlan" AS ENUM ('FREE', 'BASIC', 'PRO');
CREATE TYPE "PricingPlan" AS ENUM ('EXPERIENCE', 'BASIC', 'GROWTH', 'ALLIANCE');
CREATE TYPE "UpgradeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "StorePlanStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAYMENT_PENDING', 'PAST_DUE', 'SCHEDULED_DOWNGRADE', 'CANCELLED', 'EXPIRED');
CREATE TYPE "BillingStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PAID', 'FAILED', 'REFUNDED', 'WAIVED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAYMENT_PENDING', 'PAST_DUE', 'CANCELLED', 'EXPIRED');
CREATE TYPE "PlanChangeType" AS ENUM ('TRIAL_STARTED', 'UPGRADE_APPROVED', 'DOWNGRADE_SCHEDULED', 'DOWNGRADE_EXECUTED', 'PLAN_ACTIVATED', 'PLAN_RENEWED', 'PLAN_CANCELLED', 'ADMIN_MANUAL_CHANGE', 'PAYMENT_CONFIRMED', 'PAYMENT_FAILED');
CREATE TYPE "RequestType" AS ENUM ('UPGRADE', 'DOWNGRADE', 'TRIAL', 'RENEW');
CREATE TYPE "RequestSource" AS ENUM ('PRICING', 'FEATURE_GATE', 'SETTINGS', 'ADMIN_CREATED');

-- ============================================================
-- 2. Tables (ordered by dependency: parents first)
-- ============================================================

-- ── Auth ──

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_phone_role_key" ON "User"("phone", "role");
CREATE INDEX "User_phone_idx" ON "User"("phone");

CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- ── Store ──

CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "parentStoreId" TEXT,
    "plan" "PricingPlan" NOT NULL DEFAULT 'EXPERIENCE',
    "planStatus" "StorePlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "planEffectiveAt" TIMESTAMP(3),
    "planExpiresAt" TIMESTAMP(3),
    "currentSubscriptionId" TEXT,
    "maxStaffOverride" INTEGER,
    "maxCustomersOverride" INTEGER,
    "maxMonthlyBookingsOverride" INTEGER,
    "maxMonthlyReportsOverride" INTEGER,
    "maxReminderSendsOverride" INTEGER,
    "maxStoresOverride" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");
CREATE UNIQUE INDEX "Store_domain_key" ON "Store"("domain");
CREATE UNIQUE INDEX "Store_currentSubscriptionId_key" ON "Store"("currentSubscriptionId");
CREATE INDEX "Store_parentStoreId_idx" ON "Store"("parentStoreId");

-- ── Staff ──

CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "colorCode" TEXT NOT NULL DEFAULT '#6366f1',
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "monthlySpaceFee" DECIMAL(10,0) NOT NULL DEFAULT 0,
    "spaceFeeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Staff_userId_key" ON "Staff"("userId");
CREATE INDEX "Staff_storeId_idx" ON "Staff"("storeId");

-- ── Customer ──

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "googleId" TEXT,
    "avatar" TEXT,
    "authSource" "AuthSource" NOT NULL DEFAULT 'MANUAL',
    "gender" TEXT,
    "birthday" DATE,
    "height" DOUBLE PRECISION,
    "address" TEXT,
    "lineName" TEXT,
    "lineUserId" TEXT,
    "lineLinkedAt" TIMESTAMP(3),
    "lineLinkStatus" "LineLinkStatus" NOT NULL DEFAULT 'UNLINKED',
    "lineBindingCode" TEXT,
    "lineBindingCodeCreatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "healthProfileId" TEXT,
    "healthLinkStatus" TEXT NOT NULL DEFAULT 'unlinked',
    "healthSyncedAt" TIMESTAMP(3),
    "assignedStaffId" TEXT,
    "customerStage" "CustomerStage" NOT NULL DEFAULT 'LEAD',
    "sponsorId" TEXT,
    "talentStage" "TalentStage" NOT NULL DEFAULT 'CUSTOMER',
    "stageChangedAt" TIMESTAMP(3),
    "stageNote" TEXT,
    "selfBookingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "firstVisitAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "lastVisitAt" TIMESTAMP(3),
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");
CREATE UNIQUE INDEX "Customer_googleId_key" ON "Customer"("googleId");
CREATE UNIQUE INDEX "Customer_lineUserId_key" ON "Customer"("lineUserId");
CREATE UNIQUE INDEX "Customer_lineBindingCode_key" ON "Customer"("lineBindingCode");
CREATE INDEX "Customer_storeId_idx" ON "Customer"("storeId");
CREATE INDEX "Customer_assignedStaffId_idx" ON "Customer"("assignedStaffId");
CREATE INDEX "Customer_customerStage_idx" ON "Customer"("customerStage");
CREATE INDEX "Customer_talentStage_idx" ON "Customer"("talentStage");
CREATE INDEX "Customer_sponsorId_idx" ON "Customer"("sponsorId");
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- ── StaffPermission ──

CREATE TABLE "StaffPermission" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "StaffPermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffPermission_staffId_permission_key" ON "StaffPermission"("staffId", "permission");
CREATE INDEX "StaffPermission_staffId_idx" ON "StaffPermission"("staffId");

-- ── ServicePlan ──

CREATE TABLE "ServicePlan" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PlanCategory" NOT NULL,
    "price" DECIMAL(10,0) NOT NULL,
    "sessionCount" INTEGER NOT NULL,
    "validityDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServicePlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_store_plan_name" ON "ServicePlan"("storeId", "name");
CREATE INDEX "ServicePlan_storeId_idx" ON "ServicePlan"("storeId");

-- ── CustomerPlanWallet ──

CREATE TABLE "CustomerPlanWallet" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "purchasedPrice" DECIMAL(10,0) NOT NULL,
    "totalSessions" INTEGER NOT NULL,
    "remainingSessions" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "expiryDate" DATE,
    "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerPlanWallet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerPlanWallet_storeId_idx" ON "CustomerPlanWallet"("storeId");
CREATE INDEX "CustomerPlanWallet_customerId_idx" ON "CustomerPlanWallet"("customerId");
CREATE INDEX "CustomerPlanWallet_customerId_status_idx" ON "CustomerPlanWallet"("customerId", "status");

-- ── BookingSlot ──

CREATE TABLE "BookingSlot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 6,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BookingSlot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BookingSlot_storeId_dayOfWeek_startTime_key" ON "BookingSlot"("storeId", "dayOfWeek", "startTime");
CREATE INDEX "BookingSlot_storeId_idx" ON "BookingSlot"("storeId");

-- ── Booking ──

CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "bookingDate" DATE NOT NULL,
    "slotTime" TEXT NOT NULL,
    "revenueStaffId" TEXT,
    "serviceStaffId" TEXT,
    "bookedByType" "BookedByType" NOT NULL DEFAULT 'CUSTOMER',
    "bookedByStaffId" TEXT,
    "bookingType" "BookingType" NOT NULL DEFAULT 'PACKAGE_SESSION',
    "servicePlanId" TEXT,
    "customerPlanWalletId" TEXT,
    "people" INTEGER NOT NULL DEFAULT 1,
    "isMakeup" BOOLEAN NOT NULL DEFAULT false,
    "makeupCreditId" TEXT,
    "isCheckedIn" BOOLEAN NOT NULL DEFAULT false,
    "bookingStatus" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "noShowPolicy" TEXT,
    "noShowMakeupGranted" BOOLEAN,
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Booking_makeupCreditId_key" ON "Booking"("makeupCreditId");
CREATE INDEX "Booking_storeId_idx" ON "Booking"("storeId");
CREATE INDEX "Booking_bookingDate_idx" ON "Booking"("bookingDate");
CREATE INDEX "Booking_bookingDate_slotTime_idx" ON "Booking"("bookingDate", "slotTime");
CREATE INDEX "Booking_bookingDate_bookingStatus_idx" ON "Booking"("bookingDate", "bookingStatus");
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");
CREATE INDEX "Booking_customerId_bookingStatus_idx" ON "Booking"("customerId", "bookingStatus");
CREATE INDEX "Booking_revenueStaffId_idx" ON "Booking"("revenueStaffId");
CREATE INDEX "Booking_revenueStaffId_bookingDate_idx" ON "Booking"("revenueStaffId", "bookingDate");
CREATE INDEX "Booking_bookingStatus_idx" ON "Booking"("bookingStatus");
CREATE INDEX "Booking_customerPlanWalletId_idx" ON "Booking"("customerPlanWalletId");

-- ── MakeupCredit ──

CREATE TABLE "MakeupCredit" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "originalBookingId" TEXT NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    CONSTRAINT "MakeupCredit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MakeupCredit_originalBookingId_key" ON "MakeupCredit"("originalBookingId");
CREATE INDEX "MakeupCredit_customerId_isUsed_idx" ON "MakeupCredit"("customerId", "isUsed");
CREATE INDEX "MakeupCredit_storeId_idx" ON "MakeupCredit"("storeId");

-- ── Transaction ──

CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "bookingId" TEXT,
    "revenueStaffId" TEXT NOT NULL,
    "serviceStaffId" TEXT,
    "soldByStaffId" TEXT,
    "customerPlanWalletId" TEXT,
    "transactionType" "TransactionType" NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "amount" DECIMAL(10,0) NOT NULL,
    "originalAmount" DECIMAL(10,0),
    "discountType" TEXT,
    "discountValue" DECIMAL(10,2),
    "discountReason" TEXT,
    "quantity" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "transactionNo" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TransactionStatus" NOT NULL DEFAULT 'SUCCESS',
    "coachNameSnapshot" TEXT,
    "coachRoleSnapshot" TEXT,
    "storeNameSnapshot" TEXT,
    "planId" TEXT,
    "planNameSnapshot" TEXT,
    "planType" TEXT,
    "grossAmount" DECIMAL(10,0),
    "discountAmount" DECIMAL(10,0),
    "netAmount" DECIMAL(10,0) NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(10,0) NOT NULL DEFAULT 0,
    "isFirstPurchase" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Transaction_storeId_idx" ON "Transaction"("storeId");
CREATE INDEX "Transaction_customerId_idx" ON "Transaction"("customerId");
CREATE INDEX "Transaction_revenueStaffId_idx" ON "Transaction"("revenueStaffId");
CREATE INDEX "Transaction_revenueStaffId_createdAt_idx" ON "Transaction"("revenueStaffId", "createdAt");
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");
CREATE INDEX "Transaction_transactionType_idx" ON "Transaction"("transactionType");
CREATE INDEX "Transaction_transactionDate_idx" ON "Transaction"("transactionDate");
CREATE INDEX "Transaction_storeId_transactionDate_idx" ON "Transaction"("storeId", "transactionDate");
CREATE INDEX "Transaction_revenueStaffId_transactionDate_idx" ON "Transaction"("revenueStaffId", "transactionDate");
CREATE INDEX "Transaction_customerId_transactionDate_idx" ON "Transaction"("customerId", "transactionDate");
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX "Transaction_planType_idx" ON "Transaction"("planType");

-- ── CashbookEntry ──

CREATE TABLE "CashbookEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "type" "CashbookEntryType" NOT NULL,
    "category" TEXT,
    "amount" DECIMAL(10,0) NOT NULL,
    "staffId" TEXT,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CashbookEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CashbookEntry_storeId_idx" ON "CashbookEntry"("storeId");
CREATE INDEX "CashbookEntry_entryDate_idx" ON "CashbookEntry"("entryDate");
CREATE INDEX "CashbookEntry_staffId_idx" ON "CashbookEntry"("staffId");

-- ── Reminder ──

CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'LINE',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Reminder_status_scheduledAt_idx" ON "Reminder"("status", "scheduledAt");

-- ── AuditLog ──

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- ── ReconciliationRun ──

CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "targetDate" TEXT NOT NULL,
    "targetMonth" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Taipei',
    "totalChecks" INTEGER NOT NULL DEFAULT 0,
    "passCount" INTEGER NOT NULL DEFAULT 0,
    "mismatchCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReconciliationRun_storeId_idx" ON "ReconciliationRun"("storeId");
CREATE INDEX "ReconciliationRun_startedAt_idx" ON "ReconciliationRun"("startedAt");
CREATE INDEX "ReconciliationRun_status_idx" ON "ReconciliationRun"("status");

CREATE TABLE "ReconciliationCheck" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "checkCode" TEXT NOT NULL,
    "checkName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "expected" TEXT,
    "errorMessage" TEXT,
    "debugPayload" JSONB NOT NULL,
    CONSTRAINT "ReconciliationCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReconciliationCheck_runId_idx" ON "ReconciliationCheck"("runId");
CREATE INDEX "ReconciliationCheck_status_idx" ON "ReconciliationCheck"("status");

-- ── SpaceFeeRecord ──

CREATE TABLE "SpaceFeeRecord" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "feeAmount" DECIMAL(10,0) NOT NULL,
    "status" "SpaceFeeStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT NOT NULL,
    CONSTRAINT "SpaceFeeRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SpaceFeeRecord_staffId_month_key" ON "SpaceFeeRecord"("staffId", "month");
CREATE INDEX "SpaceFeeRecord_storeId_idx" ON "SpaceFeeRecord"("storeId");
CREATE INDEX "SpaceFeeRecord_staffId_idx" ON "SpaceFeeRecord"("staffId");
CREATE INDEX "SpaceFeeRecord_month_idx" ON "SpaceFeeRecord"("month");

-- ── ShopConfig ──

CREATE TABLE "ShopConfig" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopName" TEXT NOT NULL DEFAULT '蒸足',
    "plan" "ShopPlan" NOT NULL DEFAULT 'FREE',
    "dutySchedulingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShopConfig_storeId_key" ON "ShopConfig"("storeId");

-- ── ReminderRule ──

CREATE TABLE "ReminderRule" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'fixed',
    "offsetMinutes" INTEGER,
    "offsetDays" INTEGER NOT NULL DEFAULT 1,
    "fixedTime" TEXT,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'LINE',
    "templateId" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReminderRule_storeId_idx" ON "ReminderRule"("storeId");

-- ── MessageTemplate ──

CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'LINE',
    "body" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MessageTemplate_storeId_idx" ON "MessageTemplate"("storeId");

-- ── MessageLog ──

CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT,
    "templateId" TEXT,
    "customerId" TEXT NOT NULL,
    "bookingId" TEXT,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'LINE',
    "status" "MessageLogStatus" NOT NULL DEFAULT 'PENDING',
    "renderedBody" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MessageLog_customerId_idx" ON "MessageLog"("customerId");
CREATE INDEX "MessageLog_bookingId_idx" ON "MessageLog"("bookingId");
CREATE INDEX "MessageLog_status_idx" ON "MessageLog"("status");
CREATE INDEX "MessageLog_storeId_idx" ON "MessageLog"("storeId");
CREATE INDEX "MessageLog_createdAt_idx" ON "MessageLog"("createdAt");
CREATE INDEX "idx_rule_booking" ON "MessageLog"("ruleId", "bookingId");

-- ── OpsActionLog ──

CREATE TABLE "OpsActionLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "actorUserId" TEXT NOT NULL,
    "assigneeStaffId" TEXT,
    "dueDate" TIMESTAMP(3),
    "outcomeStatus" TEXT,
    "outcomeNote" TEXT,
    "outcomeMetric" TEXT,
    "outcomeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OpsActionLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OpsActionLog_storeId_module_refId_key" ON "OpsActionLog"("storeId", "module", "refId");
CREATE INDEX "OpsActionLog_storeId_idx" ON "OpsActionLog"("storeId");
CREATE INDEX "OpsActionLog_module_idx" ON "OpsActionLog"("module");
CREATE INDEX "OpsActionLog_actorUserId_idx" ON "OpsActionLog"("actorUserId");
CREATE INDEX "OpsActionLog_assigneeStaffId_idx" ON "OpsActionLog"("assigneeStaffId");
CREATE INDEX "OpsActionLog_createdAt_idx" ON "OpsActionLog"("createdAt");

-- ── OpsActionHistory ──

CREATE TABLE "OpsActionHistory" (
    "id" TEXT NOT NULL,
    "opsActionLogId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpsActionHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OpsActionHistory_opsActionLogId_idx" ON "OpsActionHistory"("opsActionLogId");
CREATE INDEX "OpsActionHistory_createdAt_idx" ON "OpsActionHistory"("createdAt");

-- ── BusinessHours ──

CREATE TABLE "BusinessHours" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "openTime" TEXT,
    "closeTime" TEXT,
    "slotInterval" INTEGER NOT NULL DEFAULT 60,
    "defaultCapacity" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BusinessHours_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BusinessHours_storeId_dayOfWeek_key" ON "BusinessHours"("storeId", "dayOfWeek");
CREATE INDEX "BusinessHours_storeId_idx" ON "BusinessHours"("storeId");

-- ── SpecialBusinessDay ──

CREATE TABLE "SpecialBusinessDay" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "openTime" TEXT,
    "closeTime" TEXT,
    "slotInterval" INTEGER,
    "defaultCapacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SpecialBusinessDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SpecialBusinessDay_storeId_date_key" ON "SpecialBusinessDay"("storeId", "date");
CREATE INDEX "SpecialBusinessDay_storeId_idx" ON "SpecialBusinessDay"("storeId");
CREATE INDEX "SpecialBusinessDay_date_idx" ON "SpecialBusinessDay"("date");

-- ── SlotOverride ──

CREATE TABLE "SlotOverride" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "capacity" INTEGER,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SlotOverride_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SlotOverride_storeId_date_startTime_key" ON "SlotOverride"("storeId", "date", "startTime");
CREATE INDEX "SlotOverride_storeId_idx" ON "SlotOverride"("storeId");
CREATE INDEX "SlotOverride_date_idx" ON "SlotOverride"("date");

-- ── DutyAssignment ──

CREATE TABLE "DutyAssignment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slotTime" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "dutyRole" "DutyRole" NOT NULL,
    "participationType" "ParticipationType" NOT NULL,
    "notes" TEXT,
    "createdByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DutyAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DutyAssignment_date_slotTime_staffId_key" ON "DutyAssignment"("date", "slotTime", "staffId");
CREATE INDEX "DutyAssignment_storeId_idx" ON "DutyAssignment"("storeId");
CREATE INDEX "DutyAssignment_date_idx" ON "DutyAssignment"("date");
CREATE INDEX "DutyAssignment_date_slotTime_idx" ON "DutyAssignment"("date", "slotTime");
CREATE INDEX "DutyAssignment_staffId_idx" ON "DutyAssignment"("staffId");
CREATE INDEX "DutyAssignment_staffId_date_idx" ON "DutyAssignment"("staffId", "date");

-- ── TalentStageLog ──

CREATE TABLE "TalentStageLog" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fromStage" "TalentStage" NOT NULL,
    "toStage" "TalentStage" NOT NULL,
    "changedById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TalentStageLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TalentStageLog_customerId_idx" ON "TalentStageLog"("customerId");
CREATE INDEX "TalentStageLog_storeId_idx" ON "TalentStageLog"("storeId");
CREATE INDEX "TalentStageLog_createdAt_idx" ON "TalentStageLog"("createdAt");

-- ── Referral ──

CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredName" TEXT NOT NULL,
    "referredPhone" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "convertedCustomerId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Referral_storeId_idx" ON "Referral"("storeId");
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");
CREATE INDEX "Referral_status_idx" ON "Referral"("status");
CREATE INDEX "Referral_createdAt_idx" ON "Referral"("createdAt");

-- ── PointRecord ──

CREATE TABLE "PointRecord" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "PointType" NOT NULL,
    "points" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PointRecord_customerId_idx" ON "PointRecord"("customerId");
CREATE INDEX "PointRecord_storeId_idx" ON "PointRecord"("storeId");
CREATE INDEX "PointRecord_createdAt_idx" ON "PointRecord"("createdAt");

-- ── ReportSnapshot ──

CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReportSnapshot_storeId_month_type_key" ON "ReportSnapshot"("storeId", "month", "type");
CREATE INDEX "ReportSnapshot_storeId_idx" ON "ReportSnapshot"("storeId");
CREATE INDEX "ReportSnapshot_month_idx" ON "ReportSnapshot"("month");

-- ── ErrorLog ──

CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "userId" TEXT,
    "storeId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErrorLog_category_idx" ON "ErrorLog"("category");
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");
CREATE INDEX "ErrorLog_userId_idx" ON "ErrorLog"("userId");

-- ── UpgradeRequest ──

CREATE TABLE "UpgradeRequest" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "currentPlan" "PricingPlan" NOT NULL,
    "requestedPlan" "PricingPlan" NOT NULL,
    "reason" TEXT,
    "status" "UpgradeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "requestType" "RequestType" NOT NULL DEFAULT 'UPGRADE',
    "source" "RequestSource",
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "effectiveAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UpgradeRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UpgradeRequest_storeId_idx" ON "UpgradeRequest"("storeId");
CREATE INDEX "UpgradeRequest_status_idx" ON "UpgradeRequest"("status");
CREATE INDEX "UpgradeRequest_requestedBy_idx" ON "UpgradeRequest"("requestedBy");

-- ── StoreSubscription ──

CREATE TABLE "StoreSubscription" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "plan" "PricingPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "isTrial" BOOLEAN NOT NULL DEFAULT false,
    "billingCycle" TEXT,
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "priceAmount" INTEGER,
    "priceCurrency" TEXT DEFAULT 'TWD',
    "sourceRequestId" TEXT,
    "createdBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreSubscription_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoreSubscription_storeId_idx" ON "StoreSubscription"("storeId");
CREATE INDEX "StoreSubscription_status_idx" ON "StoreSubscription"("status");

-- ── StorePlanChange ──

CREATE TABLE "StorePlanChange" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "changeType" "PlanChangeType" NOT NULL,
    "fromPlan" "PricingPlan",
    "toPlan" "PricingPlan" NOT NULL,
    "fromStatus" "StorePlanStatus",
    "toStatus" "StorePlanStatus" NOT NULL,
    "requestId" TEXT,
    "subscriptionId" TEXT,
    "operatorUserId" TEXT,
    "reason" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StorePlanChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StorePlanChange_storeId_idx" ON "StorePlanChange"("storeId");
CREATE INDEX "StorePlanChange_changeType_idx" ON "StorePlanChange"("changeType");
CREATE INDEX "StorePlanChange_createdAt_idx" ON "StorePlanChange"("createdAt");

-- ============================================================
-- 3. Foreign Keys
-- ============================================================

-- Auth
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Store hierarchy + subscription
ALTER TABLE "Store" ADD CONSTRAINT "Store_parentStoreId_fkey" FOREIGN KEY ("parentStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Store" ADD CONSTRAINT "Store_currentSubscriptionId_fkey" FOREIGN KEY ("currentSubscriptionId") REFERENCES "StoreSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Staff
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Customer
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- StaffPermission
ALTER TABLE "StaffPermission" ADD CONSTRAINT "StaffPermission_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ServicePlan
ALTER TABLE "ServicePlan" ADD CONSTRAINT "ServicePlan_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CustomerPlanWallet
ALTER TABLE "CustomerPlanWallet" ADD CONSTRAINT "CustomerPlanWallet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerPlanWallet" ADD CONSTRAINT "CustomerPlanWallet_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerPlanWallet" ADD CONSTRAINT "CustomerPlanWallet_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BookingSlot
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Booking
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_revenueStaffId_fkey" FOREIGN KEY ("revenueStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_serviceStaffId_fkey" FOREIGN KEY ("serviceStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookedByStaffId_fkey" FOREIGN KEY ("bookedByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_servicePlanId_fkey" FOREIGN KEY ("servicePlanId") REFERENCES "ServicePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerPlanWalletId_fkey" FOREIGN KEY ("customerPlanWalletId") REFERENCES "CustomerPlanWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_makeupCreditId_fkey" FOREIGN KEY ("makeupCreditId") REFERENCES "MakeupCredit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MakeupCredit
ALTER TABLE "MakeupCredit" ADD CONSTRAINT "MakeupCredit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MakeupCredit" ADD CONSTRAINT "MakeupCredit_originalBookingId_fkey" FOREIGN KEY ("originalBookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MakeupCredit" ADD CONSTRAINT "MakeupCredit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Transaction
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_revenueStaffId_fkey" FOREIGN KEY ("revenueStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_serviceStaffId_fkey" FOREIGN KEY ("serviceStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_soldByStaffId_fkey" FOREIGN KEY ("soldByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_customerPlanWalletId_fkey" FOREIGN KEY ("customerPlanWalletId") REFERENCES "CustomerPlanWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CashbookEntry
ALTER TABLE "CashbookEntry" ADD CONSTRAINT "CashbookEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashbookEntry" ADD CONSTRAINT "CashbookEntry_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashbookEntry" ADD CONSTRAINT "CashbookEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reminder
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AuditLog
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ReconciliationRun / Check
ALTER TABLE "ReconciliationRun" ADD CONSTRAINT "ReconciliationRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationCheck" ADD CONSTRAINT "ReconciliationCheck_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconciliationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SpaceFeeRecord
ALTER TABLE "SpaceFeeRecord" ADD CONSTRAINT "SpaceFeeRecord_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpaceFeeRecord" ADD CONSTRAINT "SpaceFeeRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ShopConfig
ALTER TABLE "ShopConfig" ADD CONSTRAINT "ShopConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ReminderRule
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MessageTemplate
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MessageLog
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReminderRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- OpsActionLog
ALTER TABLE "OpsActionLog" ADD CONSTRAINT "OpsActionLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpsActionLog" ADD CONSTRAINT "OpsActionLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpsActionLog" ADD CONSTRAINT "OpsActionLog_assigneeStaffId_fkey" FOREIGN KEY ("assigneeStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- OpsActionHistory
ALTER TABLE "OpsActionHistory" ADD CONSTRAINT "OpsActionHistory_opsActionLogId_fkey" FOREIGN KEY ("opsActionLogId") REFERENCES "OpsActionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpsActionHistory" ADD CONSTRAINT "OpsActionHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BusinessHours / SpecialBusinessDay / SlotOverride
ALTER TABLE "BusinessHours" ADD CONSTRAINT "BusinessHours_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpecialBusinessDay" ADD CONSTRAINT "SpecialBusinessDay_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SlotOverride" ADD CONSTRAINT "SlotOverride_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DutyAssignment
ALTER TABLE "DutyAssignment" ADD CONSTRAINT "DutyAssignment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DutyAssignment" ADD CONSTRAINT "DutyAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DutyAssignment" ADD CONSTRAINT "DutyAssignment_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TalentStageLog
ALTER TABLE "TalentStageLog" ADD CONSTRAINT "TalentStageLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentStageLog" ADD CONSTRAINT "TalentStageLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TalentStageLog" ADD CONSTRAINT "TalentStageLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Referral
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_convertedCustomerId_fkey" FOREIGN KEY ("convertedCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PointRecord
ALTER TABLE "PointRecord" ADD CONSTRAINT "PointRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PointRecord" ADD CONSTRAINT "PointRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ReportSnapshot
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- UpgradeRequest
ALTER TABLE "UpgradeRequest" ADD CONSTRAINT "UpgradeRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- StoreSubscription
ALTER TABLE "StoreSubscription" ADD CONSTRAINT "StoreSubscription_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- StorePlanChange
ALTER TABLE "StorePlanChange" ADD CONSTRAINT "StorePlanChange_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StorePlanChange" ADD CONSTRAINT "StorePlanChange_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "StoreSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 4. Row Level Security (Supabase protection)
-- ============================================================

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffPermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerPlanWallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingSlot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MakeupCredit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServicePlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashbookEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpaceFeeRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReminderRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShopConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessHours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpecialBusinessDay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SlotOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DutyAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OpsActionLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OpsActionHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReconciliationRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReconciliationCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TalentStageLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Referral" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PointRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ErrorLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UpgradeRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StorePlanChange" ENABLE ROW LEVEL SECURITY;

-- Revoke PostgREST API access
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
  END IF;
END $$;
