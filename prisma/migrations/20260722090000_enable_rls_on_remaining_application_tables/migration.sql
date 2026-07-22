-- Defense in depth for every application-owned table in the exposed public schema.
--
-- The application accesses these tables through server-side Prisma using the table
-- owner. anon/authenticated have no table grants, and no permissive policies are
-- added here. `_prisma_migrations` is intentionally excluded because it is Prisma's
-- internal migration ledger rather than application data.

ALTER TABLE "BonusRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingMakeupCredit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingRecurrenceGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashDrawerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashDrawerSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CentralMemberLinkReviewRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CheckinPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CronRunLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerFollowUp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerIdentityLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HealthflowLinkCallback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LineOAuthAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LineRebindCandidate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LineRebindRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralShareTemplateFavorite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralShareTemplateUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreFeatureEntitlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreSettlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TodoDismiss" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransactionAuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WalletSession" ENABLE ROW LEVEL SECURITY;
