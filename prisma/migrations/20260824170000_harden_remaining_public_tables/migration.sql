-- Close the remaining public-schema tables reported by the Supabase security
-- advisor. The application and Prisma migrate access these tables through the
-- postgres table owner, so RLS is intentionally enabled without FORCE and
-- without anon/authenticated policies.
--
-- GoogleReviewInvite is present in hosted environments but is not part of the
-- current Prisma schema. IF EXISTS keeps this forward-only hardening migration
-- portable while still protecting the hosted table where it exists.

ALTER TABLE IF EXISTS "GoogleReviewInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "StoreLineNotificationRecipient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "MessengerAuditRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
